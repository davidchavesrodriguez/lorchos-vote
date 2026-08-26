import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import dotenv from 'dotenv';
import { inArray, sql } from 'drizzle-orm';

dotenv.config({ path: '.env.local', quiet: true });

const { db } = await import('../src/db/index');
const {
  ballotChoices,
  ballots,
  electionParticipants,
  elections,
  votingCredentials,
} = await import('../src/db/schema');
const { getAdminElectionResults } = await import(
  '../src/lib/admin-election-results'
);

const testRunLabel = `admin-results-test-${Date.now()}`;
const electionIds: string[] = [];

async function createElection(
  overrides: Partial<typeof elections.$inferInsert> = {},
) {
  const [election] = await db
    .insert(elections)
    .values({
      title: `${testRunLabel}-${electionIds.length + 1}`,
      groupLabel: testRunLabel,
      status: 'CLOSED',
      numberOfWinners: 1,
      minSelections: 1,
      maxSelections: 3,
      allowSelfVote: true,
      minimumTurnout: null,
      closedAt: new Date(),
      ...overrides,
    })
    .returning({ id: elections.id });

  assert.ok(election);
  electionIds.push(election.id);
  return election.id;
}

async function createParticipant(
  electionId: string,
  displayName: string,
  overrides: Partial<typeof electionParticipants.$inferInsert> = {},
) {
  const [participant] = await db
    .insert(electionParticipants)
    .values({
      electionId,
      displayName,
      canVote: false,
      canBeCandidate: true,
      hasVoted: false,
      ...overrides,
    })
    .returning({ id: electionParticipants.id });

  assert.ok(participant);
  return participant.id;
}

async function createAnonymousBallot(
  electionId: string,
  candidateIds: string[],
) {
  const [ballot] = await db
    .insert(ballots)
    .values({ electionId })
    .returning({ id: ballots.id });

  assert.ok(ballot);

  if (candidateIds.length > 0) {
    await db.insert(ballotChoices).values(
      candidateIds.map((candidateParticipantId) => ({
        ballotId: ballot.id,
        electionId,
        candidateParticipantId,
      })),
    );
  }
}

async function createVotedParticipants(electionId: string, count: number) {
  for (let index = 0; index < count; index += 1) {
    await createParticipant(electionId, `Votante ${index + 1}`, {
      canVote: true,
      canBeCandidate: false,
      hasVoted: true,
    });
  }
}

async function createVoteTotals(
  electionId: string,
  votesByCandidate: Array<{ candidateId: string; votes: number }>,
) {
  const ballotCount = Math.max(0, ...votesByCandidate.map(({ votes }) => votes));

  for (let index = 0; index < ballotCount; index += 1) {
    await createAnonymousBallot(
      electionId,
      votesByCandidate
        .filter(({ votes }) => votes > index)
        .map(({ candidateId }) => candidateId),
    );
  }

  await createVotedParticipants(electionId, ballotCount);
}

function requireSuccess(
  result: Awaited<ReturnType<typeof getAdminElectionResults>>,
) {
  if (result.type !== 'success') {
    assert.fail(`Expected success, received ${result.type}`);
  }

  return result;
}

after(async () => {
  if (electionIds.length > 0) {
    await db.delete(elections).where(inArray(elections.id, electionIds));
  }

  await db.$client.end({ timeout: 5 });
});

test('a missing election is reported without a tally', async () => {
  const result = await getAdminElectionResults(randomUUID());

  assert.deepEqual(result, { type: 'missing' });
  assert.equal('rows' in result, false);
});

for (const status of ['DRAFT', 'READY', 'OPEN'] as const) {
  test(`${status} election results are not available`, async () => {
    const electionId = await createElection({
      status,
      closedAt: null,
    });
    const candidateId = await createParticipant(
      electionId,
      `Candidata ${status}`,
    );
    await createAnonymousBallot(electionId, [candidateId]);

    const result = await getAdminElectionResults(electionId);

    assert.deepEqual(result, { type: 'notClosed' });
    assert.equal('rows' in result, false);
    assert.equal('ballotCount' in result, false);
  });
}

test('CLOSED results include every candidate, including zero votes', async () => {
  const electionId = await createElection();
  const selectedId = await createParticipant(electionId, 'Candidata votada');
  const zeroVoteId = await createParticipant(electionId, 'Candidata sen votos');
  await createVotedParticipants(electionId, 1);
  await createAnonymousBallot(electionId, [selectedId]);

  const result = requireSuccess(await getAdminElectionResults(electionId));

  assert.equal(result.rows.length, 2);
  assert.equal(
    result.rows.find(({ candidateId }) => candidateId === selectedId)?.votes,
    1,
  );
  assert.equal(
    result.rows.find(({ candidateId }) => candidateId === zeroVoteId)?.votes,
    0,
  );
});

test('votes come from BallotChoices and other elections cannot contaminate them', async () => {
  const electionId = await createElection();
  const firstCandidateId = await createParticipant(
    electionId,
    'Candidata principal',
  );
  const secondCandidateId = await createParticipant(
    electionId,
    'Candidato secundario',
  );
  await createVotedParticipants(electionId, 2);
  await createAnonymousBallot(electionId, [firstCandidateId, secondCandidateId]);
  await createAnonymousBallot(electionId, [firstCandidateId]);

  const otherElectionId = await createElection();
  const otherCandidateId = await createParticipant(
    otherElectionId,
    'Candidata doutra elección',
  );
  await createVotedParticipants(otherElectionId, 1);
  await createAnonymousBallot(otherElectionId, [otherCandidateId]);

  const result = requireSuccess(await getAdminElectionResults(electionId));

  assert.deepEqual(
    result.rows.map(({ candidateId, votes }) => [candidateId, votes]),
    [
      [firstCandidateId, 2],
      [secondCandidateId, 1],
    ],
  );
  assert.equal(
    result.rows.some(({ candidateId }) => candidateId === otherCandidateId),
    false,
  );
  assert.equal(result.ballotCount, 2);
});

test('ballot, voter, voted and pending counts remain independent', async () => {
  const electionId = await createElection();
  const candidateId = await createParticipant(electionId, 'Candidata');
  await createVotedParticipants(electionId, 2);
  await createParticipant(electionId, 'Votante pendente', {
    canVote: true,
    canBeCandidate: false,
    hasVoted: false,
  });
  await createAnonymousBallot(electionId, [candidateId]);
  await createAnonymousBallot(electionId, []);

  const result = requireSuccess(await getAdminElectionResults(electionId));

  assert.equal(result.ballotCount, 2);
  assert.equal(result.voterCount, 3);
  assert.equal(result.votedCount, 2);
  assert.equal(result.pendingCount, 1);
  assert.equal(result.turnoutPercentage, 67);
  assert.equal(result.integrityStatus, 'consistent');
});

test('null minimumTurnout has an explicit not-required state', async () => {
  const electionId = await createElection({ minimumTurnout: null });

  const result = requireSuccess(await getAdminElectionResults(electionId));

  assert.equal(result.minimumTurnout, null);
  assert.equal(result.turnoutStatus, 'notRequired');
});

test('an achieved absolute minimumTurnout permits seat assignment', async () => {
  const electionId = await createElection({ minimumTurnout: 2 });
  const candidateId = await createParticipant(electionId, 'Candidata');
  await createVotedParticipants(electionId, 2);
  await createAnonymousBallot(electionId, [candidateId]);
  await createAnonymousBallot(electionId, []);

  const result = requireSuccess(await getAdminElectionResults(electionId));

  assert.equal(result.turnoutStatus, 'met');
  assert.equal(result.canAssignSeats, true);
  assert.equal(result.rows[0]?.placement, 'elected');
});

test('an unmet minimumTurnout keeps the tally but marks no seats', async () => {
  const electionId = await createElection({ minimumTurnout: 3 });
  const candidateId = await createParticipant(electionId, 'Candidata');
  await createVotedParticipants(electionId, 2);
  await createAnonymousBallot(electionId, [candidateId]);
  await createAnonymousBallot(electionId, []);

  const result = requireSuccess(await getAdminElectionResults(electionId));

  assert.equal(result.turnoutStatus, 'notMet');
  assert.equal(result.canAssignSeats, false);
  assert.equal(result.rows[0]?.votes, 1);
  assert.equal(result.rows.every(({ placement }) => placement === 'none'), true);
});

test('a cutoff tie does not choose a candidate arbitrarily', async () => {
  const electionId = await createElection({ numberOfWinners: 3 });
  const candidateIds = await Promise.all([
    createParticipant(electionId, 'Hugo'),
    createParticipant(electionId, 'Dalton'),
    createParticipant(electionId, 'Manu'),
    createParticipant(electionId, 'Jose'),
  ]);
  await createVoteTotals(
    electionId,
    [9, 8, 6, 6].map((votes, index) => ({
      candidateId: candidateIds[index]!,
      votes,
    })),
  );

  const result = requireSuccess(await getAdminElectionResults(electionId));

  assert.equal(result.tie.affectsSeats, true);
  assert.equal(result.tie.seatsAvailableAmongTie, 1);
  assert.deepEqual(
    result.rows.filter(({ placement }) => placement === 'guaranteed').length,
    2,
  );
  assert.equal(
    result.rows.filter(({ placement }) => placement === 'tied').length,
    2,
  );
  assert.equal(
    result.rows.filter(({ placement }) => placement === 'elected').length,
    0,
  );
});

test('a non-conflicting tie allows every available seat', async () => {
  const electionId = await createElection({ numberOfWinners: 3 });
  const candidateIds = await Promise.all([
    createParticipant(electionId, 'Hugo'),
    createParticipant(electionId, 'Dalton'),
    createParticipant(electionId, 'Manu'),
    createParticipant(electionId, 'Jose'),
  ]);
  await createVoteTotals(
    electionId,
    [9, 8, 8, 7].map((votes, index) => ({
      candidateId: candidateIds[index]!,
      votes,
    })),
  );

  const result = requireSuccess(await getAdminElectionResults(electionId));

  assert.equal(result.tie.affectsSeats, false);
  assert.equal(
    result.rows.filter(({ placement }) => placement === 'elected').length,
    3,
  );
});

test('a ballotCount and votedCount mismatch suppresses every seat', async () => {
  const electionId = await createElection();
  const candidateId = await createParticipant(electionId, 'Candidata');
  await createParticipant(electionId, 'Votante sen papeleta', {
    canVote: true,
    canBeCandidate: false,
    hasVoted: true,
  });

  const result = requireSuccess(await getAdminElectionResults(electionId));

  assert.equal(result.ballotCount, 0);
  assert.equal(result.votedCount, 1);
  assert.equal(result.integrityStatus, 'inconsistent');
  assert.equal(result.canAssignSeats, false);
  assert.equal(
    result.rows.find(({ candidateId: id }) => id === candidateId)?.placement,
    'none',
  );
});

test('results contain no voter or credential identity', async () => {
  const electionId = await createElection();
  const candidateId = await createParticipant(electionId, 'Candidata pública');
  const voterId = await createParticipant(electionId, 'Votante privada', {
    canVote: true,
    canBeCandidate: false,
    hasVoted: true,
  });
  await db.insert(votingCredentials).values({
    participantId: voterId,
    tokenHash: `${testRunLabel}-secret-token-hash`,
    status: 'USED',
  });
  await createAnonymousBallot(electionId, [candidateId]);

  const result = requireSuccess(await getAdminElectionResults(electionId));
  const serializedResult = JSON.stringify(result);

  assert.equal(serializedResult.includes('Votante privada'), false);
  assert.equal(serializedResult.includes(voterId), false);
  assert.equal(serializedResult.includes('credentialId'), false);
  assert.equal(serializedResult.includes('tokenHash'), false);
  assert.equal(serializedResult.includes('secret-token-hash'), false);
});

test('Ballot structure retains no relation to voters or credentials', async () => {
  const ballotColumns = await db.execute(
    sql<{ column_name: string }>`
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = 'ballots'
      order by column_name
    `,
  );
  const directIdentityBallotForeignKeys = await db.execute(
    sql<{ constraint_name: string }>`
      select source_constraint.constraint_name
      from information_schema.referential_constraints references_constraint
      join information_schema.table_constraints source_constraint
        on source_constraint.constraint_catalog =
            references_constraint.constraint_catalog
        and source_constraint.constraint_schema =
            references_constraint.constraint_schema
        and source_constraint.constraint_name =
            references_constraint.constraint_name
      join information_schema.table_constraints target_constraint
        on target_constraint.constraint_catalog =
            references_constraint.unique_constraint_catalog
        and target_constraint.constraint_schema =
            references_constraint.unique_constraint_schema
        and target_constraint.constraint_name =
            references_constraint.unique_constraint_name
      where
        (
          source_constraint.table_name = 'ballots'
          and target_constraint.table_name in (
            'election_participants',
            'voting_credentials'
          )
        )
        or
        (
          target_constraint.table_name = 'ballots'
          and source_constraint.table_name in (
            'election_participants',
            'voting_credentials'
          )
        )
    `,
  );

  assert.deepEqual(
    ballotColumns.map(({ column_name }) => column_name),
    ['election_id', 'id'],
  );
  assert.equal(directIdentityBallotForeignKeys.length, 0);
});
