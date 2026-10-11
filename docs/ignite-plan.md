# Ignite for Omarchy: one-step install plan (agreed 2026-10-10)

Goal: someone on Windows gets Omarchy (with the Omarchy Store built in) in one download, no Rufus.

## Flow
1. **Website, "Download Ignite"** asks: *Fresh install* (erase this PC, Omarchy only) or *Keep Windows*
   (Omarchy next to it, 50 / 100 / 200 GB). The download is preset with that choice (one Ignite app).
2. **Ignite on Windows** repeats the choice on an **"Are you sure you want to do this?"** screen that spells out
   exactly what will happen, then the user confirms (types the word shown). Then:
   - Fresh install: big red "everything on this PC will be erased" warning; offers to copy Documents,
     Pictures and Desktop to the USB's spare OMARCHY-FILES drive. Writes the USB. Doesn't touch the PC's drive.
   - Keep Windows: checks BitLocker, makes a restore point, shrinks Windows (Make-room-for-Omarchy logic,
     windows-helper/), turns off Fast Startup. Writes the USB.
   - Downloads the newest official Omarchy (or the Omarchy + Store edition), checks SHA-256, writes it,
     turns the rest of the stick into OMARCHY-FILES, saves the choice on the stick, restarts into the boot menu.
3. **On the USB (Omarchy + Store edition)** a second **"Are you sure you want to do this?"** screen before
   anything is installed, naming the exact drive:
   - Fresh install: "This will ERASE: <drive model, size, contains Windows>". Type ERASE to go on; anything else cancels.
   - Keep Windows: uses only the free space; the erase-everything option is blocked. Stops and explains if no free space.

## Open questions
- Can Omarchy's installer be preset (mode/disk)? If yes, our confirm screen hands the choice over; if not, it runs first and tells the user what to pick.
- Code-signing certificate (~$200–400/yr) to avoid the "Windows protected your PC" warning.

## Build order
1. Ignite for Windows (questions, confirm screen, USB write, make room, file copy, restart) + Windows VM test with a fake USB.
2. Omarchy + Store edition ISO with the on-USB confirm screens.
3. Website: questions on the download button.

Nothing goes public until tested in the Windows VM.
