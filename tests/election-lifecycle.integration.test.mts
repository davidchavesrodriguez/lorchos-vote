import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import { asc, eq, inArray } from 'drizzle-orm';

import './test-database-bootstrap.mjs';

process.env.APP_URL = 'http://localhost:3000';

const { db } = await import('../src/db/index');
const {
  electionParticipants,
  elections,
  votingCredentials,
} = await import('../src/db/schema');
const {
  transitionOpenElectionToClosed,
  transitionReadyElectionToOpen,
} = await import('../src/lib/election-lifecycle');
const { regenerateVotingCredential } = await import(
  '../src/lib/voting-credentials'
);

const testRunLabel = `election-lifecycle-test-${Date.now()}`;
const electionIds: string[] = [];
let credentialSequence = 0;

async function createElection(
  overrides: Partial<typeof elections.$inferInsert> = {},
) {
  const [election] = await db
    .insert(elections)
    .values({
      title: `${testRunLabel}-${electionIds.length + 1}`,
      groupLabel: testRunLabel,
      status: 'READY',
      numberOfWinners: 1,
      minSelections: 1,
      maxSelections: 1,
      allowSelfVote: true,
      minimumTurnout: null,
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
      canVote: true,
      canBeCandidate: true,
      hasVoted: false,
      ...overrides,
    })
    .returning({ id: electionParticipants.id });

  assert.ok(participant);
  return participant.id;
}

async function createActiveCredential(participantId: string) {
  credentialSequence += 1;
  await db.insert(votingCredentials).values({
    participantId,
    tokenHash: `${testRunLabel}-credential-${credentialSequence}`,
    status: 'ACTIVE',
    revokedAt: null,
  });
}

async function readElection(electionId: string) {
  const [election] = await db
    .select()
    .from(elections)
    .where(eq(elections.id, electionId));

  assert.ok(election);
  return election;
}

async function readParticipants(electionId: string) {
  return db
    .select()
    .from(electionParticipants)
    .where(eq(electionParticipants.electionId, electionId))
    .orderBy(asc(electionParticipants.displayName));
}

async function readCredentials(electionId: string) {
  const participants = await readParticipants(electionId);

  if (participants.length === 0) {
    return [];
  }

  return db
    .select()
    .from(votingCredentials)
    .where(
      inArray(
        votingCredentials.participantId,
        participants.map((participant) => participant.id),
      ),
    )
    .orderBy(asc(votingCredentials.createdAt), asc(votingCredentials.id));
}

async function openElection(electionId: string, closesAt: string) {
  return db.transaction((tx) =>
    transitionReadyElectionToOpen(tx, electionId, closesAt),
  );
}

async function closeElection(electionId: string) {
  return db.transaction((tx) =>
    transitionOpenElectionToClosed(tx, electionId),
  );
}

function futureInstant(minutes = 30) {
  return new Date(Date.now() + minutes * 60_000);
}

after(async () => {
  if (electionIds.length > 0) {
    await db.delete(elections).where(inArray(elections.id, electionIds));
  }

  await db.$client.end({ timeout: 5 });
});

test('READY without voters cannot open', async () => {
  const electionId = await createElection();
  const before = await readElection(electionId);
  const result = await openElection(electionId, futureInstant().toISOString());

  assert.deepEqual(result, { type: 'noVoters' });
  assert.deepEqual(await readElection(electionId), before);
});

test('READY with a voter lacking an ACTIVE credential cannot open', async () => {
  const electionId = await createElection();
  await createParticipant(electionId, 'Votante sen ligazón');
  const result = await openElection(electionId, futureInstant().toISOString());

  assert.deepEqual(result, {
    type: 'missingActiveCredentials',
    voterCount: 1,
  });
  assert.equal((await readElection(electionId)).status, 'READY');
});

test('READY reports one missing credential among several voters', async () => {
  const electionId = await createElection();
  const firstParticipantId = await createParticipant(electionId, 'Votante A');
  const secondParticipantId = await createParticipant(electionId, 'Votante B');
  await createParticipant(electionId, 'Votante C');
  await createActiveCredential(firstParticipantId);
  await createActiveCredential(secondParticipantId);
  const result = await openElection(electionId, futureInstant().toISOString());

  assert.deepEqual(result, {
    type: 'missingActiveCredentials',
    voterCount: 1,
  });
  assert.equal((await readElection(electionId)).status, 'READY');
});

test('invalid and past closing instants are rejected without writes', async () => {
  const electionId = await createElection();
  const participantId = await createParticipant(electionId, 'Votante');
  await createActiveCredential(participantId);
  const before = await readElection(electionId);

  const localDateResult = await openElection(electionId, '2026-09-06T20:00');
  const invalidResult = await openElection(electionId, 'non é unha data');
  const pastResult = await openElection(
    electionId,
    new Date(Date.now() - 60_000).toISOString(),
  );

  assert.deepEqual(localDateResult, { type: 'invalidClosesAt' });
  assert.deepEqual(invalidResult, { type: 'invalidClosesAt' });
  assert.deepEqual(pastResult, { type: 'closesAtNotFuture' });
  assert.deepEqual(await readElection(electionId), before);
});

test('a voter marked as having voted prevents opening', async () => {
  const electionId = await createElection();
  const participantId = await createParticipant(
    electionId,
    'Votante inconsistente',
    { hasVoted: true },
  );
  await createActiveCredential(participantId);
  const result = await openElection(electionId, futureInstant().toISOString());

  assert.deepEqual(result, { type: 'votersHaveVoted', voterCount: 1 });
  assert.equal((await readElection(electionId)).status, 'READY');
});

test('valid opening changes only lifecycle fields and preserves related data', async () => {
  const electionId = await createElection();
  const voterAId = await createParticipant(electionId, 'Votante A');
  const voterBId = await createParticipant(electionId, 'Votante B');
  await createParticipant(electionId, 'Candidata sen voto', { canVote: false });
  await createActiveCredential(voterAId);
  await createActiveCredential(voterBId);
  const beforeElection = await readElection(electionId);
  const beforeParticipants = await readParticipants(electionId);
  const beforeCredentials = await readCredentials(electionId);
  const closesAt = futureInstant(45);
  const openingStartedAt = new Date();

  const result = await openElection(electionId, closesAt.toISOString());
  const openingFinishedAt = new Date();
  const openedElection = await readElection(electionId);

  assert.equal(result.type, 'success');
  assert.equal(openedElection.status, 'OPEN');
  assert.equal(openedElection.openedAt instanceof Date, true);
  assert.equal(
    openedElection.openedAt!.getTime() >= openingStartedAt.getTime(),
    true,
  );
  assert.equal(
    openedElection.openedAt!.getTime() <= openingFinishedAt.getTime(),
    true,
  );
  assert.equal(openedElection.closesAt?.getTime(), closesAt.getTime());
  assert.equal(openedElection.opensAt, null);
  assert.equal(openedElection.closedAt, null);
  assert.deepEqual(
    {
      ...openedElection,
      status: beforeElection.status,
      openedAt: beforeElection.openedAt,
      closesAt: beforeElection.closesAt,
    },
    beforeElection,
  );
  assert.deepEqual(await readParticipants(electionId), beforeParticipants);
  assert.deepEqual(await readCredentials(electionId), beforeCredentials);

  const beforeSecondOpening = await readElection(electionId);
  const secondResult = await openElection(
    electionId,
    futureInstant(60).toISOString(),
  );

  assert.deepEqual(secondResult, { type: 'notReady' });
  assert.deepEqual(await readElection(electionId), beforeSecondOpening);
});

test('opening Server Action writes nothing without an admin session', async () => {
  const electionId = await createElection();
  const participantId = await createParticipant(electionId, 'Votante sen sesión');
  await createActiveCredential(participantId);
  const beforeElection = await readElection(electionId);
  const beforeCredentials = await readCredentials(electionId);
  const { openElection: openElectionAction } = await import(
    '../src/app/admin/(protected)/elections/[id]/actions'
  );
  const formData = new FormData();
  formData.set('electionId', electionId);
  formData.set('closesAt', futureInstant().toISOString());

  await assert.rejects(() => openElectionAction({}, formData));

  assert.deepEqual(await readElection(electionId), beforeElection);
  assert.deepEqual(await readCredentials(electionId), beforeCredentials);
});

test('OPEN closes once while preserving opening, deadline and credentials', async () => {
  const openedAt = new Date(Date.now() - 15 * 60_000);
  const closesAt = futureInstant(30);
  const electionId = await createElection({
    status: 'OPEN',
    openedAt,
    closesAt,
  });
  const participantId = await createParticipant(electionId, 'Votante');
  await createActiveCredential(participantId);
  const credentialsBefore = await readCredentials(electionId);
  const closingStartedAt = new Date();

  const result = await closeElection(electionId);
  const closingFinishedAt = new Date();
  const closedElection = await readElection(electionId);

  assert.equal(result.type, 'success');
  assert.equal(closedElection.status, 'CLOSED');
  assert.equal(closedElection.closedAt instanceof Date, true);
  assert.equal(
    closedElection.closedAt!.getTime() >= closingStartedAt.getTime(),
    true,
  );
  assert.equal(
    closedElection.closedAt!.getTime() <= closingFinishedAt.getTime(),
    true,
  );
  assert.equal(closedElection.openedAt?.getTime(), openedAt.getTime());
  assert.equal(closedElection.closesAt?.getTime(), closesAt.getTime());
  assert.deepEqual(await readCredentials(electionId), credentialsBefore);

  const beforeSecondClosing = await readElection(electionId);
  const secondResult = await closeElection(electionId);

  assert.deepEqual(secondResult, { type: 'notOpen' });
  assert.deepEqual(await readElection(electionId), beforeSecondClosing);
  assert.deepEqual(await readCredentials(electionId), credentialsBefore);
});

test('READY cannot close directly', async () => {
  const electionId = await createElection();
  const before = await readElection(electionId);
  const result = await closeElection(electionId);

  assert.deepEqual(result, { type: 'notOpen' });
  assert.deepEqual(await readElection(electionId), before);
});

test('closing Server Action writes nothing without an admin session', async () => {
  const electionId = await createElection({
    status: 'OPEN',
    openedAt: new Date(),
    closesAt: futureInstant(),
  });
  const before = await readElection(electionId);
  const { closeElection: closeElectionAction } = await import(
    '../src/app/admin/(protected)/elections/[id]/actions'
  );
  const formData = new FormData();
  formData.set('electionId', electionId);

  await assert.rejects(() => closeElectionAction({}, formData));

  assert.deepEqual(await readElection(electionId), before);
});

test('regeneration and closing serialize on the election row', async () => {
  const electionId = await createElection({
    status: 'OPEN',
    openedAt: new Date(),
    closesAt: futureInstant(),
  });
  const participantId = await createParticipant(
    electionId,
    'Votante concorrente',
  );
  await createActiveCredential(participantId);

  let releaseBlocker!: () => void;
  const blockerCanFinish = new Promise<void>((resolve) => {
    releaseBlocker = resolve;
  });
  let reportElectionLocked!: () => void;
  const electionLocked = new Promise<void>((resolve) => {
    reportElectionLocked = resolve;
  });
  const blocker = db.transaction(async (tx) => {
    await tx
      .select({ status: elections.status })
      .from(elections)
      .where(eq(elections.id, electionId))
      .for('update');
    reportElectionLocked();
    await blockerCanFinish;
  });

  await electionLocked;
  let regenerationSettled = false;
  let closingSettled = false;
  const regeneration = regenerateVotingCredential(
    electionId,
    participantId,
  ).finally(() => {
    regenerationSettled = true;
  });
  const closing = closeElection(electionId).finally(() => {
    closingSettled = true;
  });

  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(regenerationSettled, false);
    assert.equal(closingSettled, false);
  } finally {
    releaseBlocker();
  }

  await blocker;
  const [regenerationResult, closingResult] = await Promise.all([
    regeneration,
    closing,
  ]);
  const credentials = await readCredentials(electionId);

  assert.equal(closingResult.type, 'success');
  assert.equal(
    regenerationResult.type === 'success' ||
      regenerationResult.type === 'notRegenerable',
    true,
  );
  assert.equal((await readElection(electionId)).status, 'CLOSED');
  assert.equal(
    credentials.filter((credential) => credential.status === 'ACTIVE').length,
    1,
  );
});
