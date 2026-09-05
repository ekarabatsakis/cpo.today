"""One tick of the Greece pipeline.

    static  (daily)  -> gr/locations.json, gr/daily/<day>.json
    dynamic (10 min) -> gr/status.json, gr/tariffs.json, gr/operators.json,
                        gr/history/<day>.jsonl, gr/events/<day>.jsonl
    both             -> gr/meta.json, index.json
"""

from __future__ import annotations

import datetime as dt
import email.utils
import hashlib
import logging
from pathlib import Path

from . import __version__
from .aggregate import daily_inventory, diff_statuses, operator_table, tick_summary
from .fetch import FetchError, extract_single_json, http_get, parse_json
from .sources import gr_myfah as src
from .store import CountryStore, append_jsonl, read_json, write_json

log = logging.getLogger("cpo.gr")

# If the static feed shrinks by more than this fraction versus the last good
# snapshot, keep the old snapshot and flag it: a half-empty registry is far
# more likely to be an upstream hiccup than 2,000 chargers vanishing overnight.
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


class Tick:
    def __init__(self, data_root: Path, *, static_file: Path | None = None,
                 dynamic_file: Path | None = None, now: dt.datetime | None = None,
                 force_static: bool = False):
        self.store = CountryStore(data_root, src.COUNTRY)
        self.static_file = static_file
        self.dynamic_file = dynamic_file
        self.now = now or utcnow()
        self.force_static = force_static
        self.meta = read_json(self.store.meta, {}) or {}
        self.meta.setdefault("static", {})
        self.meta.setdefault("dynamic", {})
        self.changed = False
        self.warnings: list[str] = []

    # -- acquisition -------------------------------------------------------

    def _acquire(self, kind: str, url: str, local: Path | None, max_zip: int, max_json: int):
        """Return (doc, source_ts, fingerprint) or (None, None, None) when unchanged."""
        m = self.meta[kind]
        if local is not None:
            raw = local.read_bytes()
            if local.suffix == ".zip":
                raw = extract_single_json(raw, max_uncompressed=max_json)
            fp = sha256(raw)
            if fp == m.get("sha256") and not self.force_static:
                return None, None, None
            return parse_json(raw), self.now, {"sha256": fp, "source": str(local)}
        res = http_get(url, etag=None if self.force_static else m.get("etag"),
                       last_modified=None if self.force_static else m.get("last_modified"),
                       max_bytes=max_zip)
        if res.status == 304:
            log.info("%s: not modified (etag %s)", kind, m.get("etag"))
            return None, None, None
        raw = extract_single_json(res.body, max_uncompressed=max_json)
        fp = sha256(raw)
        if fp == m.get("sha256") and not self.force_static:
            log.info("%s: identical content (sha256 match)", kind)
            # Still remember the new validators so the next request can be conditional.
            m["etag"], m["last_modified"] = res.etag, res.last_modified
            return None, None, None
        source_ts = parse_http_date(res.last_modified) or self.now
        info = {"sha256": fp, "etag": res.etag, "last_modified": res.last_modified,
                "zip_bytes": len(res.body), "json_bytes": len(raw)}
        return parse_json(raw), source_ts, info

    # -- static ------------------------------------------------------------

    def run_static(self) -> bool:
        doc, source_ts, info = self._acquire("static", src.STATIC_URL, self.static_file,
                                             src.STATIC_MAX_ZIP, src.STATIC_MAX_JSON)
        if doc is None:
            return False
        norm = src.normalize_static(doc)
        n_loc = len(norm["locations"])
        n_evse = sum(len(l["evses"]) for l in norm["locations"])
        prev = self.meta["static"]
        if prev.get("locations") and n_loc < prev["locations"] * (1 - MAX_SHRINK):
            msg = (f"static: refusing snapshot with {n_loc} locations "
                   f"(previous {prev['locations']}); keeping last good file")
            log.error(msg)
            self.warnings.append(msg)
            self.meta["static"]["rejected"] = {"at": iso(self.now), "locations": n_loc, "reason": msg}
            return False
        for lid, why in norm["dropped"][:20]:
            log.warning("static: dropped %s: %s", lid, why)
        day = source_ts.strftime("%Y-%m-%d")
        out = {
            "country": src.COUNTRY,
            "source": src.SOURCE_ID,
            "generated": iso(self.now),
            "source_ts": iso(source_ts),
            "operators": norm["operators"],
            "locations": norm["locations"],
        }
        self.changed |= write_json(self.store.locations, out)
        self.changed |= write_json(self.store.daily(day), daily_inventory(norm, iso(source_ts)))
        self.meta["static"] = {
            **info,
            "fetched": iso(self.now),
            "source_ts": iso(source_ts),
            "locations": n_loc,
            "evses": n_evse,
            "dropped": len(norm["dropped"]),
        }
        log.info("static: %d locations, %d evses (%d dropped)", n_loc, n_evse, len(norm["dropped"]))
        return True

    # -- dynamic -----------------------------------------------------------

    def run_dynamic(self) -> bool:
        static = read_json(self.store.locations)
        if not static:
            self.warnings.append("dynamic: no static snapshot yet; skipping")
            log.warning("dynamic: no static snapshot yet; skipping")
            return False
        doc, source_ts, info = self._acquire("dynamic", src.DYNAMIC_URL, self.dynamic_file,
                                             src.DYNAMIC_MAX_ZIP, src.DYNAMIC_MAX_JSON)
        if doc is None:
            return False
        norm = src.normalize_dynamic(doc)
        statuses = norm["statuses"]
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

        changes = diff_statuses(prev_map, statuses)
        status_doc = {
            "country": src.COUNTRY,
            "ts": ts,
            "generated": iso(self.now),
            "locations": {lid: dict(sorted(ev.items())) for lid, ev in sorted(statuses.items())},
        }
        self.changed |= write_json(self.store.status, status_doc)
        tariffs = norm["tariffs"]
        conn_tariffs = norm["connector_tariffs"]
        self.changed |= write_json(self.store.tariffs, {
            "country": src.COUNTRY, "ts": ts,
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

    # -- wrap-up -----------------------------------------------------------

    def finish(self):
        self.meta.update({
            "country": src.COUNTRY,
            "country_name": src.COUNTRY_NAME,
            "source": src.SOURCE_ID,
            "source_name": src.SOURCE_NAME,
            "source_url": src.SOURCE_URL,
            "pipeline_version": __version__,
            "last_run": iso(self.now),
            "warnings": self.warnings[-20:],
        })
        self.changed |= write_json(self.store.meta, self.meta, compact=False)
        index_path = self.store.root / "index.json"
        index = read_json(index_path, {"countries": []}) or {"countries": []}
        entry = {
            "code": src.COUNTRY, "name": src.COUNTRY_NAME, "path": self.store.country,
            "source": src.SOURCE_ID, "source_name": src.SOURCE_NAME, "source_url": src.SOURCE_URL,
            "refresh_minutes": 10,
            "static_ts": self.meta["static"].get("source_ts"),
            "dynamic_ts": self.meta["dynamic"].get("source_ts"),
        }
        others = [c for c in index.get("countries", []) if c.get("code") != src.COUNTRY]
        index = {"generated": iso(self.now), "countries": sorted(others + [entry], key=lambda c: c["code"])}
        self.changed |= write_json(index_path, index, compact=False)
        return self.changed


def run(data_root: Path, **kw) -> int:
    tick = Tick(data_root, **kw)
    exit_code = 0
    for step in (tick.run_static, tick.run_dynamic):
        try:
            step()
        except (FetchError, src.SourceError) as e:
            log.error("%s failed: %s", step.__name__, e)
            tick.warnings.append(f"{step.__name__}: {e}")
            exit_code = 1
    changed = tick.finish()
    log.info("changed=%s warnings=%d", changed, len(tick.warnings))
    return exit_code
