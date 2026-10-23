# Payslip Maker

> A payslip PDF for every employee from one spreadsheet, as one file or a ZIP.

Part of [HR Pocket Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Load a payroll sheet (one row per employee with earnings and deductions), choose the pay period, and get a payslip PDF for each person. Download one combined PDF or a ZIP of separate files named by employee.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/payslip-maker/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- payslip-maker ../payslip-maker-repo`.

## Features

- Reads Excel and CSV; earnings and deductions are recognised from the column names (Basic, HRA, PF, TDS, and so on).
- Net pay, and amount in Indian words; company name and period on every slip.
- Bank account numbers are masked on the payslip.
- Preview any slip; a sample sheet you can download to see the format.
- Combined PDF or ZIP of individual PDFs.

## How it works

`js/core.js` exports `PayslipCore`: `classifyHeaders`, `amountOf`, `mask`, `compute`, `rowsToSlips`, `periodLabel`, `sanitize`, `buildPdf`, `buildCombinedPdf`, `fileNames`, `buildZip`, `sampleRows` and `sampleCsv`.

| File                 | Purpose                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `index.html`         | Page structure and the Content-Security-Policy (blocks all network access)                                           |
| `css/theme.css`      | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                                           |
| `css/app.css`        | Styles for this tool only                                                                                            |
| `js/common.js`       | Shared helpers (downloads, file reading, status messages). Synced from `shared/` - do not edit here                  |
| `js/core.js`         | The logic: pure functions, unit-tested, no browser needed                                                            |
| `js/app.js`          | Connects the page to the logic (thin by design)                                                                      |
| `vendor/`            | Bundled third-party code: SheetJS Community Edition 0.20.3 (Apache-2.0), pdf-lib 1.17.1 (MIT) and fflate 0.8.3 (MIT) |
| `tests/core.test.js` | Unit tests for the logic                                                                                             |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- Third-party code is bundled in `vendor/` (exact versions and licenses in `vendor/README.md`) instead of loaded from a CDN, so there is no third party in the loop when you use the tool.
- Payslips contain pay and bank details. The PDFs are **not password-protected**; store and share them securely.

## Limitations

- It does not calculate pay or tax; it formats the amounts in your sheet.
- Up to 18 earning and deduction lines per payslip.
- PDF fonts are Latin only; the rupee sign prints as `Rs.`.
- No password protection or e-mailing.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/payslip-maker/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). SheetJS (Apache-2.0), pdf-lib (MIT), fflate (MIT).
