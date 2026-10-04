# Yavamo architecture

The Next.js application runs on Vercel. Supabase provides Auth, PostgreSQL with row-level security, private job-file storage and the existing customer approval function.

## Request and estimate flow

Browser calls include the authenticated user's bearer token. Server handlers validate it with Supabase getUser and require active organization membership. Only the server creates OpenAI requests, with response storage disabled. The OpenAI key is never serialized to the browser.

Request drafts remain editable before an atomic create_clarifi_request call. Specialty matching uses recent coordinates and geographic distance. Unknown locations leave work unassigned.

Estimate calculations use confirmed dimensions and customer prices. Supplier URLs must match approved HTTPS retailer domains and search sources. Product-page structured data may confirm a CAD price and photo; missing data remains unconfirmed. save_clarifi_estimate writes the version and lines atomically. Customer scope and totals exclude internal costs and supplier sourcing.

## Customer approvals

Dispatch issues a version-bound, expiring approval token. The database stores its hash. Server routes proxy the existing customer function and return only the customer projection. Repeated approval is idempotent. Payment collection and automatic delivery remain deferred.

## Field work

Technicians see their assigned daily jobs. Location sharing requires an explicit action; dispatch refreshes stored locations periodically. Photos use private storage and short-lived signed URLs. AI photo results describe visible evidence; checklist completion remains manual and skincare output does not diagnose conditions.

## Verification

Domain tests cover measurement conversion, totals, assignment and supplier URL boundaries. Browser fixtures cover request creation, estimate editing, client preview and responsive navigation. Live database checks use rollback transactions. A secret scan checks the compiled browser assets. Provider billing must be active to verify live AI generation.
