import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  getMigrationDatabaseUrl,
  migrationPostgresOptions,
} from '../scripts/migrate-database.mjs';
import {
  getRuntimeDatabaseUrl,
  runtimePostgresOptions,
} from '../src/db/config.ts';

const LOCAL_DATABASE_URL =
  'postgresql://lorchos:local_password@localhost:5432/lorchos_vote';
const REMOTE_DATABASE_URL =
  'postgresql://lorchos:remote_password@ep-example.neon.tech/lorchos_vote';

function assertSafeRejection(callback, expectedMessage) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, expectedMessage);
    assert.doesNotMatch(error.message, /local_password|remote_password/);
    return true;
  });
}

function runMigrationScript(environment) {
  const scriptPath = fileURLToPath(
    new URL('../scripts/migrate-database.mjs', import.meta.url),
  );
  const childEnvironment = { ...process.env };

  delete childEnvironment.DATABASE_URL;
  delete childEnvironment.DATABASE_MIGRATION_URL;
  delete childEnvironment.TEST_DATABASE_URL;

  Object.assign(childEnvironment, environment);

  return spawnSync(process.execPath, [scriptPath], {
    cwd: tmpdir(),
    encoding: 'utf8',
    env: childEnvironment,
  });
}

test('runtime postgres-js uses conservative serverless limits', () => {
  assert.deepEqual(runtimePostgresOptions, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
});

test('runtime accepts the local PostgreSQL URL without TLS', () => {
  assert.equal(
    getRuntimeDatabaseUrl({ DATABASE_URL: `  ${LOCAL_DATABASE_URL}  ` }),
    LOCAL_DATABASE_URL,
  );
});

test('runtime requires TLS for a remote PostgreSQL URL', () => {
  assertSafeRejection(
    () => getRuntimeDatabaseUrl({ DATABASE_URL: REMOTE_DATABASE_URL }),
    /must require TLS/,
  );
});

test('runtime accepts a remote PostgreSQL URL with sslmode=require', () => {
  const secureUrl = `${REMOTE_DATABASE_URL}?sslmode=require`;

  assert.equal(getRuntimeDatabaseUrl({ DATABASE_URL: secureUrl }), secureUrl);
});

test('migration postgres-js uses one connection and an explicit timeout', () => {
  assert.deepEqual(migrationPostgresOptions, {
    max: 1,
    connect_timeout: 10,
  });
});

test('migration requires DATABASE_MIGRATION_URL without DATABASE_URL fallback', () => {
  assertSafeRejection(
    () => getMigrationDatabaseUrl({ DATABASE_URL: LOCAL_DATABASE_URL }),
    /DATABASE_MIGRATION_URL is required/,
  );
});

test('migration rejects an invalid URL without exposing its password', () => {
  assertSafeRejection(
    () =>
      getMigrationDatabaseUrl({
        DATABASE_MIGRATION_URL: 'not a URL remote_password',
      }),
    /valid PostgreSQL URL/,
  );
});

test('migration rejects a non-PostgreSQL protocol', () => {
  assertSafeRejection(
    () =>
      getMigrationDatabaseUrl({
        DATABASE_MIGRATION_URL:
          'https://lorchos:remote_password@example.test/lorchos_vote',
      }),
    /PostgreSQL protocol/,
  );
});

test('migration accepts the explicit local administrative URL', () => {
  assert.equal(
    getMigrationDatabaseUrl({
      DATABASE_MIGRATION_URL: LOCAL_DATABASE_URL,
      DATABASE_URL: REMOTE_DATABASE_URL,
      TEST_DATABASE_URL:
        'postgresql://lorchos:test_password@localhost:5433/lorchos_vote_test',
    }),
    LOCAL_DATABASE_URL,
  );
});

test('migration requires TLS for remote administrative connections', () => {
  assertSafeRejection(
    () =>
      getMigrationDatabaseUrl({
        DATABASE_MIGRATION_URL: REMOTE_DATABASE_URL,
      }),
    /must require TLS/,
  );

  const secureUrl = `${REMOTE_DATABASE_URL}?sslmode=require`;
  assert.equal(
    getMigrationDatabaseUrl({ DATABASE_MIGRATION_URL: secureUrl }),
    secureUrl,
  );
});

test('db:migrate fails before connecting when only DATABASE_URL is set', () => {
  const result = runMigrationScript({ DATABASE_URL: LOCAL_DATABASE_URL });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DATABASE_MIGRATION_URL is required/);
  assert.doesNotMatch(result.stderr, /local_password|ECONNREFUSED/);
});
