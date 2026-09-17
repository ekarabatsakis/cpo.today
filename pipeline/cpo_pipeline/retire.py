"""Remove published data of countries that are no longer integrated.

    python3 -m cpo_pipeline.retire --data-dir ../data

A country directory on the data branch is kept only while its code is in
``sources.SPECS``; anything else (a source that was switched off) is deleted
and dropped from ``index.json`` so the site stops listing it.
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
from pathlib import Path

from .sources import SPECS
from .store import read_json, write_json

log = logging.getLogger("cpo.retire")


def retire(data_root: Path) -> list[str]:
    keep = {code.upper() for code in SPECS}
    removed = []
    for meta in sorted(data_root.glob("*/meta.json")):
        code = str((read_json(meta, {}) or {}).get("country", "")).upper() or meta.parent.name.upper()
        if code in keep:
            continue
        shutil.rmtree(meta.parent)
        removed.append(code)
        log.info("retired %s (%s)", code, meta.parent)
    index_path = data_root / "index.json"
    index = read_json(index_path, None)
    if index and isinstance(index.get("countries"), list):
        kept = [c for c in index["countries"] if str(c.get("code", "")).upper() in keep]
        if len(kept) != len(index["countries"]):
            index["countries"] = kept
            write_json(index_path, index, compact=False)
    return removed


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="cpo_pipeline.retire")
    ap.add_argument("--data-dir", required=True, type=Path)
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    removed = retire(a.data_dir)
    print("retired: " + (", ".join(removed) if removed else "nothing"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
