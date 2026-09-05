"""Netherlands: NDW (Nationaal Dataportaal Wegverkeer) open charging data.

https://docs.ndw.nu/en/data-uitwisseling/interface-beschrijvingen/dafne-api/

Public file, refreshed continuously:
  https://opendata.ndw.nu/charging_point_locations_ocpi.json.gz
A gzip-compressed JSON array of OCPI locations with EVSE status inline
(~200 MB inflated, ~80k locations). Tariffs come from a second gzip file
referenced through connector tariff_ids.
"""

from __future__ import annotations

from . import ocpi
from .base import Feed, SourceSpec

URL = "https://opendata.ndw.nu/charging_point_locations_ocpi.json.gz"
TARIFFS_URL = "https://opendata.ndw.nu/charging_point_tariffs_ocpi.json.gz"


def parse_static(doc, spec):
    return ocpi.normalize_locations(doc if isinstance(doc, list) else ocpi.unwrap_ocpi_envelope(doc), spec)


def parse_dynamic(doc, spec, tariff_lookup=None):
    locs = doc if isinstance(doc, list) else ocpi.unwrap_ocpi_envelope(doc)
    return ocpi.extract_dynamic(locs, tariff_lookup=tariff_lookup or {})


def parse_tariffs(doc, spec):
    return ocpi.tariff_lookup(doc if isinstance(doc, list) else ocpi.unwrap_ocpi_envelope(doc))


SPEC = SourceSpec(
    country="NL",
    country_name="Netherlands",
    source_id="NDW",
    source_name="NDW - Nationaal Dataportaal Wegverkeer",
    source_url="https://docs.ndw.nu/en/data-uitwisseling/interface-beschrijvingen/dafne-api/",
    bbox=(50.6, 3.0, 53.8, 7.4),
    static=Feed(URL, "gz-json", max_bytes=80 << 20, max_inflated=1500 << 20),
    dynamic=None,
    tariffs=Feed(TARIFFS_URL, "gz-json", max_bytes=40 << 20, max_inflated=600 << 20),
    parse_static=parse_static,
    parse_dynamic=parse_dynamic,
    parse_tariffs=parse_tariffs,
    refresh_minutes=10,
    location_updated=False,
    licence="NDW open data",
    notes="Single OCPI file provides inventory and live status; tariffs from a separate OCPI tariffs file.",
)
