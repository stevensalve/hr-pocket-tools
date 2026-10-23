/* ID Card Maker - user interface. Layout and PDF drawing live in core.js. */
(function () {
  'use strict';

  const { setStatus, bindDropzone, readArrayBuffer, downloadBlob, debounce } = OT;
  const $ = (id) => document.getElementById(id);
  const MAX_PEOPLE = 500;
  const PHOTO_MAX = 480; // pixels on the longest side; plenty for a 2 cm photo and keeps the PDF small

  let people = [];
  let photoFiles = []; // File objects
  let logoFile = null;

  /** Any browser-readable image -> JPEG or PNG bytes, resized. */
  async function encode(file, maxSide, keepPng) {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    const ctx = c.getContext('2d');
    if (!keepPng) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    const type = keepPng ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((res) => c.toBlob(res, type, 0.88));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), type: keepPng ? 'png' : 'jpg' };
  }

  function load(aoa, label) {
    const r = PhotoPeople(aoa);
    people = r.people.slice(0, MAX_PEOPLE);
    setStatus(
      $('load-status'),
      (people.length ? label + ': ' + people.length + ' employee(s). ' : '') +
        r.errors.slice(0, 3).join(' ') +
        (r.errors.length > 3 ? ' (+' + (r.errors.length - 3) + ' more)' : ''),
      r.errors.length ? 'warn' : 'ok',
    );
    refresh();
  }
  const PhotoPeople = (aoa) => CardCore.rowsToPeople(aoa);

  bindDropzone($('drop'), $('file-input'), async (files) => {
    try {
      const wb = XLSX.read(await readArrayBuffer(files[0]), { type: 'array' });
      load(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false, blankrows: false }), files[0].name);
    } catch (e) {
      setStatus($('load-status'), 'Could not open that file. Is it a valid Excel or CSV file?', 'error');
    }
  });
  $('demo').addEventListener('click', () => load(CardCore.sampleRows(), 'Sample data (made up)'));
  $('photos').addEventListener('change', () => {
    photoFiles = Array.from($('photos').files);
    refresh();
  });
  $('logo').addEventListener('change', () => {
    logoFile = $('logo').files[0] || null;
  });

  function refresh() {
    if (!people.length) {
      $('make').disabled = true;
      $('count').textContent = 'Load a list to begin.';
      return;
    }
    const L = CardCore.layout({ pageSize: $('size').value, orientation: $('orient').value, gap: Number($('gap').value) });
    const sheets = Math.ceil(people.length / L.perPage);
    $('count').textContent =
      people.length +
      ' card(s), ' +
      L.perPage +
      ' per sheet: ' +
      sheets +
      ' sheet(s)' +
      ($('back').checked ? ' (front and back)' : '') +
      '.';
    $('make').disabled = false;
    if (photoFiles.length) {
      const m = CardCore.matchPhotos(
        people,
        photoFiles.map((f) => f.name),
      );
      setStatus(
        $('photo-status'),
        Object.keys(m.matched).length +
          ' photo(s) matched. ' +
          (m.withoutPhoto.length ? m.withoutPhoto.length + ' employee(s) have no photo and will show initials. ' : '') +
          (m.unmatchedFiles.length
            ? 'Not matched: ' + m.unmatchedFiles.slice(0, 5).join(', ') + (m.unmatchedFiles.length > 5 ? '...' : '')
            : ''),
        m.unmatchedFiles.length || m.withoutPhoto.length ? 'warn' : 'ok',
      );
    } else setStatus($('photo-status'), '');
  }
  ['size', 'orient', 'back'].forEach((id) => $(id).addEventListener('change', refresh));
  $('gap').addEventListener('input', debounce(refresh, 150));

  $('make').addEventListener('click', async () => {
    $('make').disabled = true;
    setStatus($('out-status'), 'Creating cards...');
    try {
      const photos = {};
      if (photoFiles.length) {
        const m = CardCore.matchPhotos(
          people,
          photoFiles.map((f) => f.name),
        );
        for (const id of Object.keys(m.matched))
          photos[id] = await encode(
            photoFiles.find((f) => f.name === m.matched[id]),
            PHOTO_MAX,
            false,
          );
      }
      const logo = logoFile ? await encode(logoFile, 300, true) : null;
      const bytes = await CardCore.buildPdf(PDFLib, people, {
        company: $('company').value.trim(),
        address: $('address').value.trim(),
        accent: $('accent').value,
        pageSize: $('size').value,
        orientation: $('orient').value,
        gap: Number($('gap').value),
        withBack: $('back').checked,
        photos: photos,
        logo: logo,
      });
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'id-cards.pdf');
      setStatus($('out-status'), 'Done - ' + OT.formatBytes(bytes.length) + '.', 'ok');
    } catch (e) {
      setStatus($('out-status'), e.message, 'error');
    }
    $('make').disabled = false;
  });
})();
