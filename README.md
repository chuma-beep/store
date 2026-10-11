# Omarchy Store

**The community app store for [Omarchy](https://omarchy.org).** Browse the best Linux apps, see real GitHub stars, screenshots and versions, and install with one click.

🌐 **Browse:** https://omarchystore.com/
🖥️ **Desktop app (one-click installs):**

```bash
curl -fsSL https://omarchystore.com/install.sh | bash
```

Then open **Omarchy Store** from your launcher (Super + Space).

📦 **Or download it from GitHub:** grab `omarchy-store-<version>.tar.gz` from the
[latest release](https://github.com/omarchy-community/store/releases/latest), then:

```bash
cd ~/Downloads && tar xzf omarchy-store-*.tar.gz && bash omarchy-store-*/install.sh
```

No sudo, installs only into your home folder, updates itself. Remove with `omarchy-store --uninstall`.

🚀 **New to Omarchy?** [omarchystore.com/get](https://omarchystore.com/get-omarchy/) walks you through installing it.

> Unofficial and community-run. Not affiliated with Omarchy, Basecamp, or 37signals.

---

## How it works

```
registry/apps/*.json   ← one small file per app (what to install, where it lives)
        │
        ▼  scripts/build.py  (GitHub Actions, on every merge + every Monday)
        │    pulls live data: GitHub stars & releases, Flathub screenshots,
        │    Arch/AUR versions & sizes, and mirrors icons
        ▼
site/catalog.json      ← everything the store displays
        │
        ├─► GitHub Pages  — the web store (browse + copy install command)
        └─► Desktop app   — same UI, plus a tiny local helper that runs installs
```

**Where apps install from.** Every listing installs through your system package manager only:
official Arch repos, the AUR, or Omarchy's own `omarchy install …` commands. The store never runs scripts downloaded from a web page, and the registry format makes that impossible: recipes are package names or an `omarchy install` command, nothing else.

**The desktop helper** (`desktop/omarchy-store`, ~350 lines of stdlib Python, read it!) listens on `127.0.0.1` only. It accepts an app *id*, never a command. It requires a per-session token plus a matching Origin header, so other websites can't trigger installs. Installs run in a visible Omarchy terminal where *you* type your password.

## Add an app

See [CONTRIBUTING.md](CONTRIBUTING.md). It's one JSON file and a pull request.

## Advertise

The store has clearly labelled sponsored placements. See [ADVERTISE.md](ADVERTISE.md).

## Develop locally

```bash
python3 scripts/build.py          # fetch live data → site/catalog.json + site/icons/
cd site && python3 -m http.server # web mode at http://localhost:8000
```

To test desktop mode: `OMARCHY_STORE_HOME=$PWD python3 desktop/omarchy-store --serve`, then open the printed port.

## License

Code: MIT. App names, icons and screenshots belong to their respective owners and are shown for identification only.
