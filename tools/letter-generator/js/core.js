/**
 * Letter Generator - core logic (pure; pdf-lib is passed in, shared helpers come from OT).
 *
 * A template is plain data: { id, title, fields: [...], paragraphs: ["text with {{placeholders}}", ...] }.
 * Field types: text, textarea, date, amount (rupees), number, select, pronoun.
 * Derived placeholders: for an amount "ctc" -> {{ctc}} (12,50,000), {{ctc_words}} (Rupees ... Only);
 * for a date "joining_date" -> {{joining_date}} (23 October 2026); for a pronoun field -> {{he}} {{him}} {{his}} {{He}} {{His}}.
 * The letterhead values are available as {{company}}, {{signatory}}, {{signatory_title}} and {{today}}.
 * The templates are plain samples: have your legal/HR team review them before real use.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.LetterCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const f = (key, label, type, extra) => Object.assign({ key: key, label: label, type: type, required: true }, extra);
  const NAME = f('employee_name', 'Employee name', 'text');
  const EID = f('employee_id', 'Employee ID', 'text', { required: false });
  const DESIG = f('designation', 'Designation', 'text');
  const PRONOUN = f('pronoun', 'Pronouns', 'pronoun', { options: ['he', 'she', 'they'], default: 'they' });

  const TEMPLATES = [
    {
      id: 'offer',
      title: 'Offer letter',
      fields: [
        f('candidate_name', 'Candidate name', 'text'),
        f('designation', 'Designation', 'text'),
        f('department', 'Department', 'text', { required: false }),
        f('joining_date', 'Date of joining', 'date'),
        f('annual_ctc', 'Annual CTC (Rs.)', 'amount'),
        f('work_location', 'Work location', 'text'),
        f('reporting_to', 'Reporting to', 'text', { required: false }),
        f('probation_months', 'Probation (months)', 'number', { default: '6' }),
        f('notice_days', 'Notice period (days)', 'number', { default: '60' }),
        f('valid_till', 'Offer valid until', 'date'),
      ],
      paragraphs: [
        'Dear {{candidate_name}},',
        'We are pleased to offer you the position of {{designation}}{{department_clause}} at {{company}}, based at {{work_location}}. We were impressed with your background and look forward to you joining the team.',
        'Your date of joining will be {{joining_date}}. {{reporting_clause}}',
        'Your annual cost to company (CTC) will be Rs. {{annual_ctc}}/- ({{annual_ctc_words}}), payable as per the company payroll policy. A detailed salary breakup will be shared with your appointment letter. All payments are subject to applicable statutory deductions.',
        'You will be on probation for {{probation_months}} months from your date of joining. Either party may end the employment by giving {{notice_days}} days written notice or pay in lieu of the notice period, as per company policy.',
        'This offer is subject to satisfactory verification of your documents, references and background, and to your signing the company policies on joining. This offer is valid until {{valid_till}}; please sign and return a copy to confirm your acceptance.',
        'We welcome you to {{company}} and wish you a rewarding career with us.',
      ],
    },
    {
      id: 'confirmation',
      title: 'Confirmation letter (end of probation)',
      fields: [
        NAME,
        EID,
        DESIG,
        f('joining_date', 'Date of joining', 'date'),
        f('confirmation_date', 'Confirmed with effect from', 'date'),
      ],
      paragraphs: [
        'Dear {{employee_name}},',
        'We are pleased to inform you that, following a review of your performance during your probation period, your services as {{designation}} at {{company}} are confirmed with effect from {{confirmation_date}}.',
        'All other terms and conditions of your appointment dated {{joining_date}} remain unchanged. We thank you for your contribution so far and look forward to your continued success with us.',
      ],
    },
    {
      id: 'increment',
      title: 'Salary revision letter',
      fields: [
        NAME,
        EID,
        DESIG,
        f('effective_date', 'Effective from', 'date'),
        f('old_ctc', 'Current annual CTC (Rs.)', 'amount', { required: false }),
        f('new_ctc', 'Revised annual CTC (Rs.)', 'amount'),
      ],
      paragraphs: [
        'Dear {{employee_name}},',
        'In recognition of your performance and contribution as {{designation}}, we are pleased to revise your annual cost to company (CTC) to Rs. {{new_ctc}}/- ({{new_ctc_words}}) with effect from {{effective_date}}.{{old_ctc_clause}}',
        'Your revised salary breakup will be shared separately. All other terms of your employment remain unchanged. This letter is confidential; please do not share it.',
        'Congratulations, and thank you for your commitment to {{company}}.',
      ],
    },
    {
      id: 'warning',
      title: 'Warning letter',
      fields: [
        NAME,
        EID,
        DESIG,
        f('warning_level', 'Warning level', 'select', { options: ['First', 'Second', 'Final'], default: 'First' }),
        f('incident_date', 'Date of the incident', 'date'),
        f('issue', 'What happened (facts only)', 'textarea'),
        f('improve_by', 'Improvement expected by', 'date'),
      ],
      paragraphs: [
        'Dear {{employee_name}},',
        'Subject: {{warning_level}} written warning',
        'This letter is a {{warning_level|lower}} written warning regarding the following matter, which occurred on {{incident_date}}:',
        '{{issue}}',
        'This conduct is not in line with the expectations of your role as {{designation}} and the policies of {{company}}. You are required to show immediate and sustained improvement by {{improve_by}}.',
        'Please note that further instances may lead to disciplinary action, up to and including termination of employment, as per company policy. You may share your written response with HR within 3 working days of receiving this letter.',
      ],
    },
    {
      id: 'experience',
      title: 'Experience letter',
      fields: [
        NAME,
        EID,
        DESIG,
        f('department', 'Department', 'text', { required: false }),
        f('joining_date', 'Date of joining', 'date'),
        f('last_working_date', 'Last working day', 'date'),
        PRONOUN,
      ],
      paragraphs: [
        'TO WHOMSOEVER IT MAY CONCERN',
        'This is to certify that {{employee_name}}{{id_clause}} was employed with {{company}} as {{designation}}{{department_clause}} from {{joining_date}} to {{last_working_date}}.',
        'During this period, {{his}} conduct and performance were found to be satisfactory. We wish {{him}} every success in {{his}} future endeavours.',
      ],
    },
    {
      id: 'relieving',
      title: 'Relieving letter',
      fields: [
        NAME,
        EID,
        DESIG,
        f('resignation_date', 'Resignation date', 'date'),
        f('last_working_date', 'Last working day', 'date'),
        PRONOUN,
      ],
      paragraphs: [
        'Dear {{employee_name}},',
        'This is with reference to your resignation dated {{resignation_date}}. We confirm that you have been relieved from your duties as {{designation}} at {{company}} at the close of business on {{last_working_date}}.',
        'Your full and final settlement will be processed as per company policy, subject to the completion of the exit formalities and the return of company assets. We thank you for your contribution and wish you the very best in your future career.',
      ],
    },
  ];

  const PRONOUNS = {
    he: { he: 'he', him: 'him', his: 'his' },
    she: { he: 'she', him: 'her', his: 'her' },
    they: { he: 'they', him: 'them', his: 'their' },
  };

  const getTemplate = (id) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) throw new Error('Unknown letter type: ' + id);
    return t;
  };

  /** Default field values (today's date goes in via `today`). */
  function defaults(id) {
    const out = {};
    getTemplate(id).fields.forEach((fl) => (out[fl.key] = fl.default === undefined ? '' : fl.default));
    return out;
  }

  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  /**
   * Fill a template. values: field values (strings). letterhead: { company, signatory, signatory_title }. today: "YYYY-MM-DD".
   * Returns { title, date, paragraphs, missing: [labels of required fields left empty], problems: [text about invalid values] }.
   */
  function render(id, values, letterhead, today) {
    const t = getTemplate(id);
    const lh = letterhead || {};
    const v = values || {};
    const vars = {
      company: lh.company || '[Company name]',
      signatory: lh.signatory || '',
      signatory_title: lh.signatory_title || '',
      today: today ? OT.formatDate(today) : '',
    };
    const missing = [];
    const problems = [];
    t.fields.forEach((fl) => {
      const raw = String(v[fl.key] === undefined ? '' : v[fl.key]).trim();
      if (!raw && fl.required) missing.push(fl.label);
      if (fl.type === 'date') {
        try {
          vars[fl.key] = raw ? OT.formatDate(raw) : '';
        } catch (e) {
          vars[fl.key] = '';
          problems.push(fl.label + ': ' + e.message);
        }
      } else if (fl.type === 'amount') {
        const n = raw ? OT.parseAmount(raw) : null;
        if (raw && n === null) problems.push(fl.label + ' must be a plain number such as 1250000 or 12,50,000.');
        vars[fl.key] = n === null ? '' : OT.formatInr(n, n % 1 ? 2 : 0);
        vars[fl.key + '_words'] = n === null ? '' : 'Rupees ' + OT.inrWords(Math.floor(n)) + ' Only';
      } else if (fl.type === 'pronoun') {
        const p = PRONOUNS[raw] || PRONOUNS.they;
        vars.he = p.he;
        vars.him = p.him;
        vars.his = p.his;
        vars.He = cap(p.he);
        vars.His = cap(p.his);
      } else vars[fl.key] = raw;
    });
    // Optional clauses: appear only when the field is filled in.
    vars.department_clause = vars.department ? ' in the ' + vars.department + ' department' : '';
    vars.reporting_clause = vars.reporting_to ? 'You will report to ' + vars.reporting_to + '.' : '';
    vars.id_clause = vars.employee_id ? ' (Employee ID: ' + vars.employee_id + ')' : '';
    vars.old_ctc_clause = vars.old_ctc ? ' This replaces your earlier annual CTC of Rs. ' + vars.old_ctc + '/-.' : '';

    const unknown = new Set();
    const paragraphs = t.paragraphs
      .map((p) =>
        p
          .replace(/\{\{\s*([\w]+)(?:\|(lower))?\s*\}\}/g, function (m, key, mod) {
            if (!(key in vars)) {
              unknown.add(key);
              return m;
            }
            const val = String(vars[key]);
            return mod === 'lower' ? val.toLowerCase() : val;
          })
          .replace(/\s+([.,])/g, '$1')
          .replace(/ {2,}/g, ' ')
          .trim(),
      )
      .filter((p) => p);
    if (unknown.size) problems.push('Unknown placeholders: ' + Array.from(unknown).join(', '));
    return { title: t.title, date: vars.today, paragraphs: paragraphs, missing: missing, problems: problems };
  }

  /** Plain text of a rendered letter (for copy/paste). */
  function toText(letter, letterhead) {
    const lh = letterhead || {};
    const out = [];
    if (lh.company) out.push(lh.company.toUpperCase());
    if (lh.address) out.push(lh.address);
    if (out.length) out.push('');
    if (letter.date) out.push('Date: ' + letter.date, '');
    out.push(letter.paragraphs.join('\n\n'), '', 'Yours sincerely,');
    if (lh.signatory) out.push('', lh.signatory + (lh.signatory_title ? '\n' + lh.signatory_title : ''));
    if (lh.company) out.push(lh.company);
    return out.join('\n');
  }

  /** The standard PDF fonts only cover Latin-1; swap the rupee sign for "Rs." and anything else for "?". */
  function sanitize(s) {
    return String(s)
      .replace(/₹/g, 'Rs.')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/[^ -~\u00a0-ÿ\n]/g, '?');
  }

  function wrap(text, font, size, maxWidth) {
    const out = [];
    sanitize(text)
      .split('\n')
      .forEach((para) => {
        let line = '';
        para.split(/\s+/).forEach((word) => {
          if (!word) return;
          const test = line ? line + ' ' + word : word;
          if (font.widthOfTextAtSize(test, size) <= maxWidth) line = test;
          else {
            if (line) out.push(line);
            line = word;
            while (font.widthOfTextAtSize(line, size) > maxWidth && line.length > 1) {
              let cut = line.length - 1;
              while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > maxWidth) cut--;
              out.push(line.slice(0, cut));
              line = line.slice(cut);
            }
          }
        });
        out.push(line);
      });
    return out;
  }

  /**
   * Build the PDF. letterhead: { company, address, signatory, signatory_title }.
   * opts: { pageSize: 'a4' | 'letter', font: 'helvetica' | 'times', fontSize }.
   */
  async function buildPdf(PDFLib, letter, letterhead, opts) {
    const o = Object.assign({ pageSize: 'a4', font: 'helvetica', fontSize: 11 }, opts);
    const lh = letterhead || {};
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.create();
    doc.setTitle(sanitize(letter.title));
    doc.setCreator('HR Pocket Tools');
    const regular = await doc.embedFont(o.font === 'times' ? StandardFonts.TimesRoman : StandardFonts.Helvetica);
    const bold = await doc.embedFont(o.font === 'times' ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold);
    const [W, H] = o.pageSize === 'letter' ? [612, 792] : [595.28, 841.89];
    const margin = 64;
    const maxW = W - 2 * margin;
    const lineH = o.fontSize * 1.5;
    let page = doc.addPage([W, H]);
    let y = H - margin;
    const need = (h) => {
      if (y - h < margin) {
        page = doc.addPage([W, H]);
        y = H - margin;
      }
    };
    const draw = (txt, x, size, font, color) =>
      page.drawText(txt, { x: x, y: y, size: size, font: font, color: color || rgb(0.08, 0.08, 0.1) });

    if (lh.company) {
      const name = sanitize(lh.company);
      draw(name, (W - bold.widthOfTextAtSize(name, 16)) / 2, 16, bold);
      y -= 18;
      wrap(lh.address || '', regular, 9, maxW).forEach((ln) => {
        if (!ln) return;
        draw(ln, (W - regular.widthOfTextAtSize(ln, 9)) / 2, 9, regular, rgb(0.35, 0.35, 0.4));
        y -= 12;
      });
      page.drawLine({ start: { x: margin, y: y }, end: { x: W - margin, y: y }, thickness: 0.8, color: rgb(0.6, 0.6, 0.65) });
      y -= 26;
    }
    if (letter.date) {
      const d = 'Date: ' + sanitize(letter.date);
      draw(d, W - margin - regular.widthOfTextAtSize(d, o.fontSize), o.fontSize, regular);
      y -= lineH * 1.5;
    }
    const heading = sanitize(letter.title).toUpperCase();
    draw(heading, (W - bold.widthOfTextAtSize(heading, 12)) / 2, 12, bold);
    y -= lineH * 1.6;
    letter.paragraphs.forEach((p) => {
      const isSubject = /^Subject:/.test(p);
      const lines = wrap(p, isSubject ? bold : regular, o.fontSize, maxW);
      lines.forEach((ln) => {
        need(lineH);
        if (ln) draw(ln, margin, o.fontSize, isSubject ? bold : regular);
        y -= lineH;
      });
      y -= lineH * 0.45;
    });
    need(lineH * 7);
    y -= lineH * 0.5;
    draw('Yours sincerely,', margin, o.fontSize, regular);
    y -= lineH * 3.2;
    if (lh.signatory) {
      draw(sanitize(lh.signatory), margin, o.fontSize, bold);
      y -= lineH;
    }
    if (lh.signatory_title) {
      draw(sanitize(lh.signatory_title), margin, o.fontSize, regular);
      y -= lineH;
    }
    if (lh.company) draw(sanitize(lh.company), margin, o.fontSize, regular);
    return doc.save();
  }

  function fileName(letter, values) {
    const who = values.candidate_name || values.employee_name || 'letter';
    return OT.safeFileName(letter.title + ' - ' + who) + '.pdf';
  }

  return {
    TEMPLATES: TEMPLATES,
    getTemplate: getTemplate,
    defaults: defaults,
    render: render,
    toText: toText,
    sanitize: sanitize,
    wrap: wrap,
    buildPdf: buildPdf,
    fileName: fileName,
  };
});
