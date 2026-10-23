# Interview Scorecard

> Weighted scoring for candidates and interviewers, with a ranked summary.

Part of [HR Pocket Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Set up the role and the criteria that matter, add candidates and interviewers, give each a 1-5 rating and see a fair, weighted ranking. It replaces scores kept in loose spreadsheets and makes panel discussions quicker.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/interview-scorecard/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- interview-scorecard ../interview-scorecard-repo`.

## Features

- Criteria with weights; add, rename and remove them at any time.
- Several interviewers per candidate; scores are averaged per criterion, and missing ratings are shown, not counted as zero.
- Ranked summary with weighted percentage and per-criterion detail.
- Notes per candidate; CSV export (Excel-friendly) and save/open as a `.json` file to continue later.

## How it works

`js/core.js` exports `ScoreCore`: `create`, `setRole`, `setInterviewers`, `addCriterion`, `updateCriterion`, `removeCriterion`, `addCandidate`, `removeCandidate`, `setNotes`, `setRating`, `candidateResult`, `ranking`, `toCsv`, `serialize` and `parse`. Every function returns a new state.

| File                 | Purpose                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `index.html`         | Page structure and the Content-Security-Policy (blocks all network access)                          |
| `css/theme.css`      | Shared look and feel, light/dark. Synced from `shared/` - do not edit here                          |
| `css/app.css`        | Styles for this tool only                                                                           |
| `js/common.js`       | Shared helpers (downloads, file reading, status messages). Synced from `shared/` - do not edit here |
| `js/core.js`         | The logic: pure functions, unit-tested, no browser needed                                           |
| `js/app.js`          | Connects the page to the logic (thin by design)                                                     |
| `tests/core.test.js` | Unit tests for the logic                                                                            |

## Privacy and security

- Everything happens in your browser. Nothing you open, type or create is sent anywhere.
- The page's Content-Security-Policy (`<meta http-equiv="Content-Security-Policy">`) forbids network requests, inline scripts and `eval`, so even a bug could not send your data out.
- The tool has no third-party dependencies at all.
- Employee data is sensitive. Use this tool on a device you trust, and delete downloaded files you no longer need.

## Limitations

- It supports a decision; it does not make one. Keep scoring consistent and document your reasons.
- Ratings are whole numbers from 1 to 5.
- Data is kept in memory; save the `.json` file to continue later.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/interview-scorecard/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). No bundled third-party software.
