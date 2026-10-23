/* Policy Acknowledgement Tracker - user interface. All logic lives in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readText, readArrayBuffer, el } = OT;
  const $ = (id) => document.getElementById(id);
  const today = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };

  let state = PolicyCore.create();

  function bar(percent) {
    const fill = el('span');
    fill.style.width = percent + '%';
    return el(
      'div',
      { class: 'bar ' + (percent < 40 ? 'low' : percent < 80 ? 'mid' : ''), role: 'img', 'aria-label': percent + ' percent' },
      [fill],
    );
  }

  async function sheetRows(file) {
    const wb = XLSX.read(await readArrayBuffer(file), { type: 'array', cellDates: true });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false, blankrows: false });
  }

  function render() {
    const sum = PolicyCore.summary(state, today());

    // pick-lists
    const teams = sum.teams.map((t) => t.team);
    const ts = $('ack-team');
    const prevTeam = ts.value;
    ts.textContent = '';
    ts.appendChild(el('option', { value: '', text: 'All teams' }));
    teams.forEach((t) => ts.appendChild(el('option', { value: t, text: t })));
    if (teams.indexOf(prevTeam) !== -1) ts.value = prevTeam;
    const ps = $('ack-pol');
    const prevPol = ps.value;
    ps.textContent = '';
    state.policies.forEach((p) => ps.appendChild(el('option', { value: String(p.id), text: p.name })));
    if (state.policies.some((p) => String(p.id) === prevPol)) ps.value = prevPol;

    // policies
    const pb = $('pol-body');
    pb.textContent = '';
    sum.policies.forEach((p) => {
      const rm = el('button', { type: 'button', text: 'Remove', 'aria-label': 'Remove policy ' + p.name });
      rm.addEventListener('click', () => {
        state = PolicyCore.removePolicy(state, p.id);
        render();
      });
      pb.appendChild(
        el('tr', {}, [
          el('td', { text: p.name }),
          el('td', { class: p.overdue ? 'late' : '', text: p.due ? OT.formatDate(p.due, 'dmy') + (p.overdue ? ' (overdue)' : '') : '-' }),
          el('td', { text: p.acked + ' of ' + p.total + ' (' + p.percent + '%)' }),
          el('td', {}, [bar(p.percent)]),
          el('td', {}, [rm]),
        ]),
      );
    });
    $('pol-table').hidden = !sum.policies.length;

    // matrix
    const table = $('matrix');
    table.textContent = '';
    const filter = ts.value;
    const shown = state.people.filter((p) => !filter || p.team === filter);
    if (state.policies.length && shown.length) {
      const head = el(
        'tr',
        {},
        [el('th', { scope: 'col', text: 'Name' }), el('th', { scope: 'col', text: 'Team' })].concat(
          state.policies.map((p) => el('th', { scope: 'col', text: p.name })),
        ),
      );
      table.appendChild(el('thead', {}, [head]));
      const body = el('tbody');
      shown.forEach((person) => {
        const cells = [el('td', { text: person.name }), el('td', { text: person.team })];
        state.policies.forEach((p) => {
          const done = (state.acks[p.id] || {})[person.name];
          const box = el('input', { type: 'checkbox', 'aria-label': person.name + ': ' + p.name });
          box.checked = !!done;
          box.addEventListener('change', () => {
            try {
              state = PolicyCore.setAck(state, p.id, person.name, box.checked ? $('ack-date').value || today() : null);
              setStatus($('ack-status'), '', '');
            } catch (e) {
              setStatus($('ack-status'), e.message, 'error');
            }
            render();
          });
          cells.push(
            el('td', { class: 'chk' }, [box, done ? el('div', { class: 'hint', text: OT.formatDate(done, 'dmy') }) : null].filter(Boolean)),
          );
        });
        body.appendChild(el('tr', {}, cells));
      });
      table.appendChild(body);
    }
    table.hidden = !table.firstChild;

    // teams
    const tb = $('team-body');
    tb.textContent = '';
    sum.teams.forEach((t) =>
      tb.appendChild(
        el('tr', {}, [
          el('td', { text: t.team }),
          el('td', { text: String(t.people) }),
          el('td', { text: t.acked + ' of ' + t.possible + ' (' + t.percent + '%)' }),
          el('td', {}, [bar(t.percent)]),
        ]),
      ),
    );
    $('team-table').hidden = !(sum.teams.length && state.policies.length);
  }

  $('p-apply').addEventListener('click', () => {
    const r = PolicyCore.parsePeople($('people').value);
    state = PolicyCore.setPeople(state, r.people);
    setStatus($('people-status'), r.people.length + ' people. ' + r.errors.join(' '), r.errors.length ? 'warn' : 'ok');
    render();
  });

  $('p-sample').addEventListener('click', () => {
    $('people').value =
      'Asha Rao, Engineering, asha@example.com\nRavi Kumar, Engineering, ravi@example.com\nMeera Shah, Sales, meera@example.com\nZoe Fernandes, Sales\nKiran Patel, Finance, kiran@example.com';
    $('p-apply').click();
  });

  $('p-import').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      const r = PolicyCore.peopleFromRows(await sheetRows(f));
      if (!r.people.length) return setStatus($('people-status'), r.errors.join(' '), 'error');
      $('people').value = r.people.map((p) => [p.name, p.team, p.email].filter((x, i) => i < 2 || x).join(', ')).join('\n');
      state = PolicyCore.setPeople(state, r.people);
      setStatus($('people-status'), r.people.length + ' people imported. ' + r.errors.join(' '), r.errors.length ? 'warn' : 'ok');
      render();
    } catch (e) {
      setStatus($('people-status'), 'Could not read that file.', 'error');
    }
  });

  $('pol-add').addEventListener('click', () => {
    try {
      state = PolicyCore.addPolicy(state, $('pol-name').value, $('pol-due').value);
      $('pol-name').value = '';
      setStatus($('pol-status'), '', '');
      render();
    } catch (e) {
      setStatus($('pol-status'), e.message, 'error');
    }
  });

  $('ack-all').addEventListener('click', () => {
    const id = parseInt($('ack-pol').value, 10);
    if (!id) return setStatus($('ack-status'), 'Add a policy first.', 'warn');
    try {
      state = PolicyCore.markAll(state, id, $('ack-date').value || today(), $('ack-team').value);
      setStatus($('ack-status'), 'Marked done.', 'ok');
      render();
    } catch (e) {
      setStatus($('ack-status'), e.message, 'error');
    }
  });

  $('a-import').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      const r = PolicyCore.importAcks(state, await sheetRows(f));
      state = r.state;
      setStatus(
        $('ack-status'),
        r.applied + ' recorded. ' + r.errors.slice(0, 5).join(' ') + (r.errors.length > 5 ? ' (+' + (r.errors.length - 5) + ' more)' : ''),
        r.errors.length ? 'warn' : 'ok',
      );
      render();
    } catch (e) {
      setStatus($('ack-status'), 'Could not read that file.', 'error');
    }
  });

  $('ack-team').addEventListener('change', render);

  $('make-rem').addEventListener('click', () => {
    const t = PolicyCore.remindersText(state, today(), { onlyOverdue: $('only-overdue').checked, sender: $('sender').value.trim() });
    $('reminders').value = t;
    setStatus($('out-status'), t ? '' : 'Nobody has anything outstanding.', t ? '' : 'ok');
  });

  $('copy-rem').addEventListener('click', async () => {
    const t = $('reminders').value;
    if (!t) return setStatus($('out-status'), 'Write the reminders first.', 'warn');
    setStatus($('out-status'), (await OT.copyText(t)) ? 'Copied.' : 'Copy failed - select the text and copy it yourself.', 'ok');
  });

  $('dl-csv').addEventListener('click', () => {
    if (!state.people.length) return setStatus($('out-status'), 'Add people first.', 'warn');
    downloadBlob(PolicyCore.matrixCsv(state), 'policy-acknowledgements.csv', 'text/csv;charset=utf-8');
  });

  $('save').addEventListener('click', () => downloadBlob(PolicyCore.serialize(state), 'policy-tracker.json', 'application/json'));

  $('open').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      state = PolicyCore.parse(await readText(f));
      $('people').value = state.people.map((p) => [p.name, p.team, p.email].filter((x, i) => i < 2 || x).join(', ')).join('\n');
      setStatus($('out-status'), 'Opened.', 'ok');
      render();
    } catch (e) {
      setStatus($('out-status'), e.message, 'error');
    }
  });

  $('ack-date').value = today();
  render();
})();
