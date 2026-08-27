import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);
const REQUIRED_TLS_MODES = new Set(['require', 'verify-ca', 'verify-full']);

export const migrationPostgresOptions = {
  max: 1,
  connect_timeout: 10,
};

class MigrationDatabaseConfigurationError extends Error {}

function isLocalHostname(hostname) {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, '');

  return (
    normalizedHostname === 'localhost' ||
    normalizedHostname === '127.0.0.1' ||
    normalizedHostname === '[::1]'
  );
}

export function getMigrationDatabaseUrl(environment = process.env) {
  const databaseUrl = environment.DATABASE_MIGRATION_URL?.trim();

  if (!databaseUrl) {
    throw new MigrationDatabaseConfigurationError(
      'DATABASE_MIGRATION_URL is required for migrations.',
    );
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new MigrationDatabaseConfigurationError(
      'DATABASE_MIGRATION_URL must be a valid PostgreSQL URL.',
    );
  }

  if (!POSTGRES_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new MigrationDatabaseConfigurationError(
      'DATABASE_MIGRATION_URL must use the PostgreSQL protocol.',
    );
  }

  if (!parsedUrl.hostname || parsedUrl.pathname.length <= 1) {
    throw new MigrationDatabaseConfigurationError(
      'DATABASE_MIGRATION_URL must include a hostname and database name.',
    );
  }

  const sslMode = parsedUrl.searchParams.get('sslmode')?.toLowerCase();

  if (
    !isLocalHostname(parsedUrl.hostname) &&
    (!sslMode || !REQUIRED_TLS_MODES.has(sslMode))
  ) {
    throw new MigrationDatabaseConfigurationError(
      'Remote DATABASE_MIGRATION_URL connections must require TLS.',
    );
  }

  return databaseUrl;
}

export async function migrateDatabase(environment = process.env) {
  const databaseUrl = getMigrationDatabaseUrl(environment);
  const client = postgres(databaseUrl, migrationPostgresOptions);

  try {
    const database = drizzle(client);
    await migrate(database, {
      migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
    });
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function main() {
  dotenv.config({ path: '.env.local', quiet: true });

  try {
    await migrateDatabase(process.env);
  } catch (error) {
    if (error instanceof MigrationDatabaseConfigurationError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }

    const errorCode =
      error && typeof error === 'object' && 'code' in error
        ? ' (' + String(error.code) + ')'
        : '';
    console.error('Database migration failed' + errorCode + '.');
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;

if (invokedPath === import.meta.url) {
  await main();
}
