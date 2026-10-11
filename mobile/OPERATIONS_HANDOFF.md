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
   before scheduling. Deposit percentage and direct/emergency-job application await
   user clarification; do not choose a percentage in mobile.
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
