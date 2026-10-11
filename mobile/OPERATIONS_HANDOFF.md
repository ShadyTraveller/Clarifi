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
