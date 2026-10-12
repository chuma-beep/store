# Security policy — Omarchy Store

**Please do not open public issues for security problems.** Use GitHub's private
vulnerability reporting ("Security" tab → "Report a vulnerability") or email
omarchystore@gmail.com. We reply within 72 hours.

## What's protected
- `main` and all release tags can only be changed by the store owner. Everyone else needs a
  reviewed pull request; tags cannot be created, moved or deleted by anyone else.
- Verified-developer apps (`install.method: release`) only install from GitHub releases under the
  owner's accounts and are pinned by SHA-256. `get.sh`, the build and the desktop app all check this.
- Install recipes are allow-listed (`pacman`/`aur` package names, `omarchy install …`). Arbitrary shell is rejected at build time and again by the desktop helper.
- The desktop helper binds to 127.0.0.1 only, requires a per-session token, and checks Origin and Host.
- Secret scanning + push protection, Dependabot alerts and read-only CI tokens are on for every repo.
