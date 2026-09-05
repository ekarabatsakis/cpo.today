"""DATEX II v3 EnergyInfrastructure (AFIR profile) -> cpo.today model.

Namespace-agnostic and tolerant: every national access point renders the
profile a little differently (Lithuania puts one refillPoint per station with
one connector per EVSE; others use one refillPoint per EVSE). We map:

    energyInfrastructureSite            -> location
      energyInfrastructureStation       -> (merged into the location)
        refillPoint                     -> EVSE
          connector                     -> connector
    energyInfrastructureSiteStatus/…/refillPointStatus -> EVSE status

Status is matched to EVSEs by refillPoint id when the ids agree, otherwise
by position within the station.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET

from ..schema import STATUS_CODES
from .base import SourceError

STATUS_MAP = {
    "available": "A", "charging": "C", "occupied": "C", "inuse": "C", "reserved": "R", "blocked": "B",
    "outoforder": "O", "outofservice": "O", "inoperative": "I", "unknown": "U", "planned": "P", "removed": "M",
    "unavailable": "I",
}
CONNECTOR_MAP = {
    "type2": "T2", "iec62196t2": "T2", "iec62196t2outlet": "T2", "iec62196t2cableattached": "T2", "mennekes": "T2",
    "ccs": "CCS2", "ccs2": "CCS2", "combo": "CCS2", "iec62196t2combo": "CCS2", "ccscombo2": "CCS2", "iec62196t2comboccs": "CCS2",
    "chademo": "CHADEMO", "type1": "T1", "iec62196t1": "T1", "ccs1": "CCS1", "iec62196t1combo": "CCS1",
    "domestic": "DOM", "schuko": "DOM", "cee": "IND", "iec60309": "IND", "tesla": "TESLA_S", "type3": "T3A",
    "type3a": "T3A", "type3c": "T3C",
}


def _local(tag):
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag.split(":")[-1]


def _first(el, name):
    """First descendant whose local name matches (depth-first)."""
    for d in el.iter():
        if _local(d.tag) == name:
            return d
    return None


def _text(el, name, default=""):
    d = _first(el, name)
    return (d.text or "").strip() if d is not None and d.text else default


def _values(el, name):
    """All text values under a multilingual <name><values><value>…</value></values></name>."""
    d = _first(el, name)
    if d is None:
        return []
    vals = [v.text.strip() for v in d.iter() if _local(v.tag) == "value" and v.text and v.text.strip()]
    if not vals and d.text and d.text.strip():
        vals = [d.text.strip()]
    return vals


def _children(el, name):
    return [c for c in el if _local(c.tag) == name]


def _descendants(el, name):
    return [d for d in el.iter() if _local(d.tag) == name]


def _f(x):
    try:
        return float(str(x).replace(",", "."))
    except (TypeError, ValueError):
        return None


def status_code(raw):
    k = "".join(ch for ch in str(raw or "").lower() if ch.isalnum())
    return STATUS_MAP.get(k) or STATUS_CODES.get(str(raw or "").upper(), "U")


def connector_code(raw):
    k = "".join(ch for ch in str(raw or "").lower() if ch.isalnum())
    for key, code in CONNECTOR_MAP.items():
        if k == key:
            return code
    for key, code in CONNECTOR_MAP.items():
        if key in k:
            return code
    return str(raw or "OTHER").strip()[:16] or "OTHER"


def _parse_root(raw):
    try:
        return ET.fromstring(raw)
    except ET.ParseError as e:
        raise SourceError(f"invalid XML: {e}") from e


def parse_table(raw: bytes, spec) -> dict:
    """Static publication (EnergyInfrastructureTablePublication) -> inventory."""
    root = _parse_root(raw)
    sites = _descendants(root, "energyInfrastructureSite")
    if not sites:
        raise SourceError("no energyInfrastructureSite elements")
    operators: dict[str, dict] = {}
    locations = []
    dropped = []
    seen = set()
    bbox = spec.bbox
    for site in sites:
        sid = (site.get("id") or "").strip()
        stations = _descendants(site, "energyInfrastructureStation") or [site]
        if not sid:
            sid = (stations[0].get("id") or "").strip()
        lat = lon = None
        for cand in [site] + stations:
            loc_el = _first(cand, "siteLocation") or _first(cand, "locationReference") or cand
            lat, lon = _f(_text(loc_el, "latitude")), _f(_text(loc_el, "longitude"))
            if lat is not None and lon is not None:
                break
        if not sid or lat is None or lon is None:
            dropped.append((sid, "missing id/coords"))
            continue
        if not (bbox[0] <= lat <= bbox[2] and bbox[1] <= lon <= bbox[3]):
            dropped.append((sid, "outside bbox"))
            continue
        if sid in seen:
            dropped.append((sid, "duplicate id"))
            continue
        seen.add(sid)

        # operator: first energyProvider/operator name found in site or stations
        op_name = ""
        for cand in [site] + stations:
            for tag in ("operator", "energyProvider", "owner"):
                prov = _first(cand, tag)
                if prov is not None:
                    vals = _values(prov, "name")
                    if vals:
                        op_name = vals[0][:80]
                        break
            if op_name:
                break
        party = "".join(ch for ch in op_name.upper() if ch.isalnum())[:8] or "???"
        op = operators.setdefault(party, {"id": party, "name": op_name or party, "names": {}})
        op["names"][op_name or party] = op["names"].get(op_name or party, 0) + 1

        names = [v for v in _values(site, "name") if v] or [v for st in stations for v in _values(st, "name")]
        name = (names[0] if names else "")[:120]
        addr_parts = []
        for tag in ("addressLine", "streetName", "houseNumber"):
            addr_parts += [_t for _t in [_text(site, tag)] if _t]
        city = _text(site, "city") or _text(site, "cityName") or _text(site, "town")
        pc = _text(site, "postcode") or _text(site, "postalCode")

        evses = []
        for st in stations:
            for i, rp in enumerate(_descendants(st, "refillPoint")):
                rid = (rp.get("id") or f"{st.get('id') or sid}#{i}").strip()
                conns = []
                for j, c in enumerate(_children(rp, "connector") or _descendants(rp, "connector")):
                    kw = _f(_text(c, "maxPowerAtSocket"))
                    if kw is not None and kw > 1000:   # watts
                        kw = kw / 1000.0
                    ctype = _text(c, "connectorType")
                    fmt = "CABLE" if "cable" in (ctype + _text(c, "connectorFormat")).lower() else "SOCKET"
                    mode = (_text(c, "chargingMode") or "").lower()
                    std = connector_code(ctype)
                    pt = "DC" if (std in ("CCS2", "CCS1", "CHADEMO") or "mode4" in mode or "dc" in mode) else ("AC3" if (kw or 0) > 7.4 else "AC1")
                    conns.append({"id": (c.get("id") or str(j + 1)).strip()[:60], "std": std, "fmt": fmt, "pt": pt,
                                  "kw": round(kw, 1) if kw else None})
                if not conns:
                    conns.append({"id": "1", "std": "OTHER", "fmt": "SOCKET", "pt": "NA", "kw": None})
                evses.append({"uid": rid[:80], "id": rid[:80], "conns": conns})
        if not evses:
            evses.append({"uid": f"{sid}#0", "id": f"{sid}#0", "conns": [{"id": "1", "std": "OTHER", "fmt": "SOCKET", "pt": "NA", "kw": None}]})

        loc = {
            "id": sid[:120], "op": party, "name": name, "addr": ", ".join(addr_parts)[:160], "city": city[:80], "pc": pc[:12],
            "lat": round(lat, 6), "lon": round(lon, 6), "evses": evses,
            "upd": (_text(site, "lastUpdated") or _text(stations[0], "lastUpdated"))[:10],
        }
        locations.append(loc)
    for op in operators.values():
        op["name"] = max(op["names"].items(), key=lambda kv: kv[1])[0]
        del op["names"]
    return {"country": spec.country, "source": spec.source_id, "operators": dict(sorted(operators.items())),
            "locations": locations, "dropped": dropped}


def parse_status(raw: bytes, inventory: dict | None = None) -> dict:
    """Status publication -> {statuses: {site id: {evse uid: code}}, evse_count}.

    `inventory` (the parsed table) lets positional refillPointStatus entries
    (id="0", id="1"...) be matched to EVSE uids.
    """
    root = _parse_root(raw)
    site_statuses = _descendants(root, "energyInfrastructureSiteStatus")
    if not site_statuses:
        raise SourceError("no energyInfrastructureSiteStatus elements")
    by_site = {}
    if inventory:
        for loc in inventory["locations"]:
            by_site[loc["id"]] = [e["uid"] for e in loc["evses"]]
    statuses: dict[str, dict[str, str]] = {}
    n = 0
    for ss in site_statuses:
        sid = (ss.get("id") or "").strip()
        ref = _first(ss, "energyInfrastructureSiteReference")
        if ref is not None and ref.get("id"):
            sid = ref.get("id").strip()
        if not sid:
            continue
        uids = by_site.get(sid, [])
        loc_status = statuses.setdefault(sid, {})
        # collect per refill point (fallback: per connectorIndex) statuses
        pos = 0
        for rps in _descendants(ss, "refillPointStatus"):
            rid = (rps.get("id") or "").strip()
            ref = _first(rps, "refillPointReference")
            if ref is not None and ref.get("id"):
                rid = ref.get("id").strip()
            code = status_code(_text(rps, "status"))
            if rid and rid in uids:
                key = rid
            elif rid.isdigit() and uids and int(rid) < len(uids) and len(uids) > 1:
                key = uids[int(rid)]
            elif rps.get("connectorIndex") and uids and len(uids) == 1:
                key = uids[0]          # one refill point, statuses per connector: aggregate below
            elif uids and pos < len(uids):
                key = uids[pos]
            else:
                key = rid or str(pos)
            pos += 1
            prev = loc_status.get(key)
            if prev is None:
                loc_status[key] = code
            else:
                # aggregate several connector statuses on one EVSE: any free wins, then in use
                loc_status[key] = "A" if "A" in (prev, code) else ("C" if "C" in (prev, code) else prev)
            n += 1
    return {"statuses": statuses, "evse_count": n, "tariffs": [], "connector_tariffs": {}}
