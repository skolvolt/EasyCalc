# Building EasyCalc for macOS

A native Mac build **must be assembled on a Mac** — it bundles a macOS Node
binary and produces an `.app`. This folder is the scaffolding; the one script
does the whole job.

## Build it (on a Mac)

1. Put this repo on a Mac that has **Node + npm** installed.
2. Run:
   ```sh
   bash mac-build/build-easycalc-mac.sh
   ```
3. Out comes:
   - **`mac-build/dist/EasyCalc-0.2.0.dmg`** — the single file you share
   - (`mac-build/dist/EasyCalc.app` is also left there if you want it directly)

The script builds the web + server bundles, installs the runtime deps fresh for
macOS, downloads a Node runtime for the Mac's architecture (Apple Silicon or
Intel — auto-detected), assembles `EasyCalc.app`, ad-hoc signs it, and packs a
drag-to-Applications `.dmg`.

## What the reviewer does — no terminal

1. Double-click **`EasyCalc-0.2.0.dmg`** → a window opens.
2. Drag **EasyCalc** onto the **Applications** shortcut in that window.
3. Open it from Applications/Launchpad. The server runs in the background (no
   terminal) and the app opens in its own window (Google Chrome app-mode if
   installed, else the default browser).

**Quit** with Cmd+Q or via Activity Monitor — that stops the background server.

## First launch: the Gatekeeper prompt (clicks only, no terminal)

The app is **not signed by Apple**, so the *first* time it's opened macOS warns
("Apple could not verify EasyCalc is free of malware"). Dismiss it once — no
terminal needed:

- **macOS Sonoma & earlier:** right-click the app → **Open** → **Open**.
- **macOS Sequoia:** try to open it, then **System Settings → Privacy &
  Security** → scroll down → **"Open Anyway"**.

After that one time, it opens normally. This is the Mac equivalent of the Windows
SmartScreen prompt — expected for an unsigned app, not a defect.

> Power-user alternative (uses Terminal): `xattr -dr com.apple.quarantine
> /Applications/EasyCalc.app` removes the prompt in one command.

## Notes / limits

- **PDF & Excel export** need **Google Chrome installed** on the Mac (the app
  drives it to render, same as it uses Edge/Chrome on Windows).
- To brand the app, drop an `EasyCalc.icns` into `mac-build/` before building
  (convert a PNG with `sips`/`iconutil` on the Mac).
- `QM_UPDATE_REPO` in the launcher is still the placeholder — set it once you
  publish releases, same as the Windows build.

## For real distribution (not just review)

The **only** way to remove the first-launch prompt entirely is an **Apple
Developer account ($99/yr)** to **sign + notarize** the `.app` (`codesign` +
`notarytool`), done on a Mac. Worth it only when distributing widely — for a
single reviewer, the one-time "Open Anyway" click above is enough.
