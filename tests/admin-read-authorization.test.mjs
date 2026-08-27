import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const adminListPage = readFileSync(
  new URL('../src/app/admin/(protected)/page.tsx', import.meta.url),
  'utf8',
);
const electionDetailPage = readFileSync(
  new URL(
    '../src/app/admin/(protected)/elections/[id]/page.tsx',
    import.meta.url,
  ),
  'utf8',
);
const adminResultsReader = readFileSync(
  new URL('../src/lib/admin-election-results.ts', import.meta.url),
  'utf8',
);
const protectedLayout = readFileSync(
  new URL('../src/app/admin/(protected)/layout.tsx', import.meta.url),
  'utf8',
);

function assertAuthBefore(source, sensitiveOperation, label) {
  const authIndex = source.indexOf('await requireAdminSession()');
  const sensitiveIndex = source.indexOf(sensitiveOperation);

  assert.notEqual(authIndex, -1, `${label} must require an admin session`);
  assert.notEqual(
    sensitiveIndex,
    -1,
    `${label} must contain the expected sensitive operation`,
  );
  assert.ok(
    authIndex < sensitiveIndex,
    `${label} must authorize before ${sensitiveOperation}`,
  );
  assert.doesNotMatch(
    source,
    /Promise\.all\(\s*\[\s*requireAdminSession\(\)/,
    `${label} must not start authorization in parallel with reads`,
  );
}

test('the admin election list authorizes before querying the database', () => {
  assertAuthBefore(adminListPage, 'const electionList = await db', 'AdminPage');
});

test('the election detail authorizes before resolving or validating its id', () => {
  assertAuthBefore(
    electionDetailPage,
    'const { id } = await params',
    'ElectionDetailPage',
  );
  assertAuthBefore(
    electionDetailPage,
    'const [election] = await db',
    'ElectionDetailPage',
  );
});

test('the reusable admin results reader authorizes before querying', () => {
  assertAuthBefore(
    adminResultsReader,
    'const [election] = await db',
    'getAdminElectionResults',
  );
});

test('the protected admin layout remains an additional authorization barrier', () => {
  assert.match(protectedLayout, /await requireAdminSession\(\)/);
});
