import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import {
  generateVotingToken,
  hashVotingToken,
} from '../src/lib/voting-token.ts';
import { buildVotingUrl } from '../src/lib/voting-url.ts';

const originalAppUrl = process.env.APP_URL;

after(() => {
  if (originalAppUrl === undefined) {
    delete process.env.APP_URL;
  } else {
    process.env.APP_URL = originalAppUrl;
  }
});

test('multiple generations produce distinct voting tokens', () => {
  const tokens = Array.from({ length: 32 }, () => generateVotingToken());

  assert.equal(new Set(tokens).size, tokens.length);
});

test('voting tokens use an unpadded URL-safe base64 format', () => {
  const token = generateVotingToken();

  assert.equal(/^[A-Za-z0-9_-]{43}$/.test(token), true);
});

test('voting tokens contain the expected 256 bits', () => {
  const token = generateVotingToken();

  assert.equal(Buffer.from(token, 'base64url').byteLength, 32);
});

test('the SHA-256 voting token hash is deterministic hexadecimal', () => {
  const token = generateVotingToken();
  const firstHash = hashVotingToken(token);
  const secondHash = hashVotingToken(token);

  assert.equal(firstHash === secondHash, true);
  assert.equal(/^[a-f0-9]{64}$/.test(firstHash), true);
});

test('a voting token hash differs from its plaintext token', () => {
  const token = generateVotingToken();

  assert.equal(hashVotingToken(token) === token, false);
});

test('distinct voting tokens produce distinct hashes', () => {
  const firstToken = generateVotingToken();
  const secondToken = generateVotingToken();

  assert.equal(
    hashVotingToken(firstToken) === hashVotingToken(secondToken),
    false,
  );
});

test('voting URLs normalize APP_URL and append the secret path', () => {
  process.env.APP_URL = '  https://example.test/base/?ignored=yes#fragment  ';

  assert.equal(
    buildVotingUrl('test-token'),
    'https://example.test/base/v/test-token',
  );
});

test('voting URL construction requires APP_URL', () => {
  delete process.env.APP_URL;

  assert.throws(() => buildVotingUrl('test-token'));
});
