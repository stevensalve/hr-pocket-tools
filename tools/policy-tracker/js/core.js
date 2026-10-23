/**
 * Policy Acknowledgement Tracker - core logic (pure; "today" is always passed in).
 *
 * State: { nextId, people: [{ name, team, email }], policies: [{ id, name, due }],
 *          acks: { "<policyId>": { "<person name>": "YYYY-MM-DD" } } }
 * Functions return new state objects.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.PolicyCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const copy = (s) => JSON.parse(JSON.stringify(s));
  const create = () => ({ nextId: 1, people: [], policies: [], acks: {} });
  const MAX_PEOPLE = 1000;
  const MAX_POLICIES = 30;

  /** Lines "Name, Team, Email" (team and email optional) -> { people, errors }. */
  function parsePeople(text) {
    const people = [];
    const errors = [];
    const seen = new Set();
    String(text || '')
      .split(/\r?\n/)
      .forEach((raw, i) => {
        const line = raw.trim();
        if (!line || line[0] === '#') return;
        const parts = line.split(/[,\t]/).map(norm);
        const name = parts[0];
        if (!name) return;
        if (seen.has(name.toLowerCase())) return errors.push('Line ' + (i + 1) + ': ' + name + ' is listed twice.');
        let team = parts[1] || 'Everyone';
        let email = parts[2] || '';
        if (team.indexOf('@') !== -1 && !email) {
          email = team;
          team = 'Everyone';
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errors.push('Line ' + (i + 1) + ': "' + email + '" does not look like an e-mail address (kept without it).');
          email = '';
        }
        seen.add(name.toLowerCase());
        people.push({ name: name.slice(0, 80), team: team.slice(0, 60), email: email });
      });
    return { people: people.slice(0, MAX_PEOPLE), errors: errors };
  }

  /** Spreadsheet rows (header: Name, Team/Department, Email) -> same shape as parsePeople. */
  function peopleFromRows(aoa) {
    const rows = (aoa || []).filter((r) => Array.isArray(r) && r.some((c) => norm(c) !== ''));
    if (rows.length < 2) return { people: [], errors: ['The file needs a header row and at least one person.'] };
    const head = rows[0].map((h) => norm(h).toLowerCase());
    const find = (names) => head.findIndex((h) => names.indexOf(h) !== -1);
    const n = find(['name', 'employee', 'employee name']);
    if (n === -1) return { people: [], errors: ['No Name column found.'] };
    const t = find(['team', 'department', 'dept']);
    const e = find(['email', 'e-mail', 'email id', 'mail']);
    const text = rows
      .slice(1)
      .map((r) => [norm(r[n]), t !== -1 ? norm(r[t]) : '', e !== -1 ? norm(r[e]) : ''].join(', '))
      .join('\n');
    return parsePeople(text);
  }

  /** Replace the people list. Acknowledgements of people who are no longer listed are dropped. */
  function setPeople(s, people) {
    const o = copy(s);
    o.people = people.map((p) => ({ name: p.name, team: p.team || 'Everyone', email: p.email || '' })).slice(0, MAX_PEOPLE);
    const names = new Set(o.people.map((p) => p.name));
    Object.keys(o.acks).forEach((pid) => Object.keys(o.acks[pid]).forEach((who) => !names.has(who) && delete o.acks[pid][who]));
    return o;
  }

  function addPolicy(s, name, due) {
    const n = norm(name).slice(0, 100);
    if (!n) throw new Error('Give the policy a name.');
    if (due) OT.parseIsoDate(due);
    const o = copy(s);
    if (o.policies.length >= MAX_POLICIES) throw new Error('Up to ' + MAX_POLICIES + ' policies.');
    if (o.policies.some((p) => p.name.toLowerCase() === n.toLowerCase())) throw new Error('A policy called "' + n + '" already exists.');
    const p = { id: o.nextId++, name: n, due: due || '' };
    o.policies.push(p);
    o.acks[p.id] = {};
    return o;
  }

  function updatePolicy(s, id, patch) {
    const o = copy(s);
    const p = o.policies.find((x) => x.id === id);
    if (!p) throw new Error('No such policy.');
    if (patch.due !== undefined) {
      if (patch.due) OT.parseIsoDate(patch.due);
      p.due = patch.due;
    }
    if (patch.name !== undefined) {
      const n = norm(patch.name).slice(0, 100);
      if (!n) throw new Error('Give the policy a name.');
      p.name = n;
    }
    return o;
  }

  function removePolicy(s, id) {
    const o = copy(s);
    o.policies = o.policies.filter((p) => p.id !== id);
    delete o.acks[id];
    return o;
  }

  /** Mark (date "YYYY-MM-DD") or clear (null) one person's acknowledgement. */
  function setAck(s, policyId, person, date) {
    const o = copy(s);
    if (!o.policies.some((p) => p.id === policyId)) throw new Error('No such policy.');
    if (!o.people.some((p) => p.name === person)) throw new Error('No such person.');
    o.acks[policyId] = o.acks[policyId] || {};
    if (!date) delete o.acks[policyId][person];
    else {
      OT.parseIsoDate(date);
      o.acks[policyId][person] = date;
    }
    return o;
  }

  /** Mark everybody (or a team) as acknowledged on `date` for one policy. */
  function markAll(s, policyId, date, team) {
    let o = s;
    s.people.filter((p) => !team || p.team === team).forEach((p) => (o = setAck(o, policyId, p.name, date)));
    return o;
  }

  /** Apply "Person, Policy, Date" records (for example exported from another system). Unknown names are reported. */
  function importAcks(s, aoa) {
    const rows = (aoa || []).filter((r) => Array.isArray(r) && r.some((c) => norm(c) !== ''));
    if (rows.length < 2) return { state: s, applied: 0, errors: ['The file needs a header row and at least one record.'] };
    const head = rows[0].map((h) => norm(h).toLowerCase());
    const find = (names) => head.findIndex((h) => names.indexOf(h) !== -1);
    const ci = {
      who: find(['name', 'employee', 'employee name', 'person']),
      pol: find(['policy', 'policy name']),
      date: find(['date', 'acknowledged on', 'signed on', 'acknowledged']),
    };
    if (ci.who === -1 || ci.pol === -1) return { state: s, applied: 0, errors: ['Needed columns: Name and Policy (Date is optional).'] };
    let o = s;
    let applied = 0;
    const errors = [];
    rows.slice(1).forEach((r, i) => {
      const who = norm(r[ci.who]);
      const pol = o.policies.find((p) => p.name.toLowerCase() === norm(r[ci.pol]).toLowerCase());
      const person = o.people.find((p) => p.name.toLowerCase() === who.toLowerCase());
      if (!person) return errors.push('Row ' + (i + 2) + ': ' + (who || 'blank name') + ' is not on the list.');
      if (!pol) return errors.push('Row ' + (i + 2) + ': policy "' + norm(r[ci.pol]) + '" is not on the list.');
      const date = ci.date !== -1 ? OT.toIsoDate(r[ci.date]) : '';
      o = setAck(o, pol.id, person.name, date || '1970-01-01'.replace('1970-01-01', pol.due || '2000-01-01'));
      applied++;
    });
    return { state: o, applied: applied, errors: errors };
  }

  /**
   * Summary at `today`:
   *   policies: [{ id, name, due, acked, total, percent, overdue (bool), pendingCount }]
   *   teams: [{ team, people, acked, possible, percent }]
   *   pending: [{ name, team, email, policies: [{ id, name, due, late }] }] (people with something outstanding; late first)
   */
  function summary(s, today) {
    const total = s.people.length;
    const policies = s.policies.map((p) => {
      const acked = s.people.filter((x) => (s.acks[p.id] || {})[x.name]).length;
      return {
        id: p.id,
        name: p.name,
        due: p.due,
        acked: acked,
        total: total,
        percent: total ? Math.round((acked / total) * 100) : 0,
        overdue: !!p.due && p.due < today && acked < total,
        pendingCount: total - acked,
      };
    });
    const teamNames = Array.from(new Set(s.people.map((p) => p.team)));
    const teams = teamNames.map((team) => {
      const members = s.people.filter((p) => p.team === team);
      const possible = members.length * s.policies.length;
      const acked = members.reduce((a, m) => a + s.policies.filter((p) => (s.acks[p.id] || {})[m.name]).length, 0);
      return {
        team: team,
        people: members.length,
        acked: acked,
        possible: possible,
        percent: possible ? Math.round((acked / possible) * 100) : 0,
      };
    });
    const pending = [];
    s.people.forEach((person) => {
      const list = s.policies
        .filter((p) => !(s.acks[p.id] || {})[person.name])
        .map((p) => ({ id: p.id, name: p.name, due: p.due, late: !!p.due && p.due < today }))
        .sort((a, b) => Number(b.late) - Number(a.late) || (a.due || '9999').localeCompare(b.due || '9999'));
      if (list.length) pending.push({ name: person.name, team: person.team, email: person.email, policies: list });
    });
    pending.sort(
      (a, b) =>
        b.policies.filter((x) => x.late).length - a.policies.filter((x) => x.late).length ||
        b.policies.length - a.policies.length ||
        a.name.localeCompare(b.name),
    );
    return { policies: policies, teams: teams, pending: pending };
  }

  /** Reminder text for one person. */
  function reminderFor(entry, sender) {
    const lines = [
      'Hi ' + entry.name.split(' ')[0] + ',',
      '',
      'A gentle reminder to read and acknowledge the following ' + (entry.policies.length === 1 ? 'policy' : 'policies') + ':',
      '',
    ];
    entry.policies.forEach((p) =>
      lines.push('- ' + p.name + (p.due ? ' (due ' + OT.formatDate(p.due) + (p.late ? ', now overdue' : '') + ')' : '')),
    );
    lines.push(
      '',
      'Please complete this as soon as you can. Reply if you have any questions.',
      '',
      'Thank you' + (sender ? ',\n' + sender : ''),
    );
    return lines.join('\n');
  }

  /** All reminders in one block (separated by lines), optionally only people with overdue items. */
  function remindersText(s, today, opts) {
    const o = Object.assign({ onlyOverdue: false, sender: '' }, opts);
    return summary(s, today)
      .pending.filter((p) => !o.onlyOverdue || p.policies.some((x) => x.late))
      .map((p) => (p.email ? 'To: ' + p.email + '\n' : '') + reminderFor(p, o.sender))
      .join('\n\n----------\n\n');
  }

  const cell = (v) => {
    const t = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+\-@]/.test(t) ? "'" + t : t;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  /** Matrix CSV: one row per person, one column per policy (acknowledged date or blank). */
  function matrixCsv(s) {
    const head = ['Name', 'Team', 'Email'].concat(s.policies.map((p) => p.name + (p.due ? ' (due ' + p.due + ')' : '')));
    const rows = s.people.map((x) => [x.name, x.team, x.email].concat(s.policies.map((p) => (s.acks[p.id] || {})[x.name] || '')));
    return (
      '﻿' +
      [head]
        .concat(rows)
        .map((r) => r.map(cell).join(','))
        .join('\r\n')
    );
  }

  function serialize(s) {
    return JSON.stringify({ app: 'policy-tracker', version: 1, state: s }, null, 2);
  }

  function parse(text) {
    let d;
    try {
      d = JSON.parse(text);
    } catch (e) {
      throw new Error('That file is not a saved tracker.');
    }
    const st = d && d.app === 'policy-tracker' ? d.state : null;
    if (!st || !Array.isArray(st.people) || !Array.isArray(st.policies)) throw new Error('That file is not a saved tracker.');
    let o = setPeople(
      create(),
      parsePeople(
        st.people.map((p) => [p.name, p.team, p.email].map((x) => String(x || '').replace(/[,\n\r\t]/g, ' ')).join(', ')).join('\n'),
      ).people,
    );
    st.policies.slice(0, MAX_POLICIES).forEach((p) => {
      try {
        const oldId = p.id;
        o = addPolicy(o, p.name, p.due && OT.toIsoDate(p.due) ? p.due : '');
        const newId = o.policies[o.policies.length - 1].id;
        const acks = (st.acks && st.acks[oldId]) || {};
        Object.keys(acks).forEach((who) => {
          const dt = OT.toIsoDate(acks[who]);
          if (dt && o.people.some((x) => x.name === who)) o = setAck(o, newId, who, dt);
        });
      } catch (e) {
        /* skip a damaged or duplicate policy */
      }
    });
    return o;
  }

  return {
    create: create,
    parsePeople: parsePeople,
    peopleFromRows: peopleFromRows,
    setPeople: setPeople,
    addPolicy: addPolicy,
    updatePolicy: updatePolicy,
    removePolicy: removePolicy,
    setAck: setAck,
    markAll: markAll,
    importAcks: importAcks,
    summary: summary,
    reminderFor: reminderFor,
    remindersText: remindersText,
    matrixCsv: matrixCsv,
    serialize: serialize,
    parse: parse,
  };
});
