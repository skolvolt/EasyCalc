#!/usr/bin/env bash
# Build a self-contained EasyCalc.app for macOS. RUN THIS ON A MAC.
#
# Produces:  mac-build/dist/EasyCalc.app  and  mac-build/dist/EasyCalc-mac.zip
#
# Prereqs on the build Mac: Node + npm (to build the web/server bundles), curl,
# tar, zip — all standard except Node/npm. Everything else is fetched/assembled.
set -euo pipefail

NODE_VERSION="v22.11.0"   # bundled runtime (Node 22 LTS). Bump if you like.
APP_VERSION="0.4.0"

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
DIST="$HERE/dist"
APP="$DIST/EasyCalc.app"
RES="$APP/Contents/Resources"
MACOS="$APP/Contents/MacOS"

case "$(uname -m)" in
  arm64)  NODE_ARCH="arm64" ;;   # Apple Silicon
  x86_64) NODE_ARCH="x64"   ;;   # Intel
  *) echo "Unsupported architecture: $(uname -m)"; exit 1 ;;
esac
echo "==> Building EasyCalc.app $APP_VERSION for macOS ($NODE_ARCH)"

# 1) Make sure the web + server bundles are current (needs the repo's dev deps).
cd "$REPO"
[ -d node_modules ] || npm install
npm run package

# 2) Lay out the .app and copy the cross-platform app payload.
rm -rf "$DIST"
mkdir -p "$RES" "$MACOS"
cp "$REPO/package-build/app/server.mjs"   "$RES/"
cp "$REPO/package-build/app/package.json" "$RES/"
cp "$REPO/package-build/app/package-lock.json" "$RES/" 2>/dev/null || true
cp -R "$REPO/package-build/web"  "$RES/web"
cp -R "$REPO/package-build/data" "$RES/data"

# 3) Install runtime deps fresh for macOS (avoids carrying platform-specific bits).
( cd "$RES" && npm install --omit=dev --no-audit --no-fund )

# 4) Bundle a macOS Node runtime for this architecture.
NODE_PKG="node-$NODE_VERSION-darwin-$NODE_ARCH"
echo "==> Downloading $NODE_PKG"
curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/$NODE_PKG.tar.gz" -o "$DIST/node.tar.gz"
tar -xzf "$DIST/node.tar.gz" -C "$DIST"
mkdir -p "$RES/node"
cp "$DIST/$NODE_PKG/bin/node" "$RES/node/node"
chmod +x "$RES/node/node"
rm -rf "$DIST/node.tar.gz" "$DIST/$NODE_PKG"

# 5) The .app launcher. Runs the server (no terminal — a .app has none), waits
#    for it, opens the app in its own Chrome window (or the default browser),
#    and stops the server cleanly when the app quits (Cmd+Q / Activity Monitor).
cat > "$MACOS/EasyCalc" <<'LAUNCH'
#!/bin/bash
DIR="$(cd "$(dirname "$0")/../Resources" && pwd)"
export QM_DATA_DIR="$DIR/data"
export QM_WEB_DIST="$DIR/web"
export QM_UPDATE_REPO="skolvolt/EasyCalc"

"$DIR/node/node" "$DIR/server.mjs" &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null' EXIT

for _ in $(seq 1 40); do
  curl -s "http://localhost:8321/" >/dev/null 2>&1 && break
  sleep 0.5
done

if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args \
    --app="http://localhost:8321" \
    --user-data-dir="$HOME/Library/Application Support/EasyCalc/window"
else
  open "http://localhost:8321"
fi

wait "$SERVER_PID"
LAUNCH
chmod +x "$MACOS/EasyCalc"

# 6) Info.plist
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>EasyCalc</string>
  <key>CFBundleDisplayName</key><string>EasyCalc</string>
  <key>CFBundleIdentifier</key><string>com.theroachhouse.easycalc</string>
  <key>CFBundleVersion</key><string>$APP_VERSION</string>
  <key>CFBundleShortVersionString</key><string>$APP_VERSION</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>EasyCalc</string>
  <key>CFBundleIconFile</key><string>EasyCalc.icns</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
</dict></plist>
PLIST

# 7) Optional icon: drop an EasyCalc.icns next to this script to brand the app.
[ -f "$HERE/EasyCalc.icns" ] && cp "$HERE/EasyCalc.icns" "$RES/EasyCalc.icns" || true

# 8) Ad-hoc sign so the app launches on Apple Silicon (avoids the hard "app is
#    damaged" block; the softer, click-dismissable Gatekeeper prompt remains).
codesign --force --deep --sign - "$APP" 2>/dev/null || \
  echo "   (codesign unavailable — app still works, may need right-click > Open)"

# 9) Build a drag-to-Applications .dmg — the reviewer needs no terminal.
DMG="$DIST/EasyCalc-$APP_VERSION.dmg"
STAGE="$DIST/dmg"
rm -rf "$STAGE"; mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/EasyCalc.app"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "EasyCalc" -srcfolder "$STAGE" -ov -format UDZO "$DMG"
rm -rf "$STAGE"
echo "==> Done: $DMG"
echo "    Share this .dmg. Reviewer: open it, drag EasyCalc into Applications."
