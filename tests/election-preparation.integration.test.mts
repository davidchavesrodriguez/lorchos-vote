import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import { asc, eq, inArray } from 'drizzle-orm';

import './test-database-bootstrap.mjs';

const { db } = await import('../src/db/index');
const {
  electionParticipants,
  elections,
  votingCredentials,
} = await import('../src/db/schema');
const { transitionDraftElectionToReady } = await import(
  '../src/lib/election-preparation'
);

const testRunLabel = `readiness-test-${Date.now()}`;
const electionIds: string[] = [];

async function createElection(
  overrides: Partial<typeof elections.$inferInsert> = {},
) {
  const [election] = await db
    .insert(elections)
    .values({
      title: `${testRunLabel}-${electionIds.length + 1}`,
      groupLabel: testRunLabel,
      status: 'DRAFT',
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

async function prepare(electionId: string) {
  return db.transaction((tx) =>
    transitionDraftElectionToReady(tx, electionId),
  );
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

after(async () => {
  if (electionIds.length > 0) {
    await db.delete(elections).where(inArray(elections.id, electionIds));
  }

  await db.$client.end({ timeout: 5 });
});

test('an invalid DRAFT remains unchanged', async () => {
  const electionId = await createElection();
  const before = await readElection(electionId);

  const result = await prepare(electionId);
  const afterPreparation = await readElection(electionId);

  assert.equal(result.type, 'notReady');
  assert.deepEqual(afterPreparation, before);
});

test('a valid election changes only from DRAFT to READY', async () => {
  const electionId = await createElection({
    numberOfWinners: 2,
    maxSelections: 2,
    allowSelfVote: false,
    minimumTurnout: 1,
  });
  await db.insert(electionParticipants).values([
    {
      electionId,
      displayName: 'Votante',
      canVote: true,
      canBeCandidate: false,
    },
    {
      electionId,
      displayName: 'Candidata A',
      canVote: false,
      canBeCandidate: true,
    },
    {
      electionId,
      displayName: 'Candidato B',
      canVote: false,
      canBeCandidate: true,
    },
  ]);
  const beforeElection = await readElection(electionId);
  const beforeParticipants = await readParticipants(electionId);

  const result = await prepare(electionId);
  const afterElection = await readElection(electionId);
  const afterParticipants = await readParticipants(electionId);

  assert.deepEqual(result, { type: 'success' });
  assert.deepEqual(afterElection, { ...beforeElection, status: 'READY' });
  assert.deepEqual(afterParticipants, beforeParticipants);

  const credentials = await db
    .select({ id: votingCredentials.id })
    .from(votingCredentials)
    .where(
      inArray(
        votingCredentials.participantId,
        afterParticipants.map((participant) => participant.id),
      ),
    );
  assert.deepEqual(credentials, []);

  const secondResult = await prepare(electionId);
  assert.deepEqual(secondResult, { type: 'notDraft' });
  assert.deepEqual(await readElection(electionId), afterElection);
  assert.deepEqual(await readParticipants(electionId), beforeParticipants);

  const censusMutationResult = await db.transaction(async (tx) => {
    const [election] = await tx
      .select({ status: elections.status })
      .from(elections)
      .where(eq(elections.id, electionId))
      .for('update');

    if (election?.status !== 'DRAFT') {
      return 'notDraft' as const;
    }

    await tx
      .update(electionParticipants)
      .set({ canVote: false })
      .where(eq(electionParticipants.electionId, electionId));
    return 'success' as const;
  });

  assert.equal(censusMutationResult, 'notDraft');
  assert.deepEqual(await readParticipants(electionId), beforeParticipants);
});

test('the Server Action cannot change state without an admin session', async () => {
  const electionId = await createElection();
  await db.insert(electionParticipants).values({
    electionId,
    displayName: 'Persoa válida',
    canVote: true,
    canBeCandidate: true,
  });
  const before = await readElection(electionId);
  const { prepareElection } = await import(
    '../src/app/admin/(protected)/elections/[id]/actions'
  );
  const formData = new FormData();
  formData.set('electionId', electionId);

  await assert.rejects(() => prepareElection({}, formData));

  assert.deepEqual(await readElection(electionId), before);
});

test('census mutation and preparation serialize on the election row', async () => {
  const electionId = await createElection();
  const [participant] = await db
    .insert(electionParticipants)
    .values({
      electionId,
      displayName: 'Votante candidata',
      canVote: true,
      canBeCandidate: true,
    })
    .returning({ id: electionParticipants.id });
  assert.ok(participant);

  let releaseMutation!: () => void;
  const mutationCanFinish = new Promise<void>((resolve) => {
    releaseMutation = resolve;
  });
  let reportElectionLocked!: () => void;
  const electionLocked = new Promise<void>((resolve) => {
    reportElectionLocked = resolve;
  });

  const censusMutation = db.transaction(async (tx) => {
    await tx
      .select({ status: elections.status })
      .from(elections)
      .where(eq(elections.id, electionId))
      .for('update');
    reportElectionLocked();
    await mutationCanFinish;
    await tx
      .update(electionParticipants)
      .set({ canVote: false })
      .where(eq(electionParticipants.id, participant.id));
  });

  await electionLocked;
  let preparationSettled = false;
  const preparation = prepare(electionId).finally(() => {
    preparationSettled = true;
  });

  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(preparationSettled, false);
  } finally {
    releaseMutation();
  }

  await censusMutation;
  const preparationResult = await preparation;

  assert.equal(preparationResult.type, 'notReady');
  assert.equal((await readElection(electionId)).status, 'DRAFT');
  assert.equal((await readParticipants(electionId))[0]?.canVote, false);
});
