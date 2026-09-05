# Adding a country

1. **Find the official feed.** Most EU registries publish OCPI-style JSON (Greece, Lithuania, the Netherlands, Ireland), some publish DATEX II XML, some only CSV. `site/coverage.json` tracks what is known about each of the 28 EU/UK registries. Use the manual **Probe endpoints** workflow to record status, headers, sizes and samples from a runner with open internet.
2. **Write a spec.** Create `pipeline/cpo_pipeline/sources/<cc>_<source>.py` exposing `SPEC = SourceSpec(...)`:
   - `static`: a `Feed` (kinds: `json`, `zip-json`, `gz-json`, `ocpi-pages`) with size caps
   - `dynamic`: a second `Feed` for live status, or `None` when the static feed already carries EVSE status
   - `tariffs` + `parse_tariffs`: optional OCPI tariffs feed resolved through connector `tariff_ids`
   - `parse_static(doc, spec)` and `parse_dynamic(doc, spec[, tariff_lookup])`: for OCPI-shaped documents just call `ocpi.normalize_locations` and `ocpi.extract_dynamic`; for other formats convert into the same model (see `docs/DATA.md`)
   - `bbox`: a generous bounding box, used to reject bad coordinates
3. **Register it** in `pipeline/cpo_pipeline/sources/__init__.py` and add the code to the country list in `.github/workflows/fetch.yml`.
4. **Test** with a small hand-written sample under `pipeline/tests/` (see `SingleFeedTests`) and, for a real run, `python3 -m cpo_pipeline <cc> --data-dir ../data-local`.
5. **Mark it live** in `site/coverage.json` (`"status": "live"`); the site discovers live countries from `index.json` anyway.

The generic runner handles conditional downloads, size caps, zip/gzip inflation guards, shrink guards, structural change detection, sharding, encoded status, events, history and publishing.
