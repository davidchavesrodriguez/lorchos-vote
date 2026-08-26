import 'server-only';

import { betterAuth } from 'better-auth';

import { isAdminEmail } from '@/lib/admin-allowlist';

const ADMIN_SESSION_MAX_AGE = 12 * 60 * 60;

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const auth = betterAuth({
  baseURL: requireEnvironmentVariable('BETTER_AUTH_URL'),
  secret: requireEnvironmentVariable('BETTER_AUTH_SECRET'),
  socialProviders: {
    google: {
      clientId: requireEnvironmentVariable('GOOGLE_CLIENT_ID'),
      clientSecret: requireEnvironmentVariable('GOOGLE_CLIENT_SECRET'),
    },
  },
  user: {
    validateUserInfo: ({ user }) => {
      if (!isAdminEmail(user.email)) {
        return { error: 'admin_access_denied' };
      }
    },
  },
  session: {
    expiresIn: ADMIN_SESSION_MAX_AGE,
    disableSessionRefresh: true,
    cookieCache: {
      enabled: true,
      maxAge: ADMIN_SESSION_MAX_AGE,
      strategy: 'jwe',
      refreshCache: false,
    },
  },
});
