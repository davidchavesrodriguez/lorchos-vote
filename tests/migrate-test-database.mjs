import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import './test-database-bootstrap.mjs';

const client = postgres(process.env.DATABASE_URL, { max: 1 });
const database = drizzle(client);

try {
  await migrate(database, {
    migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
  });
} catch (error) {
  const errorCode =
    error && typeof error === 'object' && 'code' in error
      ? ' (' + String(error.code) + ')'
      : '';
  console.error('Test database migration failed' + errorCode + '.');
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
