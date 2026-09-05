"""Cyprus: Department of Electrical and Mechanical Services via the national access point.

Dataset (CC-BY 4.0): https://www.traffic4cyprus.org.cy/en_AU/dataset/electricvehiclecharges
Feed: https://fixcyprus.cy/gnosis/open/api/nap/datasets/electric_vehicle_chargers/

A DATEX II-flavoured XML listing charging points with owner, operator,
coordinates, maximum power and connector types. Inventory only; the
"chargingPointStatus" is an administrative state (operational / planned),
not live availability.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET

from .base import Feed, SourceError, SourceSpec

URL = "https://fixcyprus.cy/gnosis/open/api/nap/datasets/electric_vehicle_chargers/"
CONNECTORS = {"type2": "T2", "combotype2": "CCS2", "ccs": "CCS2", "chademo": "CHADEMO", "type1": "T1", "schuko": "DOM",
              "domestic": "DOM", "tesla": "TESLA_S"}


def _local(t):
    return t.rsplit("}", 1)[-1]


def _text(el, name):
    for d in el.iter():
        if _local(d.tag) == name:
            if d.text and d.text.strip():
                return d.text.strip()
            v = next((c for c in d if _local(c.tag) == "value"), None)
            return (v.text or "").strip() if v is not None else ""
    return ""


def _f(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def parse_static(doc, spec):
    raw = doc.encode("utf-8") if isinstance(doc, str) else doc
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as e:
        raise SourceError(f"invalid XML: {e}") from e
    points = [d for d in root.iter() if _local(d.tag) == "chargingPoint"]
    if not points:
        raise SourceError("no chargingPoint elements")
    operators, locations, dropped = {}, [], []
    seen = set()
    bbox = spec.bbox
    for i, cp in enumerate(points):
        ident = _text(cp, "chargingPointIdentification")
        lat, lon = _f(_text(cp, "latitude")), _f(_text(cp, "longitude"))
        if lat is None or lon is None:
            dropped.append((ident, "missing id/coords"))
            continue
        if not (bbox[0] <= lat <= bbox[2] and bbox[1] <= lon <= bbox[3]):
            dropped.append((ident, "outside bbox"))
            continue
        op_name = (_text(cp, "chargingPointOperator") or _text(cp, "chargingPointOperatorLegalName") or "Unknown operator")[:80]
        party = "".join(ch for ch in op_name.upper() if ch.isalnum())[:8] or "???"
        operators.setdefault(party, {"id": party, "name": op_name})
        lid = f"CY-{party}-{i}"
        base = f"{ident}|{lat:.5f}|{lon:.5f}"
        key = base
        if key in seen:
            dropped.append((ident, "duplicate id"))
            continue
        seen.add(key)
        kw = _f(_text(cp, "connectorPower")) or _f(_text(cp, "maximumPower"))
        if kw and kw > 1000:
            kw = kw / 1000.0
        types = [(_local(c.tag), (c.text or "").strip()) for c in cp.iter() if _local(c.tag) == "connectorType"]
        n_conn = int(_f(_text(cp, "numberOfConnectors")) or max(1, len(types)))
        mode = _text(cp, "chargingMode").lower()
        conns = []
        for j, (_t, ct) in enumerate(types or [("connectorType", "type2")]):
            std = CONNECTORS.get("".join(ch for ch in ct.lower() if ch.isalnum()), ct[:16] or "OTHER")
            dc = std in ("CCS2", "CHADEMO") or "fast" in mode
            conns.append({"id": str(j + 1), "std": std, "fmt": "CABLE" if dc else "SOCKET", "pt": "DC" if dc else "AC3",
                          "kw": round(kw, 1) if kw else None})
        # one EVSE per declared connector count, cycling the connector types
        evses = []
        for k in range(max(1, n_conn)):
            c = dict(conns[k % len(conns)])
            c["id"] = "1"
            evses.append({"uid": f"{k + 1}", "id": f"{ident}#{k + 1}"[:80], "conns": [c]})
        owner = _text(cp, "chargingPointOwner")
        loc = {
            "id": lid, "op": party, "name": ident[:120], "addr": _text(cp, "chargingPointAddress")[:160], "city": "", "pc": "",
            "lat": round(lat, 6), "lon": round(lon, 6), "evses": evses, "upd": _text(cp, "creationDate")[:10],
        }
        if owner and owner != op_name:
            loc["owner"] = owner[:80]
        if _text(cp, "chargingPointStatus").lower() not in ("", "operational"):
            loc["unpub"] = True
        locations.append(loc)
    return {"country": spec.country, "source": spec.source_id, "operators": dict(sorted(operators.items())),
            "locations": locations, "dropped": dropped}


SPEC = SourceSpec(
    country="CY",
    country_name="Cyprus",
    source_id="EMS",
    source_name="Department of Electrical and Mechanical Services (traffic4cyprus NAP)",
    source_url="https://www.traffic4cyprus.org.cy/en_AU/dataset/electricvehiclecharges",
    bbox=(34.4, 32.0, 35.8, 34.8),
    static=Feed(URL, "csv", max_bytes=40 << 20),
    dynamic=None,
    parse_static=parse_static,
    parse_dynamic=None,
    refresh_minutes=1440,
    licence="CC-BY 4.0",
    notes="Inventory only.",
)
