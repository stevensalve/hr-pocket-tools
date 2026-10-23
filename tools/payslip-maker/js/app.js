/* Payslip Maker - user interface. Reading the sheet, adding up and drawing PDFs live in core.js. */
(function () {
  'use strict';

  const { setStatus, bindDropzone, readArrayBuffer, downloadBlob, el } = OT;
  const $ = (id) => document.getElementById(id);
  const MAX = 1000;

  let slips = [];

  const company = () => ({ name: $('company').value.trim(), address: $('address').value.trim() });
  const opts = () => ({ maskIds: $('mask').checked });
  function period() {
    return PayslipCore.periodLabel($('month').value);
  }

  function load(aoa, label) {
    const r = PayslipCore.rowsToSlips(aoa);
    slips = r.slips.slice(0, MAX);
    setStatus(
      $('load-status'),
      (slips.length ? label + ': ' + slips.length + ' payslip(s) ready. ' : '') +
        r.errors.slice(0, 3).join(' ') +
        (r.errors.length > 3 ? ' (+' + (r.errors.length - 3) + ' more problems)' : ''),
      r.errors.length ? 'warn' : 'ok',
    );
    render();
  }

  bindDropzone($('drop'), $('file-input'), async (files) => {
    try {
      const wb = XLSX.read(await readArrayBuffer(files[0]), { type: 'array' });
      load(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false, blankrows: false }), files[0].name);
    } catch (e) {
      setStatus($('load-status'), 'Could not open that file. Is it a valid Excel or CSV file?', 'error');
    }
  });
  $('sample').addEventListener('click', () => downloadBlob(PayslipCore.sampleCsv(), 'payslip-sample.csv', 'text/csv;charset=utf-8'));
  $('demo').addEventListener('click', () => load(PayslipCore.sampleRows(), 'Sample data (made up)'));

  function render() {
    const body = $('rows');
    body.textContent = '';
    slips.forEach(function (s, i) {
      const pdf = el('button', { type: 'button', text: 'PDF', 'aria-label': 'Download payslip PDF for ' + s.emp.name });
      pdf.addEventListener('click', async () => {
        try {
          const bytes = await PayslipCore.buildPdf(PDFLib, s, company(), period(), opts());
          downloadBlob(new Blob([bytes], { type: 'application/pdf' }), PayslipCore.fileNames([s], period())[0]);
        } catch (e) {
          setStatus($('out-status'), e.message, 'error');
        }
      });
      const rm = el('button', { type: 'button', text: 'Remove', 'aria-label': 'Remove ' + s.emp.name });
      rm.addEventListener('click', () => {
        slips.splice(i, 1);
        render();
      });
      body.appendChild(
        el('tr', {}, [
          el('td', { text: s.emp.id }),
          el('td', { text: s.emp.name }),
          el('td', { class: 'num', text: OT.formatInr(s.gross, 2) }),
          el('td', { class: 'num', text: OT.formatInr(s.totalDeductions, 2) }),
          el('td', { class: 'num', text: OT.formatInr(s.net, 2) }),
          el('td', {}, [pdf, document.createTextNode(' '), rm]),
        ]),
      );
    });
    $('list').hidden = !slips.length;
    ['zip', 'one', 'clear'].forEach((id) => ($(id).disabled = !slips.length));
  }

  async function make(kind) {
    try {
      const p = period();
      setStatus($('out-status'), 'Creating payslips...');
      if (kind === 'zip') {
        const zip = await PayslipCore.buildZip(PDFLib, fflate, slips, company(), p, opts());
        downloadBlob(new Blob([zip], { type: 'application/zip' }), 'payslips-' + p.replace(/ /g, '-') + '.zip');
      } else {
        const bytes = await PayslipCore.buildCombinedPdf(PDFLib, slips, company(), p, opts());
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'payslips-' + p.replace(/ /g, '-') + '.pdf');
      }
      setStatus($('out-status'), 'Done: ' + slips.length + ' payslip(s).', 'ok');
    } catch (e) {
      setStatus($('out-status'), e.message, 'error');
    }
  }
  $('zip').addEventListener('click', () => make('zip'));
  $('one').addEventListener('click', () => make('one'));
  $('clear').addEventListener('click', () => {
    slips = [];
    setStatus($('load-status'), '');
    render();
  });

  const d = new Date();
  $('month').value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  render();
})();
