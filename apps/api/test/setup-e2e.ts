// e2e uses the dedicated ohmypos_e2e database (resetDatabase truncates everything).
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, '../.env.test') });
