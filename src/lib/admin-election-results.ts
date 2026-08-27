import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  ballotChoices,
  ballots,
  electionParticipants,
  elections,
} from '@/db/schema';
import {
  calculateElectionResults,
  type ElectionResultRow,
} from '@/lib/election-result-calculation';
import { requireAdminSession } from '@/lib/admin-session';

type TurnoutStatus = 'notRequired' | 'met' | 'notMet';

export type ElectionResultIntegrityIssue =
  | 'ballot-voter-count-mismatch'
  | 'invalid-ballot-cardinality'
  | 'invalid-ballot-candidate';

type AdminElectionResultsSuccess = {
  type: 'success';
  numberOfWinners: number;
  minimumTurnout: number | null;
  turnoutStatus: TurnoutStatus;
  voterCount: number;
  votedCount: number;
  pendingCount: number;
  turnoutPercentage: number;
  ballotCount: number;
  integrityStatus: 'consistent' | 'inconsistent';
  integrityIssues: ElectionResultIntegrityIssue[];
  canAssignSeats: boolean;
  rows: ElectionResultRow[];
  tie: {
    affectsSeats: boolean;
    tiedCandidateIds: string[];
    seatsAvailableAmongTie: number;
  };
};

export type AdminElectionResultsResolution =
  | { type: 'missing' }
  | { type: 'notClosed' }
  | AdminElectionResultsSuccess;

export async function getAdminElectionResults(
  electionId: string,
): Promise<AdminElectionResultsResolution> {
  await requireAdminSession();

  const [election] = await db
    .select({
      status: elections.status,
      numberOfWinners: elections.numberOfWinners,
      minSelections: elections.minSelections,
      maxSelections: elections.maxSelections,
      minimumTurnout: elections.minimumTurnout,
    })
    .from(elections)
    .where(eq(elections.id, electionId))
    .limit(1);

  if (!election) {
    return { type: 'missing' };
  }

  if (election.status !== 'CLOSED') {
    return { type: 'notClosed' };
  }

  const [candidateRows, voterRows, ballotRows, choiceRows] =
    await Promise.all([
      db
        .select({
          id: electionParticipants.id,
          displayName: electionParticipants.displayName,
        })
        .from(electionParticipants)
        .where(
          and(
            eq(electionParticipants.electionId, electionId),
            eq(electionParticipants.canBeCandidate, true),
          ),
        ),
      db
        .select({ hasVoted: electionParticipants.hasVoted })
        .from(electionParticipants)
        .where(
          and(
            eq(electionParticipants.electionId, electionId),
            eq(electionParticipants.canVote, true),
          ),
        ),
      db
        .select({
          id: ballots.id,
          electionId: ballots.electionId,
        })
        .from(ballots)
        .where(eq(ballots.electionId, electionId)),
      db
        .select({
          ballotId: ballotChoices.ballotId,
          choiceElectionId: ballotChoices.electionId,
          candidateId: ballotChoices.candidateParticipantId,
          candidateElectionId: electionParticipants.electionId,
          candidateCanBeCandidate: electionParticipants.canBeCandidate,
        })
        .from(ballotChoices)
        .innerJoin(
          ballots,
          eq(ballotChoices.ballotId, ballots.id),
        )
        .leftJoin(
          electionParticipants,
          eq(
            ballotChoices.candidateParticipantId,
            electionParticipants.id,
          ),
        )
        .where(eq(ballots.electionId, electionId)),
    ]);
  const voterCount = voterRows.length;
  const votedCount = voterRows.filter((voter) => voter.hasVoted).length;
  const ballotCount = ballotRows.length;
  const turnoutStatus: TurnoutStatus =
    election.minimumTurnout === null
      ? 'notRequired'
      : votedCount >= election.minimumTurnout
        ? 'met'
        : 'notMet';
  const integrityIssues = new Set<ElectionResultIntegrityIssue>();

  if (ballotCount !== votedCount) {
    integrityIssues.add('ballot-voter-count-mismatch');
  }

  const choicesByBallotId = new Map(
    ballotRows.map((ballot) => [ballot.id, [] as typeof choiceRows]),
  );

  for (const choice of choiceRows) {
    choicesByBallotId.get(choice.ballotId)?.push(choice);
  }

  for (const ballot of ballotRows) {
    const ballotChoiceRows = choicesByBallotId.get(ballot.id) ?? [];

    if (
      ballotChoiceRows.length < election.minSelections ||
      ballotChoiceRows.length > election.maxSelections
    ) {
      integrityIssues.add('invalid-ballot-cardinality');
    }

    const seenCandidateIds = new Set<string>();

    for (const choice of ballotChoiceRows) {
      if (
        seenCandidateIds.has(choice.candidateId) ||
        choice.choiceElectionId !== ballot.electionId ||
        choice.candidateElectionId !== ballot.electionId ||
        choice.candidateCanBeCandidate !== true
      ) {
        integrityIssues.add('invalid-ballot-candidate');
      }

      seenCandidateIds.add(choice.candidateId);
    }
  }

  const integrityIssueList = [...integrityIssues];
  const integrityStatus =
    integrityIssueList.length === 0 ? 'consistent' : 'inconsistent';
  const canAssignSeats =
    turnoutStatus !== 'notMet' && integrityStatus === 'consistent';
  const validChoiceCandidateIds = choiceRows
    .filter(
      (choice) =>
        choice.choiceElectionId === electionId &&
        choice.candidateElectionId === electionId &&
        choice.candidateCanBeCandidate === true,
    )
    .map((choice) => choice.candidateId);
  const calculation = calculateElectionResults({
    numberOfWinners: election.numberOfWinners,
    candidates: candidateRows,
    choiceCandidateIds: validChoiceCandidateIds,
  });

  return {
    type: 'success',
    numberOfWinners: election.numberOfWinners,
    minimumTurnout: election.minimumTurnout,
    turnoutStatus,
    voterCount,
    votedCount,
    pendingCount: voterCount - votedCount,
    turnoutPercentage:
      voterCount === 0 ? 0 : Math.round((votedCount / voterCount) * 100),
    ballotCount,
    integrityStatus,
    integrityIssues: integrityIssueList,
    canAssignSeats,
    rows: calculation.rows.map((row) => ({
      ...row,
      placement: canAssignSeats ? row.placement : 'none',
    })),
    tie: calculation.tie,
  };
}
