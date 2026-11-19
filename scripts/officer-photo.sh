#!/usr/bin/env bash
# officer-photo.sh — normalize one officer photo to the profile card's shape.
#
# Usage:
#   scripts/officer-photo.sh <source-image> <output-image>
#
# Center-crops to the card's 3:4 shape, scales down to at most 900x1200
# (never upscaling), and re-encodes to the output format (.jpg, .png, .webp).
# Chromium otherwise hard-downscales photos whose size and aspect ratio both
# differ from the card, which shows up as grain:
# https://stackoverflow.com/questions/74502978
#
# The output keeps the source's colour profile (sips converts through
# ColorSync), so Display P3 photos stay Display P3 for the browser to convert.
# Requires macOS sips.

set -euo pipefail

SOURCE="${1:-}"
OUTPUT="${2:-}"
[ -n "$SOURCE" ] && [ -n "$OUTPUT" ] || { echo "usage: officer-photo.sh <source-image> <output-image>" >&2; exit 2; }
[ -r "$SOURCE" ] || { echo "ERROR: cannot read $SOURCE" >&2; exit 1; }
command -v sips >/dev/null 2>&1 || { echo "ERROR: sips is required (macOS)" >&2; exit 1; }

MAX_WIDTH=900
MAX_HEIGHT=1200
JPEG_QUALITY=85

prop() { sips -g "$1" "$SOURCE" | awk -v key="$1" '$1 == key ":" { print $2 }'; }

orientation="$(prop orientation)"
case "$orientation" in
  ""|"<nil>"|up) ;;
  *)
    echo "ERROR: $SOURCE has EXIF orientation '$orientation'; rotate it upright first" >&2
    exit 1
    ;;
esac

src_width="$(prop pixelWidth)"
src_height="$(prop pixelHeight)"

# Center-crop to 3:4 without exceeding the source.
if [ $((src_width * 4)) -gt $((src_height * 3)) ]; then
  crop_width=$((src_height * 3 / 4))
  crop_height=$src_height
else
  crop_width=$src_width
  crop_height=$((src_width * 4 / 3))
fi

# Fit inside the card at 2x (429x572 CSS), never upscaling. Anything at or
# below the cap keeps its cropped size untouched.
if [ "$crop_width" -gt "$MAX_WIDTH" ]; then
  out_width=$MAX_WIDTH
  out_height=$MAX_HEIGHT
else
  out_width=$crop_width
  out_height=$crop_height
fi

WORK="$(mktemp -d)"
trap 'rm -r "$WORK"' EXIT

# sips -c takes height first.
sips --cropToHeightWidth "$crop_height" "$crop_width" "$SOURCE" --out "$WORK/cropped.png" >/dev/null
if [ "$out_width" -ne "$crop_width" ] || [ "$out_height" -ne "$crop_height" ]; then
  sips --resampleHeightWidth "$out_height" "$out_width" "$WORK/cropped.png" --out "$WORK/scaled.png" >/dev/null
  ready="$WORK/scaled.png"
else
  ready="$WORK/cropped.png"
fi

mkdir -p "$(dirname "$OUTPUT")"
case "$OUTPUT" in
  *.jpg|*.jpeg)
    sips -s format jpeg -s formatOptions "$JPEG_QUALITY" "$ready" --out "$WORK/out.jpg" >/dev/null
    ;;
  *.png)
    cp "$ready" "$WORK/out.png"
    ;;
  *.webp)
    command -v cwebp >/dev/null 2>&1 || { echo "ERROR: cwebp is required for .webp output" >&2; exit 1; }
    cwebp -quiet -q 86 -m 6 -sharp_yuv "$ready" -o "$WORK/out.webp" >/dev/null
    ;;
  *)
    echo "ERROR: unsupported output format: $OUTPUT (use .jpg, .png, or .webp)" >&2
    exit 1
    ;;
esac

mv "$WORK"/out.* "$OUTPUT"
echo "wrote $OUTPUT (${out_width}x${out_height})"
