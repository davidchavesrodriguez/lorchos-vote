import 'server-only';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { getRuntimeDatabaseUrl, runtimePostgresOptions } from '@/db/config';
import * as schema from '@/db/schema';

const databaseUrl = getRuntimeDatabaseUrl();

const globalForDatabase = globalThis as typeof globalThis & {
  lorchosPostgresClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDatabase.lorchosPostgresClient ??
  postgres(databaseUrl, runtimePostgresOptions);

if (process.env.NODE_ENV !== 'production') {
  globalForDatabase.lorchosPostgresClient = client;
}

export const db = drizzle(client, { schema });
