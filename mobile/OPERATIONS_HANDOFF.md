# Operational reliability handoff

User requirement, 2026-10-11: prevent missed office/technician client notes,
double-booked appointments, wrong technician assignments, and missed customer
updates when appointments change or warehouse parts arrive.

This document records acceptance criteria and backend dependencies. It does not
replace Muse’s authoritative `mobile/CONTRACT.md` or claim these flows are shipped.
Codex owns mobile UI; Muse owns backend enforcement and the contract.

## Notes shared between office and field

- One client/job timeline, with author, office/technician role, timestamp, and
  explicit audience. Do not expose office-only pricing/internal notes to techs.
- Show unread critical notes; record acknowledgement against the note revision.
  New edits invalidate old acknowledgement. Display failed/stale loads separately
  from an empty timeline; never label a failed request “No notes”.
- Durable unsent note drafts, idempotent saves, and visible pending/failed states.
  Concurrent notes append without overwriting another person’s contribution.
- Backend contract needed: supported note fields, visibility rules, pagination,
  author projection, revision, append and acknowledgement endpoints, role policy.

## Appointments and technician identity

- Show named technician, customer, address, local time zone, start/end and service
  before confirmation; never substitute “Assigned to the team” for a verified name.
- Backend must atomically reject overlapping active appointments for a technician,
  including concurrent office/field saves, overnight windows and daylight saving.
  Reject missing/invalid end times and inactive or cross-workspace technicians.
- Use one authoritative assignment identity and define how assigned_to and
  technician_id are reconciled. Flag conflicting identities, not a guessed winner.
- Reassignment/reschedule uses expected revision and idempotency key; reject stale
  edits and refresh the actual assignment. Record actor, reason, old/new values.
- Mobile may precheck for convenience; paginated calendar contents cannot prove
  no conflict. No direct mobile scheduling writes until atomic API is documented.
- Contract needed: scheduling RPC, role permissions, revision/conflict responses,
  active technician display fields, availability/travel-buffer rules.

## Customer updates and warehouse parts

- A delay/reschedule creates a job-linked notification obligation atomically with
  the change. Show queued, sent, delivered, failed and customer-confirmed distinctly.
  Sent is not proof of delivery; delivered is not proof the customer read it.
- Failed/unknown delivery remains visible to office with retry/escalation and a
  recorded manual-contact outcome. Avoid duplicate sends on retry. A newer
  appointment revision must not be followed by a delayed obsolete notification.
- Use verified customer contact/channel and record actor, destination, event and
  revision. Never infer customer notification from an office notification’s read
  or emailed flag. No automatic messages from Codex during implementation/testing.
- Parts are linked by job ID and reservation/quantity. Distinguish carrier delivery
  from warehouse receipt and “all required parts ready”; partial receipt or parts
  allocated to another job must not mark this job ready or notify its customer.
- Office/assigned-tech alerts deep-link to the correct job. Customer updates use
  the approved channel and delivery tracking above, with no supplier/internal costs.
- Contract needed: parts reservations/receipts/readiness projection, customer
  message outbox and delivery receipts, safe retry and manual-contact APIs.

## Release verification

Run paired office/technician sessions against labelled TEST records: concurrent
notes, stale acknowledgements, conflicting booking saves, stale reassignment,
wrong-organization technician, time-zone boundaries, failed/delayed/duplicate
messages, partial warehouse receipts, and parts reserved for another job. Inject
network loss/restart and ensure errors cannot look like success. Verify RLS with
both roles. Customer-delivery tests require a designated test recipient/provider
sandbox; no real customer messages. Keep release blocked on these scenarios for
the corresponding features until backend and mobile evidence is available.

## Scheduling and financial lifecycle (user expansion, 2026-10-11)

The user explicitly expands scope to scheduling/assignment, emergency dispatch,
payment recording and office-reviewed invoicing. The older contract lists payments
and client-facing screens as non-goals. This request supersedes that product scope,
but does not supply payment-provider credentials, financial rules or API shapes.
Muse must update the authoritative contract; Codex must not invent those shapes
or write migrations/core/agent routes. A client request can enter through the
existing client/web intake; this does not presume a new client account in mobile.

### Required business sequence

1. A client or office creates a request for the client, retaining client identity,
   contact/address, notes, photos and service details under linked stable IDs.
2. Office routes the request either to an estimate or directly to a job.
3. Estimate route: prepare a draft, office reviews that exact revision, then send
   the approved version to the client. Changes invalidate prior approval. Client
   acceptance AND confirmed receipt of the required percentage deposit are required
   before scheduling, including direct jobs. Use the existing client-role defaults
   below after Muse reconciles server policy. Emergency prepayment/call-out rules
   await user clarification; do not invent a rate or cancellation fee in mobile.
4. Job route: select an available qualified technician and valid appointment window;
   atomically save both assignment and booking. The estimate route joins this stage
   when its required approvals/acceptance have been met.
5. Perform work, retain visit notes/photos and record work completion separately
   from financial state. Tech or office may record payment received with permission;
   completion must never fabricate a payment or overwrite an existing deposit.
6. Work completion prepares exactly one linked invoice draft (or a visible failed
   preparation state) from the approved scope, recorded work and applicable payment
   records. Office reviews before sending it to the client; edits require re-review.
7. Close the job only after full payment is confirmed received and the required
   office invoice review/send steps are satisfied. Unpaid or pending payments block
   closure; completed work remains distinguishable from a closed job. Closed work
   enters the weekly accounting report, preserving links and revision history.

Do not map this entire sequence onto jobs.status='completed'. Contract projections
must distinguish work status, estimate review, scheduling, invoice review/send,
payment balance and administrative closure. Partial payments, deposits, refunds,
reopening and corrected invoices need auditable transitions rather than rewrites.

### Dispatch calendar and emergency moves

- Day/week technician lanes, clear job cards and month overview; available slots
  come from active working hours, time off, skills, existing bookings, duration,
  travel/buffers and multi-technician requirements. Missing data is unavailable or
  unknown, never a free slot inferred from the current page of appointments.
- Cards show the customer, job/service, address, named technician(s), full window,
  priority and relevant unread-note/parts/customer-update indicators. Opening the
  card keeps the same client/job context; moving it must not copy or detach notes.
- Drag-and-drop previews old/new times and assigned technician(s), then submits a
  versioned atomic move. Provide a Move appointment form for touch, keyboard and
  assistive-technology use. Pending moves are not displayed as confirmed. Rejected
  moves restore/reload the authoritative schedule and show conflict details.
- For a job running long, propose a new end and show every affected appointment.
  Moving several jobs requires an atomic reviewed change set or a documented safe
  alternative; never leave a partially applied chain with overlapping bookings.
- Emergency deposit received is a verified financial event linked to that job.
  It surfaces an urgent dispatch item with valid slot/technician alternatives.
  It must not silently displace existing bookings or bypass conflict checks.
  Deposit thresholds, cleared/received semantics and priority rules need definition.
- Confirm emergency changes with the dispatcher and create customer/technician
  update obligations for each affected job. Track acknowledgement and delivery;
  preserve unresolved impacts visibly until resolved. No automatic displacement
  or customer messaging is enabled by this specification alone.

### Invoice and payment handoff

- Reuse client, service, approved scope/estimate, work records and linked payments;
  no repeated manual copying of customer details or duplicate invoice drafts.
- Office approval and send permissions enforced on the server for the exact
  estimate/invoice revision. Technician UI exposes only permitted payment details,
  never supplier costs, office expenses or profit/margin calculations.
- Payment entry must distinguish a pending/unverified report from confirmed money
  received, with amount/currency, method, receipt/reference, collector, timestamp,
  allocation and reversal history. Repeated taps/provider events must be idempotent.
- User requires card processing inside the app, initially tested in a payment
  provider sandbox. Stripe is the recommended candidate, not yet provisioned or
  integrated. Provider-hosted/native payment UI handles card details; no raw card
  numbers or CVC are saved in app state, logs or Supabase. Backend verifies payment
  events and reconciles amounts/currency/job linkage before unlocking scheduling
  or closure. A mobile success screen or pending authorization is not payment proof.
  Keep sandbox transactions out of live balances, availability gates and reports.
  Refunds/disputes after closure create explicit accounting exceptions and an audit
  trail. Shared core/backend owns calculations; fees, taxes and ledger rules are
  not invented by mobile.
- Weekly office/accounting reports link jobs, invoices, deposits, receipts, unpaid
  balances, refunds and expenses; separately show earned/billed amounts and cash
  collected so deposits are not double-counted as revenue. Accounting determines
  recognition, tax, expense allocation, profit definitions and reporting cutoffs.
  Missing costs produce incomplete figures, not an invented profit. Corrected or
  reopened jobs retain an adjustment trail for previously issued reports.

### Contract additions required from Muse

Availability/technician projections; atomic book/move/extend/reassign APIs with
revision and idempotency; conflict details; request-to-estimate/job transitions;
versioned office approve/send APIs; safe completion/invoice-draft preparation;
payment/deposit recording and verification; closure prerequisites; accounting
report projection and role restrictions. Include failures, allowed roles and
reconciliation behavior. This is a request for contract shapes, not a new parallel
API contract defined by mobile.

### Acceptance scenarios and implementation order

1. Availability and clear appointment cards, then atomic booking/assignment.
2. Accessible drag/move/extend and emergency-impact review with update tracking.
3. Estimate review/send gates and separate work/payment/invoice/closure states.
4. Idempotent invoice preparation, office review and payment reconciliation.
5. Weekly accounting handoff and reconciliation against the source records.

Verify two dispatchers competing for one slot; multi-tech all-or-nothing booking;
long-job/emergency cascades; stale drag and network loss; reopened work; duplicate
completion/deposit/payment callbacks; partial/full payment; changed estimates or
invoices after approval; failed draft preparation and message delivery; and exact
job/payment linkage in weekly reporting. “No overlaps” is an atomic backend rule
plus tested behavior, not a promise made from the calendar’s appearance.

Current implementation: read-only week/month/day agenda, client/service-linked job
cards and detail, request/photo entry. Cards now show full recorded appointment
windows or explicitly missing end times. Empty days no longer imply availability.
Availability search, booking/moving, payment, invoice and closure actions remain
unimplemented until the documented backend guarantees and policies are available.

### Geographic dispatch planning

Review jobs on the map and suggest grouping nearby work when appointments, skills,
parts readiness and customer commitments permit. Include realistic travel time,
breaks and configurable buffers; never optimize distance by silently moving a
committed booking. Show the affected jobs and require dispatch confirmation with
server conflict checks. Current technician locations are manual pins: show age
and source, and do not describe them as live GPS. Routing suggestions and travel
estimates remain unimplemented and require a documented data source.

### Sandbox payment integration handoff

Stripe sandbox is a candidate for testing deposits, final balances, declines,
authentication, refunds and duplicate/delayed events without real charges. Use
separate test data and sandbox keys. Only the provider publishable key belongs in
mobile; secret and webhook-signing keys belong in secure server configuration.
Muse must provide session-authenticated payment creation/status endpoints, signed
webhook processing with idempotency, verified job/organization allocation and
atomic enforcement of acceptance/deposit/full-payment gates. No agent-secret API
calls from mobile. In-app card entry and in-person Tap to Pay/readers are distinct
integrations; do not imply the latter is supplied by PaymentSheet.

References: https://docs.stripe.com/sandboxes and
https://docs.expo.dev/versions/latest/sdk/stripe/ . Testing is not launch readiness;
live processing has fees and requires merchant onboarding. No provider account or
payment integration was created by this requirements update.

## Client-centred dispatch and workforce requirements (2026-10-11)

### Existing deposit defaults: verified code and live mismatch

Web `app/page.tsx:37` on `origin/main` (1970204) defines:

| Client relationship | UI default deposit |
| --- | ---: |
| Property management | 25% |
| Commercial | 25% |
| Institution | 50% |
| Owner | 50% |
| Landlord | 50% |
| Tenant | 100% |
| Other | 50% |

`app/Composers.tsx` applies the same grouping when selecting a request; office
can override the quote. Shared `buildEstimate` defaults to 50% if omitted and
agent estimate input also supplies 50%; it is not a shared role-policy resolver.
Mobile currently neither collects nor enforces deposits.

Read-only inspection of the live `set_quote_commercial_terms` and
`private.resolve_deposit_percent` functions on 2026-10-11 found a different rule:
explicit override → nonzero scope-template default → markup-profile default → 0.
The resolver does not use its target_job argument or look up client relationship.
Thus the UI table is not proof of the actual deposit on a saved quote. Muse must
unify backend/shared policy and expose resolved amount, percentage, basis,
source/override and revision to both clients; mobile must not duplicate the map
as financial authority. Do not silently treat a 0% fallback as satisfying the
new dispatch gate. Changes to already accepted terms require explicit handling.

The user confirms deposit requirements apply to direct jobs. Emergency dispatch
must not proceed from a customer's promise to pay or an unconfirmed payment.
The user describes a customer disappearing after another person resolves the
problem: show verified collection, customer confirmation, cancellation/contact
status and a disclosed call-out policy before travel. Whether emergency work
requires full prepayment or standard role deposit remains open. Never promise
prepayment eliminates no-shows, disputes or chargebacks. No cancellation charge
is invented or automatically taken. The car-lockout example describes no-show
risk; automotive service is not added to the currently contracted service list.

### One client record throughout the flow

Client identity is the persistent navigation anchor for requests, estimates,
appointments, jobs, files, payments, invoices and history. A technician can open
the next appointment directly to a client/job summary without traversing Request
→ Estimate → Job. Preserve distinct job/visit IDs underneath a single client so
notes, payments and parts for simultaneous jobs do not mix. Every schedule card
links to that same context. Repeat visits retain history and preferred technician
when skills, availability and customer preference permit; preference never
bypasses booking conflicts or qualifications.

### Role-specific working views

- Owner: at-a-glance workload, uncovered jobs, available minutes/capacity,
  unassigned urgent work and exceptions requiring a decision. Availability and
  capacity are computed from verified schedules, not technician headcount. Let
  authorized dispatch/office handle routine decisions without owner approval;
  backend documents delegated permissions and escalation thresholds.
- Dispatch/office: one schedule board with map, technician lanes, client/job
  detail panel, notes, readiness, communications and move/assign actions. Keep
  selection and context while handling changes; avoid repeated tab navigation.
- Technician: next job, confirmed window/duration, client/contact/address, scope,
  access instructions, parts readiness, travel/arrival state and next handoff.
  Surface new critical notes and schedule changes without searching other stages.

### Capacity, hours and appointment preparation

- Normal office/technician hours: 08:00–17:00 Toronto time. Plan roughly 5–6 jobs
  per technician/day, but duration, travel, breaks and service complexity constrain
  capacity before count. A six-job hard cap versus recorded office exception is
  awaiting user choice. No automatic packing of six long jobs into a short day.
- An extra 1–2 hours may be needed to finish work; flag it explicitly as overtime,
  require the documented authorization and do not extend every shift by default.
  The ability to finish an overrun is not permission to double-book another job.
- Bookings include customer/service details, expected duration, realistic start/end,
  access permissions, gate/guardhouse code or contact, pets, parking, tenant rules,
  special instructions and COI requirements. Each appointment requires an explicit
  reviewed value or 'not applicable'; blank is not confirmation. Reconfirm reusable
  client access notes for a new site/visit rather than blindly copying stale codes.
- COI-required visits show requested/prepared/verified state, document reference,
  applicable property/client and validity. Do not call a visit ready while required
  access permission or insurance documentation is unresolved. Muse defines gates.
- Use clear service titles with consistent accessible service colours for Doors,
  Security film, Locksmith and Red-light skincare. Include text/icons; never use
  colour alone or confuse service colour with urgency or payment status.
- Keep staff-only notes separate from customer-facing text, with server-enforced
  audience and role rules. Show only permitted projections; no internal costs or
  private notes in client messages or technician-facing financial views.

### Arrival, route visibility and synchronization

The user now requests arrival/location/route tracking; this expands the older
manual-pin map requirement. Muse must specify location permission, on-duty
collection, platform/background behavior, access rules, retention, timestamp and
accuracy fields before integration. Show current/stale/unavailable explicitly.
Off-duty tracking is not implied. Compare fresh positions and recorded travel/
arrival events with scheduled jobs; GPS proximity alone is not proof of arrival,
work completion or customer presence. Provide explicit technician arrival updates
and reconcile them with automatic signals when available.

Web and mobile should observe the same authoritative client/job/visit state.
Use authenticated organization/assignment-scoped subscriptions, versioned writes,
duplicate/out-of-order event handling, refresh after reconnect and visible
connecting/up-to-date/stale/failed-save states. A lost connection must not look
like continuous syncing, and stale cached availability cannot authorize booking.
Background delivery/push requires its own contract; no always-on guarantee from
a foreground socket. Important reassignment/arrival/notes updates need delivery
and acknowledgement evidence for the correct office/technician recipients.

Current mobile uses focus/foreground/manual refresh; dashboard additionally polls
while foregrounded. It does not yet provide continuous cross-device synchronization,
live technician GPS, travel routing, slot availability or payment enforcement.

### Additional verification before rollout

Verify role defaults against server-resolved deposits (including overrides and
missing profiles); direct-job and emergency dispatch gates; customer cancellation
while a technician is travelling; per-tech count/duration/travel capacity; repeat
client preference with unavailable tech; missing/expired COI or access permission;
multiple simultaneous jobs for one client; inaccessible staff-only notes; offline
and stale location; reconnect/out-of-order events; and concurrent office/technician
updates. Demonstrate owner/dispatch/tech views independently without making the
owner a required actor for every ordinary action.
