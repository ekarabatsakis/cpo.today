"""Shared OCPI 2.x -> cpo.today normalisation.

Most national registries (Greece, Lithuania, the Netherlands, Ireland, ...)
publish OCPI Location objects or something very close. This module turns a
list of raw OCPI locations into the compact model documented in docs/DATA.md.
"""

from __future__ import annotations

import hashlib
import json

from ..schema import connector_code, power_type_code, status_code
from .base import SourceError


def _f(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def _s(x, n):
    return str(x).strip()[:n] if x is not None else ""


def _d(x):
    """Sub-object or {}: registries sometimes publish lists/nulls where OCPI expects an object."""
    return x if isinstance(x, dict) else {}


def _l(x):
    return x if isinstance(x, list) else []


def _coords(raw):
    c = _d(raw.get("coordinates"))
    lat, lon = _f(c.get("latitude")), _f(c.get("longitude"))
    if lat is None or lon is None:
        # GeoJSON-ish variants
        g = raw.get("geometry") or {}
        if isinstance(g, dict) and isinstance(g.get("coordinates"), list) and len(g["coordinates"]) >= 2:
            lon, lat = _f(g["coordinates"][0]), _f(g["coordinates"][1])
    return lat, lon


def _evse_key(e, i):
    uid = _s(e.get("uid"), 80)
    if uid:
        return uid
    return _s(e.get("evse_id"), 80) or f"#{i}"


def normalize_locations(raw_locs, spec, *, evse_status=False) -> dict:
    """Inventory model from OCPI locations. `dropped` lists rejected rows.

    Live status is never stored in the inventory (it lives in status.json),
    so shards only change when equipment changes. `evse_status` is accepted
    for backwards compatibility and ignored.
    """
    if not isinstance(raw_locs, list) or not raw_locs:
        raise SourceError("locations list missing or empty")
    bbox = spec.bbox
    operators: dict[str, dict] = {}
    locations = []
    seen = set()
    dropped = []
    for raw in raw_locs:
        if not isinstance(raw, dict):
            continue
        lid = _s(raw.get("id"), 120)
        lat, lon = _coords(raw)
        if not lid or lat is None or lon is None:
            dropped.append((lid, "missing id/coords"))
            continue
        if not (bbox[0] <= lat <= bbox[2] and bbox[1] <= lon <= bbox[3]):
            dropped.append((lid, "outside bbox"))
            continue
        if lid in seen:
            dropped.append((lid, "duplicate id"))
            continue
        seen.add(lid)
        party = (_s(raw.get("party_id"), 8) or "???").upper()
        op_name = _s(_d(raw.get("operator")).get("name"), 80) or party
        op = operators.setdefault(party, {"id": party, "name": op_name, "names": {}})
        op["names"][op_name] = op["names"].get(op_name, 0) + 1

        evses = []
        for i, e in enumerate(_l(raw.get("evses"))):
            if not isinstance(e, dict):
                continue
            conns = []
            for j, c in enumerate(_l(e.get("connectors"))):
                if not isinstance(c, dict):
                    continue
                kw = _f(c.get("max_electric_power"))
                if kw is None:
                    v, a = _f(c.get("max_voltage")), _f(c.get("max_amperage"))
                    if v and a:
                        ph = 3 if str(c.get("power_type", "")).startswith("AC_3") else 1
                        kw = v * a * ph
                kw = round(kw / 1000.0, 1) if kw else None
                conns.append({
                    "id": _s(c.get("id"), 60) or f"#{j}",
                    "std": connector_code(c.get("standard")),
                    "fmt": "CABLE" if c.get("format") == "CABLE" else "SOCKET",
                    "pt": power_type_code(c.get("power_type")),
                    "kw": kw,
                })
            evse = {"uid": _evse_key(e, i), "id": _s(e.get("evse_id"), 80) or _evse_key(e, i), "conns": conns}
            caps = _l(e.get("capabilities"))
            if caps:
                evse["caps"] = sorted({str(x)[:40] for x in caps})
            if e.get("manufacturer"):
                evse["mfr"] = _s(e["manufacturer"], 40)
            if e.get("model_name"):
                evse["model"] = _s(e["model_name"], 40)
            if e.get("physical_reference"):
                evse["ref"] = _s(e["physical_reference"], 40)
            if _l(e.get("parking_restrictions")):
                evse["park"] = sorted({str(x)[:24] for x in e["parking_restrictions"]})
            evses.append(evse)

        loc = {
            "id": lid,
            "op": party,
            "name": _s(raw.get("name"), 120),
            "addr": _s(raw.get("address"), 160),
            "city": _s(raw.get("city"), 80),
            "pc": _s(raw.get("postal_code"), 12),
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "evses": evses,
            "upd": _s(raw.get("last_updated"), 10) if getattr(spec, "location_updated", True) else "",
        }
        if raw.get("publish") is False:
            loc["unpub"] = True
        if raw.get("parking_type"):
            loc["ptype"] = _s(raw["parking_type"], 24)
        ot = _d(raw.get("opening_times"))
        if ot.get("twentyfourseven") is True:
            loc["h24"] = True
        elif _l(ot.get("regular_hours")):
            loc["hours"] = [
                [int(h.get("weekday", 0) or 0), _s(h.get("period_begin"), 5), _s(h.get("period_end"), 5)]
                for h in ot["regular_hours"] if isinstance(h, dict)
            ]
        if _d(raw.get("energy_mix")).get("is_green_energy") is True:
            loc["green"] = True
        if _l(raw.get("facilities")):
            loc["fac"] = sorted({str(x)[:24] for x in raw["facilities"]})
        sub = _d(raw.get("suboperator")).get("name")
        if sub:
            loc["subop"] = _s(sub, 60)
        owner = _d(raw.get("owner")).get("name")
        if owner:
            loc["owner"] = _s(owner, 80)
        locations.append(loc)

    for op in operators.values():
        op["name"] = max(op["names"].items(), key=lambda kv: kv[1])[0]
        del op["names"]

    return {
        "country": spec.country,
        "source": spec.source_id,
        "operators": dict(sorted(operators.items())),
        "locations": locations,
        "dropped": dropped,
    }


def tariff_summary(tariffs):
    """Compress an OCPI tariff list into the cheapest numeric summary, or None."""
    best = None
    for t in tariffs or []:
        if not isinstance(t, dict):
            continue
        summ = {"cur": _s(t.get("currency"), 3) or "EUR", "type": _s(t.get("type"), 16)}
        for el in _l(t.get("elements")):
            for pc in _l(_d(el).get("price_components")):
                if not isinstance(pc, dict):
                    continue
                p = _f(pc.get("price"))
                if p is None:
                    continue
                key = {"ENERGY": "kwh", "TIME": "hour", "FLAT": "flat", "PARKING_TIME": "park_hour"}.get(
                    str(pc.get("type") or "").upper())
                if not key:
                    continue
                if key not in summ or p < summ[key]:
                    summ[key] = round(p, 4)
                vat = _f(pc.get("vat"))
                if vat is not None:
                    summ.setdefault("vat", vat)
        if any(k in summ for k in ("kwh", "hour", "flat", "park_hour")):
            if best is None or summ.get("kwh", 9e9) < best.get("kwh", 9e9):
                best = summ
    return best


def extract_dynamic(raw_locs, *, tariff_keys=("_openapiTariffs", "tariffs"), tariff_lookup=None) -> dict:
    """Nested status/tariff maps from OCPI locations.

    EVSE uids and connector ids are only guaranteed unique within a location,
    so everything is keyed location id -> evse uid (-> connector id).
    Tariffs are de-duplicated into a map keyed by a short content hash;
    connectors reference that key, so entries only change when a price does.
    """
    if not isinstance(raw_locs, list) or not raw_locs:
        raise SourceError("locations list missing or empty")
    statuses: dict[str, dict[str, str]] = {}
    tariff_list: dict[str, dict] = {}          # content hash -> summary (stable across ticks)
    tariff_index: dict[str, str] = {}
    conn_tariffs: dict[str, dict[str, dict[str, str]]] = {}
    n = 0
    for raw in raw_locs:
        if not isinstance(raw, dict):
            continue
        lid = _s(raw.get("id"), 120)
        if not lid:
            continue
        loc_status = statuses.setdefault(lid, {})
        for i, e in enumerate(_l(raw.get("evses"))):
            if not isinstance(e, dict):
                continue
            uid = _evse_key(e, i)
            loc_status[uid] = status_code(e.get("status"))
            n += 1
            for j, c in enumerate(_l(e.get("connectors"))):
                if not isinstance(c, dict):
                    continue
                t = None
                for k in tariff_keys:
                    t = tariff_summary(c.get(k))
                    if t:
                        break
                if not t and tariff_lookup and _l(c.get("tariff_ids")):
                    t = tariff_summary([tariff_lookup.get(str(i)) for i in c["tariff_ids"] if str(i) in tariff_lookup])
                if not t:
                    continue
                key = json.dumps(t, sort_keys=True)
                idx = tariff_index.get(key)
                if idx is None:
                    idx = hashlib.sha1(key.encode("utf-8")).hexdigest()[:8]
                    tariff_list[idx] = t
                    tariff_index[key] = idx
                conn_tariffs.setdefault(lid, {}).setdefault(uid, {})[_s(c.get("id"), 60) or f"#{j}"] = idx
    return {"statuses": statuses, "evse_count": n, "tariffs": tariff_list, "connector_tariffs": conn_tariffs}


def unwrap_ocpi_envelope(doc):
    """OCPI response envelope {status_code: 1000, data: [...]} -> list."""
    if isinstance(doc, list):
        return doc
    if not isinstance(doc, dict):
        raise SourceError("top-level is not an object or list")
    if "data" in doc:
        sc = doc.get("status_code")
        if sc is not None and int(sc) != 1000:
            raise SourceError(f"OCPI status_code {sc}: {doc.get('status_message')}")
        data = doc["data"]
        return data if isinstance(data, list) else [data]
    raise SourceError("no 'data' in OCPI envelope")


def tariff_lookup(raw_tariffs) -> dict:
    """{tariff id: OCPI tariff object} from an OCPI tariffs list."""
    out = {}
    for t in raw_tariffs or []:
        if isinstance(t, dict) and t.get("id") is not None:
            out[str(t["id"])] = t
    return out
