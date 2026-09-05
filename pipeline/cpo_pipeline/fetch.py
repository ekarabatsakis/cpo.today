"""Hardened HTTP download + zip extraction for source registries.

Defensive by design: every byte that comes from the network is capped, the
archive is inspected before extraction, and JSON is parsed with a size limit.
"""

from __future__ import annotations

import io
import json
import os
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass

USER_AGENT = "cpo.today/0.1 (+https://cpo.today; open EV charging data aggregator)"
DEFAULT_TIMEOUT = 60


class FetchError(RuntimeError):
    pass


@dataclass
class FetchResult:
    status: int              # 200 or 304
    body: bytes              # empty on 304
    etag: str | None
    last_modified: str | None
    content_type: str | None


def http_get(url: str, *, etag: str | None = None, last_modified: str | None = None,
             max_bytes: int, timeout: int = DEFAULT_TIMEOUT) -> FetchResult:
    """GET `url`, honouring conditional headers. Refuses bodies above `max_bytes`."""
    if not url.startswith("https://"):
        raise FetchError(f"refusing non-https URL: {url}")
    headers = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (https enforced above)
            declared = resp.headers.get("Content-Length")
            if declared and int(declared) > max_bytes:
                raise FetchError(f"{url}: declared size {declared} exceeds cap {max_bytes}")
            buf = io.BytesIO()
            while True:
                chunk = resp.read(1 << 16)
                if not chunk:
                    break
                buf.write(chunk)
                if buf.tell() > max_bytes:
                    raise FetchError(f"{url}: body exceeds cap {max_bytes}")
            return FetchResult(
                status=resp.status,
                body=buf.getvalue(),
                etag=resp.headers.get("ETag"),
                last_modified=resp.headers.get("Last-Modified"),
                content_type=resp.headers.get("Content-Type"),
            )
    except urllib.error.HTTPError as e:
        if e.code == 304:
            return FetchResult(status=304, body=b"", etag=etag, last_modified=last_modified,
                               content_type=None)
        raise FetchError(f"{url}: HTTP {e.code}") from e
    except urllib.error.URLError as e:
        raise FetchError(f"{url}: {e.reason}") from e


def extract_single_json(zip_bytes: bytes, *, max_uncompressed: int) -> bytes:
    """Return the bytes of the single .json member of a zip archive.

    Guards against zip bombs (declared and actual size), path traversal and
    multi-member archives that we do not expect from the registries.
    """
    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile as e:
        raise FetchError(f"not a zip archive: {e}") from e
    members = [m for m in zf.infolist() if not m.is_dir()]
    if len(members) != 1:
        raise FetchError(f"expected exactly one file in archive, got {len(members)}")
    m = members[0]
    name = m.filename
    if os.path.isabs(name) or ".." in name.replace("\\", "/").split("/"):
        raise FetchError(f"unsafe member name: {name!r}")
    if not name.lower().endswith(".json"):
        raise FetchError(f"unexpected member type: {name!r}")
    if m.file_size > max_uncompressed:
        raise FetchError(f"member {name!r} declares {m.file_size} bytes > cap {max_uncompressed}")
    with zf.open(m) as fh:
        out = io.BytesIO()
        while True:
            chunk = fh.read(1 << 16)
            if not chunk:
                break
            out.write(chunk)
            if out.tell() > max_uncompressed:
                raise FetchError(f"member {name!r} exceeds cap while inflating")
    return out.getvalue()


def parse_json(raw: bytes):
    text = raw.decode("utf-8-sig")  # registries emit a BOM
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise FetchError(f"invalid JSON: {e}") from e
