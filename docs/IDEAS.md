# Ideas and good first tasks

Pick something, open an issue to say so, and follow [CONTRIBUTING.md](../CONTRIBUTING.md). Difficulty guide: **J** = suitable for a junior engineer, **M** = mid-level.

## Improvements to existing tools

| Tool                    | Task                                                                    | Level |
| ----------------------- | ----------------------------------------------------------------------- | ----- |
| Letter Generator        | Save and load a customised template (JSON)                              | J     |
| Letter Generator        | A Hindi-script PDF font option                                          | M     |
| Interview Scorecard     | Print-friendly one-page candidate summary                               | J     |
| Interview Scorecard     | Per-interviewer comments, not only scores                               | M     |
| Onboarding Checklist    | Import your own template from a CSV file                                | J     |
| Leave & Holiday Planner | A starter list of national holidays as a downloadable text file         | J     |
| Leave & Holiday Planner | Carry-forward and accrual rules                                         | M     |
| Resume Shortlist Ranker | Synonyms for keywords (for example JS = JavaScript)                     | J     |
| Salary Breakup          | Old/new regime income-tax estimate (clearly labelled)                   | M     |
| Salary Breakup          | Compare two offers side by side                                         | J     |
| Headcount Dashboard     | Export charts as PNG                                                    | J     |
| Headcount Dashboard     | Gender and grade diversity view                                         | M     |
| Payslip Maker           | Optional per-file password using a PDF library that supports encryption | M     |
| Employee ID Card Maker  | Barcode / QR code with the employee ID                                  | M     |
| Policy Tracker          | Import acknowledgements from several policy files at once               | J     |
| All                     | Translate tool text (an `i18n` helper in `shared/`)                     | M     |
| All                     | Playwright smoke tests for each page in CI                              | M     |

## New tool candidates

Fresh candidates for an eleventh tool:

| Idea                        | What it does                                                   | Level |
| --------------------------- | -------------------------------------------------------------- | ----- |
| Job Description Builder     | Fill a form, get a consistent JD as PDF or text                | J     |
| Interview Question Bank     | Pick a role and competencies, print an interview guide         | J     |
| Appraisal Form Maker        | Printable goal-setting and review forms with rating scales     | J     |
| Notice Period & F&F Helper  | Last working day, notice buyout and settlement estimate        | M     |
| Training Attendance Tracker | Sessions, attendance and certificates from a roster            | M     |
| Org Chart Builder           | Build an org chart from a manager column in a spreadsheet      | M     |
| Expense Claim Summariser    | Totals per employee and category from a claims sheet           | J     |
| Birthday & Anniversary List | Upcoming work anniversaries and birthdays from the staff sheet | J     |

## Repository and quality

- Add a screenshot gallery to the root README (J).
- Add an accessibility audit script with axe-core run from Playwright in CI (M).
- Add a Content-Security-Policy `report` mode test that fails on any violation during the smoke tests (M).
