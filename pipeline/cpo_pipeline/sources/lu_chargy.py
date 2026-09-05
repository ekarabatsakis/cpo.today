"""Luxembourg: Chargy (public charging network of the Luxembourg state) + Eco-Movement.

Open data portal: https://data.public.lu/en/pages/topics/transport-charging-points-points-de-charge/

Two open resources published by the portal:
  * Chargy KML - every Chargy/SuperChargy station with per-connector live status
  * Eco-Movement DATEX II table - multi-operator inventory for Luxembourg (no status)
The access tokens embedded in these URLs are the ones published in the open data
catalogue itself; they are not cpo.today secrets.
"""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET

from . import datex2
from .base import Feed, SourceError, SourceSpec

CHARGY_KML = "https://my.chargy.lu/b2bev-external-services/resources/kml?API-KEY=486ac6e4-93b8-4369-9c6a-28f7c4e1a81f"
ECO_DATEX = "https://api.eco-movement.com/api/nap/datexii/locations?token=S76EiFxqRLlZLCGBxHgyqUbaeKc5Pewb4HnRF1EeBV"

KML_NS = "{http://www.opengis.net/kml/2.2}"
STATUS = {"AVAILABLE": "A", "CHARGING": "C", "OCCUPIED": "C", "UNAVAILABLE": "O", "OUTOFORDER": "O", "RESERVED": "R",
          "UNKNOWN": "U", "REMOVED": "M", "PLANNED": "P", "INOPERATIVE": "I", "BLOCKED": "B"}


def _txt(el, name):
    d = el.find(f"{KML_NS}{name}")
    return (d.text or "").strip() if d is not None and d.text else ""


def parse_chargy(doc, spec):
    if isinstance(doc, bytes):
        raw = doc
    elif isinstance(doc, str):
        raw = doc.encode("utf-8")
    else:
        raise SourceError("expected KML bytes")
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as e:
        raise SourceError(f"invalid KML: {e}") from e
    placemarks = root.iter(f"{KML_NS}Placemark")
    party = "CHARGY"
    operators = {party: {"id": party, "name": "Chargy"}}
    locations, statuses, dropped = [], {}, []
    seen = set()
    bbox = spec.bbox
    n = 0
    for pm in placemarks:
        n += 1
        name = _txt(pm, "name")
        coords = ""
        pt = pm.find(f"{KML_NS}Point")
        if pt is not None:
            coords = _txt(pt, "coordinates")
        parts = [p for p in re.split(r"[,\s]+", coords) if p]
        try:
            lon, lat = float(parts[0]), float(parts[1])
        except (IndexError, ValueError):
            dropped.append((name, "missing id/coords"))
            continue
        if not (bbox[0] <= lat <= bbox[2] and bbox[1] <= lon <= bbox[3]):
            dropped.append((name, "outside bbox"))
            continue
        devices = []
        ext = pm.find(f"{KML_NS}ExtendedData")
        if ext is not None:
            for d in ext.findall(f"{KML_NS}Data"):
                if d.get("name") == "chargingdevice":
                    try:
                        devices.append(json.loads(_txt(d, "value")))
                    except json.JSONDecodeError:
                        continue
        if not devices:
            dropped.append((name, "no charging devices"))
            continue
        lid = f"LU-CHARGY-{devices[0].get('id')}"
        if lid in seen:
            dropped.append((lid, "duplicate id"))
            continue
        seen.add(lid)
        evses = []
        loc_status = {}
        super_ = "superchargy" in name.lower()
        for dev in devices:
            for c in dev.get("connectors") or []:
                uid = str(c.get("id") or f"{dev.get('id')}-{c.get('connector')}")
                kw = c.get("maxchspeed")
                try:
                    kw = round(float(kw), 1) if kw is not None else None
                except (TypeError, ValueError):
                    kw = None
                dc = super_ or (kw or 0) > 43
                evses.append({"uid": uid, "id": str(c.get("name") or uid)[:80], "mfr": None,
                              "conns": [{"id": "1", "std": "CCS2" if dc else "T2", "fmt": "CABLE" if dc else "SOCKET",
                                         "pt": "DC" if dc else "AC3", "kw": kw}]})
                evses[-1].pop("mfr")
                loc_status[uid] = STATUS.get(str(c.get("description") or "").upper(), "U")
        addr = _txt(pm, "address")
        m = re.search(r"L-(\d{4})\s+([^,]+)", addr)
        locations.append({
            "id": lid, "op": party, "name": name[:120], "addr": addr.split(",")[0][:160],
            "city": (m.group(2).replace("Luxembourg", "").strip() if m else "")[:80], "pc": (m.group(1) if m else "")[:12],
            "lat": round(lat, 6), "lon": round(lon, 6), "evses": evses, "upd": "", "h24": True,
        })
        statuses[lid] = loc_status
    if n == 0:
        raise SourceError("no placemarks in KML")
    return {"country": spec.country, "source": spec.source_id, "operators": operators, "locations": locations,
            "dropped": dropped, "statuses": statuses}


def parse_dynamic(doc, spec, tariff_lookup=None):
    """Live status comes with the KML; the runner merges it from parse_chargy's `statuses`."""
    norm = parse_chargy(doc, spec)
    return {"statuses": norm["statuses"], "evse_count": sum(len(v) for v in norm["statuses"].values()),
            "tariffs": [], "connector_tariffs": {}}


def parse_eco(doc, spec):
    raw = doc.encode("utf-8") if isinstance(doc, str) else doc
    return datex2.parse_table(raw, spec)


SPEC = SourceSpec(
    country="LU",
    country_name="Luxembourg",
    source_id="DATAPUBLICLU",
    source_name="data.public.lu - Chargy network + Eco-Movement inventory",
    source_url="https://data.public.lu/en/pages/topics/transport-charging-points-points-de-charge/",
    bbox=(49.4, 5.7, 50.2, 6.6),
    static=Feed(CHARGY_KML, "csv", max_bytes=40 << 20),      # "csv" kind = raw bytes/str, parsed by us
    dynamic=None,
    parse_static=parse_chargy,
    parse_dynamic=parse_dynamic,
    parts=((Feed(ECO_DATEX, "csv", max_bytes=60 << 20), parse_eco),),
    refresh_minutes=10,
    licence="Creative Commons Zero (data.public.lu)",
    notes="Chargy stations carry live status; other operators come from the Eco-Movement inventory without status.",
)
