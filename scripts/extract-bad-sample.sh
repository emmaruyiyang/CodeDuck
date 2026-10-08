#!/usr/bin/env bash
set -euo pipefail

INPUT="${1:-}"
OUTPUT="${2:-data/music/she-so-bad.mp3}"

if [[ -z "$INPUT" ]]; then
  echo "Usage: npm run sample:bad -- /path/to/BAD-MV.mp4 [output.mp3]"
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"

# First prototype: the first "She's so bad..." hook in the uploaded official MV.
# Keep one compact phrase and slice it in-memory at runtime; no hundreds of tiny files.
ffmpeg -y -hide_banner -loglevel error \
  -ss 37.6 -t 5.7 -i "$INPUT" \
  -vn -ac 2 -ar 44100 -b:a 192k "$OUTPUT"

echo "Created $OUTPUT"
