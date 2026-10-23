'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PDFLib = require('pdf-lib');
const lc = require('../js/core.js');

const LH = {
  company: 'Acme Technologies Pvt Ltd',
  address: '1 Main Road, Pune 411001',
  signatory: 'Asha Rao',
  signatory_title: 'HR Manager',
};
const TODAY = '2026-10-23';

function offerValues(extra) {
  return Object.assign(
    {
      candidate_name: 'Ravi Kumar',
      designation: 'Software Engineer',
      department: 'Engineering',
      joining_date: '2026-11-16',
      annual_ctc: '12,50,000',
      work_location: 'Pune',
      reporting_to: 'Meera Shah',
      probation_months: '6',
      notice_days: '60',
      valid_till: '2026-11-02',
    },
    extra,
  );
}

test('there are six templates with unique ids and well-formed fields', () => {
  assert.equal(lc.TEMPLATES.length, 6);
  assert.equal(new Set(lc.TEMPLATES.map((t) => t.id)).size, 6);
  lc.TEMPLATES.forEach((t) => {
    assert.ok(t.paragraphs.length >= 3);
    t.fields.forEach((f) => assert.ok(f.key && f.label && f.type));
  });
});

test('every placeholder in every template is defined by a field or a built-in', () => {
  const builtIn = new Set([
    'company',
    'signatory',
    'signatory_title',
    'today',
    'department_clause',
    'reporting_clause',
    'id_clause',
    'old_ctc_clause',
    'he',
    'him',
    'his',
    'He',
    'His',
  ]);
  lc.TEMPLATES.forEach((t) => {
    const known = new Set(t.fields.flatMap((f) => [f.key, f.key + '_words']));
    t.paragraphs.forEach((p) =>
      Array.from(p.matchAll(/\{\{\s*(\w+)/g)).forEach((m) => assert.ok(known.has(m[1]) || builtIn.has(m[1]), t.id + ': ' + m[1])),
    );
    const vals = lc.defaults(t.id);
    assert.deepEqual(lc.render(t.id, vals, LH, TODAY).problems, [], t.id + ' renders without unknown placeholders');
  });
});

test('getTemplate rejects unknown ids; defaults supply field defaults', () => {
  assert.throws(() => lc.getTemplate('nope'), /Unknown letter type/);
  assert.equal(lc.defaults('offer').probation_months, '6');
  assert.equal(lc.defaults('offer').candidate_name, '');
});

test('offer letter: dates, Indian amounts in words, optional clauses', () => {
  const r = lc.render('offer', offerValues(), LH, TODAY);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.problems, []);
  const text = r.paragraphs.join('\n');
  assert.match(text, /Dear Ravi Kumar,/);
  assert.match(text, /position of Software Engineer in the Engineering department at Acme Technologies Pvt Ltd, based at Pune/);
  assert.match(text, /date of joining will be 16 November 2026\. You will report to Meera Shah\./);
  assert.match(text, /Rs\. 12,50,000\/- \(Rupees Twelve Lakh Fifty Thousand Only\)/);
  assert.match(text, /valid until 2 November 2026/);
  assert.equal(r.date, '23 October 2026');
  const noOptional = lc.render('offer', offerValues({ department: '', reporting_to: '' }), LH, TODAY).paragraphs.join('\n');
  assert.doesNotMatch(noOptional, /department at/);
  assert.doesNotMatch(noOptional, /report to/);
  assert.match(noOptional, /Software Engineer at Acme/);
  assert.doesNotMatch(noOptional, / ,| \./, 'no stray spaces before punctuation');
});

test('missing required fields and bad values are reported, not thrown', () => {
  const r = lc.render('offer', offerValues({ candidate_name: '', annual_ctc: 'twelve lakh', joining_date: '2026-02-30' }), LH, TODAY);
  assert.deepEqual(r.missing, ['Candidate name']);
  assert.equal(r.problems.length, 2);
  assert.match(r.problems.join(' '), /Annual CTC .* plain number/);
  assert.match(r.problems.join(' '), /does not exist/);
});

test('pronouns drive the experience letter', () => {
  const base = { employee_name: 'Neha Jain', designation: 'Analyst', joining_date: '2022-04-01', last_working_date: '2026-09-30' };
  const she = lc.render('experience', Object.assign({ pronoun: 'she' }, base), LH, TODAY).paragraphs.join(' ');
  assert.match(she, /her conduct and performance .* wish her every success in her future/);
  const they = lc.render('experience', Object.assign({ pronoun: 'they' }, base), LH, TODAY).paragraphs.join(' ');
  assert.match(they, /their conduct .* wish them every success in their future/);
  const withId = lc.render('experience', Object.assign({ employee_id: 'E123', pronoun: 'he' }, base), LH, TODAY).paragraphs.join(' ');
  assert.match(withId, /Neha Jain \(Employee ID: E123\) was employed/);
});

test('warning letter keeps the facts text and lower-cases the level in the sentence', () => {
  const r = lc.render(
    'warning',
    {
      employee_name: 'Sam',
      designation: 'Support Lead',
      warning_level: 'Final',
      incident_date: '2026-10-01',
      issue: 'Left the shift early without informing.',
      improve_by: '2026-11-01',
    },
    LH,
    TODAY,
  );
  const text = r.paragraphs.join('\n');
  assert.match(text, /Subject: Final written warning/);
  assert.match(text, /is a final written warning/);
  assert.match(text, /Left the shift early without informing\./);
});

test('increment letter mentions the old CTC only when given', () => {
  const v = { employee_name: 'Ila', designation: 'Designer', effective_date: '2026-04-01', new_ctc: '1800000' };
  assert.doesNotMatch(lc.render('increment', v, LH, TODAY).paragraphs.join(' '), /earlier annual CTC/);
  const t = lc.render('increment', Object.assign({ old_ctc: '1500000' }, v), LH, TODAY).paragraphs.join(' ');
  assert.match(t, /Rs\. 18,00,000\/- \(Rupees Eighteen Lakh Only\)/);
  assert.match(t, /earlier annual CTC of Rs\. 15,00,000\/-/);
});

test('amount with paise keeps two decimals', () => {
  const t = lc
    .render('increment', { employee_name: 'A', designation: 'B', effective_date: '2026-04-01', new_ctc: '1800000.5' }, LH, TODAY)
    .paragraphs.join(' ');
  assert.match(t, /Rs\. 18,00,000\.50\//);
});

test('toText assembles a plain-text letter', () => {
  const r = lc.render(
    'confirmation',
    { employee_name: 'Ravi', designation: 'Engineer', joining_date: '2026-01-05', confirmation_date: '2026-07-05' },
    LH,
    TODAY,
  );
  const txt = lc.toText(r, LH);
  assert.ok(txt.startsWith('ACME TECHNOLOGIES PVT LTD\n1 Main Road, Pune 411001\n\nDate: 23 October 2026'));
  assert.match(txt, /Yours sincerely,\n\nAsha Rao\nHR Manager\nAcme Technologies Pvt Ltd$/);
});

test('sanitize: rupee sign, quotes, dashes, unsupported characters', () => {
  assert.equal(lc.sanitize('₹500 – "x" ‘y’'), 'Rs.500 - "x" \'y\'');
  assert.equal(lc.sanitize('हिन्दी'), '??????');
  assert.equal(lc.sanitize('café'), 'café');
});

test('wrap respects width, newlines and very long words', async () => {
  const doc = await PDFLib.PDFDocument.create();
  const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  const lines = lc.wrap('one two three four five six seven eight nine ten', font, 11, 80);
  assert.ok(lines.length > 3);
  lines.forEach((l) => assert.ok(font.widthOfTextAtSize(l, 11) <= 80));
  assert.deepEqual(lc.wrap('a\n\nb', font, 11, 200), ['a', '', 'b']);
  const long = lc.wrap('x'.repeat(200), font, 11, 100);
  long.forEach((l) => assert.ok(font.widthOfTextAtSize(l, 11) <= 100));
  assert.equal(long.join(''), 'x'.repeat(200));
});

test('buildPdf makes a real PDF; long letters flow to a second page; letter size works', async () => {
  const r = lc.render('offer', offerValues(), LH, TODAY);
  const bytes = await lc.buildPdf(PDFLib, r, LH, { pageSize: 'letter', font: 'times' });
  assert.equal(String.fromCharCode(...bytes.slice(0, 5)), '%PDF-');
  const d = await PDFLib.PDFDocument.load(bytes);
  assert.equal(Math.round(d.getPage(0).getSize().width), 612);
  const longLetter = {
    title: 'Long',
    date: '1 January 2026',
    paragraphs: Array.from({ length: 30 }, (_, i) => 'Paragraph ' + i + ' ' + 'lorem ipsum dolor sit amet '.repeat(12)),
  };
  const two = await PDFLib.PDFDocument.load(await lc.buildPdf(PDFLib, longLetter, LH));
  assert.ok(two.getPageCount() >= 2);
});

test('buildPdf copes with no letterhead and non-Latin text', async () => {
  const bytes = await lc.buildPdf(PDFLib, { title: 'T', date: '', paragraphs: ['नमस्ते and ₹100'] }, {});
  assert.ok(bytes.length > 400);
});

test('fileName', () => {
  assert.equal(lc.fileName({ title: 'Offer letter' }, { candidate_name: 'Ravi Kumar' }), 'Offer letter - Ravi Kumar.pdf');
  assert.equal(lc.fileName({ title: 'Warning letter' }, { employee_name: 'A/B' }), 'Warning letter - A_B.pdf');
});
