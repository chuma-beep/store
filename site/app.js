/* Omarchy Store — single-page app. No framework, no build step.
 *
 * Two modes, detected at startup:
 *   web     — hosted on GitHub Pages. "GET" shows the install command to copy.
 *   desktop — served by the local helper (omarchy-store). "GET" really installs,
 *             buttons switch to OPEN once installed, and the UI wears your Omarchy theme.
 */
(() => {
  "use strict";

  const SITE = "https://omarchystore.com/";
  const REPO = "https://github.com/omarchy-community/store";
  const INSTALLER = `curl -fsSL ${SITE}install.sh | bash`;

  const S = { catalog: null, byId: {}, desktop: false, installed: new Set(), busy: new Set(), chartCat: "all" };
  const $ = (s, el = document) => el.querySelector(s);
  const view = $("#view");
  // Desktop helper injects a per-session token; every install/open request must carry it.
  const TOKEN = document.querySelector('meta[name="store-token"]')?.content || "";
  const post = (path, body) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "X-Store-Token": TOKEN }, body: JSON.stringify(body) });

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const k = (n) => n == null ? "—" : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K" : String(n);
  const mb = (b) => b == null ? "—" : b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : Math.max(1, Math.round(b / 1e6)) + " MB";
  const ago = (iso) => {
    if (!iso) return "—";
    const d = (Date.now() - new Date(iso)) / 864e5;
    return d < 1 ? "Today" : d < 2 ? "Yesterday" : d < 30 ? Math.floor(d) + " days ago" : d < 365 ? Math.floor(d / 30) + " mo ago" : Math.floor(d / 365) + " yr ago";
  };
  const cmdFor = (a) => {
    const i = a.install;
    if (i.method === "omarchy") return i.command;
    if (i.method === "aur") return `omarchy pkg aur add ${i.packages.join(" ")}`;
    return `omarchy pkg add ${i.packages.join(" ")}`;
  };
  const sourceLabel = (a) => {
    const r = a.package?.repo;
    if (a.install.method === "omarchy") return "Omarchy installer";
    return r === "aur" ? "Arch User Repository" : r ? `Arch Linux (${r})` : "Arch Linux";
  };
  const toast = (msg) => {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2400);
  };
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = Object.assign(document.createElement("textarea"), { value: text });
      document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    toast("Copied to clipboard");
  };

  const ICONS = {
    discover: '<path d="M12 2l2.4 6.9H22l-6 4.6 2.3 7.1L12 16.2 5.7 20.6 8 13.5 2 8.9h7.6z"/>',
    charts: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    installed: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18"/>',
    code: '<path d="m8 8-4 4 4 4m8-8 4 4-4 4m-6 3 4-14"/>',
    sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    brush: '<path d="M14 4l6 6-9 9H5v-6z"/><path d="M12 6l6 6"/>',
    film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
    gamepad: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3M16 12h.01M18 14h.01"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    check: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L13 18a2.1 2.1 0 0 1-3-3l6.7-6.7a4 4 0 0 0-5-5z"/>',
    star: '<path d="M12 2l3 6.6 7 .8-5.2 4.8 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.4l7-.8z"/>',
    share: '<path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    github: '<path d="M9 19c-4 1.3-4-2-6-2.5M15 21v-3.5a3 3 0 0 0-.9-2.4c3-.3 6-1.4 6-6.5a5 5 0 0 0-1.4-3.5 4.7 4.7 0 0 0-.1-3.5s-1.1-.3-3.6 1.4a12.4 12.4 0 0 0-6.5 0C5.9 1.4 4.8 1.7 4.8 1.7a4.7 4.7 0 0 0-.1 3.5A5 5 0 0 0 3.3 8.7c0 5 3 6.2 6 6.5a3 3 0 0 0-.9 2.4V21"/>',
    ok: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    warn: '<path d="M12 3 2 20h20zM12 10v4M12 17h.01"/>',
  };
  const ico = (n) => `<svg viewBox="0 0 24 24">${ICONS[n] || ""}</svg>`;
  const CAT_COLORS = ["#0a84ff", "#5e5ce6", "#bf5af2", "#ff375f", "#ff9f0a", "#ff453a", "#30d158", "#64d2ff", "#32ade6", "#ac8e68", "#8e8e93"];

  // ---------- data ----------
  async function boot() {
    // Desktop helper answers /api/status from the same origin; GitHub Pages returns 404.
    try {
      const r = TOKEN ? await fetch("api/status", { cache: "no-store" }) : { ok: false };
      if (r.ok) {
        const st = await r.json();
        S.desktop = true;
        S.installed = new Set(st.installed || []);
        if (st.theme) applyTheme(st.theme);
      }
    } catch { /* web mode */ }

    const r = await fetch("catalog.json", { cache: "no-cache" });
    S.catalog = await r.json();
    S.catalog.apps.forEach((a, i) => { S.byId[a.id] = a; a.rank = i + 1; });
    renderNav();
    renderModeBadge();
    route();
  }

  function applyTheme(t) {
    const r = document.documentElement.style;
    document.documentElement.classList.add("themed");
    const set = (v, c) => c && r.setProperty(v, c);
    set("--bg", t.background); set("--bg-2", t.lighter_background); set("--sidebar", t.dark_background);
    set("--card", t.lighter_background); set("--card-hover", t.selection);
    set("--text", t.bright_foreground || t.foreground); set("--text-2", t.foreground); set("--text-3", t.dark_foreground);
    set("--accent", t.accent); set("--accent-text", t.background); set("--pill-text", t.accent);
    set("--good", t.green); set("--line", t.selection);
    if (t.mode === "light") document.documentElement.style.colorScheme = "light";
  }

  async function refreshInstalled() {
    if (!S.desktop) return;
    try {
      const st = await (await fetch("api/status", { cache: "no-store" })).json();
      S.installed = new Set(st.installed || []);
    } catch {}
  }
  const isInstalled = (a) => S.installed.has(a.id);

  // ---------- nav ----------
  function renderNav() {
    const cats = S.catalog.categories;
    $("#nav").innerHTML = `
      <a href="#/" data-r="">${ico("discover")}Discover</a>
      <a href="#/charts" data-r="charts">${ico("charts")}Top Charts</a>
      <a href="#/categories" data-r="categories">${ico("grid")}Categories</a>
      ${S.desktop ? `<a href="#/installed" data-r="installed">${ico("installed")}Installed</a>` : ""}
      <div class="sec">Categories</div>
      ${cats.map((c) => `<a href="#/category/${c.id}" data-r="category/${c.id}">${ico(c.icon)}${esc(c.name)}</a>`).join("")}`;
  }
  function markNav(r) {
    document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("on", a.dataset.r === r));
  }
  function renderModeBadge() {
    const b = $("#mode-badge");
    if (S.desktop) {
      b.innerHTML = `<b><span class="dot"></span>Desktop app</b>One-click installs are on.`;
      b.removeAttribute("href");
    } else {
      b.innerHTML = `<b>Get the desktop app</b>Install apps with one click on Omarchy.`;
    }
  }

  // ---------- components ----------
  const iconImg = (a, size) => `<img class="icon" src="${esc(a.icon)}" alt="" width="${size}" height="${size}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">`;

  function getBtn(a, big = false) {
    const cls = "get" + (big ? " big" : "");
    if (S.busy.has(a.id)) return `<button class="${cls} busy" data-get="${a.id}"><span class="ring"></span></button>`;
    if (S.desktop && isInstalled(a)) return `<button class="${cls} installed" data-open="${a.id}">OPEN</button>`;
    return `<button class="${cls}" data-get="${a.id}">GET</button>`;
  }

  function lockup(a, { rank, sub } = {}) {
    return `<a class="lockup" href="#/app/${a.id}">
      ${rank ? `<span class="rank">${rank}</span>` : ""}
      ${iconImg(a, 64)}
      <div class="meta">
        <div class="name">${esc(a.name)}</div>
        <div class="sub">${esc(sub ?? a.summary)}</div>
        ${a.stars ? `<div class="stars">${ico("star")}${k(a.stars)} on GitHub</div>` : `<div class="stars">${esc(catName(a.category))}</div>`}
      </div>
      ${getBtn(a)}
    </a>`;
  }
  const catName = (id) => S.catalog.categories.find((c) => c.id === id)?.name || id;

  function shelf(title, apps, seeAll) {
    if (!apps.length) return "";
    return `<section class="shelf">
      <div class="shelf-head"><h2>${esc(title)}</h2>${seeAll ? `<a href="${seeAll}">See All</a>` : ""}</div>
      <div class="scroller rows3">${apps.map((a) => lockup(a)).join("")}</div>
    </section>`;
  }

  // ---------- ads ----------
  const ads = (slot) => (S.catalog.ads?.campaigns || []).filter((c) => c.slot === slot);
  const adUrl = (u) => u + (u.includes("?") ? "&" : "?") + "utm_source=omarchy-store&utm_medium=" + (S.desktop ? "desktop" : "web");

  function bannerAd() {
    const list = ads("banner");
    if (list.length) {
      const c = list[Math.floor(Math.random() * list.length)];
      const [g1, g2] = c.gradient || ["#333", "#555"];
      return `<a class="ad-banner" href="${esc(adUrl(c.url))}" target="_blank" rel="sponsored noopener" style="background:linear-gradient(120deg,${g1},${g2})">
        <div><span class="ad-chip">Sponsored</span><h3>${esc(c.title)}</h3><p>${esc(c.body)}</p></div>
        <span class="cta">${esc(c.cta || "Learn more")}</span></a>`;
    }
    return networkAd();
  }
  function networkAd() {
    const n = S.catalog.ads?.network;
    if (!n?.enabled || !n.publisher_id) return "";
    // EthicalAds: privacy-friendly, developer-focused, no tracking cookies.
    if (n.provider === "ethicalads") {
      queueMicrotask(() => {
        if (!document.querySelector("script[data-ea]")) {
          const s = Object.assign(document.createElement("script"), { src: "https://media.ethicalads.io/media/client/ethicalads.min.js", async: true });
          s.dataset.ea = "1"; document.head.append(s);
        } else window.ethicalads?.reload?.();
      });
      return `<div class="ad-net"><div data-ea-publisher="${esc(n.publisher_id)}" data-ea-type="image" data-ea-style="stickybox-none"></div></div>`;
    }
    return "";
  }
  function sponsoredApp(filter = () => true) {
    const c = ads("sponsored-app").find((c) => S.byId[c.app] && filter(S.byId[c.app]));
    if (!c) return "";
    const a = S.byId[c.app];
    return `<a class="lockup ad-app" href="#/app/${a.id}">
      ${iconImg(a, 64)}
      <div class="meta"><div class="name"><span class="ad-badge">Ad</span>${esc(a.name)}</div><div class="sub">${esc(a.summary)}</div>
      <div class="stars">Sponsored by ${esc(c.sponsor || a.developer)}</div></div>${getBtn(a)}</a>`;
  }
  function searchAd() {
    const c = ads("search")[0];
    if (!c) return "";
    const [g1, g2] = c.gradient || ["#333", "#555"];
    return `<a class="ad-banner" href="${esc(adUrl(c.url))}" target="_blank" rel="sponsored noopener" style="background:linear-gradient(120deg,${g1},${g2});padding:18px 22px">
      <div><span class="ad-chip">Sponsored</span><h3 style="font-size:18px">${esc(c.title)}</h3><p>${esc(c.body)}</p></div><span class="cta">${esc(c.cta)}</span></a>`;
  }

  // ---------- pages ----------
  function pageDiscover() {
    const { hero, collections } = S.catalog.featured;
    const apps = S.catalog.apps;
    const fresh = [...apps].filter((a) => a.released_at).sort((x, y) => new Date(y.released_at) - new Date(x.released_at)).slice(0, 12);
    const games = apps.filter((a) => a.category === "games");
    return `<div class="page">
      <h1 class="page-title">Discover</h1>
      <div class="scroller hero">${hero.map((h) => {
        const a = S.byId[h.app];
        const [g1, g2] = h.gradient;
        const shot = a.screenshots[0];
        return `<a class="hero-card" href="#/app/${a.id}" style="background:linear-gradient(135deg,${g1},${g2})">
          <div class="shot">${shot ? `<img src="${esc(shot)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<img class="glyph" src="${esc(a.icon)}" alt="">`}</div>
          <div><div class="eyebrow">${esc(h.eyebrow)}</div><h3>${esc(h.headline)}</h3></div>
          <div class="lockup">${iconImg(a, 48)}<div class="meta"><div class="name">${esc(a.name)}</div><div class="sub">${esc(a.summary)}</div></div>${getBtn(a)}</div>
        </a>`;
      }).join("")}</div>
      ${shelf(collections[0].title, collections[0].apps.map((id) => S.byId[id]))}
      ${bannerAd()}
      <section class="shelf">
        <div class="shelf-head"><h2>Top Charts</h2><a href="#/charts">See All</a></div>
        <div class="scroller rows3">${apps.slice(0, 12).map((a, i) => lockup(a, { rank: i + 1 })).join("")}</div>
      </section>
      ${collections.slice(1).map((c) => shelf(c.title, c.apps.map((id) => S.byId[id]))).join("")}
      ${shelf("Fresh Updates", fresh)}
      ${shelf("Games", games, "#/category/games")}
      ${footer()}
    </div>`;
  }

  function pageCharts() {
    const cats = [{ id: "all", name: "All Apps" }, ...S.catalog.categories];
    const list = S.catalog.apps.filter((a) => S.chartCat === "all" || a.category === S.chartCat);
    return `<div class="page">
      <h1 class="page-title">Top Charts</h1>
      <p class="page-sub">Ranked by GitHub stars. Updated weekly.</p>
      <div class="tabs">${cats.map((c) => `<button data-chart="${c.id}" class="${S.chartCat === c.id ? "on" : ""}">${esc(c.name)}</button>`).join("")}</div>
      <div class="chart">${list.map((a, i) => lockup(a, { rank: i + 1, sub: catName(a.category) })).join("")}</div>
      ${footer()}
    </div>`;
  }

  function pageCategories() {
    return `<div class="page">
      <h1 class="page-title">Categories</h1>
      <div class="cat-tiles">${S.catalog.categories.map((c, i) => `
        <a class="cat-tile" href="#/category/${c.id}">
          <span class="ci" style="background:${CAT_COLORS[i % CAT_COLORS.length]}">${ico(c.icon)}</span>
          <span>${esc(c.name)}<div class="muted small">${S.catalog.apps.filter((a) => a.category === c.id).length} apps</div></span>
        </a>`).join("")}</div>
      ${footer()}
    </div>`;
  }

  function pageCategory(id) {
    const c = S.catalog.categories.find((c) => c.id === id);
    if (!c) return notFound();
    const list = S.catalog.apps.filter((a) => a.category === id);
    return `<div class="page">
      <h1 class="page-title">${esc(c.name)}</h1>
      ${sponsoredApp((a) => a.category === id)}
      <div class="grid">${list.map((a) => lockup(a)).join("")}</div>
      ${footer()}
    </div>`;
  }

  function pageInstalled() {
    const list = S.catalog.apps.filter(isInstalled);
    return `<div class="page">
      <h1 class="page-title">Installed</h1>
      <p class="page-sub">Store apps found on this computer.</p>
      ${list.length ? `<div class="grid">${list.map((a) => lockup(a)).join("")}</div>` : `<div class="empty">Nothing from the store is installed yet.</div>`}
    </div>`;
  }

  function pageSearch(q) {
    const t = q.trim().toLowerCase();
    const score = (a) => {
      const n = a.name.toLowerCase();
      if (n === t) return 100;
      if (n.startsWith(t)) return 80;
      if (n.includes(t)) return 60;
      if (a.tags?.some((x) => x.includes(t))) return 40;
      if (catName(a.category).toLowerCase().includes(t)) return 30;
      if ((a.summary + " " + a.developer).toLowerCase().includes(t)) return 20;
      if (a.description?.toLowerCase().includes(t)) return 10;
      return 0;
    };
    const res = S.catalog.apps.map((a) => [score(a), a]).filter(([s]) => s > 0).sort((x, y) => y[0] - x[0] || (y[1].stars || 0) - (x[1].stars || 0)).map(([, a]) => a);
    return `<div class="page">
      <h1 class="page-title">Results for “${esc(q)}”</h1>
      ${sponsoredApp((a) => res.includes(a))}
      ${res.length ? `<div class="grid">${res.map((a) => lockup(a)).join("")}</div>`
        : `<div class="empty">No apps match “${esc(q)}”.<br><br><a class="btn ghost" href="${REPO}/issues/new?template=app-request.yml&title=${encodeURIComponent("App request: " + q)}" target="_blank" rel="noopener">Request this app</a></div>`}
      ${searchAd()}
    </div>`;
  }

  function pageApp(id) {
    const a = S.byId[id];
    if (!a) return notFound();
    const p = a.package || {};
    const cat = S.catalog.categories.find((c) => c.id === a.category);
    const related = S.catalog.apps.filter((x) => x.category === a.category && x.id !== a.id).slice(0, 6);
    const ghUrl = a.github ? `https://github.com/${a.github}` : null;
    const stale = a.archived || p.out_of_date;
    const strip = [
      ["GitHub Stars", a.stars != null ? k(a.stars) : "—", a.stars != null ? `#${a.rank} in store` : "Closed source"],
      [p.repo === "aur" ? "AUR Votes" : "Source", p.repo === "aur" ? k(p.votes) : (a.install.method === "omarchy" ? "Omarchy" : "Arch"), p.repo === "aur" ? "Community" : (p.repo || "Official")],
      ["Category", `<span style="color:var(--accent)">${ico(cat?.icon)}</span>`, esc(cat?.name)],
      ["Developer", `<span style="font-size:16px">${esc(a.developer || "—")}</span>`, a.github ? esc(a.github.split("/")[0]) : ""],
      ["Size", p.size ? mb(p.size) : "—", "Installed"],
      ["Age", esc(a.age ? a.age.replace("Early Childhood", "3+").replace("Everyone", "4+").replace("Teen", "13+").replace("Mature", "17+") : "—"), "Rating"],
    ];
    return `<div class="page">
      <div class="detail-head">
        ${iconImg(a, 128)}
        <div style="min-width:0">
          <h1>${esc(a.name)}${a.archived ? `<span class="archived">Archived</span>` : ""}</h1>
          <div class="sub">${esc(a.summary)}</div>
          <a class="dev" href="${esc(ghUrl || a.homepage || "#")}" target="_blank" rel="noopener">${esc(a.developer)}</a>
          <div class="actions">
            ${getBtn(a, true)}
            ${ghUrl ? `<a class="icon-btn" href="${ghUrl}" target="_blank" rel="noopener" title="View on GitHub">${ico("github")}</a>` : ""}
            <button class="icon-btn" data-share="${a.id}" title="Share">${ico("share")}</button>
          </div>
        </div>
      </div>

      <div class="strip">${strip.map(([kk, v, s]) => `<div><div class="k">${kk}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("")}</div>

      ${a.screenshots.length ? `<div class="scroller shots">${a.screenshots.map((s) => `<img src="${esc(s)}" alt="Screenshot of ${esc(a.name)}" loading="lazy" referrerpolicy="no-referrer" data-zoom>`).join("")}</div>` : ""}

      <section class="shelf">
        <div class="desc clamp" id="desc">${esc(a.description || a.summary)}</div>
        <button class="more" id="more" hidden>more</button>
      </section>

      ${a.release || p.version ? `<section class="shelf">
        <div class="shelf-head"><h2>What’s New</h2>${ghUrl ? `<a href="${ghUrl}/releases" target="_blank" rel="noopener">Version History</a>` : ""}</div>
        <div class="whatsnew"><span>Version ${esc(a.release || p.version)}</span><span>${ago(a.released_at || p.updated)}</span></div>
      </section>` : ""}

      <section class="shelf">
        <div class="shelf-head"><h2>Information</h2></div>
        <div class="info-grid">
          <div><div class="k">Provider</div><div class="v">${esc(a.developer || "—")}</div></div>
          <div><div class="k">Installs from</div><div class="v">${esc(sourceLabel(a))}</div></div>
          <div><div class="k">Package</div><div class="v">${esc(p.name)} ${p.version ? `<span class="muted">${esc(p.version)}</span>` : ""}</div></div>
          <div><div class="k">License</div><div class="v">${esc(a.license || "Proprietary")}</div></div>
          <div><div class="k">Last code change</div><div class="v">${ago(a.last_commit)}</div></div>
          <div><div class="k">Runs in</div><div class="v">${a.kind === "terminal" ? "Terminal" : "Desktop window"}</div></div>
          ${a.homepage ? `<div><div class="k">Website</div><a class="v" href="${esc(a.homepage)}" target="_blank" rel="noopener">${esc(a.homepage.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a></div>` : ""}
          ${ghUrl ? `<div><div class="k">Source code</div><a class="v" href="${ghUrl}" target="_blank" rel="noopener">github.com/${esc(a.github)}</a></div>` : ""}
          <div><div class="k">Install command</div><div class="v"><code class="small">${esc(cmdFor(a))}</code></div></div>
        </div>
        <div class="trust ${stale ? "warn" : ""}">${ico(stale ? "warn" : "ok")}<div>${stale
          ? (a.archived ? "This project's GitHub repository is archived and no longer maintained." : "This AUR package is flagged out of date by the community.")
          : a.install.method === "aur"
            ? "Installs from the AUR, Arch's community repository. Builds are community-maintained; the store only lists packages with an active maintainer and good standing."
            : "Installs from a signed, official package source. The store never runs code from a web page — it only calls your system package manager."}</div></div>
      </section>

      ${related.length ? `<section class="shelf"><div class="shelf-head"><h2>More ${esc(cat?.name)}</h2><a href="#/category/${a.category}">See All</a></div>
        <div class="scroller rows3">${related.map((x) => lockup(x)).join("")}</div></section>` : ""}
      ${footer()}
    </div>`;
  }

  function pageGetDesktop() {
    return `<div class="page" style="max-width:760px">
      <h1 class="page-title">Get the desktop app</h1>
      <p class="muted" style="font-size:16px">The desktop app installs apps for you with one click, shows which ones you already have, and matches your Omarchy theme.</p>
      <p>Open a terminal (<b>Super + Return</b>) and paste:</p>
      <div class="code"><code>${esc(INSTALLER)}</code><button class="btn ghost" data-copy="${esc(INSTALLER)}">Copy</button></div>
      <p class="muted small">Then launch <b>Omarchy Store</b> from your app launcher (<b>Super + Space</b>). It installs to your home folder only and can be removed with <code>omarchy-store --uninstall</code>.
      Read the script first: <a style="color:var(--accent)" href="${SITE}install.sh" target="_blank" rel="noopener">install.sh</a>.</p>
      ${footer()}
    </div>`;
  }

  const notFound = () => `<div class="page"><div class="empty">That page doesn’t exist. <a style="color:var(--accent)" href="#/">Back to Discover</a></div></div>`;
  const footer = () => `<div class="footer">
    <span>Omarchy Store — unofficial, community-run. Not affiliated with Omarchy or Basecamp.</span>
    <a href="${REPO}" target="_blank" rel="noopener">GitHub</a>
    <a href="${REPO}/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener">Submit an app</a>
    <a href="${REPO}/blob/main/ADVERTISE.md" target="_blank" rel="noopener">Advertise</a>
    <span>Data updated ${ago(S.catalog.generated_at).toLowerCase()}</span>
  </div>`;

  // ---------- router ----------
  function route() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const [p, arg] = h.split(/\/(.*)/s);
    let html, nav = p;
    if (!p) html = pageDiscover(), nav = "";
    else if (p === "charts") html = pageCharts();
    else if (p === "categories") html = pageCategories();
    else if (p === "category") html = pageCategory(arg), nav = "category/" + arg;
    else if (p === "app") html = pageApp(arg), nav = "category/" + (S.byId[arg]?.category || "");
    else if (p === "search") html = pageSearch(arg || "");
    else if (p === "installed") html = pageInstalled();
    else if (p === "get-desktop") html = pageGetDesktop();
    else html = notFound();
    view.innerHTML = html;
    markNav(nav);
    if (p !== "search") $("#q").value = "";
    if (route.last !== h) view.scrollTop = 0;
    route.last = h;
    const d = $("#desc"), m = $("#more");
    if (d && m && d.scrollHeight > d.clientHeight + 4) m.hidden = false;
    document.title = p === "app" && S.byId[arg] ? `${S.byId[arg].name} — Omarchy Store` : "Omarchy Store";
  }
  const rerender = () => { const top = view.scrollTop; route(); view.scrollTop = top; };

  // ---------- actions ----------
  function showSheet(html, cls = "") {
    const s = $("#sheet");
    s.className = "sheet " + cls;
    s.innerHTML = html; s.hidden = false;
  }
  const closeSheet = () => { $("#sheet").hidden = true; $("#sheet").innerHTML = ""; };

  function webGet(a) {
    const cmd = cmdFor(a);
    showSheet(`<div class="sheet-card" role="dialog" aria-label="Install ${esc(a.name)}">
      <div class="row">${iconImg(a, 56)}<div><h3>Get ${esc(a.name)}</h3><div class="muted small">Installs from ${esc(sourceLabel(a))}</div></div></div>
      <div class="small muted">Paste this into a terminal (<b>Super + Return</b>):</div>
      <div class="code"><code>${esc(cmd)}</code><button class="btn" data-copy="${esc(cmd)}">Copy</button></div>
      <div class="small muted">Want one-click installs? <a style="color:var(--accent)" href="#/get-desktop" data-close>Get the desktop app</a>.</div>
      <div style="text-align:right;margin-top:16px"><button class="btn ghost" data-close>Done</button></div>
    </div>`);
  }

  async function desktopGet(a) {
    S.busy.add(a.id); rerender();
    try {
      const r = await post("api/install", { id: a.id });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
      toast(`Installing ${a.name} — follow the terminal window`);
      // Poll until the package shows up (install runs in a floating terminal and may ask for your password).
      const t0 = Date.now();
      while (Date.now() - t0 < 20 * 60e3) {
        await new Promise((res) => setTimeout(res, 2500));
        const st = await (await fetch("api/job/" + a.id, { cache: "no-store" })).json();
        if (st.installed) { S.installed.add(a.id); toast(`${a.name} installed`); break; }
        if (st.state === "done" || st.state === "failed") { await refreshInstalled(); if (!isInstalled(a)) toast(`${a.name} was not installed`); break; }
      }
    } catch (e) {
      toast("Install failed: " + e.message);
    }
    S.busy.delete(a.id); rerender();
  }

  async function desktopOpen(a) {
    const r = await post("api/open", { id: a.id });
    const j = await r.json().catch(() => ({}));
    toast(r.ok ? `Opening ${a.name}` : (j.error || "Could not open"));
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-get],[data-open],[data-copy],[data-close],[data-share],[data-chart],[data-zoom],#more,.sheet");
    if (!t) return;
    if (t.matches("[data-get]")) {
      e.preventDefault(); e.stopPropagation();
      const a = S.byId[t.dataset.get];
      S.desktop ? desktopGet(a) : webGet(a);
    } else if (t.matches("[data-open]")) {
      e.preventDefault(); e.stopPropagation(); desktopOpen(S.byId[t.dataset.open]);
    } else if (t.matches("[data-copy]")) {
      e.preventDefault(); copy(t.dataset.copy);
    } else if (t.matches("[data-close]")) {
      closeSheet();
    } else if (t.matches("[data-share]")) {
      copy(SITE + "#/app/" + t.dataset.share);
    } else if (t.matches("[data-chart]")) {
      S.chartCat = t.dataset.chart; rerender();
    } else if (t.matches("[data-zoom]")) {
      showSheet(`<img src="${esc(t.src)}" alt="">`, "lightbox");
    } else if (t.id === "more") {
      $("#desc").classList.remove("clamp"); t.remove();
    } else if (t.matches(".sheet") && (e.target === t || t.classList.contains("lightbox"))) {
      closeSheet();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSheet();
    if (e.key === "/" && document.activeElement !== $("#q")) { e.preventDefault(); $("#q").focus(); }
  });
  let qt;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(qt);
    const v = e.target.value;
    qt = setTimeout(() => { location.hash = v.trim() ? "#/search/" + encodeURIComponent(v) : "#/"; }, 180);
  });
  window.addEventListener("hashchange", () => { closeSheet(); route(); });
  window.addEventListener("focus", async () => { if (S.desktop) { await refreshInstalled(); rerender(); } });

  boot().catch((e) => {
    view.innerHTML = `<div class="page"><div class="empty">Couldn’t load the store catalog.<br><span class="small">${esc(e.message)}</span></div></div>`;
  });
})();
