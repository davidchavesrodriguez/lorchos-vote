const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);
const REQUIRED_TLS_MODES = new Set(['require', 'verify-ca', 'verify-full']);

export const runtimePostgresOptions = {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
} as const;

function isLocalHostname(hostname: string) {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, '');

  return (
    normalizedHostname === 'localhost' ||
    normalizedHostname === '127.0.0.1' ||
    normalizedHostname === '[::1]'
  );
}

export function getRuntimeDatabaseUrl(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const databaseUrl = environment.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error('Missing required environment variable: DATABASE_URL');
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }

  if (!POSTGRES_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
  }

  if (!parsedUrl.hostname || parsedUrl.pathname.length <= 1) {
    throw new Error('DATABASE_URL must include a hostname and database name.');
  }

  const sslMode = parsedUrl.searchParams.get('sslmode')?.toLowerCase();

  if (
    !isLocalHostname(parsedUrl.hostname) &&
    (!sslMode || !REQUIRED_TLS_MODES.has(sslMode))
  ) {
    throw new Error('Remote DATABASE_URL connections must require TLS.');
  }

  return databaseUrl;
}
