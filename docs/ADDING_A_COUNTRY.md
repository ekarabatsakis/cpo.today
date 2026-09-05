# Adding a country

1. Find the official registry's public data (most EU registries publish OCPI-style JSON; the UK publishes the National Chargepoint Registry as CSV/JSON).
2. Create `pipeline/cpo_pipeline/sources/<cc>_<source>.py` exposing:
   - constants `COUNTRY`, `COUNTRY_NAME`, `SOURCE_ID`, `SOURCE_NAME`, `SOURCE_URL`, feed URLs, size caps and a bounding box
   - `normalize_static(doc)` → `{operators, locations, dropped}` in the model described in `docs/DATA.md`
   - `normalize_dynamic(doc)` → `{statuses, evse_count, tariffs, connector_tariffs}`
   If the registry has no separate live feed, derive both from the same document.
3. Copy `run_gr.py` to `run_<cc>.py` and point it at the new source module (the acquisition, validation and publishing logic is shared).
4. Register the country in `cli.py` and add `.github/workflows/fetch-<cc>.yml` with its own `concurrency.group`.
5. Add tests under `pipeline/tests/` using a small hand-written sample.

The site discovers countries from `index.json`; no front-end change is needed.
