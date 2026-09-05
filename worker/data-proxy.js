// Serves the `data` branch of the GitHub repo from cpo.today/data/* so the
// site stays same-origin (strict CSP, no CORS).
//
// Only a tight allow-list of paths is proxied; responses are cached at the
// edge for 60 seconds, which is well inside the 10-minute refresh cadence.

const UPSTREAM = "https://raw.githubusercontent.com/ekarabatsakis/cpo.today/data/";
const SAFE_PATH = /^[a-z0-9][a-z0-9_\-]*(?:\/[a-z0-9][a-z0-9_\-]*)*\.(?:json|jsonl)$/;
const EDGE_TTL = 60;

export async function handleDataGet(request, ctx, path) {
  if (path.length > 120 || !SAFE_PATH.test(path)) {
    return new Response("Not found", { status: 404, headers: baseHeaders("text/plain") });
  }
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).origin + "/data/" + path, { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let upstream;
  try {
    upstream = await fetch(UPSTREAM + path, {
      headers: { "User-Agent": "cpo.today-edge/1.0", Accept: "application/json, text/plain" },
      cf: { cacheTtl: EDGE_TTL, cacheEverything: true },
    });
  } catch (e) {
    return new Response("Upstream unavailable", { status: 502, headers: baseHeaders("text/plain") });
  }
  if (!upstream.ok) {
    const status = upstream.status === 404 ? 404 : 502;
    return new Response(status === 404 ? "Not found" : "Upstream error", { status, headers: baseHeaders("text/plain") });
  }
  const type = path.endsWith(".jsonl") ? "application/x-ndjson; charset=utf-8" : "application/json; charset=utf-8";
  const headers = baseHeaders(type);
  headers.set("Cache-Control", `public, max-age=${EDGE_TTL}, stale-while-revalidate=120`);
  headers.set("Access-Control-Allow-Origin", "*");
  const lm = upstream.headers.get("Last-Modified");
  if (lm) headers.set("Last-Modified", lm);
  const res = new Response(upstream.body, { status: 200, headers });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

export function handleDataOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Accept",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export function methodNotAllowed() {
  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, OPTIONS" } });
}

function baseHeaders(contentType) {
  return new Headers({
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
}
