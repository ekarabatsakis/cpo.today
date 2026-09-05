"""Greece: MYFAH (Μητρώο Υποδομών και Φορέων Αγοράς Ηλεκτροκίνησης).

Official registry of the Ministry of Infrastructure and Transport.
Public data page: https://electrokinisi.yme.gov.gr/public/HelpMyfah/PublicData/

Two OCPI-flavoured feeds:
  * static  - full location/EVSE/connector inventory, refreshed daily
  * dynamic - EVSE status + tariffs, refreshed every 10 minutes
"""

from __future__ import annotations

import json

from ..schema import connector_code, power_type_code, status_code

COUNTRY = "GR"
COUNTRY_NAME = "Greece"
SOURCE_ID = "MYFAH"
SOURCE_NAME = "MYFAH - Hellenic Ministry of Infrastructure and Transport"
SOURCE_URL = "https://electrokinisi.yme.gov.gr/public/HelpMyfah/PublicData/"
STATIC_URL = "https://electrokinisi.yme.gov.gr/public/static_files/GR.IDRO.static.data.latest.json.zip"
DYNAMIC_URL = "https://electrokinisi.yme.gov.gr/public/static_files/GR.IDRO.dynamic.data.latest.json.zip"

# Observed: ~1.4 MB zip / ~37 MB json (static), ~0.7 MB zip / ~26 MB json (dynamic).
STATIC_MAX_ZIP = 40 << 20
STATIC_MAX_JSON = 400 << 20
DYNAMIC_MAX_ZIP = 40 << 20
DYNAMIC_MAX_JSON = 400 << 20

# Greece bounding box (generous) - anything outside is a data error.
BBOX = (34.0, 19.0, 42.5, 30.5)  # min lat, min lon, max lat, max lon


class SourceError(ValueError):
    pass


def _f(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def _validate_envelope(doc, kind):
    if not isinstance(doc, dict):
        raise SourceError(f"{kind}: top-level is not an object")
    if str(doc.get("status", "")).lower() != "ok":
        raise SourceError(f"{kind}: upstream status={doc.get('status')!r} desc={doc.get('statusDesc')!r}")
    locs = doc.get("Locations")
    if not isinstance(locs, list) or not locs:
        raise SourceError(f"{kind}: Locations missing or empty")
    return locs


def normalize_static(doc) -> dict:
    """Convert the static feed into the cpo.today location model."""
    raw_locs = _validate_envelope(doc, "static")
    operators: dict[str, dict] = {}
    locations = []
    seen_ids = set()
    dropped = []
    for raw in raw_locs:
        if not isinstance(raw, dict):
            continue
        lid = str(raw.get("id") or "").strip()
        coords = raw.get("coordinates") or {}
        lat, lon = _f(coords.get("latitude")), _f(coords.get("longitude"))
        if not lid or lat is None or lon is None:
            dropped.append((lid, "missing id/coords"))
            continue
        if not (BBOX[0] <= lat <= BBOX[2] and BBOX[1] <= lon <= BBOX[3]):
            dropped.append((lid, "outside bbox"))
            continue
        if lid in seen_ids:
            dropped.append((lid, "duplicate id"))
            continue
        seen_ids.add(lid)
        party = str(raw.get("party_id") or "???").upper()[:8]
        op_name = ((raw.get("operator") or {}).get("name") or "").strip() or party
        op = operators.setdefault(party, {"id": party, "name": op_name, "names": {}})
        op["names"][op_name] = op["names"].get(op_name, 0) + 1

        evses = []
        for e in raw.get("evses") or []:
            if not isinstance(e, dict):
                continue
            uid = str(e.get("uid") or "").strip()
            if not uid:
                continue
            conns = []
            for c in e.get("connectors") or []:
                if not isinstance(c, dict):
                    continue
                kw = _f(c.get("max_electric_power"))
                if kw is None:
                    v, a = _f(c.get("max_voltage")), _f(c.get("max_amperage"))
                    if v and a:
                        ph = 3 if str(c.get("power_type", "")).startswith("AC_3") else 1
                        kw = v * a * ph
                kw = round(kw / 1000.0, 1) if kw else None
                conn = {
                    "id": str(c.get("id") or ""),
                    "std": connector_code(c.get("standard")),
                    "fmt": "CABLE" if c.get("format") == "CABLE" else "SOCKET",
                    "pt": power_type_code(c.get("power_type")),
                    "kw": kw,
                }
                conns.append(conn)
            evse = {
                "uid": uid,
                "id": str(e.get("evse_id") or uid),
                "conns": conns,
            }
            caps = e.get("capabilities") or []
            if caps:
                evse["caps"] = sorted({str(x) for x in caps})
            if e.get("manufacturer"):
                evse["mfr"] = str(e["manufacturer"])[:40]
            if e.get("model_name"):
                evse["model"] = str(e["model_name"])[:40]
            if e.get("physical_reference"):
                evse["ref"] = str(e["physical_reference"])[:40]
            if e.get("parking_restrictions"):
                evse["park"] = sorted({str(x) for x in e["parking_restrictions"]})
            evses.append(evse)

        loc = {
            "id": lid,
            "op": party,
            "name": (raw.get("name") or "").strip()[:120],
            "addr": (raw.get("address") or "").strip()[:160],
            "city": (raw.get("city") or "").strip()[:80],
            "pc": (raw.get("postal_code") or "").strip()[:12],
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "evses": evses,
            "upd": str(raw.get("last_updated") or "")[:19],
        }
        if raw.get("publish") is False:
            loc["unpub"] = True
        if raw.get("parking_type"):
            loc["ptype"] = str(raw["parking_type"])[:24]
        ot = raw.get("opening_times") or {}
        if ot.get("twentyfourseven") is True:
            loc["h24"] = True
        elif ot.get("regular_hours"):
            loc["hours"] = [
                [int(h.get("weekday", 0)), str(h.get("period_begin", ""))[:5], str(h.get("period_end", ""))[:5]]
                for h in ot["regular_hours"] if isinstance(h, dict)
            ]
        if (raw.get("energy_mix") or {}).get("is_green_energy") is True:
            loc["green"] = True
        if raw.get("facilities"):
            loc["fac"] = sorted({str(x)[:24] for x in raw["facilities"]})
        sub = (raw.get("suboperator") or {}).get("name")
        if sub:
            loc["subop"] = str(sub).strip()[:60]
        owner = (raw.get("owner") or {}).get("name")
        if owner:
            loc["owner"] = str(owner).strip()[:80]
        locations.append(loc)

    for op in operators.values():
        # Most common operator display name wins.
        op["name"] = max(op["names"].items(), key=lambda kv: kv[1])[0]
        del op["names"]

    return {
        "country": COUNTRY,
        "source": SOURCE_ID,
        "operators": dict(sorted(operators.items())),
        "locations": locations,
        "dropped": dropped,
    }


def _tariff_summary(tariffs):
    """Compress an OCPI tariff list into the cheapest-looking numeric summary.

    Returns None if nothing numeric is present.
    """
    best = None
    for t in tariffs or []:
        if not isinstance(t, dict):
            continue
        summ = {"cur": str(t.get("currency") or "EUR")[:3], "type": str(t.get("type") or "")[:16]}
        for el in t.get("elements") or []:
            for pc in (el or {}).get("price_components") or []:
                if not isinstance(pc, dict):
                    continue
                p = _f(pc.get("price"))
                if p is None:
                    continue
                ptype = str(pc.get("type") or "").upper()
                key = {"ENERGY": "kwh", "TIME": "min", "FLAT": "flat", "PARKING_TIME": "park"}.get(ptype)
                if not key:
                    continue
                step = _f(pc.get("step_size"))
                # TIME/PARKING_TIME prices are per hour in OCPI 2.2, we keep per hour.
                if key in ("min", "park"):
                    key = "hour"  if key == "min" else "park_hour"
                if key not in summ or p < summ[key]:
                    summ[key] = round(p, 4)
                vat = _f(pc.get("vat"))
                if vat is not None:
                    summ.setdefault("vat", vat)
        if any(k in summ for k in ("kwh", "hour", "flat", "park_hour")):
            if best is None or summ.get("kwh", 9e9) < best.get("kwh", 9e9):
                best = summ
    return best


def normalize_dynamic(doc) -> dict:
    """Convert the dynamic feed into nested status/tariff maps.

    MYFAH EVSE uids and connector ids are only unique *within a location*,
    so everything is keyed as location id -> evse uid (-> connector id).
    Tariffs are de-duplicated into a list; connectors reference them by index.
    """
    raw_locs = _validate_envelope(doc, "dynamic")
    statuses: dict[str, dict[str, str]] = {}
    tariff_list: list[dict] = []
    tariff_index: dict[str, int] = {}
    conn_tariffs: dict[str, dict[str, dict[str, int]]] = {}
    n_evses = 0
    for raw in raw_locs:
        if not isinstance(raw, dict):
            continue
        lid = str(raw.get("id") or "").strip()
        if not lid:
            continue
        loc_status = statuses.setdefault(lid, {})
        for e in raw.get("evses") or []:
            if not isinstance(e, dict):
                continue
            uid = str(e.get("uid") or "").strip()
            if not uid:
                continue
            loc_status[uid] = status_code(e.get("status"))
            n_evses += 1
            for c in e.get("connectors") or []:
                if not isinstance(c, dict) or c.get("id") is None:
                    continue
                t = _tariff_summary(c.get("_openapiTariffs") or c.get("tariffs"))
                if not t:
                    continue
                key = json.dumps(t, sort_keys=True)
                idx = tariff_index.get(key)
                if idx is None:
                    idx = len(tariff_list)
                    tariff_list.append(t)
                    tariff_index[key] = idx
                conn_tariffs.setdefault(lid, {}).setdefault(uid, {})[str(c["id"])] = idx
    return {"statuses": statuses, "evse_count": n_evses,
            "tariffs": tariff_list, "connector_tariffs": conn_tariffs}
