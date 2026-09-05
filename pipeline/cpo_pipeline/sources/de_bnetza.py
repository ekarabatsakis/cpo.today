"""Germany: Ladesäulenregister of the Bundesnetzagentur (federal network agency).

https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/Ladesaeulenkarte/start.html

A semicolon-separated CSV (~55 MB) with one row per charging device
(Ladeeinrichtung) and up to six charge points (Ladepunkte) per row, refreshed
roughly monthly under a dated file name discovered from the page. Inventory
only: the register carries no live status. Note the register lists only
operators that completed the notification procedure, so it undercounts.
"""

from __future__ import annotations

import csv
import hashlib
import io
import re

from .base import Feed, SourceError, SourceSpec

PAGE = "https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/Ladesaeulenkarte/start.html"
DISCOVER = r'href="(https://data\.bundesnetzagentur\.de/[^"]*Ladesaeulenregister[^"]*\.csv)"'

CONN = [
    ("combo", "CCS2", "DC"), ("ccs", "CCS2", "DC"), ("chademo", "CHADEMO", "DC"),
    ("typ 2 fahrzeugkupplung", "T2", "AC3"), ("typ 2 steckdose", "T2", "AC3"), ("typ 2", "T2", "AC3"),
    ("typ 1", "T1", "AC1"), ("schuko", "DOM", "AC1"), ("cee", "IND", "AC3"), ("tesla", "TESLA_S", "DC"),
]


def _f(x):
    try:
        return float(str(x).replace(".", "").replace(",", ".")) if "," in str(x) else float(x)
    except (TypeError, ValueError):
        return None


def _conn(text, kw):
    t = (text or "").lower()
    std, pt = "OTHER", "NA"
    for key, s_, p_ in CONN:
        if key in t:
            std, pt = s_, p_
            break
    if pt == "AC3" and kw is not None and kw <= 7.4:
        pt = "AC1"
    fmt = "CABLE" if ("kupplung" in t or pt == "DC") else "SOCKET"
    return {"std": std, "fmt": fmt, "pt": pt, "kw": kw}


def parse_static(doc, spec):
    text = doc.decode("utf-8-sig", errors="replace") if isinstance(doc, bytes) else doc
    if not isinstance(text, str):
        raise SourceError("expected CSV text")
    lines = text.splitlines()
    start = next((i for i, l in enumerate(lines) if l.startswith("Ladeeinrichtungs-ID;")), None)
    if start is None:
        raise SourceError("header row not found")
    reader = csv.reader(io.StringIO("\n".join(lines[start:])), delimiter=";")
    header = next(reader)
    idx = {h.strip(): i for i, h in enumerate(header)}

    def col(row, name):
        i = idx.get(name)
        return row[i].strip() if i is not None and i < len(row) else ""

    operators, locations, dropped = {}, {}, []
    bbox = spec.bbox
    n = 0
    for row in reader:
        if not row or not col(row, "Ladeeinrichtungs-ID"):
            continue
        n += 1
        lat, lon = _f(col(row, "Breitengrad")), _f(col(row, "Längengrad"))
        dev_id = col(row, "Ladeeinrichtungs-ID")
        if lat is None or lon is None:
            dropped.append((dev_id, "missing id/coords"))
            continue
        if not (bbox[0] <= lat <= bbox[2] and bbox[1] <= lon <= bbox[3]):
            dropped.append((dev_id, "outside bbox"))
            continue
        op_name = col(row, "Betreiber")[:80] or "Unknown operator"
        party = hashlib.sha1(op_name.lower().encode()).hexdigest()[:6].upper()
        operators.setdefault(party, {"id": party, "name": op_name})
        street = f"{col(row, 'Straße')} {col(row, 'Hausnummer')}".strip()
        pc, city = col(row, "Postleitzahl"), col(row, "Ort")
        key = f"{party}|{street.lower()}|{pc}|{round(lat, 4)}|{round(lon, 4)}"
        lid = "DE-" + hashlib.sha1(key.encode()).hexdigest()[:12]
        loc = locations.get(lid)
        if loc is None:
            loc = {
                "id": lid, "op": party, "name": (col(row, "Standortbezeichnung") or col(row, "Anzeigename (Karte)") or street)[:120],
                "addr": street[:160], "city": city[:80], "pc": pc[:12], "lat": round(lat, 6), "lon": round(lon, 6),
                "evses": [], "upd": "",
            }
            if col(row, "Öffnungszeiten") == "247":
                loc["h24"] = True
            if col(row, "Status") and col(row, "Status") != "In Betrieb":
                loc["unpub"] = True
            locations[lid] = loc
        dev_kw = _f(col(row, "Nennleistung Ladeeinrichtung [kW]"))
        n_points = int(_f(col(row, "Anzahl Ladepunkte")) or 0)
        for k in range(1, 7):
            types = col(row, f"Steckertypen{k}")
            if not types and k > n_points:
                continue
            if not types and k > 1:
                break
            kw = _f(col(row, f"Nennleistung Stecker{k}")) or dev_kw
            evse_id = col(row, f"EVSE-ID{k}") or f"{dev_id}-{k}"
            conns = []
            for j, t in enumerate([x for x in re.split(r"[;,]", types) if x.strip()] or ["unbekannt"]):
                c = _conn(t, round(kw, 1) if kw else None)
                c["id"] = str(j + 1)
                conns.append(c)
            evse = {"uid": evse_id[:80], "id": evse_id[:80], "conns": conns}
            pay = col(row, "Bezahlsysteme").lower()
            caps = []
            if "kreditkarte" in pay or "girocard" in pay or "kartenzahlung" in pay:
                caps.append("CREDIT_CARD_PAYABLE")
            if "rfid" in pay:
                caps.append("RFID_READER")
            if caps:
                evse["caps"] = caps
            loc["evses"].append(evse)
        d = col(row, "Inbetriebnahmedatum")
        m = re.match(r"(\d\d)\.(\d\d)\.(\d{4})", d)
        if m and (not loc["upd"] or f"{m.group(3)}-{m.group(2)}-{m.group(1)}" > loc["upd"]):
            loc["upd"] = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    if n == 0:
        raise SourceError("CSV has no rows")
    return {"country": spec.country, "source": spec.source_id, "operators": dict(sorted(operators.items())),
            "locations": list(locations.values()), "dropped": dropped}


SPEC = SourceSpec(
    country="DE",
    country_name="Germany",
    source_id="BNETZA",
    source_name="Bundesnetzagentur Ladesäulenregister",
    source_url=PAGE,
    bbox=(47.2, 5.8, 55.1, 15.1),
    static=Feed(PAGE, "csv", max_bytes=400 << 20, discover=DISCOVER),
    dynamic=None,
    parse_static=parse_static,
    parse_dynamic=None,
    refresh_minutes=1440,
    licence="Datenlizenz Deutschland Namensnennung 2.0",
    notes="Inventory only; the register undercounts operators still in the notification procedure.",
)
