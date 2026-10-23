'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const sl = require('../js/core.js');

const crit = (o) => Object.assign(sl.defaultCriteria(), o);
const kw = (s) => sl.parseKeywords(s);

test('parseKeywords: separators, alternatives, duplicates, labels', () => {
  const k = kw('Java, spring boot\nJS|JavaScript;  java ');
  assert.deepEqual(
    k.map((x) => x.label),
    ['Java', 'spring boot', 'JS / JavaScript'],
  );
  assert.deepEqual(k[2].alts, ['js', 'javascript']);
  assert.deepEqual(kw(''), []);
  assert.equal(kw('a, A').length, 1);
});

test('hasKeyword: whole words, symbols, phrases', () => {
  assert.equal(sl.hasKeyword('Worked in Java and SQL', kw('java')[0]), true);
  assert.equal(sl.hasKeyword('JavaScript developer', kw('java')[0]), false, 'java is not a part of javascript');
  assert.equal(sl.hasKeyword('Expert in C++ and C#', kw('c++')[0]), true);
  assert.equal(sl.hasKeyword('Expert in C and Go', kw('c++')[0]), false);
  assert.equal(sl.hasKeyword('uses Node.js daily', kw('node.js')[0]), true);
  assert.equal(sl.hasKeyword('built .NET apps', kw('.net')[0]), true);
  assert.equal(sl.hasKeyword('Led customer success team', kw('customer success')[0]), true);
  assert.equal(sl.hasKeyword('led  customer\n success', kw('customer success')[0]), true, 'whitespace is normalised');
  assert.equal(sl.hasKeyword('React developer', kw('js|react')[0]), true, 'alternatives');
  assert.equal(sl.hasKeyword('', kw('x')[0]), false);
});

test('parseYears', () => {
  assert.equal(sl.parseYears(5), 5);
  assert.equal(sl.parseYears('5'), 5);
  assert.equal(sl.parseYears('5.5 years'), 5.5);
  assert.equal(sl.parseYears('5+ yrs'), 5);
  assert.equal(sl.parseYears('3 yrs 6 months'), 3.5);
  assert.equal(sl.parseYears('8 months'), 8 / 12);
  assert.equal(sl.parseYears(''), null);
  assert.equal(sl.parseYears('fresher'), null);
  assert.equal(sl.parseYears(-1), null);
});

test('parseNoticeDays', () => {
  assert.equal(sl.parseNoticeDays('30'), 30);
  assert.equal(sl.parseNoticeDays('30 days'), 30);
  assert.equal(sl.parseNoticeDays('2 months'), 60);
  assert.equal(sl.parseNoticeDays('8 weeks'), 56);
  assert.equal(sl.parseNoticeDays('Immediate'), 0);
  assert.equal(sl.parseNoticeDays('serving notice'), null);
  assert.equal(sl.parseNoticeDays(''), null);
  assert.equal(sl.parseNoticeDays(45), 45);
});

test('rowsToCandidates: header variants, text assembled from skills and resume, blind refs', () => {
  const r = sl.rowsToCandidates([
    ['Candidate Name', 'Total Experience', 'Notice Period', 'City', 'Key Skills', 'Profile', 'Phone'],
    ['Asha', '5 years', '30 days', 'Pune', 'Java, SQL', 'Built payments', '999'],
    ['', '', '', '', 'Go', '', ''],
  ]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.candidates.length, 2);
  assert.deepEqual(r.candidates[0], {
    ref: 'C001',
    name: 'Asha',
    years: 5,
    noticeDays: 30,
    location: 'Pune',
    text: 'Java, SQL \n Built payments',
  });
  assert.equal(r.candidates[1].name, 'Candidate 2');
  assert.equal(r.candidates[1].years, null);
  assert.ok(!('phone' in r.candidates[0]), 'unknown columns are not kept');
  assert.match(
    sl.rowsToCandidates([
      ['Name', 'City'],
      ['A', 'B'],
    ]).errors[0],
    /No Skills or Resume/,
  );
  assert.match(sl.rowsToCandidates([['Name']]).errors[0], /header row/);
  assert.equal(
    sl.rowsToCandidates([
      ['ID', 'Skills'],
      ['E7', 'x'],
    ]).candidates[0].ref,
    'E7',
  );
});

const base = { ref: 'C001', name: 'A', years: 5, noticeDays: 30, location: 'Pune', text: 'Java Spring SQL AWS' };

test('scoreCandidate: musts, nice, experience, logistics add up to 100 when all met', () => {
  const r = sl.scoreCandidate(
    base,
    crit({ must: kw('Java, SQL'), nice: kw('AWS'), minYears: 3, maxYears: 8, maxNoticeDays: 60, locations: ['pune'] }),
  );
  assert.equal(r.score, 100);
  assert.equal(r.status, 'Shortlist');
  assert.match(r.reasons.join(' | '), /Has Java, SQL.*Bonus: AWS.*5 years fits the range/);
});

test('scoreCandidate: weights rescale when parts are not used', () => {
  assert.equal(sl.scoreCandidate(base, crit({ must: kw('java') })).score, 100);
  assert.equal(sl.scoreCandidate(base, crit({ must: kw('java, python') })).score, 50);
});

test('statuses: one missing must = Maybe, two = Not a match, avoid word = Not a match', () => {
  const one = sl.scoreCandidate(base, crit({ must: kw('java, python') }));
  assert.equal(one.status, 'Maybe');
  assert.match(one.reasons.join(' '), /Missing python/);
  assert.equal(sl.scoreCandidate(base, crit({ must: kw('python, go, java') })).status, 'Not a match');
  const av = sl.scoreCandidate(base, crit({ must: kw('java'), avoid: kw('spring') }));
  assert.equal(av.status, 'Not a match');
  assert.match(av.reasons.join(' '), /avoid list/);
  assert.equal(
    sl.scoreCandidate(base, crit({ must: kw('java'), nice: kw('python, go, rust'), shortlistScore: 90 })).status,
    'Maybe',
    'below the bar',
  );
});

test('experience limits', () => {
  const low = sl.scoreCandidate(Object.assign({}, base, { years: 1 }), crit({ must: kw('java'), minYears: 5 }));
  assert.equal(low.status, 'Not a match', 'far below the minimum');
  const slightly = sl.scoreCandidate(Object.assign({}, base, { years: 4 }), crit({ must: kw('java'), minYears: 5 }));
  assert.notEqual(slightly.status, 'Not a match');
  assert.ok(slightly.score < 100);
  const over = sl.scoreCandidate(Object.assign({}, base, { years: 12 }), crit({ must: kw('java'), minYears: 3, maxYears: 8 }));
  assert.match(over.reasons.join(' '), /above the maximum/);
  assert.ok(over.score < 100);
  const unknown = sl.scoreCandidate(Object.assign({}, base, { years: null }), crit({ must: kw('java'), minYears: 3 }));
  assert.ok(unknown.flags.includes('Experience not given'));
});

test('notice and location', () => {
  const r = sl.scoreCandidate(
    Object.assign({}, base, { noticeDays: 90, location: 'Delhi' }),
    crit({ must: kw('java'), maxNoticeDays: 60, locations: ['pune', 'mumbai'] }),
  );
  assert.match(r.reasons.join(' '), /over the 60-day limit/);
  assert.match(r.reasons.join(' '), /outside the preferred list/);
  assert.ok(r.score < 100);
  const unk = sl.scoreCandidate(
    Object.assign({}, base, { noticeDays: null, location: '' }),
    crit({ must: kw('java'), maxNoticeDays: 60, locations: ['pune'] }),
  );
  assert.deepEqual(unk.flags, ['Notice period not given', 'Location not given']);
});

test('no criteria at all is flagged, never crashes', () => {
  const r = sl.scoreCandidate(base, sl.defaultCriteria());
  assert.equal(r.status, 'Maybe');
  assert.ok(r.flags.includes('No criteria entered'));
});

test('rank: status groups, then score, then ref; names do not influence order', () => {
  const people = [
    { ref: 'C001', name: 'Zed', years: 5, noticeDays: 0, location: '', text: 'java sql' },
    { ref: 'C002', name: 'Amy', years: 5, noticeDays: 0, location: '', text: 'java' },
    { ref: 'C003', name: 'Bob', years: 5, noticeDays: 0, location: '', text: 'python' },
    { ref: 'C004', name: 'Cat', years: 5, noticeDays: 0, location: '', text: 'java sql aws' },
  ];
  const r = sl.rank(people, crit({ must: kw('java, sql'), nice: kw('aws') }));
  assert.deepEqual(
    r.map((x) => x.ref),
    ['C004', 'C001', 'C002', 'C003'],
  );
  assert.deepEqual(
    r.map((x) => x.status),
    ['Shortlist', 'Shortlist', 'Maybe', 'Not a match'],
  );
  const renamed = people.map((p) => Object.assign({}, p, { name: 'X' + p.ref }));
  assert.deepEqual(
    sl.rank(renamed, crit({ must: kw('java, sql'), nice: kw('aws') })).map((x) => x.ref),
    r.map((x) => x.ref),
  );
});

test('toCsv: blind mode drops names; formula safety', () => {
  const res = [{ ref: 'C001', name: '=Evil', status: 'Shortlist', score: 90, reasons: ['Has Java'], flags: [] }];
  const csv = sl.toCsv(res, false);
  assert.ok(csv.startsWith('﻿Ref,Name,Status,Score,Why,Check'));
  assert.match(csv, /'=Evil/);
  const blind = sl.toCsv(res, true);
  assert.ok(blind.startsWith('﻿Ref,Status,Score,Why,Check'));
  assert.doesNotMatch(blind, /Evil/);
});
