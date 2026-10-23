/* Letter Generator - user interface. Template filling and PDF layout live in core.js. */
(function () {
  'use strict';

  const { setStatus, downloadBlob, copyText, debounce, el } = OT;
  const $ = (id) => document.getElementById(id);
  const KEY = 'letter-generator.letterhead.v1';

  const today = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  // Letterhead memory (optional, device only; storage may be blocked).
  function loadLetterhead() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const v = JSON.parse(raw);
      $('company').value = String(v.company || '').slice(0, 120);
      $('address').value = String(v.address || '').slice(0, 200);
      $('signatory').value = String(v.signatory || '').slice(0, 80);
      $('sig-title').value = String(v.title || '').slice(0, 80);
      $('remember').checked = true;
    } catch (e) {
      /* ignore */
    }
  }
  function saveLetterhead() {
    try {
      if ($('remember').checked)
        localStorage.setItem(
          KEY,
          JSON.stringify({
            company: $('company').value,
            address: $('address').value,
            signatory: $('signatory').value,
            title: $('sig-title').value,
          }),
        );
      else localStorage.removeItem(KEY);
    } catch (e) {
      /* ignore */
    }
  }

  const letterhead = () => ({
    company: $('company').value.trim(),
    address: $('address').value.trim(),
    signatory: $('signatory').value.trim(),
    signatory_title: $('sig-title').value.trim(),
  });
  const values = () => {
    const v = {};
    document.querySelectorAll('#fields [data-key]').forEach((x) => (v[x.getAttribute('data-key')] = x.value));
    return v;
  };

  function buildFields() {
    const box = $('fields');
    box.textContent = '';
    const t = LetterCore.getTemplate($('kind').value);
    const d = LetterCore.defaults(t.id);
    t.fields.forEach(function (f) {
      let input;
      if (f.type === 'textarea') input = el('textarea', { rows: '3' });
      else if (f.type === 'select' || f.type === 'pronoun')
        input = el(
          'select',
          {},
          f.options.map((o) => el('option', { value: o, text: o })),
        );
      else
        input = el('input', {
          type: f.type === 'date' ? 'date' : 'text',
          inputmode: f.type === 'amount' || f.type === 'number' ? 'decimal' : 'text',
          autocomplete: 'off',
        });
      input.id = 'f-' + f.key;
      input.setAttribute('data-key', f.key);
      input.value = d[f.key];
      input.addEventListener('input', preview);
      input.addEventListener('change', preview);
      box.appendChild(el('div', {}, [el('label', { for: input.id, text: f.label + (f.required ? '' : ' (optional)') }), input]));
    });
    preview();
  }

  let current = null;
  function preview() {
    current = LetterCore.render($('kind').value, values(), letterhead(), $('letter-date').value || today());
    const lh = letterhead();
    const paper = $('paper');
    paper.textContent = '';
    if (lh.company) paper.appendChild(el('div', { class: 'co', text: lh.company }));
    if (lh.address) paper.appendChild(el('div', { class: 'ad', text: lh.address }));
    if (current.date) paper.appendChild(el('p', { class: 'dt', text: 'Date: ' + current.date }));
    paper.appendChild(el('h3', { text: current.title }));
    current.paragraphs.forEach((p) => paper.appendChild(el('p', { text: p })));
    paper.appendChild(
      el('p', { class: 'sig', text: 'Yours sincerely,\n\n' + [lh.signatory, lh.signatory_title, lh.company].filter(Boolean).join('\n') }),
    );
    const issues = current.missing.length ? 'Still to fill in: ' + current.missing.join(', ') + '. ' : '';
    setStatus($('check'), issues + current.problems.join(' '), issues || current.problems.length ? 'warn' : 'ok');
    if (!issues && !current.problems.length) $('check').textContent = 'Ready to download.';
    saveLetterhead();
  }

  $('pdf').addEventListener('click', async function () {
    preview();
    if (current.missing.length || current.problems.length) return setStatus($('out'), 'Please fix the items above first.', 'warn');
    try {
      const bytes = await LetterCore.buildPdf(PDFLib, current, letterhead(), { pageSize: $('size').value, font: $('font').value });
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), LetterCore.fileName(current, values()));
      setStatus($('out'), 'PDF saved.', 'ok');
    } catch (e) {
      setStatus($('out'), e.message, 'error');
    }
  });
  $('copy').addEventListener('click', async () => {
    await copyText(LetterCore.toText(current, letterhead()));
    setStatus($('out'), 'Letter text copied.', 'ok');
  });

  LetterCore.TEMPLATES.forEach((t) => $('kind').appendChild(el('option', { value: t.id, text: t.title })));
  $('kind').addEventListener('change', buildFields);
  $('letter-date').value = today();
  ['letter-date', 'size', 'font'].forEach((id) => $(id).addEventListener('change', preview));
  ['company', 'address', 'signatory', 'sig-title'].forEach((id) => $(id).addEventListener('input', debounce(preview, 150)));
  $('remember').addEventListener('change', saveLetterhead);
  loadLetterhead();
  buildFields();
})();
