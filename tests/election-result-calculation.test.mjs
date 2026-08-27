import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateElectionResults } from '../src/lib/election-result-calculation.ts';

const candidates = [
  { id: 'hugo', displayName: 'Hugo Pérez' },
  { id: 'dalton', displayName: 'Dalton' },
  { id: 'manu', displayName: 'Manu' },
  { id: 'jose', displayName: 'Jose' },
  { id: 'david', displayName: 'David' },
];

function choices(votesByCandidate) {
  return Object.entries(votesByCandidate).flatMap(([candidateId, votes]) =>
    Array.from({ length: votes }, () => candidateId),
  );
}

test('all candidates appear, including candidates with zero votes', () => {
  const result = calculateElectionResults({
    numberOfWinners: 1,
    candidates,
    choiceCandidateIds: ['hugo'],
  });

  assert.equal(result.rows.length, candidates.length);
  assert.equal(
    result.rows.find(({ candidateId }) => candidateId === 'david')?.votes,
    0,
  );
});

test('each candidate occurrence in BallotChoices counts as one vote', () => {
  const result = calculateElectionResults({
    numberOfWinners: 1,
    candidates,
    choiceCandidateIds: ['hugo', 'hugo', 'dalton', 'unknown-candidate'],
  });

  assert.equal(
    result.rows.find(({ candidateId }) => candidateId === 'hugo')?.votes,
    2,
  );
  assert.equal(
    result.rows.find(({ candidateId }) => candidateId === 'dalton')?.votes,
    1,
  );
});

test('candidates are ordered by votes descending', () => {
  const result = calculateElectionResults({
    numberOfWinners: 2,
    candidates,
    choiceCandidateIds: choices({ hugo: 3, david: 1, manu: 2 }),
  });

  assert.deepEqual(
    result.rows.map(({ candidateId, votes }) => [candidateId, votes]),
    [
      ['hugo', 3],
      ['manu', 2],
      ['david', 1],
      ['dalton', 0],
      ['jose', 0],
    ],
  );
});

test('equal vote totals share a competitive rank', () => {
  const result = calculateElectionResults({
    numberOfWinners: 3,
    candidates,
    choiceCandidateIds: choices({ hugo: 9, dalton: 8, manu: 8, david: 7 }),
  });

  assert.deepEqual(
    result.rows.map(({ votes, rank }) => [votes, rank]),
    [
      [9, 1],
      [8, 2],
      [8, 2],
      [7, 4],
      [0, 5],
    ],
  );
});

test('the presentation order between tied candidates never elects one', () => {
  const result = calculateElectionResults({
    numberOfWinners: 1,
    candidates: [
      { id: 'z', displayName: 'Zaira' },
      { id: 'a', displayName: 'Aldara' },
    ],
    choiceCandidateIds: ['z', 'a'],
  });

  assert.deepEqual(
    result.rows.map(({ displayName }) => displayName),
    ['Aldara', 'Zaira'],
  );
  assert.deepEqual(
    result.rows.map(({ placement }) => placement),
    ['tied', 'tied'],
  );
  assert.equal(result.tie.affectsSeats, true);
});

test('W=3 with 9, 8, 6, 6 detects a tie for one seat', () => {
  const result = calculateElectionResults({
    numberOfWinners: 3,
    candidates: candidates.slice(0, 4),
    choiceCandidateIds: choices({ hugo: 9, dalton: 8, manu: 6, jose: 6 }),
  });

  assert.deepEqual(result.tie, {
    affectsSeats: true,
    tiedCandidateIds: ['jose', 'manu'],
    seatsAvailableAmongTie: 1,
  });
  assert.deepEqual(
    result.rows.map(({ placement }) => placement),
    ['guaranteed', 'guaranteed', 'tied', 'tied'],
  );
});

test('W=3 with 9, 8, 8, 7 has no ambiguous seat', () => {
  const result = calculateElectionResults({
    numberOfWinners: 3,
    candidates: candidates.slice(0, 4),
    choiceCandidateIds: choices({ hugo: 9, dalton: 8, manu: 8, jose: 7 }),
  });

  assert.equal(result.tie.affectsSeats, false);
  assert.deepEqual(
    result.rows.map(({ placement }) => placement),
    ['elected', 'elected', 'elected', 'none'],
  );
});

test('a multiple tie can affect several remaining seats', () => {
  const result = calculateElectionResults({
    numberOfWinners: 3,
    candidates: candidates.slice(0, 4),
    choiceCandidateIds: choices({ hugo: 9, dalton: 6, manu: 6, jose: 6 }),
  });

  assert.equal(result.tie.affectsSeats, true);
  assert.equal(result.tie.seatsAvailableAmongTie, 2);
  assert.deepEqual(result.tie.tiedCandidateIds, ['dalton', 'jose', 'manu']);
});

test('W greater than or equal to the candidate count does not elect a zero-vote candidate', () => {
  const result = calculateElectionResults({
    numberOfWinners: 3,
    candidates: candidates.slice(0, 2),
    choiceCandidateIds: ['hugo'],
  });

  assert.equal(result.tie.affectsSeats, false);
  assert.deepEqual(
    result.rows.map(({ placement }) => placement),
    ['elected', 'none'],
  );
});

test('zero ballots produces a zero-vote result for every candidate', () => {
  const result = calculateElectionResults({
    numberOfWinners: 1,
    candidates: candidates.slice(0, 3),
    choiceCandidateIds: [],
  });

  assert.deepEqual(
    result.rows.map(({ votes }) => votes),
    [0, 0, 0],
  );
  assert.deepEqual(
    result.rows.map(({ rank }) => rank),
    [1, 1, 1],
  );
  assert.deepEqual(
    result.rows.map(({ placement }) => placement),
    ['none', 'none', 'none'],
  );
});

test('W=3 with 5, 3, 0, 0 assigns only the two supported seats', () => {
  const result = calculateElectionResults({
    numberOfWinners: 3,
    candidates: candidates.slice(0, 4),
    choiceCandidateIds: choices({ hugo: 5, dalton: 3 }),
  });

  assert.equal(result.tie.affectsSeats, false);
  assert.deepEqual(
    result.rows.map(({ votes, placement }) => [votes, placement]),
    [
      [5, 'elected'],
      [3, 'elected'],
      [0, 'none'],
      [0, 'none'],
    ],
  );
});

test('W=3 with 9, 8, 0, 0 does not create a cutoff tie at zero', () => {
  const result = calculateElectionResults({
    numberOfWinners: 3,
    candidates: candidates.slice(0, 4),
    choiceCandidateIds: choices({ hugo: 9, dalton: 8 }),
  });

  assert.equal(result.tie.affectsSeats, false);
  assert.deepEqual(
    result.rows.map(({ placement }) => placement),
    ['elected', 'elected', 'none', 'none'],
  );
});

test('W=3 with 9, 8, 8, 0 assigns all three supported seats', () => {
  const result = calculateElectionResults({
    numberOfWinners: 3,
    candidates: candidates.slice(0, 4),
    choiceCandidateIds: choices({ hugo: 9, dalton: 8, manu: 8 }),
  });

  assert.equal(result.tie.affectsSeats, false);
  assert.deepEqual(
    result.rows.map(({ placement }) => placement),
    ['elected', 'elected', 'elected', 'none'],
  );
});

test('W=3 with four candidates on one vote keeps a real cutoff tie', () => {
  const result = calculateElectionResults({
    numberOfWinners: 3,
    candidates: candidates.slice(0, 4),
    choiceCandidateIds: choices({ hugo: 1, dalton: 1, manu: 1, jose: 1 }),
  });

  assert.equal(result.tie.affectsSeats, true);
  assert.equal(result.tie.seatsAvailableAmongTie, 3);
  assert.deepEqual(
    result.rows.map(({ placement }) => placement),
    ['tied', 'tied', 'tied', 'tied'],
  );
});
