import 'server-only';

import {
  castPublicVote,
  type PublicVoteSubmissionResult,
} from '@/lib/public-voting';
import {
  hasValidVotingSessionIdStructure,
  verifyVotingSession,
} from '@/lib/voting-session';

export async function submitPublicVoteWithSession(
  sessionId: string,
  signedSession: string | undefined,
  candidateParticipantIds: string[],
): Promise<PublicVoteSubmissionResult> {
  if (!hasValidVotingSessionIdStructure(sessionId)) {
    return { type: 'invalidLink' };
  }

  const session = signedSession
    ? verifyVotingSession(signedSession, sessionId)
    : null;

  if (!session) {
    return { type: 'invalidLink' };
  }

  return castPublicVote(session.credentialId, candidateParticipantIds);
}
