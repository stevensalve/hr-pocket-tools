# Letter Generator

> Offer, confirmation, increment, warning, experience and relieving letters as ready-to-sign PDFs.

Part of [HR Pocket Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Pick a letter type, fill in the employee and company details, and download a neat PDF. The wording is a starting point you can edit before saving. Amounts are written in figures and Indian words (for example Rs. 12,00,000 - Twelve Lakh Rupees Only), and dates use DD/MM/YYYY style.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/letter-generator/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- letter-generator ../letter-generator-repo`.

## Features

- Templates: offer, confirmation, increment, warning, experience and relieving letters.
- Every field is a placeholder you fill in; the full letter text stays editable before you save.
- Indian amounts in figures and words, and long dates such as 1 November 2026.
- Optional signatory block and company header; long letters flow onto more pages.
- Download as PDF or copy as plain text.

## How it works

`js/core.js` exports `LetterCore`: `TEMPLATES`, `getTemplate`, `defaults`, `render`, `toText`, `sanitize`, `wrap`, `buildPdf` and `fileName`. `render` fills `{{placeholders}}` and reports any that are left empty; `buildPdf` receives `PDFLib` as an argument so Node tests can build real PDFs.

| File                 | Purpose                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `index.html`         | Page structure and the Content-Security-Policy (blocks all network access)                          |
| `css/theme.css`      | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                          |
| `css/app.css`        | Styles for this tool only                                                                           |
| `js/common.js`       | Shared helpers (downloads, file reading, status messages). Synced from `shared/` - do not edit here |
| `js/core.js`         | The logic: pure functions, unit-tested, no browser needed                                           |
| `js/app.js`          | Connects the page to the logic (thin by design)                                                     |
| `vendor/`            | Bundled third-party code: pdf-lib 1.17.1 (MIT)                                                      |
| `tests/core.test.js` | Unit tests for the logic                                                                            |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- Third-party code is bundled in `vendor/` (exact versions and licenses in `vendor/README.md`) instead of loaded from a CDN, so there is no third party in the loop when you use the tool.
- Employee data is sensitive. Use this tool on a device you trust, and delete downloaded files you no longer need.

## Limitations

- The templates are generic samples. Have them reviewed by your HR or legal advisor before use.
- PDF fonts are Latin only; other scripts print as `?` and the rupee sign prints as `Rs.`.
- Plain text only: no logos or letterhead images.
- No digital signature; print and sign, or sign the PDF in your PDF reader.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/letter-generator/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). pdf-lib (MIT).
