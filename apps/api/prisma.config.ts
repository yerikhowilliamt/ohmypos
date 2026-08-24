import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7 moved the datasource URL out of schema.prisma and into this file.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? '',
  },
});
