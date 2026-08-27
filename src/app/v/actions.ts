'use server';

import { cookies } from 'next/headers';

import type { PublicVoteSubmissionResult } from '@/lib/public-voting';
import { submitPublicVoteWithSession } from '@/lib/public-voting-session';
import {
  getVotingSessionCookieName,
  hasValidVotingSessionIdStructure,
} from '@/lib/voting-session';

export type SubmitVoteResult = PublicVoteSubmissionResult;

export async function submitVote(
  sessionId: string,
  candidateParticipantIds: string[],
): Promise<SubmitVoteResult> {
  try {
    if (!hasValidVotingSessionIdStructure(sessionId)) {
      return { type: 'invalidLink' };
    }

    const cookieStore = await cookies();
    const cookieName = getVotingSessionCookieName(sessionId);
    const signedSession = cookieStore.get(cookieName)?.value;

    return await submitPublicVoteWithSession(
      sessionId,
      signedSession,
      candidateParticipantIds,
    );
  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    console.error(`Public vote submission failed (${errorName})`);
    return { type: 'unavailable' };
  }
}
