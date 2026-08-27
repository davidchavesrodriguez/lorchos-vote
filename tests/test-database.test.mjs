import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  configureTestDatabaseEnvironment,
  validateTestDatabaseEnvironment,
} from './test-database.mjs';

const VALID_TEST_URL =
  'postgresql://test_user:test_password@localhost:5433/lorchos_vote_test';
const DIRECT_DATABASE_SCRIPTS = [
  './migrate-test-database.mjs',
  './check-test-database-schema.mjs',
];

function runDatabaseScriptDirectly(script, environment) {
  const scriptPath = fileURLToPath(new URL(script, import.meta.url));
  const childEnvironment = { ...process.env, ...environment };

  delete childEnvironment.TEST_DATABASE_URL;

  if (environment.TEST_DATABASE_URL !== undefined) {
    childEnvironment.TEST_DATABASE_URL = environment.TEST_DATABASE_URL;
  }

  return spawnSync(process.execPath, [scriptPath], {
    cwd: tmpdir(),
    encoding: 'utf8',
    env: childEnvironment,
  });
}

function assertRejected(environment, expectedMessage) {
  assert.throws(
    () => validateTestDatabaseEnvironment(environment),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, expectedMessage);
      assert.doesNotMatch(error.message, /test_password|normal_password/);
      return true;
    },
  );
}

test('rejects a missing TEST_DATABASE_URL', () => {
  assertRejected({}, /TEST_DATABASE_URL is required/);
});

test('rejects an invalid TEST_DATABASE_URL', () => {
  assertRejected({ TEST_DATABASE_URL: 'not a URL' }, /valid PostgreSQL URL/);
});

test('rejects a non-PostgreSQL protocol', () => {
  assertRejected(
    { TEST_DATABASE_URL: 'https://localhost/lorchos_vote_test' },
    /PostgreSQL protocol/,
  );
});

test('rejects TEST_DATABASE_URL equal to DATABASE_URL', () => {
  assertRejected(
    {
      TEST_DATABASE_URL: VALID_TEST_URL,
      DATABASE_URL: VALID_TEST_URL,
    },
    /target the same database/,
  );
});

test('rejects the same database after normalizing harmless URL differences', () => {
  assertRejected(
    {
      TEST_DATABASE_URL:
        'postgres://test_user:test_password@DB.EXAMPLE.TEST:5432/lorchos%5Fvote%5Ftest?sslmode=require',
      DATABASE_URL:
        'postgresql://normal_user:normal_password@db.example.test/lorchos_vote_test',
    },
    /target the same database/,
  );
});

test('rejects a database name without the test marker', () => {
  assertRejected(
    {
      TEST_DATABASE_URL:
        'postgresql://test_user:test_password@localhost:5433/lorchos_vote',
    },
    /ends with _test/,
  );
});

test('accepts lorchos_vote_test', () => {
  const configuration = validateTestDatabaseEnvironment({
    TEST_DATABASE_URL: VALID_TEST_URL,
  });

  assert.equal(configuration.databaseName, 'lorchos_vote_test');
  assert.equal(configuration.hostname, 'localhost');
});

test('accepts a remote host when the database has the test marker', () => {
  const configuration = validateTestDatabaseEnvironment({
    TEST_DATABASE_URL:
      'postgresql://ci_user:test_password@ephemeral-db.example.test/ci_run_test',
  });

  assert.equal(configuration.databaseName, 'ci_run_test');
  assert.equal(configuration.hostname, 'ephemeral-db.example.test');
});

test('configures application imports to use only TEST_DATABASE_URL', () => {
  const environment = {
    TEST_DATABASE_URL: '  ' + VALID_TEST_URL + '  ',
    DATABASE_URL:
      'postgresql://normal_user:normal_password@localhost:5432/lorchos_vote',
  };

  configureTestDatabaseEnvironment(environment);

  assert.equal(environment.DATABASE_URL, VALID_TEST_URL);
});

for (const script of DIRECT_DATABASE_SCRIPTS) {
  test(script + ' rejects direct execution without TEST_DATABASE_URL', () => {
    const result = runDatabaseScriptDirectly(script, {
      DATABASE_URL:
        'postgresql://normal_user:normal_password@localhost:5432/lorchos_vote',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /TEST_DATABASE_URL is required/);
    assert.doesNotMatch(result.stderr, /ECONNREFUSED/);
  });

  test(script + ' rejects direct execution with the application database', () => {
    const result = runDatabaseScriptDirectly(script, {
      TEST_DATABASE_URL: VALID_TEST_URL,
      DATABASE_URL: VALID_TEST_URL,
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /target the same database/);
    assert.doesNotMatch(result.stderr, /ECONNREFUSED/);
  });
}
