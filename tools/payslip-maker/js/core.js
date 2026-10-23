/**
 * Payslip Maker - core logic (pure; pdf-lib and fflate are passed in, shared helpers come from OT).
 *
 * A payslip is { emp: {id, name, designation, department, pan, bank, doj, days, paidDays},
 *                earnings: [{label, amount}], deductions: [{label, amount}] }.
 * Spreadsheet headers are matched by name: identity columns (Employee ID, Name, Designation, ...) and
 * pay columns. Pay columns are earnings unless the header looks like a deduction (PF, ESI, Tax, Loan, ...)
 * or starts with "D:". A header starting with "E:" forces an earning. "Gross"/"Net"/"Total" columns are ignored
 * because the tool adds everything up itself.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.PayslipCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();
  const r2 = (n) => Math.round(n * 100) / 100;

  const IDENTITY = {
    id: ['employee id', 'emp id', 'id', 'employee code', 'emp code'],
    name: ['name', 'employee name', 'employee'],
    designation: ['designation', 'title', 'position', 'role'],
    department: ['department', 'dept'],
    pan: ['pan', 'pan number'],
    bank: ['bank account', 'bank account number', 'account number', 'bank a/c', 'bank ac', 'account no'],
    doj: ['date of joining', 'doj', 'joining date'],
    days: ['days in month', 'working days', 'total days'],
    paidDays: ['days paid', 'paid days', 'days worked', 'payable days'],
  };
  const DEDUCTION_WORDS =
    /(^|\b)(pf|epf|provident|esi|esic|professional tax|pt|tds|income tax|tax|loan|advance|deduction|lwf|insurance premium|recovery|notice)(\b|$)/i;
  const SKIP_WORDS =
    /^(gross|gross salary|net|net pay|net salary|take home|total|total earnings|total deductions|ctc|sr|sr\.? no|s\.? no|#|month|remarks)$/i;

  /** Work out which columns are identity, earnings, deductions or ignored. */
  function classifyHeaders(headers) {
    const info = {};
    const earnings = [];
    const deductions = [];
    headers.forEach((raw, i) => {
      const h = norm(raw);
      if (!h) return;
      const low = h.toLowerCase();
      const key = Object.keys(IDENTITY).find((k) => IDENTITY[k].indexOf(low) !== -1);
      if (key) {
        if (info[key] === undefined) info[key] = i;
        return;
      }
      if (SKIP_WORDS.test(low)) return;
      if (/^e:\s*/i.test(h)) return earnings.push({ index: i, label: h.replace(/^e:\s*/i, '') });
      if (/^d:\s*/i.test(h)) return deductions.push({ index: i, label: h.replace(/^d:\s*/i, '') });
      (DEDUCTION_WORDS.test(low) ? deductions : earnings).push({ index: i, label: h });
    });
    return { info: info, earnings: earnings, deductions: deductions };
  }

  function amountOf(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = norm(v)
      .replace(/,/g, '')
      .replace(/^rs\.?\s*/i, '');
    if (s === '' || s === '-') return 0;
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
  }

  /** Mask an identifier, keeping the last `keep` characters: "ABCDE1234F" -> "XXXXXX234F". */
  function mask(value, keep) {
    const s = norm(value);
    const k = keep === undefined ? 4 : keep;
    if (s.length <= k) return s;
    return 'X'.repeat(s.length - k) + s.slice(-k);
  }

  /** Add up a payslip; throws for negative amounts. Returns a copy with gross, totalDeductions, net, netWords. */
  function compute(slip) {
    const clean = (list) =>
      list
        .map((x) => ({ label: norm(x.label), amount: r2(Number(x.amount)) }))
        .filter((x) => x.label && x.amount !== 0)
        .map((x) => {
          if (!Number.isFinite(x.amount) || x.amount < 0) throw new Error(x.label + ' must be a positive number.');
          return x;
        });
    const earnings = clean(slip.earnings);
    const deductions = clean(slip.deductions);
    if (!earnings.length) throw new Error('Add at least one earning.');
    if (earnings.length > 18 || deductions.length > 18) throw new Error('A payslip can show up to 18 earnings and 18 deductions.');
    const gross = r2(earnings.reduce((a, x) => a + x.amount, 0));
    const totalDeductions = r2(deductions.reduce((a, x) => a + x.amount, 0));
    const net = r2(gross - totalDeductions);
    if (net < 0) throw new Error('Deductions are more than earnings.');
    return Object.assign({}, slip, {
      earnings: earnings,
      deductions: deductions,
      gross: gross,
      totalDeductions: totalDeductions,
      net: net,
      netWords: OT.inrAmountText(net),
    });
  }

  /**
   * Spreadsheet rows (header row first) -> { slips, errors, classified }.
   * Rows with problems are skipped and reported by row number.
   */
  function rowsToSlips(aoa) {
    const rows = (aoa || []).filter((r) => Array.isArray(r) && r.some((c) => norm(c) !== ''));
    if (rows.length < 2) return { slips: [], errors: ['The file needs a header row and at least one employee.'], classified: null };
    const cl = classifyHeaders(rows[0]);
    if (cl.info.name === undefined) return { slips: [], errors: ['No Name column found.'], classified: cl };
    if (!cl.earnings.length) return { slips: [], errors: ['No earning columns found (for example Basic, HRA).'], classified: cl };
    const errors = [];
    const slips = [];
    rows.slice(1).forEach((r, i) => {
      const get = (k) => (cl.info[k] !== undefined ? norm(r[cl.info[k]]) : '');
      const name = get('name');
      if (!name) return errors.push('Row ' + (i + 2) + ': name is empty.');
      const read = (cols) =>
        cols.map((c) => {
          const a = amountOf(r[c.index]);
          if (a === null) throw new Error(c.label + ' is not a number');
          return { label: c.label, amount: a };
        });
      try {
        const slip = compute({
          emp: {
            id: get('id') || 'E' + String(i + 1).padStart(4, '0'),
            name: name,
            designation: get('designation'),
            department: get('department'),
            pan: get('pan'),
            bank: get('bank'),
            doj: OT.toIsoDate(r[cl.info.doj]) || '',
            days: get('days'),
            paidDays: get('paidDays'),
          },
          earnings: read(cl.earnings),
          deductions: read(cl.deductions),
        });
        slips.push(slip);
      } catch (e) {
        errors.push('Row ' + (i + 2) + ' (' + name + '): ' + e.message + '.');
      }
    });
    return { slips: slips, errors: errors, classified: cl };
  }

  function sanitize(s) {
    return String(s)
      .replace(/\u20b9/g, 'Rs.')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[^\u0020-\u007e\u00a0-\u00ff]/g, '?');
  }

  /** Month label "October 2026" from "2026-10". */
  function periodLabel(ym) {
    const m = /^(\d{4})-(\d{2})$/.exec(ym || '');
    if (!m || +m[2] < 1 || +m[2] > 12) throw new Error('Choose the pay month.');
    return OT.formatDate(ym + '-01').replace(/^1 /, '');
  }

  /** One payslip page. company: { name, address }. opts: { maskIds } (default true). */
  async function drawSlip(doc, fonts, slip, company, period, opts) {
    const { rgb } = fonts;
    const { font, bold } = fonts;
    const maskIds = !opts || opts.maskIds !== false;
    const page = doc.addPage([595.28, 841.89]);
    const W = 595.28;
    const M = 44;
    let y = 841.89 - M;
    const put = (s, x, size, f, right) => {
      const t = sanitize(s);
      page.drawText(t, {
        x: right ? x - (f || font).widthOfTextAtSize(t, size) : x,
        y: y,
        size: size,
        font: f || font,
        color: rgb(0.1, 0.1, 0.12),
      });
    };
    const company_ = company || {};
    if (company_.name) {
      put(company_.name, M, 15, bold);
      y -= 16;
    }
    if (company_.address) {
      put(company_.address.slice(0, 110), M, 9, font);
      y -= 14;
    }
    y -= 4;
    page.drawLine({ start: { x: M, y: y }, end: { x: W - M, y: y }, thickness: 1, color: rgb(0.3, 0.3, 0.35) });
    y -= 20;
    put('PAYSLIP FOR ' + period.toUpperCase(), M, 12, bold);
    y -= 22;
    const e = slip.emp;
    const left = [
      ['Employee name', e.name],
      ['Employee ID', e.id],
      ['Designation', e.designation],
      ['Department', e.department],
    ];
    const right = [
      ['Date of joining', e.doj ? OT.formatDate(e.doj) : ''],
      ['Days paid / month', [e.paidDays, e.days].filter(Boolean).join(' / ')],
      ['PAN', e.pan ? (maskIds ? mask(e.pan) : e.pan) : ''],
      ['Bank a/c', e.bank ? (maskIds ? mask(e.bank) : e.bank) : ''],
    ];
    for (let i = 0; i < 4; i++) {
      put(left[i][0] + ':', M, 9, font);
      put(left[i][1] || '-', M + 85, 9, bold);
      put(right[i][0] + ':', 320, 9, font);
      put(right[i][1] || '-', 320 + 90, 9, bold);
      y -= 14;
    }
    y -= 8;
    // two columns: earnings | deductions
    const colW = (W - 2 * M - 16) / 2;
    const xL = M;
    const xR = M + colW + 16;
    page.drawRectangle({ x: xL, y: y - 4, width: colW, height: 16, color: rgb(0.92, 0.94, 0.97) });
    page.drawRectangle({ x: xR, y: y - 4, width: colW, height: 16, color: rgb(0.92, 0.94, 0.97) });
    put('Earnings', xL + 6, 10, bold);
    put('Amount (Rs.)', xL + colW - 6, 10, bold, true);
    put('Deductions', xR + 6, 10, bold);
    put('Amount (Rs.)', xR + colW - 6, 10, bold, true);
    y -= 20;
    const n = Math.max(slip.earnings.length, slip.deductions.length, 1);
    for (let i = 0; i < n; i++) {
      const a = slip.earnings[i];
      const d = slip.deductions[i];
      if (a) {
        put(a.label.slice(0, 30), xL + 6, 10, font);
        put(OT.formatInr(a.amount, 2), xL + colW - 6, 10, font, true);
      }
      if (d) {
        put(d.label.slice(0, 30), xR + 6, 10, font);
        put(OT.formatInr(d.amount, 2), xR + colW - 6, 10, font, true);
      }
      y -= 16;
    }
    y -= 4;
    page.drawLine({ start: { x: M, y: y + 10 }, end: { x: W - M, y: y + 10 }, thickness: 0.6, color: rgb(0.6, 0.6, 0.65) });
    put('Gross earnings', xL + 6, 10, bold);
    put(OT.formatInr(slip.gross, 2), xL + colW - 6, 10, bold, true);
    put('Total deductions', xR + 6, 10, bold);
    put(OT.formatInr(slip.totalDeductions, 2), xR + colW - 6, 10, bold, true);
    y -= 28;
    page.drawRectangle({ x: M, y: y - 8, width: W - 2 * M, height: 28, color: rgb(0.9, 0.96, 0.92) });
    put('NET PAY', M + 8, 12, bold);
    put('Rs. ' + OT.formatInr(slip.net, 2), W - M - 8, 12, bold, true);
    y -= 22;
    put(slip.netWords, M, 9, font);
    y -= 40;
    put('This is a computer-generated payslip and does not require a signature.', M, 8, font);
    return page;
  }

  async function makeDoc(PDFLib) {
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.create();
    doc.setCreator('HR Pocket Tools');
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    return { doc: doc, fonts: { font: font, bold: bold, rgb: rgb } };
  }

  /** PDF of one payslip. */
  async function buildPdf(PDFLib, slip, company, period, opts) {
    const d = await makeDoc(PDFLib);
    d.doc.setTitle('Payslip - ' + sanitize(slip.emp.name) + ' - ' + period);
    await drawSlip(d.doc, d.fonts, slip, company, period, opts);
    return d.doc.save();
  }

  /** One PDF with a page per employee. */
  async function buildCombinedPdf(PDFLib, slips, company, period, opts) {
    if (!slips.length) throw new Error('Add at least one payslip.');
    const d = await makeDoc(PDFLib);
    d.doc.setTitle('Payslips - ' + period);
    for (const s of slips) await drawSlip(d.doc, d.fonts, s, company, period, opts);
    return d.doc.save();
  }

  /** File names like "Payslip_E0001_Ravi Kumar_October 2026.pdf", unique within a batch. */
  function fileNames(slips, period) {
    const used = new Map();
    return slips.map((s) => {
      const base = OT.safeFileName('Payslip_' + s.emp.id + '_' + s.emp.name + '_' + period).slice(0, 120);
      const n = (used.get(base) || 0) + 1;
      used.set(base, n);
      return base + (n > 1 ? ' (' + n + ')' : '') + '.pdf';
    });
  }

  /** ZIP of one PDF per employee. */
  async function buildZip(PDFLib, fflate, slips, company, period, opts) {
    if (!slips.length) throw new Error('Add at least one payslip.');
    const names = fileNames(slips, period);
    const files = {};
    for (let i = 0; i < slips.length; i++) files[names[i]] = [await buildPdf(PDFLib, slips[i], company, period, opts), { level: 0 }];
    return fflate.zipSync(files);
  }

  /** A starter sheet (array of arrays) people can fill in. */
  function sampleRows() {
    return [
      [
        'Employee ID',
        'Name',
        'Designation',
        'Department',
        'Date of Joining',
        'Days in Month',
        'Days Paid',
        'Basic',
        'HRA',
        'Special Allowance',
        'Conveyance',
        'PF',
        'Professional Tax',
        'TDS',
      ],
      ['E001', 'Ravi Kumar', 'Software Engineer', 'Engineering', '2024-04-01', 31, 31, 40000, 20000, 33276.92, 1600, 4800, 200, 6500],
      ['E002', 'Meera Shah', 'HR Executive', 'HR', '2023-08-16', 31, 29, 25000, 12500, 12000, 1600, 3000, 200, 0],
    ];
  }

  function sampleCsv() {
    return (
      '\ufeff' +
      sampleRows()
        .map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v))).join(','))
        .join('\r\n')
    );
  }

  return {
    classifyHeaders: classifyHeaders,
    amountOf: amountOf,
    mask: mask,
    compute: compute,
    rowsToSlips: rowsToSlips,
    periodLabel: periodLabel,
    sanitize: sanitize,
    buildPdf: buildPdf,
    buildCombinedPdf: buildCombinedPdf,
    fileNames: fileNames,
    buildZip: buildZip,
    sampleRows: sampleRows,
    sampleCsv: sampleCsv,
  };
});
