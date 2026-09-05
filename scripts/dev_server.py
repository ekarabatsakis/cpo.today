#!/usr/bin/env python3
"""Local preview: serves site/ at / and a data checkout at /data/.

    python3 scripts/dev_server.py --data ../data-branch-checkout [--port 8080]
"""
import argparse
import http.server
import mimetypes
import os
from pathlib import Path

mimetypes.add_type("application/x-ndjson", ".jsonl")
mimetypes.add_type("image/svg+xml", ".svg")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default=str(Path(__file__).resolve().parent.parent / "site"))
    ap.add_argument("--data", required=True, help="directory with index.json (a data branch checkout)")
    ap.add_argument("--port", type=int, default=8080)
    a = ap.parse_args()
    site, data = Path(a.site).resolve(), Path(a.data).resolve()

    class H(http.server.SimpleHTTPRequestHandler):
        def translate_path(self, path):
            path = path.split("?", 1)[0].split("#", 1)[0]
            root = site
            if path.startswith("/data/"):
                root, path = data, path[len("/data"):]
            rel = os.path.normpath(path.lstrip("/"))
            if rel.startswith(".."):
                return str(root / "__nope__")
            p = root / rel
            return str(p / "index.html") if p.is_dir() else str(p)

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def log_message(self, fmt, *args):
            pass

    http.server.ThreadingHTTPServer(("127.0.0.1", a.port), H).serve_forever()


if __name__ == "__main__":
    main()
