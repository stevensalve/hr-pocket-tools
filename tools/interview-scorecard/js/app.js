/* Interview Scorecard - user interface. Scoring maths and file formats live in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, readText, el } = OT;
  const $ = (id) => document.getElementById(id);

  let state = ScoreCore.create('', 'general');
  let selected = null;

  const guard = (fn, statusId) => {
    try {
      fn();
      if (statusId) setStatus($(statusId), '');
    } catch (e) {
      setStatus($(statusId || 'setup-status'), e.message, 'error');
    }
    render();
  };

  function renderCriteria() {
    const body = $('criteria');
    body.textContent = '';
    state.criteria.forEach(function (c) {
      const name = el('input', { type: 'text', value: c.name, 'aria-label': 'Criterion name' });
      name.addEventListener('change', () => guard(() => (state = ScoreCore.updateCriterion(state, c.id, { name: name.value }))));
      const weight = el('input', { type: 'number', value: String(c.weight), min: '1', max: '1000', 'aria-label': 'Weight for ' + c.name });
      weight.addEventListener('change', () => guard(() => (state = ScoreCore.updateCriterion(state, c.id, { weight: weight.value }))));
      const rm = el('button', { type: 'button', text: 'Remove', 'aria-label': 'Remove ' + c.name });
      rm.addEventListener('click', () => guard(() => (state = ScoreCore.removeCriterion(state, c.id))));
      body.appendChild(el('tr', {}, [el('td', {}, [name]), el('td', {}, [weight]), el('td', {}, [rm])]));
    });
  }

  function renderPicker() {
    const pick = $('cand-pick');
    pick.textContent = '';
    state.candidates.forEach((c) => pick.appendChild(el('option', { value: String(c.id), text: c.name })));
    if (!state.candidates.some((c) => c.id === selected)) selected = state.candidates.length ? state.candidates[0].id : null;
    if (selected !== null) pick.value = String(selected);
    $('del-cand').disabled = selected === null;
    $('notes').disabled = selected === null;
    $('notes').value = selected === null ? '' : state.candidates.find((c) => c.id === selected).notes;
  }

  function renderGrid() {
    const head = $('grid-head');
    const body = $('grid-body');
    head.textContent = '';
    body.textContent = '';
    if (selected === null) return;
    const cand = state.candidates.find((c) => c.id === selected);
    head.appendChild(
      el(
        'tr',
        {},
        [el('th', { scope: 'col', text: 'Criterion (weight)' })].concat(state.interviewers.map((n) => el('th', { scope: 'col', text: n }))),
      ),
    );
    state.criteria.forEach(function (c) {
      const cells = [el('td', { text: c.name + ' (' + c.weight + ')' })];
      state.interviewers.forEach(function (who) {
        const sel = el(
          'select',
          { 'aria-label': who + ' score for ' + c.name },
          ScoreCore.SCALE.map((label, i) => el('option', { value: String(i), text: i ? i + ' - ' + label : '-' })),
        );
        sel.value = String((cand.ratings[c.id] || {})[who] || 0);
        sel.addEventListener('change', () =>
          guard(() => (state = ScoreCore.setRating(state, cand.id, c.id, who, Number(sel.value))), 'rank-status'),
        );
        cells.push(el('td', {}, [sel]));
      });
      body.appendChild(el('tr', {}, cells));
    });
  }

  function renderRanking() {
    const rows = ScoreCore.ranking(state);
    const body = $('rank-body');
    body.textContent = '';
    rows.forEach(function (r) {
      const cls =
        r.recommendation === 'Strong hire'
          ? 'strong'
          : r.recommendation === 'Hire'
            ? 'hire'
            : r.recommendation === 'Maybe'
              ? 'maybe'
              : r.recommendation === 'No hire'
                ? 'no'
                : '';
      body.appendChild(
        el('tr', {}, [
          el('td', { text: r.rank === null ? '-' : String(r.rank) }),
          el('td', { text: r.name }),
          el('td', { text: r.score === null ? '-' : r.score.toFixed(2) }),
          el('td', { text: r.percent === null ? '-' : r.percent + '%' }),
          el('td', {}, [el('span', { class: 'pill ' + cls, text: r.recommendation })]),
          el('td', { text: Math.round(r.coverage * 100) + '%' }),
          el('td', { text: r.disagreements.join(', ') || '-' }),
        ]),
      );
    });
    $('rank-table').hidden = rows.length === 0;
    $('dl-csv').disabled = rows.length === 0;
    if (rows.length)
      $('rank-status').textContent = rows.some((r) => r.disagreements.length)
        ? 'Some interviewers disagree by 2 or more points. Discuss those before deciding.'
        : 'Ranking updates as you score.';
  }

  function render() {
    $('role').value = state.role;
    $('people').value = state.interviewers.join(', ');
    renderCriteria();
    renderPicker();
    renderGrid();
    renderRanking();
  }

  $('role').addEventListener('change', () => guard(() => (state = ScoreCore.setRole(state, $('role').value))));
  $('people').addEventListener('change', () => guard(() => (state = ScoreCore.setInterviewers(state, $('people').value.split(',')))));
  $('apply-preset').addEventListener('click', () => {
    if (state.candidates.length && !window.confirm('Replace the criteria? Existing scores for the old criteria will be lost.')) return;
    const fresh = ScoreCore.create(state.role, $('preset').value);
    fresh.interviewers = state.interviewers;
    fresh.candidates = state.candidates.map((c) => ({ id: c.id, name: c.name, notes: c.notes, ratings: {} }));
    fresh.nextId = Math.max(fresh.nextId, state.nextId);
    state = fresh;
    render();
  });
  $('add-crit').addEventListener('click', () =>
    guard(() => {
      state = ScoreCore.addCriterion(state, $('new-crit').value, $('new-weight').value);
      $('new-crit').value = '';
    }),
  );
  $('add-cand').addEventListener('click', () =>
    guard(() => {
      state = ScoreCore.addCandidate(state, $('cand-name').value);
      selected = state.candidates[state.candidates.length - 1].id;
      $('cand-name').value = '';
    }, 'rank-status'),
  );
  $('cand-pick').addEventListener('change', () => {
    selected = Number($('cand-pick').value);
    render();
  });
  $('del-cand').addEventListener('click', () => {
    if (selected === null || !window.confirm('Remove this candidate and their scores?')) return;
    state = ScoreCore.removeCandidate(state, selected);
    render();
  });
  $('notes').addEventListener('change', () => guard(() => (state = ScoreCore.setNotes(state, selected, $('notes').value))));
  $('dl-csv').addEventListener('click', () => downloadBlob(ScoreCore.toCsv(state), 'interview-scores.csv', 'text/csv;charset=utf-8'));
  $('save').addEventListener('click', () => {
    downloadBlob(ScoreCore.serialize(state), 'scorecard.json', 'application/json');
    setStatus($('file-status'), 'Saved. Keep the file secure: it contains candidate names and notes.', 'ok');
  });
  $('open').addEventListener('change', async () => {
    const f = $('open').files[0];
    if (!f) return;
    try {
      state = ScoreCore.parse(await readText(f));
      selected = null;
      setStatus($('file-status'), 'Opened ' + f.name + '.', 'ok');
    } catch (e) {
      setStatus($('file-status'), e.message, 'error');
    }
    $('open').value = '';
    render();
  });
  $('print').addEventListener('click', () => window.print());

  render();
})();
