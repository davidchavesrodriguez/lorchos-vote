import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateElectionReadiness } from '../src/lib/election-readiness.ts';
import { getElectionStatusLabel } from '../src/lib/election-status.ts';

const baseElection = {
  numberOfWinners: 1,
  maxSelections: 1,
  allowSelfVote: true,
  minimumTurnout: null,
};

const voter = { canVote: true, canBeCandidate: false };
const candidate = { canVote: false, canBeCandidate: true };
const voterCandidate = { canVote: true, canBeCandidate: true };

test('an election without a census is not ready', () => {
  const result = calculateElectionReadiness(baseElection, []);

  assert.equal(result.voterCount, 0);
  assert.equal(result.candidateCount, 0);
  assert.equal(result.hasVoters, false);
  assert.equal(result.hasCandidates, false);
  assert.equal(result.ready, false);
});

test('candidates without voters are rejected', () => {
  const result = calculateElectionReadiness(baseElection, [candidate]);

  assert.equal(result.hasCandidates, true);
  assert.equal(result.hasVoters, false);
  assert.equal(result.ready, false);
});

test('voters without candidates are rejected', () => {
  const result = calculateElectionReadiness(baseElection, [voter]);

  assert.equal(result.hasVoters, true);
  assert.equal(result.hasCandidates, false);
  assert.equal(result.ready, false);
});

test('more winners than candidates are rejected', () => {
  const result = calculateElectionReadiness(
    { ...baseElection, numberOfWinners: 2 },
    [voter, candidate],
  );

  assert.equal(result.hasEnoughCandidatesForWinners, false);
  assert.equal(result.ready, false);
});

test('an unreachable minimum turnout is rejected', () => {
  const result = calculateElectionReadiness(
    { ...baseElection, minimumTurnout: 2 },
    [voter, candidate],
  );

  assert.equal(result.isMinimumTurnoutReachable, false);
  assert.equal(result.ready, false);
});

test('self-voting allows all candidates to remain eligible', () => {
  const result = calculateElectionReadiness(
    { ...baseElection, maxSelections: 2, allowSelfVote: true },
    [voterCandidate, candidate],
  );

  assert.equal(result.allVotersHaveEnoughEligibleCandidates, true);
  assert.equal(result.affectedVoterCount, 0);
  assert.equal(result.ready, true);
});

test('a voter-candidate without enough alternatives is rejected', () => {
  const participants = Array.from({ length: 5 }, () => voterCandidate);
  const result = calculateElectionReadiness(
    { ...baseElection, maxSelections: 5, allowSelfVote: false },
    participants,
  );

  assert.equal(result.candidateCount, 5);
  assert.equal(result.allVotersHaveEnoughEligibleCandidates, false);
  assert.equal(result.affectedVoterCount, 5);
  assert.equal(result.ready, false);
});

test('self-voting disabled is valid with enough alternatives for every voter', () => {
  const result = calculateElectionReadiness(
    { ...baseElection, maxSelections: 2, allowSelfVote: false },
    [voterCandidate, voterCandidate, candidate],
  );

  assert.equal(result.allVotersHaveEnoughEligibleCandidates, true);
  assert.equal(result.affectedVoterCount, 0);
  assert.equal(result.ready, true);
});

test('a voter who is not a candidate does not lose an option', () => {
  const result = calculateElectionReadiness(
    { ...baseElection, maxSelections: 2, allowSelfVote: false },
    [voter, candidate, candidate],
  );

  assert.equal(result.allVotersHaveEnoughEligibleCandidates, true);
  assert.equal(result.affectedVoterCount, 0);
  assert.equal(result.ready, true);
});

test('a candidate who cannot vote counts as a candidate normally', () => {
  const result = calculateElectionReadiness(
    { ...baseElection, numberOfWinners: 2, maxSelections: 2 },
    [voter, candidate, candidate],
  );

  assert.equal(result.voterCount, 1);
  assert.equal(result.candidateCount, 2);
  assert.equal(result.hasEnoughCandidatesForWinners, true);
  assert.equal(result.ready, true);
});

test('number of winners is independent from maximum selections', () => {
  const result = calculateElectionReadiness(
    { ...baseElection, numberOfWinners: 2, maxSelections: 1 },
    [voter, candidate, candidate],
  );

  assert.equal(result.ready, true);
});

test('all election statuses have Galician labels', () => {
  assert.equal(getElectionStatusLabel('DRAFT'), 'Borrador');
  assert.equal(getElectionStatusLabel('READY'), 'Preparada');
  assert.equal(getElectionStatusLabel('OPEN'), 'Aberta');
  assert.equal(getElectionStatusLabel('CLOSED'), 'Pechada');
});
