'use server';

import {
  castPublicVote,
  type PublicVoteSubmissionResult,
} from '@/lib/public-voting';

export type SubmitVoteResult = PublicVoteSubmissionResult;

export async function submitVote(
  token: string,
  candidateParticipantIds: string[],
): Promise<SubmitVoteResult> {
  try {
    return await castPublicVote(token, candidateParticipantIds);
  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    console.error(`Public vote submission failed (${errorName})`);
    return { type: 'unavailable' };
  }
}
