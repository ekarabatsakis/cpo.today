# Security policy

cpo.today republishes public registry data and stores nothing about visitors. Even so, we take the integrity of the pipeline and the site seriously.

## Reporting a vulnerability

Please email **security@cpo.today** (or open a private security advisory on GitHub). Include steps to reproduce. We aim to acknowledge within 3 working days.

Please do not open public issues for security reports.

## Scope

- The data pipeline (`pipeline/`) and its GitHub Actions workflows
- The website (`site/`) and the `/data/*` edge proxy (`worker/`)
- The published data on the `data` branch (for example, a way to inject content into it)

Out of scope: the upstream registries themselves (report those to the operating ministry), and denial of service against public CDNs.

## Design notes for reviewers

- The only credential in the system is the ephemeral `GITHUB_TOKEN` of the fetch workflow, scoped to `contents: write`.
- All downloads are capped and validated before parsing; archives are inspected for member count, name and declared size before inflation.
- The site ships a strict CSP (`default-src 'none'`), uses no inline script or style, and builds all DOM text via `textContent`.
- The edge function proxies only paths matching a strict allow-list to the `data` branch of this repository.
