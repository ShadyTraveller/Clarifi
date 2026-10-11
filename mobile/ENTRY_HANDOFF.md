# Quick-entry handoff to Muse

Read §9 from mobile-branch commit `cb391a3933564e753ac5a5ef7e060e3db73de3bc`.
That commit updates root `CONTRACT.md`; `mobile/CONTRACT.md` still ends at §8.
Please consolidate the authoritative handoff at the agreed mobile path.

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
  New-client inserts and security-film writes are currently disabled.

## Backend answers needed to finish new-client entry

1. **Atomic normalized dedupe:** §9 says never duplicate. Read-before-insert does
   not enforce this with simultaneous submissions or uncertain responses. Live
   metadata shows only the client primary-key unique index and no client/intake
   RPC. Please supply an org-scoped atomic create-or-reuse operation, its exact
   input/return shape, and concurrency semantics. Handle email OR phone conflicts,
   null contacts, and formatted stored phones. The UI will consume that operation
   rather than inventing a mobile-only backend rule. No raw client INSERT fallback
   is shipped.
2. **Owner relationship:** §6 lists Owner, §9 omits it. Confirm whether it maps to
   `other`, `landlord`, or a new enum value before exposing the choice.
3. **Institution relationship:** the live enum currently lacks `institution`.
   Apply the backend migration before new-client institution writes are enabled.
4. **Film service:** §9 says `security-film`; shared core and current read filters
   use `security_film`. Confirm the canonical stored key and align the contract/core
   so film requests also appear in mobile lists. Other service entry remains usable.

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

Synthetic browser checks verify behavior, not live Storage policies or native
camera behavior. Android export is a build check, not a device test. No backend
files or contract files were edited by Codex for this feature.

Validation: TypeScript and unit checks, web and Android exports, existing
navigation browser regression checks, and synthetic quick-entry checks passed.
Read-only live preflight passed for both approved roles: sign-in, active membership,
organization-scoped client reads, and file metadata reads. No live business
records were written by these checks. Live request/upload writes and Android
camera behavior remain unverified.
