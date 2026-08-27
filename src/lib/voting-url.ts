import 'server-only';

function getAppBaseUrl(): string {
  const configuredUrl = process.env.APP_URL?.trim();

  if (!configuredUrl) {
    throw new Error('Missing required environment variable: APP_URL');
  }

  const url = new URL(configuredUrl);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('APP_URL must use HTTP or HTTPS');
  }

  if (url.username || url.password) {
    throw new Error('APP_URL must not contain credentials');
  }

  url.search = '';
  url.hash = '';

  return url.toString().replace(/\/+$/, '');
}

export function buildVotingUrl(token: string): string {
  return `${getAppBaseUrl()}/v#${token}`;
}

export function getVotingAppOrigin(): string {
  return new URL(getAppBaseUrl()).origin;
}
