import assert from 'node:assert/strict';
import test from 'node:test';

import nextConfig from '../next.config.ts';

test('public voting routes receive credential-safe response headers', async () => {
  assert.equal(typeof nextConfig.headers, 'function');

  const routes = await nextConfig.headers();
  const publicVotingRoute = routes.find(({ source }) => source === '/v');
  const ballotRoute = routes.find(
    ({ source }) => source === '/v/papeleta/:sessionId',
  );
  const exchangeRoute = routes.find(
    ({ source }) => source === '/api/voting/session',
  );

  assert.ok(publicVotingRoute);
  assert.ok(ballotRoute);
  assert.ok(exchangeRoute);
  assert.deepEqual(publicVotingRoute.headers, [
    { key: 'Referrer-Policy', value: 'no-referrer' },
    { key: 'Cache-Control', value: 'private, no-store' },
    {
      key: 'X-Robots-Tag',
      value: 'noindex, nofollow, noarchive',
    },
  ]);
  assert.deepEqual(ballotRoute.headers, publicVotingRoute.headers);
  assert.deepEqual(exchangeRoute.headers, publicVotingRoute.headers);
});
