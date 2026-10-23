# Onboarding & Offboarding Checklist

> Joining and exit checklists with owners and due dates calculated from the start date.

Part of [HR Pocket Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Choose joining or exit, enter the date, and get a complete task list with owner and due date for each step, grouped by phase. Tick tasks off, add your own and export the plan.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/onboarding-checklist/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- onboarding-checklist ../onboarding-checklist-repo`.

## Features

- Ready templates for joining and exit; dates calculated from the start or last working day and moved off weekends.
- Owners such as HR, IT, Manager, Finance; progress by phase and overall.
- Add, edit, remove and reschedule tasks.
- Export as CSV, Markdown or a calendar (`.ics`) file; save/open as `.json`.

## How it works

`js/core.js` exports `CheckCore`: `TEMPLATES`, `adjustWeekend`, `createPlan`, `toggle`, `updateTask`, `addTask`, `removeTask`, `reschedule`, `progress`, `byPhase`, `toCsv`, `toMarkdown`, `toIcs`, `serialize` and `parse`. Dates are calendar days, so the plan looks the same everywhere.

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

- Templates are generic; adapt them to your company.
- The calendar file has all-day events only and does not know your public holidays.
- Does not remind or notify anyone.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/onboarding-checklist/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). No bundled third-party software.
