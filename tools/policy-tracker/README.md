# Policy Acknowledgement Tracker

> Who has read which policy, what is overdue, and reminders ready to send.

Part of [HR Pocket Tools](../../README.md). Runs entirely in your browser and works without internet.

## What it does

List your people and policies with due dates and tick off acknowledgements. See progress per policy and per team, and copy reminders for everyone who still has something pending.

## Quick start

**No technical knowledge needed**

1. Download this folder (or the whole project as a ZIP from GitHub) and unzip it.
2. Double-click `index.html`. It opens in your browser and works with no internet connection.
3. Keep the folder anywhere you like - on your desktop or a USB stick. It never needs updating to keep working.

**For developers**

```bash
npm install          # once, at the repository root
npm run serve        # then open http://localhost:8080/tools/policy-tracker/
```

Hosting this folder on any static web host (GitHub Pages, Netlify, an intranet web server) needs no build step. See [docs/HOSTING.md](../../docs/HOSTING.md). To publish only this tool as its own repository, run `npm run export-tool -- policy-tracker ../policy-tracker-repo`.

## Features

- People from pasted lines or an Excel/CSV file (Name, Team, E-mail).
- Policies with due dates and overdue flags; progress bars per policy and team.
- Tick individual acknowledgements, or mark a whole team done; import Name/Policy/Date records.
- Reminder text per person, optionally only for those with overdue policies, with their e-mail line; one-click copy.
- Status table as CSV; save/open as `.json`.

## How it works

`js/core.js` exports `PolicyCore`: `create`, `parsePeople`, `peopleFromRows`, `setPeople`, `addPolicy`, `updatePolicy`, `removePolicy`, `setAck`, `markAll`, `importAcks`, `summary`, `reminderFor`, `remindersText`, `matrixCsv`, `serialize` and `parse`. "Today" is always passed in, so tests are repeatable.

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

- It records what you enter; it is not a legally binding e-signature.
- It does not send e-mail; copy the reminders into your mail program.
- Up to 1,000 people and 30 policies.
- Names must be unique.

## Development

```bash
npm test                                                     # all tools, from the repository root
node --test tools/policy-tracker/tests/core.test.js   # just this tool
npm run verify                                               # tests + lint + formatting + repository checks
```

The logic in `js/core.js` has no browser dependencies, so you can reuse it from Node: `const core = require('./js/core.js');`

Conventions (pure `core.js`, thin `app.js`, tests for every function) are described in [CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## License

MIT - see [LICENSE](LICENSE). SheetJS Community Edition 0.20.3 (Apache-2.0).
