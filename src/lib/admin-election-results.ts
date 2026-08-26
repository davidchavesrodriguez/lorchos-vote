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

type TurnoutStatus = 'notRequired' | 'met' | 'notMet';

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
  const [election] = await db
    .select({
      status: elections.status,
      numberOfWinners: elections.numberOfWinners,
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
        .select({ id: ballots.id })
        .from(ballots)
        .where(eq(ballots.electionId, electionId)),
      db
        .select({ candidateId: ballotChoices.candidateParticipantId })
        .from(ballotChoices)
        .innerJoin(
          ballots,
          and(
            eq(ballotChoices.ballotId, ballots.id),
            eq(ballotChoices.electionId, ballots.electionId),
          ),
        )
        .innerJoin(
          electionParticipants,
          and(
            eq(
              ballotChoices.candidateParticipantId,
              electionParticipants.id,
            ),
            eq(
              ballotChoices.electionId,
              electionParticipants.electionId,
            ),
          ),
        )
        .where(
          and(
            eq(ballots.electionId, electionId),
            eq(ballotChoices.electionId, electionId),
            eq(electionParticipants.canBeCandidate, true),
          ),
        ),
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
  const integrityStatus =
    ballotCount === votedCount ? 'consistent' : 'inconsistent';
  const canAssignSeats =
    turnoutStatus !== 'notMet' && integrityStatus === 'consistent';
  const calculation = calculateElectionResults({
    numberOfWinners: election.numberOfWinners,
    candidates: candidateRows,
    choiceCandidateIds: choiceRows.map((choice) => choice.candidateId),
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
    canAssignSeats,
    rows: calculation.rows.map((row) => ({
      ...row,
      placement: canAssignSeats ? row.placement : 'none',
    })),
    tie: calculation.tie,
  };
}
