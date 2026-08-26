import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { electionParticipants, elections } from '@/db/schema';
import {
  calculateElectionReadiness,
  type ElectionReadiness,
} from '@/lib/election-readiness';

type DatabaseTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export type ElectionPreparationResult =
  | { type: 'missing' }
  | { type: 'notDraft' }
  | { type: 'notReady'; readiness: ElectionReadiness }
  | { type: 'success' };

export async function transitionDraftElectionToReady(
  tx: DatabaseTransaction,
  electionId: string,
): Promise<ElectionPreparationResult> {
  const [election] = await tx
    .select({
      status: elections.status,
      numberOfWinners: elections.numberOfWinners,
      maxSelections: elections.maxSelections,
      allowSelfVote: elections.allowSelfVote,
      minimumTurnout: elections.minimumTurnout,
    })
    .from(elections)
    .where(eq(elections.id, electionId))
    .for('update');

  if (!election) {
    return { type: 'missing' };
  }

  if (election.status !== 'DRAFT') {
    return { type: 'notDraft' };
  }

  const participants = await tx
    .select({
      canVote: electionParticipants.canVote,
      canBeCandidate: electionParticipants.canBeCandidate,
    })
    .from(electionParticipants)
    .where(eq(electionParticipants.electionId, electionId));
  const readiness = calculateElectionReadiness(election, participants);

  if (!readiness.ready) {
    return { type: 'notReady', readiness };
  }

  await tx
    .update(elections)
    .set({ status: 'READY' })
    .where(eq(elections.id, electionId));

  return { type: 'success' };
}
