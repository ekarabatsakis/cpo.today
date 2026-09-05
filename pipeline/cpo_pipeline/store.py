"""Filesystem layout of the `data` branch and atomic JSON writes."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path


def dump(obj, *, compact=True) -> str:
    if compact:
        return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
    return json.dumps(obj, ensure_ascii=False, indent=1, sort_keys=False)


def write_json(path: Path, obj, *, compact=True) -> bool:
    """Write atomically; return True if content changed."""
    text = dump(obj, compact=compact) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    fd, tmp = tempfile.mkstemp(prefix=path.name, dir=path.parent)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(text)
    os.replace(tmp, path)
    return True


def read_json(path: Path, default=None):
    if not path.exists():
        return default
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def append_jsonl(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(dump(obj) + "\n")


class CountryStore:
    """Paths for one country under the data root."""

    def __init__(self, root: Path, country: str):
        self.root = Path(root)
        self.country = country.lower()
        self.dir = self.root / self.country

    @property
    def meta(self): return self.dir / "meta.json"
    @property
    def locations(self): return self.dir / "locations.json"
    @property
    def status(self): return self.dir / "status.json"
    @property
    def tariffs(self): return self.dir / "tariffs.json"
    @property
    def operators(self): return self.dir / "operators.json"
    def history(self, day): return self.dir / "history" / f"{day}.jsonl"
    def events(self, day): return self.dir / "events" / f"{day}.jsonl"
    def daily(self, day): return self.dir / "daily" / f"{day}.json"
