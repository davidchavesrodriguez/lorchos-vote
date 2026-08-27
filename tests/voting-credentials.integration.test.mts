import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import dotenv from 'dotenv';
import { asc, eq, inArray } from 'drizzle-orm';

dotenv.config({ path: '.env.local', quiet: true });
process.env.APP_URL = 'http://localhost:3000';

const { db } = await import('../src/db/index');
const {
  electionParticipants,
  elections,
  votingCredentials,
} = await import('../src/db/schema');
const {
  generateMissingVotingCredentials,
  regenerateVotingCredential,
} = await import('../src/lib/voting-credentials');
const { hashVotingToken } = await import('../src/lib/voting-token');

const testRunLabel = `voting-credentials-test-${Date.now()}`;
const electionIds: string[] = [];

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

async function readCredentials(participantIds: string[]) {
  if (participantIds.length === 0) {
    return [];
  }

  return db
    .select({
      id: votingCredentials.id,
      participantId: votingCredentials.participantId,
      tokenHash: votingCredentials.tokenHash,
      status: votingCredentials.status,
      createdAt: votingCredentials.createdAt,
      revokedAt: votingCredentials.revokedAt,
    })
    .from(votingCredentials)
    .where(inArray(votingCredentials.participantId, participantIds))
    .orderBy(asc(votingCredentials.createdAt), asc(votingCredentials.id));
}

function readTokenFromVotingUrl(votingUrl: string): string {
  const url = new URL(votingUrl);
  const token = url.hash.slice(1);

  assert.ok(token);
  assert.equal(url.pathname, '/v');
  assert.equal(url.search, '');
  return token;
}

after(async () => {
  if (electionIds.length > 0) {
    await db.delete(elections).where(inArray(elections.id, electionIds));
  }

  await db.$client.end({ timeout: 5 });
});

test('bulk generation includes only eligible voters and stores only hashes', async () => {
  const electionId = await createElection();
  const eligibleVoterId = await createParticipant(
    electionId,
    'A Votante válida',
  );
  const nonVoterId = await createParticipant(electionId, 'B Non votante', {
    canVote: false,
  });
  const voterWhoAlreadyVotedId = await createParticipant(
    electionId,
    'C Votante que xa votou',
    { hasVoted: true },
  );

  const result = await generateMissingVotingCredentials(electionId);

  assert.equal(result.type, 'success');
  if (result.type !== 'success') {
    return;
  }

  assert.equal(result.generatedLinks.length, 1);
  assert.equal(
    result.generatedLinks[0]?.participantId === eligibleVoterId,
    true,
  );

  const token = readTokenFromVotingUrl(result.generatedLinks[0]!.votingUrl);
  const credentials = await readCredentials([
    eligibleVoterId,
    nonVoterId,
    voterWhoAlreadyVotedId,
  ]);

  assert.equal(credentials.length, 1);
  assert.equal(credentials[0]?.participantId === eligibleVoterId, true);
  assert.equal(credentials[0]?.status, 'ACTIVE');
  assert.equal(credentials[0]?.revokedAt, null);
  assert.equal(credentials[0]?.tokenHash === token, false);
  assert.equal(credentials[0]?.tokenHash === hashVotingToken(token), true);
  assert.equal(
    result.generatedLinks[0]?.votingUrl.endsWith(`/v#${token}`),
    true,
  );
  assert.equal('token' in credentials[0]!, false);
  assert.equal('votingUrl' in credentials[0]!, false);
});

test('a second bulk generation preserves existing ACTIVE credentials', async () => {
  const electionId = await createElection();
  const participantId = await createParticipant(electionId, 'Votante estable');

  const firstResult = await generateMissingVotingCredentials(electionId);
  assert.equal(firstResult.type, 'success');
  const credentialsBefore = await readCredentials([participantId]);
  assert.equal(credentialsBefore.length, 1);

  const secondResult = await generateMissingVotingCredentials(electionId);
  const credentialsAfter = await readCredentials([participantId]);

  assert.equal(secondResult.type, 'allHaveActiveCredential');
  assert.equal(credentialsAfter.length, 1);
  assert.equal(credentialsAfter[0]?.id === credentialsBefore[0]?.id, true);
  assert.equal(
    credentialsAfter[0]?.tokenHash === credentialsBefore[0]?.tokenHash,
    true,
  );
  assert.equal(credentialsAfter[0]?.status, 'ACTIVE');
});

test('regeneration revokes the old credential and preserves history', async () => {
  const electionId = await createElection();
  const participantId = await createParticipant(
    electionId,
    'Votante con historial',
  );
  const initialResult = await generateMissingVotingCredentials(electionId);
  assert.equal(initialResult.type, 'success');
  if (initialResult.type !== 'success') {
    return;
  }

  const initialToken = readTokenFromVotingUrl(
    initialResult.generatedLinks[0]!.votingUrl,
  );
  const firstRegeneration = await regenerateVotingCredential(
    electionId,
    participantId,
  );
  assert.equal(firstRegeneration.type, 'success');
  if (firstRegeneration.type !== 'success') {
    return;
  }

  const firstReplacementToken = readTokenFromVotingUrl(
    firstRegeneration.generatedLink.votingUrl,
  );
  let credentials = await readCredentials([participantId]);
  let activeCredentials = credentials.filter(
    (credential) => credential.status === 'ACTIVE',
  );
  let revokedCredentials = credentials.filter(
    (credential) => credential.status === 'REVOKED',
  );

  assert.equal(initialToken === firstReplacementToken, false);
  assert.equal(activeCredentials.length, 1);
  assert.equal(activeCredentials[0]?.revokedAt, null);
  assert.equal(revokedCredentials.length, 1);
  assert.equal(revokedCredentials[0]?.revokedAt instanceof Date, true);

  const secondRegeneration = await regenerateVotingCredential(
    electionId,
    participantId,
  );
  assert.equal(secondRegeneration.type, 'success');
  if (secondRegeneration.type !== 'success') {
    return;
  }

  const secondReplacementToken = readTokenFromVotingUrl(
    secondRegeneration.generatedLink.votingUrl,
  );
  credentials = await readCredentials([participantId]);
  activeCredentials = credentials.filter(
    (credential) => credential.status === 'ACTIVE',
  );
  revokedCredentials = credentials.filter(
    (credential) => credential.status === 'REVOKED',
  );

  assert.equal(firstReplacementToken === secondReplacementToken, false);
  assert.equal(credentials.length, 3);
  assert.equal(activeCredentials.length, 1);
  assert.equal(activeCredentials[0]?.revokedAt, null);
  assert.equal(revokedCredentials.length, 2);
  assert.equal(
    revokedCredentials.every(
      (credential) => credential.revokedAt instanceof Date,
    ),
    true,
  );
});

test('individual generation rejects a participant without voting rights', async () => {
  const electionId = await createElection();
  const participantId = await createParticipant(electionId, 'Non votante', {
    canVote: false,
  });

  const result = await regenerateVotingCredential(electionId, participantId);

  assert.equal(result.type, 'cannotVote');
  assert.equal((await readCredentials([participantId])).length, 0);
});

test('individual generation rejects a participant who has already voted', async () => {
  const electionId = await createElection();
  const participantId = await createParticipant(
    electionId,
    'Votante xa usado',
    { hasVoted: true },
  );

  const result = await regenerateVotingCredential(electionId, participantId);

  assert.equal(result.type, 'hasVoted');
  assert.equal((await readCredentials([participantId])).length, 0);
});

test('individual generation rejects a participant from another election', async () => {
  const electionId = await createElection();
  const otherElectionId = await createElection();
  const otherParticipantId = await createParticipant(
    otherElectionId,
    'Votante doutra elección',
  );

  const result = await regenerateVotingCredential(
    electionId,
    otherParticipantId,
  );

  assert.equal(result.type, 'missingParticipant');
  assert.equal((await readCredentials([otherParticipantId])).length, 0);
});

test('credential operations reject a DRAFT election', async () => {
  const electionId = await createElection({ status: 'DRAFT' });
  const participantId = await createParticipant(
    electionId,
    'Votante en borrador',
  );

  const bulkResult = await generateMissingVotingCredentials(electionId);
  const individualResult = await regenerateVotingCredential(
    electionId,
    participantId,
  );

  assert.equal(bulkResult.type, 'notReady');
  assert.equal(individualResult.type, 'notRegenerable');
  assert.equal((await readCredentials([participantId])).length, 0);
});

test('individual regeneration works in OPEN before the deadline', async () => {
  const electionId = await createElection();
  const participantId = await createParticipant(
    electionId,
    'Votante en prazo',
  );
  const initialResult = await generateMissingVotingCredentials(electionId);
  assert.equal(initialResult.type, 'success');
  const before = await readCredentials([participantId]);
  await db
    .update(elections)
    .set({
      status: 'OPEN',
      openedAt: new Date(),
      closesAt: new Date(Date.now() + 30 * 60_000),
    })
    .where(eq(elections.id, electionId));

  const result = await regenerateVotingCredential(electionId, participantId);
  const afterRegeneration = await readCredentials([participantId]);

  assert.equal(result.type, 'success');
  assert.equal(afterRegeneration.length, before.length + 1);
  assert.equal(
    afterRegeneration.filter((credential) => credential.status === 'ACTIVE')
      .length,
    1,
  );
  assert.equal(
    afterRegeneration.filter((credential) => credential.status === 'REVOKED')
      .length,
    1,
  );
});

test('individual regeneration in OPEN is rejected after the deadline', async () => {
  const electionId = await createElection({
    status: 'OPEN',
    openedAt: new Date(Date.now() - 60 * 60_000),
    closesAt: new Date(Date.now() - 60_000),
  });
  const participantId = await createParticipant(
    electionId,
    'Votante fóra de prazo',
  );

  const result = await regenerateVotingCredential(electionId, participantId);

  assert.equal(result.type, 'closesAtPassed');
  assert.equal((await readCredentials([participantId])).length, 0);
});

test('bulk generation remains unavailable in OPEN', async () => {
  const electionId = await createElection({
    status: 'OPEN',
    openedAt: new Date(),
    closesAt: new Date(Date.now() + 30 * 60_000),
  });
  const participantId = await createParticipant(
    electionId,
    'Votante sen ligazón en aberta',
  );

  const result = await generateMissingVotingCredentials(electionId);

  assert.equal(result.type, 'notReady');
  assert.equal((await readCredentials([participantId])).length, 0);
});

test('individual regeneration remains unavailable in CLOSED', async () => {
  const electionId = await createElection({
    status: 'CLOSED',
    openedAt: new Date(Date.now() - 60 * 60_000),
    closesAt: new Date(Date.now() + 30 * 60_000),
    closedAt: new Date(),
  });
  const participantId = await createParticipant(
    electionId,
    'Votante en pechada',
  );

  const result = await regenerateVotingCredential(electionId, participantId);

  assert.equal(result.type, 'notRegenerable');
  assert.equal((await readCredentials([participantId])).length, 0);
});

test('the Server Action writes nothing without an admin session', async () => {
  const electionId = await createElection();
  const participantId = await createParticipant(
    electionId,
    'Votante sen sesión',
  );
  const { generateVotingLinks } = await import(
    '../src/app/admin/(protected)/elections/[id]/actions'
  );

  await assert.rejects(() => generateVotingLinks(electionId));

  assert.equal((await readCredentials([participantId])).length, 0);
});

test('concurrent regenerations leave one ACTIVE credential and valid history', async () => {
  const electionId = await createElection();
  const participantId = await createParticipant(
    electionId,
    'Votante concorrente',
  );
  const initialResult = await generateMissingVotingCredentials(electionId);
  assert.equal(initialResult.type, 'success');

  const results = await Promise.all([
    regenerateVotingCredential(electionId, participantId),
    regenerateVotingCredential(electionId, participantId),
  ]);
  const credentials = await readCredentials([participantId]);
  const activeCredentials = credentials.filter(
    (credential) => credential.status === 'ACTIVE',
  );
  const revokedCredentials = credentials.filter(
    (credential) => credential.status === 'REVOKED',
  );

  assert.equal(results.every((result) => result.type === 'success'), true);
  assert.equal(credentials.length, 3);
  assert.equal(activeCredentials.length, 1);
  assert.equal(activeCredentials[0]?.revokedAt, null);
  assert.equal(revokedCredentials.length, 2);
  assert.equal(
    revokedCredentials.every(
      (credential) => credential.revokedAt instanceof Date,
    ),
    true,
  );
});
