#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

ICONSET="build/icon.iconset"
ICNS="build/icon.icns"
PNG_OUT="build/icon.png"

SOURCE_PNG="build/icon.source.png"
SVG="build/icon.svg"

if [[ -f "$SOURCE_PNG" ]]; then
  SOURCE_TYPE=png
elif [[ -f "$SVG" ]]; then
  SOURCE_TYPE=svg
  if ! command -v rsvg-convert >/dev/null 2>&1; then
    echo "rsvg-convert required for SVG source. Install: brew install librsvg" >&2
    exit 1
  fi
else
  echo "No icon source found." >&2
  echo "Drop a 1024x1024 PNG at build/icon.source.png — or keep build/icon.svg." >&2
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

MASTER="$ICONSET/_master.png"
if [[ "$SOURCE_TYPE" == "png" ]]; then
  cp "$SOURCE_PNG" "$MASTER"
  dims=$(sips -g pixelWidth -g pixelHeight "$MASTER" | awk '/pixel/ {print $2}' | paste -sd 'x' -)
  echo "Source PNG dimensions: $dims"
  if [[ "$dims" != "1024x1024" ]]; then
    echo "Warning: source PNG is not 1024x1024. Resizing for icon set, but ideally provide 1024x1024." >&2
    sips -z 1024 1024 "$MASTER" >/dev/null
  fi
else
  rsvg-convert -w 1024 -h 1024 "$SVG" -o "$MASTER"
fi

for entry in "${ENTRIES[@]}"; do
  size="${entry%%:*}"
  name="${entry##*:}"
  if [[ "$SOURCE_TYPE" == "svg" ]]; then
    rsvg-convert -w "$size" -h "$size" "$SVG" -o "$ICONSET/$name"
  else
    cp "$MASTER" "$ICONSET/$name"
    sips -z "$size" "$size" "$ICONSET/$name" >/dev/null
  fi
done

cp "$MASTER" "$PNG_OUT"
rm "$MASTER"
iconutil -c icns "$ICONSET" -o "$ICNS"
rm -rf "$ICONSET"

echo "Generated: $ICNS, $PNG_OUT"
