type AuthOriginEnvironment = {
  APP_URL?: string;
  BETTER_AUTH_URL?: string;
  NODE_ENV?: string;
  VERCEL?: string;
  VERCEL_URL?: string;
};

type AuthOriginConfiguration = {
  baseURL: string;
  trustedOrigins: string[];
};

function requireEnvironmentVariable(
  environment: AuthOriginEnvironment,
  name: 'BETTER_AUTH_URL',
): string {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseOrigin(
  value: string,
  name: 'APP_URL' | 'BETTER_AUTH_URL' | 'VERCEL_URL',
  isVercel: boolean,
): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }

  if (url.username || url.password) {
    throw new Error(`${name} must not contain credentials`);
  }

  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must be an origin without a path, query, or hash`);
  }

  if (url.protocol === 'https:') {
    return url.origin;
  }

  if (
    url.protocol === 'http:' &&
    !isVercel &&
    url.hostname === 'localhost'
  ) {
    return url.origin;
  }

  throw new Error(
    `${name} must use HTTPS; HTTP localhost is allowed only outside Vercel`,
  );
}

function parseVercelOrigin(value: string): string {
  const configuredValue = value.includes('://') ? value : `https://${value}`;
  const origin = parseOrigin(configuredValue, 'VERCEL_URL', true);
  const hostname = new URL(origin).hostname;

  if (!hostname.endsWith('.vercel.app')) {
    throw new Error('VERCEL_URL must be a vercel.app deployment host');
  }

  return origin;
}

export function getAuthOriginConfiguration(
  environment: AuthOriginEnvironment = process.env,
): AuthOriginConfiguration {
  const isVercel = environment.VERCEL === '1';
  const baseURL = parseOrigin(
    requireEnvironmentVariable(environment, 'BETTER_AUTH_URL'),
    'BETTER_AUTH_URL',
    isVercel,
  );
  const trustedOrigins = new Set([baseURL]);
  const appURL = environment.APP_URL?.trim();

  if (appURL) {
    trustedOrigins.add(parseOrigin(appURL, 'APP_URL', isVercel));
  }

  const vercelURL = environment.VERCEL_URL?.trim();

  if (isVercel && vercelURL) {
    trustedOrigins.add(parseVercelOrigin(vercelURL));
  }

  return {
    baseURL,
    trustedOrigins: [...trustedOrigins],
  };
}
