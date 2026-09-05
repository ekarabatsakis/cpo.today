# cpo.today

**Every public EV charge point from official national registries, on one open map, refreshed every 10 minutes.**

cpo.today exists so that charge point operators (CPOs), investors, fleets, planners and drivers can see, compare and analyse charging networks from a true signal: the data operators are legally required to report to their national registry, not marketing claims.

- Live site: https://cpo.today
- Data (open, JSON): https://cpo.today/data/index.json and the [`data` branch](https://github.com/ekarabatsakis/cpo.today/tree/data) of this repository
- Schema: [docs/DATA.md](docs/DATA.md)
- Deployment and operations: [docs/SETUP.md](docs/SETUP.md)

## Countries

| Country | Source | Format | Inventory | Live status | Since |
|---|---|---|---|---|---|
| Greece | [MYFAH](https://electrokinisi.yme.gov.gr/public/HelpMyfah/PublicData/), Hellenic Ministry of Infrastructure and Transport | ZIP/JSON (OCPI 2.2) | daily | every 10 min | 2026-09 |
| Lithuania | [Via Lietuva](https://ev.vialietuva.lt/en/data-provision) | OCPI 2.3.0 API | every 10 min | every 10 min | 2026-09 |
| Netherlands | [NDW](https://docs.ndw.nu/en/data-uitwisseling/interface-beschrijvingen/dafne-api/) | OCPI JSON (gzip) | every 10 min | every 10 min | 2026-09 |
| France | [Base nationale des IRVE](https://transport.data.gouv.fr/datasets?locale=en&type=charging-stations), transport.data.gouv.fr | CSV (IRVE schema) | daily | none published | 2026-09 |

All 28 EU/UK registries and their current status are listed in `site/coverage.json` and on the site's **Coverage** tab. Adding a country is one module under `pipeline/cpo_pipeline/sources/` (see [docs/ADDING_A_COUNTRY.md](docs/ADDING_A_COUNTRY.md)).

## How it works

```
 national registries  ──►  GitHub Actions, every 10 min  ──►  `data` branch (compact JSON)
 (OCPI, zip, gz, API)      pipeline/ (stdlib Python)              │
                           validate · normalise · diff            ▼
                                                        Cloudflare Worker ◄──  site/ (static assets, MapLibre)
                                                        /data/* answered by worker/ (edge proxy)
```

1. **Fetch.** A scheduled workflow downloads the registry's static (daily) and dynamic (10-minute) files with conditional requests, so unchanged files cost the ministry nothing.
2. **Validate.** Size caps, zip inspection, envelope checks, bounding-box checks, duplicate detection, and a "shrink guard" that refuses a snapshot that lost more than 30% of the network overnight.
3. **Normalise.** OCPI-style documents become a compact, cross-country model (`points.json` for the map, sharded `locations/`, `status.json`, `tariffs.json`), plus per-tick history, status-change events, daily inventory snapshots and an operator comparison table.
4. **Publish.** Results are committed to the orphan `data` branch. Code history on `main` stays clean; data history is a full audit trail.
5. **Present.** The site is static HTML/CSS/JS with a vendored MapLibre build, a strict Content Security Policy and no third-party scripts, served by a Cloudflare Worker that also proxies `/data/*` to the data branch. It reads only the published data files.

## Security posture

- No secrets anywhere: the workflow uses the repository's own `GITHUB_TOKEN` with `contents: write` and nothing else.
- Pipeline is standard-library Python; there is no dependency tree to audit.
- Every network byte is capped, archives are inspected before extraction, only `https://` is accepted.
- Site: CSP with `default-src 'none'`, no inline scripts or styles, all DOM text set via `textContent`, vendored libraries, `X-Frame-Options: DENY`, HSTS.
- The `/data/*` edge proxy (`worker/`) accepts only an allow-listed path pattern.
- See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Local development

```bash
# run the pipeline for one country against a data directory (downloads from the registry)
cd pipeline && python3 -m cpo_pipeline gr --data-dir ../data-local     # or lt, nl

# or against files you already have
python3 -m cpo_pipeline gr --data-dir ../data-local --static-file static.zip --dynamic-file dynamic.zip

# tests
python3 -m unittest discover -s tests -v

# preview the site with that data (no Cloudflare account needed)
python3 ../scripts/dev_server.py --data ../data-local --port 8080

# or run the real Worker locally (needs Node; proxies /data/* to the live data branch)
cd .. && npm install && npm run dev
```

## Licence

Code: MIT (see [LICENSE](LICENSE)). MapLibre GL JS is BSD-3 (see `site/vendor/LICENSE-maplibre-gl.txt`).
Data: republished from official public registries; attribute both cpo.today and the originating registry.
