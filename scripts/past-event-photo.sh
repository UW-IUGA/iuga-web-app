#!/usr/bin/env bash
# past-event-photo.sh — prepare one photo for the Events page's "Previous events".
#
# Usage:
#   scripts/past-event-photo.sh <source-image> <name>
#
# Writes two WebP files to frontend/src/assets/gallery/past-events/:
#   <name>.webp        2000px on its long edge, for the full-size photo viewer
#   <name>-small.webp   800px on its long edge, for cards, thumbnails, and the hero
#
# Always start from the original camera file, not an already-compressed copy.
# ffmpeg applies the camera's rotation and resizes; cwebp encodes. Requires both.

set -euo pipefail

SOURCE="${1:-}"
NAME="${2:-}"
[ -n "$SOURCE" ] && [ -n "$NAME" ] || { echo "usage: past-event-photo.sh <source-image> <name>" >&2; exit 2; }
[ -r "$SOURCE" ] || { echo "ERROR: cannot read $SOURCE" >&2; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || { echo "ERROR: ffmpeg is required" >&2; exit 1; }
command -v cwebp >/dev/null 2>&1 || { echo "ERROR: cwebp is required" >&2; exit 1; }

DEST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/frontend/src/assets/gallery/past-events"
WORK="$(mktemp -d)"
trap 'rm -r "$WORK"' EXIT

# encode <long-edge-pixels> <quality> <output-file>
encode() {
  local scaled="$WORK/$1.png"
  ffmpeg -loglevel error -y -i "$SOURCE" \
    -vf "scale='if(gt(iw,ih),min($1,iw),-2)':'if(gt(iw,ih),-2,min($1,ih))':flags=lanczos" "$scaled"
  cwebp -quiet -q "$2" -m 6 -sharp_yuv "$scaled" -o "$3"
}

mkdir -p "$DEST"
encode 2000 86 "$DEST/$NAME.webp"
encode 800 82 "$DEST/$NAME-small.webp"
echo "wrote $DEST/$NAME.webp and $DEST/$NAME-small.webp"
