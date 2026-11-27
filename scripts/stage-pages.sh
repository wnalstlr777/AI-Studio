#!/usr/bin/env bash
set -euo pipefail

destination=${1:?Provide a Pages staging directory}
if [[ -e "$destination" ]]; then
  printf 'Pages staging directory must be new: %s\n' "$destination" >&2
  exit 1
fi

web_paths=(
  index.html app.webmanifest sw.js pwa/icon-192.png pwa/icon-512.png
  ota/release-note.txt ota/location.js ota/protocol.js ota/trust.js ota/ui.css ota/ui.js
  games/market-data.js games/wow-panel.css games/wow-panel.js
  shared/hina mind/mind.css mind/mind.js mind/domains.js mind/public-summary.js
)
mkdir -p "$destination"
git archive HEAD -- "${web_paths[@]}" docs/hina-gifs mind/survival-summary.json games/wow-daily.json |
  tar -x -C "$destination"
if [[ -n "$(find "$destination" -type l -print -quit)" ]]; then
  printf 'Pages staging cannot contain symbolic links\n' >&2
  exit 1
fi
node scripts/validate-mind-summary.mjs "$destination/mind/survival-summary.json"
bash scripts/stage-wow-market.sh "$destination"
node scripts/build-ota.mjs "$destination"

if [[ -n "${HINA_OTA_DEV_REF:-}" ]]; then
  ref="refs/remotes/origin/$HINA_OTA_DEV_REF"
  git check-ref-format "$ref"
  preview=$(mktemp -d)
  trap 'rm -rf -- "$preview"' EXIT
  git archive "$ref" -- "${web_paths[@]}" | tar -x -C "$preview"
  node scripts/build-ota.mjs "$destination" "$preview" development
fi
