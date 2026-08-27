import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, test } from 'node:test';

const canonicalOrigin = 'https://lorchos-vote-twha.vercel.app';
const deploymentOrigin =
  'https://lorchos-vote-twha-b1x9s3yf0-davidchavesrodriguezs-projects.vercel.app';
const otherDeploymentOrigin =
  'https://lorchos-vote-twha-another-deployment.vercel.app';
const originalEnvironment = {
  ADMIN_EMAILS: process.env.ADMIN_EMAILS,
  APP_URL: process.env.APP_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  NODE_ENV: process.env.NODE_ENV,
  VERCEL: process.env.VERCEL,
  VERCEL_URL: process.env.VERCEL_URL,
};

Object.assign(process.env, {
  ADMIN_EMAILS: 'admin@example.com',
  APP_URL: canonicalOrigin,
  BETTER_AUTH_SECRET: 'test-secret-with-at-least-32-characters',
  BETTER_AUTH_URL: canonicalOrigin,
  GOOGLE_CLIENT_ID: 'test-google-client-id',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
  NODE_ENV: 'production',
  VERCEL: '1',
  VERCEL_URL: deploymentOrigin.slice('https://'.length),
});

after(() => {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

const { getAuthOriginConfiguration } = await import(
  '../src/lib/auth-origins.ts'
);
const { auth } = await import('../src/lib/auth.ts');
const authContext = await auth.$context;

function productionEnvironment(overrides = {}) {
  return {
    APP_URL: canonicalOrigin,
    BETTER_AUTH_URL: canonicalOrigin,
    NODE_ENV: 'production',
    VERCEL: '1',
    VERCEL_URL: deploymentOrigin.slice('https://'.length),
    ...overrides,
  };
}

async function signInFrom(origin) {
  return auth.handler(
    new Request(`${deploymentOrigin}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'better-auth.session_token=test-session',
        origin,
      },
      body: JSON.stringify({
        callbackURL: '/admin',
        disableRedirect: true,
        errorCallbackURL: '/admin/login',
        provider: 'google',
      }),
    }),
  );
}

test('accepts the canonical production origin', () => {
  assert.equal(authContext.isTrustedOrigin(canonicalOrigin), true);
});

test('accepts only the current VERCEL_URL deployment origin', () => {
  assert.equal(authContext.isTrustedOrigin(deploymentOrigin), true);
});

test('rejects a Vercel deployment that is not listed', async () => {
  assert.equal(authContext.isTrustedOrigin(otherDeploymentOrigin), false);

  const response = await signInFrom(otherDeploymentOrigin);

  assert.equal(response.status, 403);
});

test('accepts HTTP localhost during a local production build', () => {
  const localBuild = getAuthOriginConfiguration({
    APP_URL: 'http://localhost:3000',
    BETTER_AUTH_URL: 'http://localhost:3000',
    NODE_ENV: 'production',
  });

  assert.deepEqual(localBuild, {
    baseURL: 'http://localhost:3000',
    trustedOrigins: ['http://localhost:3000'],
  });
});

test('rejects HTTP localhost in Vercel', () => {
  assert.throws(
    () =>
      getAuthOriginConfiguration(
        productionEnvironment({
          APP_URL: 'http://localhost:3000',
          BETTER_AUTH_URL: 'http://localhost:3000',
        }),
      ),
    /HTTP localhost is allowed only outside Vercel/,
  );
  assert.equal(authContext.isTrustedOrigin('http://localhost:3000'), false);
});

test('trusts the canonical and current deployment origins in Vercel', () => {
  assert.deepEqual(getAuthOriginConfiguration(productionEnvironment()), {
    baseURL: canonicalOrigin,
    trustedOrigins: [canonicalOrigin, deploymentOrigin],
  });
});

test('ignores VERCEL_URL outside Vercel', () => {
  assert.deepEqual(
    getAuthOriginConfiguration(productionEnvironment({ VERCEL: undefined })),
    {
      baseURL: canonicalOrigin,
      trustedOrigins: [canonicalOrigin],
    },
  );
});

test('rejects invalid configured origins in Vercel', () => {
  assert.throws(
    () =>
      getAuthOriginConfiguration(
        productionEnvironment({ APP_URL: 'http://evil.example' }),
      ),
    /must use HTTPS/,
  );
  assert.throws(
    () =>
      getAuthOriginConfiguration(
        productionEnvironment({ APP_URL: `${canonicalOrigin}/admin` }),
      ),
    /origin without a path/,
  );
  assert.throws(
    () =>
      getAuthOriginConfiguration(
        productionEnvironment({
          VERCEL_URL: 'deployment.vercel.app/api/auth',
        }),
      ),
    /origin without a path/,
  );
  assert.throws(
    () =>
      getAuthOriginConfiguration(
        productionEnvironment({ VERCEL_URL: 'evil.example' }),
      ),
    /must be a vercel\.app deployment host/,
  );
});

test('rejects an arbitrary origin', async () => {
  assert.equal(authContext.isTrustedOrigin('https://evil.example'), false);

  const response = await signInFrom('https://evil.example');

  assert.equal(response.status, 403);
});

test('keeps Better Auth origin and CSRF checks enabled', () => {
  const authSource = readFileSync(
    new URL('../src/lib/auth.ts', import.meta.url),
    'utf8',
  );

  assert.equal(auth.options.advanced?.disableOriginCheck, undefined);
  assert.equal(auth.options.advanced?.disableCSRFCheck, undefined);
  assert.equal(authContext.skipOriginCheck, false);
  assert.equal(authContext.skipCSRFCheck, false);
  assert.doesNotMatch(authSource, /disableOriginCheck|disableCSRFCheck/);
});

test('uses BETTER_AUTH_URL for the Google callback', async () => {
  assert.equal(auth.options.baseURL, canonicalOrigin);
  assert.equal(authContext.baseURL, `${canonicalOrigin}/api/auth`);

  const response = await signInFrom(deploymentOrigin);
  assert.equal(response.status, 200);

  const result = await response.json();
  const authorizationURL = new URL(result.url);

  assert.equal(
    authorizationURL.searchParams.get('redirect_uri'),
    `${canonicalOrigin}/api/auth/callback/google`,
  );
});
