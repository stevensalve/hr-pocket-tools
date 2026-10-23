/**
 * Headcount Dashboard - core logic (pure; SheetJS is only used by the UI to read a file).
 *
 * Input: one row per employee with a joining date and, for people who left, a last working day.
 * Definitions used everywhere (and shown in the README so everyone reads the numbers the same way):
 *   Headcount on a date  = people at the end of that day: joined on or before the date and whose
 *                          last working day is after it (someone leaving on the 31st is not in the 31st's closing count).
 *   Attrition % (period) = leavers in the period / average headcount x 100,
 *                          where average headcount = (opening + closing) / 2.
 *   Annualised attrition = period attrition x (365 / days in period).
 *   First-year attrition = leavers who left within 365 days of joining / all leavers in the period.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.HeadcountCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const DAY = 86400000;
  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const t = (iso) => OT.parseIsoDate(iso);
  const r1 = (n) => Math.round(n * 10) / 10;

  const HEADERS = {
    id: ['employee id', 'emp id', 'id', 'employee code', 'emp code'],
    dept: ['department', 'dept', 'function', 'team'],
    location: ['location', 'city', 'office', 'work location'],
    grade: ['grade', 'level', 'band'],
    gender: ['gender', 'sex'],
    joined: ['date of joining', 'joining date', 'doj', 'joined', 'start date', 'date joined'],
    left: ['last working day', 'lwd', 'date of leaving', 'exit date', 'left', 'end date', 'date of exit', 'relieving date'],
  };

  /**
   * Spreadsheet rows -> { employees, errors, columns }. Needs a joining-date column; other columns are optional.
   * Names, e-mails and other personal columns are never read.
   */
  function rowsToEmployees(aoa) {
    const rows = (aoa || []).filter((r) => Array.isArray(r) && r.some((c) => norm(c) !== ''));
    if (rows.length < 2) return { employees: [], errors: ['The file needs a header row and at least one employee.'], columns: {} };
    const head = rows[0].map((h) => norm(h).toLowerCase());
    const columns = {};
    Object.keys(HEADERS).forEach((k) => {
      const i = head.findIndex((h) => HEADERS[k].indexOf(h) !== -1);
      if (i !== -1) columns[k] = i;
    });
    if (columns.joined === undefined)
      return { employees: [], errors: ['No joining date column found. Use a header such as "Date of Joining".'], columns: columns };
    const errors = [];
    const employees = [];
    rows.slice(1).forEach((r, i) => {
      const joined = OT.toIsoDate(r[columns.joined]);
      if (!joined) return errors.push('Row ' + (i + 2) + ': joining date missing or not readable.');
      const leftRaw = columns.left !== undefined ? norm(r[columns.left]) : '';
      const left = leftRaw ? OT.toIsoDate(r[columns.left]) : '';
      if (leftRaw && !left) return errors.push('Row ' + (i + 2) + ': last working day not readable.');
      if (left && left < joined) return errors.push('Row ' + (i + 2) + ': last working day is before the joining date.');
      const pick = (k, fallback) => (columns[k] !== undefined && norm(r[columns[k]]) ? norm(r[columns[k]]) : fallback);
      employees.push({
        id: pick('id', 'E' + String(i + 1).padStart(4, '0')),
        dept: pick('dept', 'Unspecified'),
        location: pick('location', 'Unspecified'),
        grade: pick('grade', 'Unspecified'),
        gender: pick('gender', 'Unspecified'),
        joined: joined,
        left: left,
      });
    });
    return { employees: employees, errors: errors, columns: columns };
  }

  /** On the books at the end of `date`: joined by then and not yet gone (last working day after the date). */
  const isActive = (e, date) => e.joined <= date && (!e.left || e.left > date);

  function headcountOn(emps, date) {
    return emps.filter((e) => isActive(e, date)).length;
  }

  /** Count active people on `date` grouped by a field ("dept", "location", "grade", "gender"). Largest first. */
  function breakdown(emps, date, field) {
    const m = {};
    emps.filter((e) => isActive(e, date)).forEach((e) => (m[e[field]] = (m[e[field]] || 0) + 1));
    return Object.keys(m)
      .map((k) => ({ label: k, count: m[k] }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  /** "2026-10" -> ["2026-10-01", "2026-10-31"] */
  function monthRange(ym) {
    const m = /^(\d{4})-(\d{2})$/.exec(ym);
    if (!m || +m[2] < 1 || +m[2] > 12) throw new Error('Months must look like 2026-10.');
    const last = new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate();
    return [ym + '-01', ym + '-' + String(last).padStart(2, '0')];
  }

  const nextMonth = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return m === 12 ? y + 1 + '-01' : y + '-' + String(m + 1).padStart(2, '0');
  };

  /**
   * One row per month from `fromYm` to `toYm` inclusive:
   * { month, opening, joiners, leavers, closing, attritionPct }.
   * opening = headcount on the day before the month starts; closing = headcount on the last day.
   */
  function monthlySeries(emps, fromYm, toYm) {
    monthRange(fromYm);
    monthRange(toYm);
    if (toYm < fromYm) throw new Error('The end month is before the start month.');
    const out = [];
    for (let ym = fromYm, guard = 0; ym <= toYm && guard < 120; ym = nextMonth(ym), guard++) {
      const [s, e] = monthRange(ym);
      const opening = headcountOn(emps, OT.addDays(s, -1));
      const closing = headcountOn(emps, e);
      const joiners = emps.filter((x) => x.joined >= s && x.joined <= e).length;
      const leavers = emps.filter((x) => x.left && x.left >= s && x.left <= e).length;
      const avg = (opening + closing) / 2;
      out.push({
        month: ym,
        opening: opening,
        joiners: joiners,
        leavers: leavers,
        closing: closing,
        attritionPct: avg ? r1((leavers / avg) * 100) : 0,
      });
    }
    return out;
  }

  /**
   * Attrition over a period (inclusive ISO dates). Returns
   * { opening, closing, joiners, leavers, average, attritionPct, annualisedPct, days, firstYearShare }.
   */
  function attrition(emps, from, to) {
    if (to < from) throw new Error('The end date is before the start date.');
    const days = Math.round((t(to) - t(from)) / DAY) + 1;
    const opening = headcountOn(emps, OT.addDays(from, -1));
    const closing = headcountOn(emps, to);
    const leaversList = emps.filter((e) => e.left && e.left >= from && e.left <= to);
    const joiners = emps.filter((e) => e.joined >= from && e.joined <= to).length;
    const average = (opening + closing) / 2;
    const pct = average ? (leaversList.length / average) * 100 : 0;
    const first = leaversList.filter((e) => (t(e.left) - t(e.joined)) / DAY <= 365).length;
    return {
      opening: opening,
      closing: closing,
      joiners: joiners,
      leavers: leaversList.length,
      average: r1(average),
      attritionPct: r1(pct),
      annualisedPct: r1(pct * (365 / days)),
      days: days,
      firstYearShare: leaversList.length ? r1((first / leaversList.length) * 100) : 0,
    };
  }

  /** Attrition by a field over a period: [{ label, leavers, average, attritionPct }] sorted by attrition. Groups smaller than minSize are marked "small". */
  function attritionBy(emps, field, from, to, minSize) {
    const groups = Array.from(new Set(emps.map((e) => e[field])));
    return groups
      .map((g) => {
        const sub = emps.filter((e) => e[field] === g);
        const a = attrition(sub, from, to);
        return {
          label: g,
          leavers: a.leavers,
          average: a.average,
          attritionPct: a.attritionPct,
          small: a.average < (minSize === undefined ? 5 : minSize),
        };
      })
      .filter((x) => x.average > 0 || x.leavers > 0)
      .sort((a, b) => b.attritionPct - a.attritionPct || a.label.localeCompare(b.label));
  }

  /** Tenure of active staff on `date`, in buckets, plus the average in years. */
  function tenure(emps, date) {
    const act = emps.filter((e) => isActive(e, date));
    const buckets = [
      ['Under 1 year', 0, 1],
      ['1 to 2 years', 1, 2],
      ['2 to 5 years', 2, 5],
      ['5 to 10 years', 5, 10],
      ['10+ years', 10, Infinity],
    ].map((b) => ({ label: b[0], min: b[1], max: b[2], count: 0 }));
    let total = 0;
    act.forEach((e) => {
      const y = (t(date) - t(e.joined)) / DAY / 365.25;
      total += y;
      buckets.find((b) => y >= b.min && y < b.max).count++;
    });
    return { buckets: buckets.map((b) => ({ label: b.label, count: b.count })), averageYears: act.length ? r1(total / act.length) : 0 };
  }

  const cell = (v) => {
    const s = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  function seriesCsv(series) {
    const rows = [['Month', 'Opening', 'Joiners', 'Leavers', 'Closing', 'Attrition % (month)']].concat(
      series.map((s) => [s.month, s.opening, s.joiners, s.leavers, s.closing, s.attritionPct]),
    );
    return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  }

  return {
    rowsToEmployees: rowsToEmployees,
    isActive: isActive,
    headcountOn: headcountOn,
    breakdown: breakdown,
    monthRange: monthRange,
    monthlySeries: monthlySeries,
    attrition: attrition,
    attritionBy: attritionBy,
    tenure: tenure,
    seriesCsv: seriesCsv,
  };
});
