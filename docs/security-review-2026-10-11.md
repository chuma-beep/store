# Omarchy Store: security and flaw review, 11 Oct 2026

Covers the website (`site/`), the build scripts, the install scripts (`site/install.sh`, `site/get.sh`), the desktop app (`desktop/omarchy-store`, v1.7.0), the Cloudflare Worker (`backend/`), the GitHub workflows, and the live site.

**Short version:** I found nothing that is being exploited and no leaked secrets. I fixed three contained problems (commit `0d5714d`, deployed and checked live). The open items below are design choices that need the owner to decide. None of them is an emergency.

---

## Fixed (commit `0d5714d`, deployed 11 Oct 2026, live deploy run succeeded)

| # | Severity | Where | Problem | Fix |
|---|---|---|---|---|
| F1 | Medium | `site/app.js` (plugin, theme and app pages; around old lines 377, 429–480, 523, 559–609, 1436–1472) | Links built from outside data (plugin repo `x.r`, marketplace `source.url`/`by_url`, theme `source_url`, app `homepage` from GitHub/Flathub) were HTML-escaped but their scheme wasn't checked. A `javascript:` URL in that data would have become a clickable link that runs code on omarchystore.com, the same site where the admin key is stored (see O2). The build scripts mostly validate these today, so this is defence in depth. | New `safeUrl()` helper (app.js line ~27): only `http(s)://` passes. A bare `example.com/x` gets `https://` added (this also fixes the broken "Website" link on zsh-syntax-highlighting, whose homepage has no scheme). Anything else becomes `#`. The GitHub links (`ghUrl`, `gh`) are now escaped as well. |
| F2 | Medium | `desktop/omarchy-store` `do_GET` | Any website the user visits could make the browser send GET requests to `127.0.0.1:47823/api/...`, for example with `<img>`. It can't read the answers (no CORS, Host check), but it could start slow work again and again: `/api/updates?refresh=1` runs `checkupdates` + `yay -Qua`, and `/api/usb` hits the network. | `/api/*` GETs whose `Sec-Fetch-Site` header says `cross-site` or `same-site` now get 403. Same-origin requests and requests without the header (curl, the helper's own `alive()` check) still work. |
| F3 | Low | `desktop/omarchy-store` `end_headers` | No anti-framing headers on the local store page, so in theory another site could frame it and trick a click on GET. The token is still required, but a framed page has it. | Added `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `Referrer-Policy: no-referrer`. |

**Desktop app note:** I did **not** bump `VERSION` (that would push a self-update to every user). Fixes F2 and F3 are in the published `desktop-files/omarchy-store`, so new installs get them. Existing users get them with the next real version bump.

**How I tested:**
- `node --check site/app.js`, plus a Python syntax check of the helper.
- Headless Chromium against the local server: home, app, plugins, themes, screensavers and plugin-detail pages render with the same card counts and zero `javascript:` links. A home screenshot looks unchanged.
- Ran the helper in a sandbox `HOME` and probed it:

| Probe | Result |
|---|---|
| Normal page and API | 200 |
| `Sec-Fetch-Site: cross-site` and `same-site` | 403 |
| `Host: evil.com` | 403 |
| POST without token or with a foreign Origin | 403 |
| Unknown app id | 404 |
| Bad plugin id (`x;touch …`) | 400 |
| `../` and `%2e%2e` path traversal | Never leaves the site folder (only the store page is served) |
| `featured/../` | 404 |
| New response headers | Present |

- Live after deploy: `https://omarchystore.com/` returns 200, the fingerprinted `app.js` contains `safeUrl`, `/plugins/` returns 200, and `desktop-files/omarchy-store` contains the new headers.

---

## Open items (need a decision; ranked)

### Medium

**O1. Featured App / App of the Week can be gamed.** `backend/src/index.js:165` (`/event`) and `:241` (`trending`).
- `/event` has no anti-spam check and no rate limit. Its only check is the `Origin` header, which a script can fake.
- A "distinct visitor" is `hash(IP + User-Agent + day)`, so one machine that changes its User-Agent counts as many people.
- Trending decides which app sits in the big Featured App / App of the Week spots on Discover.
- The same applies to `/hit` (`:150`): page-view stats can be inflated, and the D1 tables can be filled up (free-tier limits).
- *Suggested fix (needs a worker deploy):*
  - Count trending by IP-only hash.
  - Add a per-IP `rateLimit()` on `/event` and `/hit` (e.g. 120/hour).
  - Optionally cap rows per day.

**O2. Admin key lives in the browser's localStorage on the same site that shows third-party content.** `site/admin/index.html:75,91`.
- Any script bug on omarchystore.com (all pages share one origin) could read the admin key. The key unlocks the admin pages: developer emails and payout addresses, orders, and deleting or hiding reviews.
- F1 removes the main known path for that. Further options:
  - (a) Add a Content-Security-Policy `<meta>` tag to `site/index.html`. GitHub Pages can't send headers, and this needs careful testing because the page uses inline `onerror` handlers.
  - (b) Use `sessionStorage` so the key is forgotten when the tab closes.
  - (c) Move admin to its own subdomain.

**O3. Desktop self-update trusts whatever is on omarchystore.com.** `desktop/omarchy-store:719` (`self_update`) and `:994`.
- New helper code is downloaded over HTTPS and only sanity-checked (valid Python, version string). It is not signed.
- Anyone who gets push access to the GitHub repo (or the Pages deploy) can ship code that runs on every user's computer. `omarchy-store --update` installs it without a click.
- This is the same trust model as `curl … | bash`, so it is common, but it is the biggest "keys to the kingdom" risk.
- *Options:*
  - Sign releases with a key kept offline (e.g. minisign) and have the helper verify the signature.
  - At minimum: turn on branch protection and 2FA for every account with write access to `omarchy-community/store`.

### Low

- **O4. No rate limit on admin-key guessing** (`backend/src/index.js:124`). The key is long and random, so this is low risk. Adding `rateLimit(env, "adm:"+ip, 20, 3600)` on failures would close it.
- **O5. The admin key is reused as the hashing salt for visitor ids** (`index.js:55`). Rotating the admin key silently resets the daily visitor counts and the "one review per day" de-duplication. A separate `VISITOR_SALT` secret would decouple them.
- **O6. The worker accepts any `http://localhost:<port>` / `127.0.0.1:<port>` origin** (`index.js:9`). This is needed for the desktop app (port 47823–47842). It could be narrowed to that port range. Writes still need Turnstile.
- **O7. `GET /orders/:id` runs a blockchain check on every call** (`index.js:388`) with no rate limit. Order ids are random (10 characters), so abuse needs a real id. Throttling to once per 30 s per order would be cheap.
- **O8. AUR "update" runs `yay -S --needed --noconfirm`** (`desktop/omarchy-store:535`). It skips the PKGBUILD review prompt for AUR packages. This is by design (one-click), but AUR packages are unreviewed by nature.
- **O9. Plugins (including "Unverified" ones) install in one click** (`desktop/omarchy-store:168`). Plugins run with the user's permissions. The UI and terminal both warn. Requiring a second confirm click for Unverified plugins is a product decision.
- **O10. The helper doesn't re-validate `detect` package names from the catalog** before passing them to `pacman -Qlq` in `run_open` (`desktop/omarchy-store:415`). Arguments go in a list, not through a shell, and pacman `-Q` is read-only. `build.py` validates them anyway. Adding the `PKG_RE` check in `update_catalog` would be tidy. Do it with the next version bump.
- **O11. Live site has no HSTS or CSP headers.** GitHub Pages can't set custom headers. HTTP→HTTPS redirect works (301) and I found no mixed content. Cloudflare in front of Pages, or `<meta>` CSP (see O2), are the options.
- **O12. `install.sh` (curl | bash) has no checksum.** This is standard for one-line installers. Release tarballs already ship a `.sha256`.

---

## Checked and OK (no change needed)

- **Secrets:** no tokens, keys or passwords in the repo or its git history (searched for GitHub, Telegram, AWS, Slack and private-key patterns). Worker secrets are set with `wrangler secret`: `ADMIN_KEY`, `TURNSTILE_SECRET`, bot tokens, chat id. The wallet addresses and Turnstile site key in the repo are public on purpose.
- **Desktop helper:**
  - Binds to 127.0.0.1 only.
  - Host check (blocks DNS rebinding) on GET and POST.
  - POST needs an exact Origin match plus a per-session random token (constant-time compare).
  - Installs come from catalog ids only, with recipes re-validated (`PKG_RE`, `OMARCHY_RE`, `RELEASE_RE` + SHA-256).
  - Every shell string uses `shlex.quote`.
  - Theme repo and folder names, plugin ids/repos and USB device paths are all regex-checked.
  - The USB drive is re-checked before writing.
  - Path traversal is blocked by the standard library.
  - The featured-asset fetch is whitelisted by regex.
- **get.sh:** strict mode, `mktemp -d` + trap cleanup, app-id regex, approved-publisher URL regex + SHA-256 check before `pacman -U`, all variables quoted.
- **Worker:**
  - All SQL uses bound parameters. The only string-built SQL is a constant fragment.
  - Admin routes need the bearer key (constant-time compare).
  - CORS has an allow-list; public writes need an allowed Origin.
  - Reviews, developer sign-ups and orders need Turnstile and are rate-limited.
  - Order prices come from the store catalog, never from the browser.
  - The Telegram webhook checks the secret in both the path and the header.
  - The bot's owner-only commands check the Telegram user id.
  - Admin page output is escaped, and developer links are https-only on the server.
- **Website:**
  - All third-party text (names, descriptions, authors, reviews) goes through `esc()`.
  - Images are https or local.
  - Copy-to-clipboard commands are built from regex-validated fields.
  - Toasts use `textContent`.
- **Workflows:** the PR validation job has read-only permissions and no secrets. Only scheduled and push jobs can write.

## Not done

- **Live probe of the worker:** I didn't run it because it needed an approval prompt while the owner was asleep. The worker review was done from the code.
- **Worker:** no code changes and no `wrangler deploy`. O1, O4, O5 and O7 are worker changes for the owner to approve.
