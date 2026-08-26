import 'server-only';

export type ElectionReadinessInput = {
  numberOfWinners: number;
  maxSelections: number;
  allowSelfVote: boolean;
  minimumTurnout: number | null;
};

export type ElectionReadinessParticipant = {
  canVote: boolean;
  canBeCandidate: boolean;
};

export type ElectionReadiness = {
  voterCount: number;
  candidateCount: number;
  hasVoters: boolean;
  hasCandidates: boolean;
  hasEnoughCandidatesForWinners: boolean;
  isMinimumTurnoutReachable: boolean;
  allVotersHaveEnoughEligibleCandidates: boolean;
  affectedVoterCount: number;
  ready: boolean;
};

export function calculateElectionReadiness(
  election: ElectionReadinessInput,
  participants: readonly ElectionReadinessParticipant[],
): ElectionReadiness {
  const voterCount = participants.filter(
    (participant) => participant.canVote,
  ).length;
  const candidateCount = participants.filter(
    (participant) => participant.canBeCandidate,
  ).length;
  const hasVoters = voterCount > 0;
  const hasCandidates = candidateCount > 0;
  const hasEnoughCandidatesForWinners =
    candidateCount >= election.numberOfWinners;
  const isMinimumTurnoutReachable =
    election.minimumTurnout === null ||
    election.minimumTurnout <= voterCount;
  const affectedVoterCount = participants.filter((participant) => {
    if (!participant.canVote) {
      return false;
    }

    const eligibleCandidateCount =
      candidateCount -
      (!election.allowSelfVote && participant.canBeCandidate ? 1 : 0);

    return eligibleCandidateCount < election.maxSelections;
  }).length;
  const allVotersHaveEnoughEligibleCandidates = affectedVoterCount === 0;
  const ready =
    hasVoters &&
    hasCandidates &&
    hasEnoughCandidatesForWinners &&
    isMinimumTurnoutReachable &&
    allVotersHaveEnoughEligibleCandidates;

  return {
    voterCount,
    candidateCount,
    hasVoters,
    hasCandidates,
    hasEnoughCandidatesForWinners,
    isMinimumTurnoutReachable,
    allVotersHaveEnoughEligibleCandidates,
    affectedVoterCount,
    ready,
  };
}
