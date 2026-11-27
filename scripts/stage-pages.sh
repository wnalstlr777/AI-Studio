#!/usr/bin/env bash
set -euo pipefail

destination=${1:?Provide a Pages staging directory}
if [[ -e "$destination" ]]; then
  printf 'Pages staging directory must be new: %s\n' "$destination" >&2
  exit 1
fi
mkdir -p "$destination"
git archive HEAD -- index.html shared/hina docs/hina-gifs \
  mind/mind.css mind/mind.js mind/domains.js mind/public-summary.js mind/survival-summary.json |
  tar -x -C "$destination"
node scripts/validate-mind-summary.mjs "$destination/mind/survival-summary.json"
