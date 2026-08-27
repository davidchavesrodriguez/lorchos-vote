import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const LEGACY_VOTING_SESSION_COOKIE_NAME = 'voting_session';
export const VOTING_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

const SESSION_VERSION = 'v1';
const MINIMUM_SECRET_BYTES = 32;
const SESSION_ID_BYTES = 16;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type VotingSessionPayload = {
  sessionId: string;
  credentialId: string;
  exp: number;
};

function getVotingSessionSecret(): string {
  const secret = process.env.VOTING_SESSION_SECRET;

  if (!secret) {
    throw new Error('Missing required environment variable: VOTING_SESSION_SECRET');
  }

  if (Buffer.byteLength(secret, 'utf8') < MINIMUM_SECRET_BYTES) {
    throw new Error('VOTING_SESSION_SECRET must be at least 32 bytes');
  }

  return secret;
}

function sign(value: string): Buffer {
  return createHmac('sha256', getVotingSessionSecret())
    .update(value, 'utf8')
    .digest();
}

export function createVotingSessionId(): string {
  return randomBytes(SESSION_ID_BYTES).toString('base64url');
}

export function hasValidVotingSessionIdStructure(
  sessionId: unknown,
): sessionId is string {
  if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
    return false;
  }

  try {
    const decoded = Buffer.from(sessionId, 'base64url');
    return (
      decoded.length === SESSION_ID_BYTES &&
      decoded.toString('base64url') === sessionId
    );
  } catch {
    return false;
  }
}

export function getVotingSessionCookieName(sessionId: string): string {
  if (!hasValidVotingSessionIdStructure(sessionId)) {
    throw new Error('Invalid voting session identifier');
  }

  return `voting_session_${sessionId}`;
}

export function createVotingSession(
  sessionId: string,
  credentialId: string,
  now = Date.now(),
): string {
  if (!hasValidVotingSessionIdStructure(sessionId)) {
    throw new Error('Invalid voting session identifier');
  }

  if (!UUID_PATTERN.test(credentialId)) {
    throw new Error('Invalid voting credential identifier');
  }

  const payload: VotingSessionPayload = {
    sessionId,
    credentialId,
    exp: Math.floor(now / 1000) + VOTING_SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url',
  );
  const signedValue = `${SESSION_VERSION}.${encodedPayload}`;
  const signature = sign(signedValue).toString('base64url');

  return `${signedValue}.${signature}`;
}

export function verifyVotingSession(
  session: string,
  expectedSessionId: string,
  now = Date.now(),
): VotingSessionPayload | null {
  if (!hasValidVotingSessionIdStructure(expectedSessionId)) {
    return null;
  }

  const parts = session.split('.');

  if (parts.length !== 3 || parts[0] !== SESSION_VERSION) {
    return null;
  }

  const [version, encodedPayload, encodedSignature] = parts;

  try {
    const suppliedSignature = Buffer.from(encodedSignature, 'base64url');
    const expectedSignature = sign(`${version}.${encodedPayload}`);

    if (
      suppliedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(suppliedSignature, expectedSignature)
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as unknown;

    if (
      typeof payload !== 'object' ||
      payload === null ||
      Object.keys(payload).sort().join(',') !== 'credentialId,exp,sessionId'
    ) {
      return null;
    }

    const { sessionId, credentialId, exp } = payload as Record<string, unknown>;
    const nowInSeconds = Math.floor(now / 1000);

    if (
      sessionId !== expectedSessionId ||
      !hasValidVotingSessionIdStructure(sessionId) ||
      typeof credentialId !== 'string' ||
      !UUID_PATTERN.test(credentialId) ||
      typeof exp !== 'number' ||
      !Number.isSafeInteger(exp) ||
      exp <= nowInSeconds ||
      exp > nowInSeconds + VOTING_SESSION_MAX_AGE_SECONDS
    ) {
      return null;
    }

    return { sessionId, credentialId, exp };
  } catch {
    return null;
  }
}

export function serializeVotingSessionCookie(
  sessionId: string,
  session: string,
): string {
  const attributes = [
    `${getVotingSessionCookieName(sessionId)}=${session}`,
    `Max-Age=${VOTING_SESSION_MAX_AGE_SECONDS}`,
    `Path=/v/papeleta/${sessionId}`,
    'HttpOnly',
    'SameSite=Strict',
  ];

  if (process.env.NODE_ENV === 'production') {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}

export function serializeLegacyVotingSessionCookieDeletion(): string {
  return `${LEGACY_VOTING_SESSION_COOKIE_NAME}=; Max-Age=0; Path=/v; HttpOnly; SameSite=Strict`;
}
