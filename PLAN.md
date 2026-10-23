# YEGO Platform — Build Plan

## Done
1. **Brand & public website**: homepage covering About, Mission, How YEGO Works, National Reach, Become a Guard, Report an Incident, Training, News, Partners and Contact. Includes the YEGO logo, green civic theme and generated photography.
2. **Nigeria reference data**: 36 states + FCT, capitals, zones, all 774 LGAs and national ward/polling-unit totals (`src/lib/nigeria.ts`).
3. **Guard application**: 4-step mobile form with all required fields, live camera or upload photo, declarations, Application ID, WhatsApp-channel confirmation, and a status tracker at `/status`.
4. **Login**: `/login` with separate Guard/Applicant (Application ID + phone) and Command staff tabs, plus preview accounts.
5. **Guard portal** (`/portal`): applicants see progress and training only. Certified Guards also get Election-Day Mode (Where/What/When/Evidence with GPS or map pin), polling-unit info and check-in, early-warning tips, messages and their own report history.
6. **Training Centre** (inside the portal): modules, quizzes, progress and a printable certificate.
7. **Command Centre** (`/command`, role-gated): dashboard KPIs with state/LGA/status filters, live incident map, cluster alerts, Guards by state/LGA, incident verification queue with the full workflow, clarification requests, categorisation, audit trail and agency referral (INEC, NPF, ICCES, DSS, NSCDC, Army, EFCC, ICPC, NHRC, NOA, NEMA), and Guard screening with polling-unit assignment.

## Remaining
8. **Missing Command views**: ~~Early-warning board~~, ~~Polling-unit coverage & duty board~~ and ~~Roles & access matrix~~ are built (see the fourth implementation pass in `docs/BACKEND_IMPLEMENTATION_REPORT.md`). Still open: Communications (broadcast composer beyond shared updates) and Training admin (upload/edit modules).
9. **Public `/map` and `/training` pages** (already linked from the header and homepage).
10. **Real backend**: replace `src/lib/demo-store.ts` (localStorage) with Netlify Database tables and server functions, keeping the same function names. Store photos and evidence in Netlify Blobs with private access. Encrypt NIN.
11. **Real authentication**: ~~Netlify Identity~~ → first-party sessions shipped; MFA/identity-provider decision still open.
12. **INEC polling-unit import**: load the official PU register with coordinates and reconcile the per-state estimates.
13. **Notifications & operations**: ~~SMS/WhatsApp alerts~~ outbound applicant notifications implemented (Twilio SMS + Meta WhatsApp Cloud API, provider recorded truthfully); still open: automated agency referral delivery, backups, CSV/PDF exports and partner analytics.
14. **Launch config**: real WhatsApp channel URL (`src/lib/config.ts`), hotline numbers, and agency crests used with permission.
