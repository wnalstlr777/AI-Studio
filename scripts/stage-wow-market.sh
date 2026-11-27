#!/usr/bin/env bash
set -euo pipefail

destination=${1:?Provide Pages staging directory}/games/wow-daily.json
if [[ -z "${WOW_BLIZZARD_CLIENT_ID:-}" && -z "${WOW_BLIZZARD_CLIENT_SECRET:-}" ]]; then
  printf 'WoW Forever feed awaits Blizzard API credentials\n'
  exit 0
fi

if [[ "${GITHUB_EVENT_NAME:-}" == schedule ]]; then
  # A failed daily collection leaves the prior Pages deployment live.
  node scripts/refresh-wow-market.mjs "$destination"
  exit
fi

previous=$(mktemp)
trap 'rm -f -- "$previous"' EXIT
if curl --fail --silent --show-error --max-time 10 --max-filesize 16384 \
    https://wnalstlr777.github.io/AI-Studio/games/wow-daily.json -o "$previous"; then
  if node scripts/refresh-wow-market.mjs "$destination" "$previous"; then
    exit
  fi
  # A market outage cannot block unrelated content changes.
  if node --input-type=module - "$previous" "$destination" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
import { readMarket } from './games/market-data.js';
const summary = readMarket(JSON.parse(readFileSync(process.argv[2], 'utf8')));
writeFileSync(process.argv[3], JSON.stringify(summary) + '\n');
JS
  then
    printf '::warning::Retained the previous market snapshot\n'
    exit
  fi
elif node scripts/refresh-wow-market.mjs "$destination"; then
  exit
fi
printf '::warning::Market data unavailable; publishing the unconnected notice\n'
