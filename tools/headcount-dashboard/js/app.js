/* Headcount Dashboard - user interface. All metrics live in core.js. */
(function () {
  'use strict';

  const { setStatus, bindDropzone, readArrayBuffer, downloadBlob, debounce, el } = OT;
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const LABELS = { dept: 'Department', location: 'Location', grade: 'Grade', gender: 'Gender' };

  let emps = [];
  let series = [];

  function sample() {
    const rows = [['Employee ID', 'Department', 'Location', 'Grade', 'Gender', 'Date of Joining', 'Last Working Day']];
    const depts = ['Engineering', 'Sales', 'HR', 'Finance', 'Support'];
    const locs = ['Pune', 'Mumbai', 'Bengaluru'];
    let seed = 7;
    const rnd = (n) => {
      // small seeded generator (mulberry32) so the sample is the same every time
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
    };
    for (let i = 1; i <= 120; i++) {
      const y = 2019 + rnd(8);
      const joined = y + '-' + String(1 + rnd(12)).padStart(2, '0') + '-' + String(1 + rnd(28)).padStart(2, '0');
      let left = '';
      if (rnd(100) < 30) {
        const ly = Math.min(2026, Number(y) + rnd(4));
        left = ly + '-' + String(1 + rnd(12)).padStart(2, '0') + '-' + String(1 + rnd(28)).padStart(2, '0');
        if (left <= joined) left = '';
      }
      rows.push([
        'S' + String(i).padStart(3, '0'),
        depts[rnd(5)],
        locs[rnd(3)],
        'L' + (1 + rnd(4)),
        rnd(100) < 45 ? 'Female' : 'Male',
        joined,
        left,
      ]);
    }
    return rows;
  }

  function load(aoa, label) {
    const r = HeadcountCore.rowsToEmployees(aoa);
    emps = r.employees;
    setStatus(
      $('load-status'),
      r.errors.length
        ? (emps.length ? emps.length + ' employee(s) read. ' : '') +
            r.errors.slice(0, 3).join(' ') +
            (r.errors.length > 3 ? ' (+' + (r.errors.length - 3) + ' more)' : '')
        : label + ': ' + emps.length + ' employee(s) read.',
      r.errors.length ? 'warn' : 'ok',
    );
    if (emps.length) {
      const last = emps.reduce((m, e) => (e.left && e.left > m ? e.left : e.joined > m ? e.joined : m), '0000');
      const end = last.slice(0, 7);
      const start = OT.addDays(end + '-01', -330).slice(0, 7);
      $('to').value = end;
      $('from').value = start;
    }
    render();
  }

  bindDropzone($('drop'), $('file-input'), async (files) => {
    try {
      const wb = XLSX.read(await readArrayBuffer(files[0]), { type: 'array', cellDates: false });
      load(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false, blankrows: false }), files[0].name);
    } catch (e) {
      setStatus($('load-status'), 'Could not open that file. Is it a valid Excel or CSV file?', 'error');
    }
  });
  $('sample').addEventListener('click', () => load(sample(), 'Sample data (made up)'));

  function chart(data) {
    const svg = $('chart');
    svg.textContent = '';
    const W = 700;
    const H = 220;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    const max = Math.max(1, ...data.map((d) => d.closing));
    const bw = (W - 40) / data.length;
    data.forEach(function (d, i) {
      const h = Math.round(((H - 50) * d.closing) / max);
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('class', 'bar');
      rect.setAttribute('x', String(30 + i * bw + bw * 0.15));
      rect.setAttribute('y', String(H - 30 - h));
      rect.setAttribute('width', String(bw * 0.7));
      rect.setAttribute('height', String(h));
      const title = document.createElementNS(NS, 'title');
      title.textContent = d.month + ': ' + d.closing;
      rect.appendChild(title);
      svg.appendChild(rect);
      const lab = document.createElementNS(NS, 'text');
      lab.setAttribute('x', String(30 + i * bw + bw / 2));
      lab.setAttribute('y', String(H - 14));
      lab.setAttribute('text-anchor', 'middle');
      lab.textContent = data.length > 14 ? d.month.slice(5) : d.month;
      svg.appendChild(lab);
      const val = document.createElementNS(NS, 'text');
      val.setAttribute('x', String(30 + i * bw + bw / 2));
      val.setAttribute('y', String(H - 34 - h));
      val.setAttribute('text-anchor', 'middle');
      val.textContent = String(d.closing);
      svg.appendChild(val);
    });
  }

  function render() {
    const out = $('out');
    out.hidden = !emps.length;
    if (!emps.length) return;
    const from = $('from').value;
    const to = $('to').value;
    try {
      series = HeadcountCore.monthlySeries(emps, from, to);
    } catch (e) {
      out.hidden = true;
      return setStatus($('load-status'), e.message, 'error');
    }
    const fromDay = HeadcountCore.monthRange(from)[0];
    const toDay = HeadcountCore.monthRange(to)[1];
    const a = HeadcountCore.attrition(emps, fromDay, toDay);
    const k = $('kpis');
    k.textContent = '';
    [
      ['Headcount at end', a.closing],
      ['Joiners', a.joiners],
      ['Leavers', a.leavers],
      ['Attrition % (period)', a.attritionPct + '%'],
      ['Attrition % (annualised)', a.annualisedPct + '%'],
      ['Leavers in first year', a.firstYearShare + '%'],
    ].forEach((x) =>
      k.appendChild(el('div', { class: 'kpi' }, [el('div', { class: 'v', text: String(x[1]) }), el('div', { class: 'l', text: x[0] })])),
    );

    chart(series);
    const mb = $('months');
    mb.textContent = '';
    series.forEach((s) =>
      mb.appendChild(
        el(
          'tr',
          {},
          [s.month, s.opening, s.joiners, s.leavers, s.closing, s.attritionPct + '%'].map((v) => el('td', { text: String(v) })),
        ),
      ),
    );

    const field = $('split').value;
    $('split-title').textContent = 'By ' + LABELS[field].toLowerCase();
    $('split-head').textContent = LABELS[field];
    const counts = new Map(HeadcountCore.breakdown(emps, toDay, field).map((x) => [x.label, x.count]));
    const rows = HeadcountCore.attritionBy(emps, field, fromDay, toDay, 5);
    const sb = $('split-body');
    sb.textContent = '';
    rows.forEach((r) =>
      sb.appendChild(
        el('tr', {}, [
          el('td', { text: r.label }),
          el('td', { text: String(counts.get(r.label) || 0) }),
          el('td', { text: String(r.leavers) }),
          el('td', { class: r.small ? 'small' : '', text: r.attritionPct + '%' + (r.small ? ' *' : '') }),
        ]),
      ),
    );
    $('small-note').textContent = rows.some((r) => r.small)
      ? '* Fewer than 5 people on average: percentages swing a lot with one resignation, so read them with care and protect privacy when sharing small groups.'
      : '';

    const t = HeadcountCore.tenure(emps, toDay);
    const tb = $('tenure');
    tb.textContent = '';
    t.buckets.forEach((b) => tb.appendChild(el('tr', {}, [el('td', { text: b.label }), el('td', { text: String(b.count) })])));
    tb.appendChild(el('tr', {}, [el('td', { text: 'Average tenure (years)' }), el('td', { text: String(t.averageYears) })]));
  }

  $('dl').addEventListener('click', () =>
    downloadBlob(HeadcountCore.seriesCsv(series), 'headcount-by-month.csv', 'text/csv;charset=utf-8'),
  );
  const again = debounce(render, 150);
  ['from', 'to'].forEach((id) => $(id).addEventListener('input', again));
  $('split').addEventListener('change', render);
})();
