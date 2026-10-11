# Quick-entry handoff to Muse

Integrated Muse's contract updates through mobile-branch commit
`6ea249c` without editing the contract. §9 is now at `mobile/CONTRACT.md`.
The film key (`security_film`) and Owner → `other` mapping are resolved.

## Implemented for review

- Office-only responsive quick-entry, with contact match selection, service,
  title/details, unit/gate instructions, and camera/library photos.
- Existing-client reuse by trimmed case-insensitive email OR complete normalized
  phone digits. Digit-subsequence lookup finds formatted stored numbers; exact
  normalization eliminates substring collisions. Queries stay organization-scoped.
- Lead writes omit assignment/GPS. Existing client data is never overwritten.
- Stable request/photo primary keys reconcile lost responses and repeated taps.
- Private `job-files` uploads, sanitized names, 4 MB image limit, `job_files`
  metadata, and one-hour signed URLs generated only for viewing.
- Drafts persist in memory across navigation and clear on workspace/sign-out.
  All four services can save existing-client leads. New-client inserts remain disabled.

## Backend answers needed to finish new-client entry

1. **RPC integration requirements:** `create_clarifi_request` exists live and is
   documented in §9. Its implementation still needs Muse's review for active
   office-membership authorization, concurrency-safe normalized client dedupe,
   blank-fields-only updates, and request idempotency. Please document a caller-
   supplied stable request UUID and replay behavior, returning the same job on
   retry. Handle email OR phone conflicts, null contacts, and formatted stored
   phones. Current mobile direct lead writes already reconcile by stable UUID;
   new-client RPC integration must preserve that behavior. No raw client INSERT
   fallback is shipped. Detailed observations were supplied to Lavie for Muse.
2. **Institution relationship:** the live enum currently lacks `institution`.
   Apply the backend migration or define an explicit fallback in the corrected
   RPC and contract before new-client institution writes are enabled.

## Android review steps

1. Sign in with an active office membership. Open New request, enter a known
   client's phone/email, and choose the match. Confirm original contact details.
2. Add a request, unit/gate details, and a small image. Save, open its details,
   and confirm lead status, no schedule/assignment, instructions, and photo.
3. Reject camera permission and verify library selection remains available.
   Reject a non-image or image over 4 MB; accepted images remain listed.
4. Interrupt a save/upload, switch Home → New request, and retry. Verify one
   job, one object per photo, and one metadata row; never save signed URLs.
5. Switch workspace or sign out: old draft and pending callbacks must disappear.
   Technician accounts must not expose entry; direct API writes remain subject
   to backend RLS. Verify RLS independently with signed-in test accounts.

Synthetic browser checks verify behavior, not native camera behavior. Android
export is a build check, not a device test. No backend files or contract files
were edited by Codex for this feature; Muse's contract commits were integrated.

Validation: TypeScript and unit checks, web and Android exports, existing
navigation browser regression checks, and synthetic quick-entry checks passed.
Read-only live preflight passed for both approved roles: sign-in, active membership,
organization-scoped client reads, and file metadata reads. Live API checks also
passed for existing-client film lead saves/retries, unassigned/unscheduled state,
photo upload/retry, metadata, signed download, scoped detail, and unchanged contact.
Generated TEST jobs/photos were removed and the temporary fixture email restored.
Only test records were used. New-client RPC behavior, Android camera behavior,
and the broader backend authorization review remain pending.

The complete live browser flow also passed: dispatcher sign-in, contact-only
lookup, film lead save, photo selection/upload/display, persisted job data,
contact preservation, sign-out draft reset, and technician entry visibility.
The browser test's job/photo were removed and fixture contact restored.
