/**
 * Onboarding & Exit Checklist - core logic (pure; no DOM; "today" is always passed in).
 *
 * A plan is built from a template: every task has an owner team and a day offset from an anchor date
 * (the joining date for onboarding, the last working day for exits). Due dates are calculated and can
 * be moved off weekends. Tasks can be edited, added and ticked off.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.CheckCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const t = (phase, title, owner, offset) => ({ phase: phase, title: title, owner: owner, offset: offset });

  const TEMPLATES = {
    onboarding: {
      title: 'New joiner onboarding',
      anchorLabel: 'Date of joining',
      tasks: [
        t('Before joining', 'Send welcome mail with joining time, place and document list', 'HR', -7),
        t('Before joining', 'Collect identity, education and previous-employer documents', 'HR', -5),
        t('Before joining', 'Start background and reference verification', 'HR', -5),
        t('Before joining', 'Request laptop, email ID and system accounts', 'IT', -5),
        t('Before joining', 'Arrange desk, access card and parking', 'Admin', -3),
        t('Before joining', 'Tell the team about the new joiner and assign a buddy', 'Manager', -2),
        t('Before joining', 'Prepare the first-week plan and goals', 'Manager', -2),
        t('Day 1', 'Welcome, office tour and introductions', 'HR', 0),
        t('Day 1', 'Hand over laptop and confirm logins work', 'IT', 0),
        t('Day 1', 'Sign appointment letter and policy acknowledgements', 'HR', 0),
        t('Day 1', 'Collect bank details and set up payroll', 'Finance', 0),
        t('Day 1', 'Start PF/UAN, insurance and other statutory enrolments', 'HR', 1),
        t('First week', 'Complete security and compliance training', 'IT', 5),
        t('First week', 'Walk through role, tools and expectations', 'Manager', 2),
        t('First week', 'Introduce key stakeholders and teams', 'Manager', 4),
        t('First week', 'Check-in call: how is the first week going?', 'HR', 7),
        t('First 90 days', 'Agree the 30-60-90 day plan', 'Manager', 14),
        t('First 90 days', '30-day check-in', 'Manager', 30),
        t('First 90 days', 'Collect new-joiner feedback on onboarding', 'HR', 30),
        t('First 90 days', '60-day check-in', 'Manager', 60),
        t('First 90 days', 'Probation review and confirmation decision', 'Manager', 90),
      ],
    },
    exit: {
      title: 'Employee exit',
      anchorLabel: 'Last working day',
      tasks: [
        t('Notice period', 'Acknowledge resignation and confirm the last working day', 'HR', -30),
        t('Notice period', 'Agree the handover plan and successor', 'Manager', -28),
        t('Notice period', 'Start knowledge-transfer sessions and documentation', 'Manager', -21),
        t('Notice period', 'Share exit formalities and the clearance checklist', 'HR', -14),
        t('Notice period', 'Schedule the exit interview', 'HR', -10),
        t('Last week', 'Hold the exit interview and record themes', 'HR', -3),
        t('Last week', 'Complete handover sign-off', 'Manager', -2),
        t('Last week', 'Return laptop, access card and other assets', 'Admin', -1),
        t('Last week', 'Clear pending expense claims and advances', 'Finance', -1),
        t('Last day', 'Disable accounts, email forwarding and system access', 'IT', 0),
        t('Last day', 'Announce the departure to the team', 'Manager', 0),
        t('After leaving', 'Process full and final settlement', 'Finance', 30),
        t('After leaving', 'Issue relieving and experience letters', 'HR', 7),
        t('After leaving', 'Guide on PF transfer or withdrawal and Form 16', 'HR', 14),
        t('After leaving', 'Update records and archive the employee file', 'HR', 30),
      ],
    },
  };

  /** Move a weekend date to a weekday. direction: "prev" (to Friday), "next" (to Monday) or "none". */
  function adjustWeekend(iso, direction) {
    const dow = new Date(OT.parseIsoDate(iso)).getUTCDay();
    if (direction === 'none' || (dow !== 0 && dow !== 6)) return iso;
    if (direction === 'prev') return OT.addDays(iso, dow === 6 ? -1 : -2);
    return OT.addDays(iso, dow === 6 ? 2 : 1);
  }

  /**
   * Build a plan. opts: { template: "onboarding"|"exit", anchor: "YYYY-MM-DD", person: "Name", weekends: "auto"|"prev"|"next"|"none" }
   * "auto" moves weekend dates earlier for tasks before the anchor and later for tasks after it.
   */
  function createPlan(opts) {
    const tpl = TEMPLATES[opts.template];
    if (!tpl) throw new Error('Unknown checklist type.');
    const person = String(opts.person || '')
      .trim()
      .slice(0, 80);
    if (!person) throw new Error('Enter the employee name.');
    OT.parseIsoDate(opts.anchor);
    const mode = opts.weekends || 'auto';
    const tasks = tpl.tasks.map((x, i) => {
      const raw = OT.addDays(opts.anchor, x.offset);
      const dir = mode === 'auto' ? (x.offset < 0 ? 'prev' : 'next') : mode;
      return { id: i + 1, phase: x.phase, title: x.title, owner: x.owner, due: adjustWeekend(raw, dir), done: false, note: '' };
    });
    return {
      type: opts.template,
      title: tpl.title,
      person: person,
      anchor: opts.anchor,
      anchorLabel: tpl.anchorLabel,
      nextId: tasks.length + 1,
      tasks: tasks,
    };
  }

  const copy = (p) => JSON.parse(JSON.stringify(p));
  const findTask = (p, id) => {
    const x = p.tasks.find((k) => k.id === id);
    if (!x) throw new Error('No such task.');
    return x;
  };

  function toggle(p, id) {
    const o = copy(p);
    const x = findTask(o, id);
    x.done = !x.done;
    return o;
  }

  function updateTask(p, id, patch) {
    const o = copy(p);
    const x = findTask(o, id);
    if (patch.title !== undefined) {
      const ttl = String(patch.title).trim().slice(0, 150);
      if (!ttl) throw new Error('A task needs a title.');
      x.title = ttl;
    }
    if (patch.owner !== undefined) x.owner = String(patch.owner).trim().slice(0, 40) || 'Unassigned';
    if (patch.due !== undefined) {
      if (patch.due) OT.parseIsoDate(patch.due);
      x.due = patch.due;
    }
    if (patch.note !== undefined) x.note = String(patch.note).slice(0, 300);
    return o;
  }

  function addTask(p, task) {
    const o = copy(p);
    if (o.tasks.length >= 100) throw new Error('Up to 100 tasks.');
    const ttl = String(task.title || '')
      .trim()
      .slice(0, 150);
    if (!ttl) throw new Error('A task needs a title.');
    if (task.due) OT.parseIsoDate(task.due);
    o.tasks.push({
      id: o.nextId++,
      phase: String(task.phase || 'Extra').slice(0, 40),
      title: ttl,
      owner: String(task.owner || 'Unassigned').slice(0, 40),
      due: task.due || '',
      done: false,
      note: '',
    });
    return o;
  }

  function removeTask(p, id) {
    const o = copy(p);
    findTask(o, id);
    o.tasks = o.tasks.filter((x) => x.id !== id);
    return o;
  }

  /** Move every date by the same number of days (for a changed joining date). Done tasks keep their dates. */
  function reschedule(p, newAnchor) {
    const diff = Math.round((OT.parseIsoDate(newAnchor) - OT.parseIsoDate(p.anchor)) / 86400000);
    const o = copy(p);
    o.anchor = newAnchor;
    o.tasks.forEach((x) => {
      if (x.due && !x.done) x.due = OT.addDays(x.due, diff);
    });
    return o;
  }

  /** Progress summary at `today`. */
  function progress(p, today) {
    const total = p.tasks.length;
    const done = p.tasks.filter((x) => x.done).length;
    const open = p.tasks.filter((x) => !x.done);
    const overdue = open.filter((x) => x.due && x.due < today);
    const soonEnd = OT.addDays(today, 7);
    const dueSoon = open.filter((x) => x.due && x.due >= today && x.due <= soonEnd);
    const byOwner = {};
    p.tasks.forEach((x) => {
      const o = (byOwner[x.owner] = byOwner[x.owner] || { total: 0, done: 0, overdue: 0 });
      o.total++;
      if (x.done) o.done++;
      else if (x.due && x.due < today) o.overdue++;
    });
    return {
      total: total,
      done: done,
      percent: total ? Math.round((done / total) * 100) : 0,
      overdue: overdue.length,
      dueSoon: dueSoon.length,
      byOwner: byOwner,
    };
  }

  /** Tasks grouped by phase in the order phases first appear. */
  function byPhase(p) {
    const order = [];
    const map = {};
    p.tasks.forEach((x) => {
      if (!map[x.phase]) {
        map[x.phase] = [];
        order.push(x.phase);
      }
      map[x.phase].push(x);
    });
    return order.map((ph) => ({ phase: ph, tasks: map[ph] }));
  }

  const csvCell = (v) => {
    const s = String(v === null || v === undefined ? '' : v);
    const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };

  function toCsv(p) {
    const rows = [['Phase', 'Task', 'Owner', 'Due', 'Done', 'Note']].concat(
      p.tasks.map((x) => [x.phase, x.title, x.owner, x.due, x.done ? 'Yes' : 'No', x.note]),
    );
    return '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  }

  function toMarkdown(p, today) {
    const pr = progress(p, today);
    const out = [
      '# ' + p.title + ': ' + p.person,
      '',
      p.anchorLabel + ': ' + OT.formatDate(p.anchor) + ' | Progress: ' + pr.done + '/' + pr.total + ' (' + pr.percent + '%)',
      '',
    ];
    byPhase(p).forEach((g) => {
      out.push('## ' + g.phase);
      g.tasks.forEach((x) =>
        out.push('- [' + (x.done ? 'x' : ' ') + '] ' + x.title + ' (' + x.owner + (x.due ? ', due ' + OT.formatDate(x.due) : '') + ')'),
      );
      out.push('');
    });
    return out.join('\n').trimEnd() + '\n';
  }

  const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const fold = (l) => (l.length <= 75 ? l : l.slice(0, 75) + '\r\n' + fold(' ' + l.slice(75)));

  /** All-day calendar events for open tasks with due dates. `stamp` = "YYYYMMDDTHHMMSSZ". */
  function toIcs(p, stamp) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HR Pocket Tools//Onboarding Checklist//EN', 'CALSCALE:GREGORIAN'];
    p.tasks
      .filter((x) => x.due && !x.done)
      .forEach((x) => {
        const s = x.due.replace(/-/g, '');
        lines.push(
          'BEGIN:VEVENT',
          'UID:task-' + p.type + '-' + x.id + '-' + s + '@hr-pocket-tools.local',
          'DTSTAMP:' + stamp,
          'DTSTART;VALUE=DATE:' + s,
          'DTEND;VALUE=DATE:' + OT.addDays(x.due, 1).replace(/-/g, ''),
          'SUMMARY:' + icsEsc('[' + x.owner + '] ' + x.title + ' - ' + p.person),
          'END:VEVENT',
        );
      });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  function serialize(p) {
    return JSON.stringify({ app: 'onboarding-checklist', version: 1, plan: p }, null, 2);
  }

  function parse(text) {
    let d;
    try {
      d = JSON.parse(text);
    } catch (e) {
      throw new Error('That file is not a saved checklist.');
    }
    const p = d && d.app === 'onboarding-checklist' ? d.plan : null;
    if (!p || !Array.isArray(p.tasks) || !TEMPLATES[p.type]) throw new Error('That file is not a saved checklist.');
    OT.parseIsoDate(p.anchor);
    const out = {
      type: p.type,
      title: TEMPLATES[p.type].title,
      person: String(p.person || '').slice(0, 80),
      anchor: p.anchor,
      anchorLabel: TEMPLATES[p.type].anchorLabel,
      nextId: 1,
      tasks: [],
    };
    p.tasks.slice(0, 100).forEach((x) => {
      const ttl = String(x.title || '')
        .trim()
        .slice(0, 150);
      if (!ttl) return;
      let due = '';
      try {
        if (x.due) due = OT.formatDate(x.due) && x.due;
      } catch (e) {
        due = '';
      }
      out.tasks.push({
        id: out.nextId++,
        phase: String(x.phase || 'Extra').slice(0, 40),
        title: ttl,
        owner: String(x.owner || 'Unassigned').slice(0, 40),
        due: due,
        done: !!x.done,
        note: String(x.note || '').slice(0, 300),
      });
    });
    return out;
  }

  return {
    TEMPLATES: TEMPLATES,
    adjustWeekend: adjustWeekend,
    createPlan: createPlan,
    toggle: toggle,
    updateTask: updateTask,
    addTask: addTask,
    removeTask: removeTask,
    reschedule: reschedule,
    progress: progress,
    byPhase: byPhase,
    toCsv: toCsv,
    toMarkdown: toMarkdown,
    toIcs: toIcs,
    serialize: serialize,
    parse: parse,
  };
});
