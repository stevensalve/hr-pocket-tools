/**
 * ID Card Maker - core logic (pure; pdf-lib is passed in, shared helpers come from OT).
 *
 * Cards are CR80 size (85.6 x 54 mm, the same as a bank card) laid out on A4 or Letter sheets with gaps for cutting.
 * The back side (optional) is placed on a second page per sheet with columns mirrored so that a
 * double-sided print (flip on the long edge) lines up.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./common.js'));
  } else {
    root.CardCore = factory(root.OT);
  }
})(typeof self !== 'undefined' ? self : this, function (OT) {
  'use strict';

  const MM = 72 / 25.4;
  const CARD = { long: 85.6 * MM, short: 54 * MM };
  const norm = (s) =>
    String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ')
      .trim();

  const HEADERS = {
    name: ['name', 'employee name', 'full name'],
    id: ['employee id', 'emp id', 'id', 'employee code', 'emp code'],
    designation: ['designation', 'title', 'role', 'position'],
    department: ['department', 'dept'],
    blood: ['blood group', 'blood', 'blood type'],
    phone: ['emergency contact', 'emergency phone', 'phone', 'mobile', 'contact'],
    valid: ['valid till', 'valid until', 'valid upto', 'expiry', 'expiry date'],
  };

  /** Spreadsheet rows -> { people, errors }. Needs Name and Employee ID. */
  function rowsToPeople(aoa) {
    const rows = (aoa || []).filter((r) => Array.isArray(r) && r.some((c) => norm(c) !== ''));
    if (rows.length < 2) return { people: [], errors: ['The file needs a header row and at least one employee.'] };
    const head = rows[0].map((h) => norm(h).toLowerCase());
    const col = {};
    Object.keys(HEADERS).forEach((k) => {
      const i = head.findIndex((h) => HEADERS[k].indexOf(h) !== -1);
      if (i !== -1) col[k] = i;
    });
    if (col.name === undefined || col.id === undefined)
      return { people: [], errors: ['Both a Name column and an Employee ID column are needed.'] };
    const errors = [];
    const people = [];
    const seen = new Set();
    rows.slice(1).forEach((r, i) => {
      const get = (k) => (col[k] !== undefined ? norm(r[col[k]]) : '');
      const name = get('name');
      const id = get('id');
      if (!name || !id) return errors.push('Row ' + (i + 2) + ': name and employee ID are both needed.');
      if (seen.has(id.toLowerCase())) return errors.push('Row ' + (i + 2) + ': employee ID ' + id + ' appears twice.');
      seen.add(id.toLowerCase());
      let valid = get('valid');
      if (valid) valid = OT.toIsoDate(r[col.valid]) ? OT.formatDate(OT.toIsoDate(r[col.valid])) : valid;
      people.push({
        name: name,
        id: id,
        designation: get('designation'),
        department: get('department'),
        blood: get('blood'),
        phone: get('phone'),
        valid: valid,
      });
    });
    return { people: people, errors: errors };
  }

  /** "Ravi Kumar" -> "RK". */
  function initials(name) {
    const parts = norm(name).split(' ').filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  /**
   * Match photo files to people by file name (without extension): "E001.jpg" matches employee ID E001;
   * "Ravi Kumar.png" matches the name. Case-insensitive. Returns { matched: { id: fileName }, unmatchedFiles: [...], withoutPhoto: [ids] }.
   */
  function matchPhotos(people, fileNames) {
    const byKey = new Map();
    people.forEach((p) => {
      byKey.set(p.id.toLowerCase(), p.id);
      if (!byKey.has(p.name.toLowerCase())) byKey.set(p.name.toLowerCase(), p.id);
    });
    const matched = {};
    const unmatchedFiles = [];
    fileNames.forEach((f) => {
      const key = f
        .replace(/\.[^.]+$/, '')
        .trim()
        .toLowerCase();
      const id = byKey.get(key);
      if (id && !matched[id]) matched[id] = f;
      else unmatchedFiles.push(f);
    });
    return { matched: matched, unmatchedFiles: unmatchedFiles, withoutPhoto: people.filter((p) => !matched[p.id]).map((p) => p.id) };
  }

  const PAGES = { a4: [595.28, 841.89], letter: [612, 792] };

  /**
   * Grid of cards on a sheet. opts: { pageSize, orientation: "landscape"|"portrait" (card shape), gap (mm) }.
   * Returns { cols, rows, perPage, cardW, cardH, pageW, pageH, cell(i, mirror) -> { x, y } (bottom-left, PDF points) }.
   */
  function layout(opts) {
    const o = Object.assign({ pageSize: 'a4', orientation: 'landscape', gap: 2 }, opts);
    if (!PAGES[o.pageSize]) throw new Error('Unknown page size.');
    const [pageW, pageH] = PAGES[o.pageSize];
    const cardW = o.orientation === 'portrait' ? CARD.short : CARD.long;
    const cardH = o.orientation === 'portrait' ? CARD.long : CARD.short;
    const gap = Math.max(0, Math.min(15, Number(o.gap) || 0)) * MM;
    const margin = 8 * MM;
    const cols = Math.max(1, Math.floor((pageW - 2 * margin + gap) / (cardW + gap)));
    const rows = Math.max(1, Math.floor((pageH - 2 * margin + gap) / (cardH + gap)));
    const gridW = cols * cardW + (cols - 1) * gap;
    const gridH = rows * cardH + (rows - 1) * gap;
    const x0 = (pageW - gridW) / 2;
    const yTop = pageH - (pageH - gridH) / 2;
    return {
      cols: cols,
      rows: rows,
      perPage: cols * rows,
      cardW: cardW,
      cardH: cardH,
      pageW: pageW,
      pageH: pageH,
      cell: (i, mirror) => {
        const n = i % (cols * rows);
        const r = Math.floor(n / cols);
        const c = mirror ? cols - 1 - (n % cols) : n % cols;
        return { x: x0 + c * (cardW + gap), y: yTop - (r + 1) * cardH - r * gap };
      },
    };
  }

  function hexToRgb(rgb, hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    const v = m ? parseInt(m[1], 16) : 0x1d4ed8;
    return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
  }

  const sanitize = (s) =>
    String(s)
      .replace(/₹/g, 'Rs.')
      .replace(/[^ -~\u00a0-ÿ]/g, '?');

  function fitText(font, text, size, maxW) {
    let t = sanitize(text);
    while (t.length > 1 && font.widthOfTextAtSize(t, size) > maxW) t = t.slice(0, -1);
    return t.length < sanitize(text).length ? t.slice(0, -1) + '.' : t;
  }

  /** Embed an image {bytes, type: "jpg"|"png"} and draw it "cover"-style (fills the box, cropping the overflow). */
  async function drawCover(PDFLib, doc, page, img, x, y, w, h) {
    const e = img.type === 'png' ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
    const k = Math.max(w / e.width, h / e.height);
    const dw = e.width * k;
    const dh = e.height * k;
    page.pushOperators(PDFLib.pushGraphicsState(), PDFLib.rectangle(x, y, w, h), PDFLib.clip(), PDFLib.endPath());
    page.drawImage(e, { x: x + (w - dw) / 2, y: y + (h - dh) / 2, width: dw, height: dh });
    page.pushOperators(PDFLib.popGraphicsState());
  }

  /**
   * Build the PDF. opts: { company, address, accent (hex), pageSize, orientation, gap, withBack, photos: {id: {bytes,type}}, logo: {bytes,type},
   *   backNote (text printed on the back), cutMarks }
   */
  async function buildPdf(PDFLib, people, options) {
    const o = Object.assign(
      {
        company: '',
        address: '',
        accent: '#1d4ed8',
        pageSize: 'a4',
        orientation: 'landscape',
        gap: 2,
        withBack: false,
        photos: {},
        logo: null,
        backNote: 'If found, please return to the address below.',
        cutMarks: true,
      },
      options,
    );
    if (!people.length) throw new Error('Add at least one employee.');
    const L = layout(o);
    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const doc = await PDFDocument.create();
    doc.setTitle('Employee ID cards');
    doc.setCreator('HR Pocket Tools');
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const accent = hexToRgb(rgb, o.accent);
    const dark = rgb(0.1, 0.1, 0.12);
    const grey = rgb(0.4, 0.4, 0.45);
    const portrait = o.orientation === 'portrait';
    const W = L.cardW;
    const H = L.cardH;

    const marks = (page, x, y) => {
      if (!o.cutMarks) return;
      const t = 3;
      [
        [x, y],
        [x + W, y],
        [x, y + H],
        [x + W, y + H],
      ].forEach(([cx, cy]) => {
        page.drawLine({ start: { x: cx - t, y: cy }, end: { x: cx + t, y: cy }, thickness: 0.3, color: grey });
        page.drawLine({ start: { x: cx, y: cy - t }, end: { x: cx, y: cy + t }, thickness: 0.3, color: grey });
      });
    };

    const logoImg = o.logo ? (o.logo.type === 'png' ? await doc.embedPng(o.logo.bytes) : await doc.embedJpg(o.logo.bytes)) : null;

    async function front(page, p, x, y) {
      page.drawRectangle({ x: x, y: y, width: W, height: H, color: rgb(1, 1, 1), borderColor: rgb(0.75, 0.75, 0.8), borderWidth: 0.5 });
      const band = portrait ? 38 : 30;
      page.drawRectangle({ x: x, y: y + H - band, width: W, height: band, color: accent });
      let tx = x + 8;
      if (logoImg) {
        const k = Math.min((band - 8) / logoImg.height, 60 / logoImg.width);
        page.drawImage(logoImg, {
          x: x + 6,
          y: y + H - band + (band - logoImg.height * k) / 2,
          width: logoImg.width * k,
          height: logoImg.height * k,
        });
        tx = x + 6 + logoImg.width * k + 6;
      }
      const co = fitText(bold, o.company || 'Company name', 10, W - (tx - x) - 8);
      page.drawText(co, { x: tx, y: y + H - band / 2 - 3.5, size: 10, font: bold, color: rgb(1, 1, 1) });

      const photoW = portrait ? 62 : 58;
      const photoH = portrait ? 76 : 72;
      const px = portrait ? x + (W - photoW) / 2 : x + 10;
      const py = portrait ? y + H - band - 10 - photoH : y + H - band - 10 - photoH;
      const photo = o.photos[p.id];
      if (photo) await drawCover(PDFLib, doc, page, photo, px, py, photoW, photoH);
      else {
        page.drawRectangle({ x: px, y: py, width: photoW, height: photoH, color: rgb(0.92, 0.93, 0.96) });
        const ini = initials(p.name);
        page.drawText(ini, {
          x: px + (photoW - bold.widthOfTextAtSize(ini, 22)) / 2,
          y: py + photoH / 2 - 8,
          size: 22,
          font: bold,
          color: grey,
        });
      }
      page.drawRectangle({ x: px, y: py, width: photoW, height: photoH, borderColor: accent, borderWidth: 1 });

      const textX = portrait ? x + 8 : px + photoW + 10;
      const textW = portrait ? W - 16 : W - (textX - x) - 8;
      let ty = portrait ? py - 14 : y + H - band - 18;
      const name = fitText(bold, p.name, portrait ? 12 : 12, textW);
      const draw = (t, size, f, c, center) => {
        const s = fitText(f, t, size, textW);
        page.drawText(s, { x: center ? textX + (textW - f.widthOfTextAtSize(s, size)) / 2 : textX, y: ty, size: size, font: f, color: c });
        ty -= size + 4;
      };
      draw(name, 12, bold, dark, portrait);
      if (p.designation) draw(p.designation, 9, font, grey, portrait);
      if (p.department) draw(p.department, 9, font, grey, portrait);
      draw('ID: ' + p.id, 9, bold, accent, portrait);
      if (p.blood) draw('Blood group: ' + p.blood, 8, font, dark, portrait);
      if (p.valid) {
        const s = 'Valid till ' + p.valid;
        page.drawText(fitText(font, s, 7.5, W - 16), { x: x + 8, y: y + 6, size: 7.5, font: font, color: grey });
      }
      marks(page, x, y);
    }

    function back(page, p, x, y) {
      page.drawRectangle({ x: x, y: y, width: W, height: H, color: rgb(1, 1, 1), borderColor: rgb(0.75, 0.75, 0.8), borderWidth: 0.5 });
      page.drawRectangle({ x: x, y: y + H - 14, width: W, height: 14, color: accent });
      let ty = y + H - 30;
      const maxW = W - 20;
      const wrapLines = (text, f, size) => {
        const words = sanitize(text).split(' ');
        const lines = [];
        let line = '';
        words.forEach((w) => {
          const t = line ? line + ' ' + w : w;
          if (f.widthOfTextAtSize(t, size) <= maxW) line = t;
          else {
            if (line) lines.push(line);
            line = w;
          }
        });
        if (line) lines.push(line);
        return lines;
      };
      wrapLines(o.backNote, font, 8).forEach((l) => {
        page.drawText(l, { x: x + 10, y: ty, size: 8, font: font, color: dark });
        ty -= 11;
      });
      ty -= 4;
      if (o.company) {
        page.drawText(fitText(bold, o.company, 9, maxW), { x: x + 10, y: ty, size: 9, font: bold, color: dark });
        ty -= 12;
      }
      wrapLines(o.address || '', font, 8)
        .slice(0, 4)
        .forEach((l) => {
          page.drawText(l, { x: x + 10, y: ty, size: 8, font: font, color: grey });
          ty -= 11;
        });
      if (p.phone)
        page.drawText(fitText(font, 'Emergency: ' + p.phone, 8, maxW), { x: x + 10, y: y + 10, size: 8, font: font, color: dark });
      marks(page, x, y);
    }

    for (let start = 0; start < people.length; start += L.perPage) {
      const chunk = people.slice(start, start + L.perPage);
      const fp = doc.addPage([L.pageW, L.pageH]);
      for (let i = 0; i < chunk.length; i++) {
        const pos = L.cell(i, false);
        await front(fp, chunk[i], pos.x, pos.y);
      }
      if (o.withBack) {
        const bp = doc.addPage([L.pageW, L.pageH]);
        for (let i = 0; i < chunk.length; i++) {
          const pos = L.cell(i, true);
          back(bp, chunk[i], pos.x, pos.y);
        }
      }
    }
    return doc.save();
  }

  function sampleRows() {
    return [
      ['Name', 'Employee ID', 'Designation', 'Department', 'Blood Group', 'Emergency Contact', 'Valid Till'],
      ['Ravi Kumar', 'E001', 'Software Engineer', 'Engineering', 'B+', '98765 43210', '2027-03-31'],
      ['Meera Shah', 'E002', 'HR Executive', 'Human Resources', 'O+', '98765 11111', '2027-03-31'],
      ['Asha Rao', 'E003', 'Finance Manager', 'Finance', 'A+', '98765 22222', '2027-03-31'],
    ];
  }

  return {
    CARD: CARD,
    rowsToPeople: rowsToPeople,
    initials: initials,
    matchPhotos: matchPhotos,
    layout: layout,
    buildPdf: buildPdf,
    sampleRows: sampleRows,
  };
});
