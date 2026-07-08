# Releasing EasyCalc

The app checks GitHub for a newer release on startup and offers a one-click
in-place update. This is the flow that makes that work.

## One-time setup (done)

- Repo: **https://github.com/skolvolt/EasyCalc** (public).
- App points at it via `QM_UPDATE_REPO=skolvolt/EasyCalc` (set in
  `package-build/start.bat`, `package-build/EasyCalc.vbs`, the mac launcher, and
  the fallback in `src/server/index.ts`).
- Build tools: Inno Setup 6 (Windows) + `gh` CLI, both installed/authenticated.

## Cut a release

Version lives in **`package-build/app/package.json`** — what the running app
reports as "current". Bump it, then (Windows):

```sh
# 1. bump version in package-build/app/package.json  (e.g. 0.2.1 -> 0.2.2)

# 2. rebuild web + server + packaged files
npm run package

# 3. commit + push
git add -A && git commit -m "Release 0.2.2" && git push

# 4. compile the installer (version must match step 1)
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" /DAppVersion=0.2.2 installer\EasyCalc.iss

# 5. publish the GitHub release with the installer attached
gh release create v0.2.2 "installer\Output\EasyCalc-Setup-0.2.2.exe" \
  --title "EasyCalc 0.2.2" --notes "What changed..."
```

The asset filename must match `*Setup*.exe` — that's how the updater finds it.
Once published, installs older than the tag show "Update now" on next launch.

## What users see

On next launch, an app whose `package.json` version is older than the release
tag shows a banner: **"EasyCalc vX is available — Update now."** Clicking it
downloads the installer and runs it silently; the installer closes the app,
replaces the files (per-user, no admin prompt), and relaunches. If the download
fails, the banner falls back to opening the Releases page.

## Notes

- The version check is cached ~1h per app run, so it won't hammer the API.
- User projects (`Documents\Project Model\*.qmproj`) are never touched by install,
  update, or uninstall.
- Private repos are **not** supported by this flow — the update check is an
  anonymous API call. Keeping the repo public (or at least its Releases) is the
  simple, tokenless path.
