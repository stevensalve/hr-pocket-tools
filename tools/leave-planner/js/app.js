/* Leave & Holiday Planner - user interface. All counting and checking lives in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readText, readArrayBuffer, debounce, el } = OT;
  const $ = (id) => document.getElementById(id);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  let entries = [];

  const weekend = () => $('weekend').value.split(',').map(Number);

  function rules() {
    const r = LeaveCore.parseRoster($('roster').value);
    const e = LeaveCore.parseEntitlements($('ent').value);
    const h = LeaveCore.parseHolidays($('hol').value);
    const errors = r.errors.concat(e.errors, h.errors);
    setStatus($('rules-status'), errors.join(' '), errors.length ? 'warn' : '');
    return {
      people: r.people,
      ent: e.map,
      holidays: h.map,
      opts: { holidays: h.map, weekend: weekend() },
      year: parseInt($('year').value, 10) || new Date().getFullYear(),
    };
  }

  function daysOf(e, opts) {
    return LeaveCore.leaveDays(e.start, e.end, {
      holidays: opts.holidays,
      weekend: opts.weekend,
      halfStart: e.halfStart,
      halfEnd: e.halfEnd,
    });
  }

  function render() {
    const R = rules();
    // pick-lists
    const dl = $('emp-list');
    dl.textContent = '';
    R.people.forEach((p) => dl.appendChild(el('option', { value: p.name })));
    const sel = $('l-type');
    const prev = sel.value;
    sel.textContent = '';
    Object.keys(R.ent).forEach((k) => sel.appendChild(el('option', { value: k, text: k })));
    if (prev) sel.value = prev;

    // entries
    const body = $('entries');
    body.textContent = '';
    entries.forEach(function (e, i) {
      const rm = el('button', { type: 'button', text: 'Remove', 'aria-label': 'Remove leave of ' + e.employee + ' from ' + e.start });
      rm.addEventListener('click', () => {
        entries.splice(i, 1);
        render();
      });
      let days = '-';
      try {
        days = String(daysOf(e, R.opts));
      } catch (err) {
        days = '?';
      }
      body.appendChild(
        el('tr', {}, [
          el('td', { text: e.employee }),
          el('td', { text: e.type }),
          el('td', { text: OT.formatDate(e.start, 'dmy') + (e.halfStart ? ' (half)' : '') }),
          el('td', { text: OT.formatDate(e.end, 'dmy') + (e.halfEnd ? ' (half)' : '') }),
          el('td', { text: days }),
          el('td', {}, [rm]),
        ]),
      );
    });
    $('entries-table').hidden = !entries.length;

    // balances
    const bal = LeaveCore.balances(R.people, entries, R.ent, R.year, R.opts);
    const bb = $('bal');
    bb.textContent = '';
    bal.forEach((b) =>
      b.rows.forEach((r) => {
        if (!r.used && !(b.employee && r.entitled !== null)) return;
        bb.appendChild(
          el('tr', {}, [
            el('td', { text: b.employee }),
            el('td', { text: b.team }),
            el('td', { text: r.type }),
            el('td', { text: r.entitled === null ? '-' : String(r.entitled) }),
            el('td', { text: String(r.used) }),
            el('td', { class: r.over ? 'over' : '', text: r.remaining === null ? '-' : String(r.remaining) }),
          ]),
        );
      }),
    );
    $('bal-table').hidden = !bb.children.length;

    // warnings
    const w = $('warnings');
    w.textContent = '';
    const add = (t) => w.appendChild(el('li', { text: t }));
    LeaveCore.overlaps(entries).forEach((o) =>
      add(
        o.employee +
          ' has overlapping leaves (' +
          o.first.start +
          ' to ' +
          o.first.end +
          ' and ' +
          o.second.start +
          ' to ' +
          o.second.end +
          ').',
      ),
    );
    bal.forEach((b) =>
      b.rows
        .filter((r) => r.over)
        .forEach((r) => add(b.employee + ' has used ' + r.used + ' days of ' + r.type + ' but is entitled to ' + r.entitled + '.')),
    );
    const cl = LeaveCore.clashes(R.people, entries, R.year + '-01-01', R.year + '-12-31', parseFloat($('limit').value), R.opts);
    cl.slice(0, 40).forEach((c) =>
      add(
        OT.formatDate(c.date, 'dmy') + ': ' + c.away.length + ' of ' + c.size + ' in ' + c.team + ' are away (' + c.away.join(', ') + ').',
      ),
    );
    if (cl.length > 40) add('...and ' + (cl.length - 40) + ' more days with clashes.');
    if (!w.children.length) add('No warnings.');

    // calendar
    const g = LeaveCore.monthGrid(R.people, entries, R.year, parseInt($('month').value, 10) || 1, R.opts);
    const cal = $('cal');
    cal.textContent = '';
    cal.appendChild(
      el('thead', {}, [
        el('tr', {}, [el('th', { text: 'Name' })].concat(g.days.map((d) => el('th', { text: String(d.day), title: d.holiday || '' })))),
      ]),
    );
    cal.appendChild(
      el(
        'tbody',
        {},
        g.rows.map((r) =>
          el(
            'tr',
            {},
            [el('td', { class: 'name', text: r.name })].concat(
              r.cells.map((c) => el('td', { class: c ? 'c-' + c : '', text: c === 'W' || c === 'H' ? '' : c })),
            ),
          ),
        ),
      ),
    );
    return { R: R, bal: bal };
  }

  $('l-add').addEventListener('click', () => {
    const R = rules();
    const e = {
      employee: $('l-emp').value.trim(),
      type: $('l-type').value || 'Leave',
      start: $('l-start').value,
      end: $('l-end').value || $('l-start').value,
      halfStart: $('l-hs').checked,
      halfEnd: $('l-he').checked,
    };
    try {
      if (!e.employee) throw new Error('Enter the employee name.');
      if (!e.start) throw new Error('Choose the first day of leave.');
      const d = daysOf(e, R.opts);
      entries.push(e);
      setStatus(
        $('leave-status'),
        'Added: ' + d + ' working day(s).' + (d === 0 ? ' (That period has no working days.)' : ''),
        d === 0 ? 'warn' : 'ok',
      );
    } catch (err) {
      setStatus($('leave-status'), err.message, 'error');
    }
    render();
  });

  $('import').addEventListener('change', async () => {
    const f = $('import').files[0];
    if (!f) return;
    try {
      const wb = XLSX.read(await readArrayBuffer(f), { type: 'array', cellDates: true });
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false, blankrows: false });
      const r = LeaveCore.entriesFromRows(aoa);
      entries = entries.concat(r.entries).slice(0, 5000);
      setStatus(
        $('leave-status'),
        r.entries.length + ' leave(s) imported.' + (r.errors.length ? ' Skipped: ' + r.errors.slice(0, 3).join(' ') : ''),
        r.errors.length ? 'warn' : 'ok',
      );
    } catch (err) {
      setStatus($('leave-status'), 'Could not read that file.', 'error');
    }
    $('import').value = '';
    render();
  });

  $('dl-bal').addEventListener('click', () => {
    const { bal } = render();
    downloadBlob(LeaveCore.balancesCsv(bal), 'leave-balances.csv', 'text/csv;charset=utf-8');
    setStatus($('out-status'), 'Balances downloaded.', 'ok');
  });
  $('dl-leaves').addEventListener('click', () => {
    const { R } = render();
    downloadBlob(LeaveCore.entriesCsv(entries, R.opts), 'leave-list.csv', 'text/csv;charset=utf-8');
    setStatus($('out-status'), 'Leave list downloaded.', 'ok');
  });
  $('save').addEventListener('click', () => {
    const data = {
      app: 'leave-planner',
      version: 1,
      roster: $('roster').value,
      ent: $('ent').value,
      hol: $('hol').value,
      year: $('year').value,
      weekend: $('weekend').value,
      entries: entries,
    };
    downloadBlob(JSON.stringify(data, null, 2), 'leave-planner.json', 'application/json');
    setStatus($('out-status'), 'Saved. Keep the file secure: it contains employee names.', 'ok');
  });
  $('open').addEventListener('change', async () => {
    const f = $('open').files[0];
    if (!f) return;
    try {
      const d = JSON.parse(await readText(f));
      if (!d || d.app !== 'leave-planner' || !Array.isArray(d.entries)) throw new Error('bad');
      $('roster').value = String(d.roster || '').slice(0, 20000);
      $('ent').value = String(d.ent || '').slice(0, 5000);
      $('hol').value = String(d.hol || '').slice(0, 20000);
      $('year').value = String(parseInt(d.year, 10) || new Date().getFullYear());
      if (['0,6', '0', '5,6'].indexOf(d.weekend) !== -1) $('weekend').value = d.weekend;
      entries = d.entries
        .slice(0, 5000)
        .filter(
          (e) =>
            e &&
            typeof e.employee === 'string' &&
            OT.toIsoDate(e.start) &&
            OT.toIsoDate(e.end) &&
            OT.toIsoDate(e.start) <= OT.toIsoDate(e.end),
        )
        .map((e) => ({
          employee: e.employee.slice(0, 80),
          type: String(e.type || 'Leave').slice(0, 60),
          start: OT.toIsoDate(e.start),
          end: OT.toIsoDate(e.end),
          halfStart: !!e.halfStart,
          halfEnd: !!e.halfEnd,
        }));
      setStatus($('out-status'), 'Opened ' + f.name + '.', 'ok');
    } catch (err) {
      setStatus($('out-status'), 'That file is not a saved leave planner.', 'error');
    }
    $('open').value = '';
    render();
  });

  const again = debounce(render, 200);
  ['roster', 'ent', 'hol', 'year'].forEach((id) => $(id).addEventListener('input', again));
  ['weekend', 'limit', 'month'].forEach((id) => $(id).addEventListener('change', render));

  const now = new Date();
  $('year').value = String(now.getFullYear());
  MONTHS.forEach((m, i) => $('month').appendChild(el('option', { value: String(i + 1), text: m })));
  $('month').value = String(now.getMonth() + 1);
  $('ent').value = 'Casual Leave, 12\nSick Leave, 12\nEarned Leave, 15';
  $('hol').value =
    '# Edit this list for your company\n2026-08-15 Independence Day\n2026-10-02 Gandhi Jayanti\n2026-11-08 Diwali\n2026-12-25 Christmas\n2027-01-26 Republic Day';
  $('roster').value = '';
  render();
})();
