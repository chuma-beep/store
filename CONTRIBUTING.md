# Submitting an app

Listing is **free** and works through a pull request.

## 1. Create `registry/apps/<id>.json`

```json
{
  "id": "krita",
  "name": "Krita",
  "category": "graphics",
  "github": "KDE/krita",
  "flathub": "org.kde.krita",
  "install": { "method": "pacman", "packages": ["krita"] },
  "detect": ["krita"],
  "kind": "gui",
  "tags": ["painting", "drawing"]
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | ✓ | Same as the filename. Lowercase, digits, dashes. |
| `name` | ✓ | Display name. |
| `category` | ✓ | One of the ids in `registry/categories.json`. |
| `install` | ✓ | `{"method":"pacman","packages":[…]}` for official repos, `{"method":"aur","packages":[…]}` for the AUR, or `{"method":"omarchy","command":"omarchy install …"}`. |
| `detect` | ✓ | Package name(s) that mean "installed". The first one is shown on the listing. |
| `kind` | ✓ | `gui` (opens a window) or `terminal` (runs in a terminal). |
| `github` | one of these three | `owner/repo`. Gives stars, releases, license. |
| `flathub` | one of these three | Flathub app id. Gives screenshots, description, icon, age rating. Used for metadata only; installs never use Flatpak. |
| `homepage` | one of these three | For closed-source apps. |
| `open` | | Terminal command to launch, if it differs from the package name (e.g. `nvim`). |
| `icon`, `summary`, `developer`, `description`, `screenshots` | | Override what's pulled automatically. Icons must be `https://`. |
| `tags` | | Search keywords. |

## 2. Check it

```bash
python3 scripts/build.py --check
```

## 3. Open a pull request

CI checks the format and confirms the package exists. A maintainer reviews every listing before merge.

## Listing rules

- **Package-manager installs only.** No `curl | bash`, AppImages, or custom scripts.
- **AUR packages** need an active maintainer, must not be flagged out of date, and need a reasonable vote count.
- **No malware, cracked software, or apps whose main purpose is piracy.**
- Apps that go unmaintained (archived repo, orphaned package) get removed.
- Listings are free, and paying for ads never changes ranking. Top Charts are ranked purely by GitHub stars.
