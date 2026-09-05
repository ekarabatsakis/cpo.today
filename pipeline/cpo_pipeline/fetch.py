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
    total_count: str | None = None


def http_get(url: str, *, etag: str | None = None, last_modified: str | None = None,
             max_bytes: int, timeout: int = DEFAULT_TIMEOUT, headers: dict | None = None) -> FetchResult:
    """GET `url`, honouring conditional headers. Refuses bodies above `max_bytes`."""
    if not url.startswith("https://"):
        raise FetchError(f"refusing non-https URL: {url}")
    headers = {"User-Agent": USER_AGENT, "Accept": "*/*", **(headers or {})}
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
                total_count=resp.headers.get("X-Total-Count"),
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


def fetch_ocpi_pages(url: str, *, page_size: int, max_pages: int, max_bytes: int,
                     headers: dict | None = None, timeout: int = DEFAULT_TIMEOUT):
    """Walk an OCPI paginated list endpoint with offset/limit.

    Returns (list of location objects, info dict). Uses X-Total-Count when the
    server sends it, otherwise stops at the first short page.
    """
    items = []
    total = None
    pages = 0
    bytes_total = 0
    offset = 0
    sep = "&" if "?" in url else "?"
    while pages < max_pages:
        page_url = f"{url}{sep}offset={offset}&limit={page_size}"
        res = http_get(page_url, max_bytes=max_bytes, timeout=timeout, headers=headers)
        bytes_total += len(res.body)
        doc = parse_json(res.body)
        if isinstance(doc, dict):
            sc = doc.get("status_code")
            if sc is not None and int(sc) != 1000:
                raise FetchError(f"{page_url}: OCPI status_code {sc} {doc.get('status_message')!r}")
            data = doc.get("data")
        else:
            data = doc
        if not isinstance(data, list):
            raise FetchError(f"{page_url}: OCPI data is not a list")
        items.extend(data)
        pages += 1
        offset += page_size
        if res.total_count and res.total_count.isdigit():
            total = int(res.total_count)
        # Servers may return short or even empty pages (unpublished rows are
        # filtered after paging), so advance by page size and stop at the total;
        # only without a total does an empty page mean the end.
        if total is not None:
            if offset >= total:
                break
        elif not data:
            break
    if total is not None and len(items) < total * 0.3:
        raise FetchError(f"{url}: got only {len(items)} of {total} items after {pages} pages")
    return items, {"pages": pages, "body_bytes": bytes_total, "total_count": total}
