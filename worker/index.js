// cpo.today Worker: static assets from ./site plus the /data/* proxy.
import { handleDataGet, handleDataOptions, methodNotAllowed } from "./data-proxy.js";
import { countriesIndex, countryPage, llmsTxt, sitemap } from "./pages.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    const p = url.pathname;
    if (request.method === "GET" || request.method === "HEAD") {
      if (p === "/sitemap.xml") return sitemap(ctx);
      if (p === "/llms.txt") return llmsTxt(ctx);
      if (p === "/countries") return Response.redirect(`${url.origin}/countries/`, 301);
      if (p === "/countries/") return countriesIndex(ctx);
      const m = /^\/countries\/([a-z]{2})\/?$/.exec(p);
      if (m) return p.endsWith("/") ? countryPage(m[1], ctx) : Response.redirect(`${url.origin}${p}/`, 301);
    }
    if (url.pathname.startsWith("/data/")) {
      const path = url.pathname.slice("/data/".length);
      if (request.method === "GET" || request.method === "HEAD") return handleDataGet(request, ctx, path);
      if (request.method === "OPTIONS") return handleDataOptions();
      return methodNotAllowed();
    }
    return env.ASSETS.fetch(request);
  },
};
