import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const bootstrapPagePath = 'src/app/v/page.tsx';
const ballotPagePath = 'src/app/v/papeleta/[sessionId]/page.tsx';

test('there is no public dynamic bearer-token route', () => {
  assert.equal(existsSync('src/app/v/[token]'), false);
  assert.equal(existsSync('src/app/v/papeleta/page.tsx'), false);
  assert.equal(existsSync(ballotPagePath), true);
});

test('/v is exclusively the bootstrap and never reads voting_session', () => {
  const page = readFileSync(bootstrapPagePath, 'utf8');

  assert.match(page, /<VotingBootstrap\s*\/>/);
  assert.equal(page.includes('cookies'), false);
  assert.equal(page.includes('VOTING_SESSION_COOKIE_NAME'), false);
  assert.equal(page.includes('findVotingSession'), false);
  assert.equal(page.includes('resolvePublicVotingCredential'), false);
  assert.equal(page.includes('VoteFlow'), false);
});

test('the dynamic ballot validates sessionId and resolves refresh from cookies', () => {
  const page = readFileSync(ballotPagePath, 'utf8');
  const validation = page.indexOf('hasValidVotingSessionIdStructure(sessionId)');
  const cookieRead = page.indexOf('await cookies()');

  assert.match(page, /export const dynamic = 'force-dynamic'/);
  assert.notEqual(validation, -1);
  assert.notEqual(cookieRead, -1);
  assert.equal(validation < cookieRead, true);
  assert.match(page, /const cookieName = getVotingSessionCookieName\(sessionId\)/);
  assert.match(page, /cookieStore\.get\(cookieName\)\?\.value/);
  assert.match(page, /verifyVotingSession\(signedSession, sessionId\)/);
  assert.equal(page.includes('getAll('), false);
  assert.equal(page.includes(`get('voting_session')`), false);
  assert.match(page, /sessionId=\{sessionId\}/);
  assert.match(page, /resolvePublicVotingCredential\(/);
  assert.match(page, /Abre a ligazón de voto que recibiches\./);
});

test('bootstrap removes the fragment before exchange and opens its session path', () => {
  const bootstrap = readFileSync(
    'src/app/v/voting-bootstrap.tsx',
    'utf8',
  );
  const fragmentRemoval = bootstrap.indexOf('window.history.replaceState');
  const exchange = bootstrap.indexOf('fetch(\'/api/voting/session\'');

  assert.notEqual(fragmentRemoval, -1);
  assert.notEqual(exchange, -1);
  assert.equal(fragmentRemoval < exchange, true);
  assert.match(
    bootstrap,
    /window\.location\.replace\(`\/v\/papeleta\/\$\{result\.sessionId\}`\)/,
  );
  assert.equal(bootstrap.includes('window.location.search'), false);
  assert.equal(bootstrap.includes('URLSearchParams'), false);
});

test('submit is explicitly bound to the page sessionId', () => {
  const voteFlow = readFileSync('src/app/v/vote-flow.tsx', 'utf8');
  const action = readFileSync('src/app/v/actions.ts', 'utf8');

  assert.match(voteFlow, /sessionId: string/);
  assert.match(voteFlow, /submitVote\(sessionId, selectedIds\)/);
  assert.match(
    action,
    /submitVote\(\s*sessionId: string,\s*candidateParticipantIds: string\[\]/,
  );
  assert.match(action, /hasValidVotingSessionIdStructure\(sessionId\)/);
  assert.match(action, /const cookieName = getVotingSessionCookieName\(sessionId\)/);
  assert.match(action, /cookieStore\.get\(cookieName\)\?\.value/);
  assert.equal(action.includes('getAll('), false);
  assert.equal(action.includes('LEGACY_VOTING_SESSION_COOKIE_NAME'), false);
  assert.equal(action.includes(`get('voting_session')`), false);
  assert.match(
    action,
    /submitPublicVoteWithSession\(\s*sessionId,\s*signedSession,/,
  );
});

test('the exchange emits a session-specific cookie and expires only the legacy path', () => {
  const route = readFileSync('src/app/api/voting/session/route.ts', 'utf8');
  const sessions = readFileSync('src/lib/voting-session.ts', 'utf8');

  assert.match(route, /serializeVotingSessionCookie\(/);
  assert.match(route, /serializeLegacyVotingSessionCookieDeletion\(\)/);
  assert.match(sessions, /`voting_session_\$\{sessionId\}`/);
  assert.match(
    sessions,
    /LEGACY_VOTING_SESSION_COOKIE_NAME\}=; Max-Age=0; Path=\/v; HttpOnly; SameSite=Strict/,
  );
});

test('pages, RSC props and submit contain no bearer token', () => {
  const files = [
    'src/app/v/vote-flow.tsx',
    'src/app/v/actions.ts',
    'src/lib/public-voting-session.ts',
    bootstrapPagePath,
    ballotPagePath,
  ];

  for (const file of files) {
    assert.equal(/\btoken\b/i.test(readFileSync(file, 'utf8')), false, file);
  }

  const ballotPage = readFileSync(ballotPagePath, 'utf8');
  assert.equal(ballotPage.includes('searchParams'), false);
});

test('only the exchange boundary hashes the submitted token', () => {
  const publicVoting = readFileSync('src/lib/public-voting.ts', 'utf8');
  const exchange = readFileSync(
    'src/lib/voting-session-exchange.ts',
    'utf8',
  );

  assert.equal(publicVoting.includes('hashVotingToken'), false);
  assert.equal(exchange.includes('hashVotingToken(token)'), true);
});

test('own exchange logs do not include request secrets', () => {
  const route = readFileSync(
    'src/app/api/voting/session/route.ts',
    'utf8',
  );
  const logCalls = route.match(/console\.[a-z]+\([^;]+;/g) ?? [];

  assert.equal(logCalls.length, 1);
  assert.equal(/token|body|hash|credential/i.test(logCalls[0]), false);
});
