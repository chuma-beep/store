#!/usr/bin/env python3
"""Add every app from the official Omarchy package repo (pkgs.omarchy.org) that the store doesn't list yet.

This is the same package list omarchyapps.com shows ("every package in the official Omarchy repo").
We read it straight from the source (the repo database), not from that site.

Skipped on purpose (they're system parts, not apps, and installing/removing them from a store can
break a computer): kernels and headers, NVIDIA/firmware/DKMS drivers, Omarchy's own core packages,
libraries, -git dev builds of existing packages, debug packages, keyrings and shell configs.

Usage: python3 scripts/omarchy_repo.py [--write]   (dry run without --write)
"""
import io
import json
import os
import re
import subprocess
import sys
import tarfile
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADIR = os.path.join(ROOT, "registry", "apps")
DB = "https://pkgs.omarchy.org/stable/x86_64/omarchy.db"

SKIP_RE = re.compile(
    r"(-debug$|-headers$|^linux-|^lib32-|^lib|-dkms$|^nvidia|^opencl-|firmware|^omarchy$|^omarchy-dev$|"
    r"^omarchy-settings|^omarchy-keyring$|^omarchy-(fish|zsh)$|^omarchy-chromium-bin$|^limine-|^intel-|"
    r"^python-|^ttf-|^yaru-|^xdg-terminal-exec$|^vi$|^yay$|^walker$|^quickshell-git$|^v4l2-|^tzupdate$|"
    r"^hyprland-preview-share-picker-git$|^retroarch-joypad|^libretro-database|-sidecar-amps$|-haptics$|"
    r"^macbook|^tuxedo-|^yt6801|^xpadneo|^ghostty-(terminfo|shell-integration)$|^caja-|^asdcontrol$|"
    r"^t3code-(nightly|patched)-bin$|^1password-beta$|^owe-lockfeed$|^ghost-runtime$|^lmstudio-bin$|"
    r"^schist-bin$|-git$)")

# name pattern -> category (first match wins); everything else -> utilities
CAT_RULES = [
    (r"claude|codex|copilot|cursor|crush|grok|herdr|hermes|lmstudio|openclaw|perplexity|superwhisper|voxtype|"
     r"omaspeak|omawake|ghost$|buzz|t3code|cua-driver", "ai"),
    (r"chromium|edge|brave", "browsers"),
    (r"libretro|minecraft|omakade|umu-launcher|retroarch", "games"),
    (r"omacut|omareel|gpu-screen-recorder|cliamp|link-studio|omapresent", "video-audio"),
    (r"rawmakase|schist|omasnap|tensaku|owe$|aether|hyprshade", "graphics"),
    (r"nordvpn|1password|ufw-docker", "security"),
    (r"omawrite|slap-notes|omacalc|basecamp|hey-cli|omarchy-task-manager|learn-omarchy", "productivity"),
    (r"bun|mise|symfony|sublime|omazed|omarchy-emacs|omarchy-nvim|once|tobi-try|qmk|omatrack|dbxcli|"
     r"omarchy-billboard|omarchy-audio-tuner", "developer-tools"),
    (r"flea|strata|ttfx|cliamp|herdr|tmog", "terminal"),
    (r"localsend|rustdesk", "communication"),
]
TERMINAL = re.compile(r"(^omarchy-nvim$|^omarchy-emacs$|^omazed$|^ghostty-nautilus$|^nautilus-|^hyprland-preview-share-picker$|"
                      r"^ufw-docker$|^wayfreeze$|^umu-launcher$|^cua-driver|^elsewhen$|^tmog|-cli$|^crush|^herdr|^omarchy-herdr|^cliamp|^ttfx|^tobi-try|^once|^mise|^bun|^qmk|^dbxcli|"
                      r"^symfony|^openai-codex-bin|^cursor-cli|^github-copilot-cli|^claude-code|^flea|^strata|^nordvpn|"
                      r"^hyprshade|^makima|^supergfxctl|^asusctl|^openclaw|^omawake|^omaspeak)")


def read_db():
    req = urllib.request.Request(DB, headers={"User-Agent": "omarchy-store-build"})
    raw = urllib.request.urlopen(req, timeout=60).read()
    tar = subprocess.run(["zstd", "-dc"], input=raw, capture_output=True, check=True).stdout
    out = []
    with tarfile.open(fileobj=io.BytesIO(tar)) as tf:
        for m in tf.getmembers():
            if not m.name.endswith("/desc"):
                continue
            f, k = {}, None
            for ln in tf.extractfile(m).read().decode("utf-8", "replace").splitlines():
                if len(ln) > 2 and ln.startswith("%") and ln.endswith("%"):
                    k = ln.strip("%"); f[k] = []
                elif ln and k:
                    f[k].append(ln)
            out.append({x: (v[0] if len(v) == 1 else v) for x, v in f.items()})
    return out


def pretty(name):
    base = re.sub(r"-(bin|stable|desktop-bin)$", "", name)
    special = {"1password-cli": "1Password CLI", "openai-codex-bin": "OpenAI Codex CLI", "openai-codex-desktop": "ChatGPT Codex",
               "claude-desktop": "Claude", "github-copilot-cli": "GitHub Copilot CLI", "cursor-cli": "Cursor CLI",
               "microsoft-edge-stable-bin": "Microsoft Edge", "brave-origin-bin": "Brave Origin", "hey-cli": "HEY CLI",
               "basecamp-cli": "Basecamp CLI", "dropbox-cli": "Dropbox CLI", "nautilus-dropbox": "Dropbox for Files",
               "sublime-text-4": "Sublime Text 4", "rog-control-center": "ROG Control Center", "nordvpn-bin": "NordVPN",
               "gpu-screen-recorder": "GPU Screen Recorder", "omarchy-chromium": "Omarchy Chromium", "tobi-try": "try",
               "slap-notes-bin": "Slap Notes", "t3code-bin": "T3 Code", "hermes-desktop": "Hermes Desktop", "grok-bot": "Grok Bot",
               "minecraft-launcher": "Minecraft Launcher", "umu-launcher": "umu-launcher", "lmstudio": "LM Studio",
               "omarchy-task-manager": "Omarchy Task Manager", "learn-omarchy": "Learn Omarchy", "link-studio": "Link Studio",
               "superwhisper-bin": "Superwhisper", "voxtype-bin": "Voxtype", "rawmakase-bin": "Rawmakase", "mise-bin": "mise",
               "bun-bin": "Bun", "crush-bin": "Crush", "once-bin": "ONCE", "tmog-bin": "tmog", "dbxcli-bin": "dbxcli",
               "omaspeak-bin": "Omaspeak", "omawake-bin": "Omawake", "makima-bin": "makima", "cua-driver-bin": "Cua Driver",
               "symfony-cli": "Symfony CLI", "qmk-hid": "qmk_hid", "omarchy-billboard-generator": "Omarchy Billboard Generator",
               "omarchy-audio-tuner": "Omarchy Audio Tuner", "omarchy-herdr": "Herdr (Omarchy edition)", "omarchy-nvim": "Omarchy Neovim",
               "omarchy-emacs": "Omarchy Emacs", "nautilus-open-any-terminal": "Open Any Terminal", "ghostty-nautilus": "Ghostty for Files",
               "libretro-cap32-git": "Amstrad CPC (RetroArch core)", "libretro-fbneo-git": "FinalBurn Neo (RetroArch core)",
               "libretro-uae-git": "Amiga (RetroArch core)", "ufw-docker": "ufw-docker", "rustdesk": "RustDesk", "localsend": "LocalSend"}
    if name in special:
        return special[name]
    m = re.match(r"libretro-vice-(\w+)-git", name)
    if m:
        return f"VICE {m.group(1)} (RetroArch core)"
    return " ".join(w if w.isupper() else w.capitalize() for w in re.split(r"[-_]", base))


def github_of(url):
    m = re.match(r"^https?://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?/?$", url or "")
    return f"{m.group(1)}/{m.group(2)}" if m else None


def category(name):
    for rx, c in CAT_RULES:
        if re.search(rx, name):
            return c
    return "utilities"


def main():
    write = "--write" in sys.argv
    pk = read_db()
    have_pkgs, have_ids = set(), set()
    for fn in os.listdir(ADIR):
        a = json.load(open(os.path.join(ADIR, fn)))
        have_ids.add(a["id"])
        have_pkgs.update((a.get("install") or {}).get("packages") or [])
        have_pkgs.update(a.get("detect") or [])
    add, skipped = [], []
    for p in sorted(pk, key=lambda x: x["NAME"]):
        n = p["NAME"]
        if n in have_pkgs:
            continue
        if SKIP_RE.search(n):
            skipped.append(n); continue
        aid = re.sub(r"[^a-z0-9-]", "-", re.sub(r"-(bin|stable-bin)$", "", n.lower()))[:41].strip("-")
        if aid in have_ids:
            skipped.append(n + " (already listed)"); continue
        gh = github_of(p.get("URL"))
        app = {
            "id": aid, "name": pretty(n), "category": category(n),
            **({"github": gh} if gh else {}),
            "install": {"method": "pacman", "packages": [n]},
            "detect": [n],
            "kind": "terminal" if TERMINAL.search(n) else "gui",
            "summary": (p.get("DESC") or "").strip().rstrip(".")[:200],
            "homepage": p.get("URL") or None,
            "tags": ["omarchy-repo"],
            "source": "omarchy-repo",
        }
        if app["kind"] == "terminal":
            app["cli"] = True
        add.append(app)
        have_ids.add(aid)
    print(f"Omarchy repo: {len(pk)} packages. Store already has {sum(1 for p in pk if p['NAME'] in have_pkgs)}.")
    print(f"Adding {len(add)} apps, skipping {len(skipped)} system parts.")
    for a in add:
        print(f"  + {a['id']:<34} {a['category']:<16} {a['kind']:<9} {a['name']}")
    if write:
        for a in add:
            with open(os.path.join(ADIR, a["id"] + ".json"), "w") as f:
                json.dump(a, f, indent=2); f.write("\n")
        print(f"✓ wrote {len(add)} files to registry/apps/")
    else:
        print("(dry run — add --write to save)")
        print("Skipped:", ", ".join(skipped))


if __name__ == "__main__":
    main()
