export type ResultCandidate = {
  id: string;
  displayName: string;
};

export type ResultPlacement =
  | 'elected'
  | 'guaranteed'
  | 'tied'
  | 'none';

export type ElectionResultRow = {
  candidateId: string;
  displayName: string;
  votes: number;
  rank: number;
  placement: ResultPlacement;
};

export type ElectionResultCalculation = {
  rows: ElectionResultRow[];
  tie: {
    affectsSeats: boolean;
    tiedCandidateIds: string[];
    seatsAvailableAmongTie: number;
  };
};

type CalculateElectionResultsInput = {
  numberOfWinners: number;
  candidates: ResultCandidate[];
  choiceCandidateIds: string[];
};

export function calculateElectionResults({
  numberOfWinners,
  candidates,
  choiceCandidateIds,
}: CalculateElectionResultsInput): ElectionResultCalculation {
  const voteCounts = new Map(
    candidates.map((candidate) => [candidate.id, 0]),
  );

  for (const candidateId of choiceCandidateIds) {
    const currentVotes = voteCounts.get(candidateId);

    if (currentVotes !== undefined) {
      voteCounts.set(candidateId, currentVotes + 1);
    }
  }

  const orderedCandidates = candidates
    .map((candidate) => ({
      candidateId: candidate.id,
      displayName: candidate.displayName,
      votes: voteCounts.get(candidate.id) ?? 0,
    }))
    .sort(
      (left, right) =>
        right.votes - left.votes ||
        left.displayName.localeCompare(right.displayName, 'gl', {
          sensitivity: 'base',
        }) ||
        left.candidateId.localeCompare(right.candidateId),
    );
  const rowsWithRank = orderedCandidates.map((candidate, index) => ({
    ...candidate,
    rank:
      index === 0 || candidate.votes !== orderedCandidates[index - 1]?.votes
        ? index + 1
        : 0,
  }));

  for (let index = 1; index < rowsWithRank.length; index += 1) {
    if (rowsWithRank[index]?.rank === 0) {
      rowsWithRank[index]!.rank = rowsWithRank[index - 1]!.rank;
    }
  }

  const safeWinnerCount = Math.max(0, Math.trunc(numberOfWinners));
  const candidatesWithVotes = rowsWithRank.filter((row) => row.votes > 0);
  const defaultTie = {
    affectsSeats: false,
    tiedCandidateIds: [],
    seatsAvailableAmongTie: 0,
  };

  if (safeWinnerCount === 0 || candidatesWithVotes.length === 0) {
    return {
      rows: rowsWithRank.map((row) => ({ ...row, placement: 'none' })),
      tie: defaultTie,
    };
  }

  if (safeWinnerCount >= candidatesWithVotes.length) {
    return {
      rows: rowsWithRank.map((row) => ({
        ...row,
        placement: row.votes > 0 ? 'elected' : 'none',
      })),
      tie: defaultTie,
    };
  }

  const cutoffVotes = candidatesWithVotes[safeWinnerCount - 1]!.votes;
  const guaranteedCount = candidatesWithVotes.filter(
    (candidate) => candidate.votes > cutoffVotes,
  ).length;
  const cutoffCandidates = candidatesWithVotes.filter(
    (candidate) => candidate.votes === cutoffVotes,
  );
  const remainingSeats = safeWinnerCount - guaranteedCount;
  const affectsSeats = cutoffCandidates.length > remainingSeats;

  return {
    rows: rowsWithRank.map((row) => ({
      ...row,
      placement:
        row.votes > cutoffVotes
          ? affectsSeats
            ? 'guaranteed'
            : 'elected'
          : row.votes === cutoffVotes
            ? affectsSeats
              ? 'tied'
              : 'elected'
            : 'none',
    })),
    tie: affectsSeats
      ? {
          affectsSeats: true,
          tiedCandidateIds: cutoffCandidates.map(
            (candidate) => candidate.candidateId,
          ),
          seatsAvailableAmongTie: remainingSeats,
        }
      : defaultTie,
  };
}
