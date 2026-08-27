const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);
const DEFAULT_POSTGRES_PORT = '5432';

function parsePostgresUrl(value, variableName) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error(variableName + ' must be a valid PostgreSQL URL.');
  }

  if (!POSTGRES_PROTOCOLS.has(url.protocol)) {
    throw new Error(variableName + ' must use the PostgreSQL protocol.');
  }

  let databaseName;

  try {
    databaseName = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error(variableName + ' contains an invalid database name.');
  }

  if (!url.hostname || !databaseName) {
    throw new Error(
      variableName + ' must include a hostname and database name.',
    );
  }

  return {
    databaseName,
    hostname: url.hostname.toLowerCase().replace(/\.$/, ''),
    port: url.port || DEFAULT_POSTGRES_PORT,
  };
}

function identifiesSameDatabase(first, second) {
  return (
    first.hostname === second.hostname &&
    first.port === second.port &&
    first.databaseName === second.databaseName
  );
}

export function validateTestDatabaseEnvironment(environment = process.env) {
  const testDatabaseUrl = environment.TEST_DATABASE_URL?.trim();

  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is required for integration tests.');
  }

  const testDatabase = parsePostgresUrl(
    testDatabaseUrl,
    'TEST_DATABASE_URL',
  );

  if (!testDatabase.databaseName.toLowerCase().endsWith('_test')) {
    throw new Error(
      'TEST_DATABASE_URL must target a database whose name ends with _test.',
    );
  }

  const applicationDatabaseUrl = environment.DATABASE_URL?.trim();

  if (applicationDatabaseUrl) {
    const applicationDatabase = parsePostgresUrl(
      applicationDatabaseUrl,
      'DATABASE_URL',
    );

    if (identifiesSameDatabase(testDatabase, applicationDatabase)) {
      throw new Error(
        'TEST_DATABASE_URL and DATABASE_URL target the same database (' +
          testDatabase.hostname +
          '/' +
          testDatabase.databaseName +
          ').',
      );
    }
  }

  return testDatabase;
}

export function configureTestDatabaseEnvironment(environment = process.env) {
  const configuration = validateTestDatabaseEnvironment(environment);
  environment.DATABASE_URL = environment.TEST_DATABASE_URL.trim();
  return configuration;
}
