import 'server-only';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '@/db/schema';

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error('Missing required environment variable: DATABASE_URL');
}

const globalForDatabase = globalThis as typeof globalThis & {
  lorchosPostgresClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDatabase.lorchosPostgresClient ?? postgres(databaseUrl);

if (process.env.NODE_ENV !== 'production') {
  globalForDatabase.lorchosPostgresClient = client;
}

export const db = drizzle(client, { schema });
