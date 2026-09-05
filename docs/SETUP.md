# Setup and operations

Everything below is a one-time setup. After it, the system runs itself.

## 1. GitHub (already done by the pipeline)

- Code lives on `main`. Data is published to the orphan branch `data` by the workflow **Fetch Greece (MYFAH)** (`.github/workflows/fetch-gr.yml`), scheduled every 10 minutes.
- The first run creates the `data` branch. You can trigger it by hand: *Actions → Fetch Greece (MYFAH) → Run workflow*.
- Recommended repository settings (Settings → Actions → General): *Workflow permissions: Read repository contents and packages permissions*. The workflow requests `contents: write` explicitly, which is allowed under that default.
- Recommended branch protection for `main`: require the CI workflow to pass, require a pull request.

Scheduled GitHub Actions can be delayed by a few minutes under load, and are paused after 60 days without repository activity on public repos; the data commits themselves count as activity, so this does not affect cpo.today.

## 2. Cloudflare Pages

1. Cloudflare dashboard → *Workers & Pages* → *Create* → *Pages* → *Connect to Git* → choose `ekarabatsakis/cpo.today`.
2. Build settings:
   - Production branch: `main`
   - Framework preset: *None*
   - Build command: *(leave empty)*
   - Build output directory: `site`
   - Root directory: `/` (default). The `functions/` folder at the repository root is picked up automatically and becomes `/data/*`.
3. Deploy. You get a `*.pages.dev` URL immediately.
4. *Custom domains* → add `cpo.today` (and `www.cpo.today`). Because the zone is already on Cloudflare, the DNS records are created for you.
5. Under *Settings → Builds & deployments*, set **Preview branches** to *None* (or only `main`) so the 10-minute data commits do not trigger builds. They land on the `data` branch, which is not the production branch, so by default they do not build anyway.

### Cloudflare zone settings worth enabling (Security / SSL)

- SSL/TLS: *Full (strict)*; *Always Use HTTPS*; *HSTS* is already sent by the site headers, enable it at the zone once you are confident.
- *Security → Settings*: Bot Fight Mode on; a rate-limiting rule on `/data/*` (for example 300 requests per minute per IP) is sensible once traffic grows.
- *Speed → Optimization*: leave Rocket Loader **off** (it injects inline script and would violate the site's CSP). Auto Minify is fine.
- *Caching*: default. The site sends its own `Cache-Control` headers.

## 3. Verify

- `https://cpo.today/data/index.json` returns JSON with `"countries"`.
- The header of the site shows *Live · status HH:MM UTC*.
- Actions tab shows green runs every 10 minutes; each run's summary lists counts and warnings.

## 4. Day-to-day

- **Upstream outage**: the pipeline keeps the last good data, records a warning in `<cc>/meta.json`, and the site header turns amber after 35 minutes without a new status file.
- **Bad snapshot**: a static file that lost more than 30% of locations is rejected (see `meta.json → static.rejected`). Re-run with *force_static* once the registry is healthy.
- **Adding a country**: add `pipeline/cpo_pipeline/sources/<cc>_<source>.py` with `normalize_static` / `normalize_dynamic`, a `run_<cc>.py`, a workflow, and the country appears in `index.json` automatically; the site needs no change.
- **Repository size**: see *Growth and retention* in [DATA.md](DATA.md).

## 5. Optional upgrades

- **Exact 10-minute cadence**: GitHub cron can drift by several minutes. A Cloudflare Worker with a Cron Trigger (`*/10 * * * *`) can call the *workflow_dispatch* API to start the run precisely, or the pipeline can be ported to a Worker writing to R2. Not needed for launch.
- **Analytics**: Cloudflare Web Analytics is cookie-less and works with the CSP if you add `https://static.cloudflareinsights.com` to `script-src` and `connect-src`.
- **Alerting**: GitHub → Settings → Notifications → *Actions* failures email you; or a Cloudflare Health Check on `https://cpo.today/data/gr/status.json`.
