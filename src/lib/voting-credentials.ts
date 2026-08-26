import 'server-only';

import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  electionParticipants,
  elections,
  votingCredentials,
} from '@/db/schema';
import { generateVotingToken, hashVotingToken } from '@/lib/voting-token';
import { buildVotingUrl } from '@/lib/voting-url';

export type GeneratedVotingLink = {
  participantId: string;
  displayName: string;
  votingUrl: string;
};

export type BulkVotingCredentialResult =
  | { type: 'missingElection' }
  | { type: 'notReady' }
  | { type: 'noEligibleVoters' }
  | { type: 'allHaveActiveCredential' }
  | { type: 'success'; generatedLinks: GeneratedVotingLink[] };

export type IndividualVotingCredentialResult =
  | { type: 'missingElection' }
  | { type: 'notRegenerable' }
  | { type: 'missingClosesAt' }
  | { type: 'closesAtPassed' }
  | { type: 'missingParticipant' }
  | { type: 'cannotVote' }
  | { type: 'hasVoted' }
  | { type: 'success'; generatedLink: GeneratedVotingLink };

export async function generateMissingVotingCredentials(
  electionId: string,
): Promise<BulkVotingCredentialResult> {
  return db.transaction(async (tx) => {
    const [election] = await tx
      .select({ status: elections.status })
      .from(elections)
      .where(eq(elections.id, electionId))
      .for('update');

    if (!election) {
      return { type: 'missingElection' };
    }

    if (election.status !== 'READY') {
      return { type: 'notReady' };
    }

    const eligibleVoters = await tx
      .select({
        participantId: electionParticipants.id,
        displayName: electionParticipants.displayName,
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
          eq(electionParticipants.hasVoted, false),
        ),
      )
      .orderBy(asc(electionParticipants.displayName));

    if (eligibleVoters.length === 0) {
      return { type: 'noEligibleVoters' };
    }

    const votersWithoutCredential = eligibleVoters.filter(
      (voter) => voter.activeCredentialId === null,
    );

    if (votersWithoutCredential.length === 0) {
      return { type: 'allHaveActiveCredential' };
    }

    const credentials = votersWithoutCredential.map((voter) => {
      const token = generateVotingToken();

      return {
        participantId: voter.participantId,
        displayName: voter.displayName,
        tokenHash: hashVotingToken(token),
        votingUrl: buildVotingUrl(token),
      };
    });

    await tx.insert(votingCredentials).values(
      credentials.map(({ participantId, tokenHash }) => ({
        participantId,
        tokenHash,
        status: 'ACTIVE' as const,
        revokedAt: null,
      })),
    );

    return {
      type: 'success',
      generatedLinks: credentials.map(
        ({ participantId, displayName, votingUrl }) => ({
          participantId,
          displayName,
          votingUrl,
        }),
      ),
    };
  });
}

export async function regenerateVotingCredential(
  electionId: string,
  participantId: string,
): Promise<IndividualVotingCredentialResult> {
  return db.transaction(async (tx) => {
    const [election] = await tx
      .select({
        status: elections.status,
        closesAt: elections.closesAt,
      })
      .from(elections)
      .where(eq(elections.id, electionId))
      .for('update');

    if (!election) {
      return { type: 'missingElection' };
    }

    if (election.status !== 'READY' && election.status !== 'OPEN') {
      return { type: 'notRegenerable' };
    }

    if (election.status === 'OPEN' && election.closesAt === null) {
      return { type: 'missingClosesAt' };
    }

    if (
      election.status === 'OPEN' &&
      election.closesAt !== null &&
      Date.now() >= election.closesAt.getTime()
    ) {
      return { type: 'closesAtPassed' };
    }

    const [participant] = await tx
      .select({
        displayName: electionParticipants.displayName,
        canVote: electionParticipants.canVote,
        hasVoted: electionParticipants.hasVoted,
      })
      .from(electionParticipants)
      .where(
        and(
          eq(electionParticipants.id, participantId),
          eq(electionParticipants.electionId, electionId),
        ),
      );

    if (!participant) {
      return { type: 'missingParticipant' };
    }

    if (!participant.canVote) {
      return { type: 'cannotVote' };
    }

    if (participant.hasVoted) {
      return { type: 'hasVoted' };
    }

    const [activeCredential] = await tx
      .select({ id: votingCredentials.id })
      .from(votingCredentials)
      .where(
        and(
          eq(votingCredentials.participantId, participantId),
          eq(votingCredentials.status, 'ACTIVE'),
        ),
      );

    const mutationTime = new Date();

    if (
      election.status === 'OPEN' &&
      election.closesAt !== null &&
      mutationTime.getTime() >= election.closesAt.getTime()
    ) {
      return { type: 'closesAtPassed' };
    }

    if (activeCredential) {
      await tx
        .update(votingCredentials)
        .set({ status: 'REVOKED', revokedAt: mutationTime })
        .where(
          and(
            eq(votingCredentials.id, activeCredential.id),
            eq(votingCredentials.status, 'ACTIVE'),
          ),
        );
    }

    const token = generateVotingToken();
    const tokenHash = hashVotingToken(token);

    await tx.insert(votingCredentials).values({
      participantId,
      tokenHash,
      status: 'ACTIVE',
      revokedAt: null,
    });

    return {
      type: 'success',
      generatedLink: {
        participantId,
        displayName: participant.displayName,
        votingUrl: buildVotingUrl(token),
      },
    };
  });
}
