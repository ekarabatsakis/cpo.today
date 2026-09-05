"""One tick of a country pipeline, driven by a SourceSpec.

    static  (daily or every tick) -> <cc>/points.json, <cc>/locations/<shard>.json, <cc>/daily/<day>.json
    dynamic (every tick)          -> <cc>/status.json, <cc>/tariffs.json, <cc>/operators.json,
                                     <cc>/history/<day>.jsonl, <cc>/events/<day>.jsonl
    both                          -> <cc>/meta.json, index.json

Single-feed sources (dynamic=None) read status from the same document as the
inventory; locations.json is then rewritten only when the inventory changed
structurally, so the repository does not churn on timestamps.
"""

from __future__ import annotations

import datetime as dt
import email.utils
import gzip
import hashlib
import json
import logging
import re
import urllib.parse
from pathlib import Path

from . import __version__
from .aggregate import daily_inventory, diff_encoded, encode_statuses, operator_table, points_layer, tick_summary
from .fetch import FetchError, extract_single_json, fetch_ocpi_pages, http_get, parse_json
from .sources.base import Feed, SourceError, SourceSpec
from .store import CountryStore, append_jsonl, read_json, shard_count, shard_of, write_json

log = logging.getLogger("cpo.runner")

# If a feed shrinks by more than this fraction versus the last good snapshot,
# keep the old snapshot and flag it: a half-empty registry is far more likely
# to be an upstream hiccup than a third of the network vanishing overnight.
MAX_SHRINK = 0.30


def utcnow():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0)


def iso(t: dt.datetime) -> str:
    return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_http_date(s: str | None) -> dt.datetime | None:
    if not s:
        return None
    try:
        return email.utils.parsedate_to_datetime(s).astimezone(dt.timezone.utc)
    except (TypeError, ValueError):
        return None


def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def structural_fingerprint(norm: dict) -> str:
    """Hash of the inventory ignoring volatile fields (timestamps, live status)."""
    def strip(o):
        if isinstance(o, dict):
            return {k: strip(v) for k, v in o.items() if k not in ("upd",)}
        if isinstance(o, list):
            return [strip(x) for x in o]
        return o
    return sha256(json.dumps(strip({"operators": norm["operators"], "locations": norm["locations"]}),
                             sort_keys=True, ensure_ascii=False).encode())


def decode_body(feed: Feed, raw: bytes) -> bytes:
    if feed.kind == "zip-json":
        return extract_single_json(raw, max_uncompressed=feed.max_inflated)
    if feed.kind == "gz-json":
        out = gzip.decompress(raw)
        if len(out) > feed.max_inflated:
            raise FetchError(f"gzip body inflates to {len(out)} bytes > cap {feed.max_inflated}")
        return out
    return raw


class Tick:
    def __init__(self, spec: SourceSpec, data_root: Path, *, static_file: Path | None = None,
                 dynamic_file: Path | None = None, now: dt.datetime | None = None,
                 force_static: bool = False):
        self.spec = spec
        self.store = CountryStore(data_root, spec.country)
        self.static_file = static_file
        self.dynamic_file = dynamic_file
        self.now = now or utcnow()
        self.force_static = force_static
        self.meta = read_json(self.store.meta, {}) or {}
        self.meta.setdefault("static", {})
        self.meta.setdefault("dynamic", {})
        self.changed = False
        self.warnings: list[str] = []
        self._static_doc = None
        self._static_ts = None
        self._static_info = None
        self.tariff_lookup: dict = {}
        self._inventory = None
        self._part_statuses: dict = {}
        self._part_cache: dict = {}

    # -- acquisition -------------------------------------------------------

    def _acquire(self, kind: str, feed: Feed, local: Path | None):
        """Return (doc, source_ts, info) or (None, None, None) when unchanged."""
        m = self.meta.setdefault(kind, {})
        skip_unchanged = not (self.force_static and kind == "static")
        if local is not None:
            raw = local.read_bytes()
            if local.suffix == ".zip":
                raw = extract_single_json(raw, max_uncompressed=feed.max_inflated)
            elif local.suffix == ".gz":
                raw = gzip.decompress(raw)
            fp = sha256(raw)
            if fp == m.get("sha256") and skip_unchanged:
                return None, None, None
            return self._parse(feed, raw), self.now, {"sha256": fp, "source": str(local)}
        if feed.kind == "ocpi-pages":
            docs, info = fetch_ocpi_pages(feed.url, page_size=feed.page_size, max_pages=feed.max_pages,
                                          max_bytes=feed.max_bytes, headers=feed.headers)
            raw = json.dumps(docs, ensure_ascii=False, sort_keys=True).encode()
            fp = sha256(raw)
            if fp == m.get("sha256") and skip_unchanged:
                log.info("%s: identical content (sha256 match)", kind)
                return None, None, None
            return docs, self.now, {"sha256": fp, **info}
        url = feed.url
        if feed.discover:
            page = http_get(feed.url, max_bytes=8 << 20, headers=feed.headers)
            html = page.body.decode("utf-8", errors="replace").replace("&amp;", "&")
            mt = re.search(feed.discover, html)
            if not mt:
                raise FetchError(f"{feed.url}: no link matching {feed.discover!r}")
            url = urllib.parse.urljoin(feed.url, mt.group(1) if mt.groups() else mt.group(0))
            if url != m.get("discovered_url"):
                skip_unchanged = False       # a new file name is a new file
            m["discovered_url"] = url
            log.info("%s: discovered %s", kind, url)
        res = http_get(url, etag=m.get("etag") if skip_unchanged else None,
                       last_modified=m.get("last_modified") if skip_unchanged else None,
                       max_bytes=feed.max_bytes, headers=feed.headers)
        if res.status == 304:
            log.info("%s: not modified (etag %s)", kind, m.get("etag"))
            return None, None, None
        raw = decode_body(feed, res.body)
        fp = sha256(raw)
        if fp == m.get("sha256") and skip_unchanged:
            log.info("%s: identical content (sha256 match)", kind)
            m["etag"], m["last_modified"] = res.etag, res.last_modified
            return None, None, None
        source_ts = parse_http_date(res.last_modified) or self.now
        info = {"sha256": fp, "etag": res.etag, "last_modified": res.last_modified,
                "body_bytes": len(res.body), "json_bytes": len(raw)}
        return self._parse(feed, raw), source_ts, info

    @staticmethod
    def _parse(feed: Feed, raw: bytes):
        if feed.kind == "csv":
            return raw.decode("utf-8-sig", errors="replace")
        return parse_json(raw)

    # -- static ------------------------------------------------------------

    def run_static(self) -> bool:
        spec = self.spec
        if not self.store.points.exists():
            # First run, or a layout migration: the inventory must be rebuilt even
            # if upstream reports the file unchanged.
            self.force_static = True
        doc, source_ts, info = self._acquire("static", spec.static, self.static_file)
        if doc is None:
            return False
        self._static_doc, self._static_ts, self._static_info = doc, source_ts, info
        norm = spec.parse_static(doc, spec)
        self._part_statuses = dict(norm.get("statuses") or {})
        for k, (feed, parser) in enumerate(spec.parts):
            try:
                pdoc, _pts, pinfo = self._acquire(f"part{k}", feed, None)
            except (FetchError, SourceError, ValueError) as e:
                log.warning("part %d (%s): %s; skipped this tick", k, feed.url.split("?")[0], e)
                self.warnings.append(f"part{k}: {e}")
                continue
            if pdoc is None:
                pdoc = self._part_cache.get(k)
                if pdoc is None:
                    continue
            self._part_cache[k] = pdoc
            pn = parser(pdoc, spec)
            ids = {l["id"] for l in norm["locations"]}
            norm["locations"].extend(l for l in pn["locations"] if l["id"] not in ids)
            for oid, o in pn["operators"].items():
                norm["operators"].setdefault(oid, o)
            norm["dropped"].extend(pn.get("dropped", []))
            self._part_statuses.update(pn.get("statuses") or {})
        # Upstream files are not guaranteed to keep their order between generations;
        # sort so fingerprints, shards and points only change when content changes.
        norm["locations"].sort(key=lambda l: l["id"])
        n_loc = len(norm["locations"])
        n_evse = sum(len(l["evses"]) for l in norm["locations"])
        prev = self.meta["static"]
        if prev.get("locations") and n_loc < prev["locations"] * (1 - MAX_SHRINK):
            msg = (f"static: refusing snapshot with {n_loc} locations "
                   f"(previous {prev['locations']}); keeping last good file")
            log.error(msg)
            self.warnings.append(msg)
            self.meta["static"]["rejected"] = {"at": iso(self.now), "locations": n_loc, "reason": msg}
            self._static_doc = None
            return False
        for lid, why in norm["dropped"][:20]:
            log.warning("static: dropped %s: %s", lid, why)
        fp = structural_fingerprint(norm)
        day = source_ts.strftime("%Y-%m-%d")
        structural_change = fp != prev.get("structure") or not self.store.points.exists()
        if structural_change or not spec.single_feed:
            self._write_inventory(norm, source_ts)
        if structural_change or not self.store.daily(day).exists():
            self.changed |= write_json(self.store.daily(day), daily_inventory(norm, iso(source_ts)))
        self._inventory = norm
        self.meta["static"] = {
            **info,
            "structure": fp,
            "fetched": iso(self.now),
            "source_ts": iso(source_ts),
            "locations": n_loc,
            "evses": n_evse,
            "dropped": len(norm["dropped"]),
        }
        log.info("static: %d locations, %d evses (%d dropped)%s", n_loc, n_evse, len(norm["dropped"]),
                 "" if structural_change else " [unchanged structure]")
        return True

    def _write_inventory(self, norm, source_ts):
        """points.json + locations/<shard>.json; only files whose content changed are rewritten."""
        n_shards = shard_count(len(norm["locations"]))
        groups: dict[str, list] = {f"{i:02x}": [] for i in range(n_shards)}
        for loc in norm["locations"]:
            groups[shard_of(loc["id"], n_shards)].append(loc)
        self.store.shard_dir.mkdir(parents=True, exist_ok=True)
        legacy = self.store.dir / "locations.json"
        if legacy.exists():
            legacy.unlink()
            self.changed = True
        wanted = set()
        for name, locs in groups.items():
            wanted.add(f"{name}.json")
            # No timestamp in the shard: its content must only change when equipment changes.
            self.changed |= write_json(self.store.shard(name), {
                "country": self.spec.country, "shard": name, "locations": locs,
            })
        for stale in self.store.shard_dir.glob("*.json"):
            if stale.name not in wanted:
                stale.unlink()
                self.changed = True
        self.changed |= write_json(self.store.points, points_layer(norm, iso(source_ts), n_shards))

    def load_inventory(self):
        """Inventory from the shards on disk (when the static feed was not refreshed this tick)."""
        if self._inventory is not None:
            return self._inventory
        pts = read_json(self.store.points)
        if not pts:
            return None
        locs = []
        for f in sorted(self.store.shard_dir.glob("*.json")):
            locs.extend((read_json(f) or {}).get("locations", []))
        self._inventory = {"operators": {o["id"]: o for o in pts["operators"]}, "locations": locs}
        return self._inventory

    # -- tariffs (optional separate OCPI feed) ------------------------------

    def run_tariffs(self) -> bool:
        """Fetch the optional tariffs feed. Always re-downloaded: the lookup is
        needed every tick and caching 70 MB of raw tariffs in git is not worth it."""
        spec = self.spec
        if spec.tariffs is None:
            return False
        self.meta.setdefault("tariffs", {})
        stale = self.store.dir / "tariffs.raw.json"
        if stale.exists():
            stale.unlink()
            self.changed = True
        try:
            res = http_get(spec.tariffs.url, max_bytes=spec.tariffs.max_bytes, headers=spec.tariffs.headers)
            raw = decode_body(spec.tariffs, res.body)
            self.tariff_lookup = spec.parse_tariffs(parse_json(raw), spec) if spec.parse_tariffs else {}
        except (FetchError, SourceError, ValueError) as e:
            # A tariff outage must not stop status collection.
            log.warning("tariffs: %s (previous tariffs.json kept)", e)
            self.warnings.append(f"tariffs: {e}")
            self.tariff_lookup = {}
            return False
        self.meta["tariffs"] = {"fetched": iso(self.now), "last_modified": res.last_modified,
                                "body_bytes": len(res.body), "json_bytes": len(raw), "count": len(self.tariff_lookup)}
        log.info("tariffs: %d tariff objects", len(self.tariff_lookup))
        return True

    # -- dynamic -----------------------------------------------------------

    def run_dynamic(self) -> bool:
        spec = self.spec
        if not spec.has_status:
            return self._run_inventory_only()
        static = self.load_inventory()
        if not static:
            self.warnings.append("dynamic: no static snapshot yet; skipping")
            log.warning("dynamic: no static snapshot yet; skipping")
            return False
        if spec.single_feed:
            if self._static_doc is None:
                return False
            doc, source_ts, info = self._static_doc, self._static_ts, {"sha256": self._static_info.get("sha256")}
        else:
            doc, source_ts, info = self._acquire("dynamic", spec.dynamic, self.dynamic_file)
            if doc is None:
                return False
        norm = spec.parse_dynamic(doc, spec, self.tariff_lookup) if spec.tariffs else spec.parse_dynamic(doc, spec)
        statuses = norm["statuses"]
        for lid, ev in self._part_statuses.items():
            statuses.setdefault(lid, {}).update(ev)
        known = {(l["id"], e["uid"]) for l in static["locations"] for e in l["evses"]}
        got = {(lid, uid) for lid, evs in statuses.items() for uid in evs}
        orphan = len(got - known)
        missing = len(known - got)
        if len(got) < len(known) * (1 - MAX_SHRINK):
            msg = f"dynamic: only {len(got)} evses for {len(known)} known; rejecting tick"
            log.error(msg)
            self.warnings.append(msg)
            return False
        ts = iso(source_ts)
        day = source_ts.strftime("%Y-%m-%d")

        prev_status = read_json(self.store.status, {}) or {}
        prev_map = prev_status.get("locations") or {}
        if prev_status.get("ts") == ts:
            log.info("dynamic: same source timestamp %s as last tick; skipping", ts)
            return False

        encoded = encode_statuses(static, statuses)
        changes = diff_encoded(prev_map, encoded)
        status_doc = {
            "country": spec.country,
            "ts": ts,
            "generated": iso(self.now),
            "structure": self.meta["static"].get("structure"),
            "locations": encoded,
        }
        self.changed |= write_json(self.store.status, status_doc)
        tariffs = norm["tariffs"]
        conn_tariffs = norm["connector_tariffs"]
        if spec.tariffs is not None and not self.tariff_lookup and self.store.tariffs.exists():
            # Tariff feed unavailable this tick: keep yesterday's prices rather than publishing none.
            prev_t = read_json(self.store.tariffs, {}) or {}
            tariffs, conn_tariffs = prev_t.get("tariffs", []), prev_t.get("locations", {})
        else:
            self.changed |= write_json(self.store.tariffs, {
                "country": spec.country, "ts": ts,
                "tariffs": tariffs,
                "locations": {lid: ev for lid, ev in sorted(conn_tariffs.items())},
            })
        self.changed |= write_json(self.store.operators,
                                   operator_table(static, statuses, tariffs, conn_tariffs, ts))
        append_jsonl(self.store.history(day), tick_summary(static, statuses, ts))
        self.changed = True
        if changes:
            append_jsonl(self.store.events(day), {"ts": ts, "ch": changes})
        self.meta["dynamic"] = {
            **info,
            "fetched": iso(self.now),
            "source_ts": ts,
            "evses": len(got),
            "orphan_evses": orphan,
            "missing_evses": missing,
            "changes": len(changes),
            "tariffs": len(tariffs),
            "tariffed_connectors": sum(len(c) for ev in conn_tariffs.values() for c in ev.values()),
        }
        log.info("dynamic: %d evses, %d changes, %d orphan, %d missing", len(got), len(changes), orphan, missing)
        return True

    def _run_inventory_only(self) -> bool:
        """No live feed: publish the operator table from the inventory alone."""
        if self._inventory is None:
            return False
        ts = self.meta["static"].get("source_ts") or iso(self.now)
        self.changed |= write_json(self.store.operators, operator_table(self._inventory, {}, [], {}, ts))
        for stale in (self.store.status, self.store.tariffs):
            if stale.exists():
                stale.unlink()
                self.changed = True
        self.meta["dynamic"] = {"source_ts": None, "note": "inventory-only source"}
        return True

    # -- wrap-up -----------------------------------------------------------

    def finish(self):
        spec = self.spec
        self.meta.update({
            "country": spec.country,
            "country_name": spec.country_name,
            "source": spec.source_id,
            "source_name": spec.source_name,
            "source_url": spec.source_url,
            "licence": spec.licence,
            "pipeline_version": __version__,
            "last_run": iso(self.now),
            "warnings": self.warnings[-20:],
        })
        self.changed |= write_json(self.store.meta, self.meta, compact=False)
        index_path = self.store.root / "index.json"
        index = read_json(index_path, {"countries": []}) or {"countries": []}
        entry = {
            "code": spec.country, "name": spec.country_name, "path": self.store.country,
            "source": spec.source_id, "source_name": spec.source_name, "source_url": spec.source_url,
            "refresh_minutes": spec.refresh_minutes,
            "live": spec.has_status,
            "static_ts": self.meta["static"].get("source_ts"),
            "dynamic_ts": self.meta["dynamic"].get("source_ts"),
            "locations": self.meta["static"].get("locations"),
            "evses": self.meta["static"].get("evses"),
        }
        others = [c for c in index.get("countries", []) if c.get("code") != spec.country]
        # A country is listed only once it has an inventory; a failed first run stays invisible.
        mine = [entry] if self.meta["static"].get("locations") else []
        index = {"generated": iso(self.now), "countries": sorted(others + mine, key=lambda c: c["code"])}
        self.changed |= write_json(index_path, index, compact=False)
        return self.changed


def run(spec: SourceSpec, data_root: Path, **kw) -> int:
    tick = Tick(spec, data_root, **kw)
    exit_code = 0
    for step in (tick.run_static, tick.run_tariffs, tick.run_dynamic):
        try:
            step()
        except (FetchError, SourceError, ValueError) as e:
            log.error("%s failed: %s", step.__name__, e)
            tick.warnings.append(f"{step.__name__}: {e}")
            exit_code = 1
    changed = tick.finish()
    log.info("changed=%s warnings=%d", changed, len(tick.warnings))
    return exit_code
