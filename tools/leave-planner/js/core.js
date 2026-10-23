/**
 * Leave & Holiday Planner - core logic (pure; SheetJS is only used by the UI to read a file).
 *
 * Dates are ISO strings ("2026-11-08"). Working days exclude weekends and listed holidays.
 * A leave entry is { employee, type, start, end, halfStart, halfEnd }; a half day at the start
 * or end of a leave counts 0.5.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.LeaveCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const DAY = 86400000;
  const t = (iso) => OT.parseIsoDate(iso);
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

  /**
   * Holiday lines: "2026-11-08 Diwali" or "08/11/2026 Diwali" (one per line; "#" starts a comment).
   * Returns { map: { "2026-11-08": "Diwali" }, errors: [...] }.
   */
  function parseHolidays(text) {
    const map = {};
    const errors = [];
    String(text || '')
      .split(/\r?\n/)
      .forEach((raw, i) => {
        const line = raw.trim();
        if (!line || line[0] === '#') return;
        const m = /^(\S+)\s+(.+)$/.exec(line);
        const d = m ? OT.toIsoDate(m[1]) : '';
        if (!d) return errors.push('Line ' + (i + 1) + ': start with a date such as 2026-11-08 or 08/11/2026, then the holiday name.');
        map[d] = m[2].trim();
      });
    return { map: map, errors: errors };
  }

  /** "Name, Team" lines -> [{ name, team }] (team optional). Duplicate names are reported. */
  function parseRoster(text) {
    const people = [];
    const errors = [];
    const seen = new Set();
    String(text || '')
      .split(/\r?\n/)
      .forEach((raw, i) => {
        const line = raw.trim();
        if (!line || line[0] === '#') return;
        const parts = line.split(/[,\t]/).map((x) => x.trim());
        const name = parts[0];
        if (!name) return;
        if (seen.has(name.toLowerCase())) return errors.push('Line ' + (i + 1) + ': ' + name + ' is listed twice.');
        seen.add(name.toLowerCase());
        people.push({ name: name, team: parts[1] || 'Everyone' });
      });
    return { people: people, errors: errors };
  }

  /** "Casual Leave, 12" lines -> { "Casual Leave": 12 } */
  function parseEntitlements(text) {
    const out = {};
    const errors = [];
    String(text || '')
      .split(/\r?\n/)
      .forEach((raw, i) => {
        const line = raw.trim();
        if (!line || line[0] === '#') return;
        const m = /^(.+?)[,\t]\s*(\d+(?:\.\d+)?)$/.exec(line);
        if (!m)
          return errors.push('Line ' + (i + 1) + ': write the leave type, a comma and the days per year, for example "Casual Leave, 12".');
        out[m[1].trim()] = Number(m[2]);
      });
    return { map: out, errors: errors };
  }

  const isWeekend = (ms, weekend) => weekend.indexOf(new Date(ms).getUTCDay()) !== -1;

  /** Is this date a working day? opts: { holidays: map, weekend: [0, 6] } */
  function isWorkingDay(date, opts) {
    const o = opts || {};
    const ms = t(date);
    return !isWeekend(ms, o.weekend || [0, 6]) && !(o.holidays && o.holidays[date]);
  }

  /**
   * Working days used by a leave from start to end (inclusive). opts: { holidays, weekend, halfStart, halfEnd }.
   * A half day removes 0.5 from the first/last day if that day is a working day.
   */
  function leaveDays(start, end, opts) {
    const o = opts || {};
    const a = t(start);
    const b = t(end);
    if (b < a) throw new Error('The end date is before the start date.');
    if ((b - a) / DAY > 366) throw new Error('A single leave can be at most one year.');
    let n = 0;
    for (let ms = a; ms <= b; ms += DAY) {
      const d = iso(ms);
      if (!isWorkingDay(d, o)) continue;
      let v = 1;
      if (ms === a && o.halfStart) v -= 0.5;
      if (ms === b && o.halfEnd && !(ms === a && o.halfStart)) v -= 0.5;
      n += v;
    }
    return n;
  }

  /** Rows from a spreadsheet (array of arrays with a header row) -> { entries, errors }. Columns: Employee, Type, Start, End (any order). */
  function entriesFromRows(aoa) {
    const rows = (aoa || []).filter((r) => Array.isArray(r) && r.some((c) => String(c).trim() !== ''));
    if (!rows.length) return { entries: [], errors: ['The file is empty.'] };
    const head = rows[0].map((h) => String(h).trim().toLowerCase());
    const col = (names) => head.findIndex((h) => names.indexOf(h) !== -1);
    const ci = {
      employee: col(['employee', 'name', 'employee name']),
      type: col(['type', 'leave type']),
      start: col(['start', 'from', 'start date', 'from date']),
      end: col(['end', 'to', 'end date', 'to date']),
    };
    const missing = Object.keys(ci).filter((k) => ci[k] === -1);
    if (missing.length)
      return { entries: [], errors: ['Missing column(s): ' + missing.join(', ') + '. Use the headers Employee, Type, Start, End.'] };
    const entries = [];
    const errors = [];
    rows.slice(1).forEach((r, i) => {
      const start = OT.toIsoDate(r[ci.start]);
      const end = OT.toIsoDate(r[ci.end]) || start;
      const employee = String(r[ci.employee]).trim();
      if (!employee || !start) return errors.push('Row ' + (i + 2) + ': needs an employee and a valid start date.');
      if (end < start) return errors.push('Row ' + (i + 2) + ': the end date is before the start date.');
      entries.push({
        employee: employee,
        type: String(r[ci.type] || '').trim() || 'Leave',
        start: start,
        end: end,
        halfStart: false,
        halfEnd: false,
      });
    });
    return { entries: entries, errors: errors };
  }

  /** Clip a leave to a calendar year (inclusive) and count its working days; 0 when it falls outside. */
  function daysInYear(entry, year, opts) {
    const ys = year + '-01-01';
    const ye = year + '-12-31';
    const s = entry.start < ys ? ys : entry.start;
    const e = entry.end > ye ? ye : entry.end;
    if (e < s) return 0;
    return leaveDays(s, e, {
      holidays: (opts || {}).holidays,
      weekend: (opts || {}).weekend,
      halfStart: s === entry.start && entry.halfStart,
      halfEnd: e === entry.end && entry.halfEnd,
    });
  }

  /**
   * Balance per employee and leave type for a year.
   * Returns [{ employee, team, rows: [{ type, entitled, used, remaining, over }], totalUsed }]
   * Leave types used but not listed in the entitlements get entitled = null.
   */
  function balances(people, entries, entitlements, year, opts) {
    const types = Object.keys(entitlements);
    entries.forEach((e) => types.indexOf(e.type) === -1 && types.push(e.type));
    const names = people.map((p) => p.name);
    entries.forEach((e) => names.indexOf(e.employee) === -1 && names.push(e.employee));
    return names.map((name) => {
      const person = people.find((p) => p.name === name);
      const rows = types.map((type) => {
        const used = entries.filter((e) => e.employee === name && e.type === type).reduce((a, e) => a + daysInYear(e, year, opts), 0);
        const entitled = type in entitlements ? entitlements[type] : null;
        return {
          type: type,
          entitled: entitled,
          used: used,
          remaining: entitled === null ? null : entitled - used,
          over: entitled !== null && used > entitled,
        };
      });
      return { employee: name, team: person ? person.team : 'Not on roster', rows: rows, totalUsed: rows.reduce((a, r) => a + r.used, 0) };
    });
  }

  /** Employees on leave on a given date (a working day only). */
  function onLeave(entries, date) {
    return Array.from(new Set(entries.filter((e) => e.start <= date && date <= e.end).map((e) => e.employee)));
  }

  /**
   * Days (working days only, inside from..to) when too many people of a team are away.
   * limit: share of the team, 0-1 (for example 0.5 means "half or more"); teams of one person are ignored.
   * Returns [{ date, team, away: [names], size }]
   */
  function clashes(people, entries, from, to, limit, opts) {
    const teams = {};
    people.forEach((p) => (teams[p.team] = (teams[p.team] || []).concat(p.name)));
    const out = [];
    for (let ms = t(from); ms <= t(to); ms += DAY) {
      const d = iso(ms);
      if (!isWorkingDay(d, opts)) continue;
      const away = onLeave(entries, d);
      Object.keys(teams).forEach((team) => {
        const size = teams[team].length;
        if (size < 2) return;
        const who = teams[team].filter((n) => away.indexOf(n) !== -1);
        if (who.length >= 2 && who.length / size >= limit) out.push({ date: d, team: team, away: who, size: size });
      });
    }
    return out;
  }

  /** Same-person leaves that overlap each other (probably a data-entry mistake). */
  function overlaps(entries) {
    const out = [];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];
        if (a.employee === b.employee && a.start <= b.end && b.start <= a.end) out.push({ employee: a.employee, first: a, second: b });
      }
    }
    return out;
  }

  /**
   * Month grid for a team view: rows are people, columns are days.
   * Cell codes: "" working, "W" weekend, "H" holiday, "L" leave (half days "h").
   */
  function monthGrid(people, entries, year, month, opts) {
    const o = opts || {};
    const n = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const days = [];
    for (let d = 1; d <= n; d++) {
      const date = year + '-' + String(month).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      days.push({ day: d, date: date, weekday: new Date(t(date)).getUTCDay(), holiday: (o.holidays || {})[date] || '' });
    }
    const names = people.map((p) => p.name);
    entries.forEach((e) => names.indexOf(e.employee) === -1 && names.push(e.employee));
    const rows = names.map((name) => ({
      name: name,
      cells: days.map((dy) => {
        if (!isWorkingDay(dy.date, o)) return dy.holiday ? 'H' : 'W';
        const e = entries.find((x) => x.employee === name && x.start <= dy.date && dy.date <= x.end);
        if (!e) return '';
        const half = (dy.date === e.start && e.halfStart) || (dy.date === e.end && e.halfEnd);
        return half ? 'h' : 'L';
      }),
    }));
    return { days: days, rows: rows };
  }

  const cell = (v) => {
    const s = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  function balancesCsv(bal) {
    const rows = [['Employee', 'Team', 'Leave type', 'Entitled', 'Used', 'Remaining']];
    bal.forEach((b) =>
      b.rows.forEach((r) =>
        rows.push([b.employee, b.team, r.type, r.entitled === null ? '' : r.entitled, r.used, r.remaining === null ? '' : r.remaining]),
      ),
    );
    return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  }

  function entriesCsv(entries, opts) {
    const rows = [['Employee', 'Type', 'Start', 'End', 'Half day at start', 'Half day at end', 'Working days']];
    entries.forEach((e) =>
      rows.push([
        e.employee,
        e.type,
        e.start,
        e.end,
        e.halfStart ? 'Yes' : '',
        e.halfEnd ? 'Yes' : '',
        leaveDays(e.start, e.end, Object.assign({}, opts, { halfStart: e.halfStart, halfEnd: e.halfEnd })),
      ]),
    );
    return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  }

  return {
    parseHolidays: parseHolidays,
    parseRoster: parseRoster,
    parseEntitlements: parseEntitlements,
    isWorkingDay: isWorkingDay,
    leaveDays: leaveDays,
    entriesFromRows: entriesFromRows,
    daysInYear: daysInYear,
    balances: balances,
    onLeave: onLeave,
    clashes: clashes,
    overlaps: overlaps,
    monthGrid: monthGrid,
    balancesCsv: balancesCsv,
    entriesCsv: entriesCsv,
  };
});
