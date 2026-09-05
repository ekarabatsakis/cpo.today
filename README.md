# cpo.today

**Every public EV charge point from official national registries, on one open map, refreshed every 10 minutes.**

cpo.today exists so that charge point operators (CPOs), investors, fleets, planners and drivers can see, compare and analyse charging networks from a true signal: the data operators are legally required to report to their national registry, not marketing claims.

- Live site: https://cpo.today
- Data (open, JSON): https://cpo.today/data/index.json and the [`data` branch](https://github.com/ekarabatsakis/cpo.today/tree/data) of this repository
- Schema: [docs/DATA.md](docs/DATA.md)
- Deployment and operations: [docs/SETUP.md](docs/SETUP.md)

## Countries

| Country | Source | Inventory | Live status | Since |
|---|---|---|---|---|
| Greece | [MYFAH](https://electrokinisi.yme.gov.gr/public/HelpMyfah/PublicData/), Hellenic Ministry of Infrastructure and Transport | daily | every 10 min | 2026-09 |

More EU and UK registries follow the same pattern: one module under `pipeline/cpo_pipeline/sources/`, one folder under the `data` branch.

## How it works

```
 MYFAH (zip/json)  ──►  GitHub Actions, every 10 min  ──►  `data` branch (compact JSON)
                        pipeline/ (stdlib Python)              │
                        validate · normalise · diff            ▼
                                                     Cloudflare Pages  ◄──  site/ (static, MapLibre)
                                                     /data/* proxied by a Pages Function
```

1. **Fetch.** A scheduled workflow downloads the registry's static (daily) and dynamic (10-minute) files with conditional requests, so unchanged files cost the ministry nothing.
2. **Validate.** Size caps, zip inspection, envelope checks, bounding-box checks, duplicate detection, and a "shrink guard" that refuses a snapshot that lost more than 30% of the network overnight.
3. **Normalise.** OCPI-style documents become a compact, cross-country model (`locations.json`, `status.json`, `tariffs.json`), plus per-tick history, status-change events, daily inventory snapshots and an operator comparison table.
4. **Publish.** Results are committed to the orphan `data` branch. Code history on `main` stays clean; data history is a full audit trail.
5. **Present.** The site is static HTML/CSS/JS with a vendored MapLibre build, a strict Content Security Policy and no third-party scripts. It reads only the published data files.

## Security posture

- No secrets anywhere: the workflow uses the repository's own `GITHUB_TOKEN` with `contents: write` and nothing else.
- Pipeline is standard-library Python; there is no dependency tree to audit.
- Every network byte is capped, archives are inspected before extraction, only `https://` is accepted.
- Site: CSP with `default-src 'none'`, no inline scripts or styles, all DOM text set via `textContent`, vendored libraries, `X-Frame-Options: DENY`, HSTS.
- The `/data/*` edge proxy accepts only an allow-listed path pattern.
- See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Local development

```bash
# run the pipeline against a data directory (downloads from MYFAH)
cd pipeline && python3 -m cpo_pipeline gr --data-dir ../data-local

# or against files you already have
python3 -m cpo_pipeline gr --data-dir ../data-local --static-file static.zip --dynamic-file dynamic.zip

# tests
python3 -m unittest discover -s tests -v

# preview the site with that data
python3 ../scripts/dev_server.py --data ../data-local --port 8080
```

## Licence

Code: MIT (see [LICENSE](LICENSE)). MapLibre GL JS is BSD-3 (see `site/vendor/LICENSE-maplibre-gl.txt`).
Data: republished from official public registries; attribute both cpo.today and the originating registry.
