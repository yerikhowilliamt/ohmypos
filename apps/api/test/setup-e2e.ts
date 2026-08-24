// e2e tests run against a dedicated ohmypos_e2e database (Phase 14 Gate 2,
// DEBT-020) — never the ohmypos_db that `pnpm dev` uses, since resetDatabase()
// truncates everything and the volume seeder writes ~1.2M synthetic rows.
// Loading .env.test here keeps the connection string in one place rather than
// duplicated per suite.
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, '../.env.test') });
