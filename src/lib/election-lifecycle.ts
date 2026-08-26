import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  electionParticipants,
  elections,
  votingCredentials,
} from '@/db/schema';

type DatabaseTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

export type ElectionOpeningResult =
  | { type: 'missing' }
  | { type: 'notReady' }
  | { type: 'invalidClosesAt' }
  | { type: 'closesAtNotFuture' }
  | { type: 'noVoters' }
  | { type: 'votersHaveVoted'; voterCount: number }
  | { type: 'missingActiveCredentials'; voterCount: number }
  | { type: 'success'; openedAt: Date; closesAt: Date };

export type ElectionClosingResult =
  | { type: 'missing' }
  | { type: 'notOpen' }
  | { type: 'success'; closedAt: Date };

const ABSOLUTE_ISO_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function parseAbsoluteIsoInstant(value: string): Date | null {
  if (!ABSOLUTE_ISO_PATTERN.test(value)) {
    return null;
  }

  const instant = new Date(value);

  if (Number.isNaN(instant.getTime()) || instant.toISOString() !== value) {
    return null;
  }

  return instant;
}

export async function transitionReadyElectionToOpen(
  tx: DatabaseTransaction,
  electionId: string,
  closesAtIso: string,
): Promise<ElectionOpeningResult> {
  const [election] = await tx
    .select({ status: elections.status })
    .from(elections)
    .where(eq(elections.id, electionId))
    .for('update');

  if (!election) {
    return { type: 'missing' };
  }

  if (election.status !== 'READY') {
    return { type: 'notReady' };
  }

  const closesAt = parseAbsoluteIsoInstant(closesAtIso);

  if (!closesAt) {
    return { type: 'invalidClosesAt' };
  }

  if (closesAt.getTime() <= Date.now()) {
    return { type: 'closesAtNotFuture' };
  }

  const voterCredentialRows = await tx
    .select({
      participantId: electionParticipants.id,
      hasVoted: electionParticipants.hasVoted,
      activeCredentialId: votingCredentials.id,
    })
    .from(electionParticipants)
    .leftJoin(
      votingCredentials,
      and(
        eq(votingCredentials.participantId, electionParticipants.id),
        eq(votingCredentials.status, 'ACTIVE'),
      ),
    )
    .where(
      and(
        eq(electionParticipants.electionId, electionId),
        eq(electionParticipants.canVote, true),
      ),
    );
  const voters = new Map<
    string,
    { hasVoted: boolean; activeCredentialCount: number }
  >();

  for (const row of voterCredentialRows) {
    const voter = voters.get(row.participantId);

    if (voter) {
      if (row.activeCredentialId !== null) {
        voter.activeCredentialCount += 1;
      }
    } else {
      voters.set(row.participantId, {
        hasVoted: row.hasVoted,
        activeCredentialCount: row.activeCredentialId === null ? 0 : 1,
      });
    }
  }

  if (voters.size === 0) {
    return { type: 'noVoters' };
  }

  const votersWhoHaveVoted = [...voters.values()].filter(
    (voter) => voter.hasVoted,
  ).length;

  if (votersWhoHaveVoted > 0) {
    return {
      type: 'votersHaveVoted',
      voterCount: votersWhoHaveVoted,
    };
  }

  const votersWithoutOneActiveCredential = [...voters.values()].filter(
    (voter) => voter.activeCredentialCount !== 1,
  ).length;

  if (votersWithoutOneActiveCredential > 0) {
    return {
      type: 'missingActiveCredentials',
      voterCount: votersWithoutOneActiveCredential,
    };
  }

  const openedAt = new Date();

  if (closesAt.getTime() <= openedAt.getTime()) {
    return { type: 'closesAtNotFuture' };
  }

  await tx
    .update(elections)
    .set({
      status: 'OPEN',
      openedAt,
      closesAt,
      opensAt: null,
      closedAt: null,
    })
    .where(eq(elections.id, electionId));

  return { type: 'success', openedAt, closesAt };
}

export async function transitionOpenElectionToClosed(
  tx: DatabaseTransaction,
  electionId: string,
): Promise<ElectionClosingResult> {
  const [election] = await tx
    .select({ status: elections.status })
    .from(elections)
    .where(eq(elections.id, electionId))
    .for('update');

  if (!election) {
    return { type: 'missing' };
  }

  if (election.status !== 'OPEN') {
    return { type: 'notOpen' };
  }

  const closedAt = new Date();

  await tx
    .update(elections)
    .set({ status: 'CLOSED', closedAt })
    .where(eq(elections.id, electionId));

  return { type: 'success', closedAt };
}
