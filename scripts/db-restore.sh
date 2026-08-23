#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL not set}"
: "${BACKUP_FILE:?BACKUP_FILE not set}"
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Error: BACKUP_FILE '$BACKUP_FILE' not found" >&2
  exit 1
fi
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="$DATABASE_URL" "$BACKUP_FILE"
echo "Restore completed from $BACKUP_FILE"
