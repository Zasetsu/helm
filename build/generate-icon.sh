#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

SVG="build/icon.svg"
ICONSET="build/icon.iconset"
ICNS="build/icon.icns"
PNG="build/icon.png"

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "rsvg-convert is required. Install via: brew install librsvg" >&2
  exit 1
fi

rm -rf "$ICONSET"
mkdir -p "$ICONSET"

declare -a ENTRIES=(
  "16:icon_16x16.png"
  "32:icon_16x16@2x.png"
  "32:icon_32x32.png"
  "64:icon_32x32@2x.png"
  "128:icon_128x128.png"
  "256:icon_128x128@2x.png"
  "256:icon_256x256.png"
  "512:icon_256x256@2x.png"
  "512:icon_512x512.png"
  "1024:icon_512x512@2x.png"
)

for entry in "${ENTRIES[@]}"; do
  size="${entry%%:*}"
  name="${entry##*:}"
  rsvg-convert -w "$size" -h "$size" "$SVG" -o "$ICONSET/$name"
done

iconutil -c icns "$ICONSET" -o "$ICNS"
rsvg-convert -w 1024 -h 1024 "$SVG" -o "$PNG"
rm -rf "$ICONSET"

echo "Generated: $ICNS, $PNG"
