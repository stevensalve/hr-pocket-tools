/* Resume Shortlist - user interface. Matching, scoring and ranking live in core.js. */
(function () {
  'use strict';

  const { setStatus, bindDropzone, readArrayBuffer, downloadBlob, debounce, el } = OT;
  const $ = (id) => document.getElementById(id);

  const SAMPLE = [
    ['Name', 'Experience', 'Notice Period', 'Location', 'Skills', 'Summary'],
    ['Candidate A', '6 years', '30 days', 'Pune', 'Java, Spring Boot, SQL, AWS', 'Built payment services and led a team of four.'],
    ['Candidate B', '4 years', '60 days', 'Mumbai', 'Java, SQL', 'Backend developer for retail systems.'],
    ['Candidate C', '2 yrs', 'Immediate', 'Delhi', 'Python, Django', 'Data pipelines and reporting.'],
    ['Candidate D', '8 years', '90 days', 'Pune', 'Java, JavaScript, React, SQL, Kubernetes', 'Full-stack lead, mentors juniors.'],
    ['Candidate E', '5 years', '2 months', '', 'C++, Qt', 'Desktop applications.'],
  ];

  let candidates = [];
  let results = [];

  function criteria() {
    const num = (id) => {
      const v = $(id).value.trim();
      return v === '' ? null : Number(v);
    };
    return {
      must: ShortlistCore.parseKeywords($('must').value),
      nice: ShortlistCore.parseKeywords($('nice').value),
      avoid: ShortlistCore.parseKeywords($('avoid').value),
      minYears: num('min-y'),
      maxYears: num('max-y'),
      maxNoticeDays: num('notice'),
      locations: $('locs')
        .value.split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
      shortlistScore: Math.min(100, Math.max(1, Number($('bar').value) || 60)),
    };
  }

  function useRows(aoa, label) {
    const r = ShortlistCore.rowsToCandidates(aoa);
    candidates = r.candidates;
    setStatus(
      $('load-status'),
      r.errors.length ? r.errors.join(' ') : label + ': ' + candidates.length + ' candidate(s) loaded.',
      r.errors.length ? 'warn' : 'ok',
    );
    render();
  }

  bindDropzone($('drop'), $('file-input'), async (files) => {
    try {
      const wb = XLSX.read(await readArrayBuffer(files[0]), { type: 'array' });
      useRows(
        XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false, blankrows: false }),
        files[0].name,
      );
    } catch (e) {
      setStatus($('load-status'), 'Could not open that file. Is it a valid Excel or CSV file?', 'error');
    }
  });
  $('sample').addEventListener('click', () => {
    $('must').value = 'Java\nSQL';
    $('nice').value = 'AWS\nKubernetes';
    $('min-y').value = '3';
    $('max-y').value = '9';
    $('notice').value = '60';
    $('locs').value = 'Pune, Mumbai';
    useRows(SAMPLE, 'Sample data');
  });

  function render() {
    const blind = $('blind').checked;
    $('name-head').hidden = blind;
    const nameOf = new Map(candidates.map((c) => [c.ref, c.name]));
    results = candidates.length ? ShortlistCore.rank(candidates, criteria()) : [];
    const filter = $('show').value;
    const shown = results.filter((r) => filter === 'all' || r.status === filter);
    const body = $('rows');
    body.textContent = '';
    shown.forEach((r) => {
      const cls = r.status === 'Shortlist' ? 's' : r.status === 'Maybe' ? 'm' : 'n';
      const cells = [el('td', { text: r.ref })];
      if (!blind) cells.push(el('td', { text: nameOf.get(r.ref) || '' }));
      cells.push(
        el('td', {}, [el('span', { class: 'pill ' + cls, text: r.status })]),
        el('td', { text: String(r.score) }),
        el('td', { class: 'why', text: r.reasons.join('. ') }),
        el('td', { class: 'flag', text: r.flags.join('. ') }),
      );
      body.appendChild(el('tr', {}, cells));
    });
    $('result').hidden = !shown.length;
    $('dl').disabled = !results.length;
    if (results.length) {
      const count = (s) => results.filter((r) => r.status === s).length;
      setStatus(
        $('summary'),
        count('Shortlist') +
          ' to shortlist, ' +
          count('Maybe') +
          ' maybe, ' +
          count('Not a match') +
          ' not a match, out of ' +
          results.length +
          '.',
        'ok',
      );
    }
  }

  $('dl').addEventListener('click', () => {
    const csv = ShortlistCore.toCsv(
      results.map((r) => Object.assign({}, r, { name: (candidates.find((c) => c.ref === r.ref) || {}).name || '' })),
      $('blind').checked,
    );
    downloadBlob(csv, 'shortlist.csv', 'text/csv;charset=utf-8');
  });

  const again = debounce(render, 200);
  ['must', 'nice', 'avoid', 'min-y', 'max-y', 'notice', 'locs', 'bar'].forEach((id) => $(id).addEventListener('input', again));
  ['blind', 'show'].forEach((id) => $(id).addEventListener('change', render));
  render();
})();
