import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import {
  ballotChoices,
  ballots,
  electionParticipants,
  elections,
  votingCredentials,
} from '@/db/schema';
import {
  filterEligibleCandidates,
  orderCandidatesForCredential,
  type PublicCandidate,
} from '@/lib/public-voting-candidates';

type ActiveVotingContext = {
  electionTitle: string;
  groupLabel: string;
  voterDisplayName: string;
};

export type PublicVotingResolution =
  | { type: 'invalid' }
  | { type: 'revoked' }
  | { type: 'used' }
  | ({ type: 'ready' | 'closed' | 'deadlinePassed' | 'unavailable' } &
      ActiveVotingContext)
  | ({
      type: 'available';
      minSelections: number;
      maxSelections: number;
      closesAt: string;
      candidates: PublicCandidate[];
    } & ActiveVotingContext);

export type PublicVoteSubmissionResult =
  | { type: 'success' }
  | { type: 'invalidLink' }
  | { type: 'revoked' }
  | { type: 'used' }
  | { type: 'closed' }
  | { type: 'deadlinePassed' }
  | { type: 'invalidSelections' }
  | { type: 'unavailable' };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function resolvePublicVotingCredential(
  credentialId: string,
): Promise<PublicVotingResolution> {
  const [credential] = await db
    .select({
      credentialId: votingCredentials.id,
      credentialStatus: votingCredentials.status,
      participantId: electionParticipants.id,
      displayName: electionParticipants.displayName,
      canVote: electionParticipants.canVote,
      voterCanBeCandidate: electionParticipants.canBeCandidate,
      hasVoted: electionParticipants.hasVoted,
      electionId: elections.id,
      electionTitle: elections.title,
      groupLabel: elections.groupLabel,
      electionStatus: elections.status,
      minSelections: elections.minSelections,
      maxSelections: elections.maxSelections,
      allowSelfVote: elections.allowSelfVote,
      closesAt: elections.closesAt,
    })
    .from(votingCredentials)
    .innerJoin(
      electionParticipants,
      eq(votingCredentials.participantId, electionParticipants.id),
    )
    .innerJoin(
      elections,
      eq(electionParticipants.electionId, elections.id),
    )
    .where(eq(votingCredentials.id, credentialId))
    .limit(1);

  if (!credential) {
    return { type: 'invalid' };
  }

  if (credential.credentialStatus === 'REVOKED') {
    return { type: 'revoked' };
  }

  if (credential.credentialStatus === 'USED') {
    return { type: 'used' };
  }

  const activeContext = {
    electionTitle: credential.electionTitle,
    groupLabel: credential.groupLabel,
    voterDisplayName: credential.displayName,
  };

  if (!credential.canVote || credential.hasVoted) {
    return { type: 'unavailable', ...activeContext };
  }

  if (credential.electionStatus === 'READY') {
    return { type: 'ready', ...activeContext };
  }

  if (credential.electionStatus === 'CLOSED') {
    return { type: 'closed', ...activeContext };
  }

  if (credential.electionStatus !== 'OPEN' || credential.closesAt === null) {
    return { type: 'unavailable', ...activeContext };
  }

  if (Date.now() >= credential.closesAt.getTime()) {
    return { type: 'deadlinePassed', ...activeContext };
  }

  const candidateRows = await db
    .select({
      id: electionParticipants.id,
      displayName: electionParticipants.displayName,
      canBeCandidate: electionParticipants.canBeCandidate,
    })
    .from(electionParticipants)
    .where(
      and(
        eq(electionParticipants.electionId, credential.electionId),
        eq(electionParticipants.canBeCandidate, true),
      ),
    );
  const candidates = orderCandidatesForCredential(
    credential.credentialId,
    filterEligibleCandidates(
      candidateRows,
      {
        id: credential.participantId,
        canBeCandidate: credential.voterCanBeCandidate,
      },
      credential.allowSelfVote,
    ),
  );

  if (candidates.length < credential.minSelections) {
    return { type: 'unavailable', ...activeContext };
  }

  return {
    type: 'available',
    ...activeContext,
    minSelections: credential.minSelections,
    maxSelections: credential.maxSelections,
    closesAt: credential.closesAt.toISOString(),
    candidates,
  };
}

export async function castPublicVote(
  credentialId: unknown,
  candidateParticipantIds: unknown,
): Promise<PublicVoteSubmissionResult> {
  if (typeof credentialId !== 'string' || !UUID_PATTERN.test(credentialId)) {
    return { type: 'invalidLink' };
  }

  const [initialCredential] = await db
    .select({ electionId: electionParticipants.electionId })
    .from(votingCredentials)
    .innerJoin(
      electionParticipants,
      eq(votingCredentials.participantId, electionParticipants.id),
    )
    .where(eq(votingCredentials.id, credentialId))
    .limit(1);

  if (!initialCredential) {
    return { type: 'invalidLink' };
  }

  return db.transaction(async (tx) => {
    const [election] = await tx
      .select({
        id: elections.id,
        status: elections.status,
        minSelections: elections.minSelections,
        maxSelections: elections.maxSelections,
        allowSelfVote: elections.allowSelfVote,
        closesAt: elections.closesAt,
      })
      .from(elections)
      .where(eq(elections.id, initialCredential.electionId))
      .for('update');

    if (!election) {
      return { type: 'invalidLink' };
    }

    const [credential] = await tx
      .select({
        id: votingCredentials.id,
        participantId: votingCredentials.participantId,
        status: votingCredentials.status,
      })
      .from(votingCredentials)
      .where(eq(votingCredentials.id, credentialId))
      .for('update');

    if (!credential) {
      return { type: 'invalidLink' };
    }

    if (credential.status === 'REVOKED') {
      return { type: 'revoked' };
    }

    if (credential.status === 'USED') {
      return { type: 'used' };
    }

    const [participant] = await tx
      .select({
        id: electionParticipants.id,
        canVote: electionParticipants.canVote,
        hasVoted: electionParticipants.hasVoted,
      })
      .from(electionParticipants)
      .where(
        and(
          eq(electionParticipants.id, credential.participantId),
          eq(electionParticipants.electionId, election.id),
        ),
      )
      .for('update');

    if (!participant || !participant.canVote) {
      return { type: 'unavailable' };
    }

    if (participant.hasVoted) {
      return { type: 'used' };
    }

    if (election.status === 'CLOSED') {
      return { type: 'closed' };
    }

    if (election.status !== 'OPEN' || election.closesAt === null) {
      return { type: 'unavailable' };
    }

    if (Date.now() >= election.closesAt.getTime()) {
      return { type: 'deadlinePassed' };
    }

    if (
      !Array.isArray(candidateParticipantIds) ||
      !candidateParticipantIds.every(
        (candidateId) =>
          typeof candidateId === 'string' && UUID_PATTERN.test(candidateId),
      )
    ) {
      return { type: 'invalidSelections' };
    }

    if (
      candidateParticipantIds.length < election.minSelections ||
      candidateParticipantIds.length > election.maxSelections ||
      new Set(candidateParticipantIds).size !== candidateParticipantIds.length
    ) {
      return { type: 'invalidSelections' };
    }

    const selectedCandidates = await tx
      .select({
        id: electionParticipants.id,
        electionId: electionParticipants.electionId,
        canBeCandidate: electionParticipants.canBeCandidate,
      })
      .from(electionParticipants)
      .where(inArray(electionParticipants.id, candidateParticipantIds))
      .for('key share');
    const selectionsAreValid =
      selectedCandidates.length === candidateParticipantIds.length &&
      selectedCandidates.every(
        (candidate) =>
          candidate.electionId === election.id &&
          candidate.canBeCandidate &&
          (election.allowSelfVote || candidate.id !== participant.id),
      );

    if (!selectionsAreValid) {
      return { type: 'invalidSelections' };
    }

    const [ballot] = await tx
      .insert(ballots)
      .values({ electionId: election.id })
      .returning({ id: ballots.id });

    if (!ballot) {
      throw new Error('BallotInsertFailed');
    }

    await tx.insert(ballotChoices).values(
      candidateParticipantIds.map((candidateParticipantId) => ({
        ballotId: ballot.id,
        electionId: election.id,
        candidateParticipantId,
      })),
    );

    const [usedCredential] = await tx
      .update(votingCredentials)
      .set({ status: 'USED' })
      .where(
        and(
          eq(votingCredentials.id, credential.id),
          eq(votingCredentials.status, 'ACTIVE'),
        ),
      )
      .returning({ id: votingCredentials.id });

    if (!usedCredential) {
      throw new Error('CredentialConsumptionFailed');
    }

    const [updatedParticipant] = await tx
      .update(electionParticipants)
      .set({ hasVoted: true })
      .where(
        and(
          eq(electionParticipants.id, participant.id),
          eq(electionParticipants.electionId, election.id),
          eq(electionParticipants.hasVoted, false),
        ),
      )
      .returning({ id: electionParticipants.id });

    if (!updatedParticipant) {
      throw new Error('ParticipantVoteMarkFailed');
    }

    return { type: 'success' };
  });
}
