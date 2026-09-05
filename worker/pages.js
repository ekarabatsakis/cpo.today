// Server-rendered HTML for crawlers, AI engines and people who land without JS:
//   /countries/          index of integrated countries with headline figures
//   /countries/<cc>/     per-country page: figures, operators, source, licence
//   /sitemap.xml         dynamic, with last-modified from the data
//   /llms.txt            plain-text guide for AI search engines and agents
// All figures come from the published data branch (small files only) and are
// cached at the edge for 5 minutes. Every value is HTML-escaped.

const UPSTREAM = "https://raw.githubusercontent.com/ekarabatsakis/cpo.today/data/";
const SITE = "https://cpo.today";
const TTL = 300;
const CSP = "default-src 'none'; style-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const int = (n) => (n == null ? "–" : Number(n).toLocaleString("en-GB"));
const pct = (n) => (n == null ? "–" : `${Number(n).toFixed(n < 10 ? 1 : 0)}%`);
const flag = (cc) => String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

async function getData(path, ctx) {
  const key = new Request(`${SITE}/__pages_cache__/${path}`, { method: "GET" });
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit.json();
  const res = await fetch(UPSTREAM + path, { headers: { "User-Agent": "cpo.today-pages/1.0" }, cf: { cacheTtl: TTL } });
  if (!res.ok) return null;
  const text = await res.text();
  ctx.waitUntil(cache.put(key, new Response(text, { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${TTL}` } })));
  return JSON.parse(text);
}

function page({ title, description, canonical, body, jsonld, extraHead = "" }) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/pages.css">
<meta property="og:type" content="website">
<meta property="og:site_name" content="cpo.today">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SITE}/og.png">
${extraHead}
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>` : ""}
</head>
<body>
<header class="ph"><a class="brand" href="/"><span class="mark">⚡</span> cpo<span class="dot">.</span>today</a><nav><a href="/">Live map</a><a href="/countries/">Countries</a><a href="/about/">About</a></nav></header>
<main class="pm">
${body}
</main>
<footer class="pf"><p>cpo.today republishes official national charging registries unchanged, every 10 minutes, for statistical purposes. Errors in the data must be raised with the operator or the responsible authority. Questions: <a href="mailto:ask@cpo.today">ask@cpo.today</a>.</p></footer>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": `public, max-age=${TTL}, stale-while-revalidate=600`,
      "Content-Security-Policy": CSP,
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    },
  });
}

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=60" } });
}

const modeText = (c) => (c.live === false ? "inventory only (the registry publishes no live status)" : "live status every 10 minutes");

export async function countriesIndex(ctx) {
  const index = await getData("index.json", ctx);
  if (!index) return notFound();
  const cs = index.countries;
  const totalEvses = cs.reduce((n, c) => n + (c.evses || 0), 0);
  const live = cs.filter((c) => c.live !== false);
  const rows = cs.map((c) => `<tr><td><a href="/countries/${c.code.toLowerCase()}/">${flag(c.code)} ${esc(c.name)}</a></td><td class="num">${int(c.locations)}</td><td class="num">${int(c.evses)}</td><td>${c.live === false ? "Inventory only" : "Live"}</td><td>${esc(c.source_name)}</td></tr>`).join("");
  const body = `<h1>Public EV charging networks by country</h1>
<p class="lead">cpo.today aggregates <strong>${int(totalEvses)} charge points</strong> at ${int(cs.reduce((n, c) => n + (c.locations || 0), 0))} locations across ${cs.length} European countries, taken unchanged from official national registries and refreshed every 10 minutes. ${live.length} of them publish live availability.</p>
<table class="t"><thead><tr><th>Country</th><th class="num">Locations</th><th class="num">Charge points</th><th>Mode</th><th>Official source</th></tr></thead><tbody>${rows}</tbody></table>
<p>Open the <a href="/">live map</a> to filter by operator, power and connector, compare operators, and follow availability trends. All underlying data is published as open JSON under <code>/data/</code>; see the <a href="https://github.com/ekarabatsakis/cpo.today/blob/main/docs/DATA.md">schema</a>.</p>`;
  return page({
    title: "EV charging networks by country - cpo.today",
    description: `${int(totalEvses)} public EV charge points in ${cs.length} European countries from official registries, refreshed every 10 minutes. Locations, operators and live availability per country.`,
    canonical: `${SITE}/countries/`,
    body,
    jsonld: {
      "@context": "https://schema.org", "@type": "ItemList", "name": "EV charging networks by country",
      "itemListElement": cs.map((c, i) => ({ "@type": "ListItem", "position": i + 1, "url": `${SITE}/countries/${c.code.toLowerCase()}/`, "name": c.name })),
    },
  });
}

export async function countryPage(cc, ctx) {
  const index = await getData("index.json", ctx);
  const c = index && index.countries.find((x) => x.code.toLowerCase() === cc);
  if (!c) return notFound();
  const ops = await getData(`${c.path}/operators.json`, ctx);
  const meta = await getData(`${c.path}/meta.json`, ctx);
  const t = (ops && ops.totals) || {};
  const live = c.live !== false;
  const st = t.status || {};
  const known = (t.evses || 0) - (st.U || 0);
  const opRows = ((ops && ops.operators) || []).slice(0, 40).map((o) => `<tr><td>${esc(o.name)}</td><td class="num">${int(o.locations)}</td><td class="num">${int(o.evses)}</td><td class="num">${int(o.dc_evses)}</td>${live ? `<td class="num">${pct(o.avail_pct)}</td><td class="num">${pct(o.charging_pct)}</td><td class="num">${pct(o.down_pct)}</td>` : ""}<td class="num">${o.median_kwh_price != null ? Number(o.median_kwh_price).toFixed(2) : "–"}</td></tr>`).join("");
  const hw = Object.values((t.hardware || {})).filter((h) => h.name !== "Not declared").sort((a, b) => b.n - a.n).slice(0, 8);
  const when = c.dynamic_ts || c.static_ts || index.generated;
  const body = `<h1>${flag(c.code)} Public EV charging in ${esc(c.name)}</h1>
<p class="lead">${esc(c.name)} has <strong>${int(t.evses)} public charge points</strong> at ${int(t.locations)} locations, operated by ${int(t.operators)} operators, according to ${esc(c.source_name)}. ${live ? `Right now ${int(st.A)} are available, ${int(st.C)} in use and ${int((st.O || 0) + (st.I || 0))} out of service (${pct(known ? 100 * (st.A || 0) / known : null)} availability among points with a known status).` : "This registry publishes the inventory only; live availability is not available for this country."} Data as of ${esc(String(when).replace("T", " ").replace("Z", " UTC"))}.</p>
<div class="kpis"><div><span>Locations</span><strong>${int(t.locations)}</strong></div><div><span>Charge points</span><strong>${int(t.evses)}</strong></div><div><span>DC charge points</span><strong>${int(t.dc_evses)}</strong></div><div><span>Installed capacity</span><strong>${t.kw_total ? `${(t.kw_total / 1000).toFixed(0)} MW` : "–"}</strong></div>${live ? `<div><span>Available now</span><strong>${int(st.A)}</strong></div><div><span>In use now</span><strong>${int(st.C)}</strong></div>` : ""}</div>
<h2>Operators</h2>
<table class="t"><thead><tr><th>Operator</th><th class="num">Locations</th><th class="num">Charge points</th><th class="num">DC</th>${live ? `<th class="num">Available</th><th class="num">In use</th><th class="num">Down</th>` : ""}<th class="num">Median price/kWh</th></tr></thead><tbody>${opRows}</tbody></table>
${hw.length ? `<h2>Charger hardware declared</h2><ul class="hw">${hw.map((h) => `<li><strong>${esc(h.name)}</strong> ${int(h.n)} charge points${h.models && h.models.length ? ` <span class="muted">(${esc(h.models.slice(0, 4).join(", "))})</span>` : ""}</li>`).join("")}</ul>` : ""}
<h2>Source and terms</h2>
<p>Source: <a href="${esc(c.source_url)}" rel="noopener">${esc(c.source_name)}</a>. ${meta && meta.licence ? `Licence: ${esc(meta.licence)}. ` : ""}Refreshed ${live ? "every 10 minutes" : `every ${Math.round((c.refresh_minutes || 1440) / 60)} hours`}. cpo.today does not alter the data; report errors to the operator or the authority. Machine-readable files: <a href="/data/${c.path}/points.json">points</a>, <a href="/data/${c.path}/operators.json">operators</a>${live ? `, <a href="/data/${c.path}/status.json">live status</a>` : ""} (JSON).</p>
<p><a class="btn" href="/#${c.code.toLowerCase()}">Open ${esc(c.name)} on the live map</a></p>`;
  const description = `${int(t.evses)} public EV charge points at ${int(t.locations)} locations in ${c.name}, ${int(t.operators)} operators, ${live ? `live availability` : "inventory"} from ${c.source_name}. Refreshed every 10 minutes by cpo.today.`;
  return page({
    title: `EV charging in ${c.name}: ${int(t.evses)} charge points, ${int(t.operators)} operators - cpo.today`,
    description, canonical: `${SITE}/countries/${cc}/`, body,
    jsonld: {
      "@context": "https://schema.org", "@type": "Dataset",
      "name": `Public EV charging infrastructure in ${c.name}`,
      "description": description,
      "url": `${SITE}/countries/${cc}/`,
      "license": meta && meta.licence ? meta.licence : "Open data of the national registry",
      "creator": { "@type": "Organization", "name": "cpo.today", "url": SITE },
      "isBasedOn": c.source_url,
      "temporalCoverage": when,
      "spatialCoverage": { "@type": "Place", "name": c.name },
      "distribution": [
        { "@type": "DataDownload", "encodingFormat": "application/json", "contentUrl": `${SITE}/data/${c.path}/points.json` },
        { "@type": "DataDownload", "encodingFormat": "application/json", "contentUrl": `${SITE}/data/${c.path}/operators.json` },
      ],
      "variableMeasured": ["locations", "charge points", "operators", live ? "availability" : "inventory"],
    },
  });
}

export async function sitemap(ctx) {
  const index = await getData("index.json", ctx);
  const cs = (index && index.countries) || [];
  const urls = [
    { loc: `${SITE}/`, changefreq: "always", lastmod: index && index.generated },
    { loc: `${SITE}/countries/`, changefreq: "hourly", lastmod: index && index.generated },
    { loc: `${SITE}/about/`, changefreq: "monthly" },
    ...cs.map((c) => ({ loc: `${SITE}/countries/${c.code.toLowerCase()}/`, changefreq: "hourly", lastmod: c.dynamic_ts || c.static_ts })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${esc(u.lastmod)}</lastmod>` : ""}<changefreq>${u.changefreq}</changefreq></url>`).join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": `public, max-age=${TTL}` } });
}

export async function llmsTxt(ctx) {
  const index = await getData("index.json", ctx);
  const cs = (index && index.countries) || [];
  const txt = `# cpo.today

> Live, open map and analytics of public EV charging networks in Europe, built only from official national charging registries and national access points, refreshed every 10 minutes. Operated as an open, free public resource.

## What it is
- One map and one data model for every public charge point published by official registries (OCPI, DATEX II, CSV sources), normalised and republished unchanged.
- Per country: locations, charge points (EVSEs), connectors, power, operators, tariffs where published, hardware manufacturer where declared, and live availability where the registry publishes it.
- Countries covered now: ${cs.map((c) => `${c.name} (${c.live === false ? "inventory only" : "live"}, source: ${c.source_name})`).join("; ")}.
- Data is collected for statistical purposes; cpo.today does not verify or edit it. Errors must be reported to the operator or the responsible national authority.

## Pages
- Live map: ${SITE}/
- Countries index: ${SITE}/countries/
${cs.map((c) => `- ${c.name}: ${SITE}/countries/${c.code.toLowerCase()}/`).join("\n")}
- About and accuracy statement: ${SITE}/about/

## Open data (JSON, no key required)
- Index of countries and freshness: ${SITE}/data/index.json
- Per country <cc> (lower case): ${SITE}/data/<cc>/points.json (map layer), ${SITE}/data/<cc>/operators.json (per-operator statistics), ${SITE}/data/<cc>/status.json (live status), ${SITE}/data/<cc>/locations/<shard>.json (full inventory), ${SITE}/data/<cc>/history/YYYY-MM-DD.jsonl (10-minute history), ${SITE}/data/<cc>/events/YYYY-MM-DD.jsonl (status transitions)
- Schema: https://github.com/ekarabatsakis/cpo.today/blob/main/docs/DATA.md

## Citing
Cite as "cpo.today, data from <registry name>" with the page URL and the timestamp shown on the page. Contact: ask@cpo.today
`;
  return new Response(txt, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": `public, max-age=${TTL}` } });
}
