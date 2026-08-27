import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import {
  CLUB_TIME_ZONE,
  formatClubDateTime,
} from '../src/lib/club-time.ts';
import { parseClubDateTime } from '../src/lib/club-date-time.server.ts';

function requireParsedInstant(value) {
  const result = parseClubDateTime(value);

  assert.equal(result.type, 'success');
  if (result.type !== 'success') {
    assert.fail('Expected a valid club date and time');
  }

  return result.instant;
}

test('the club time zone is fixed to Europe/Madrid', () => {
  assert.equal(CLUB_TIME_ZONE, 'Europe/Madrid');
});

test('a summer Galicia civil time converts to the expected UTC instant', () => {
  assert.equal(
    requireParsedInstant('2026-08-30T23:59').toISOString(),
    '2026-08-30T21:59:00.000Z',
  );
});

test('a winter Galicia civil time converts to the expected UTC instant', () => {
  assert.equal(
    requireParsedInstant('2026-12-15T23:59').toISOString(),
    '2026-12-15T22:59:00.000Z',
  );
});

test('an impossible calendar date is rejected', () => {
  assert.deepEqual(parseClubDateTime('2026-02-30T12:00'), {
    type: 'invalidCivilTime',
  });
});

test('a nonexistent Galicia time during the DST jump is rejected', () => {
  assert.deepEqual(parseClubDateTime('2026-03-29T02:30'), {
    type: 'invalidCivilTime',
  });
});

test('an ambiguous Galicia time during the DST rollback is rejected', () => {
  assert.deepEqual(parseClubDateTime('2026-10-25T02:30'), {
    type: 'invalidCivilTime',
  });
});

test('an offset is rejected where a datetime-local value is expected', () => {
  for (const value of [
    '2026-08-30T23:59Z',
    '2026-08-30T23:59+02:00',
  ]) {
    assert.deepEqual(parseClubDateTime(value), {
      type: 'invalidFormat',
    });
  }
});

test('an incomplete datetime-local value is rejected', () => {
  assert.deepEqual(parseClubDateTime('2026-08-30T23'), {
    type: 'invalidFormat',
  });
});

test('the display formatter always renders Galicia time explicitly', () => {
  assert.equal(
    formatClubDateTime('2026-08-30T21:59:00.000Z'),
    '30/08/2026 ás 23:59 · hora de Galicia',
  );
});

function formatInProcessTimeZone(timeZone) {
  const moduleUrl = new URL('../src/lib/club-time.ts', import.meta.url).href;
  const probe = [
    `import { formatClubDateTime } from ${JSON.stringify(moduleUrl)};`,
    "process.stdout.write(formatClubDateTime('2026-12-15T22:59:00.000Z') ?? '');",
  ].join('\n');
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--input-type=module',
      '--eval',
      probe,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, TZ: timeZone },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('the display is independent of the process local time zone', () => {
  const expected = '15/12/2026 ás 23:59 · hora de Galicia';

  assert.equal(formatInProcessTimeZone('UTC'), expected);
  assert.equal(formatInProcessTimeZone('America/New_York'), expected);
});
