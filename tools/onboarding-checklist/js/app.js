/* Onboarding & Exit Checklist - user interface. Dates, progress and file formats live in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readText, copyText, el } = OT;
  const $ = (id) => document.getElementById(id);

  const todayIso = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

  let plan = null;

  const run = (fn, statusId) => {
    try {
      fn();
    } catch (e) {
      setStatus($(statusId || 'out-status'), e.message, 'error');
    }
    render();
  };

  function render() {
    $('plan-card').hidden = !plan;
    $('out-card').hidden = !plan;
    if (!plan) return;
    const today = todayIso();
    const pr = CheckCore.progress(plan, today);
    $('plan-title').textContent = plan.title + ': ' + plan.person + ' - ' + plan.anchorLabel + ' ' + OT.formatDate(plan.anchor);
    $('bar-fill').style.width = pr.percent + '%';
    $('bar').setAttribute('aria-valuenow', String(pr.percent));
    setStatus(
      $('summary'),
      pr.done + ' of ' + pr.total + ' done (' + pr.percent + '%). ' + pr.overdue + ' overdue, ' + pr.dueSoon + ' due in the next 7 days.',
      pr.overdue ? 'warn' : 'ok',
    );
    $('reschedule').value = plan.anchor;

    const box = $('phases');
    box.textContent = '';
    CheckCore.byPhase(plan).forEach(function (g) {
      const tasks = g.tasks.filter((x) => !($('hide-done').checked && x.done));
      if (!tasks.length) return;
      const ul = el('ul', { class: 'tasks' });
      tasks.forEach(function (x) {
        const cb = el('input', { type: 'checkbox', 'aria-label': 'Done: ' + x.title });
        cb.checked = x.done;
        cb.addEventListener('change', () => run(() => (plan = CheckCore.toggle(plan, x.id))));
        const title = el('input', { type: 'text', value: x.title, class: 't', 'aria-label': 'Task' });
        title.addEventListener('change', () => run(() => (plan = CheckCore.updateTask(plan, x.id, { title: title.value }))));
        const owner = el('input', { type: 'text', value: x.owner, 'aria-label': 'Owner of ' + x.title });
        owner.addEventListener('change', () => run(() => (plan = CheckCore.updateTask(plan, x.id, { owner: owner.value }))));
        const due = el('input', { type: 'date', value: x.due, class: 'due', 'aria-label': 'Due date of ' + x.title });
        due.addEventListener('change', () => run(() => (plan = CheckCore.updateTask(plan, x.id, { due: due.value }))));
        const rm = el('button', { type: 'button', text: '✕', title: 'Remove task', 'aria-label': 'Remove task: ' + x.title });
        rm.addEventListener('click', () => run(() => (plan = CheckCore.removeTask(plan, x.id))));
        const li = el('li', { class: (x.done ? 'done ' : '') + (!x.done && x.due && x.due < today ? 'late' : '') }, [
          cb,
          title,
          owner,
          due,
          rm,
        ]);
        ul.appendChild(li);
      });
      box.appendChild(el('div', { class: 'phase' }, [el('h3', { text: g.phase }), ul]));
    });

    const own = $('owners');
    own.textContent = '';
    Object.keys(pr.byOwner)
      .sort()
      .forEach((k) =>
        own.appendChild(
          el('tr', {}, [
            el('td', { text: k }),
            el('td', { text: pr.byOwner[k].done + ' / ' + pr.byOwner[k].total }),
            el('td', { text: String(pr.byOwner[k].overdue) }),
          ]),
        ),
      );
  }

  function anchorText() {
    $('anchor-label').textContent = CheckCore.TEMPLATES[$('type').value].anchorLabel;
  }
  $('type').addEventListener('change', anchorText);

  $('create').addEventListener('click', () => {
    try {
      plan = CheckCore.createPlan({
        template: $('type').value,
        person: $('person').value,
        anchor: $('anchor').value,
        weekends: $('weekends').value,
      });
      setStatus($('new-status'), '');
    } catch (e) {
      setStatus($('new-status'), e.message, 'error');
    }
    render();
  });
  $('open').addEventListener('change', async () => {
    const f = $('open').files[0];
    if (!f) return;
    try {
      plan = CheckCore.parse(await readText(f));
      setStatus($('new-status'), 'Opened ' + f.name + '.', 'ok');
    } catch (e) {
      setStatus($('new-status'), e.message, 'error');
    }
    $('open').value = '';
    render();
  });
  $('do-resched').addEventListener('click', () => run(() => (plan = CheckCore.reschedule(plan, $('reschedule').value))));
  $('hide-done').addEventListener('change', render);
  $('t-add').addEventListener('click', () =>
    run(() => {
      plan = CheckCore.addTask(plan, { title: $('t-title').value, owner: $('t-owner').value, due: $('t-due').value });
      $('t-title').value = '';
    }),
  );

  const ok = (m) => setStatus($('out-status'), m, 'ok');
  $('dl-csv').addEventListener(
    'click',
    () => (downloadBlob(CheckCore.toCsv(plan), 'checklist.csv', 'text/csv;charset=utf-8'), ok('CSV downloaded.')),
  );
  $('dl-ics').addEventListener(
    'click',
    () => (
      downloadBlob(CheckCore.toIcs(plan, stamp()), 'checklist.ics', 'text/calendar;charset=utf-8'),
      ok('Calendar file downloaded: open it to add the due dates to a calendar.')
    ),
  );
  $('copy-md').addEventListener(
    'click',
    async () => (await copyText(CheckCore.toMarkdown(plan, todayIso())), ok('Checklist text copied.')),
  );
  $('save').addEventListener(
    'click',
    () => (
      downloadBlob(CheckCore.serialize(plan), 'checklist.json', 'application/json'),
      ok('Saved. Keep the file secure: it contains the employee name.')
    ),
  );
  $('print').addEventListener('click', () => window.print());

  $('anchor').value = todayIso();
  anchorText();
  render();
})();
