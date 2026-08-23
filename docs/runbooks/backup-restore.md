# Runbook: Database Backup & Restore

**DB:** `ohmypos_db` on `postgres:16-alpine` (host port 5433 locally)

## Backup

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/ohmypos_db" ./scripts/db-backup.sh
```
Output: `backups/ohmypos_YYYYMMDD_HHMMSS.dump`

## Restore (to a throwaway container — never restore directly to dev DB)

1. Spin up throwaway Postgres:
```bash
docker run --rm -d -p 5434:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ohmypos_db postgres:16-alpine
```

2. Restore:
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/ohmypos_db" \
BACKUP_FILE="backups/ohmypos_20260823_120000.dump" \
./scripts/db-restore.sh
```

3. Verify row counts match source:
```bash
# Source (dev DB on port 5433)
psql "postgresql://postgres:postgres@localhost:5433/ohmypos_db" \
  -c "SELECT 'sales' AS t, COUNT(*) FROM sales UNION ALL SELECT 'sale_items', COUNT(*) FROM sale_items UNION ALL SELECT 'raw_materials', COUNT(*) FROM raw_materials UNION ALL SELECT 'ledger_entries', COUNT(*) FROM ledger_entries UNION ALL SELECT 'stock_movements', COUNT(*) FROM stock_movements;"

# Restored (throwaway on port 5434)
psql "postgresql://postgres:postgres@localhost:5434/ohmypos_db" \
  -c "SELECT 'sales' AS t, COUNT(*) FROM sales UNION ALL SELECT 'sale_items', COUNT(*) FROM sale_items UNION ALL SELECT 'raw_materials', COUNT(*) FROM raw_materials UNION ALL SELECT 'ledger_entries', COUNT(*) FROM ledger_entries UNION ALL SELECT 'stock_movements', COUNT(*) FROM stock_movements;"
```
Counts must match. Diff = restore failed.

4. Tear down throwaway:
```bash
docker stop $(docker ps -q --filter "ancestor=postgres:16-alpine" --filter "publish=5434")
```

## `.gitignore`

`backups/` is already gitignored (added by this runbook). Never commit dump files.
