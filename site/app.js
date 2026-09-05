/* cpo.today - live map and analytics of public EV charging networks.
 * Plain browser JS, no build step. All DOM text is set via textContent. */
(() => {
  "use strict";

  const CONFIG = {
    dataBase: "/data",
    refreshMs: 5 * 60 * 1000,
    staleAfterMs: 35 * 60 * 1000,
    styles: {
      light: "https://tiles.openfreemap.org/styles/positron",
      dark: "https://tiles.openfreemap.org/styles/dark",
    },
    styleTimeoutMs: 9000,
    defaultCenter: [23.9, 38.6],
    defaultZoom: 5.6,
  };

  const COVERAGE_LABEL = { live: "Live", static: "Inventory", public: "Public feed", public_static: "Public, static", partial: "Partial", registration: "Registration", pending: "Pending", web_only: "Web only", cpo_api: "Operator APIs" };
  const flag = (cc) => String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  const STATUS_LABEL = { A: "Available", C: "Charging", B: "Blocked", R: "Reserved", I: "Inoperative", O: "Out of order", U: "Unknown", P: "Planned", M: "Removed", X: "Other" };
  const CONN_LABEL = { T2: "Type 2", CCS2: "CCS", CHADEMO: "CHAdeMO", T1: "Type 1", CCS1: "CCS1", DOM: "Domestic", IND: "Industrial", TESLA_S: "Tesla", TESLA_R: "Tesla" };
  const PT_LABEL = { AC1: "AC 1-ph", AC2: "AC 2-ph", AC3: "AC 3-ph", DC: "DC", NA: "" };
  const POWER_CLASS = (kw) => kw == null ? "na" : kw < 11 ? "slow" : kw < 43 ? "ac" : kw < 150 ? "fast" : "ultra";
  const DOWN = new Set(["I", "O"]);
  const HOLD = new Set(["B", "R"]);

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const fmtInt = (n) => n == null ? "–" : new Intl.NumberFormat("en-GB").format(n);
  const fmtPct = (n) => n == null ? "–" : `${n.toFixed(n < 10 ? 1 : 0)}%`;
  const fmtKw = (kw) => kw == null ? "–" : kw >= 1000 ? `${(kw / 1000).toFixed(1)} MW` : `${Math.round(kw)} kW`;
  const fmtTime = (iso) => iso ? iso.slice(11, 16) : "–";
  const fmtDateTime = (iso) => iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : "–";
  const isDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const state = {
    index: null,
    coverage: null,
    country: null,
    meta: null,
    points: [],          // compact location rows from points.json (see DATA.md)
    operators: {},       // id -> {id, name}
    opTable: null,       // operators.json (server-side aggregates incl. prices)
    status: null,        // {ts, locations: {lid: "ACU…"}}
    tariffs: null,       // lazily loaded tariffs.json
    shards: 1,
    shardCache: new Map(),
    history: [],         // tick summaries, oldest first
    filters: { op: "", st: "", pw: "", cn: "", q: "" },
    sort: { key: "evses", dir: -1 },
    range: 24,
    selected: null,
    filtered: [],
    lastFetch: 0,
    map: null,
    mapReady: false,
    styleOk: false,
    popup: null,
    refreshTimer: null,
  };

  // ---------------------------------------------------------------- data ----
  async function getJSON(path, { revalidate = false } = {}) {
    const res = await fetch(`${CONFIG.dataBase}/${path}`, { cache: revalidate ? "no-cache" : "default", credentials: "omit" });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  }
  async function getJSONL(path) {
    const res = await fetch(`${CONFIG.dataBase}/${path}`, { cache: "no-cache", credentials: "omit" });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    const text = await res.text();
    const out = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch (e) { /* skip torn line */ }
    }
    return out;
  }
  const dayStr = (d) => d.toISOString().slice(0, 10);

  async function loadHistory(path, hours) {
    const days = Math.ceil(hours / 24) + 1;
    const now = new Date();
    const jobs = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      jobs.push(getJSONL(`${path}/history/${dayStr(d)}.jsonl`).catch(() => []));
    }
    const chunks = await Promise.all(jobs);
    const cutoff = now.getTime() - hours * 3600000;
    return chunks.flat().filter((t) => Date.parse(t.ts) >= cutoff);
  }

  async function loadCountry(code) {
    const c = state.index.countries.find((x) => x.code === code) || state.index.countries[0];
    state.country = c;
    state.shardCache = new Map();
    state.tariffs = null;
    setFreshness("loading", `Loading ${c.name}…`);
    const [meta, pts, status, opTable, history] = await Promise.all([
      getJSON(`${c.path}/meta.json`, { revalidate: true }),
      getJSON(`${c.path}/points.json`, { revalidate: true }),
      getJSON(`${c.path}/status.json`, { revalidate: true }),
      getJSON(`${c.path}/operators.json`, { revalidate: true }).catch(() => null),
      loadHistory(c.path, 48),
    ]);
    state.meta = meta;
    state.shards = pts.shards || 1;
    state.operators = Object.fromEntries(pts.operators.map((o) => [o.id, o]));
    state.points = pts.points.map((r) => ({
      id: r[0], lon: r[1], lat: r[2], op: (pts.operators[r[3]] || {}).id || "?", name: r[4] || "", city: r[5] || "",
      n: r[6], dc: r[7], maxKw: r[8] || null, kmask: r[9], cmask: r[10], flags: r[11],
      search: `${r[4] || ""} ${r[5] || ""} ${r[0]} ${(pts.operators[r[3]] || {}).name || ""}`.toLowerCase(),
    }));
    state.classBits = pts.class_bits || { slow: 1, ac: 2, fast: 4, ultra: 8, na: 16 };
    state.connBits = pts.conn_bits || { T2: 1, CCS2: 2, CHADEMO: 4 };
    state.opTable = opTable;
    state.status = status;
    state.history = history;
    state.lastFetch = Date.now();
    indexLocations();
    populateOperatorFilter();
    $("source-line").textContent = `Source: ${c.source_name}. Inventory ${fmtDateTime(pts.ts)}, status ${fmtDateTime(status.ts)}.`;
    applyFilters();
    fitCountry();
    scheduleRefresh();
    if (!$("view-coverage").hidden) renderCoverage();
  }

  async function refreshDynamic() {
    if (!state.country || document.hidden) return;
    const c = state.country;
    try {
      const [status, history, opTable] = await Promise.all([
        getJSON(`${c.path}/status.json`, { revalidate: true }),
        loadHistory(c.path, 48),
        getJSON(`${c.path}/operators.json`, { revalidate: true }).catch(() => state.opTable),
      ]);
      if (status.ts !== state.status.ts) {
        state.status = status;
        state.history = history;
        state.opTable = opTable;
        indexLocations();
        applyFilters();
      }
      state.lastFetch = Date.now();
      // Inventory changes daily; pick it up cheaply by comparing index timestamps.
      const idx = await getJSON("index.json", { revalidate: true }).catch(() => null);
      const entry = idx && idx.countries.find((x) => x.code === c.code);
      if (entry && entry.static_ts && entry.static_ts !== c.static_ts) {
        state.index = idx;
        await loadCountry(c.code);
        return;
      }
      updateFreshness();
    } catch (e) {
      setFreshness("error", "Refresh failed; showing last data");
    }
  }
  function scheduleRefresh() {
    clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(refreshDynamic, CONFIG.refreshMs);
  }

  // ------------------------------------------------------------ derived ----
  const STATUS_CLASS = (ch) => ch === "A" ? "a" : ch === "C" ? "c" : DOWN.has(ch) ? "d" : HOLD.has(ch) ? "h" : "u";

  function indexLocations() {
    const st = (state.status && state.status.locations) || {};
    for (const p of state.points) {
      const s = st[p.id] || "";
      let a = 0, c = 0, d = 0, u = 0, h = 0;
      for (let i = 0; i < p.n; i++) {
        const k = STATUS_CLASS(s[i] || "U");
        if (k === "a") a++; else if (k === "c") c++; else if (k === "d") d++; else if (k === "h") h++; else u++;
      }
      p.cnt = { a, c, d, u, h, n: p.n };
      p.st = a ? "A" : c ? "C" : d ? "D" : h ? "B" : "U";
      p.sts = s;
    }
  }

  function matches(loc, f) {
    if (f.op && loc.op !== f.op) return false;
    if (f.pw && !(loc.kmask & (state.classBits[f.pw] || 0))) return false;
    if (f.cn && !(loc.cmask & (state.connBits[f.cn] || 0))) return false;
    if (f.st) {
      if (f.st === "A" && !loc.cnt.a) return false;
      if (f.st === "C" && !loc.cnt.c) return false;
      if (f.st === "D" && !loc.cnt.d) return false;
      if (f.st === "U" && loc.cnt.u !== loc.cnt.n) return false;
    }
    if (f.q && !loc.search.includes(f.q)) return false;
    return true;
  }

  function applyFilters() {
    const f = state.filters;
    f.q = f.q.trim().toLowerCase();
    state.filtered = state.points.filter((l) => matches(l, f));
    renderKpis();
    renderOperators();
    renderTrends();
    renderMapData();
    updateFreshness();
    writeHash();
    const total = state.points.length;
    const n = state.filtered.length;
    $("filter-result").textContent = n === total ? `${fmtInt(total)} locations` : `${fmtInt(n)} of ${fmtInt(total)} locations match`;
  }

  // ------------------------------------------------------------ renders ----
  function renderKpis() {
    let locs = 0, evses = 0, a = 0, c = 0, d = 0, u = 0;
    const ops = new Set();
    for (const l of state.filtered) {
      locs++; evses += l.cnt.n; a += l.cnt.a; c += l.cnt.c; d += l.cnt.d; u += l.cnt.u; ops.add(l.op);
    }
    const known = evses - u;
    $("kpi-locations").textContent = fmtInt(locs);
    $("kpi-evses").textContent = fmtInt(evses);
    $("kpi-available").textContent = fmtInt(a);
    $("kpi-available-sub").textContent = known ? `${fmtPct(100 * a / known)} of known` : "";
    $("kpi-charging").textContent = fmtInt(c);
    $("kpi-charging-sub").textContent = known ? `${fmtPct(100 * c / known)} of known` : "";
    $("kpi-down").textContent = fmtInt(d);
    $("kpi-down-sub").textContent = known ? `${fmtPct(100 * d / known)} of known` : "";
    $("kpi-operators").textContent = fmtInt(ops.size);
  }

  function operatorRows() {
    // Table respects every filter except the operator filter itself, so the
    // list always shows all operators under the current slice.
    const f = { ...state.filters, op: "" };
    const rows = new Map();
    const priceOf = {};
    if (state.opTable) for (const o of state.opTable.operators) priceOf[o.id] = o.median_kwh_price;
    for (const l of state.points) {
      if (!matches(l, f)) continue;
      let r = rows.get(l.op);
      if (!r) {
        r = { id: l.op, name: (state.operators[l.op] || {}).name || l.op, locations: 0, evses: 0, dc: 0, a: 0, c: 0, d: 0, u: 0 };
        rows.set(l.op, r);
      }
      r.locations++; r.evses += l.n; r.dc += l.dc;
      r.a += l.cnt.a; r.c += l.cnt.c; r.d += l.cnt.d; r.u += l.cnt.u;
    }
    const out = [];
    for (const r of rows.values()) {
      const known = r.evses - r.u;
      r.dc_share = r.evses ? 100 * r.dc / r.evses : null;
      r.avail_pct = known ? 100 * r.a / known : null;
      r.charging_pct = known ? 100 * r.c / known : null;
      r.down_pct = known ? 100 * r.d / known : null;
      r.median_kwh_price = priceOf[r.id] != null ? priceOf[r.id] : null;
      out.push(r);
    }
    return out;
  }

  function renderOperators() {
    const rows = operatorRows();
    const { key, dir } = state.sort;
    rows.sort((x, y) => {
      const a = x[key], b = y[key];
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return (typeof a === "string" ? a.localeCompare(b) : a - b) * dir;
    });
    const tbody = $("ops-table").querySelector("tbody");
    tbody.replaceChildren();
    const maxEv = Math.max(1, ...rows.map((r) => r.evses));
    for (const r of rows) {
      const tr = el("tr");
      tr.dataset.op = r.id;
      if (state.filters.op === r.id) tr.classList.add("active");
      const name = el("td", "op-name", r.name);
      name.title = `${r.name} (${r.id})`;
      tr.append(name);
      tr.append(el("td", "num", fmtInt(r.locations)));
      const ev = el("td", "num");
      const bar = el("i", "bar"); bar.style.width = `${Math.max(2, Math.round(26 * r.evses / maxEv))}px`; bar.style.background = "var(--accent)";
      ev.append(bar, document.createTextNode(fmtInt(r.evses)));
      tr.append(ev);
      tr.append(el("td", "num", fmtPct(r.dc_share)));
      tr.append(el("td", "num", fmtPct(r.avail_pct)));
      tr.append(el("td", "num", fmtPct(r.charging_pct)));
      const dn = el("td", "num", fmtPct(r.down_pct));
      if (r.down_pct != null && r.down_pct >= 15) dn.style.fontWeight = "600";
      tr.append(dn);
      tr.append(el("td", "num", r.median_kwh_price != null ? r.median_kwh_price.toFixed(2) : "–"));
      tr.addEventListener("click", () => {
        $("f-operator").value = state.filters.op === r.id ? "" : r.id;
        state.filters.op = $("f-operator").value;
        applyFilters();
        if (state.filters.op) fitFiltered();
      });
      tbody.append(tr);
    }
    for (const th of $("ops-table").querySelectorAll("th")) {
      const b = th.querySelector("button");
      th.classList.toggle("sorted", b && b.dataset.sort === key);
      th.classList.toggle("asc", b && b.dataset.sort === key && dir === 1);
    }
  }

  // ------------------------------------------------------------- trends ----
  function trendSeries() {
    const op = state.filters.op;
    const cutoff = Date.now() - state.range * 3600000;
    const pts = [];
    for (const t of state.history) {
      const ts = Date.parse(t.ts);
      if (!(ts >= cutoff)) continue;
      const src = op ? (t.ops && t.ops[op]) : { s: t.n, kwc: t.kwc };
      if (!src) continue;
      const s = src.s || {};
      const total = Object.values(s).reduce((x, y) => x + y, 0);
      const known = total - (s.U || 0);
      pts.push({
        ts, iso: t.ts,
        charging: s.C || 0,
        kw: src.kwc || 0,
        down: (s.O || 0) + (s.I || 0),
        avail: known ? 100 * (s.A || 0) / known : null,
      });
    }
    return pts;
  }

  function renderTrends() {
    const pts = trendSeries();
    $("trend-scope").textContent = state.filters.op ? `${(state.operators[state.filters.op] || {}).name || state.filters.op}` : "National";
    drawChart($("chart-charging"), pts, "charging", { color: "var(--st-c)", fmt: fmtInt });
    drawChart($("chart-kw"), pts, "kw", { color: "var(--accent)", fmt: fmtKw });
    drawChart($("chart-down"), pts, "down", { color: "var(--st-d)", fmt: fmtInt });
    drawChart($("chart-avail"), pts, "avail", { color: "var(--st-a)", fmt: (v) => v == null ? "–" : `${v.toFixed(1)}%`, min: 0, max: 100 });
    const tbody = $("trend-table").querySelector("tbody");
    tbody.replaceChildren();
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      const tr = el("tr");
      tr.append(el("td", null, `${p.iso.slice(5, 10)} ${fmtTime(p.iso)}`), el("td", "num", fmtInt(p.charging)), el("td", "num", fmtInt(Math.round(p.kw))), el("td", "num", fmtInt(p.down)), el("td", "num", p.avail == null ? "–" : p.avail.toFixed(1)));
      tbody.append(tr);
    }
  }

  const SVG = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs) => { const n = document.createElementNS(SVG, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };

  function drawChart(fig, pts, key, opt) {
    const body = fig.querySelector(".chart-body");
    body.replaceChildren();
    const valid = pts.filter((p) => p[key] != null);
    if (valid.length < 2) {
      body.append(el("div", "chart-empty", "Not enough history yet. Data accumulates every 10 minutes."));
      return;
    }
    const W = Math.max(200, body.clientWidth || 360), H = body.clientHeight || 120;
    const padL = 36, padR = 58, padT = 8, padB = 18;
    const x0 = valid[0].ts, x1 = valid[valid.length - 1].ts;
    let lo = opt.min != null ? opt.min : Math.min(...valid.map((p) => p[key]));
    let hi = opt.max != null ? opt.max : Math.max(...valid.map((p) => p[key]));
    if (opt.min == null) lo = Math.min(lo, 0);
    if (hi === lo) hi = lo + 1;
    const nice = niceTicks(lo, hi, 3);
    lo = nice[0]; hi = nice[nice.length - 1];
    const sx = (t) => padL + (W - padL - padR) * (t - x0) / Math.max(1, x1 - x0);
    const sy = (v) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${fig.querySelector(".chart-title").textContent}: latest ${opt.fmt(valid[valid.length - 1][key])}` });

    const grid = svgEl("g", { class: "grid" });
    const axis = svgEl("g", { class: "axis" });
    for (const v of nice) {
      grid.append(svgEl("line", { x1: padL, x2: W - padR, y1: sy(v), y2: sy(v) }));
      const t = svgEl("text", { x: padL - 4, y: sy(v) + 3, "text-anchor": "end" });
      t.textContent = compact(v);
      axis.append(t);
    }
    svg.append(grid, axis);
    svg.append(svgEl("line", { class: "baseline", x1: padL, x2: W - padR, y1: sy(lo), y2: sy(lo) }));

    // x ticks: pick an hour step so labels don't collide
    const spanH = (x1 - x0) / 3600000;
    const stepH = spanH <= 7 ? 1 : spanH <= 26 ? 4 : 8;
    const first = new Date(x0); first.setUTCMinutes(0, 0, 0);
    for (let d = first.getTime(); d <= x1; d += 3600000) {
      const hh = new Date(d).getUTCHours();
      if (hh % stepH !== 0 || d < x0) continue;
      const t = svgEl("text", { x: sx(d), y: H - 4, "text-anchor": "middle" });
      t.textContent = `${String(hh).padStart(2, "0")}:00`;
      axis.append(t);
    }

    let dLine = "", dArea = `M${sx(valid[0].ts).toFixed(1)},${sy(lo).toFixed(1)}`;
    valid.forEach((p, i) => {
      const X = sx(p.ts).toFixed(1), Y = sy(p[key]).toFixed(1);
      dLine += `${i ? "L" : "M"}${X},${Y}`;
      dArea += `L${X},${Y}`;
    });
    dArea += `L${sx(x1).toFixed(1)},${sy(lo).toFixed(1)}Z`;
    svg.append(svgEl("path", { class: "area", d: dArea, fill: opt.color }));
    svg.append(svgEl("path", { class: "series", d: dLine, stroke: opt.color }));
    const last = valid[valid.length - 1];
    svg.append(svgEl("circle", { class: "marker", cx: sx(last.ts), cy: sy(last[key]), r: 4, fill: opt.color }));
    const lbl = svgEl("text", { class: "end-label", x: sx(last.ts) + 7, y: sy(last[key]) + 4 });
    lbl.textContent = opt.fmt(last[key]);
    svg.append(lbl);

    // hover layer: crosshair + tooltip
    const cross = svgEl("line", { class: "crosshair", x1: 0, x2: 0, y1: padT, y2: H - padB, visibility: "hidden" });
    const dot = svgEl("circle", { class: "marker", r: 4, fill: opt.color, visibility: "hidden" });
    const hit = svgEl("rect", { class: "hit", x: padL, y: 0, width: W - padL - padR, height: H });
    svg.append(cross, dot, hit);
    const tip = el("div", "tooltip"); tip.hidden = true;
    body.append(svg, tip);
    const show = (clientX) => {
      const rect = svg.getBoundingClientRect();
      const px = (clientX - rect.left) * W / rect.width;
      const t = x0 + (px - padL) / (W - padL - padR) * (x1 - x0);
      let best = valid[0];
      for (const p of valid) if (Math.abs(p.ts - t) < Math.abs(best.ts - t)) best = p;
      const X = sx(best.ts), Y = sy(best[key]);
      cross.setAttribute("x1", X); cross.setAttribute("x2", X); cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", X); dot.setAttribute("cy", Y); dot.setAttribute("visibility", "visible");
      tip.replaceChildren(el("strong", null, opt.fmt(best[key])), el("span", "tt-time", `${best.iso.slice(5, 10)} ${fmtTime(best.iso)} UTC`));
      tip.hidden = false;
      tip.style.left = `${X * rect.width / W}px`;
      tip.style.top = `${Y * rect.height / H}px`;
    };
    const hide = () => { cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); tip.hidden = true; };
    hit.addEventListener("pointermove", (ev) => show(ev.clientX));
    hit.addEventListener("pointerleave", hide);
    hit.setAttribute("tabindex", "0");
    hit.addEventListener("focus", () => show(svg.getBoundingClientRect().right - padR));
    hit.addEventListener("blur", hide);
  }
  function niceTicks(lo, hi, n) {
    const span = hi - lo;
    const raw = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const start = Math.floor(lo / step) * step, end = Math.ceil(hi / step) * step;
    const out = [];
    for (let v = start; v <= end + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }
  const compact = (v) => Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(v % 1000 ? 1 : 0)}k` : `${v}`;

  // ---------------------------------------------------------------- map ----
  function fallbackStyle() {
    return { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": cssVar("--surface-2") || "#eee" } }] };
  }

  function styleChain() {
    return isDark() ? [CONFIG.styles.dark, CONFIG.styles.light] : [CONFIG.styles.light];
  }

  function initMap() {
    const chain = styleChain();
    const map = new maplibregl.Map({
      container: "map",
      style: chain[0],
      center: CONFIG.defaultCenter,
      zoom: CONFIG.defaultZoom,
      minZoom: 3,
      maxZoom: 18,
      attributionControl: false,
      cooperativeGestures: false,
    });
    state.map = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: false }, trackUserLocation: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "Data: national registries via cpo.today" }), "bottom-right");

    const FALLBACK_MSG = "Basemap tiles unavailable, showing charge points only.";
    let pending = chain.slice(1);
    let styleTimer = null;
    const arm = () => { clearTimeout(styleTimer); styleTimer = setTimeout(nextStyle, CONFIG.styleTimeoutMs); };
    const nextStyle = () => {
      if (state.styleOk) return;
      clearTimeout(styleTimer); styleTimer = null;
      if (pending.length) { map.setStyle(pending.shift()); arm(); return; }
      note(FALLBACK_MSG);
      map.setStyle(fallbackStyle());
    };
    arm();
    map.on("error", (e) => {
      const m = (e && e.error && e.error.message) || "";
      if (!state.styleOk && /style|Failed to fetch|NetworkError|AJAXError|status/i.test(m)) nextStyle();
    });
    map.on("style.load", () => {
      const st = map.getStyle();
      if (!state.styleOk && st && st.sources && Object.keys(st.sources).length) {
        state.styleOk = true; clearTimeout(styleTimer); styleTimer = null; note(null);
      }
      addDataLayers();
      renderMapData();
    });
    map.on("load", () => { state.mapReady = true; });

    map.on("click", "clusters", (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
      if (!f) return;
      map.getSource("locations").getClusterExpansionZoom(f.properties.cluster_id).then((z) => {
        map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(z + 0.5, 16) });
      }).catch(() => {});
    });
    map.on("click", "points", (e) => {
      const f = e.features && e.features[0];
      if (f) selectLocation(f.properties.id, f.geometry.coordinates);
    });
    for (const layer of ["clusters", "points"]) {
      map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
    }
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (!state.styleOk) return;
      state.styleOk = false;
      const c = styleChain();
      pending = c.slice(1);
      map.setStyle(c[0]);
      arm();
    });
  }

  function addDataLayers() {
    const map = state.map;
    if (map.getSource("locations")) return;
    map.addSource("locations", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterRadius: 42,
      clusterMaxZoom: 12,
      clusterProperties: { n: ["+", ["get", "n"]], a: ["+", ["get", "a"]], c: ["+", ["get", "c"]], d: ["+", ["get", "d"]] },
    });
    const colorA = cssVar("--st-a"), colorC = cssVar("--st-c"), colorD = cssVar("--st-d"), colorB = cssVar("--st-b"), colorU = cssVar("--st-u");
    const ink = cssVar("--ink"), surface = cssVar("--surface"), accent = cssVar("--accent");
    map.addLayer({
      id: "clusters", type: "circle", source: "locations", filter: ["has", "point_count"],
      paint: {
        "circle-color": accent,
        "circle-opacity": 0.85,
        "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 12, 50, 18, 500, 26, 2000, 34],
        "circle-stroke-width": 2, "circle-stroke-color": surface,
      },
    });
    const hasGlyphs = !!(map.getStyle() && map.getStyle().glyphs);
    if (hasGlyphs) {
      map.addLayer({
        id: "cluster-count", type: "symbol", source: "locations", filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12, "text-font": ["Noto Sans Regular"], "text-allow-overlap": true },
        paint: { "text-color": "#ffffff" },
      });
    }
    map.addLayer({
      id: "points", type: "circle", source: "locations", filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 3.5, 10, 5.5, 14, 8],
        "circle-color": ["match", ["get", "st"], "A", colorA, "C", colorC, "D", colorD, "B", colorB, "rgba(0,0,0,0)"],
        "circle-stroke-color": ["match", ["get", "st"], "D", ink, "C", colorC, "U", colorU, surface],
        "circle-stroke-width": ["match", ["get", "st"], "D", 2.5, "C", 2, "U", 2, 1],
        "circle-opacity": 0.95,
      },
    });
  }

  function renderMapData() {
    const map = state.map;
    if (!map || !map.getSource("locations")) return;
    const features = state.filtered.map((l) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [l.lon, l.lat] },
      properties: { id: l.id, st: l.st, n: l.cnt.n, a: l.cnt.a, c: l.cnt.c, d: l.cnt.d, op: l.op },
    }));
    map.getSource("locations").setData({ type: "FeatureCollection", features });
  }

  function boundsOf(locs) {
    if (!locs.length) return null;
    let minX = 180, minY = 90, maxX = -180, maxY = -90;
    for (const l of locs) { if (l.lon < minX) minX = l.lon; if (l.lon > maxX) maxX = l.lon; if (l.lat < minY) minY = l.lat; if (l.lat > maxY) maxY = l.lat; }
    return [[minX, minY], [maxX, maxY]];
  }
  function fitCountry() {
    const b = boundsOf(state.points);
    if (b && state.map) state.map.fitBounds(b, { padding: 40, duration: 0, maxZoom: 9 });
  }
  function fitFiltered() {
    const b = boundsOf(state.filtered);
    if (b && state.map) state.map.fitBounds(b, { padding: 60, duration: 600, maxZoom: 12 });
  }
  function note(msg) {
    const n = $("map-note");
    n.hidden = !msg;
    n.textContent = msg || "";
  }

  // ----------------------------------------------------- location detail ----
  async function shardOf(id, n) {
    if (n <= 1) return "00";
    const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(id));
    const hex = [...new Uint8Array(buf).slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return (parseInt(hex, 16) % n).toString(16).padStart(2, "0");
  }
  async function loadLocationDetail(id) {
    const shard = await shardOf(id, state.shards);
    let locs = state.shardCache.get(shard);
    if (!locs) {
      const doc = await getJSON(`${state.country.path}/locations/${shard}.json`);
      locs = new Map(doc.locations.map((l) => [l.id, l]));
      state.shardCache.set(shard, locs);
    }
    return locs.get(id) || null;
  }
  async function loadTariffs() {
    if (state.tariffs === null) {
      state.tariffs = await getJSON(`${state.country.path}/tariffs.json`).catch(() => ({ tariffs: [], locations: {} }));
    }
    return state.tariffs;
  }

  function popupFor(pt, coords) {
    const opName = (state.operators[pt.op] || {}).name || pt.op;
    if (state.popup) state.popup.remove();
    const pop = el("div");
    pop.append(el("p", "popup-name", pt.name || pt.id), el("p", "popup-op", opName));
    const st = el("p", "popup-status");
    const chip = (cls, n, label) => { const s = el("span"); s.append(el("i", `dot ${cls}`), document.createTextNode(`${n} ${label}`)); return s; };
    if (pt.cnt.a) st.append(chip("dot-a", pt.cnt.a, "available"));
    if (pt.cnt.c) st.append(chip("dot-c", pt.cnt.c, "in use"));
    if (pt.cnt.d) st.append(chip("dot-d", pt.cnt.d, "down"));
    if (pt.cnt.h) st.append(chip("dot-b", pt.cnt.h, "blocked"));
    if (pt.cnt.u) st.append(chip("dot-u", pt.cnt.u, "unknown"));
    pop.append(st);
    state.popup = new maplibregl.Popup({ offset: 10, maxWidth: "280px" }).setLngLat(coords || [pt.lon, pt.lat]).setDOMContent(pop).addTo(state.map);
  }

  async function selectLocation(id, coords) {
    const pt = state.points.find((l) => l.id === id);
    if (!pt) return;
    state.selected = pt;
    popupFor(pt, coords);
    writeHash();
    $("tab-location").hidden = false;
    $("location-detail").replaceChildren(el("p", "hint", "Loading details…"));
    showTab("location");
    if (window.innerWidth <= 860) $("panel").classList.add("open");
    let loc, tariffs;
    try {
      [loc, tariffs] = await Promise.all([loadLocationDetail(id), loadTariffs()]);
    } catch (e) {
      $("location-detail").replaceChildren(el("p", "hint", "Could not load location details."));
      return;
    }
    if (!loc || state.selected !== pt) return;
    const opName = (state.operators[pt.op] || {}).name || pt.op;
    const tl = (tariffs.locations || {})[loc.id] || {};
    const tpl = $("tpl-location").content.cloneNode(true);
    tpl.querySelector(".loc-name").textContent = loc.name || loc.id;
    tpl.querySelector(".loc-op").textContent = loc.subop && loc.subop !== opName ? `${opName} · ${loc.subop}` : opName;
    tpl.querySelector(".loc-addr").textContent = [loc.addr, loc.pc, loc.city].filter(Boolean).join(", ");
    const conns = new Set();
    for (const e of loc.evses) for (const cn of e.conns) conns.add(cn.std);
    const meta = tpl.querySelector(".loc-meta");
    const add = (k, v) => { if (v) meta.append(el("dt", null, k), el("dd", null, v)); };
    add("Max power", fmtKw(pt.maxKw));
    add("Connectors", [...conns].map((c) => CONN_LABEL[c] || c).join(", "));
    add("Access", loc.h24 ? "24/7" : loc.hours ? "Limited hours" : "");
    add("Parking", loc.ptype ? loc.ptype.toLowerCase().replace(/_/g, " ") : "");
    add("Facilities", (loc.fac || []).map((f) => f.toLowerCase().replace(/_/g, " ")).join(", "));
    add("Energy", loc.green ? "Declared green" : "");
    add("Owner", loc.owner);
    add("Registry ID", loc.id);
    const list = tpl.querySelector(".evse-list");
    loc.evses.forEach((e, i) => {
      const stc = (pt.sts && pt.sts[i]) || e.st || "U";
      const li = el("li", "evse");
      const k = STATUS_CLASS(stc);
      li.append(el("i", `dot dot-${k === "h" ? "b" : k}`));
      const main = el("div", "evse-main");
      main.append(el("div", "evse-status", STATUS_LABEL[stc] || stc));
      main.append(el("div", "evse-id", e.id));
      const et = tl[e.uid] || {};
      for (const cn of e.conns) {
        const line = el("div", "conn");
        line.textContent = `${CONN_LABEL[cn.std] || cn.std} · ${cn.fmt === "CABLE" ? "cable" : "socket"} · ${PT_LABEL[cn.pt] || cn.pt}${cn.kw ? ` · ${fmtKw(cn.kw)}` : ""}`;
        const ti = et[cn.id];
        const t = ti != null ? tariffs.tariffs[ti] : null;
        if (t) {
          const parts = [];
          if (t.kwh != null) parts.push(`${t.kwh.toFixed(2)} ${t.cur || "EUR"}/kWh`);
          if (t.hour) parts.push(`${t.hour.toFixed(2)}/h`);
          if (t.flat) parts.push(`${t.flat.toFixed(2)} start`);
          if (t.park_hour) parts.push(`${t.park_hour.toFixed(2)}/h parking`);
          if (parts.length) { line.append(document.createTextNode(" · ")); line.append(el("span", "price", parts.join(", "))); }
        }
        main.append(line);
      }
      if (e.mfr || e.model) main.append(el("div", "conn", [e.mfr, e.model].filter(Boolean).join(" ")));
      li.append(main);
      list.append(li);
    });
    tpl.querySelector(".loc-foot").textContent = `Inventory last updated by operator ${fmtDateTime(loc.upd)}. Live status ${fmtDateTime(state.status.ts)}.`;
    const actions = el("div", "loc-actions");
    const nav = el("a", "btn-ghost", "Open in maps");
    nav.href = `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lon}`;
    nav.rel = "noopener"; nav.target = "_blank";
    actions.append(nav);
    tpl.querySelector(".loc").append(actions);
    $("location-detail").replaceChildren(tpl);
  }

  // ----------------------------------------------------------- coverage ----
  function renderCoverage() {
    const cov = state.coverage;
    if (!cov) return;
    const liveCodes = new Map((state.index ? state.index.countries : []).map((c) => [c.code, c]));
    const rows = cov.countries.map((c) => ({ ...c, live: liveCodes.get(c.code) })).sort((a, b) => {
      const ra = a.live ? 0 : 1, rb = b.live ? 0 : 1;
      return ra - rb || a.name.localeCompare(b.name);
    });
    const nLive = rows.filter((r) => r.live).length;
    const totalEvses = rows.reduce((n, r) => n + ((r.live && r.live.evses) || 0), 0);
    $("coverage-summary").textContent = `${nLive} of ${rows.length} countries live on cpo.today (${fmtInt(totalEvses)} charge points). The rest are tracked from official registries and national access points.`;
    const list = $("coverage-list");
    list.replaceChildren();
    for (const r of rows) {
      const li = el("li", `cov${r.live ? " live" : ""}`);
      li.append(el("span", "cov-flag", flag(r.code)));
      li.append(el("span", "cov-name", r.name));
      const status = r.live ? "live" : r.status;
      li.append(el("span", `chip ${status}`, COVERAGE_LABEL[status] || status));
      const src = el("span", "cov-src");
      const a = el("a", null, r.source); a.href = r.url; a.rel = "noopener"; a.target = "_blank";
      src.append(a);
      if (r.formats && r.formats.length) src.append(document.createTextNode(` · ${r.formats.join(", ")}`));
      li.append(src);
      const stat = el("span", "cov-stat");
      if (r.live) stat.textContent = `${fmtInt(r.live.locations)} locations · ${fmtInt(r.live.evses)} charge points · status ${fmtTime(r.live.dynamic_ts)} UTC`;
      else stat.textContent = r.note || (cov.statuses[r.status] || "");
      li.append(stat);
      if (r.live) {
        li.setAttribute("role", "button"); li.tabIndex = 0;
        const go = () => { $("country").value = r.code; loadCountry(r.code).catch(fail); showTab("operators"); };
        li.addEventListener("click", go);
        li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      }
      list.append(li);
    }
  }

  // ---------------------------------------------------------- freshness ----
  function setFreshness(cls, text) {
    const f = $("freshness");
    f.className = `freshness ${cls === "ok" ? "" : cls}`;
    $("freshness-text").textContent = text;
  }
  function updateFreshness() {
    if (!state.status) return;
    const age = Date.now() - Date.parse(state.status.ts);
    const mins = Math.max(0, Math.round(age / 60000));
    const when = `${fmtTime(state.status.ts)} UTC`;
    const narrow = window.innerWidth <= 860;
    if (age > CONFIG.staleAfterMs) setFreshness("stale", narrow ? `Stale · ${when}` : `Registry feed stale · last status ${when} (${mins} min ago)`);
    else setFreshness("ok", narrow ? `Live · ${when}` : `Live · status ${when} · ${mins} min ago · refreshes every 10 min`);
    $("freshness").title = `Registry status timestamp ${fmtDateTime(state.status.ts)}; page refreshes every 5 minutes.`;
  }

  // ------------------------------------------------------------- ui glue ----
  function populateOperatorFilter() {
    const sel = $("f-operator");
    const cur = state.filters.op;
    sel.replaceChildren(new Option("All operators", ""));
    const counts = {};
    for (const l of state.points) counts[l.op] = (counts[l.op] || 0) + l.n;
    const ops = Object.values(state.operators).sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0) || a.name.localeCompare(b.name));
    for (const o of ops) sel.append(new Option(`${o.name} (${fmtInt(counts[o.id] || 0)})`, o.id));
    sel.value = ops.some((o) => o.id === cur) ? cur : "";
    state.filters.op = sel.value;
  }
  function showTab(name) {
    for (const t of document.querySelectorAll('[role="tab"]')) {
      const on = t.id === `tab-${name}`;
      t.setAttribute("aria-selected", on ? "true" : "false");
      $(t.getAttribute("aria-controls")).hidden = !on;
    }
    if (name === "trends") renderTrends();
    if (name === "coverage") renderCoverage();
  }
  function readHash() {
    const h = location.hash.replace(/^#/, "");
    if (!h) return {};
    const q = new URLSearchParams(h.includes("?") ? h.slice(h.indexOf("?") + 1) : h);
    return { country: (h.split("?")[0] || "").toUpperCase(), op: q.get("op") || "", st: q.get("st") || "", pw: q.get("pw") || "", cn: q.get("cn") || "", q: q.get("q") || "", loc: q.get("loc") || "" };
  }
  function writeHash() {
    if (!state.country) return;
    const q = new URLSearchParams();
    for (const k of ["op", "st", "pw", "cn", "q"]) if (state.filters[k]) q.set(k, state.filters[k]);
    if (state.selected) q.set("loc", state.selected.id);
    const s = q.toString();
    const next = `#${state.country.code.toLowerCase()}${s ? "?" + s : ""}`;
    if (location.hash !== next) history.replaceState(null, "", next);
  }

  function bindUi() {
    const f = state.filters;
    $("f-operator").addEventListener("change", (e) => { f.op = e.target.value; applyFilters(); if (f.op) fitFiltered(); });
    $("f-status").addEventListener("change", (e) => { f.st = e.target.value; applyFilters(); });
    $("f-power").addEventListener("change", (e) => { f.pw = e.target.value; applyFilters(); });
    $("f-connector").addEventListener("change", (e) => { f.cn = e.target.value; applyFilters(); });
    let t;
    $("f-search").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value; applyFilters(); if (f.q.length >= 3) fitFiltered(); }, 200); });
    $("f-reset").addEventListener("click", () => {
      Object.assign(f, { op: "", st: "", pw: "", cn: "", q: "" });
      state.selected = null; $("tab-location").hidden = true;
      for (const id of ["f-operator", "f-status", "f-power", "f-connector", "f-search"]) $(id).value = "";
      applyFilters(); fitCountry();
    });
    for (const th of $("ops-table").querySelectorAll("th button")) {
      th.addEventListener("click", () => {
        const k = th.dataset.sort;
        state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: k === "name" ? 1 : -1 };
        renderOperators();
      });
    }
    for (const t of document.querySelectorAll('[role="tab"]')) t.addEventListener("click", () => showTab(t.id.replace("tab-", "")));
    for (const b of document.querySelectorAll(".seg button")) {
      b.addEventListener("click", () => {
        state.range = Number(b.dataset.range);
        for (const x of document.querySelectorAll(".seg button")) x.setAttribute("aria-pressed", x === b ? "true" : "false");
        renderTrends();
      });
    }
    $("country").addEventListener("change", (e) => loadCountry(e.target.value).catch(fail));
    $("about-link").addEventListener("click", (e) => { e.preventDefault(); $("about").showModal(); });
    $("panel-toggle").addEventListener("click", () => {
      const p = $("panel"); const open = !p.classList.contains("open");
      p.classList.toggle("open", open); $("panel-toggle").setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - state.lastFetch > 60000) refreshDynamic(); });
    let rt;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(renderTrends, 150); });
    setInterval(updateFreshness, 30000);
  }

  function fail(e) {
    console.error(e);
    setFreshness("error", "Could not load data. The registry feed may be down; try again in a few minutes.");
    note("Data unavailable right now.");
  }

  async function boot() {
    bindUi();
    initMap();
    const h = readHash();
    Object.assign(state.filters, { op: h.op || "", st: h.st || "", pw: h.pw || "", cn: h.cn || "", q: h.q || "" });
    $("f-status").value = state.filters.st; $("f-power").value = state.filters.pw; $("f-connector").value = state.filters.cn; $("f-search").value = state.filters.q;
    try {
      state.index = await getJSON("index.json", { revalidate: true });
      fetch("coverage.json", { credentials: "omit" }).then((r) => r.ok ? r.json() : null).then((c) => { state.coverage = c; }).catch(() => {});
      const sel = $("country");
      sel.replaceChildren();
      for (const c of state.index.countries) sel.append(new Option(`${flag(c.code)} ${c.name}`, c.code));
      const want = state.index.countries.some((c) => c.code === h.country) ? h.country : state.index.countries[0].code;
      sel.value = want;
      await loadCountry(want);
      if (h.loc && state.points.some((p) => p.id === h.loc)) {
        const pt = state.points.find((p) => p.id === h.loc);
        state.map.jumpTo({ center: [pt.lon, pt.lat], zoom: 14 });
        selectLocation(pt.id);
      }
    } catch (e) {
      fail(e);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
