# Mobile connection and account handoff

Lavie approved connecting mobile to the web app's existing Supabase project
(`jgbciyogyratfplofizv`). No separate staging project is required.

## Test accounts provisioned

- `quoteunquoteapp@gmail.com`: active dispatcher membership.
- `shaedytraveler@gmail.com`: active technician membership and an active
  `technicians.auth_user_id` link.
- Both memberships belong to the existing Clarifi Workspace.
- Account/profile display names are clearly labelled `TEST — Mobile …`.
- Both email addresses are confirmed; real password sign-in passed for both roles.
- Generated test passwords are in a private local runtime settings file outside the app/repository,
  not in the repository, app bundle, PR, or chat.

No backend migrations or API routes were changed. No business jobs were modified.

## RLS findings for Muse

The connected database's current policies and grants were inspected directly.
These are backend findings, not conclusions from mocked tests:

1. `supplier_materials` has a SELECT policy named
   `members can read supplier materials`, with
   `private.is_org_member(organization_id)` as its predicate. `authenticated`
   has SELECT on the table. The helper checks membership, not staff role.
   Technician membership therefore does not deny a direct supplier-price read.
2. `organization_members` has an ALL policy named
   `members can write members`, using that same predicate for both USING and
   WITH CHECK. `authenticated` has UPDATE/INSERT/DELETE. This does not restrict
   membership or role administration to office administrators.
3. `private.is_org_member(uuid)` checks `organization_id` and `auth.uid()`;
   it does not check the membership's `active` flag.

The mobile UI loads only active memberships, filters technician assignments,
and never requests supplier prices or writes memberships. Those UI choices do
not replace database authorization. Muse should own the policy fixes and
migrations under the agreed ownership boundary.

The read-only `mobile/tests/live-access.mjs` intentionally fails if a technician
can read a known internal material fixture. Do not weaken that assertion to make
verification pass. Android device checks and the role/RLS checks remain separate from basic connection and bundle checks.

## Live read evidence

Both signed-in test sessions successfully read their active membership and the
explicit dashboard job columns. A direct HEAD request for
`id,public_price_cents` on `supplier_materials`, scoped to their organization,
returned a successful count of 37 rows for **both** dispatcher and technician.
No supplier values were logged and no business data was changed. This confirms
that technician supplier-price denial currently fails. The complete two-org
isolation fixture suite has not been run.

The confirmation links successfully verified both accounts but then redirected
to unavailable `localhost:3000`. The owner should configure the Auth Site URL and
allowed redirect URLs for future confirmation/reset emails; mobile sign-in is
working independently of that redirect.

Private test settings must stay outside the Expo project directory. Expo's
development environment loader discovers `.env*` files, and a nonstandard
filename can be parsed as JavaScript and printed in a build error. The two test
passwords were rotated and prior sessions revoked after discovering this;
current credentials are stored outside the repository with restricted permissions.

Live browser verification also passed for both roles: real email/password
sign-in, active workspace loading, dashboard queries, office-only queue counts,
account navigation, and sign-out. No supplier-material requests were made by
the UI. Requests reached the real Supabase API through the environment proxy;
responses were not mocked. Android export passed; Android device verification
is still pending. The Expo tunnel timed out in this environment.
