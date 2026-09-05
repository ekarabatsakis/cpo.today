# Setup and operations

Everything below is a one-time setup. After it, the system runs itself.

## 1. GitHub (already done by the pipeline)

- Code lives on `main`. Data is published to the orphan branch `data` by the workflow **Fetch registries** (`.github/workflows/fetch.yml`), scheduled every 10 minutes. It refreshes every integrated country in sequence and commits once; a failing registry never blocks the others.
- **Probe endpoints** (`.github/workflows/probe.yml`) is a manual, read-only helper: give it a list of URLs and it records status, headers, sizes and samples, which is how new registries are evaluated before writing a source module.
- The first run creates the `data` branch. You can trigger it by hand: *Actions → Fetch Greece (MYFAH) → Run workflow*.
- Recommended repository settings (Settings → Actions → General): *Workflow permissions: Read repository contents and packages permissions*. The workflow requests `contents: write` explicitly, which is allowed under that default.
- Recommended branch protection for `main`: require the CI workflow to pass, require a pull request.
- Dependabot keeps the GitHub Actions and the `wrangler` dev dependency current via pull requests.

Scheduled GitHub Actions can be delayed by a few minutes under load, and are paused after 60 days without repository activity on public repos; the data commits themselves count as activity, so this does not affect cpo.today.

## 2. Cloudflare Workers (static assets + the /data proxy)

The site deploys as one Worker: `wrangler.jsonc` serves `site/` as static assets and `worker/index.js` answers `/data/*`.

1. Cloudflare dashboard → *Workers & Pages* → *Create application* → **Continue with GitHub** → choose `ekarabatsakis/cpo.today`.
2. Build configuration:
   - Project name: `cpo-today`
   - Production branch: `main`
   - Build command: *(leave empty)*
   - Deploy command: `npx wrangler deploy` (the default)
   - **Untick "Builds for non-production branches"**. The `data` branch receives a commit every 10 minutes; each one would otherwise start a build.
   - Root directory: `/`
   - API token: *Create new token* (Cloudflare creates a scoped token for the build system).
3. *Create and deploy*. The first build installs wrangler from `package.json` and deploys; you get a `cpo-today.<account>.workers.dev` URL.
4. Open the Worker → *Settings* → *Domains & Routes* → *Add* → **Custom domain** → `cpo.today`. Repeat for `www.cpo.today`. DNS records and certificates are created for you because the zone is already on Cloudflare. `www` redirects to the apex via `site/_redirects`.

### Cloudflare zone settings worth enabling (Security / SSL)

- SSL/TLS: *Full (strict)*; *Always Use HTTPS*. HSTS is already sent by the site headers.
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
- **Adding a country**: add `pipeline/cpo_pipeline/sources/<cc>_<source>.py` exposing a `SourceSpec`, register it in `sources/__init__.py` and in the workflow's country list; the country appears in `index.json` and on the site automatically. See `docs/ADDING_A_COUNTRY.md`.
- **Repository size**: see *Growth and retention* in [DATA.md](DATA.md).

## 5. Optional upgrades

- **Exact 10-minute cadence**: GitHub cron can drift by several minutes. A Cloudflare Worker with a Cron Trigger (`*/10 * * * *`) can call the *workflow_dispatch* API to start the run precisely, or the pipeline can be ported to a Worker writing to R2. Not needed for launch.
- **Analytics**: Cloudflare Web Analytics is cookie-less and works with the CSP if you add `https://static.cloudflareinsights.com` to `script-src` and `connect-src`.
- **Alerting**: GitHub → Settings → Notifications → *Actions* failures email you; or a Cloudflare Health Check on `https://cpo.today/data/gr/status.json`.
