#!/usr/bin/env bash
set -euo pipefail

DOWNLOAD_URL="${1:-}"
OUTPUT_PATH="${2:-}"

if [ -z "$DOWNLOAD_URL" ] || [ -z "$OUTPUT_PATH" ]; then
  echo "Usage: $0 <download_url> <output_path>"
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"

echo "Fetching HTML from Stitch GCS download URL..."
curl -sSL "$DOWNLOAD_URL" -o "$OUTPUT_PATH"
echo "Saved successfully to $OUTPUT_PATH"
