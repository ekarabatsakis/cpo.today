"""Aggregations derived from the normalized model.

Everything here is pure: inputs are the normalized static/dynamic documents,
outputs are small JSON-able dicts the portal can render without recomputing.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from statistics import median

from .schema import STATUS_NAMES, power_class

STATUS_ORDER = ["A", "C", "B", "R", "I", "O", "U", "P", "M", "X"]

# Bitmasks used in points.json so the map can filter without loading details.
CLASS_BITS = {"slow": 1, "ac": 2, "fast": 4, "ultra": 8, "na": 16}
CONN_BITS = {"T2": 1, "CCS2": 2, "CHADEMO": 4, "T1": 8, "CCS1": 16, "DOM": 32, "IND": 64, "TESLA_S": 128, "TESLA_R": 128}


def encode_statuses(static, statuses):
    """{lid: 'ACU...'}: one status letter per EVSE, in inventory order."""
    out = {}
    for loc in static["locations"]:
        ls = statuses.get(loc["id"], {})
        out[loc["id"]] = "".join(ls.get(e["uid"], "U") for e in loc["evses"])
    return out


def diff_encoded(prev: dict | None, cur: dict):
    """Transitions between two encoded status maps: [[lid, evse index, from, to], ...]."""
    if not prev or not all(isinstance(v, str) for v in prev.values()):
        return []   # nothing to diff, or a previous layout we cannot compare
    changes = []
    for lid, s in cur.items():
        p = prev.get(lid)
        if p is None:
            for i, c in enumerate(s):
                changes.append([lid, i, "-", c])
            continue
        if p == s:
            continue
        for i in range(max(len(p), len(s))):
            a = p[i] if i < len(p) else "-"
            b = s[i] if i < len(s) else "-"
            if a != b:
                changes.append([lid, i, a, b])
    for lid in prev.keys() - cur.keys():
        for i, c in enumerate(prev[lid]):
            changes.append([lid, i, c, "-"])
    changes.sort()
    return changes


def points_layer(static, ts, n_shards):
    """Compact per-location rows for the map and the filters.

    Row: [id, lon, lat, operator index, name, city, evse count, dc evse count,
          max kW, power-class bitmask, connector bitmask, flags]
    flags bit 1 = 24/7, bit 2 = green energy, bit 4 = unpublished
    """
    ops = list(static["operators"].keys())
    op_index = {o: i for i, o in enumerate(ops)}
    rows = []
    for loc in static["locations"]:
        n = len(loc["evses"])
        dc = 0
        maxkw = 0.0
        cmask = 0
        kmask = 0
        for e in loc["evses"]:
            kw = evse_max_kw(e)
            if kw:
                maxkw = max(maxkw, kw)
            kmask |= CLASS_BITS.get(power_class(kw), 16)
            if evse_is_dc(e):
                dc += 1
            for c in e.get("conns", []):
                cmask |= CONN_BITS.get(c.get("std"), 0)
        flags = (1 if loc.get("h24") else 0) | (2 if loc.get("green") else 0) | (4 if loc.get("unpub") else 0)
        rows.append([loc["id"], loc["lon"], loc["lat"], op_index.get(loc["op"], -1), loc.get("name", ""),
                     loc.get("city", ""), n, dc, maxkw or 0, kmask, cmask, flags])
    return {
        "ts": ts,
        "shards": n_shards,
        "operators": [{"id": o, "name": static["operators"][o]["name"]} for o in ops],
        "fields": ["id", "lon", "lat", "op", "name", "city", "evses", "dc", "max_kw", "class_mask", "conn_mask", "flags"],
        "class_bits": CLASS_BITS,
        "conn_bits": {k: v for k, v in CONN_BITS.items() if k != "TESLA_R"},
        "points": rows,
    }



def _empty_status():
    return {k: 0 for k in STATUS_ORDER}


def evse_max_kw(evse):
    kws = [c.get("kw") for c in evse.get("conns", []) if c.get("kw")]
    return max(kws) if kws else None


def evse_is_dc(evse):
    return any(c.get("pt") == "DC" for c in evse.get("conns", []))


def tick_summary(static, statuses, ts):
    """One history line: national + per-operator status counts and charging power."""
    nat = _empty_status()
    nat_kw = 0.0
    ops = {}
    for loc in static["locations"]:
        op = ops.setdefault(loc["op"], {"s": _empty_status(), "kwc": 0.0})
        loc_status = statuses.get(loc["id"], {})
        for e in loc["evses"]:
            s = loc_status.get(e["uid"], "U")
            nat[s] = nat.get(s, 0) + 1
            op["s"][s] = op["s"].get(s, 0) + 1
            if s == "C":
                kw = evse_max_kw(e) or 0
                nat_kw += kw
                op["kwc"] += kw
    return {
        "ts": ts,
        "n": {k: v for k, v in nat.items() if v},
        "kwc": round(nat_kw),
        "ops": {
            k: {"s": {sk: sv for sk, sv in v["s"].items() if sv}, "kwc": round(v["kwc"])}
            for k, v in sorted(ops.items())
        },
    }


def diff_statuses(prev: dict | None, cur: dict):
    """Status transitions since the previous tick: [[loc, uid, from, to], ...].

    "-" marks an EVSE that appeared or disappeared from the feed.
    """
    if not prev:
        return []
    changes = []
    for lid, cur_evses in cur.items():
        prev_evses = prev.get(lid) or {}
        for uid, s in cur_evses.items():
            p = prev_evses.get(uid)
            if p is None:
                changes.append([lid, uid, "-", s])
            elif p != s:
                changes.append([lid, uid, p, s])
        for uid in prev_evses.keys() - cur_evses.keys():
            changes.append([lid, uid, prev_evses[uid], "-"])
    for lid in prev.keys() - cur.keys():
        for uid, p in prev[lid].items():
            changes.append([lid, uid, p, "-"])
    changes.sort()
    return changes


def operator_table(static, statuses, tariffs, connector_tariffs, ts):
    """Per-operator comparison table + national totals."""
    rows = {}
    for loc in static["locations"]:
        loc_status = statuses.get(loc["id"], {})
        loc_tariffs = connector_tariffs.get(loc["id"], {})
        r = rows.setdefault(loc["op"], {
            "id": loc["op"],
            "name": static["operators"].get(loc["op"], {}).get("name", loc["op"]),
            "locations": 0, "evses": 0, "connectors": 0,
            "dc_evses": 0, "ac_evses": 0, "kw_total": 0.0, "max_kw": 0.0,
            "classes": Counter(), "connector_types": Counter(),
            "cities": set(), "status": _empty_status(), "kwh_prices": [],
            "h24": 0, "green": 0,
        })
        r["locations"] += 1
        r["cities"].add(loc.get("city", "").lower())
        if loc.get("h24"):
            r["h24"] += 1
        if loc.get("green"):
            r["green"] += 1
        for e in loc["evses"]:
            r["evses"] += 1
            r["connectors"] += len(e.get("conns", []))
            kw = evse_max_kw(e)
            if kw:
                r["kw_total"] += kw
                r["max_kw"] = max(r["max_kw"], kw)
            r["classes"][power_class(kw)] += 1
            if evse_is_dc(e):
                r["dc_evses"] += 1
            else:
                r["ac_evses"] += 1
            evse_tariffs = loc_tariffs.get(e["uid"], {})
            for c in e.get("conns", []):
                r["connector_types"][c.get("std", "OTHER")] += 1
                idx = evse_tariffs.get(c.get("id"))
                t = tariffs[idx] if idx is not None and idx < len(tariffs) else None
                if t and t.get("kwh") is not None and t["kwh"] > 0:
                    r["kwh_prices"].append(t["kwh"])
            s = loc_status.get(e["uid"], "U")
            r["status"][s] = r["status"].get(s, 0) + 1

    out = []
    for r in rows.values():
        st = r["status"]
        known = r["evses"] - st.get("U", 0)
        out.append({
            "id": r["id"],
            "name": r["name"],
            "locations": r["locations"],
            "evses": r["evses"],
            "connectors": r["connectors"],
            "dc_evses": r["dc_evses"],
            "ac_evses": r["ac_evses"],
            "kw_total": round(r["kw_total"]),
            "max_kw": r["max_kw"],
            "classes": dict(r["classes"]),
            "connector_types": dict(r["connector_types"]),
            "cities": len(r["cities"]),
            "h24_locations": r["h24"],
            "green_locations": r["green"],
            "status": {k: v for k, v in st.items() if v},
            "avail_pct": round(100.0 * st.get("A", 0) / known, 1) if known else None,
            "charging_pct": round(100.0 * st.get("C", 0) / known, 1) if known else None,
            "down_pct": round(100.0 * (st.get("O", 0) + st.get("I", 0)) / known, 1) if known else None,
            "unknown_pct": round(100.0 * st.get("U", 0) / r["evses"], 1) if r["evses"] else None,
            "median_kwh_price": round(median(r["kwh_prices"]), 3) if r["kwh_prices"] else None,
            "priced_connectors": len(r["kwh_prices"]),
        })
    out.sort(key=lambda r: (-r["evses"], r["id"]))

    totals = {
        "locations": sum(r["locations"] for r in out),
        "evses": sum(r["evses"] for r in out),
        "connectors": sum(r["connectors"] for r in out),
        "dc_evses": sum(r["dc_evses"] for r in out),
        "kw_total": sum(r["kw_total"] for r in out),
        "operators": len(out),
        "status": {},
    }
    for r in out:
        for k, v in r["status"].items():
            totals["status"][k] = totals["status"].get(k, 0) + v
    known = totals["evses"] - totals["status"].get("U", 0)
    totals["avail_pct"] = round(100.0 * totals["status"].get("A", 0) / known, 1) if known else None
    return {"ts": ts, "status_names": STATUS_NAMES, "totals": totals, "operators": out}


def daily_inventory(static, ts):
    """Daily snapshot of the inventory, for growth trends (no live status)."""
    ops = defaultdict(lambda: {"locations": 0, "evses": 0, "connectors": 0, "dc_evses": 0, "kw_total": 0.0})
    cls = Counter()
    ctypes = Counter()
    cities = Counter()
    for loc in static["locations"]:
        o = ops[loc["op"]]
        o["locations"] += 1
        cities[loc.get("city", "")] += 1
        for e in loc["evses"]:
            o["evses"] += 1
            o["connectors"] += len(e.get("conns", []))
            kw = evse_max_kw(e)
            o["kw_total"] += kw or 0
            cls[power_class(kw)] += 1
            if evse_is_dc(e):
                o["dc_evses"] += 1
            for c in e.get("conns", []):
                ctypes[c.get("std", "OTHER")] += 1
    for o in ops.values():
        o["kw_total"] = round(o["kw_total"])
    return {
        "ts": ts,
        "totals": {
            "locations": len(static["locations"]),
            "evses": sum(o["evses"] for o in ops.values()),
            "connectors": sum(o["connectors"] for o in ops.values()),
            "dc_evses": sum(o["dc_evses"] for o in ops.values()),
            "kw_total": sum(o["kw_total"] for o in ops.values()),
            "operators": len(ops),
        },
        "classes": dict(cls),
        "connector_types": dict(ctypes),
        "top_cities": cities.most_common(50),
        "operators": dict(sorted(ops.items())),
    }
