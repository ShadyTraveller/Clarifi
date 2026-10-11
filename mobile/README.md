# Yavamo mobile — workspace navigation

Android-first Expo app for dispatch and technicians. This feature implements
email/password sign-in, encrypted native session persistence, workspace selection,
the dashboard, responsive navigation, week/month calendar with a daily agenda,
paginated work lists, job details with signed photo viewing, existing-client
quick-entry, and account/sign-out. Scheduling
and assignments remain manual; assignment editing is a subsequent feature.

## Run

Use Node 24. From `mobile/`, run `npm ci`, copy `.env.example` to `.env`,
then set the web app's existing Supabase project URL and publishable key. Both values are public
client configuration. The app also accepts `EXPO_PUBLIC_SUPABASE_ANON_KEY`
for compatibility, with `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` taking precedence if both are present. Never add server keys or passwords to these files.

```
EXPO_PUBLIC_SUPABASE_URL=https://jgbciyogyratfplofizv.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR-PUBLISHABLE-KEY
```

Run `npx expo start` (or `npm run start:tunnel` when the phone cannot reach the
development machine directly) and open the Android app in the matching Expo Go version or
an Android development build. No iOS build or Apple account is needed. The web
export exists only for UI/browser verification; its session is deliberately kept
in memory. Android sessions use Expo SecureStore, chunked for large session values.
The native config declares no background location or GPS workflow.

`npm run check`, `npm test`, and `npm run export:android` verify the foundation.
`npm run export:web` produces a browser preview. Tests with synthetic API responses
do not prove live RLS behavior or Android device behavior.

For synthetic browser checks, export with the explicitly fake URL
`https://fixture.supabase.co` and key `sb_publishable_fixture`, serve that export
locally, then run `tests/browser-smoke.cjs` with `PLAYWRIGHT_MODULE`, `CHROME_PATH`,
and `TEST_BASE_URL` set for your machine. Clear Metro's cache (`--clear`) whenever
changing configuration. Never distribute a synthetic build as a live app.

## Dashboard data and access

- Identity: Supabase Auth, verified before loading active memberships from
  `organization_members`. Roles are read from `role`, never user-editable metadata.
- Each operational query explicitly filters `organization_id`. Multiple active
  memberships require selecting a workspace; switching discards the old dashboard.
- Today is the Toronto calendar day, including daylight-saving transitions.
- Office roles see today's jobs, unassigned lead count, and unread notification count.
- Technicians see only jobs with `assigned_to` equal to their user id, or
  `technician_id` linked through an active `technicians.auth_user_id` profile.
  Notification and unassigned queue queries are not made for technicians.
- Only explicit job/client display columns are fetched. Quote lines, supplier
  catalogs, internal notes, and supplier prices are not requested.
- Supported services follow the actual `@yavamo/core` `ServiceKey` type. Its current
  film key is `security_film` (the contract's illustrative snippet uses a hyphen).
- Refresh on focus, pull-to-refresh, and every minute while foregrounded. Failed
  refreshes visibly label stale data; no fabricated live GPS or live queue status.
- Quick-entry creates lead jobs for existing clients and attaches photos. It
  calls no `/api/agents/*` endpoints. New-client inserts are disabled pending
  atomic normalized dedupe from Muse; see `ENTRY_HANDOFF.md`.
- No pricing math is implemented. Future estimate work must use the shared engine.

## Live verification on the existing project

Lavie approved using the web app's existing Supabase project. A separate staging
project is optional, not a prerequisite. Live checks use the signed-in user's
session and clearly labelled test records; no server key ships in the app.

Provisioned, email-confirmed accounts (approved by Lavie):

| Email | Test role |
| --- | --- |
| quoteunquoteapp@gmail.com | dispatcher |
| shaedytraveler@gmail.com | technician |

Both accounts have active memberships in Clarifi Workspace; the technician
profile is linked using `auth_user_id`. Test two organizations, each with a synthetic client
and job; create a second-org membership only for its designated tester. Confirm:

1. Dispatcher sign-in, appointments and both queue counts match the project data.
2. Technician sign-in shows only assigned jobs, including `technician_id` links;
   there are no office queue counts or supplier-price requests.
3. Direct Data API requests with org A's session cannot read or mutate org B data.
   Test backend RLS without relying on the UI's organization filters.
4. Technician sessions cannot read internal costs/catalogs or change their role
   through direct API requests. UI hiding alone does not establish this.
5. Sign-out clears the native session. Relaunch after sign-in restores access;
   deactivating membership blocks workspace access on reload.
6. Lose connectivity: retry is visible, cached counts are marked stale, and no
   pending offline writes exist.

Use secure invitations or password reset to set passwords; do not paste them into
chat, commit them, or save them in test scripts. Live automated testing should take
credentials from temporary runtime secrets and never log tokens or raw responses.
Keep private runtime files outside the Expo project directory: its development
environment loader discovers `.env*` files. Only public project configuration
belongs in `mobile/.env`.

`node tests/live-access.mjs` provides read-only live checks for both roles,
cross-organization access, and backend supplier-cost denial. Supply public project
configuration plus `YAVAMO_DISPATCH_EMAIL`, `YAVAMO_DISPATCH_PASSWORD`,
`YAVAMO_TECH_EMAIL`, `YAVAMO_TECH_PASSWORD`, `YAVAMO_TEST_ORG_A`,
`YAVAMO_TEST_ORG_B`, and `YAVAMO_TEST_MATERIAL_ID` through runtime settings.
The material id must name an org A fixture visible to dispatch. These checks
perform no job/catalog writes. Account sign-in still needs an email-confirmed user
and an active membership; a public key alone does not grant workspace access.

## Backend review for Muse

The contract belongs to Muse; it has not been changed. Please record week/month
calendar scope, the canonical `security_film` key, and the assignment linkage above.
The live project contains `active`, `display_name`, and `technicians.auth_user_id`,
but parts of that schema/policy setup are not reproducible from the checked-in
migrations alone. Any future fresh project must be checked for these dependencies.
Resolve missing migrations/policies backend-side, not in the mobile feature.

Confirm database policies enforce technician
job access, protected internal pricing, administrator-only role changes, and active
membership. This PR does not change or certify those policies.

## Confirmation redirects

Both test accounts are confirmed. Their email links redirected to an unavailable
`localhost:3000` page after verification; this did not prevent confirmation.
For future emails, the project owner should set the Supabase Auth Site URL to
`https://www.yavamo.ca` and allow the intended confirmation/reset redirect in
[Auth URL configuration](https://supabase.com/dashboard/project/jgbciyogyratfplofizv/auth/url-configuration).
A redirect supplied at sign-up must be allowlisted there to take effect.

## Navigation and screen scope

Home, Schedule, Work, and Account share a persistent navigation bar on phones.
At 840 logical pixels and above, it becomes a navigation rail. The workspace
header stays visible; the active destination is labelled and highlighted.

- **Home:** today’s appointments, office queue counts, shortcuts to Schedule and
  Work. Appointment cards open job details.
- **Schedule:** Monday-first week and month selectors, previous/next period,
  today shortcut, and a selected-day agenda in Toronto time. Appointments are
  paginated so busy days do not silently disappear at the API row limit.
- **Work:** Requests / Estimates / Jobs / Completed filters on job status,
  submitted search of job request text, and 25-item pages. These are job pipeline
  lists; quote review and invoice boards are not implemented yet.
- **Job detail:** request, client name/address, appointment time, and current
  status. Detail requests reuse the organization and technician assignment
  filters, including direct links. Missing or unavailable jobs have a clear
  empty state. Request details and image attachments are visible; notes threads
  and status mutation/completion guards remain pending.
- **Account:** workspace selection, role display, and sign-out.

New-client creation, manual map, agent-output feed, assignment editing, invoice
boards, and full notes/files workflows remain subsequent contract features.
No placeholder navigation links are presented as working actions.

`tests/browser-smoke.cjs` checks synthetic dispatcher and technician flows at
320, 390, and 1280-pixel widths, including active navigation, week/month changes,
work filters/search and pagination, unavailable/scoped job links, retry and
stale-data recovery, selected-day preservation, workspace switching,
and sign-out. Calendar tests cover Toronto DST, leap years, and year rollover.

Live browser checks also pass for both approved roles across Home, Schedule,
Work status filters, Account, and sign-out. No business records were changed
during these checks. Android export passes; device behavior and the backend
authorization review remain separate verification items.

## Quick-entry verification

Office accounts can open **New request** from Home or Work. Enter an existing
client's email or phone, check matches, and choose the correct client. Contact
details are retained; quick-entry does not overwrite them. Add a title, details,
unit/gate instructions, and optional camera/library images (4 MB each). Save
creates an unscheduled, unassigned lead. Photos upload to private `job-files`;
only paths and metadata are saved. Job details generate one-hour signed URLs.

Retries keep the same request and photo IDs, including after switching screens.
An unconfirmed save locks the entry until reconciled. Failed attachments can be
retried without creating another job. The draft is memory-only and clears on
workspace change/sign-out; restarting the app discards it. No offline queue is
implemented. Native camera/gallery permissions require Android device testing.

Run `tests/entry-browser.cjs` against the synthetic export described above. It
checks formatted-phone/case-insensitive-email matching, extension warnings,
restricted write shapes, lost job/upload/metadata responses, draft resumption,
signed photo viewing, and responsive widths. It never writes live data.
