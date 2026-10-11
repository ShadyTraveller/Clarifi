# Quick-entry RPC handoff to Muse

Mobile now sends `p_source_ref` with every `create_clarifi_request` call, following
Muse’s RPC-v2 contract in mobile-branch commit `eb34d43`. That commit added the
contract at repository root; please put the authoritative update in
`mobile/CONTRACT.md`. Codex has not edited either contract or backend files.

## Implemented for review

- New/existing client entry with contact matching, four service choices,
  unit/gate instructions, and camera/library photos.
- A stable request UUID persisted before the first RPC, reused on every retry.
  No raw client/job INSERT or old three-argument fallback.
- Server-returned job ID and its scoped client ID used for attachments.
- Native encrypted recovery metadata and private photo copies; web IndexedDB
  recovery with photo blobs. Pending saves survive restart/reauthentication and
  are isolated by user, organization, and membership. Unsaved edits before the
  first save remain memory-only. Completed entries clear on explicit sign-out
  or Create another request.
- Private `job-files` objects, stable photo IDs, 4 MB image limit, metadata
  reconciliation, and signed URLs generated only at view time.

## Deployment dependency

On 2026-10-11, the configured project `jgbciyogyratfplofizv` still exposed only
`create_clarifi_request(target_org, client_info, job_info)`. Apply migration
`202610100005` with active office authorization, concurrent normalized dedupe,
blank-only client updates, and replay by `p_source_ref`. Confirm the Institution
fallback described in the updated contract. Until then, mobile keeps the entry
and explains that saving awaits the server update.

## Verification and review

TypeScript, all five unit-test files, web export, navigation regression, and
quick-entry browser checks at 320/390/1280 px passed. Synthetic tests cover exact RPC shapes, distinct request/job IDs, uncertain
responses, persistent photo recovery, storage failure before RPC, new/existing
clients, and completed-entry cleanup. Live helpers now use the four-argument RPC;
live RPC verification remains pending deployment. Earlier live API/browser passes
were for the previous direct-write implementation, not this change.

After deployment verify new-client concurrent email/phone dedupe, existing-contact
preservation, same-reference replay, and technician/inactive-member rejection.
Use only labelled TEST records and remove generated jobs/photos after verification.

On Android, test camera/gallery permissions, full restart during an uncertain
save, attachment retry, workspace switching, and reauthentication. Native build
success is not device verification. Keep PR #1 draft until user review; do not merge.
