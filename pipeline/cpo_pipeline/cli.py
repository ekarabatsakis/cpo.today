import argparse
import logging
from pathlib import Path


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="cpo_pipeline", description="cpo.today data pipeline")
    p.add_argument("country", choices=["gr"], help="country to refresh")
    p.add_argument("--data-dir", required=True, type=Path, help="checkout of the `data` branch")
    p.add_argument("--static-file", type=Path, help="use a local static .json/.zip instead of downloading")
    p.add_argument("--dynamic-file", type=Path, help="use a local dynamic .json/.zip instead of downloading")
    p.add_argument("--force-static", action="store_true", help="re-download static even if unchanged")
    p.add_argument("-v", "--verbose", action="store_true")
    a = p.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if a.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    if a.country == "gr":
        from .run_gr import run
        return run(a.data_dir, static_file=a.static_file, dynamic_file=a.dynamic_file,
                   force_static=a.force_static)
    return 2
