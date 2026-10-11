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

  const S = { catalog: null, byId: {}, themeById: {}, desktop: false, installed: new Set(), busy: new Set(), chartCat: "all",
    themeFilter: "all", themeQ: "", themesHave: new Set(), themeNow: "" };
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
    if (i.method === "release") return `curl -fsSL ${SITE}get.sh | bash -s ${a.id}`;
    if (i.method === "aur") return `omarchy pkg aur add ${i.packages.join(" ")}`;
    return `omarchy pkg add ${i.packages.join(" ")}`;
  };
  const sourceLabel = (a) => {
    const r = a.package?.repo;
    if (a.install.method === "omarchy") return "Omarchy installer";
    if (a.install.method === "release") return "the developer (verified download)";
    if (a.install.method === "aur" || r === "aur") return "Arch User Repository (AUR)";
    return r ? `Arch Linux (${r})` : "Arch Linux";
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
    terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12 15h5"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M8 7h7"/>',
    palette: '<path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5C21 6.4 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.5" cy="7" r="1"/><circle cx="17" cy="10.5" r="1"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L13 18a2.1 2.1 0 0 1-3-3l6.7-6.7a4 4 0 0 0-5-5z"/>',
    star: '<path d="M12 2l3 6.6 7 .8-5.2 4.8 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.4l7-.8z"/>',
    share: '<path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    github: '<path d="M9 19c-4 1.3-4-2-6-2.5M15 21v-3.5a3 3 0 0 0-.9-2.4c3-.3 6-1.4 6-6.5a5 5 0 0 0-1.4-3.5 4.7 4.7 0 0 0-.1-3.5s-1.1-.3-3.6 1.4a12.4 12.4 0 0 0-6.5 0C5.9 1.4 4.8 1.7 4.8 1.7a4.7 4.7 0 0 0-.1 3.5A5 5 0 0 0 3.3 8.7c0 5 3 6.2 6 6.5a3 3 0 0 0-.9 2.4V21"/>',
    ok: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    warn: '<path d="M12 3 2 20h20zM12 10v4M12 17h.01"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    rocket: '<path d="M12 2c3 2 5 6 5 10l-2 4H9l-2-4c0-4 2-8 5-10z"/><circle cx="12" cy="10" r="1.8"/><path d="M9 16l-3 3 1-5M15 16l3 3-1-5M10 20h4"/>',
    usb: '<path d="M8 2h8v6H8z"/><path d="M6 8h12v10a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4z"/><path d="M10 4.5h.01M14 4.5h.01"/>',
  };
  const ico = (n) => `<svg viewBox="0 0 24 24">${ICONS[n] || ""}</svg>`;
  const CAT_COLORS = ["#0a84ff", "#5e5ce6", "#bf5af2", "#ff375f", "#ff9f0a", "#ff453a", "#30d158", "#64d2ff", "#32ade6", "#ac8e68", "#8e8e93"];

  // ---------- data ----------
  async function boot() {
    // Desktop helper answers /api/status from the same origin; GitHub Pages returns 404.
    try {
      const r = TOKEN ? await fetch("/api/status", { cache: "no-store" }) : { ok: false };
      if (r.ok) {
        const st = await r.json();
        S.desktop = true; S.status = st;
        S.installed = new Set(st.installed || []);
        S.themesHave = new Set(st.themes_installed || []); S.themeNow = st.theme_current || "";
        if (st.theme) applyTheme(st.theme);
      }
    } catch { /* web mode */ }

    const r = await fetch("/catalog.json", { cache: "no-cache" });
    S.catalog = await r.json();
    S.catalog.apps.forEach((a, i) => { S.byId[a.id] = a; a.rank = i + 1; });
    S.catalog.themes = S.catalog.themes || [];
    S.catalog.themes.forEach((t) => { S.themeById[t.id] = t; });
    renderNav();
    renderModeBadge();
    route();
    if (S.desktop) {
      // Check app updates in the background now and every hour; show a count next to "Updates".
      setTimeout(() => loadUpdates(false), 1500);
      setInterval(async () => { await refreshInstalled(); loadUpdates(false); }, 3600e3);
    }
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
      const st = await (await fetch("/api/status", { cache: "no-store" })).json();
      S.status = st;
      S.installed = new Set(st.installed || []);
      S.themesHave = new Set(st.themes_installed || []); S.themeNow = st.theme_current || "";
    } catch {}
  }
  const isInstalled = (a) => S.installed.has(a.id);

  // ---------- nav ----------
  function renderNav() {
    const cats = S.catalog.categories;
    $("#nav").innerHTML = `
      <a href="/" data-r="">${ico("discover")}Discover</a>
      <a href="/charts/" data-r="charts">${ico("charts")}Top Charts</a>
      <a href="/categories/" data-r="categories">${ico("grid")}Categories</a>
      <a href="/get-omarchy/" data-r="get-omarchy">${ico("rocket")}Get Omarchy<span class="nav-new">NEW</span></a>
      ${S.catalog.themes.length ? `<a href="/themes/" data-r="themes">${ico("palette")}Themes<span class="nav-new">NEW</span></a>` : ""}
      ${S.desktop ? `<a href="/installed/" data-r="installed">${ico("installed")}Installed</a>
      <a href="/updates/" data-r="updates">${ico("refresh")}Updates<span class="nav-count" id="upd-count" hidden></span></a>` : ""}
      <div class="sec">Categories</div>
      ${S.catalog.themes.length ? `<a href="/themes/" data-r="themes-cat">${ico("palette")}Themes</a>` : ""}
      ${cats.map((c) => `<a href="/category/${c.id}/" data-r="category/${c.id}">${ico(c.icon)}${esc(c.name)}</a>`).join("")}`;
  }
  function markNav(r) {
    document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("on", a.dataset.r === r));
  }
  function renderModeBadge() {
    const b = $("#mode-badge");
    if (S.desktop) {
      b.innerHTML = S.status?.restart_needed
        ? `<b><span class="dot"></span>Update ready</b>Restart the store to finish.`
        : `<b><span class="dot"></span>Desktop app</b>One-click installs are on.`;
      if (S.status?.restart_needed) b.setAttribute("href", "/updates/");
      b.removeAttribute("href");
    } else {
      b.innerHTML = `<b>Get the desktop app</b>Install apps with one click on Omarchy.`;
    }
  }

  // ---------- components ----------
  const MONO = ["#7aa2f7", "#bb9af7", "#9ece6a", "#e0af68", "#f7768e", "#7dcfff", "#ff9e64", "#2ac3de"];
  const monogram = (a, size) => {
    let h = 0; for (const c of a.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const bg = MONO[h % MONO.length];
    const t = a.name.replace(/[^A-Za-z0-9]/g, "").slice(0, a.kind === "terminal" ? 2 : 1) || "?";
    return `<span class="icon mono" style="width:${size}px;height:${size}px;background:linear-gradient(135deg,${bg},color-mix(in srgb,${bg} 55%,#000));font-size:${Math.round(size * (t.length > 1 ? .36 : .46))}px">${a.kind === "terminal" ? '<i>&gt;_</i>' : ""}${esc(t)}</span>`;
  };
  const asset = (p) => !p ? "" : /^(https?:)?\/\//.test(p) || p.startsWith("/") ? p : "/" + p;
  const iconImg = (a, size) => a.icon
    ? `<img class="icon" src="${esc(asset(a.icon))}" alt="" width="${size}" height="${size}" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'icon mono',style:'width:${size}px;height:${size}px;background:#414868'}))">`
    : monogram(a, size);

  function getBtn(a, big = false) {
    const cls = "get" + (big ? " big" : "");
    if (a.available === false) return `<button class="${cls} soon" data-soon="${a.id}" title="Launching soon">SOON</button>`;
    if (S.busy.has(a.id)) return `<button class="${cls} busy" data-get="${a.id}"><span class="ring"></span></button>`;
    if (S.desktop && isInstalled(a)) return a.cli
      ? `<button class="${cls} installed" data-open="${a.id}" title="Opens a terminal — run: ${esc(a.open || a.detect[0])}">INSTALLED</button>`
      : `<button class="${cls} installed" data-open="${a.id}">OPEN</button>`;
    return `<button class="${cls}" data-get="${a.id}">GET</button>`;
  }

  function lockup(a, { rank, sub } = {}) {
    return `<a class="lockup" href="/app/${a.id}/">
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

  // Ad images can be relative (hosted with the site). The desktop app serves a local copy
  // of the site without the ads/ folder, so point those at the live site instead.
  const adImg = (p) => !p ? "" : /^https:\/\//.test(p) ? p : (S.desktop ? SITE + p : "/" + p);

  function artistAd(c) {
    const u = esc(adUrl(c.url));
    const L = `href="${u}" target="_blank" rel="sponsored noopener"`;
    return `<section class="artist-ad" aria-label="Sponsored: ${esc(c.title)}">
      <a class="aa-hero" ${L}>
        <img src="${esc(adImg(c.image))}" alt="" loading="lazy">
        <span class="ad-chip">Sponsored</span>
        <h3 class="aa-name">${esc(c.title)}</h3>
      </a>
      <div class="aa-bar">
        <a class="aa-play" ${L} title="Play on Spotify"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg></a>
        <a class="aa-icon" ${L} title="Shuffle"><svg viewBox="0 0 24 24"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg></a>
        <a class="aa-follow" ${L}>Follow</a>
        <a class="aa-more" ${L} title="More">•••</a>
        <a class="aa-cta" ${L}>${esc(c.cta || "Listen on Spotify")}</a>
      </div>
    </section>`;
  }

  function bannerAd() {
    const all = ads("banner");
    const paid = all.filter((c) => c.type !== "house");
    const list = paid.length ? paid : all;
    if (list.length) {
      const c = list[Math.floor(Math.random() * list.length)];
      if (c.type === "artist") return artistAd(c);
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
    return `<a class="lockup ad-app" href="/app/${a.id}/">
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


  // ---------- themes (directory data from omarchythemes.com, credited on every page) ----------
  // In the desktop app the local site copy has no preview images, so load them from the live site.
  const themeImg = (t) => !t.image ? "" : /^https:\/\//.test(t.image) ? t.image : (S.desktop ? SITE + t.image : "/" + t.image);
  const canInstallTheme = (t) => !!(t.builtin || t.repo);
  const themeCmd = (t) => t.builtin ? `omarchy-theme-set ${t.builtin}` : `omarchy-theme-install https://github.com/${t.repo}`;
  const themeHave = (t) => S.themesHave.has(t.install_name);
  const themeIsCurrent = (t) => S.themeNow && S.themeNow === t.install_name;
  const swatches = (t, n = 8) => (t.palette || []).slice(0, n).map((c) => `<i style="background:${esc(c)}"></i>`).join("");

  function themeBtn(t, big = false) {
    const cls = "get" + (big ? " big" : "");
    if (!canInstallTheme(t)) return `<a class="${cls} ghosty" href="${esc(t.source_url)}" target="_blank" rel="noopener">VIEW</a>`;
    if (S.busy.has("theme:" + t.id)) return `<button class="${cls} busy"><span class="ring"></span></button>`;
    if (S.desktop && themeIsCurrent(t)) return `<button class="${cls} installed" disabled>IN USE</button>`;
    if (S.desktop && themeHave(t)) return `<button class="${cls}" data-theme-use="${t.id}">USE</button>`;
    return `<button class="${cls}" data-theme-get="${t.id}">GET</button>`;
  }

  function themeCard(t) {
    const img = themeImg(t);
    return `<a class="theme-card" href="/theme/${t.id}/">
      <div class="tc-img" style="background:${esc(t.palette?.[0] || "var(--card)")}">${img ? `<img src="${esc(img)}" alt="${esc(t.name)} theme preview" loading="lazy">` : ""}
        ${t.builtin ? `<span class="tc-chip">Built in</span>` : ""}${S.desktop && themeIsCurrent(t) ? `<span class="tc-chip on">In use</span>` : ""}</div>
      <div class="tc-meta">
        <div style="min-width:0;flex:1"><div class="name">${esc(t.name)}</div><div class="sub">by ${esc(t.author || "unknown")}</div>
          ${t.palette?.length ? `<div class="swatch">${swatches(t)}</div>` : ""}</div>
        ${themeBtn(t)}
      </div>
    </a>`;
  }

  function themeShelf(title, list, seeAll) {
    if (!list.length) return "";
    return `<section class="shelf">
      <div class="shelf-head"><h2>${esc(title)}</h2>${seeAll ? `<a href="${seeAll}">See All</a>` : ""}</div>
      <div class="scroller themes-row">${list.map(themeCard).join("")}</div>
    </section>`;
  }

  const THEME_FILTERS = [["all", "All"], ["dark", "Dark"], ["light", "Light"], ["builtin", "Built into Omarchy"], ["popular", "Most starred"], ["new", "Recently updated"]];
  function themeList() {
    let l = S.catalog.themes.slice();
    const f = S.themeFilter, q = S.themeQ.trim().toLowerCase();
    if (f === "dark" || f === "light") l = l.filter((t) => t.mode === f);
    if (f === "builtin") l = l.filter((t) => t.builtin);
    if (f === "popular") l = l.filter((t) => t.stars).sort((a, b) => b.stars - a.stars);
    if (f === "new") l = l.filter((t) => t.updated).sort((a, b) => new Date(b.updated) - new Date(a.updated));
    if (f === "installed") l = l.filter(themeHave);
    if (q) l = l.filter((t) => (t.name + " " + t.author + " " + (t.description || "")).toLowerCase().includes(q));
    return l;
  }
  function themeGridHtml() {
    const l = themeList();
    return l.length ? l.map(themeCard).join("") : `<div class="empty" style="grid-column:1/-1">No themes match.</div>`;
  }
  function pageThemes() {
    const all = S.catalog.themes, src = S.catalog.themes_source || {};
    const filters = S.desktop ? [...THEME_FILTERS, ["installed", "On this computer"]] : THEME_FILTERS;
    const pick = all.filter((t) => t.palette?.length && t.image && t.stars).slice(0, 3);
    return `<div class="page">
      <h1 class="page-title">Themes</h1>
      <p class="page-sub">${all.length} community themes that recolor your whole Omarchy desktop: terminal, bar, launcher, lock screen and wallpaper. Directory from <a style="color:var(--accent)" href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.name)}</a>.</p>
      ${pick.length ? `<div class="scroller theme-hero">${pick.map((t) => `<a class="th-card" href="/theme/${t.id}/"><img src="${esc(themeImg(t))}" alt="" loading="eager">
        <div class="th-over"><div class="eyebrow">Most loved</div><h3>${esc(t.name)}</h3><div class="swatch">${swatches(t)}</div></div></a>`).join("")}</div>` : ""}
      <div class="theme-tools">
        <div class="tabs">${filters.map(([id, n]) => `<button data-tfilter="${id}" class="${S.themeFilter === id ? "on" : ""}">${esc(n)}</button>`).join("")}</div>
        <input id="tq" type="search" placeholder="Search themes" value="${esc(S.themeQ)}" autocomplete="off" aria-label="Search themes">
      </div>
      <div class="theme-grid" id="tgrid">${themeGridHtml()}</div>
      <div class="trust">${ico("ok")}<div>Themes only change colors, fonts and wallpapers; they don't install programs or need your password. Installing copies the theme from its GitHub page into <code>~/.config/omarchy/themes</code> and switches to it. Switch back any time from the Omarchy menu: <b>Super + Ctrl + Shift + Space</b>.
        <div style="margin-top:6px">Themes are made by independent creators. Listing data courtesy of <a style="color:var(--accent)" href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.name)}</a> by <a style="color:var(--accent)" href="${esc(src.by_url)}" target="_blank" rel="noopener">${esc(src.by)}</a>.</div></div></div>
      ${footer()}
    </div>`;
  }

  function pageTheme(id) {
    const t = S.themeById[id];
    if (!t) return notFound();
    const src = S.catalog.themes_source || {};
    const gh = t.repo ? `https://github.com/${t.repo}` : null;
    const more = S.catalog.themes.filter((x) => x.id !== t.id && x.mode === t.mode && x.image && x.palette?.length).slice(0, 12);
    const img = themeImg(t);
    return `<div class="page">
      <div class="theme-big" style="background:${esc(t.palette?.[0] || "var(--card)")}">${img ? `<img src="${esc(img)}" alt="${esc(t.name)} theme on Omarchy" data-zoom>` : ""}</div>
      <div class="detail-head theme-head">
        <div style="min-width:0">
          <h1>${esc(t.name)}${t.archived ? `<span class="archived">Archived</span>` : ""}</h1>
          <div class="sub">${esc(t.description && t.description.length < 200 ? t.description : (t.mode === "light" ? "A light theme" : "A dark theme") + " for Omarchy")}</div>
          <a class="dev" href="${esc(gh || t.source_url)}" target="_blank" rel="noopener">${esc(t.author || "Unknown creator")}</a>
          <div class="actions">
            ${themeBtn(t, true)}
            ${gh ? `<a class="icon-btn" href="${gh}" target="_blank" rel="noopener" title="View on GitHub">${ico("github")}</a>` : ""}
            <button class="icon-btn" data-share-theme="${t.id}" title="Share">${ico("share")}</button>
          </div>
        </div>
      </div>
      <div class="strip">
        <div><div class="k">Style</div><div class="v">${t.mode === "light" ? "☀" : t.mode === "dark" ? "☾" : "—"}</div><div class="s">${t.mode ? (t.mode === "light" ? "Light" : "Dark") : "Unknown"}</div></div>
        <div><div class="k">GitHub Stars</div><div class="v">${t.stars != null ? k(t.stars) : "—"}</div><div class="s">${t.builtin ? "Ships with Omarchy" : "Community"}</div></div>
        <div><div class="k">Wallpapers</div><div class="v">${t.backgrounds || "—"}</div><div class="s">Included</div></div>
        <div><div class="k">Restyles</div><div class="v">${t.apps?.length || "—"}</div><div class="s">Apps</div></div>
        <div><div class="k">Updated</div><div class="v" style="font-size:16px">${ago(t.updated)}</div><div class="s">On GitHub</div></div>
        <div><div class="k">Price</div><div class="v">Free</div><div class="s">Open source</div></div>
      </div>
      ${t.palette?.length ? `<section class="shelf"><div class="shelf-head"><h2>Color palette</h2></div>
        <div class="palette">${t.palette.map((c) => `<button data-copy="${esc(c)}" title="Copy ${esc(c)}"><i style="background:${esc(c)}"></i><span>${esc(c)}</span></button>`).join("")}</div></section>` : ""}
      ${t.apps?.length ? `<section class="shelf"><div class="shelf-head"><h2>What it recolors</h2></div>
        <div class="chips">${t.apps.map((a) => `<span>${esc(a)}</span>`).join("")}</div></section>` : ""}
      <section class="shelf"><div class="shelf-head"><h2>Information</h2></div>
        <div class="info-grid">
          <div><div class="k">Creator</div><div class="v">${esc(t.author || "—")}</div></div>
          ${gh ? `<div><div class="k">Source code</div><a class="v" href="${gh}" target="_blank" rel="noopener">github.com/${esc(t.repo)}</a></div>` : ""}
          <div><div class="k">Listed on</div><a class="v" href="${esc(t.source_url)}" target="_blank" rel="noopener">${esc(src.name || "Omarchy Themes")}</a></div>
          ${canInstallTheme(t) ? `<div><div class="k">Install command</div><div class="v"><code class="small">${esc(themeCmd(t))}</code></div></div>` : ""}
        </div>
        <div class="trust">${ico("ok")}<div>${t.builtin ? "This theme ships with Omarchy, so nothing is downloaded: the store just switches to it." : "Installing copies this theme from its GitHub page into ~/.config/omarchy/themes and switches to it. Themes change colors and wallpapers only."}
          <div style="margin-top:6px">Theme by ${esc(t.author || "its creator")} · listed via <a style="color:var(--accent)" href="${esc(t.source_url)}" target="_blank" rel="noopener">${esc(src.name || "omarchythemes.com")}</a>. Third-party content, provided as-is: <a style="color:var(--accent)" href="/legal/">disclaimer</a>.</div></div></div>
      </section>
      ${themeShelf(t.mode === "light" ? "More light themes" : "More dark themes", more, "/themes/")}
      ${footer()}
    </div>`;
  }

  function webThemeGet(t) {
    const cmd = themeCmd(t);
    showSheet(`<div class="sheet-card" role="dialog" aria-label="Get ${esc(t.name)}">
      <div class="row"><div class="swatch big">${swatches(t, 6)}</div><div><h3>Get ${esc(t.name)}</h3><div class="muted small">${t.builtin ? "Built into Omarchy" : "From github.com/" + esc(t.repo)}</div></div></div>
      <div class="small muted">Paste this into a terminal (<b>Super + Return</b>). It installs the theme and switches to it:</div>
      <div class="code"><code>${esc(cmd)}</code><button class="btn" data-copy="${esc(cmd)}">Copy</button></div>
      <div class="small muted">Want one-click themes? <a style="color:var(--accent)" href="/get-desktop/" data-close>Get the desktop app</a>.</div>
      <div style="text-align:right;margin-top:16px"><button class="btn ghost" data-close>Done</button></div>
    </div>`);
  }

  async function desktopTheme(t, path) {
    const key = "theme:" + t.id;
    S.busy.add(key); rerender();
    try {
      const r = await post(path, { id: t.id });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
      toast(path.endsWith("use") ? `Switching to ${t.name}…` : `Installing ${t.name}… follow the terminal window`);
      const t0 = Date.now();
      while (Date.now() - t0 < 5 * 60e3) {
        await new Promise((res) => setTimeout(res, 2000));
        const st = await (await fetch("/api/status", { cache: "no-store" })).json();
        S.themesHave = new Set(st.themes_installed || []); S.themeNow = st.theme_current || "";
        if (S.themeNow === t.install_name) { if (st.theme) applyTheme(st.theme); toast(`${t.name} is now your theme`); break; }
      }
    } catch (e) { toast("Theme failed: " + e.message); }
    S.busy.delete(key); rerender();
  }

  // ---------- pages ----------
  function pageDiscover() {
    const { hero, collections } = S.catalog.featured;
    const apps = S.catalog.apps;
    const fresh = [...apps].filter((a) => a.released_at).sort((x, y) => new Date(y.released_at) - new Date(x.released_at)).slice(0, 12);
    const games = apps.filter((a) => a.category === "games");
    const spot = apps.find((a) => a.featured);
    return `<div class="page">
      <h1 class="page-title">Discover</h1>
      ${spot ? spotlight(spot) : ""}
      ${igniteBanner()}
      <div class="scroller hero">${hero.map((h) => {
        const a = S.byId[h.app];
        const [g1, g2] = h.gradient;
        const shot = a.screenshots[0];
        return `<a class="hero-card" href="/app/${a.id}/" style="background:linear-gradient(135deg,${g1},${g2})">
          <div class="shot">${shot ? `<img src="${esc(shot)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<img class="glyph" src="${esc(asset(a.icon))}" alt="">`}</div>
          <div><div class="eyebrow">${esc(h.eyebrow)}</div><h3>${esc(h.headline)}</h3></div>
          <div class="lockup">${iconImg(a, 48)}<div class="meta"><div class="name">${esc(a.name)}</div><div class="sub">${esc(a.summary)}</div></div>${getBtn(a)}</div>
        </a>`;
      }).join("")}</div>
      ${themesBanner()}
      ${themeShelf("Make it yours: Themes", S.catalog.themes.filter((t) => t.palette?.length && t.image).slice(0, 14), "/themes/")}
      ${shelf(collections[0].title, collections[0].apps.map((id) => S.byId[id]))}
      ${bannerAd()}
      <section class="shelf">
        <div class="shelf-head"><h2>Top Charts</h2><a href="/charts/">See All</a></div>
        <div class="scroller rows3">${apps.slice(0, 12).map((a, i) => lockup(a, { rank: i + 1 })).join("")}</div>
      </section>
      ${collections.slice(1).map((c) => shelf(c.title, c.apps.map((id) => S.byId[id]))).join("")}
      ${shelf("Fresh Updates", fresh)}
      ${shelf("Games", games, "/category/games/")}
      ${shelf("Terminal power tools", apps.filter((a) => a.category === "terminal"), "/category/terminal/")}
      ${footer()}
    </div>`;
  }

  // ---------- Featured spotlight (billboard on Discover) ----------
  const FICON = {
    dock: '<rect x="3" y="15" width="18" height="5" rx="2.5"/><rect x="5" y="4" width="14" height="8" rx="2"/>',
    grid: '<rect x="3" y="3" width="8" height="18" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
    window: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M15 6.5h.01M18 6.5h.01"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
    backup: '<path d="M12 3v10m0 0-4-4m4 4 4-4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    drag: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="3" y="4" width="9" height="16" rx="2" fill="currentColor" opacity=".35"/><path d="M15 12h4m-2-2 2 2-2 2"/>',
    assist: '<rect x="3" y="4" width="8" height="16" rx="2"/><rect x="13" y="4" width="8" height="7" rx="1.5"/><rect x="13" y="13" width="8" height="7" rx="1.5" stroke-dasharray="2 2"/>',
    pin: '<path d="M9 4h6l-1 5 3 3H7l3-3zM12 12v8"/>',
    resize: '<path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"/>',
    palette: '<path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5C21 6.4 17 3 12 3z"/>',
    power: '<path d="M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0"/>',
    doctor: '<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/><path d="M9 12h2l1-2 1 4 1-2h1"/>',
    update: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
    infinity: '<path d="M18.2 8.4c-2.4 0-4 3.6-6.2 3.6S8.2 8.4 5.8 8.4a3.6 3.6 0 0 0 0 7.2c2.4 0 4-3.6 6.2-3.6s3.8 3.6 6.2 3.6a3.6 3.6 0 0 0 0-7.2z"/>',
  };
  const fico = (n) => `<svg viewBox="0 0 24 24">${FICON[n] || ""}</svg>`;
  function themesBanner() {
    const th = S.catalog.themes.filter((t) => t.image && t.palette?.length && t.mode !== "light");
    if (th.length < 12) return "";
    const pick = [];
    const step = Math.floor(th.length / 12);
    for (let i = 0; i < 12; i++) pick.push(th[i * step]);
    const creators = new Set(S.catalog.themes.map((t) => t.author).filter(Boolean)).size;
    return `<a class="spot full theme-spot" href="/themes/">
      <div class="ts-wall" aria-hidden="true">${pick.map((t) => `<img src="${esc(themeImg(t))}" alt="" loading="lazy">`).join("")}</div>
      <div class="spot-copy">
        <div class="spot-badge rainbow">${ico("palette")}Themes</div>
        <h2>${S.catalog.themes.length} themes.<br>One click.</h2>
        <p>Change your whole desktop in a click: terminal, bar, launcher, lock screen and wallpaper.${creators > 20 ? ` Free, from ${creators} creators.` : " Free."}</p>
        <div class="spot-lock"><span class="ts-ico">${ico("palette")}</span><div><div class="name">Omarchy Themes</div><div class="sub">Free · preview every one</div></div><span class="get big">BROWSE</span></div>
      </div>
    </a>`;
  }
  function igniteBanner() {
    const iso = S.catalog.omarchy_iso;
    return `<a class="spot full ignite-spot" href="/get-omarchy/">
      <img class="spot-bg" src="/featured/ignite/billboard.webp" alt="Get Omarchy: make an installer USB with Ignite" loading="lazy">
      <div class="spot-copy">
        <div class="spot-badge fire"><svg viewBox="0 0 24 24"><path d="M12 2l2.6 6.3 6.9.6-5.2 4.6 1.6 6.8L12 16.8 6.1 20.3l1.6-6.8L2.5 8.9l6.9-.6z"/></svg>New to Omarchy?</div>
        <h2>Get Omarchy. Free.</h2>
        <p>The beautiful Linux desktop everyone's talking about. Make the installer USB with Ignite, keep Windows if you like, and have the Omarchy Store ready in minutes.</p>
        <div class="spot-lock"><img class="icon" src="/featured/ignite/icon-128.png" width="64" height="64" alt=""><div><div class="name">Get Omarchy</div><div class="sub">Free${iso ? ` · Omarchy ${esc(iso.version)}` : ""} · about 15 minutes</div></div><span class="get big">START</span></div>
      </div>
    </a>`;
  }
  function spotlight(a) {
    const f = a.featured;
    const [g1, g2, g3] = f.gradient;
    if (f.billboard) return `<a class="spot full" href="/app/${a.id}/" style="--g1:${g1};--g2:${g2};--g3:${g3 || g2}">
      <img class="spot-bg" src="${esc(asset(f.billboard))}" alt="${esc(a.name)}: ${esc(f.headline)}" loading="eager">
      <div class="spot-copy">
        <div class="spot-badge"><svg viewBox="0 0 24 24"><path d="M12 2l2.6 6.3 6.9.6-5.2 4.6 1.6 6.8L12 16.8 6.1 20.3l1.6-6.8L2.5 8.9l6.9-.6z"/></svg>${esc(f.badge)}</div>
        <h2>${esc(f.headline)}</h2>
        <p>${esc(f.tagline)}</p>
        ${f.chips ? `<div class="spot-chips">${f.chips.map((c) => `<span>${esc(c)}</span>`).join("")}</div>` : ""}
        <div class="spot-lock">${iconImg(a, 64)}<div><div class="name">${esc(a.name)}</div><div class="sub">${esc(f.launch_offer || f.price)}</div></div>${getBtn(a, true)}</div>
      </div>
    </a>`;
    return `<a class="spot" href="/app/${a.id}/" style="--g1:${g1};--g2:${g2};--g3:${g3 || g2}">
      <div class="spot-copy">
        <div class="spot-badge"><svg viewBox="0 0 24 24"><path d="M12 2l2.6 6.3 6.9.6-5.2 4.6 1.6 6.8L12 16.8 6.1 20.3l1.6-6.8L2.5 8.9l6.9-.6z"/></svg>${esc(f.badge)}</div>
        <h2>${esc(f.headline)}</h2>
        <p>${esc(f.tagline)}</p>
        <div class="spot-lock">${iconImg(a, 64)}<div><div class="name">${esc(a.name)}</div><div class="sub">${esc(f.launch_offer || f.price)}</div></div>${getBtn(a, true)}</div>
      </div>
      <div class="spot-art"><img src="${esc(asset(f.art))}" alt="${esc(a.name)} on Omarchy" loading="eager"></div>
    </a>`;
  }

  // "How to install": the traditional step-by-step, three ways.
  function installWays(a, ins) {
    const cmd = cmdFor(a);
    return `<section class="shelf" id="install"><div class="shelf-head"><h2>How to install ${esc(a.name)}</h2></div>
      <div class="install-ways">
        <div><span class="tag">Easiest</span><h3>With the Omarchy Store app</h3><ol>
          <li>Get the Omarchy Store app: <a style="color:var(--accent)" href="/get-desktop/">instructions</a> (one time only).</li>
          <li>Open it (<b>Super + Space</b>, type <b>Omarchy Store</b>) and find ${esc(a.name)}.</li>
          <li>Press <b>GET</b>. A window opens: type your computer's password and press Enter.</li>
          <li>Done. Open ${esc(a.name)} from the app launcher.</li></ol></div>
        <div><span class="tag">One command</span><h3>In a terminal</h3><ol>
          <li>Open a terminal: <b>Super + Enter</b>.</li>
          <li>Copy this line, paste it (<b>Ctrl + Shift + V</b>) and press Enter:
            <div class="code"><code>${esc(cmd)}</code><button class="btn ghost" data-copy="${esc(cmd)}">Copy</button></div></li>
          <li>Type your password when asked (nothing shows while you type) and press Enter.</li>
          <li>When it says <b>installed</b>, open ${esc(a.name)} from the app launcher.</li></ol></div>
        <div><span class="tag">Download</span><h3>Installer file</h3><ol>
          <li><a style="color:var(--accent)" href="${esc(ins.file)}" download>Download the installer</a> (${esc(ins.file_name)}). It goes to your Downloads folder.</li>
          <li>Open a terminal: <b>Super + Enter</b>.</li>
          <li>Type <code>bash ~/Downloads/${esc(ins.file_name)}</code> and press Enter.</li>
          <li>When it says <b>Done!</b>, open ${esc(a.name)} from the app launcher. This way doesn't need your password.</li></ol></div>
      </div>
      ${ins.note ? `<div class="trust">${ico("ok")}<div>${esc(ins.note)}</div></div>` : ""}
    </section>`;
  }

  function featuredSections(a) {
    const f = a.featured;
    return `
      ${f.heads_up ? `<section class="trust warn" style="margin:22px 0 6px">${ico("warn")}<div><b>${esc(f.heads_up.title)}</b><div style="margin-top:4px">${esc(f.heads_up.body)}</div></div></section>` : ""}
      ${f.promise ? `<section class="promise"><span class="feat-ic">${fico("infinity")}</span><div><h3>${esc(f.promise.title)}</h3><p>${esc(f.promise.body)}</p></div></section>` : ""}
      ${f.features.length > 4 ? `<section class="shelf"><div class="shelf-head"><h2>Everything SnapDock does</h2></div></section>` : ""}
      <section class="shelf feat-grid ${f.features.length > 4 ? "many" : ""}">${f.features.map((x, i) => `<div class="feat ${x.hero ? "hero-feat" : ""}"><span class="feat-ic">${fico(x.icon)}</span><div><h3>${esc(x.title)}</h3><p>${esc(x.body)}</p></div></div>`).join("")}</section>
      ${f.install ? installWays(a, f.install) : ""}
      <section class="shelf"><div class="shelf-head"><h2>Get started in 3 steps</h2></div>
        <ol class="steps">${f.steps.map((s, i) => `<li><span class="n">${i + 1}</span><div><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p></div></li>`).join("")}</ol></section>
      <section class="shelf"><div class="shelf-head"><h2>Keyboard shortcuts</h2></div>
        <div class="kbd-table">${f.shortcuts.map((s) => `<div class="row"><div class="keys">${s.keys.map((k) => `<kbd>${esc(k)}</kbd>`).join('<span class="plus">+</span>')}</div><div class="does">${esc(s.does)}</div></div>`).join("")}</div></section>
      <section class="shelf"><div class="shelf-head"><h2>Questions</h2></div>
        <div class="faq">${f.faq.map((x) => `<details><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join("")}</div></section>`;
  }

  function pageCharts() {
    const cats = [{ id: "all", name: "All Apps" }, ...S.catalog.categories];
    const list = S.catalog.apps.filter((a) => S.chartCat === "all" || a.category === S.chartCat);
    return `<div class="page">
      <h1 class="page-title">Top Charts</h1>
      <p class="page-sub">${S.catalog.apps.length} apps ranked by GitHub stars. Updated weekly.</p>
      <div class="tabs">${cats.map((c) => `<button data-chart="${c.id}" class="${S.chartCat === c.id ? "on" : ""}">${esc(c.name)}</button>`).join("")}</div>
      <div class="chart">${list.map((a, i) => lockup(a, { rank: i + 1, sub: catName(a.category) })).join("")}</div>
      ${footer()}
    </div>`;
  }

  function pageCategories() {
    return `<div class="page">
      <h1 class="page-title">Categories</h1>
      <div class="cat-tiles">${S.catalog.themes.length ? `
        <a class="cat-tile cat-themes" href="/themes/">
          <span class="ci" style="background:linear-gradient(135deg,#ff5f6d,#ffc371 35%,#47cf73 65%,#3a7bd5)">${ico("palette")}</span>
          <span>Themes<div class="muted small">${S.catalog.themes.length} themes</div></span>
        </a>` : ""}${S.catalog.categories.map((c, i) => `
        <a class="cat-tile" href="/category/${c.id}/">
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
      <p class="page-sub">${list.length} apps · sorted by GitHub stars</p>
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

  // ---------- updates (desktop app) ----------
  S.upd = null; S.updLoading = false;
  async function loadUpdates(force) {
    if (!S.desktop || S.updLoading) return;
    S.updLoading = true; if (force && currentPath() === "updates") rerender();
    try {
      S.upd = await (await fetch("/api/updates" + (force ? "?refresh=1" : ""), { cache: "no-store" })).json();
    } catch { S.upd = S.upd || { apps: [], system: 0, aur: 0, running: [], error: true }; }
    S.updLoading = false;
    const n = (S.upd.apps || []).length, c = $("#upd-count");
    if (c) { c.textContent = n; c.hidden = !n; }
    if (currentPath() === "updates") rerender();
  }
  function pageUpdates() {
    if (!S.desktop) return `<div class="page"><h1 class="page-title">Updates</h1><div class="empty">Updates are managed by the <a href="/get-desktop/" style="color:var(--accent)">desktop app</a>.</div></div>`;
    if (!S.upd) { loadUpdates(false); }
    const u = S.upd, apps = (u?.apps || []).map((x) => ({ ...x, a: S.byId[x.id] })).filter((x) => x.a);
    const running = new Set(u?.running || []);
    const others = Math.max(0, (u?.system || 0) + (u?.aur || 0) - apps.length);
    const when = u?.checked ? new Date(u.checked * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
    const storeBanner = S.status?.restart_needed
      ? `<div class="upd-store"><div><b>A new version of Omarchy Store is ready</b><span>Version ${esc(S.status.store_update || "")} has been downloaded.</span></div><button class="btn" data-restart>Restart store</button></div>` : "";
    return `<div class="page">
      <div class="upd-head">
        <div><h1 class="page-title">Updates</h1>
        <p class="page-sub">${S.updLoading && !u ? "Checking for updates…" : u ? `Last checked ${esc(when)} · Omarchy Store ${esc(S.status?.version || "")}` : ""}</p></div>
        <div class="upd-actions">
          <button class="btn ghost" data-upd-refresh ${S.updLoading ? "disabled" : ""}>${S.updLoading ? '<span class="ring"></span> Checking' : "Check now"}</button>
          ${u && (apps.length || others) ? `<button class="btn" data-upd-all ${running.has("__all__") ? "disabled" : ""}>${running.has("__all__") ? "Updating…" : "Update All"}</button>` : ""}
        </div>
      </div>
      ${storeBanner}
      ${!u ? `<div class="empty"><span class="ring big"></span><br>Checking your apps…</div>` :
        !apps.length && !others ? `<div class="upd-ok">${ico("installed")}<div><b>Everything is up to date</b><span>Your store apps and Omarchy are on the latest versions.</span></div></div>` : ""}
      ${apps.length ? `<h2 class="upd-sec">Store apps <span>${apps.length}</span></h2>
        <div class="upd-list">${apps.map(({ a, installed, latest, via }) => `
          <div class="upd-row">
            <a href="/app/${a.id}/">${iconImg(a, 56)}</a>
            <div class="upd-meta"><a href="/app/${a.id}/" class="name">${esc(a.name)}</a>
              <span class="ver">${esc(installed.split("-")[0])} → <b>${esc(latest.split("-")[0])}</b></span>
              ${via === "system" ? `<span class="note">Updates with your system (Update All)</span>` : ""}</div>
            <button class="get ${running.has(a.id) ? "busy" : ""}" data-upd="${a.id}" ${running.has(a.id) ? "disabled" : ""}>${running.has(a.id) ? '<span class="ring"></span>' : "UPDATE"}</button>
          </div>`).join("")}</div>` : ""}
      ${others ? `<div class="upd-sys">${ico("grid")}<div><b>${others} system package${others === 1 ? "" : "s"} can be updated</b>
        <span>Omarchy and its built-in parts. <b>Update All</b> runs Omarchy's own updater, which takes a safety snapshot first.</span></div></div>` : ""}
      <p class="small muted" style="margin-top:28px">Updates open a terminal window so you can see what's happening and type your password. Omarchy Store checks for new apps and for a newer version of itself every hour.</p>
    </div>`;
  }
  async function doUpdate(path, body, label) {
    const r = await post(path, body);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return toast(j.error || "Update failed");
    toast(label + " — follow the terminal window");
    loadUpdates(false);
    const t0 = Date.now();
    const tick = setInterval(async () => {
      await loadUpdates(false);
      if (!(S.upd?.running || []).length || Date.now() - t0 > 30 * 60e3) { clearInterval(tick); refreshInstalled(); }
    }, 8000);
  }



  // ---------- Submit an app / Advertise (own pages, not GitHub file links) ----------
  function pageSubmit() {
    const form = `${REPO}/issues/new?template=submit-app.yml`;
    return `<div class="page info-page" style="max-width:860px">
      <h1 class="page-title">Submit an app</h1>
      <p class="page-sub">Listing is free. Every app is reviewed by a person before it goes live, and paying for ads never changes rankings.</p>
      <div class="info-cards">
        <div class="info-card"><span class="go-n">1</span><div><h3>Tell us about it</h3><p>Fill in a short form: name, link, package name, category and a one-line summary.</p></div></div>
        <div class="info-card"><span class="go-n">2</span><div><h3>We review it</h3><p>We check it installs from Arch, the AUR or an Omarchy installer, and that it's safe.</p></div></div>
        <div class="info-card"><span class="go-n">3</span><div><h3>It goes live</h3><p>Your app gets its own page with stars, screenshots, a GET button and updates.</p></div></div>
      </div>
      <div class="info-cta"><a class="btn big" href="${form}" target="_blank" rel="noopener">Submit your app</a>
        <span class="muted small">Opens a short form on GitHub (free account needed).</span></div>
      <section class="shelf"><div class="shelf-head"><h2>Listing rules</h2></div>
        <ul class="info-list">
          <li><b>Installs through a package manager:</b> Arch repos, the AUR, or an Omarchy installer. No <code>curl | bash</code>, AppImages or custom scripts.</li>
          <li><b>AUR packages</b> need an active maintainer, must not be flagged out of date, and need some votes.</li>
          <li><b>No malware</b>, cracked software, or apps mainly for piracy.</li>
          <li>Apps that stop being maintained (archived repo, orphaned package) are removed.</li>
          <li>Top Charts are ranked by GitHub stars only.</li>
        </ul></section>
      <section class="shelf"><div class="shelf-head"><h2>Developers: sell your app</h2></div>
        <p>Paid apps are coming to the Omarchy Store, with payouts in crypto and a 10% store fee. <a style="color:var(--accent)" href="${REPO}/issues/new?template=submit-app.yml" target="_blank" rel="noopener">Submit your app</a> and say you're interested.</p></section>
      <p class="small muted">Technical people can also open a pull request directly: <a style="color:var(--accent)" href="https://raw.githubusercontent.com/omarchy-community/store/main/CONTRIBUTING.md" target="_blank" rel="noopener">contributor guide</a>.</p>
      ${footer()}
    </div>`;
  }
  function pageAdvertise() {
    const form = `${REPO}/issues/new?template=advertising.yml`;
    return `<div class="page info-page" style="max-width:860px">
      <h1 class="page-title">Advertise on the Omarchy Store</h1>
      <p class="page-sub">Reach Omarchy and Arch Linux users: developers, creators and power users who chose their own OS.</p>
      <div class="info-cards">
        <div class="info-card"><span class="go-n">▣</span><div><h3>Discover banner</h3><p>A big banner between shelves on the store's front page.</p></div></div>
        <div class="info-card"><span class="go-n">★</span><div><h3>Sponsored app</h3><p>Your listing at the top of a category or search results, with an Ad badge.</p></div></div>
        <div class="info-card"><span class="go-n">⌕</span><div><h3>Search banner</h3><p>A compact banner under search results.</p></div></div>
      </div>
      <div class="info-cta"><a class="btn big" href="${form}" target="_blank" rel="noopener">Ask about advertising</a>
        <span class="muted small">Flat monthly pricing per slot. We reply with rates and availability.</span></div>
      <section class="shelf"><div class="shelf-head"><h2>What we accept</h2></div>
        <ul class="info-list">
          <li>Developer tools, hardware, hosting, VPNs and privacy tools, Linux-friendly software and services, courses, conferences and music.</li>
          <li>We don't accept gambling, malware or "PC cleaner" software, or misleading claims.</li>
        </ul></section>
      <section class="shelf"><div class="shelf-head"><h2>Respectful by design</h2></div>
        <ul class="info-list">
          <li>Every ad is clearly labelled <b>Sponsored</b> or <b>Ad</b>.</li>
          <li>Ads never change Top Charts or search ranking.</li>
          <li>No tracking pixels and no third-party cookies.</li>
        </ul></section>
      ${footer()}
    </div>`;
  }

  // ---------- Get Omarchy: the landing page for people who don't have Omarchy yet ----------
  function pageGetOmarchy() {
    const iso = S.catalog.omarchy_iso;
    const inst = `curl -fsSL ${SITE}install.sh | bash`;
    const shots = (S.catalog.themes || []).filter((t) => t.image && t.stars).slice(0, 6);
    const step = (n, title, body) => `<li class="go-step"><span class="go-n">${n}</span><div><h3>${title}</h3>${body}</div></li>`;
    return `<div class="page go">
      <section class="go-hero">
        <div class="go-copy">
          <div class="eyebrow">THE LINUX DESKTOP EVERYONE'S TALKING ABOUT</div>
          <h1>Get Omarchy.</h1>
          <p>Omarchy is a free, fast and beautiful desktop for your PC, made by DHH (creator of Ruby on Rails). It replaces Windows, or lives right next to it. Here's the whole thing, step by step, in about 15 minutes.</p>
          <div class="go-cta">
            <a class="btn big" href="#step1">Start: make the USB</a>
            ${iso ? `<span class="muted small">Latest: Omarchy ${esc(iso.version)} · free · ${gb(iso.size)}</span>` : ""}
          </div>
        </div>
        <div class="go-mosaic">${shots.map((t) => `<img src="${esc(themeImg(t))}" alt="Omarchy with the ${esc(t.name)} theme" loading="eager">`).join("")}</div>
      </section>

      <section class="go-need">
        <div><b>A PC</b><span>Any 64-bit PC or laptop from the last ~10 years</span></div>
        <div><b>A USB stick</b><span>8 GB or bigger. It will be erased</span></div>
        <div><b>15 minutes</b><span>Most of it is waiting</span></div>
        <div><b>Keep Windows?</b><span>Yes, if you want. <a href="/ignite/#windows">How</a></span></div>
      </section>

      <ol class="go-steps">
        ${step(1, `<span id="step1"></span>Make the installer USB`, `
          <div class="go-two">
            <div class="go-opt">
              <div class="go-tag">On Windows or Mac</div>
              <ol class="usb-list">
                <li>${iso ? `<a class="btn" href="${esc(iso.url)}">Download Omarchy ${esc(iso.version)}</a>` : `<a class="btn" href="https://omarchy.org/" target="_blank" rel="noopener">Download Omarchy</a>`}</li>
                <li>Get free <a href="https://rufus.ie" target="_blank" rel="noopener">Rufus</a> (Windows) or <a href="https://etcher.balena.io" target="_blank" rel="noopener">balenaEtcher</a> (Windows &amp; Mac).</li>
                <li>Choose the Omarchy file, choose your USB stick, press <b>Start</b> / <b>Flash</b>. In Rufus pick <b>GPT</b>.</li>
              </ol></div>
            <div class="go-opt ignite-opt">
              <div class="go-tag"><img src="/featured/ignite/icon-64.png" alt="">Already on Omarchy or Linux?</div>
              <p class="small">Use <b>Ignite</b> in the Omarchy Store app: it downloads the newest Omarchy, checks it's genuine and writes the USB in one click. Great for setting up a friend's PC.</p>
              <a class="btn ghost" href="/ignite/">Open Ignite</a></div>
          </div>`)}
        ${step(2, "Choose: replace Windows, or keep it", `
          <div class="go-two">
            <div class="go-opt"><div class="go-tag">Simplest</div><h4>Omarchy only</h4><p class="small">The installer uses the whole drive. <b>Everything on it is erased</b>, so back up your files first.</p></div>
            <div class="go-opt"><div class="go-tag">Keep Windows</div><h4>Omarchy next to Windows</h4><p class="small">Make some empty space on the drive first (about 2 minutes in Windows), then choose <b>Free space install</b>. You pick Windows or Omarchy every time you start the PC.</p><a class="btn ghost" href="/ignite/#windows">Show me how</a></div>
          </div>`)}
        ${step(3, "Install Omarchy", `<ol class="usb-list">
            <li>Plug in the USB stick and restart. Open the boot menu: usually <b>F12</b>, <b>F11</b>, <b>F8</b> or <b>Esc</b> right after power-on, and pick the USB stick.</li>
            <li>If it won't start, turn off <b>Secure Boot</b> in the BIOS settings.</li>
            <li>Answer a few questions (name, password, keyboard). Omarchy installs itself in a few minutes.</li></ol>`)}
        ${step(4, "Get the Omarchy Store", `<p class="small">Your new desktop is ready. Add the store to install apps, themes and SnapDock with one click:</p>
          <ol class="usb-list">
            <li>Press <b>Super + Enter</b> to open a terminal. (Super is the Windows key.)</li>
            <li>Paste this and press Enter:
              <div class="code"><code>${esc(inst)}</code><button class="btn" data-copy="${esc(inst)}">Copy</button></div></li>
            <li>Open <b>Omarchy Store</b> from the app launcher (<b>Super + Space</b>). Done.</li></ol>`)}
      </ol>

      <section class="shelf"><div class="shelf-head"><h2>Questions</h2></div>
        <div class="faq">
          <details><summary>Is Omarchy really free?</summary><p>Yes. Omarchy is free and open source. So is the Omarchy Store, and almost every app in it.</p></details>
          <details><summary>Will it erase my computer?</summary><p>Only if you choose to use the whole drive. To keep Windows and your files, follow "Keep Windows" in step 2 and choose Free space install. Always back up important files first.</p></details>
          <details><summary>Can I play games?</summary><p>Yes. Steam runs most Windows games on Omarchy, and the store has Steam, Heroic (Epic &amp; GOG), Lutris and more.</p></details>
          <details><summary>I'm coming from Windows. Will I feel lost?</summary><p>Install <a href="/app/snapdock/">SnapDock</a> from the store: a frosted glass dock and Windows-style window snapping, so it feels familiar from day one.</p></details>
          <details><summary>Who makes Omarchy?</summary><p>Omarchy is made by DHH and the Omarchy community. The Omarchy Store is an independent community project; we link to the official Omarchy download and don't change it.</p></details>
        </div></section>
      ${footer()}
    </div>`;
  }

  // ---------- USB maker ----------
  S.usb = null;
  const gb = (n) => (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + " GB";
  async function loadUsb() {
    try { S.usb = await (await fetch("/api/usb", { cache: "no-store" })).json(); } catch { S.usb = { error: true }; }
    if (["usb", "ignite"].includes(currentPath())) rerender();
    const st = S.usb?.download?.state;
    clearTimeout(loadUsb.t);
    if (["usb", "ignite"].includes(currentPath())) loadUsb.t = setTimeout(loadUsb, st === "downloading" || st === "verifying" ? 1000 : 4000);
  }
  function usbSteps(n) {
    const L = ["Get Omarchy", "Pick your USB", "Make installer"];
    return `<ol class="usb-steps">${L.map((t, i) => `<li class="${i < n ? "done" : i === n ? "on" : ""}"><span>${i < n ? "✓" : i + 1}</span>${t}</li>`).join("")}</ol>`;
  }
  function pageUsb() {
    const iso = S.desktop ? S.usb?.iso : S.catalog.omarchy_iso;
    const hero = `<section class="usb-hero ignite">
        <img class="ignite-icon" src="/featured/ignite/icon-256.png" alt="Ignite for Omarchy">
        <div><div class="eyebrow">FEATURED · FREE TOOL</div>
          <h1>Ignite <span>for Omarchy</span></h1>
          <p>Turn any USB stick into an Omarchy installer in one click. Ignite always downloads the newest official Omarchy${iso ? `, right now <b>${esc(iso.version)}</b>,` : ""} and checks it's genuine before writing. Keeping Windows? Ignite makes room for Omarchy right next to it.</p>
          <div class="ignite-chips"><span>✓ Always the newest Omarchy</span><span>✓ Checked genuine (SHA-256)</span><span>✓ Only shows USB sticks</span><span>✓ Install next to Windows</span></div></div>
      </section>`;
    if (!S.desktop) {
      return `<div class="page">${hero}
        <div class="usb-grid">
          <div class="usb-card"><h3>The one-click way (on Omarchy)</h3>
            <p>Get the Omarchy Store desktop app, open <b>Ignite</b>, plug in a USB stick and press <b>Make Installer</b>. The app downloads the latest Omarchy, verifies it and writes the stick for you.</p>
            <a class="btn" href="/get-desktop/">Get the desktop app</a></div>
          <div class="usb-card"><h3>On Windows or Mac</h3>
            <ol class="usb-list">
              <li>Download the latest Omarchy${iso ? ` (${esc(iso.version)}, ${gb(iso.size)})` : ""}:<br>${iso ? `<a class="btn" href="${esc(iso.url)}">Download Omarchy ${esc(iso.version)}</a>` : `<a class="btn" href="https://omarchy.org/#install" target="_blank" rel="noopener">Download from omarchy.org</a>`}</li>
              <li>Get a free USB writer: <a href="https://rufus.ie" target="_blank" rel="noopener">Rufus</a> (Windows) or <a href="https://etcher.balena.io" target="_blank" rel="noopener">balenaEtcher</a> (Windows & Mac).</li>
              <li>Open it, choose the Omarchy file, choose your USB stick, press <b>Start</b> / <b>Flash</b>.</li>
            </ol>
            ${iso ? `<p class="small muted">Check the download is genuine — SHA-256: <code class="small">${esc(iso.sha256)}</code></p>` : ""}</div>
        </div>
        ${usbAfter()}
      </div>`;
    }
    if (!S.usb) { loadUsb(); return `<div class="page">${hero}<div class="empty"><span class="ring big"></span><br>Looking for the latest Omarchy…</div></div>`; }
    if (!S.usb.iso) return `<div class="page">${hero}<div class="empty">Couldn't reach Omarchy's download server. Check your internet connection and try again.<br><br><button class="btn" data-usb-refresh>Try again</button></div></div>`;
    const u = S.usb, dl = u.download || {}, drives = u.drives || [];
    const step = !u.ready ? 0 : !S.usbPick ? 1 : 2;
    const pct = dl.total ? Math.floor((dl.done / dl.total) * 100) : 0;
    const eta = dl.started && dl.done ? Math.max(0, Math.round(((Date.now() / 1000 - dl.started) / dl.done) * (dl.total - dl.done))) : null;
    const pick = drives.find((d) => d.path === S.usbPick);
    if (S.usbPick && !pick) S.usbPick = null;
    const writing = S.jobUsb;
    return `<div class="page">${hero}${usbSteps(step)}
      <div class="usb-card">
        <div class="usb-row"><span class="usb-n">1</span><div class="grow"><h3>Get Omarchy ${esc(u.iso.version)}</h3>
          <p class="muted small">${gb(u.iso.size)} · official download from iso.omarchy.org · checked against Omarchy's SHA-256</p>
          ${dl.state === "downloading" ? `<div class="bar"><i style="width:${pct}%"></i></div><p class="small muted">${pct}% · ${gb(dl.done)} of ${gb(dl.total)}${eta != null ? ` · about ${eta > 90 ? Math.round(eta / 60) + " min" : eta + " s"} left` : ""}</p>` : ""}
          ${dl.state === "verifying" ? `<p class="small"><span class="ring"></span> Checking it's genuine…</p>` : ""}
          ${dl.state === "failed" ? `<p class="small err">${esc(dl.error || "Download failed")}</p>` : ""}
          ${u.ready ? `<p class="small ok">✓ Downloaded and verified · saved in your Downloads folder</p>` : ""}
        </div>
        ${u.ready ? "" : `<button class="btn" data-usb-dl ${["downloading", "verifying"].includes(dl.state) ? "disabled" : ""}>${dl.state === "downloading" ? "Downloading…" : dl.state === "verifying" ? "Verifying…" : dl.state === "failed" ? "Try again" : "Download"}</button>`}
        </div>
      </div>
      <div class="usb-card ${u.ready ? "" : "dim"}">
        <div class="usb-row"><span class="usb-n">2</span><div class="grow"><h3>Plug in a USB stick</h3>
          <p class="muted small">At least 8 GB. Everything on it will be erased. Only USB drives are shown — never your computer's own drives.</p></div>
          <button class="btn ghost" data-usb-refresh>Refresh</button></div>
        ${drives.length ? `<div class="usb-drives">${drives.map((d) => `<button class="usb-drive ${S.usbPick === d.path ? "on" : ""}" data-usb-pick="${esc(d.path)}" ${d.size < 7e9 ? "disabled" : ""}>
            ${ico("usb")}<div><b>${esc(d.name)}</b><span>${gb(d.size)} · ${esc(d.path)}${d.size < 7e9 ? " · too small" : ""}</span></div></button>`).join("")}</div>`
          : `<div class="usb-empty">No USB stick found. Plug one in — it appears here automatically.</div>`}
      </div>
      <div class="usb-card ${pick && u.ready ? "" : "dim"}">
        <div class="usb-row"><span class="usb-n">3</span><div class="grow"><h3>Make the installer</h3>
          <p class="muted small">${pick ? `Writes Omarchy ${esc(u.iso.version)} to <b>${esc(pick.name)}</b> (${gb(pick.size)}). A terminal asks for your password, then shows progress. Takes about 2–10 minutes.` : "Pick a USB stick above first."}</p></div>
          <button class="btn danger" data-usb-write ${pick && u.ready && !writing ? "" : "disabled"}>Make Installer</button></div>
      </div>
      ${usbAfter()}
    </div>`;
  }
  function igniteWindows() {
    const w = S.catalog.ignite || {};
    return `<section class="usb-card ignite-win" id="windows">
      <div class="usb-row"><span class="usb-n win">⊞</span><div class="grow"><h3>Keep Windows: install Omarchy next to it</h3>
        <p class="muted small">Omarchy 4 can install into empty space on your drive and leave Windows alone. You choose Windows or Omarchy each time you start the computer. You just need to make that empty space first, on the Windows computer.</p></div></div>
      <div class="ignite-cols">
        <div><h4>The easy way: Make room for Omarchy</h4>
          ${w.helper_ready ? `<ol class="usb-list">
            <li>On the Windows PC, download <a href="/ignite/Make-room-for-Omarchy.zip" download><b>Make room for Omarchy</b></a> and unzip it.</li>
            <li>Right-click <b>Make-room-for-Omarchy.cmd</b> → <b>Run as administrator</b>.</li>
            <li>Pick <b>50</b>, <b>100</b> or <b>200 GB</b>. It checks BitLocker, makes a restore point, and shrinks Windows with Windows' own tool. Nothing is deleted.</li></ol>`
          : `<p class="small"><span class="soon-pill">Coming soon</span> A one-click Windows helper that checks everything, makes a restore point and frees the space for you. It's being tested on real Windows PCs first. Until then, use the steps on the right: they take about 2 minutes.</p>`}
        </div>
        <div><h4>${w.helper_ready ? "Or by hand" : "By hand"} (Windows Disk Management)</h4>
          <ol class="usb-list">
            <li><b>Turn off BitLocker</b> if it's on: Settings → Privacy &amp; security → Device encryption → Off. Wait for it to finish.</li>
            <li>Press <b>Win + R</b>, type <code>diskmgmt.msc</code>, press Enter.</li>
            <li>Right-click your <b>C:</b> drive → <b>Shrink Volume</b>. Enter <b>51200</b> for 50 GB, <b>102400</b> for 100 GB or <b>204800</b> for 200 GB → <b>Shrink</b>.</li>
            <li>Leave the new black <b>Unallocated</b> space empty. Don't format it.</li></ol></div>
      </div>
      <div class="ignite-then"><b>Then:</b> start the computer from your Ignite USB stick, pick your drive, and choose <b>Free space install</b>. <span class="warn-t">Don't pick the whole-drive option: that erases Windows.</span> After Omarchy starts, type <code>limine-scan</code> in a terminal to add Windows to the start-up menu.</div>
      <p class="small muted">Back up anything important first. Shrinking a drive is safe, but not risk-free.</p>
    </section>`;
  }
  function usbAfter() {
    return igniteWindows() + `<section class="usb-card"><h3>Then install Omarchy</h3>
      <ol class="usb-list">
        <li>Plug the stick into the computer you want to install on and restart it.</li>
        <li>Open the boot menu — usually <b>F12</b>, <b>F11</b>, <b>F8</b> or <b>Esc</b> right after power-on — and choose the USB stick.</li>
        <li>Turn off <b>Secure Boot</b> in the BIOS if it won't start.</li>
        <li>Answer five questions. Omarchy installs in a few minutes. <a href="https://omarchy.org/manual/getting-started/" target="_blank" rel="noopener">Full guide</a></li>
      </ol>
      <p class="small muted">Ignite for Omarchy is a free community tool from the Omarchy Store, not an official Omarchy product. Omarchy is made by DHH and the Omarchy team; Ignite downloads it from the official server and does not change it. Writing a USB stick erases it — you're responsible for picking the right drive.</p></section>`;
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
    const tres = t.length < 2 ? [] : S.catalog.themes.filter((x) => (x.name + " " + x.author).toLowerCase().includes(t) || (t.includes("theme") && t.replace(/themes?/, "").trim() === ""));
    return `<div class="page">
      <h1 class="page-title">Results for “${esc(q)}”</h1>
      ${sponsoredApp((a) => res.includes(a))}
      ${themeShelf("Themes", tres.slice(0, 20), tres.length ? "/themes/" : "")}
      ${res.length ? `<div class="grid">${res.map((a) => lockup(a)).join("")}</div>`
        : tres.length ? "" : `<div class="empty">No apps match “${esc(q)}”.<br><br><a class="btn ghost" href="${REPO}/issues/new?template=app-request.yml&title=${encodeURIComponent("App request: " + q)}" target="_blank" rel="noopener">Request this app</a></div>`}
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
    const strip = a.featured ? [
      ["Price", esc(a.featured.price), esc(a.featured.price_note || a.featured.launch_offer || "")],
      ["Award", '<span style="color:#ffd60a">★</span>', esc(a.featured.badge)],
      ["Category", `<span style="color:var(--accent)">${ico(cat?.icon)}</span>`, esc(cat?.name)],
      ["Developer", `<span style="font-size:16px">${esc(a.developer || "—")}</span>`, "Verified"],
      ["Works with", "Omarchy", "Hyprland"],
      ["Age", "4+", "Rating"],
    ] : [
      ["GitHub Stars", a.stars != null ? k(a.stars) : "—", a.stars != null ? `#${a.rank} in store` : "Closed source"],
      [p.repo === "aur" ? "AUR Votes" : "Source", p.repo === "aur" ? k(p.votes) : (a.install.method === "omarchy" ? "Omarchy" : "Arch"), p.repo === "aur" ? "Community" : (p.repo || "Official")],
      ["Category", `<span style="color:var(--accent)">${ico(cat?.icon)}</span>`, esc(cat?.name)],
      ["Developer", `<span style="font-size:16px">${esc(a.developer || "—")}</span>`, a.github ? esc(a.github.split("/")[0]) : ""],
      ["Size", p.size ? mb(p.size) : "—", "Installed"],
      ["Age", esc(a.age ? a.age.replace("Early Childhood", "3+").replace("Everyone", "4+").replace("Teen", "13+").replace("Mature", "17+") : "—"), "Rating"],
    ];
    const F = a.featured;
    return `<div class="page">
      ${F ? `<div class="feat-hero" style="--g1:${F.gradient[0]};--g2:${F.gradient[1]};--g3:${F.gradient[2] || F.gradient[1]}"><img src="${esc(asset(F.art))}" alt=""><span class="spot-badge">${esc(F.badge)}</span></div>` : ""}
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

      ${a.screenshots.length ? `<div class="scroller shots">${a.screenshots.map((s) => `<img src="${esc(asset(s))}" alt="Screenshot of ${esc(a.name)}" loading="lazy" referrerpolicy="no-referrer" data-zoom>`).join("")}</div>` : ""}
      ${F ? featuredSections(a) : ""}

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
          ${a.license || !a.featured ? `<div><div class="k">License</div><div class="v">${esc(a.license || "Proprietary")}</div></div>` : ""}
          ${a.last_commit ? `<div><div class="k">Last code change</div><div class="v">${ago(a.last_commit)}</div></div>` : ""}
          <div><div class="k">Runs in</div><div class="v">${a.kind === "terminal" ? "Terminal" : "Desktop window"}</div></div>
          ${a.homepage ? `<div><div class="k">Website</div><a class="v" href="${esc(a.homepage)}" target="_blank" rel="noopener">${esc(a.homepage.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a></div>` : ""}
          ${ghUrl ? `<div><div class="k">Source code</div><a class="v" href="${ghUrl}" target="_blank" rel="noopener">github.com/${esc(a.github)}</a></div>` : ""}
          <div><div class="k">Install command</div><div class="v"><code class="small">${esc(cmdFor(a))}</code></div></div>
        </div>
        <div class="trust ${stale ? "warn" : ""}">${ico(stale ? "warn" : "ok")}<div>${stale
          ? (a.archived ? "This project's GitHub repository is archived and no longer maintained." : "This AUR package is flagged out of date by the community.")
          : a.install.method === "aur"
            ? "Installs from the AUR, Arch's community repository. Builds are community-maintained; the store only lists packages with an active maintainer and good standing."
            : "Installs from a signed, official package source. The store never runs code from a web page — it only calls your system package manager."}
          <div style="margin-top:6px">Third-party software, provided as-is. Install at your own risk — <a style="color:var(--accent)" href="/legal/">disclaimer</a>.</div></div></div>
      </section>

      ${related.length ? `<section class="shelf"><div class="shelf-head"><h2>More ${esc(cat?.name)}</h2><a href="/category/${a.category}/">See All</a></div>
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
      <p class="muted small">Prefer GitHub? Download the latest release from <a style="color:var(--accent)" href="${REPO}/releases/latest" target="_blank" rel="noopener">github.com/omarchy-community/store/releases</a>, unzip it and run <code>bash omarchy-store-*/install.sh</code>.</p>
      <p class="muted small">Then launch <b>Omarchy Store</b> from your app launcher (<b>Super + Space</b>). It installs to your home folder only and can be removed with <code>omarchy-store --uninstall</code>.
      Read the script first: <a style="color:var(--accent)" href="${SITE}install.sh" target="_blank" rel="noopener">install.sh</a>.</p>
      ${footer()}
    </div>`;
  }

  const DISCLAIMER_SHORT = "Apps in this store are third-party software made by other people. Omarchy Store does not create, own, review the code of, or control them, and provides them as-is with no warranty. You install and use them at your own risk.";

  function pageLegal() {
    return `<div class="page legal" style="max-width:780px">
      <h1 class="page-title">Disclaimer</h1>
      <p class="muted small">Last updated October 10, 2026</p>
      <h3>Third-party software</h3>
      <p>Every app listed in Omarchy Store is created, owned and maintained by independent third parties. Omarchy Store is a directory: it shows public information about those apps and, in the desktop app, asks your computer's own package manager (pacman, or an AUR helper) to install them from Arch Linux, the Arch User Repository (AUR), or Omarchy's package sources. Omarchy Store does not write, build, host, audit or control any of that software.</p>
      <h3>No warranty</h3>
      <p>Omarchy Store, its listings, and the software installed through it are provided <b>"AS IS" and "AS AVAILABLE", without warranty of any kind</b>, express or implied, including merchantability, fitness for a particular purpose, security, and non-infringement. We do not guarantee that any app is free of viruses, malware, spyware, bugs or other harmful components, or that listing information is accurate or current.</p>
      <h3>Limitation of liability</h3>
      <p>To the maximum extent permitted by law, the operators, maintainers and contributors of Omarchy Store <b>are not liable for any damage or loss</b> of any kind arising from your use of the store or of any software you install through it, including viruses or malware, data loss, system damage, security breaches, lost profits, or any direct, indirect, incidental or consequential damages, even if advised of the possibility of such damage.</p>
      <h3>Your responsibility</h3>
      <p>You are solely responsible for deciding what to install. Before installing, review the app's source code, package, license and reputation, and keep backups of important data. Packages from the AUR are community-maintained and are not reviewed or signed by Arch Linux. Installing system software requires administrator access; only proceed if you trust the app.</p>
      <h3>Advertising</h3>
      <p>Sponsored content is labelled "Sponsored" or "Ad" and links to third-party websites. Advertisers are solely responsible for their content, products and services. An ad is not an endorsement, and we are not responsible for anything on sites you visit through it.</p>
      <h3>Trademarks</h3>
      <p>App names, logos, icons and screenshots belong to their respective owners and are shown only to identify the software. Omarchy Store is an unofficial community project and is not affiliated with Omarchy, Basecamp, 37signals, Arch Linux, GitHub, Flathub or any listed developer.</p>
      <h3>Removal requests</h3>
      <p>If you own an app or trademark and want a listing changed or removed, <a style="color:var(--accent)" href="${REPO}/issues/new" target="_blank" rel="noopener">open an issue</a> and we will act promptly.</p>
      <p class="muted small">By using Omarchy Store you agree to this disclaimer. If you do not agree, do not use the store.</p>
      ${footer()}
    </div>`;
  }

  const notFound = () => `<div class="page"><div class="empty">That page doesn’t exist. <a style="color:var(--accent)" href="/">Back to Discover</a></div></div>`;
  const footer = () => `<div class="footer">
    <span class="disclaim">${DISCLAIMER_SHORT} <a href="/legal/">Full disclaimer</a></span>
    <span>Omarchy Store — unofficial, community-run. Not affiliated with Omarchy or Basecamp.</span>
    <a href="${REPO}" target="_blank" rel="noopener">GitHub</a>
    <a href="/submit/">Submit an app</a>
    <a href="/advertise/">Advertise</a>
    <span>Data updated ${ago(S.catalog.generated_at).toLowerCase()}</span>
  </div>`;

  // ---------- router ----------
  // Real URLs (/app/krita/) so every page can be indexed by search engines.
  // Old #/ links are upgraded in place so shared links keep working.
  function currentPath() {
    if (location.hash.startsWith("#/")) {
      const p = "/" + location.hash.slice(2).replace(/\/?$/, "/").replace(/^\/$/, "");
      history.replaceState(null, "", p || "/");
    }
    return decodeURIComponent(location.pathname).replace(/^\/+|\/+$/g, "");
  }
  function go(path) {
    if (path === location.pathname) return;
    history.pushState(null, "", path);
    closeSheet(); route();
  }

  function route() {
    const h = currentPath();
    const [p, arg] = h.split(/\/(.*)/s);
    let html, nav = p;
    if (!p) html = pageDiscover(), nav = "";
    else if (p === "charts") html = pageCharts();
    else if (p === "categories") html = pageCategories();
    else if (p === "themes") html = pageThemes();
    else if (p === "theme") html = pageTheme(arg), nav = "themes";
    else if (p === "category") html = pageCategory(arg), nav = "category/" + arg;
    else if (p === "app") html = pageApp(arg), nav = "category/" + (S.byId[arg]?.category || "");
    else if (p === "search") html = pageSearch(arg || "");
    else if (p === "installed") html = pageInstalled();
    else if (p === "updates") html = pageUpdates();
    else if (p === "usb" || p === "ignite") { if (p === "usb") history.replaceState(null, "", "/ignite/"); html = pageUsb(); nav = "get-omarchy"; }
    else if (p === "submit") html = pageSubmit();
    else if (p === "advertise") html = pageAdvertise();
    else if (p === "get-omarchy" || p === "get") { if (p === "get") history.replaceState(null, "", "/get-omarchy/"); html = pageGetOmarchy(); nav = "get-omarchy"; }
    else if (p === "get-desktop") html = pageGetDesktop();
    else if (p === "legal") html = pageLegal();
    else html = notFound();
    view.innerHTML = html;
    markNav(nav);
    if (p !== "search") $("#q").value = "";
    if (route.last !== h) view.scrollTop = 0;
    route.last = h;
    const d = $("#desc"), m = $("#more");
    if (d && m && d.scrollHeight > d.clientHeight + 4) m.hidden = false;
    document.title = pageTitle(p, arg);
  }
  const TITLES = { submit: "Submit an App – List Your App Free", advertise: "Advertise on the Omarchy Store", themes: "Omarchy Themes – Browse & Install Desktop Themes", charts: "Top Charts – Most Popular Omarchy Apps", categories: "App Categories", legal: "Disclaimer", "get-desktop": "Get the Desktop App", search: "Search", installed: "Installed", updates: "Updates", usb: "Ignite for Omarchy – Make an Omarchy Installer USB in One Click", ignite: "Ignite for Omarchy – Make an Omarchy Installer USB in One Click", "get-omarchy": "Get Omarchy – How to Install Omarchy Linux (Free, Step by Step)", get: "Get Omarchy – How to Install Omarchy Linux (Free, Step by Step)" };
  function pageTitle(p, arg) {
    const a = p === "app" && S.byId[arg];
    if (a) return `${a.name} for Omarchy Linux – Install ${a.name} | Omarchy Store`;
    const c = p === "category" && S.catalog.categories.find((c) => c.id === arg);
    if (c) return `Best ${c.name} Apps for Omarchy Linux | Omarchy Store`;
    const th = p === "theme" && S.themeById[arg];
    if (th) return `${th.name} Theme for Omarchy – by ${th.author} | Omarchy Store`;
    return TITLES[p] ? `${TITLES[p]} | Omarchy Store` : "Omarchy Store – The App Store for Omarchy Linux";
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
      ${a.install.method === "release" ? `<div class="small muted">${esc(a.name)} isn't in the Arch repos or the AUR, so <code>omarchy pkg add ${esc(a.id)}</code> won't find it. This command downloads it from the developer, checks its fingerprint (SHA-256) against the store, then installs it. It asks for your password. <a style="color:var(--accent)" href="${SITE}get.sh" target="_blank" rel="noopener">Read the script</a>.</div>` : ""}
      ${a.featured?.heads_up ? `<div class="trust warn" style="margin-top:10px">${ico("warn")}<div>${esc(a.featured.heads_up.body)}</div></div>` : ""}
      <div class="small muted">Want one-click installs? <a style="color:var(--accent)" href="/get-desktop/" data-close>Get the desktop app</a>.</div>
      <p class="small muted sheet-legal">${esc(DISCLAIMER_SHORT)} <a style="color:var(--accent)" href="/legal/" data-close>Disclaimer</a></p>
      <div style="text-align:right;margin-top:16px"><button class="btn ghost" data-close>Done</button></div>
    </div>`);
  }

  const ACCEPT_KEY = "omarchy-store-disclaimer-accepted-v1";
  function confirmThenGet(a) {
    if (localStorage.getItem(ACCEPT_KEY) && !a.featured?.heads_up) return desktopGet(a);
    showSheet(`<div class="sheet-card" role="dialog" aria-label="Before you install">
      <div class="row">${iconImg(a, 56)}<div><h3>Before you install</h3><div class="muted small">${esc(a.name)} · from ${esc(sourceLabel(a))}</div></div></div>
      ${a.featured?.heads_up ? `<div class="trust warn" style="margin:0 0 12px">${ico("warn")}<div><b>${esc(a.featured.heads_up.title)}</b><div style="margin-top:4px">${esc(a.featured.heads_up.body)}</div></div></div>` : ""}
      <p>${esc(DISCLAIMER_SHORT)}</p>
      <p class="small muted">Omarchy Store and its maintainers are not responsible for viruses, malware, data loss or any other damage caused by installed software. Read the <a style="color:var(--accent)" href="/legal/" data-close>full disclaimer</a>.</p>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
        <button class="btn ghost" data-close>Cancel</button>
        <button class="btn" data-accept="${a.id}">I understand — install</button>
      </div>
    </div>`);
  }

  async function desktopGet(a) {
    S.busy.add(a.id); rerender();
    try {
      const r = await post("/api/install", { id: a.id });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
      toast(`Installing ${a.name} — follow the terminal window`);
      // Poll until the package shows up (install runs in a floating terminal and may ask for your password).
      const t0 = Date.now();
      while (Date.now() - t0 < 20 * 60e3) {
        await new Promise((res) => setTimeout(res, 2500));
        const st = await (await fetch("/api/job/" + a.id, { cache: "no-store" })).json();
        if (st.installed) { S.installed.add(a.id); toast(`${a.name} installed`); break; }
        if (st.state === "done" || st.state === "failed") { await refreshInstalled(); if (!isInstalled(a)) toast(`${a.name} was not installed`); break; }
      }
    } catch (e) {
      toast("Install failed: " + e.message);
    }
    S.busy.delete(a.id); rerender();
  }

  async function desktopOpen(a) {
    const r = await post("/api/open", { id: a.id });
    const j = await r.json().catch(() => ({}));
    toast(r.ok ? `Opening ${a.name}` : (j.error || "Could not open"));
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-usb-confirm],[data-usb-dl],[data-usb-refresh],[data-usb-pick],[data-usb-write],[data-upd],[data-upd-all],[data-upd-refresh],[data-restart],[data-get],[data-soon],[data-accept],[data-open],[data-copy],[data-close],[data-share],[data-chart],[data-zoom],[data-theme-get],[data-theme-use],[data-tfilter],[data-share-theme],#more,.sheet");
    if (!t) return;
    if (t.matches("[data-usb-dl]")) {
      post("/api/usb/download", {}).then(async (r) => { if (!r.ok) toast((await r.json().catch(() => ({}))).error || "Download failed"); loadUsb(); });
    } else if (t.matches("[data-usb-refresh]")) {
      loadUsb();
    } else if (t.matches("[data-usb-pick]")) {
      S.usbPick = t.dataset.usbPick; rerender();
    } else if (t.matches("[data-usb-write]")) {
      const d = (S.usb?.drives || []).find((x) => x.path === S.usbPick);
      if (!d) return;
      showSheet(`<div class="sheet-card" role="dialog" aria-label="Erase USB drive">
        <div class="row"><span class="usb-art small">${ico("usb")}</span><div><h3>Erase ${esc(d.name)}?</h3><div class="muted small">${gb(d.size)} · ${esc(d.path)}</div></div></div>
        <p>Everything on this USB stick will be <b>permanently erased</b> and replaced with the Omarchy installer.</p>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
          <button class="btn ghost" data-close>Cancel</button>
          <button class="btn danger" data-usb-confirm="${esc(d.path)}">Erase and make installer</button></div></div>`);
    } else if (t.matches("[data-usb-confirm]")) {
      const dev = t.dataset.usbConfirm; closeSheet();
      post("/api/usb/write", { device: dev }).then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return toast(j.error || "Couldn't start");
        S.jobUsb = true; rerender(); toast("Writing the USB — follow the terminal window");
        setTimeout(() => { S.jobUsb = false; rerender(); }, 60e3);
      });
    } else if (t.matches("[data-upd]")) {
      e.preventDefault(); e.stopPropagation();
      const a = S.byId[t.dataset.upd]; doUpdate("/api/update", { id: a.id }, `Updating ${a.name}`);
    } else if (t.matches("[data-upd-all]")) {
      doUpdate("/api/update-all", {}, "Updating everything");
    } else if (t.matches("[data-upd-refresh]")) {
      loadUpdates(true);
    } else if (t.matches("[data-restart]")) {
      post("/api/restart", {}).then(() => { toast("Restarting Omarchy Store…"); setTimeout(() => location.reload(), 2500); });
    } else if (t.matches("[data-theme-get],[data-theme-use]")) {
      e.preventDefault(); e.stopPropagation();
      const th = S.themeById[t.dataset.themeGet || t.dataset.themeUse];
      if (!S.desktop) webThemeGet(th);
      else desktopTheme(th, t.dataset.themeUse ? "/api/theme/use" : "/api/theme/install");
    } else if (t.matches("[data-tfilter]")) {
      S.themeFilter = t.dataset.tfilter; rerender();
    } else if (t.matches("[data-share-theme]")) {
      copy(SITE + "theme/" + t.dataset.shareTheme + "/");
    } else if (t.matches("[data-get]")) {
      e.preventDefault(); e.stopPropagation();
      const a = S.byId[t.dataset.get];
      S.desktop ? confirmThenGet(a) : webGet(a);
    } else if (t.matches("[data-soon]")) {
      e.preventDefault(); e.stopPropagation();
      toast(`${S.byId[t.dataset.soon].name} is launching soon — check back shortly`);
    } else if (t.matches("[data-accept]")) {
      localStorage.setItem(ACCEPT_KEY, new Date().toISOString());
      closeSheet(); desktopGet(S.byId[t.dataset.accept]);
    } else if (t.matches("[data-open]")) {
      e.preventDefault(); e.stopPropagation(); desktopOpen(S.byId[t.dataset.open]);
    } else if (t.matches("[data-copy]")) {
      e.preventDefault(); copy(t.dataset.copy);
    } else if (t.matches("[data-close]")) {
      closeSheet();
    } else if (t.matches("[data-share]")) {
      copy(SITE + "app/" + t.dataset.share + "/");
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
  // Theme search box filters the grid in place (no re-render, so the cursor stays put).
  document.addEventListener("input", (e) => {
    if (e.target.id !== "tq") return;
    S.themeQ = e.target.value;
    const g = $("#tgrid"); if (g) g.innerHTML = themeGridHtml();
  });
  let qt;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(qt);
    const v = e.target.value;
    qt = setTimeout(() => {
      const path = v.trim() ? "/search/" + encodeURIComponent(v) + "/" : "/";
      if (location.pathname.startsWith("/search/")) { history.replaceState(null, "", path); route(); } else go(path);
    }, 180);
  });
  // Intercept in-store links so navigation is instant (no page reload).
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[href]");
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith("/api/") || /\.[a-z0-9]+$/i.test(url.pathname)) return;
    e.preventDefault();
    if (a.hasAttribute("data-close")) closeSheet();
    go(url.pathname);
  });
  window.addEventListener("popstate", () => { closeSheet(); route(); });
  window.addEventListener("hashchange", () => { if (location.hash.startsWith("#/")) { closeSheet(); route(); } });
  window.addEventListener("focus", async () => { if (S.desktop) { await refreshInstalled(); rerender(); } });

  boot().catch((e) => {
    view.innerHTML = `<div class="page"><div class="empty">Couldn’t load the store catalog.<br><span class="small">${esc(e.message)}</span></div></div>`;
  });
})();
