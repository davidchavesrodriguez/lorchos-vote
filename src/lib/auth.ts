import 'server-only';

import { betterAuth } from 'better-auth';

import { isAdminEmail } from '@/lib/admin-allowlist';
import { getAuthOriginConfiguration } from '@/lib/auth-origins';

const ADMIN_SESSION_MAX_AGE = 12 * 60 * 60;

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const { baseURL, trustedOrigins } = getAuthOriginConfiguration();

export const auth = betterAuth({
  baseURL,
  trustedOrigins,
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
