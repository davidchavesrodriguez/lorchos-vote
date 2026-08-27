import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';

import dotenv from 'dotenv';
import { eq, inArray, sql } from 'drizzle-orm';

dotenv.config({ path: '.env.local', quiet: true });
process.env.APP_URL = 'http://localhost:3000';
process.env.VOTING_SESSION_SECRET =
  'integration-test-only-independent-secret-with-sufficient-length';

const { db } = await import('../src/db/index');
const {
  ballotChoices,
  ballots,
  electionParticipants,
  elections,
  votingCredentials,
} = await import('../src/db/schema');
const {
  transitionOpenElectionToClosed,
} = await import('../src/lib/election-lifecycle');
const {
  castPublicVote,
  resolvePublicVotingCredential,
} = await import('../src/lib/public-voting');
const { submitPublicVoteWithSession } = await import(
  '../src/lib/public-voting-session'
);
const { POST: exchangeVotingSession } = await import(
  '../src/app/api/voting/session/route'
);
const {
  getVotingSessionCookieName,
  verifyVotingSession,
} = await import('../src/lib/voting-session');
const { generateVotingToken, hashVotingToken } = await import(
  '../src/lib/voting-token'
);
const { regenerateVotingCredential } = await import(
  '../src/lib/voting-credentials'
);

const testRunLabel = `public-voting-test-${Date.now()}`;
const electionIds: string[] = [];

function futureInstant(minutes = 30) {
  return new Date(Date.now() + minutes * 60_000);
}

async function createElection(
  overrides: Partial<typeof elections.$inferInsert> = {},
) {
  const [election] = await db
    .insert(elections)
    .values({
      title: `${testRunLabel}-${electionIds.length + 1}`,
      groupLabel: testRunLabel,
      status: 'OPEN',
      numberOfWinners: 1,
      minSelections: 1,
      maxSelections: 3,
      allowSelfVote: false,
      minimumTurnout: null,
      openedAt: new Date(),
      closesAt: futureInstant(),
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

async function createCredential(
  participantId: string,
  status: 'ACTIVE' | 'USED' | 'REVOKED' = 'ACTIVE',
) {
  const token = generateVotingToken();

  const [credential] = await db
    .insert(votingCredentials)
    .values({
      participantId,
      tokenHash: hashVotingToken(token),
      status,
      revokedAt: status === 'REVOKED' ? new Date() : null,
    })
    .returning({ id: votingCredentials.id });

  assert.ok(credential);
  return { token, credentialId: credential.id };
}

type VotingFixtureOptions = {
  election?: Partial<typeof elections.$inferInsert>;
  voter?: Partial<typeof electionParticipants.$inferInsert>;
  candidateCount?: number;
};

async function createVotingFixture({
  election: electionOverrides = {},
  voter: voterOverrides = {},
  candidateCount = 4,
}: VotingFixtureOptions = {}) {
  const electionId = await createElection(electionOverrides);
  const voterId = await createParticipant(electionId, 'Votante principal', {
    canVote: true,
    canBeCandidate: true,
    ...voterOverrides,
  });
  const candidateIds: string[] = [];

  for (let index = 0; index < candidateCount; index += 1) {
    candidateIds.push(
      await createParticipant(electionId, `Candidata ${index + 1}`),
    );
  }

  const credential = await createCredential(voterId);

  return {
    electionId,
    voterId,
    candidateIds,
    token: credential.token,
    credentialId: credential.credentialId,
  };
}

async function readElectionVotes(electionId: string) {
  const electionBallots = await db
    .select()
    .from(ballots)
    .where(eq(ballots.electionId, electionId));
  const choices = await db
    .select()
    .from(ballotChoices)
    .where(eq(ballotChoices.electionId, electionId));

  return { electionBallots, choices };
}

async function readCredential(credentialId: string) {
  const [credential] = await db
    .select()
    .from(votingCredentials)
    .where(eq(votingCredentials.id, credentialId));

  assert.ok(credential);
  return credential;
}

async function readParticipant(participantId: string) {
  const [participant] = await db
    .select()
    .from(electionParticipants)
    .where(eq(electionParticipants.id, participantId));

  assert.ok(participant);
  return participant;
}

async function postSessionExchange(
  body: unknown,
  origin = process.env.APP_URL,
) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    Host: 'localhost:3000',
    Origin: origin!,
  });

  return exchangeVotingSession(
    new Request('http://localhost:3000/api/voting/session', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
}

function readSetCookies(response: Response) {
  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie);
  return setCookie.split(/,\s*(?=[^;,]+=)/);
}

function readSignedSessionFromResponse(response: Response, sessionId: string) {
  const prefix = `${getVotingSessionCookieName(sessionId)}=`;
  const setCookie = readSetCookies(response).find((cookie) =>
    cookie.startsWith(prefix),
  );
  assert.ok(setCookie);
  return setCookie.split(';', 1)[0]!.slice(prefix.length);
}

function readSessionFromResponse(response: Response) {
  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie);
  const pathMatch = setCookie.match(/; Path=\/v\/papeleta\/([^;]+);/);
  assert.ok(pathMatch?.[1]);
  const session = verifyVotingSession(
    readSignedSessionFromResponse(response, pathMatch[1]),
    pathMatch[1],
  );
  assert.ok(session);
  return session;
}

after(async () => {
  if (electionIds.length > 0) {
    await db.delete(elections).where(inArray(elections.id, electionIds));
  }

  await db.$client.end({ timeout: 5 });
});

test('a missing public voting credential resolves to invalid', async () => {
  const result = await resolvePublicVotingCredential(randomUUID());

  assert.deepEqual(result, { type: 'invalid' });
});

test('a valid token exchange creates only a signed voting session', async () => {
  const fixture = await createVotingFixture();
  const response = await postSessionExchange({ token: fixture.token });
  const result = await response.clone().json();
  const session = readSessionFromResponse(response);

  assert.equal(response.status, 200);
  assert.deepEqual(result, {
    status: 'success',
    sessionId: session.sessionId,
  });
  assert.deepEqual(Object.keys(result).sort(), ['sessionId', 'status']);
  assert.equal(session.credentialId, fixture.credentialId);
  assert.equal(
    readSetCookies(response).includes(
      'voting_session=; Max-Age=0; Path=/v; HttpOnly; SameSite=Strict',
    ),
    true,
  );
  assert.equal(
    response.headers.get('set-cookie')?.includes(fixture.token),
    false,
  );
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(
    (await resolvePublicVotingCredential(session.credentialId)).type,
    'available',
  );
});

test('A and B sessions coexist and refresh resolves each credential', async () => {
  const fixtureA = await createVotingFixture({
    election: { title: `${testRunLabel}-bootstrap-a` },
  });
  const fixtureB = await createVotingFixture({
    election: { title: `${testRunLabel}-bootstrap-b` },
  });
  const responseA = await postSessionExchange({ token: fixtureA.token });
  const sessionA = readSessionFromResponse(responseA);
  const setCookieA = responseA.headers.get('set-cookie');

  assert.equal(sessionA.credentialId, fixtureA.credentialId);

  const responseB = await postSessionExchange({ token: fixtureB.token });
  const sessionB = readSessionFromResponse(responseB);
  const setCookieB = responseB.headers.get('set-cookie');

  assert.equal(responseB.status, 200);
  assert.notEqual(sessionB.sessionId, sessionA.sessionId);
  assert.notEqual(sessionB.credentialId, sessionA.credentialId);
  assert.equal(sessionB.credentialId, fixtureB.credentialId);
  assert.notEqual(
    getVotingSessionCookieName(sessionA.sessionId),
    getVotingSessionCookieName(sessionB.sessionId),
  );
  assert.notEqual(setCookieB, setCookieA);
  assert.match(setCookieA!, new RegExp(`Path=/v/papeleta/${sessionA.sessionId}`));
  assert.match(setCookieB!, new RegExp(`Path=/v/papeleta/${sessionB.sessionId}`));
  assert.equal(
    responseB.headers.get('set-cookie')?.includes(fixtureB.token),
    false,
  );

  const refreshA = await resolvePublicVotingCredential(
    sessionA.credentialId,
  );
  const refreshB = await resolvePublicVotingCredential(
    sessionB.credentialId,
  );

  assert.equal(refreshA.type, 'available');
  assert.equal(refreshB.type, 'available');
  if (refreshA.type === 'available' && refreshB.type === 'available') {
    assert.equal(refreshA.electionTitle, `${testRunLabel}-bootstrap-a`);
    assert.equal(refreshB.electionTitle, `${testRunLabel}-bootstrap-b`);
  }
});

test('submits are bound to their page session and reject mismatches', async () => {
  const fixtureA = await createVotingFixture({
    election: { minSelections: 1, maxSelections: 1 },
  });
  const fixtureB = await createVotingFixture({
    election: { minSelections: 1, maxSelections: 1 },
  });
  const responseA = await postSessionExchange({ token: fixtureA.token });
  const responseB = await postSessionExchange({ token: fixtureB.token });
  const sessionA = readSessionFromResponse(responseA);
  const sessionB = readSessionFromResponse(responseB);
  const signedA = readSignedSessionFromResponse(responseA, sessionA.sessionId);
  const signedB = readSignedSessionFromResponse(responseB, sessionB.sessionId);
  const manipulatedSessionId = `${
    sessionA.sessionId[0] === 'A' ? 'B' : 'A'
  }${sessionA.sessionId.slice(1)}`;

  assert.deepEqual(
    await submitPublicVoteWithSession(
      sessionB.sessionId,
      signedA,
      [fixtureB.candidateIds[0]!],
    ),
    { type: 'invalidLink' },
  );
  assert.deepEqual(
    await submitPublicVoteWithSession(
      sessionA.sessionId,
      signedB,
      [fixtureA.candidateIds[0]!],
    ),
    { type: 'invalidLink' },
  );
  assert.deepEqual(
    await submitPublicVoteWithSession(
      sessionA.sessionId,
      undefined,
      [fixtureA.candidateIds[0]!],
    ),
    { type: 'invalidLink' },
  );
  assert.deepEqual(
    await submitPublicVoteWithSession(
      manipulatedSessionId,
      signedA,
      [fixtureA.candidateIds[0]!],
    ),
    { type: 'invalidLink' },
  );
  assert.deepEqual(await readElectionVotes(fixtureA.electionId), {
    electionBallots: [],
    choices: [],
  });
  assert.deepEqual(await readElectionVotes(fixtureB.electionId), {
    electionBallots: [],
    choices: [],
  });

  assert.deepEqual(
    await submitPublicVoteWithSession(
      sessionA.sessionId,
      signedA,
      [fixtureA.candidateIds[0]!],
    ),
    { type: 'success' },
  );
  assert.deepEqual(
    await submitPublicVoteWithSession(
      sessionB.sessionId,
      signedB,
      [fixtureB.candidateIds[0]!],
    ),
    { type: 'success' },
  );
  assert.equal((await readCredential(fixtureA.credentialId)).status, 'USED');
  assert.equal((await readCredential(fixtureB.credentialId)).status, 'USED');
  assert.deepEqual(
    await resolvePublicVotingCredential(sessionA.credentialId),
    { type: 'used' },
  );
  assert.deepEqual(
    await resolvePublicVotingCredential(sessionB.credentialId),
    { type: 'used' },
  );
});

test('an invalid token exchange creates no session', async () => {
  const response = await postSessionExchange({
    token: generateVotingToken(),
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { status: 'invalid' });
  assert.equal(response.headers.get('set-cookie'), null);
});

test('the exchange rejects cross-origin and internal identifier input', async () => {
  const fixture = await createVotingFixture();
  const crossOrigin = await postSessionExchange(
    { token: fixture.token },
    'https://attacker.test',
  );
  const internalInput = await postSessionExchange({
    token: fixture.token,
    credentialId: fixture.credentialId,
  });

  assert.equal(crossOrigin.status, 403);
  assert.equal(crossOrigin.headers.get('set-cookie'), null);
  assert.equal(internalInput.status, 400);
  assert.equal(internalInput.headers.get('set-cookie'), null);
});

test('a REVOKED public voting credential resolves separately', async () => {
  const electionId = await createElection();
  const voterId = await createParticipant(electionId, 'Ligazón revogada', {
    canVote: true,
  });
  const { token } = await createCredential(voterId, 'REVOKED');
  const response = await postSessionExchange({ token });
  const { credentialId } = readSessionFromResponse(response);

  const result = await resolvePublicVotingCredential(credentialId);

  assert.deepEqual(result, { type: 'revoked' });
});

test('a USED public voting credential resolves separately', async () => {
  const electionId = await createElection();
  const voterId = await createParticipant(electionId, 'Ligazón usada', {
    canVote: true,
    hasVoted: true,
  });
  const { token } = await createCredential(voterId, 'USED');
  const response = await postSessionExchange({ token });
  const { credentialId } = readSessionFromResponse(response);

  const result = await resolvePublicVotingCredential(credentialId);

  assert.deepEqual(result, { type: 'used' });
});

test('an ACTIVE credential in READY reports that voting is not open', async () => {
  const electionId = await createElection({
    status: 'READY',
    openedAt: null,
    closesAt: null,
  });
  const voterId = await createParticipant(electionId, 'Votante preparada', {
    canVote: true,
  });
  const { credentialId } = await createCredential(voterId);

  const result = await resolvePublicVotingCredential(credentialId);

  assert.equal(result.type, 'ready');
});

test('an ACTIVE credential in CLOSED reports that voting is closed', async () => {
  const electionId = await createElection({
    status: 'CLOSED',
    closedAt: new Date(),
  });
  const voterId = await createParticipant(electionId, 'Votante pechada', {
    canVote: true,
  });
  const { credentialId } = await createCredential(voterId);

  const result = await resolvePublicVotingCredential(credentialId);

  assert.equal(result.type, 'closed');
});

test('an ACTIVE credential in an expired OPEN election reports the deadline', async () => {
  const electionId = await createElection({
    openedAt: new Date(Date.now() - 60_000),
    closesAt: new Date(Date.now() - 1_000),
  });
  const voterId = await createParticipant(electionId, 'Votante fóra de prazo', {
    canVote: true,
  });
  const { credentialId } = await createCredential(voterId);

  const result = await resolvePublicVotingCredential(credentialId);

  assert.equal(result.type, 'deadlinePassed');
});

test('an ACTIVE credential in OPEN without a deadline is unavailable', async () => {
  const electionId = await createElection({ closesAt: null });
  const voterId = await createParticipant(electionId, 'Votante sen prazo', {
    canVote: true,
  });
  const { credentialId } = await createCredential(voterId);

  const result = await resolvePublicVotingCredential(credentialId);

  assert.equal(result.type, 'unavailable');
});

test('a valid ACTIVE credential resolves only the public voting form data', async () => {
  const fixture = await createVotingFixture();
  const ineligibleId = await createParticipant(
    fixture.electionId,
    'Participante non candidata',
    { canBeCandidate: false },
  );
  const result = await resolvePublicVotingCredential(fixture.credentialId);

  assert.equal(result.type, 'available');
  if (result.type !== 'available') {
    return;
  }

  assert.equal(result.voterDisplayName, 'Votante principal');
  assert.equal(result.minSelections, 1);
  assert.equal(result.maxSelections, 3);
  assert.equal(result.candidates.length, fixture.candidateIds.length);
  assert.equal(
    result.candidates.some(({ id }) => id === fixture.voterId),
    false,
  );
  assert.equal(
    result.candidates.some(({ id }) => id === ineligibleId),
    false,
  );
  assert.equal('tokenHash' in result, false);
  assert.equal('credentialId' in result, false);
  assert.equal('hasVoted' in result, false);
});

test('fewer than minSelections is rejected without writes', async () => {
  const fixture = await createVotingFixture({
    election: { minSelections: 2, maxSelections: 3 },
  });

  const result = await castPublicVote(fixture.credentialId, [
    fixture.candidateIds[0]!,
  ]);

  assert.deepEqual(result, { type: 'invalidSelections' });
  assert.deepEqual(await readElectionVotes(fixture.electionId), {
    electionBallots: [],
    choices: [],
  });
  assert.equal((await readCredential(fixture.credentialId)).status, 'ACTIVE');
  assert.equal((await readParticipant(fixture.voterId)).hasVoted, false);
});

test('more than maxSelections is rejected', async () => {
  const fixture = await createVotingFixture({
    election: { minSelections: 1, maxSelections: 2 },
  });

  const result = await castPublicVote(
    fixture.credentialId,
    fixture.candidateIds.slice(0, 3),
  );

  assert.deepEqual(result, { type: 'invalidSelections' });
  assert.equal(
    (await readElectionVotes(fixture.electionId)).electionBallots.length,
    0,
  );
});

test('a duplicated candidate is rejected', async () => {
  const fixture = await createVotingFixture({
    election: { minSelections: 2, maxSelections: 3 },
  });
  const candidateId = fixture.candidateIds[0]!;

  const result = await castPublicVote(fixture.credentialId, [
    candidateId,
    candidateId,
  ]);

  assert.deepEqual(result, { type: 'invalidSelections' });
  assert.equal(
    (await readElectionVotes(fixture.electionId)).electionBallots.length,
    0,
  );
});

test('a candidate from another election is rejected', async () => {
  const fixture = await createVotingFixture({
    election: { minSelections: 2, maxSelections: 2 },
  });
  const otherElectionId = await createElection();
  const otherCandidateId = await createParticipant(
    otherElectionId,
    'Candidata doutra votación',
  );

  const result = await castPublicVote(fixture.credentialId, [
    fixture.candidateIds[0]!,
    otherCandidateId,
  ]);

  assert.deepEqual(result, { type: 'invalidSelections' });
  assert.equal(
    (await readElectionVotes(fixture.electionId)).electionBallots.length,
    0,
  );
});

test('a participant who cannot be a candidate is rejected', async () => {
  const fixture = await createVotingFixture({
    election: { minSelections: 2, maxSelections: 2 },
  });
  const ineligibleId = await createParticipant(
    fixture.electionId,
    'Non candidata',
    { canBeCandidate: false },
  );

  const result = await castPublicVote(fixture.credentialId, [
    fixture.candidateIds[0]!,
    ineligibleId,
  ]);

  assert.deepEqual(result, { type: 'invalidSelections' });
  assert.equal(
    (await readElectionVotes(fixture.electionId)).electionBallots.length,
    0,
  );
});

test('prohibited self-voting is rejected on submit', async () => {
  const fixture = await createVotingFixture({
    election: {
      minSelections: 1,
      maxSelections: 1,
      allowSelfVote: false,
    },
  });

  const result = await castPublicVote(fixture.credentialId, [fixture.voterId]);

  assert.deepEqual(result, { type: 'invalidSelections' });
  assert.equal(
    (await readElectionVotes(fixture.electionId)).electionBallots.length,
    0,
  );
});

test('allowed self-voting is accepted', async () => {
  const fixture = await createVotingFixture({
    election: {
      minSelections: 1,
      maxSelections: 1,
      allowSelfVote: true,
    },
  });

  const result = await castPublicVote(fixture.credentialId, [fixture.voterId]);
  const votes = await readElectionVotes(fixture.electionId);

  assert.deepEqual(result, { type: 'success' });
  assert.equal(votes.electionBallots.length, 1);
  assert.equal(votes.choices.length, 1);
  assert.equal(votes.choices[0]?.candidateParticipantId, fixture.voterId);
});

test('a valid vote creates one anonymous ballot and exactly N choices', async () => {
  const fixture = await createVotingFixture({
    election: { minSelections: 2, maxSelections: 3 },
  });
  const selectedIds = fixture.candidateIds.slice(0, 2);
  const sessionResponse = await postSessionExchange({ token: fixture.token });
  const session = readSessionFromResponse(sessionResponse);

  const result = await castPublicVote(session.credentialId, selectedIds);
  const votes = await readElectionVotes(fixture.electionId);
  const credential = await readCredential(fixture.credentialId);
  const participant = await readParticipant(fixture.voterId);

  assert.deepEqual(result, { type: 'success' });
  assert.equal(votes.electionBallots.length, 1);
  assert.equal(votes.choices.length, selectedIds.length);
  assert.deepEqual(
    votes.choices.map(({ candidateParticipantId }) => candidateParticipantId).sort(),
    [...selectedIds].sort(),
  );
  assert.equal(credential.status, 'USED');
  assert.equal(credential.revokedAt, null);
  assert.equal(participant.hasVoted, true);
  assert.deepEqual(Object.keys(votes.electionBallots[0]!).sort(), [
    'electionId',
    'id',
  ]);
});

test('an invalid late selection leaves no partial voting data', async () => {
  const fixture = await createVotingFixture({
    election: { minSelections: 2, maxSelections: 2 },
  });
  const ineligibleId = await createParticipant(
    fixture.electionId,
    'Opción retirada',
    { canBeCandidate: false },
  );

  const result = await castPublicVote(fixture.credentialId, [
    fixture.candidateIds[0]!,
    ineligibleId,
  ]);
  const votes = await readElectionVotes(fixture.electionId);

  assert.deepEqual(result, { type: 'invalidSelections' });
  assert.deepEqual(votes, { electionBallots: [], choices: [] });
  assert.equal((await readCredential(fixture.credentialId)).status, 'ACTIVE');
  assert.equal((await readParticipant(fixture.voterId)).hasVoted, false);
});

test('concurrent submits with one credential create exactly one ballot', async () => {
  const fixture = await createVotingFixture({
    election: { minSelections: 1, maxSelections: 1 },
  });
  const selection = [fixture.candidateIds[0]!];

  const results = await Promise.all([
    castPublicVote(fixture.credentialId, selection),
    castPublicVote(fixture.credentialId, selection),
  ]);
  const votes = await readElectionVotes(fixture.electionId);

  assert.deepEqual(
    results.map(({ type }) => type).sort(),
    ['success', 'used'],
  );
  assert.equal(votes.electionBallots.length, 1);
  assert.equal(votes.choices.length, 1);
  assert.equal((await readCredential(fixture.credentialId)).status, 'USED');
  assert.equal((await readParticipant(fixture.voterId)).hasVoted, true);
});

test('regenerating a link invalidates an already open old voting screen', async () => {
  const fixture = await createVotingFixture({
    election: { minSelections: 1, maxSelections: 1 },
  });
  const sessionResponse = await postSessionExchange({ token: fixture.token });
  const oldSession = readSessionFromResponse(sessionResponse);
  const signedOldSession = readSignedSessionFromResponse(
    sessionResponse,
    oldSession.sessionId,
  );
  const rendered = await resolvePublicVotingCredential(
    oldSession.credentialId,
  );
  assert.equal(rendered.type, 'available');

  const regeneration = await regenerateVotingCredential(
    fixture.electionId,
    fixture.voterId,
  );
  assert.equal(regeneration.type, 'success');

  const oldSubmission = await submitPublicVoteWithSession(
    oldSession.sessionId,
    signedOldSession,
    [fixture.candidateIds[0]!],
  );
  const votes = await readElectionVotes(fixture.electionId);

  assert.deepEqual(oldSubmission, { type: 'revoked' });
  assert.deepEqual(votes, { electionBallots: [], choices: [] });
  assert.equal((await readParticipant(fixture.voterId)).hasVoted, false);
});

test('closing and voting serialize on the election lock without a deadlock', async () => {
  const fixture = await createVotingFixture({
    election: { minSelections: 1, maxSelections: 1 },
  });
  let releaseElection!: () => void;
  const electionCanUnlock = new Promise<void>((resolve) => {
    releaseElection = resolve;
  });
  let reportElectionLocked!: () => void;
  const electionLocked = new Promise<void>((resolve) => {
    reportElectionLocked = resolve;
  });
  const blocker = db.transaction(async (tx) => {
    await tx
      .select({ id: elections.id })
      .from(elections)
      .where(eq(elections.id, fixture.electionId))
      .for('update');
    reportElectionLocked();
    await electionCanUnlock;
  });

  await electionLocked;
  let voteSettled = false;
  let closeSettled = false;
  const voting = castPublicVote(fixture.credentialId, [
    fixture.candidateIds[0]!,
  ]).finally(() => {
    voteSettled = true;
  });
  const closing = db
    .transaction((tx) =>
      transitionOpenElectionToClosed(tx, fixture.electionId),
    )
    .finally(() => {
      closeSettled = true;
    });

  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(voteSettled, false);
    assert.equal(closeSettled, false);
  } finally {
    releaseElection();
  }

  await blocker;
  const [voteResult, closeResult] = await Promise.all([voting, closing]);
  const votes = await readElectionVotes(fixture.electionId);

  assert.equal(closeResult.type, 'success');
  if (closeResult.type === 'success') {
    assert.equal(closeResult.closedAt instanceof Date, true);
  }
  assert.equal(
    voteResult.type === 'success' || voteResult.type === 'closed',
    true,
  );
  assert.equal(
    votes.electionBallots.length,
    voteResult.type === 'success' ? 1 : 0,
  );
});

test('a deadline reached after render but before submit rejects the vote', async () => {
  const fixture = await createVotingFixture({
    election: {
      minSelections: 1,
      maxSelections: 1,
      closesAt: new Date(Date.now() + 150),
    },
  });
  const rendered = await resolvePublicVotingCredential(fixture.credentialId);
  assert.equal(rendered.type, 'available');

  await new Promise((resolve) => setTimeout(resolve, 200));
  const result = await castPublicVote(fixture.credentialId, [
    fixture.candidateIds[0]!,
  ]);

  assert.deepEqual(result, { type: 'deadlinePassed' });
  assert.deepEqual(await readElectionVotes(fixture.electionId), {
    electionBallots: [],
    choices: [],
  });
  assert.equal((await readCredential(fixture.credentialId)).status, 'ACTIVE');
  assert.equal((await readParticipant(fixture.voterId)).hasVoted, false);
});

test('database structure preserves the anonymous ballot boundary', async () => {
  const ballotColumns = await db.execute(
    sql<{ columnName: string }>`
      select column_name as "columnName"
      from information_schema.columns
      where table_schema = 'public' and table_name = 'ballots'
      order by column_name
    `,
  );
  const choiceColumns = await db.execute(
    sql<{ columnName: string }>`
      select column_name as "columnName"
      from information_schema.columns
      where table_schema = 'public' and table_name = 'ballot_choices'
      order by column_name
    `,
  );
  const directIdentityBallotForeignKeys = await db.execute(
    sql<{ constraintName: string }>`
      select source_constraint.constraint_name as "constraintName"
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
    ballotColumns.map(({ columnName }) => columnName),
    ['election_id', 'id'],
  );
  assert.deepEqual(
    choiceColumns.map(({ columnName }) => columnName),
    ['ballot_id', 'candidate_participant_id', 'election_id'],
  );
  assert.equal(directIdentityBallotForeignKeys.length, 0);
});
