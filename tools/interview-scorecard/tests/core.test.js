'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const sc = require('../js/core.js');

function setup() {
  let s = sc.create('Backend Engineer', 'general');
  s = sc.setInterviewers(s, ['Asha', 'Ravi']);
  s = sc.addCandidate(s, 'Neha');
  s = sc.addCandidate(s, 'Omar');
  return s;
}
const ids = (s) => s.criteria.map((c) => c.id);
function rateAll(s, candId, who, score) {
  ids(s).forEach((cid) => (s = sc.setRating(s, candId, cid, who, score)));
  return s;
}

test('create uses presets and falls back to general', () => {
  assert.equal(sc.create('x', 'technical').criteria.length, 5);
  assert.equal(sc.create('x', 'nope').criteria[0].name, 'Role-related skills');
  assert.equal(sc.create('Role').role, 'Role');
  Object.keys(sc.PRESETS).forEach((k) =>
    assert.equal(
      sc.PRESETS[k].reduce((a, r) => a + r[1], 0),
      100,
      k + ' weights sum to 100',
    ),
  );
});

test('interviewers: trimmed, unique, limited, required; removed ones lose their ratings', () => {
  let s = setup();
  assert.deepEqual(s.interviewers, ['Asha', 'Ravi']);
  assert.deepEqual(sc.setInterviewers(s, [' A ', 'A', '', 'B']).interviewers, ['A', 'B']);
  assert.equal(
    sc.setInterviewers(
      s,
      Array.from({ length: 12 }, (_, i) => 'P' + i),
    ).interviewers.length,
    8,
  );
  assert.throws(() => sc.setInterviewers(s, ['', ' ']), /at least one/);
  const c = s.candidates[0].id;
  s = sc.setRating(s, c, ids(s)[0], 'Ravi', 4);
  s = sc.setInterviewers(s, ['Asha']);
  assert.deepEqual(s.candidates[0].ratings[ids(s)[0]], {});
});

test('criteria: add, update, remove, validation', () => {
  let s = setup();
  s = sc.addCriterion(s, ' Leadership ', 10);
  assert.equal(s.criteria.length, 6);
  assert.throws(() => sc.addCriterion(s, '', 10), /name/);
  assert.throws(() => sc.addCriterion(s, 'x', 0), /positive/);
  assert.throws(() => sc.addCriterion(s, 'x', 'abc'), /positive/);
  const id = s.criteria[5].id;
  s = sc.updateCriterion(s, id, { weight: 25, name: 'Leadership skills' });
  assert.equal(s.criteria[5].weight, 25);
  assert.throws(() => sc.updateCriterion(s, 999, {}), /No such/);
  s = sc.removeCriterion(s, id);
  assert.equal(s.criteria.length, 5);
  let one = sc.create('x');
  while (one.criteria.length > 1) one = sc.removeCriterion(one, one.criteria[0].id);
  assert.throws(() => sc.removeCriterion(one, one.criteria[0].id), /at least one/);
  let many = sc.create('x');
  while (many.criteria.length < 15) many = sc.addCriterion(many, 'c' + many.criteria.length, 1);
  assert.throws(() => sc.addCriterion(many, 'extra', 1), /Up to 15/);
});

test('setRating validates and clears', () => {
  let s = setup();
  const [c1] = s.candidates;
  const crit = ids(s)[0];
  assert.throws(() => sc.setRating(s, c1.id, crit, 'Asha', 6), /1 to 5/);
  assert.throws(() => sc.setRating(s, c1.id, crit, 'Asha', 2.5), /1 to 5/);
  assert.throws(() => sc.setRating(s, 999, crit, 'Asha', 3), /No such candidate/);
  assert.throws(() => sc.setRating(s, c1.id, 999, 'Asha', 3), /No such criterion/);
  assert.throws(() => sc.setRating(s, c1.id, crit, 'Bob', 3), /Unknown interviewer/);
  s = sc.setRating(s, c1.id, crit, 'Asha', 4);
  assert.equal(s.candidates[0].ratings[crit].Asha, 4);
  s = sc.setRating(s, c1.id, crit, 'Asha', null);
  assert.equal(s.candidates[0].ratings[crit].Asha, undefined);
});

test('candidateResult: weighted average, normalised over rated criteria', () => {
  let s = sc.create('r', 'general'); // weights 30,20,20,15,15
  s = sc.addCandidate(s, 'A');
  const c = s.candidates[0].id;
  s = sc.setRating(s, c, ids(s)[0], 'Interviewer 1', 5); // weight 30
  s = sc.setRating(s, c, ids(s)[1], 'Interviewer 1', 3); // weight 20
  const r = sc.candidateResult(s, s.candidates[0]);
  assert.equal(r.score, (5 * 30 + 3 * 20) / 50);
  assert.equal(r.percent, Math.round(((4.2 - 1) / 4) * 1000) / 10);
  assert.equal(r.coverage, 2 / 5);
  assert.equal(r.recommendation, 'Incomplete');
});

test('candidateResult: averages interviewers, flags disagreement, recommends', () => {
  let s = setup();
  const c = s.candidates[0].id;
  s = rateAll(s, c, 'Asha', 5);
  s = rateAll(s, c, 'Ravi', 4);
  s = sc.setRating(s, c, ids(s)[0], 'Ravi', 2); // 5 vs 2 on the heaviest criterion
  const r = sc.candidateResult(s, s.candidates[0]);
  assert.deepEqual(r.disagreements, ['Role-related skills']);
  assert.equal(r.perCriterion[0].average, 3.5);
  assert.equal(r.perCriterion[0].spread, 3);
  assert.equal(r.coverage, 1);
  assert.equal(r.recommendation, 'Strong hire');
  assert.equal(sc.candidateResult(s, s.candidates[1]).recommendation, 'Not scored');
  assert.equal(sc.candidateResult(s, s.candidates[1]).score, null);
});

test('recommendation thresholds', () => {
  const rec = (score) => {
    let s = sc.create('r');
    s = sc.setInterviewers(s, ['A']);
    s = sc.addCandidate(s, 'X');
    ids(s).forEach((cid) => (s = sc.setRating(s, s.candidates[0].id, cid, 'A', score)));
    return sc.candidateResult(s, s.candidates[0]).recommendation;
  };
  assert.equal(rec(5), 'Strong hire');
  assert.equal(rec(4), 'Hire');
  assert.equal(rec(3), 'Maybe');
  assert.equal(rec(2), 'No hire');
});

test('ranking: best first, ties share a rank, unscored last', () => {
  let s = setup();
  s = sc.addCandidate(s, 'Priya');
  s = sc.addCandidate(s, 'Zed');
  const [neha, omar, priya] = s.candidates.map((c) => c.id);
  s = rateAll(s, neha, 'Asha', 4);
  s = rateAll(s, omar, 'Asha', 5);
  s = rateAll(s, priya, 'Asha', 4);
  const r = sc.ranking(s);
  assert.deepEqual(
    r.map((x) => x.name),
    ['Omar', 'Neha', 'Priya', 'Zed'],
  );
  assert.deepEqual(
    r.map((x) => x.rank),
    [1, 2, 2, null],
  );
});

test('candidates: validation, notes, removal', () => {
  let s = setup();
  assert.throws(() => sc.addCandidate(s, '  '), /candidate name/);
  s = sc.setNotes(s, s.candidates[0].id, 'Great communicator');
  assert.equal(s.candidates[0].notes, 'Great communicator');
  assert.throws(() => sc.setNotes(s, 999, 'x'), /No such/);
  s = sc.removeCandidate(s, s.candidates[0].id);
  assert.equal(s.candidates.length, 1);
  let big = sc.create('x');
  for (let i = 0; i < 50; i++) big = sc.addCandidate(big, 'c' + i);
  assert.throws(() => sc.addCandidate(big, 'one more'), /Up to 50/);
});

test('toCsv: ranking rows, BOM, quoting, formula safety', () => {
  let s = setup();
  s = sc.setRole(s, 'Role');
  const [neha] = s.candidates;
  s = rateAll(s, neha.id, 'Asha', 4);
  s = sc.setNotes(s, neha.id, '=BAD, "quoted"');
  const csv = sc.toCsv(s);
  assert.ok(csv.startsWith('﻿Rank,Candidate,Weighted score (of 5),Percent,Recommendation,Coverage %,'));
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines.length, 3);
  assert.match(lines[1], /^1,Neha,4\.00,75,Hire,50,/);
  assert.match(lines[1], /"'=BAD, ""quoted"""$/);
  assert.match(lines[2], /^,Omar,,,Not scored,0,/);
});

test('serialize / parse round-trip and hardening', () => {
  let s = setup();
  s = rateAll(s, s.candidates[0].id, 'Asha', 5);
  s = sc.setNotes(s, s.candidates[0].id, 'hello');
  const back = sc.parse(sc.serialize(s));
  assert.equal(back.role, 'Backend Engineer');
  assert.equal(back.candidates.length, 2);
  const r1 = sc.ranking(s)[0];
  const r2 = sc.ranking(back)[0];
  assert.equal(r2.score, r1.score);
  assert.equal(back.candidates[0].notes, 'hello');
  assert.throws(() => sc.parse('nope'), /not a saved scorecard/);
  assert.throws(() => sc.parse('{"app":"x"}'), /not a saved scorecard/);
  const bad = JSON.stringify({
    app: 'interview-scorecard',
    state: { role: 'r', interviewers: ['A'], criteria: [{ id: 1, name: '', weight: 5 }], candidates: [] },
  });
  assert.throws(() => sc.parse(bad), /no usable criteria/);
  const messy = JSON.stringify({
    app: 'interview-scorecard',
    state: {
      role: 'r',
      interviewers: ['A'],
      criteria: [{ id: 7, name: 'K', weight: 5 }],
      candidates: [{ name: 'X', ratings: { 7: { A: 9, B: 3 }, 8: { A: 3 } } }, { name: '' }],
    },
  });
  const m = sc.parse(messy);
  assert.equal(m.candidates.length, 1);
  assert.deepEqual(m.candidates[0].ratings, {});
});
