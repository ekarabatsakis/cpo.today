"""Declarative description of a national source.

A SourceSpec says where the feeds are, how to decode them, and how to turn
the decoded documents into the cpo.today model. The generic runner does the
rest: conditional download, validation, diffing, history, publishing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable


class SourceError(ValueError):
    """The upstream document is not what this source expects."""


@dataclass(frozen=True)
class Feed:
    url: str
    kind: str = "json"                 # json | zip-json | gz-json | csv | ocpi-pages
    max_bytes: int = 40 << 20          # cap on the downloaded body
    max_inflated: int = 400 << 20      # cap after zip/gzip inflation
    page_size: int = 1000              # ocpi-pages only
    max_pages: int = 200               # ocpi-pages only
    headers: dict = field(default_factory=dict)


@dataclass(frozen=True)
class SourceSpec:
    country: str                       # ISO 3166-1 alpha-2, upper case
    country_name: str
    source_id: str
    source_name: str
    source_url: str
    bbox: tuple                        # (min lat, min lon, max lat, max lon)
    static: Feed
    parse_static: Callable[[Any, "SourceSpec"], dict]
    parse_dynamic: Callable[[Any, "SourceSpec"], dict] | None   # None: inventory-only source (no live status)
    dynamic: Feed | None = None        # None: status comes from the static feed every tick
    tariffs: Feed | None = None        # optional OCPI tariffs feed, resolved via connector tariff_ids
    parse_tariffs: Callable[[Any, "SourceSpec"], dict] | None = None   # doc -> {tariff id: OCPI tariff}
    refresh_minutes: int = 10
    licence: str = ""
    notes: str = ""

    @property
    def single_feed(self) -> bool:
        return self.dynamic is None

    @property
    def has_status(self) -> bool:
        return self.parse_dynamic is not None
