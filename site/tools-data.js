/**
 * The catalogue shown on the launcher page (index.html).
 * Keep in sync with the folders in /tools - `npm run check:structure` fails if
 * a tool is missing here. It is a .js file (not .json) so the launcher also
 * works when opened straight from disk, where browsers block fetch().
 */
window.TOOLS = [
  {
    id: 'letter-generator',
    title: 'Letter Generator',
    tagline: 'Offer, appointment, experience, relieving and warning letters as ready-to-sign PDFs.',
    replaces: 'Word templates, paid HR suites',
    tags: ['letters', 'pdf', 'offer', 'hr'],
  },
  {
    id: 'interview-scorecard',
    title: 'Interview Scorecard',
    tagline: 'Weighted scoring for candidates and interviewers, with a ranked summary.',
    replaces: 'scoring in loose spreadsheets',
    tags: ['interview', 'hiring', 'scoring'],
  },
  {
    id: 'onboarding-checklist',
    title: 'Onboarding Checklist',
    tagline: 'Joining and exit checklists with owners and due dates calculated from the start date.',
    replaces: 'hand-made checklists',
    tags: ['onboarding', 'offboarding', 'checklist'],
  },
  {
    id: 'leave-planner',
    title: 'Leave & Holiday Planner',
    tagline: 'Working days, leave balances and team clash warnings from a holiday list.',
    replaces: 'leave sheets',
    tags: ['leave', 'holidays', 'calendar'],
  },
  {
    id: 'resume-shortlist',
    title: 'Resume Shortlist',
    tagline: 'Rank candidates against must-have and nice-to-have skills, with the reasons shown.',
    replaces: 'manual CV sifting',
    tags: ['recruiting', 'csv', 'screening'],
  },
  {
    id: 'salary-breakup',
    title: 'Salary Breakup',
    tagline: 'Turn CTC into monthly components (basic, HRA, PF, gratuity) with editable rules.',
    replaces: 'salary calculators',
    tags: ['salary', 'ctc', 'india'],
  },
  {
    id: 'headcount-dashboard',
    title: 'Headcount Dashboard',
    tagline: 'Headcount, joiners, leavers, attrition and tenure from an employee list.',
    replaces: 'pivot tables',
    tags: ['analytics', 'attrition', 'csv'],
  },
  {
    id: 'payslip-maker',
    title: 'Payslip Maker',
    tagline: 'Payslip PDFs for one person or a whole sheet, as a ZIP.',
    replaces: 'payslip generators',
    tags: ['payslip', 'payroll', 'pdf'],
  },
  {
    id: 'id-card-maker',
    title: 'ID Card Maker',
    tagline: 'Printable employee ID cards from a list, with optional photos.',
    replaces: 'design tools',
    tags: ['id-card', 'pdf', 'photos'],
  },
  {
    id: 'policy-tracker',
    title: 'Policy Tracker',
    tagline: 'Track who has acknowledged which policy, with reminder lists.',
    replaces: 'email chasing',
    tags: ['compliance', 'policy', 'tracking'],
  },
];
