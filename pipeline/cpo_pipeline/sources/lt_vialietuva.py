"""Lithuania: Via Lietuva national EV charging data service.

https://ev.vialietuva.lt/en/data-provision

Public OCPI 2.3.0 endpoints (no credentials):
  * /ocpi/2.3.0/locations  - offset/limit paging with X-Total-Count; limit=5000 returns everything in one page (~4 MB). Empty pages occur mid-range (unpublished rows), so paging must run to the total.
  * /ocpi/2.3.0/tariffs    - tariff objects referenced by connector tariff_ids
A DATEX II export exists as well but OCPI is complete and simpler.
"""

from __future__ import annotations

from . import ocpi
from .base import Feed, SourceSpec

BASE = "https://ev.vialietuva.lt/ocpi/2.3.0"


def parse_static(doc, spec):
    return ocpi.normalize_locations(doc if isinstance(doc, list) else ocpi.unwrap_ocpi_envelope(doc), spec)


def parse_dynamic(doc, spec, tariff_lookup=None):
    locs = doc if isinstance(doc, list) else ocpi.unwrap_ocpi_envelope(doc)
    return ocpi.extract_dynamic(locs, tariff_lookup=tariff_lookup or {})


def parse_tariffs(doc, spec):
    return ocpi.tariff_lookup(ocpi.unwrap_ocpi_envelope(doc))


SPEC = SourceSpec(
    country="LT",
    country_name="Lithuania",
    source_id="VIALIETUVA",
    source_name="Via Lietuva - national EV charging data service",
    source_url="https://ev.vialietuva.lt/en/data-provision",
    bbox=(53.8, 20.8, 56.6, 27.0),
    static=Feed(f"{BASE}/locations", "ocpi-pages", page_size=5000, max_pages=10, max_bytes=60 << 20),
    dynamic=None,
    tariffs=Feed(f"{BASE}/tariffs", "json", max_bytes=40 << 20),
    parse_static=parse_static,
    parse_dynamic=parse_dynamic,
    parse_tariffs=parse_tariffs,
    refresh_minutes=10,
    location_updated=False,
    licence="Open data of Via Lietuva (Lithuanian Road Administration)",
    notes="Single OCPI feed provides inventory and live status; tariffs resolved via tariff_ids.",
)
