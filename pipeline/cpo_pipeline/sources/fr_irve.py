"""France: Base nationale des IRVE (transport.data.gouv.fr / Etalab).

Consolidated national file of public charging infrastructure, one row per
charge point (point de charge), schema "IRVE statique" v2.x, refreshed daily.
https://transport.data.gouv.fr/datasets?locale=en&type=charging-stations

Inventory only: the national base carries no live status.
"""

from __future__ import annotations

import csv
import io
import re

from .base import Feed, SourceError, SourceSpec

URL = "https://www.data.gouv.fr/fr/datasets/r/eb76d20a-8501-400e-b336-d85724de5435"


def _f(x):
    try:
        return float(str(x).replace(",", "."))
    except (TypeError, ValueError):
        return None


def _flag(x):
    return str(x or "").strip().lower() in ("true", "1", "oui", "yes", "t")


def _party(station_id, operator):
    m = re.match(r"^FR\*?([A-Z0-9]{3})", str(station_id or "").upper())
    if m:
        return m.group(1)
    slug = re.sub(r"[^A-Z0-9]", "", str(operator or "").upper())
    return (slug[:6] or "???")


def _coords(row):
    lat, lon = _f(row.get("consolidated_latitude")), _f(row.get("consolidated_longitude"))
    if lat is None or lon is None:
        m = re.findall(r"-?\d+(?:\.\d+)?", row.get("coordonneesXY") or "")
        if len(m) >= 2:
            lon, lat = float(m[0]), float(m[1])
    return lat, lon


def parse_static(doc, spec):
    """`doc` is the CSV text (the runner hands over decoded bytes as str)."""
    if isinstance(doc, bytes):
        doc = doc.decode("utf-8-sig", errors="replace")
    if not isinstance(doc, str):
        raise SourceError("expected CSV text")
    reader = csv.DictReader(io.StringIO(doc))
    if not reader.fieldnames or "id_station_itinerance" not in reader.fieldnames:
        raise SourceError("unexpected CSV header")
    stations: dict[str, dict] = {}
    operators: dict[str, dict] = {}
    dropped = []
    n_rows = 0
    for row in reader:
        n_rows += 1
        sid = (row.get("id_station_itinerance") or row.get("id_station_local") or "").strip()
        if not sid:
            dropped.append(("", "missing station id"))
            continue
        lat, lon = _coords(row)
        if lat is None or lon is None:
            dropped.append((sid, "missing id/coords"))
            continue
        bbox = spec.bbox
        if not (bbox[0] <= lat <= bbox[2] and bbox[1] <= lon <= bbox[3]):
            dropped.append((sid, "outside bbox"))
            continue
        party = _party(sid, row.get("nom_operateur"))
        op_name = (row.get("nom_operateur") or row.get("nom_amenageur") or party).strip()[:80]
        op = operators.setdefault(party, {"id": party, "name": op_name, "names": {}})
        op["names"][op_name] = op["names"].get(op_name, 0) + 1
        st = stations.get(sid)
        if st is None:
            hours = (row.get("horaires") or "").strip()
            st = {
                "id": sid[:120], "op": party,
                "name": (row.get("nom_station") or "").strip()[:120],
                "addr": (row.get("adresse_station") or "").strip()[:160],
                "city": (row.get("consolidated_commune") or "").strip()[:80],
                "pc": (row.get("consolidated_code_postal") or "").strip()[:12],
                "lat": round(lat, 6), "lon": round(lon, 6),
                "evses": [],
                "upd": (row.get("date_maj") or "")[:10],
            }
            if hours.startswith("24/7") or hours.lower().startswith("24h"):
                st["h24"] = True
            impl = (row.get("implantation_station") or "").strip()
            if impl:
                st["ptype"] = {"Voirie": "ON_STREET", "Parking public": "PARKING_LOT", "Parking privé à usage public": "PARKING_LOT",
                               "Parking privé réservé à la clientèle": "PARKING_LOT", "Station dédiée à la recharge rapide": "ALONG_MOTORWAY"}.get(impl, impl[:24])
            owner = (row.get("nom_amenageur") or "").strip()
            if owner and owner != op_name:
                st["owner"] = owner[:80]
            if (row.get("nom_enseigne") or "").strip() and row["nom_enseigne"].strip() != op_name:
                st["subop"] = row["nom_enseigne"].strip()[:60]
            stations[sid] = st
        kw = _f(row.get("puissance_nominale"))
        if kw is not None and kw > 1000:      # some rows publish watts
            kw = kw / 1000.0
        kw = round(kw, 1) if kw else None
        dc = _flag(row.get("prise_type_combo_ccs")) or _flag(row.get("prise_type_chademo"))
        conns = []
        cid = 0
        def add(std, fmt, pt):
            nonlocal cid
            cid += 1
            conns.append({"id": str(cid), "std": std, "fmt": fmt, "pt": pt, "kw": kw})
        if _flag(row.get("prise_type_combo_ccs")):
            add("CCS2", "CABLE", "DC")
        if _flag(row.get("prise_type_chademo")):
            add("CHADEMO", "CABLE", "DC")
        if _flag(row.get("prise_type_2")):
            add("T2", "CABLE" if _flag(row.get("cable_t2_attache")) else "SOCKET", "AC3" if (kw or 0) > 7.4 else "AC1")
        if _flag(row.get("prise_type_ef")):
            add("DOM", "SOCKET", "AC1")
        if _flag(row.get("prise_type_autre")) and not conns:
            add("OTHER", "SOCKET", "DC" if dc else "AC3")
        if not conns:
            add("OTHER", "SOCKET", "NA")
        uid = (row.get("id_pdc_itinerance") or row.get("id_pdc_local") or "").strip() or f"#{len(st['evses'])}"
        evse = {"uid": uid[:80], "id": uid[:80], "conns": conns}
        caps = []
        if _flag(row.get("paiement_cb")):
            caps.append("CREDIT_CARD_PAYABLE")
        if _flag(row.get("reservation")):
            caps.append("RESERVABLE")
        if caps:
            evse["caps"] = caps
        if _flag(row.get("gratuit")):
            evse["free"] = True
        st["evses"].append(evse)
    if n_rows == 0:
        raise SourceError("CSV has no rows")
    for op in operators.values():
        op["name"] = max(op["names"].items(), key=lambda kv: kv[1])[0]
        del op["names"]
    return {
        "country": spec.country,
        "source": spec.source_id,
        "operators": dict(sorted(operators.items())),
        "locations": list(stations.values()),
        "dropped": dropped,
    }


SPEC = SourceSpec(
    country="FR",
    country_name="France",
    source_id="IRVE",
    source_name="Base nationale des IRVE (transport.data.gouv.fr)",
    source_url="https://transport.data.gouv.fr/datasets?locale=en&type=charging-stations",
    bbox=(41.0, -5.5, 51.5, 10.0),          # metropolitan France + Corsica
    static=Feed(URL, "csv", max_bytes=600 << 20, max_inflated=600 << 20),
    dynamic=None,
    parse_static=parse_static,
    parse_dynamic=None,
    refresh_minutes=1440,
    licence="Licence Ouverte / Open Licence 2.0 (Etalab)",
    notes="Inventory only: the national base publishes no live status.",
)
