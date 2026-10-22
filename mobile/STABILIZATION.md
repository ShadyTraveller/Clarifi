# Yavamo stabilization and release plan

Updated 2026-10-21 (America/Toronto). This records the user's latest priorities
and an initial audit, not a production-readiness certification. Muse owns backend
migrations, shared core, agent routes and `mobile/CONTRACT.md`; Codex owns mobile
UI. Existing service-cleanup edits remain separate. All merges require review.

## Delivery order

1. Audit GitHub, Supabase and Vercel; reconcile branches and contract. Remove code
   only after verifying it has no callers or supported historical-data purpose.
2. Verify login, session persistence, active membership, role permissions and
   organization isolation for technician, dispatch and administrator accounts.
3. Complete clients, requests, office-reviewed estimates, invoices and team flows.
4. Complete technician daily jobs, measurements, photos, checklists and completion.
5. Complete availability, atomic scheduling, assignments and map/location flows.
6. Add controlled automation, approval workflows and material calculations.
7. Validate Android APKs, notifications, crash reporting and recovery from errors
   and interrupted connections. Offline writes require explicit conflict rules.
8. Verify the entire workflow on Android devices with all supported roles.
9. Integrate online payments, deposits, receipts and reconciliation last.

Invoice preparation, office review and recording must work without a payment
provider. Work completion is distinct from financial closure. Deferring card
integration does not remove the user's full-payment-before-closure requirement;
authorized manual receipt recording needs a documented server contract. Never
fabricate payment success to unblock a test. Preserve existing payment data.

## Initial audit evidence

Scope: working tree based on `4d3689e`, including existing uncommitted service
cleanup. Remote `main` is `0f04f4b`; remote `mobile` is `e0dfbed`. No branches were
merged, records changed, or production releases performed for this audit.

| Area | Observed evidence | Remaining work |
| --- | --- | --- |
| Local checks | Root and mobile TypeScript pass; root 7 and mobile 5 test files pass | These are not signed-in Android or latest-main integration tests |
| Branch integration | Main has newer triage, scheduling, timeline and financial migrations; mobile feature branch is older | Review integration without overwriting Muse's changes; reconcile API contract |
| CI/review | No `.github` directory in current working tree; GitHub branch listing reports main/mobile unprotected | Add PR checks and verify review enforcement/rulesets; EAS post-install checks alone do not cover every PR |
| Vercel | Production deployment `dpl_7Ch6emxtzSRWk2tnxbogVZKihxuZ`, main `0f04f4b`, reports READY; mobile branch preview also READY | Verify authenticated workflows and runtime health; READY proves deployment status only |
| Android | APK preview and AAB production EAS profiles exist; linked project UUID retained | Workspace has no configured Expo credentials; previous submission failed authentication; no device verification established |
| Supabase | Live security advisor and function metadata inspected read-only | Address findings below with Muse; test denial and legitimate intake paths |

## Backend findings for Muse

### P0: anonymous intake authorization bypass

Live `public.create_clarifi_request(uuid,jsonb,jsonb,text)` has
`has_function_privilege('anon', oid, 'EXECUTE') = true`. Its ACL includes
`=X/postgres` (PUBLIC execution), despite the code comment saying anon is revoked.
Its membership check runs only when `auth.uid()` is non-null, so anonymous callers
can pass that authorization branch. No exploit or production write was attempted.

The migration on main revokes from `anon`, but inherited PUBLIC permission remains.
Use a new reviewed migration: remove PUBLIC/anon execution on the exact overloads,
retain only required authenticated/backend execution, and explicitly distinguish
trusted backend callers from unauthenticated requests. Preserve the three-argument
wrapper and authenticated office intake. Confirm effective privileges, not just
individual GRANT statements. Test anonymous denial, inactive/technician/cross-org
denial, valid office intake, backend webhook compatibility and idempotent retries.

Advisor also reports anonymous execution for `assign_job`, `job_timeline` and
`triage_request`. Their bodies contain authorization checks, so do not describe
them as the same demonstrated bypass. Review least privilege and negative tests.
Signed-in SECURITY DEFINER warnings require review of intended access rather than
blindly changing every function to INVOKER. Leaked-password protection is disabled.

[Supabase remediation: anonymous SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)

### P1: scheduling stale-update race

The live `assign_job` reads `updated_at` before its technician advisory lock and
updates by job ID alone. Two callers can read the same revision; reassignments to
different technicians do not share that advisory lock. The comparison also uses
`!=`, so a null expected timestamp does not reject the request. Add a job-row lock
or atomic compare-and-update, require the expected revision, and test simultaneous
reassignments. The existing technician lock helps overlap checking but does not
establish complete concurrency safety. Check triggers/constraints and all alternate
write paths before asserting six-jobs-per-day enforcement or overlap prevention.

## Engineering and release standards

- Keep Expo/React Native, GitHub, Supabase and Vercel. Add Firebase notifications
  and crash reporting only where useful. Defer AWS, Kubernetes, sharding, dedicated
  load balancers, private networking and Terraform until requirements justify them.
- Keep UI, domain logic and data access separate; reuse shared business rules.
  Use server-side RBAC/RLS, least privilege, request validation and secure secrets.
- Require relevant unit/integration tests, PR checks, reviewed migrations with
  rollback considerations, sanitized logs, rate limiting and idempotent mutations.
- Use query/index analysis, pagination and caching based on evidence. Add queues,
  bounded retries, dead-letter handling and circuit breakers for actual background
  processing needs, with observable pending/failed states and signature checks.
- AI outputs require validation and appropriate human approval. Do not ship agent
  secrets in the app. Apply data minimization, access controls, retention decisions
  and a Canadian privacy review; no blanket compliance claim.
- Preserve the approved operational rules: client-linked notes/access/COI,
  technician identity, six daily jobs with authorized exceptions, no silent schedule
  conflicts, explicit customer-delivery states and current emergency fee policy.
  Muse must reconcile stale service/pricing text with subsequent user instructions.

## Android acceptance evidence required

For a labeled test client: create request → prepare estimate → office approves →
client accepts where required → assign technician and verify notification → record
measurements/photos/checklists → complete work → generate and record reviewed
invoice. Verify direct-job routing too. Keep paid/closed states separate.

Record tested commit, APK build ID, device/Android version and role for each run.
Include cross-org denials, private-note visibility, interrupted photo uploads,
duplicate submissions, token expiry, stale/concurrent bookings, missing notification
delivery, and app restart/network loss. Use designated test recipients only.
Browser previews, unit tests and Vercel READY status cannot substitute for this.
