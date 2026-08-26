import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

const VOTING_TOKEN_BYTES = 32;

export function generateVotingToken(): string {
  return randomBytes(VOTING_TOKEN_BYTES).toString('base64url');
}

export function hashVotingToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
