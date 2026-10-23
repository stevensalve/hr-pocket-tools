# Leave & Holiday Planner

> Working days, balances and team clashes, from your own holiday list.

Part of [HR Pocket Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

Enter your team, leave types and company holidays, record leaves, and see working days, balances and warnings when too many people from a team are away. A month calendar shows who is out on which day.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/leave-planner/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- leave-planner ../leave-planner-repo`.

## Features

- Working-day counting that skips weekly offs and company holidays, with half-days.
- Entitlements per leave type; balances with over-use highlighted.
- Warnings for overlapping leaves and team clashes above a share you choose.
- Month calendar (L leave, h half day, W weekly off, H holiday).
- Import leaves from Excel/CSV; export balances and the leave list as CSV; save/open as `.json`.

## How it works

`js/core.js` exports `LeaveCore`: `parseHolidays`, `parseRoster`, `parseEntitlements`, `isWorkingDay`, `leaveDays`, `entriesFromRows`, `daysInYear`, `balances`, `onLeave`, `clashes`, `overlaps`, `monthGrid`, `balancesCsv` and `entriesCsv`.

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

- Holiday lists are typed or pasted by you; the tool does not know any public holidays.
- No carry-forward, accrual or encashment rules; balances are for one year at a time.
- Not an approval workflow.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/leave-planner/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). SheetJS Community Edition 0.20.3 (Apache-2.0).
