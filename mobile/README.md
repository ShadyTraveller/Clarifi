# Yavamo mobile — foundation and dashboard

Android-first Expo app for dispatch and technicians. This feature implements
email/password sign-in, encrypted native session persistence, workspace selection,
the dashboard, and account/sign-out. Other screens are separate features. Scheduling
and assignments remain manual. Week **and month** views are in the agreed backlog.

## Run

Use Node 24. From `mobile/`, run `npm ci`, copy `.env.example` to `.env.local`,
then set the **staging** project URL and publishable key. Both values are public
client configuration. Never add server keys or passwords to these files.

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-STAGING-REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR-STAGING-PUBLISHABLE-KEY
```

Run `npx expo start` and open the Android app in the matching Expo Go version or
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
- This feature performs no job writes and calls no `/api/agents/*` endpoints.
- No pricing math is implemented. Future estimate work must use the shared engine.

## Live staging verification — pending provisioning

Use an isolated Supabase development branch with synthetic records. Before creating
it, obtain its current cost and have Lavie confirm it. Invitations and fixture
records below have **not** been created by this feature.

Planned accounts (approved by Lavie):

| Email | Staging role |
| --- | --- |
| quoteunquoteapp@gmail.com | dispatcher |
| shaedytraveler@gmail.com | technician |

The backend owner provisions the active memberships and links the technician
profile using `auth_user_id`. Test two organizations, each with a synthetic client
and job; create a second-org membership only for its designated tester. Confirm:

1. Dispatcher sign-in, appointments and both queue counts match staging data.
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

`node tests/live-access.mjs` provides read-only staging checks for both roles,
cross-organization access, and backend supplier-cost denial. Supply public staging
configuration plus `YAVAMO_DISPATCH_EMAIL`, `YAVAMO_DISPATCH_PASSWORD`,
`YAVAMO_TECH_EMAIL`, `YAVAMO_TECH_PASSWORD`, `YAVAMO_TEST_ORG_A`,
`YAVAMO_TEST_ORG_B`, and `YAVAMO_TEST_MATERIAL_ID` through runtime settings.
The material id must name an org A fixture visible to dispatch. The script refuses
the production project. It has not been run against live data yet.

## Backend review for Muse

The contract belongs to Muse; it has not been changed. Please record week/month
calendar scope, the canonical `security_film` key, and the assignment linkage above.
The live project contains `active`, `display_name`, and `technicians.auth_user_id`,
but parts of that schema/policy setup are not reproducible from the checked-in
migrations alone. A fresh staging branch must be checked for these dependencies.
Resolve missing migrations/policies backend-side, not in the mobile feature.

Before approving live verification, confirm database policies enforce technician
job access, protected internal pricing, administrator-only role changes, and active
membership. This PR does not change or certify those policies.
