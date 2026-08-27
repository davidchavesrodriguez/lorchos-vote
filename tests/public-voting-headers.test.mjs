import assert from 'node:assert/strict';
import test from 'node:test';

import nextConfig from '../next.config.ts';

function headersByName(headers) {
  return new Map(headers.map(({ key, value }) => [key.toLowerCase(), value]));
}

test('all application routes receive general security headers', async () => {
  assert.equal(typeof nextConfig.headers, 'function');

  const routes = await nextConfig.headers();
  const generalRoute = routes.find(({ source }) => source === '/:path*');

  assert.ok(generalRoute);

  const headers = headersByName(generalRoute.headers);
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('x-frame-options'), 'DENY');

  const contentSecurityPolicy = headers.get('content-security-policy');
  assert.ok(contentSecurityPolicy);

  const directives = new Set(
    contentSecurityPolicy
      .split(';')
      .map((directive) => directive.trim())
      .filter(Boolean),
  );

  assert.ok(directives.has(`frame-ancestors 'none'`));
  assert.ok(directives.has(`base-uri 'self'`));
  assert.ok(directives.has(`form-action 'self'`));
});

test('public voting routes retain credential-safe response headers', async () => {
  const routes = await nextConfig.headers();
  const expectedHeaders = new Map([
    ['referrer-policy', 'no-referrer'],
    ['cache-control', 'private, no-store'],
    ['x-robots-tag', 'noindex, nofollow, noarchive'],
  ]);

  for (const source of [
    '/v',
    '/v/papeleta/:sessionId',
    '/api/voting/session',
  ]) {
    const route = routes.find((candidate) => candidate.source === source);

    assert.ok(route, `Missing header configuration for ${source}`);
    assert.deepEqual(headersByName(route.headers), expectedHeaders);
  }
});
