import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { votingCredentials } from '@/db/schema';
import { hashVotingToken } from '@/lib/voting-token';

const VOTING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function hasValidVotingTokenStructure(token: unknown): token is string {
  return typeof token === 'string' && VOTING_TOKEN_PATTERN.test(token);
}

export async function exchangeVotingToken(
  token: string,
): Promise<string | null> {
  const [credential] = await db
    .select({ id: votingCredentials.id })
    .from(votingCredentials)
    .where(eq(votingCredentials.tokenHash, hashVotingToken(token)))
    .limit(1);

  return credential?.id ?? null;
}
