#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OUT="$ROOT/ios/EmbeddedApp"
rm -rf "$OUT"
mkdir -p "$OUT"

# Keep the layout expected by web/server.js: web is next to assets, res, and splash.png.
cp -R "$ROOT/web" "$OUT/web"
cp -R "$ROOT/assets" "$OUT/assets"
cp -R "$ROOT/res" "$OUT/res"
cp "$ROOT/splash.png" "$OUT/splash.png"

# node_modules is generated for the device architecture during the build step.
# npm is used here rather than copying a developer's host-specific install.
(cd "$OUT/web" && npm ci --omit=dev)
rm -rf "$OUT/web/node_modules/.cache" "$OUT/web/data"
mkdir -p "$OUT/web/data/media/thumbs"

echo "Prepared $OUT"
