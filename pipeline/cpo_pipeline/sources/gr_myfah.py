"""Greece: MYFAH (Μητρώο Υποδομών και Φορέων Αγοράς Ηλεκτροκίνησης).

Official registry of the Ministry of Infrastructure and Transport.
Public data page: https://electrokinisi.yme.gov.gr/public/HelpMyfah/PublicData/

Two OCPI-flavoured feeds, each a zip with one JSON file:
  * static  - full location/EVSE/connector inventory, refreshed daily
  * dynamic - EVSE status + tariffs, refreshed every 10 minutes
"""

from __future__ import annotations

from . import ocpi
from .base import Feed, SourceError, SourceSpec


def _unwrap(doc, kind):
    if not isinstance(doc, dict):
        raise SourceError(f"{kind}: top-level is not an object")
    if str(doc.get("status", "")).lower() != "ok":
        raise SourceError(f"{kind}: upstream status={doc.get('status')!r} desc={doc.get('statusDesc')!r}")
    locs = doc.get("Locations")
    if not isinstance(locs, list) or not locs:
        raise SourceError(f"{kind}: Locations missing or empty")
    return locs


def parse_static(doc, spec):
    return ocpi.normalize_locations(_unwrap(doc, "static"), spec, evse_status=False)


def parse_dynamic(doc, spec):
    return ocpi.extract_dynamic(_unwrap(doc, "dynamic"))


SPEC = SourceSpec(
    country="GR",
    country_name="Greece",
    source_id="MYFAH",
    source_name="MYFAH - Hellenic Ministry of Infrastructure and Transport",
    source_url="https://electrokinisi.yme.gov.gr/public/HelpMyfah/PublicData/",
    bbox=(34.0, 19.0, 42.5, 30.5),
    static=Feed("https://electrokinisi.yme.gov.gr/public/static_files/GR.IDRO.static.data.latest.json.zip", "zip-json"),
    dynamic=Feed("https://electrokinisi.yme.gov.gr/public/static_files/GR.IDRO.dynamic.data.latest.json.zip", "zip-json"),
    parse_static=parse_static,
    parse_dynamic=parse_dynamic,
    refresh_minutes=10,
    licence="Public data of the Hellenic Ministry of Infrastructure and Transport",
)

# Backwards-compatible helpers used by tests.
normalize_static = lambda doc: parse_static(doc, SPEC)  # noqa: E731
normalize_dynamic = lambda doc: parse_dynamic(doc, SPEC)  # noqa: E731
