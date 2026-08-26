import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterEligibleCandidates,
  orderCandidatesForCredential,
} from '../src/lib/public-voting-candidates.ts';

const candidates = [
  { id: 'candidate-a', displayName: 'Candidata A' },
  { id: 'candidate-b', displayName: 'Candidato B' },
  { id: 'candidate-c', displayName: 'Candidata C' },
  { id: 'candidate-d', displayName: 'Candidato D' },
  { id: 'candidate-e', displayName: 'Candidata E' },
];

test('candidate order is stable for the same credential', () => {
  const firstOrder = orderCandidatesForCredential(
    'credential-stable',
    candidates,
  );
  const secondOrder = orderCandidatesForCredential(
    'credential-stable',
    candidates,
  );

  assert.deepEqual(secondOrder, firstOrder);
});

test('candidate order contains every candidate exactly once', () => {
  const ordered = orderCandidatesForCredential('credential-complete', [
    ...candidates,
  ]);

  assert.equal(ordered.length, candidates.length);
  assert.deepEqual(
    ordered.map(({ id }) => id).sort(),
    candidates.map(({ id }) => id).sort(),
  );
  assert.equal(new Set(ordered.map(({ id }) => id)).size, candidates.length);
});

test('different credentials can produce different candidate orders', () => {
  const distinctOrders = new Set(
    Array.from({ length: 16 }, (_, index) =>
      orderCandidatesForCredential(`credential-${index}`, candidates)
        .map(({ id }) => id)
        .join(','),
    ),
  );

  assert.equal(distinctOrders.size > 1, true);
});

test('self-voting exclusion removes an eligible voter-candidate', () => {
  const eligible = filterEligibleCandidates(
    candidates.map((candidate) => ({
      ...candidate,
      canBeCandidate: true,
    })),
    { id: 'candidate-c', canBeCandidate: true },
    false,
  );

  assert.equal(eligible.some(({ id }) => id === 'candidate-c'), false);
  assert.equal(eligible.length, candidates.length - 1);
});

test('a voter who is not a candidate does not remove a candidate', () => {
  const eligible = filterEligibleCandidates(
    candidates.map((candidate) => ({
      ...candidate,
      canBeCandidate: true,
    })),
    { id: 'voter-not-candidate', canBeCandidate: false },
    false,
  );

  assert.deepEqual(eligible, candidates);
});
