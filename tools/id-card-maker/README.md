# Employee ID Card Maker

> Print-ready ID cards with photo, name and details from a spreadsheet.

Part of [HR Pocket Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Load a list of employees, add your logo and photos, and get an A4 sheet of cards with fronts on one page and mirrored backs on the next, so a double-sided print lines up. Photos are matched by employee ID or name.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/id-card-maker/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- id-card-maker ../id-card-maker-repo`.

## Features

- Reads Excel and CSV; name, ID, designation, department and more.
- Optional company logo and card colour; optional back side with return address and emergency contact.
- Photos matched from file names (employee ID or name), cropped to fit.
- A4 or US Letter, landscape or portrait cards (ten per A4 landscape sheet by default), with a gap you set; fronts and mirrored backs for duplex printing.

## How it works

`js/core.js` exports `CardCore`: `CARD`, `rowsToPeople`, `initials`, `matchPhotos`, `layout`, `buildPdf` and `sampleRows`. `layout` works out how many cards fit and where; `buildPdf` clips photos to the frame.

| File                 | Purpose                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `index.html`         | Page structure and the Content-Security-Policy (blocks all network access)                          |
| `css/theme.css`      | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                          |
| `css/app.css`        | Styles for this tool only                                                                           |
| `js/common.js`       | Shared helpers (downloads, file reading, status messages). Synced from `shared/` - do not edit here |
| `js/core.js`         | The logic: pure functions, unit-tested, no browser needed                                           |
| `js/app.js`          | Connects the page to the logic (thin by design)                                                     |
| `vendor/`            | Bundled third-party code: SheetJS Community Edition 0.20.3 (Apache-2.0) and pdf-lib 1.17.1 (MIT)    |
| `tests/core.test.js` | Unit tests for the logic                                                                            |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- Third-party code is bundled in `vendor/` (exact versions and licenses in `vendor/README.md`) instead of loaded from a CDN, so there is no third party in the loop when you use the tool.
- Photos and ID numbers are personal data. Delete the PDF once printed.

## Limitations

- Card size is the standard credit-card size (85.6 x 54 mm), landscape or portrait; other sizes are not offered.
- No barcodes or QR codes.
- Photos are JPEG or PNG; PDF fonts are Latin only.
- Check the first print before printing all cards: printer margins vary.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/id-card-maker/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). SheetJS (Apache-2.0), pdf-lib (MIT).
