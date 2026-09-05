"""Belgium: open OCPI feed of the Road (E-Flux) public charging network via transportdata.be.

Dataset: https://transportdata.be/dataset/road-public-charging-network
Resource: a full OCPI 2.2.1 locations array with live EVSE status, refreshed continuously.

Coverage is partial: this is one large network plus INDIGO car parks, not the
whole Belgian market. The AFIR "selected CPOs" DATEX II feed on the same portal
requires a key.
"""

from __future__ import annotations

from . import datex2, ocpi
from .base import Feed, SourceSpec

URL = "https://roaming.road.io/files/9ef09c78-2666-418a-aa45-4f2261e2e305/locations.json?force=true"
TARIFFS_URL = "https://roaming.road.io/files/9ef09c78-2666-418a-aa45-4f2261e2e305/tariffs.json?force=true"
# Group INDIGO car parks: static DATEX II published on the same portal (no live status).
INDIGO_URL = "https://transportdata.be/dataset/27f1357d-71ee-48cb-84a1-96f3f4f034b8/resource/d4bc8ddd-c80f-4330-98e5-d86e5b2147c3/download/indigo-data-evcharging-static-datexii.xml"


def parse_static(doc, spec):
    return ocpi.normalize_locations(doc if isinstance(doc, list) else ocpi.unwrap_ocpi_envelope(doc), spec)


def parse_dynamic(doc, spec, tariff_lookup=None):
    return ocpi.extract_dynamic(doc if isinstance(doc, list) else ocpi.unwrap_ocpi_envelope(doc), tariff_lookup=tariff_lookup or {})


def parse_tariffs(doc, spec):
    return ocpi.tariff_lookup(doc if isinstance(doc, list) else ocpi.unwrap_ocpi_envelope(doc))


def parse_indigo(doc, spec):
    return datex2.parse_table(doc.encode("utf-8") if isinstance(doc, str) else doc, spec)


SPEC = SourceSpec(
    country="BE",
    country_name="Belgium",
    source_id="TRANSPORTDATA_BE",
    source_name="transportdata.be - Road public charging network (OCPI)",
    source_url="https://transportdata.be/dataset/road-public-charging-network",
    bbox=(49.4, 2.4, 51.6, 6.5),
    static=Feed(URL, "json", max_bytes=80 << 20),
    dynamic=None,
    tariffs=Feed(TARIFFS_URL, "json", max_bytes=80 << 20),
    parse_static=parse_static,
    parse_dynamic=parse_dynamic,
    parse_tariffs=parse_tariffs,
    parts=((Feed(INDIGO_URL, "csv", max_bytes=40 << 20), parse_indigo),),
    refresh_minutes=10,
    licence="Open data (transportdata.be)",
    notes="Partial coverage: the Road/E-Flux network (live) and INDIGO car parks (inventory); other operators publish behind keys.",
)
