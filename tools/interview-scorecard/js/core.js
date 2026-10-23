/**
 * Interview Scorecard - core logic (pure; no DOM).
 *
 * State shape:
 *   { role, interviewers: ["Asha", "Ravi"], nextId,
 *     criteria:   [{ id, name, weight }],
 *     candidates: [{ id, name, notes, ratings: { "<criterionId>": { "<interviewer>": 1..5 } } }] }
 * Scores run 1 (weak) to 5 (excellent). Weights are relative; they do not have to add up to 100.
 * All functions return new state objects.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ScoreCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCALE = ['Not rated', 'Weak', 'Below expectations', 'Meets expectations', 'Strong', 'Outstanding'];
  const PRESETS = {
    general: [
      ['Role-related skills', 30],
      ['Problem solving', 20],
      ['Communication', 20],
      ['Culture and values fit', 15],
      ['Experience and potential', 15],
    ],
    technical: [
      ['Technical depth', 30],
      ['Problem solving', 25],
      ['Code or design quality', 20],
      ['Communication', 15],
      ['Team and learning attitude', 10],
    ],
    sales: [
      ['Product and market knowledge', 20],
      ['Communication and persuasion', 30],
      ['Resilience and drive', 20],
      ['Customer focus', 20],
      ['Culture fit', 10],
    ],
    leadership: [
      ['Strategic thinking', 25],
      ['People leadership', 30],
      ['Decision making', 20],
      ['Communication', 15],
      ['Values and integrity', 10],
    ],
  };
  const THRESHOLDS = [
    [4.2, 'Strong hire'],
    [3.6, 'Hire'],
    [3.0, 'Maybe'],
    [0, 'No hire'],
  ];

  function create(role, preset) {
    const rows = PRESETS[preset] || PRESETS.general;
    const s = { role: String(role || ''), interviewers: ['Interviewer 1'], nextId: 1, criteria: [], candidates: [] };
    rows.forEach((r) => s.criteria.push({ id: s.nextId++, name: r[0], weight: r[1] }));
    return s;
  }

  const copy = (s) => JSON.parse(JSON.stringify(s));

  function setRole(s, role) {
    const o = copy(s);
    o.role = String(role).slice(0, 100);
    return o;
  }

  /** Interviewer names: trimmed, unique, 1-8 of them. */
  function setInterviewers(s, names) {
    const list = Array.from(new Set((names || []).map((n) => String(n).trim().slice(0, 40)).filter(Boolean))).slice(0, 8);
    if (!list.length) throw new Error('Add at least one interviewer name.');
    const o = copy(s);
    o.interviewers = list;
    o.candidates.forEach((c) =>
      Object.keys(c.ratings).forEach((cid) => {
        Object.keys(c.ratings[cid]).forEach((who) => {
          if (list.indexOf(who) === -1) delete c.ratings[cid][who];
        });
      }),
    );
    return o;
  }

  function addCriterion(s, name, weight) {
    const n = String(name || '')
      .trim()
      .slice(0, 60);
    if (!n) throw new Error('Give the criterion a name.');
    const w = Number(weight);
    if (!Number.isFinite(w) || w <= 0 || w > 1000) throw new Error('Weight must be a positive number.');
    const o = copy(s);
    if (o.criteria.length >= 15) throw new Error('Up to 15 criteria.');
    o.criteria.push({ id: o.nextId++, name: n, weight: w });
    return o;
  }

  function updateCriterion(s, id, patch) {
    const o = copy(s);
    const c = o.criteria.find((x) => x.id === id);
    if (!c) throw new Error('No such criterion.');
    if (patch.name !== undefined) c.name = String(patch.name).trim().slice(0, 60) || c.name;
    if (patch.weight !== undefined) {
      const w = Number(patch.weight);
      if (!Number.isFinite(w) || w <= 0 || w > 1000) throw new Error('Weight must be a positive number.');
      c.weight = w;
    }
    return o;
  }

  function removeCriterion(s, id) {
    if (s.criteria.length <= 1) throw new Error('Keep at least one criterion.');
    const o = copy(s);
    o.criteria = o.criteria.filter((c) => c.id !== id);
    o.candidates.forEach((c) => delete c.ratings[id]);
    return o;
  }

  function addCandidate(s, name) {
    const n = String(name || '')
      .trim()
      .slice(0, 80);
    if (!n) throw new Error('Enter the candidate name.');
    const o = copy(s);
    if (o.candidates.length >= 50) throw new Error('Up to 50 candidates.');
    o.candidates.push({ id: o.nextId++, name: n, notes: '', ratings: {} });
    return o;
  }

  function removeCandidate(s, id) {
    const o = copy(s);
    o.candidates = o.candidates.filter((c) => c.id !== id);
    return o;
  }

  function setNotes(s, id, notes) {
    const o = copy(s);
    const c = o.candidates.find((x) => x.id === id);
    if (!c) throw new Error('No such candidate.');
    c.notes = String(notes).slice(0, 2000);
    return o;
  }

  /** Record one interviewer's score (1-5) for one criterion; score null or 0 clears it. */
  function setRating(s, candidateId, criterionId, interviewer, score) {
    const o = copy(s);
    const c = o.candidates.find((x) => x.id === candidateId);
    if (!c) throw new Error('No such candidate.');
    if (!o.criteria.some((x) => x.id === criterionId)) throw new Error('No such criterion.');
    if (o.interviewers.indexOf(interviewer) === -1) throw new Error('Unknown interviewer.');
    const key = String(criterionId);
    if (score === null || score === 0 || score === '') {
      if (c.ratings[key]) delete c.ratings[key][interviewer];
      return o;
    }
    const n = Number(score);
    if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error('Scores are whole numbers from 1 to 5.');
    c.ratings[key] = c.ratings[key] || {};
    c.ratings[key][interviewer] = n;
    return o;
  }

  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

  /**
   * Result for one candidate:
   *   perCriterion: [{ id, name, weight, average|null, spread|null, scores: n }]
   *   score: weighted average (1-5) over the criteria that have at least one score, or null
   *   percent: score converted to 0-100 (1 -> 0, 5 -> 100)
   *   coverage: share of (criteria x interviewers) cells that are filled, 0-1
   *   disagreements: criteria where interviewers differ by 2 or more points
   *   recommendation: label from THRESHOLDS ("Incomplete" when coverage is below 50%)
   */
  function candidateResult(s, c) {
    const per = s.criteria.map((cr) => {
      const vals = s.interviewers.map((who) => (c.ratings[cr.id] || {})[who]).filter((v) => v !== undefined);
      return {
        id: cr.id,
        name: cr.name,
        weight: cr.weight,
        average: vals.length ? mean(vals) : null,
        spread: vals.length > 1 ? Math.max.apply(null, vals) - Math.min.apply(null, vals) : null,
        scores: vals.length,
      };
    });
    const scored = per.filter((p) => p.average !== null);
    const wsum = scored.reduce((a, p) => a + p.weight, 0);
    const score = scored.length ? scored.reduce((a, p) => a + p.average * p.weight, 0) / wsum : null;
    const filled = per.reduce((a, p) => a + p.scores, 0);
    const coverage = filled / (s.criteria.length * s.interviewers.length);
    const disagreements = per.filter((p) => p.spread !== null && p.spread >= 2).map((p) => p.name);
    let recommendation = 'Not scored';
    if (score !== null) recommendation = coverage < 0.5 ? 'Incomplete' : THRESHOLDS.find((t) => score >= t[0])[1];
    return {
      id: c.id,
      name: c.name,
      perCriterion: per,
      score: score,
      percent: score === null ? null : Math.round(((score - 1) / 4) * 1000) / 10,
      coverage: coverage,
      disagreements: disagreements,
      recommendation: recommendation,
    };
  }

  /** All candidates ranked best first (unscored last). Ties share a rank. */
  function ranking(s) {
    const rs = s.candidates.map((c) => candidateResult(s, c));
    rs.sort((a, b) => (b.score === null ? -1 : b.score) - (a.score === null ? -1 : a.score) || a.name.localeCompare(b.name));
    let rank = 0;
    let prev;
    rs.forEach((r, i) => {
      const key = r.score === null ? null : Math.round(r.score * 100);
      if (i === 0 || key !== prev) rank = i + 1;
      r.rank = r.score === null ? null : rank;
      prev = key;
    });
    return rs;
  }

  function toCsv(s) {
    const cell = (v) => {
      const t = String(v === null || v === undefined ? '' : v);
      const safe = /^[=+\-@]/.test(t) ? "'" + t : t;
      return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
    };
    const head = ['Rank', 'Candidate', 'Weighted score (of 5)', 'Percent', 'Recommendation', 'Coverage %'].concat(
      s.criteria.map((c) => c.name + ' (avg)'),
      ['Disagreements', 'Notes'],
    );
    const rows = ranking(s).map((r) => {
      const notes = s.candidates.find((c) => c.id === r.id).notes;
      return [
        r.rank === null ? '' : r.rank,
        r.name,
        r.score === null ? '' : r.score.toFixed(2),
        r.percent === null ? '' : r.percent,
        r.recommendation,
        Math.round(r.coverage * 100),
      ].concat(
        r.perCriterion.map((p) => (p.average === null ? '' : p.average.toFixed(2))),
        [r.disagreements.join('; '), notes],
      );
    });
    return (
      '﻿' +
      [head]
        .concat(rows)
        .map((r) => r.map(cell).join(','))
        .join('\r\n')
    );
  }

  function serialize(s) {
    return JSON.stringify({ app: 'interview-scorecard', version: 1, state: s }, null, 2);
  }

  /** Read a saved file, keeping only valid data. */
  function parse(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('That file is not a saved scorecard.');
    }
    const st = data && data.app === 'interview-scorecard' ? data.state : null;
    if (!st || !Array.isArray(st.criteria) || !Array.isArray(st.candidates) || !Array.isArray(st.interviewers))
      throw new Error('That file is not a saved scorecard.');
    let s = { role: String(st.role || '').slice(0, 100), interviewers: [], nextId: 1, criteria: [], candidates: [] };
    s = setInterviewers(Object.assign(s, { interviewers: ['x'] }), st.interviewers.length ? st.interviewers : ['Interviewer 1']);
    const idMap = {};
    st.criteria.slice(0, 15).forEach((c) => {
      const w = Number(c.weight);
      if (!String(c.name || '').trim() || !(w > 0 && w <= 1000)) return;
      s.criteria.push({ id: s.nextId, name: String(c.name).trim().slice(0, 60), weight: w });
      idMap[c.id] = s.nextId++;
    });
    if (!s.criteria.length) throw new Error('The saved scorecard has no usable criteria.');
    st.candidates.slice(0, 50).forEach((c) => {
      if (!String(c.name || '').trim()) return;
      const cand = { id: s.nextId++, name: String(c.name).trim().slice(0, 80), notes: String(c.notes || '').slice(0, 2000), ratings: {} };
      Object.keys(c.ratings || {}).forEach((oldId) => {
        if (!(oldId in idMap)) return;
        Object.keys(c.ratings[oldId] || {}).forEach((who) => {
          const n = Number(c.ratings[oldId][who]);
          if (s.interviewers.indexOf(who) !== -1 && Number.isInteger(n) && n >= 1 && n <= 5) {
            cand.ratings[idMap[oldId]] = cand.ratings[idMap[oldId]] || {};
            cand.ratings[idMap[oldId]][who] = n;
          }
        });
      });
      s.candidates.push(cand);
    });
    return s;
  }

  return {
    SCALE: SCALE,
    PRESETS: PRESETS,
    create: create,
    setRole: setRole,
    setInterviewers: setInterviewers,
    addCriterion: addCriterion,
    updateCriterion: updateCriterion,
    removeCriterion: removeCriterion,
    addCandidate: addCandidate,
    removeCandidate: removeCandidate,
    setNotes: setNotes,
    setRating: setRating,
    candidateResult: candidateResult,
    ranking: ranking,
    toCsv: toCsv,
    serialize: serialize,
    parse: parse,
  };
});
