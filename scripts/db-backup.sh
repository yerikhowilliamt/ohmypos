#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL not set}"
OUT="backups/ohmypos_$(date +%Y%m%d_%H%M%S).dump"
mkdir -p backups
pg_dump --format=custom --file="$OUT" "$DATABASE_URL"
echo "Backup written to $OUT"
