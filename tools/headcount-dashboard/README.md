# Headcount & Attrition Dashboard

> Headcount, joiners, leavers, attrition and tenure from an employee spreadsheet.

Part of [HR Pocket Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Load a spreadsheet with joining and leaving dates and see headcount by department, a monthly trend, attrition rate and tenure. Charts and tables are drawn on the page, so nothing is uploaded.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/headcount-dashboard/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- headcount-dashboard ../headcount-dashboard-repo`.

## Features

- Reads Excel and CSV with flexible column names.
- Headcount on any date, with a breakdown by department, location, grade or gender.
- Monthly series: opening, joiners, leavers and closing headcount.
- Attrition rate for a period, overall and by group; tenure bands.
- CSV export of the monthly series.

## How it works

`js/core.js` exports `HeadcountCore`: `rowsToEmployees`, `isActive`, `headcountOn`, `breakdown`, `monthRange`, `monthlySeries`, `attrition`, `attritionBy`, `tenure` and `seriesCsv`. A person counts as employed through their last working day, so opening + joiners - leavers = closing.

| File                 | Purpose                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `index.html`         | Page structure and the Content-Security-Policy (blocks all network access)                          |
| `css/theme.css`      | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                          |
| `css/app.css`        | Styles for this tool only                                                                           |
| `js/common.js`       | Shared helpers (downloads, file reading, status messages). Synced from `shared/` - do not edit here |
| `js/core.js`         | The logic: pure functions, unit-tested, no browser needed                                           |
| `js/app.js`          | Connects the page to the logic (thin by design)                                                     |
| `vendor/`            | Bundled third-party code: SheetJS Community Edition 0.20.3 (Apache-2.0)                             |
| `tests/core.test.js` | Unit tests for the logic                                                                            |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- Third-party code is bundled in `vendor/` (exact versions and licenses in `vendor/README.md`) instead of loaded from a CDN, so there is no third party in the loop when you use the tool.
- Employee data is sensitive. Use this tool on a device you trust, and delete downloaded files you no longer need.

## Limitations

- The rate uses the average of opening and closing headcount; other definitions give other numbers.
- Results are only as good as the dates in your sheet.
- No forecasting.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/headcount-dashboard/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). SheetJS Community Edition 0.20.3 (Apache-2.0).
