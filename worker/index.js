// cpo.today Worker: static assets from ./site plus the /data/* proxy.
import { handleDataGet, handleDataOptions, methodNotAllowed } from "./data-proxy.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
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
