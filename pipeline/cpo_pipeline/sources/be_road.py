"""Belgium: open OCPI feed of the Road (E-Flux) public charging network via transportdata.be.

Dataset: https://transportdata.be/dataset/road-public-charging-network
Resource: a full OCPI 2.2.1 locations array with live EVSE status, refreshed continuously.

Coverage is partial: this is one large network, not the whole Belgian market.
The AFIR "selected CPOs" DATEX II feed on the same portal requires a key.
"""

from __future__ import annotations

from . import ocpi
from .base import Feed, SourceSpec

URL = "https://roaming.road.io/files/9ef09c78-2666-418a-aa45-4f2261e2e305/locations.json?force=true"


def parse_static(doc, spec):
    return ocpi.normalize_locations(doc if isinstance(doc, list) else ocpi.unwrap_ocpi_envelope(doc), spec)


def parse_dynamic(doc, spec, tariff_lookup=None):
    return ocpi.extract_dynamic(doc if isinstance(doc, list) else ocpi.unwrap_ocpi_envelope(doc), tariff_lookup=tariff_lookup or {})


SPEC = SourceSpec(
    country="BE",
    country_name="Belgium",
    source_id="TRANSPORTDATA_BE",
    source_name="transportdata.be - Road public charging network (OCPI)",
    source_url="https://transportdata.be/dataset/road-public-charging-network",
    bbox=(49.4, 2.4, 51.6, 6.5),
    static=Feed(URL, "json", max_bytes=80 << 20),
    dynamic=None,
    parse_static=parse_static,
    parse_dynamic=parse_dynamic,
    refresh_minutes=10,
    licence="Open data (transportdata.be)",
    notes="Partial coverage: the Road/E-Flux network only; other Belgian operators publish behind keys.",
)
