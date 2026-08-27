import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import {
  createVotingSession,
  createVotingSessionId,
  getVotingSessionCookieName,
  hasValidVotingSessionIdStructure,
  serializeLegacyVotingSessionCookieDeletion,
  serializeVotingSessionCookie,
  verifyVotingSession,
  VOTING_SESSION_MAX_AGE_SECONDS,
} from '../src/lib/voting-session.ts';

const originalSecret = process.env.VOTING_SESSION_SECRET;
const credentialA = '47e0659b-1d64-4ce4-9e5a-c2986396a521';
const credentialB = '02050d7f-a443-4863-abf5-8bcdbab9f889';
const sessionIdA = Buffer.alloc(16, 1).toString('base64url');
const sessionIdB = Buffer.alloc(16, 2).toString('base64url');
const now = Date.UTC(2026, 7, 26, 12);

before(() => {
  process.env.VOTING_SESSION_SECRET =
    'unit-test-only-independent-secret-with-sufficient-length';
});

after(() => {
  if (originalSecret === undefined) {
    delete process.env.VOTING_SESSION_SECRET;
  } else {
    process.env.VOTING_SESSION_SECRET = originalSecret;
  }
});

test('session identifiers use 128 random bits in canonical base64url', () => {
  const first = createVotingSessionId();
  const second = createVotingSessionId();

  assert.equal(Buffer.from(first, 'base64url').length, 16);
  assert.equal(hasValidVotingSessionIdStructure(first), true);
  assert.equal(hasValidVotingSessionIdStructure(second), true);
  assert.notEqual(first, second);
});

test('a valid signed voting session verifies only for its route sessionId', () => {
  const signedSession = createVotingSession(sessionIdA, credentialA, now);

  assert.deepEqual(
    verifyVotingSession(signedSession, sessionIdA, now + 1_000),
    {
      sessionId: sessionIdA,
      credentialId: credentialA,
      exp: Math.floor(now / 1_000) + VOTING_SESSION_MAX_AGE_SECONDS,
    },
  );
  assert.equal(
    verifyVotingSession(signedSession, sessionIdB, now + 1_000),
    null,
  );
});

test('a tampered voting session is rejected', () => {
  const signedSession = createVotingSession(sessionIdA, credentialA, now);
  const parts = signedSession.split('.');
  const signature = parts[2];
  assert.ok(signature);
  parts[2] = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;

  assert.equal(
    verifyVotingSession(parts.join('.'), sessionIdA, now),
    null,
  );
});

test('an expired voting session is rejected', () => {
  const signedSession = createVotingSession(sessionIdA, credentialA, now);
  const expiry = now + VOTING_SESSION_MAX_AGE_SECONDS * 1_000;

  assert.equal(verifyVotingSession(signedSession, sessionIdA, expiry), null);
});

test('cookie names are derived only from valid session identifiers', () => {
  assert.equal(
    getVotingSessionCookieName(sessionIdA),
    `voting_session_${sessionIdA}`,
  );
  assert.equal(
    getVotingSessionCookieName(sessionIdB),
    `voting_session_${sessionIdB}`,
  );
  assert.notEqual(
    getVotingSessionCookieName(sessionIdA),
    getVotingSessionCookieName(sessionIdB),
  );
  assert.throws(
    () => getVotingSessionCookieName(`${sessionIdA}x`),
    /Invalid voting session identifier/,
  );
});

test('the signed payload contains only sessionId, credentialId and exp', () => {
  const signedSession = createVotingSession(sessionIdA, credentialA, now);
  const encodedPayload = signedSession.split('.')[1];
  assert.ok(encodedPayload);
  const payload = JSON.parse(
    Buffer.from(encodedPayload, 'base64url').toString('utf8'),
  );

  assert.deepEqual(Object.keys(payload).sort(), [
    'credentialId',
    'exp',
    'sessionId',
  ]);
  assert.equal('token' in payload, false);
  assert.equal('tokenHash' in payload, false);
  assert.equal('participantId' in payload, false);
  assert.equal('electionId' in payload, false);
});

test('session-specific cookies coexist with distinct ballot paths', () => {
  const signedA = createVotingSession(sessionIdA, credentialA, now);
  const signedB = createVotingSession(sessionIdB, credentialB, now);
  const cookieA = serializeVotingSessionCookie(sessionIdA, signedA);
  const cookieB = serializeVotingSessionCookie(sessionIdB, signedB);

  assert.match(
    cookieA,
    new RegExp(`^voting_session_${sessionIdA}=.+; Path=/v/papeleta/${sessionIdA};`),
  );
  assert.match(
    cookieB,
    new RegExp(`^voting_session_${sessionIdB}=.+; Path=/v/papeleta/${sessionIdB};`),
  );
  assert.notEqual(cookieA, cookieB);
  assert.equal(verifyVotingSession(signedA, sessionIdB, now), null);
  assert.equal(verifyVotingSession(signedB, sessionIdA, now), null);
});

test('serialized cookies retain all browser protections', () => {
  const cookie = serializeVotingSessionCookie(
    sessionIdA,
    createVotingSession(sessionIdA, credentialA, now),
  );

  assert.match(cookie, /; Max-Age=43200;/);
  assert.match(cookie, /; HttpOnly;/);
  assert.match(cookie, /; SameSite=Strict(?:;|$)/);
  assert.equal(cookie.includes('Domain='), false);
});

test('legacy cookie deletion is limited to voting_session at Path=/v', () => {
  assert.equal(
    serializeLegacyVotingSessionCookieDeletion(),
    'voting_session=; Max-Age=0; Path=/v; HttpOnly; SameSite=Strict',
  );
});
