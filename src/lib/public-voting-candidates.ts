import 'server-only';

import { createHash } from 'node:crypto';

export type PublicCandidate = {
  id: string;
  displayName: string;
};

export type CandidateEligibilityInput = PublicCandidate & {
  canBeCandidate: boolean;
};

export type VoterCandidateContext = {
  id: string;
  canBeCandidate: boolean;
};

export function filterEligibleCandidates(
  candidates: readonly CandidateEligibilityInput[],
  voter: VoterCandidateContext,
  allowSelfVote: boolean,
): PublicCandidate[] {
  return candidates
    .filter(
      (candidate) =>
        candidate.canBeCandidate &&
        (allowSelfVote ||
          !voter.canBeCandidate ||
          candidate.id !== voter.id),
    )
    .map(({ id, displayName }) => ({ id, displayName }));
}

export function orderCandidatesForCredential(
  credentialId: string,
  candidates: readonly PublicCandidate[],
): PublicCandidate[] {
  return candidates
    .map((candidate) => ({
      candidate,
      orderKey: createHash('sha256')
        .update(`${credentialId}:${candidate.id}`, 'utf8')
        .digest('hex'),
    }))
    .sort((left, right) => {
      if (left.orderKey < right.orderKey) {
        return -1;
      }

      if (left.orderKey > right.orderKey) {
        return 1;
      }

      return left.candidate.id.localeCompare(right.candidate.id);
    })
    .map(({ candidate }) => candidate);
}
