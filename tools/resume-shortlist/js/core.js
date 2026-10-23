/**
 * Resume Shortlist - core logic (pure; SheetJS is only used by the UI to read a file).
 *
 * Candidates come from a spreadsheet with one row per person. The tool scores each person against
 * criteria you write down (must-have skills, nice-to-have skills, years of experience, notice period,
 * location) and explains every score. It never looks at names, e-mails, gender, age or photos, and it
 * is a first-pass sorting aid: a human makes the decision.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ShortlistCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /**
   * Keywords, one per line or separated by commas. Use | for alternatives: "js|javascript, react".
   * Returns [{ label, alts: [lowercase variants] }] with duplicates removed.
   */
  function parseKeywords(text) {
    const seen = new Set();
    const out = [];
    String(text || '')
      .split(/[\n,;]+/)
      .forEach((raw) => {
        const label = norm(raw);
        if (!label) return;
        const alts = label
          .split('|')
          .map((a) => norm(a).toLowerCase())
          .filter(Boolean);
        const key = alts.join('|');
        if (!alts.length || seen.has(key)) return;
        seen.add(key);
        out.push({ label: label.split('|').map(norm).join(' / '), alts: alts });
      });
    return out;
  }

  /** Does the text contain the keyword (any alternative) as a whole word or phrase? Handles "c++", ".net", "node.js". */
  function hasKeyword(text, kw) {
    const hay = ' ' + String(text).toLowerCase().replace(/\s+/g, ' ') + ' ';
    return kw.alts.some((alt) => new RegExp('(^|[^a-z0-9])' + esc(alt) + '(?![a-z0-9])', 'i').test(hay));
  }

  /** "5", "5.5 years", "5+ yrs", "3 yrs 6 months" -> 5, 5.5, 5, 3.5. Returns null when no number is found. */
  function parseYears(v) {
    if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null;
    const s = norm(v).toLowerCase();
    if (!s) return null;
    const y = /(\d+(?:\.\d+)?)\s*(?:\+)?\s*(?:y|yr|yrs|year|years)\b/.exec(s);
    const m = /(\d+(?:\.\d+)?)\s*(?:m|mo|mos|month|months)\b/.exec(s);
    if (y || m) return (y ? Number(y[1]) : 0) + (m ? Number(m[1]) / 12 : 0);
    const plain = /^(\d+(?:\.\d+)?)\s*\+?$/.exec(s);
    return plain ? Number(plain[1]) : null;
  }

  /** Notice period in days: "30", "30 days", "2 months", "8 weeks", "immediate", "serving notice" (-> null). */
  function parseNoticeDays(v) {
    if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null;
    const s = norm(v).toLowerCase();
    if (!s) return null;
    if (/^(immediate|immediately|nil|none|0|available now|joined)$/.test(s)) return 0;
    const m = /(\d+(?:\.\d+)?)\s*(day|days|d|week|weeks|w|month|months|m)?\b/.exec(s);
    if (!m) return null;
    const n = Number(m[1]);
    const u = m[2] || 'days';
    return Math.round(/^w/.test(u) ? n * 7 : /^m/.test(u) ? n * 30 : n);
  }

  const HEADERS = {
    id: ['id', 'candidate id', 'ref', 'reference'],
    name: ['name', 'candidate', 'candidate name', 'full name'],
    experience: ['experience', 'experience (years)', 'total experience', 'years of experience', 'exp', 'exp (years)'],
    notice: ['notice', 'notice period', 'notice (days)', 'notice period (days)'],
    location: ['location', 'current location', 'city', 'preferred location'],
    skills: ['skills', 'key skills', 'skill set', 'technologies'],
    resume: ['resume', 'resume text', 'profile', 'summary', 'profile summary', 'about', 'cv'],
  };

  /**
   * Spreadsheet rows (array of arrays, first row = headers) -> { candidates, errors, columns }.
   * Recognised headers (case-insensitive): Name, Experience, Notice period, Location, Skills, Resume/Profile/Summary, ID.
   * Every other column is ignored for scoring. Text for keyword search = Skills + Resume columns.
   */
  function rowsToCandidates(aoa) {
    const rows = (aoa || []).filter((r) => Array.isArray(r) && r.some((c) => norm(c) !== ''));
    if (rows.length < 2) return { candidates: [], errors: ['The file needs a header row and at least one candidate.'], columns: {} };
    const head = rows[0].map((h) => norm(h).toLowerCase());
    const columns = {};
    Object.keys(HEADERS).forEach((k) => {
      const i = head.findIndex((h) => HEADERS[k].indexOf(h) !== -1);
      if (i !== -1) columns[k] = i;
    });
    const errors = [];
    if (columns.skills === undefined && columns.resume === undefined)
      errors.push('No Skills or Resume/Profile/Summary column found, so keywords cannot be matched.');
    const candidates = rows.slice(1).map((r, i) => {
      const text = [columns.skills, columns.resume]
        .filter((x) => x !== undefined)
        .map((x) => norm(r[x]))
        .join(' \n ');
      const name = columns.name !== undefined ? norm(r[columns.name]) : '';
      return {
        ref: columns.id !== undefined && norm(r[columns.id]) ? norm(r[columns.id]) : 'C' + String(i + 1).padStart(3, '0'),
        name: name || 'Candidate ' + (i + 1),
        years: columns.experience !== undefined ? parseYears(r[columns.experience]) : null,
        noticeDays: columns.notice !== undefined ? parseNoticeDays(r[columns.notice]) : null,
        location: columns.location !== undefined ? norm(r[columns.location]) : '',
        text: text,
      };
    });
    return { candidates: candidates, errors: errors, columns: columns };
  }

  /**
   * Criteria object: { must: [kw], nice: [kw], avoid: [kw], minYears, maxYears, maxNoticeDays, locations: ["pune", ...], minShortlistScore }
   * Build keyword lists with parseKeywords().
   */
  function defaultCriteria() {
    return { must: [], nice: [], avoid: [], minYears: null, maxYears: null, maxNoticeDays: null, locations: [], shortlistScore: 60 };
  }

  /**
   * Score one candidate (0-100) and explain it.
   *   Must-have skills 45 points, nice-to-have 25, experience fit 20, notice and location 10.
   *   Parts with no criteria are left out and the rest is scaled up, so a short list of criteria still reaches 100.
   * status: "Shortlist" (no must-have missing, score >= shortlistScore, nothing disqualifying)
   *         "Maybe" (one must-have missing or score below the bar)
   *         "Not a match" (two or more must-haves missing, or an avoid-word, or outside the experience limits by a wide margin)
   */
  function scoreCandidate(c, crit) {
    const parts = [];
    const reasons = [];
    const flags = [];
    const missingMust = crit.must.filter((k) => !hasKeyword(c.text, k));
    const foundMust = crit.must.filter((k) => hasKeyword(c.text, k));
    const foundNice = crit.nice.filter((k) => hasKeyword(c.text, k));
    const avoidHit = crit.avoid.filter((k) => hasKeyword(c.text, k));

    if (crit.must.length) {
      parts.push({ weight: 45, value: foundMust.length / crit.must.length });
      if (foundMust.length) reasons.push('Has ' + foundMust.map((k) => k.label).join(', '));
      if (missingMust.length) reasons.push('Missing ' + missingMust.map((k) => k.label).join(', '));
    }
    if (crit.nice.length) {
      parts.push({ weight: 25, value: foundNice.length / crit.nice.length });
      if (foundNice.length) reasons.push('Bonus: ' + foundNice.map((k) => k.label).join(', '));
    }
    let farOutside = false;
    if (crit.minYears !== null || crit.maxYears !== null) {
      let v = 1;
      if (c.years === null) {
        v = 0.5;
        flags.push('Experience not given');
      } else {
        if (crit.minYears !== null && c.years < crit.minYears) {
          v = Math.max(0, c.years / crit.minYears);
          reasons.push(round1(c.years) + ' years is below the minimum of ' + crit.minYears);
          if (c.years < crit.minYears * 0.6) farOutside = true;
        }
        if (crit.maxYears !== null && c.years > crit.maxYears) {
          v = Math.min(v, Math.max(0, 1 - (c.years - crit.maxYears) / crit.maxYears));
          reasons.push(round1(c.years) + ' years is above the maximum of ' + crit.maxYears);
        }
        if (v === 1) reasons.push(round1(c.years) + ' years fits the range');
      }
      parts.push({ weight: 20, value: v });
    }
    const logistics = [];
    if (crit.maxNoticeDays !== null) {
      if (c.noticeDays === null) {
        logistics.push(0.5);
        flags.push('Notice period not given');
      } else if (c.noticeDays <= crit.maxNoticeDays) logistics.push(1);
      else {
        logistics.push(0);
        reasons.push('Notice of ' + c.noticeDays + ' days is over the ' + crit.maxNoticeDays + '-day limit');
      }
    }
    if (crit.locations.length) {
      const loc = c.location.toLowerCase();
      if (!loc) {
        logistics.push(0.5);
        flags.push('Location not given');
      } else if (crit.locations.some((l) => loc.indexOf(l) !== -1)) logistics.push(1);
      else {
        logistics.push(0);
        reasons.push('Location ' + c.location + ' is outside the preferred list');
      }
    }
    if (logistics.length) parts.push({ weight: 10, value: logistics.reduce((a, b) => a + b, 0) / logistics.length });

    const totalWeight = parts.reduce((a, p) => a + p.weight, 0);
    const score = totalWeight ? Math.round((parts.reduce((a, p) => a + p.weight * p.value, 0) / totalWeight) * 100) : 0;
    if (avoidHit.length) reasons.push('Contains ' + avoidHit.map((k) => k.label).join(', ') + ' (avoid list)');

    let status = 'Shortlist';
    if (avoidHit.length || missingMust.length >= 2 || farOutside) status = 'Not a match';
    else if (missingMust.length === 1 || score < crit.shortlistScore) status = 'Maybe';
    if (!totalWeight) {
      status = 'Maybe';
      flags.push('No criteria entered');
    }
    return {
      ref: c.ref,
      name: c.name,
      score: score,
      status: status,
      reasons: reasons,
      flags: flags,
      found: foundMust.length,
      mustTotal: crit.must.length,
    };
  }

  const round1 = (n) => Math.round(n * 10) / 10;
  const ORDER = { Shortlist: 0, Maybe: 1, 'Not a match': 2 };

  /** Score everyone; best first (status group, then score). */
  function rank(cands, crit) {
    return cands
      .map((c) => scoreCandidate(c, crit))
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.score - a.score || a.ref.localeCompare(b.ref));
  }

  const cell = (v) => {
    const s = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  /** CSV of the ranking. With blind = true the name column is left out. */
  function toCsv(results, blind) {
    const head = ['Ref'].concat(blind ? [] : ['Name'], ['Status', 'Score', 'Why', 'Check']);
    const rows = results.map((r) => [r.ref].concat(blind ? [] : [r.name], [r.status, r.score, r.reasons.join('; '), r.flags.join('; ')]));
    return (
      '﻿' +
      [head]
        .concat(rows)
        .map((r) => r.map(cell).join(','))
        .join('\r\n')
    );
  }

  return {
    parseKeywords: parseKeywords,
    hasKeyword: hasKeyword,
    parseYears: parseYears,
    parseNoticeDays: parseNoticeDays,
    rowsToCandidates: rowsToCandidates,
    defaultCriteria: defaultCriteria,
    scoreCandidate: scoreCandidate,
    rank: rank,
    toCsv: toCsv,
  };
});
