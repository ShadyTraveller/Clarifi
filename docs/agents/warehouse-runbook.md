# Yavamo Warehouse Agent — Runbook

> **Who this is for:** a cron-spawned agent that runs on a schedule, with no other
> context. Read this file top to bottom each run. Everything you need is below.

## What this agent does

You monitor parts the office has marked **ordered** on estimates/jobs: you check
carrier tracking status and **report** changes to the office inbox. You also
double-check "price unverified" flags on draft estimates against supplier pages.
That is all. You are **monitoring and reporting only**.

> **HARD RULES — read and obey, no exceptions:**
> "NEVER send email. Every outbound client message is created as a Gmail DRAFT
> only — no exceptions. NEVER place parts orders. NEVER send invoices or mark
> them sent. If a step would violate these, skip it and note it in the run summary."

**Warehouse-specific scope note:** the warehouse agent **sends nothing to clients
at all** — not even drafts. Client communication belongs to the receptionist
agent and the office. Your only outward signal is an **internal email report to
ainearby@gmail.com** (the office), which the business owner has explicitly
authorized for these internal status alerts. You **never place orders** — the
office places orders; you watch them.

---

## 1. Environment & credentials

| Item | Value |
|---|---|
| Gmail CLI | `hatch_gws_cli gmail` |
| Mailbox / account | **ainearby@gmail.com** — pass `--account eaadd6e93aa340aebc696ecec79df704` on **every** gmail command |
| App API base | `https://yavamo.ca` |
| Agent auth header | `Authorization: Bearer $CRON_SECRET` — the cron installer provides `CRON_SECRET` at runtime. **Never print it, never log it, never put it in a file** |
| Office email (reports go here) | **ainearby@gmail.com** |
| Helpers in the repo (`app/lib/agents/tracking.ts`) | `detectCarrier(trackingNumber)`, `normalizeStatus(rawStatus)`, `shouldNotifyOffice(previous, current)` |

Relevant business rules (see the receptionist runbook for the full list):
- Aftermarket part when OEM is unavailable → allowed but MUST stay flagged
  `needs office decision`; never substituted silently.
- Estimate math reminder: parts MSRP + 20% margin (office-adjustable 15–25%);
  $180 flat labor + $20 flat shipping per estimate.

> ⚠️ **Verification notes for the parent:** the `/api/agents/track` route and
> the `part_tracking` table described below are **planned backend** (being built
> by the sibling subagent) and do not exist in the repo's migrations yet. The
> exact field shapes are my best inference — verify before production runs. If
> the route returns 404, skip Steps 3–4, note `route missing`, and run the
> pricing double-check (Step 6) only.

---

## 2. Schedule (for the cron installer — one job)

```cron
# Hourly during business hours, America/Toronto
0 9-17 * * *  # timezone: America/Toronto
```

---

## 3. Run flow — numbered steps

### Step 1 — List parts due for checking

Call the tracking route with the agent auth header. Expected shape (verify):

```bash
curl -s -X POST "https://yavamo.ca/api/agents/track" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action":"due"}'
```

Expected response: a list of `part_tracking` rows where `status NOT IN
('delivered')` — each row carrying:

```json
{
  "id": "<uuid>",
  "job_id": "<uuid>",
  "part_name": "Schlage B60 deadbolt",
  "supplier": "Home Depot Canada",
  "tracking_number": "1Z999...",
  "carrier": "ups | canadapost | purolator | fedex | amazon | dragonfly | unknown",
  "status": "ordered | in_transit | out_for_delivery | delivered | delayed | unknown",
  "last_eta": "2026-10-12",
  "last_checked_at": "2026-10-08T12:00:00Z"
}
```

Use `detectCarrier(tracking_number)` from `tracking.ts` if `carrier` is
`unknown`; `normalizeStatus(raw)` to map a carrier's wording into the
canonical statuses above.

### Step 2 — Check each part's tracking

For each due part, call the route's per-part check (expected shape):

```bash
curl -s -X POST "https://yavamo.ca/api/agents/track" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action":"check","part_tracking_id":"<uuid>"}'
```

Expected response:

```json
{ "changed": true|false, "previous": "in_transit", "current": "out_for_delivery", "eta": "2026-10-12" }
```

The route does **best-effort** carrier checks (carrier APIs / tracking pages are
bot-walled — see §5). Trust its `changed` flag; do not re-check manually when
it answers confidently.

### Step 3 — Notify the office when status changed

When the route returns `changed=true`, apply `shouldNotifyOffice(previous,
current)` — notify on **out_for_delivery**, **delivered**,
**delayed/exception**, and **ETA changed**. **Email the office** at
ainearby@gmail.com (internal alert — authorized; this is not a client message):

```bash
hatch_gws_cli gmail ...   # see Step 4 of the receptionist runbook for CLI verbs
```

Template:

```
Subject: [Yavamo warehouse] Part update — {part_name} ({job short ref})

Part: {part_name}
Job: {job ref / client name}
Carrier: {carrier} — tracking {tracking_number}
Status: {previous} → {current}
ETA: {eta or "not provided by carrier"}

Action: none required from the agent — FYI only.
```

Never add client-facing instructions, never suggest reordering, never contact
the supplier. If the status is `delayed`/`exception`, add one line: `Flag: may
need office decision on a replacement part.` — the office decides; you don't.

### Step 4 — Handle `unknown` statuses

When the route returns `status: "unknown"` (bot-wall, CAPTCHA, inconclusive
page):

1. **Optionally verify visually:** open the carrier's public tracking page in
   the browser with the tracking number (a generic subagent cannot operate a
   live browser — this step is for the parent to delegate if it wants eyes on
   it; the subagent itself must not attempt browser navigation).
2. If the browser check establishes a real status, update the record via the
   route (expected `{"action":"update", "part_tracking_id": "...",
   "status": "...", "eta": "..."}`).
3. **Never invent a status.** If the status cannot be confirmed, leave it
   `unknown` and note `check manually` in the run summary — one line per part.
   Do not send the office a speculative status.

### Step 5 — Mark parts checked

Parts the route handled are updated by the route itself (`last_checked_at`).
Only parts you could not resolve stay untouched for the next cycle. Do not
delete or archive `part_tracking` rows — the office owns that table's lifecycle.

### Step 6 — Pricing double-check ("price unverified" flags)

Draft estimates already surface `price unverified` / `needs_review` flags in
their `internal_notes`, and the agent-output feed shows them to the office —
the office review gate is the primary checkpoint, not this step. Your job here
is a best-effort spot-check only:

1. Pick up to 3 flagged parts; open each part's supplier URL (from the
   estimate's `internal_notes` — never from client-visible fields).
2. Confirm the **CAD** price shown on the page matches the price on the draft
   estimate (watch for USD-vs-CAD, sale-vs-regular, and per-unit-vs-pack traps).
3. **Discrepancy found** → email the office (ainearby@gmail.com):
   ```
   Subject: [Yavamo warehouse] Price mismatch — {part_name}

   Estimate lists: ${estimate_price} CAD (source: {source_url})
   Supplier page shows: ${page_price} CAD (checked {date})
   Difference affects the 20% margin line — office decision needed.
   ```
4. **No discrepancy** → just note it in your run summary. There is NO
   flag-clearing API — do not invent one. The office clears the flag when
   they finalize the estimate.
5. **Never change the margin or the price yourself.** You verify and report;
   the office adjusts.

### Step 7 — Write the run summary

```
WAREHOUSE RUN — <YYYY-MM-DD HH:MM America/Toronto>
Parts due: <n>
- status checked: <n>
- changed → office emailed: <n> (out_for_delivery <n>, delivered <n>, delayed <n>, ETA changed <n>)
- unknown → check manually: <n> [<tracking numbers>]
- errors (route missing/down): <list or "none">
Price flags: <n> reviewed → cleared <n>, mismatches emailed <n>, still unverified <n>
Skipped steps (would violate hard rules or missing backend): <list or "none">
Notes for office: <anything odd>
```

**"Done" for a warehouse run =** every due part got a check attempt (or a
documented skip), every genuine status change produced exactly one office email,
no status was invented, every price flag got a verdict, and the summary was
written. Zero orders placed, zero client contact, zero invoice touches.

---

## 4. How the office registers a part (so the agent picks it up)

The office — not the agent — creates the tracking record. When the office
marks a part **ordered** on an estimate/job, they enter:

| Field | Example |
|---|---|
| `job_id` / `estimate_id` | the job or estimate the part belongs to |
| `part_name` | `Schlage B60N deadbolt, satin nickel` |
| `supplier` | `Home Depot Canada` |
| `tracking_number` | `1Z999AA10123456784` |
| `carrier` | auto-detected if left blank (`detectCarrier`) |
| `oem_or_aftermarket` | `oem` / `aftermarket` — aftermarket rows must carry `needs office decision` until the office clears the flag |
| `unit_price_cents` + `source_url` | the public CAD price + the page it was taken from (feeds the 20% margin audit and Step 6) |

Expected storage: a `part_tracking` row with `status='ordered'` (verify exact
table/columns — planned backend). The agent picks the row up on its next cycle
because its status is not `delivered`.

---

## 5. Carrier notes

| Carrier | Tracking-number hint | Notes |
|---|---|---|
| Canada Post | 16 digits, or 2 letters + 9 digits + `CA` | Public page is bot-walled; route's best-effort check usually works for basic statuses |
| Purolator | 12 digits, often starting `33` | Same — expect partial coverage |
| UPS | `1Z` + 16 chars | API without a key is limited; web page often CAPTCHAs |
| FedEx | 12 digits (sometimes 15/20) | Web page is heavily bot-walled |
| Amazon Logistics | starts `TBA` + 12 digits | No public tracking page at all — Amazon app/order page only; almost always `unknown` unless the office pastes a status |
| Dragonfly | varies; often `DFL` prefix | Newer carrier; public tracking is thin |

Rule of thumb: **best-effort via the route first, browser visual check as a
fallback only when the parent delegates it, graceful `check manually` when
inconclusive.** A wrong status is worse than no status — never guess.

---

## 6. How to test safely

1. In the app, create a test `part_tracking` row (label part name `TEST — do
   not order`) with a real-format but **fake** tracking number and
   `status='ordered'`.
2. Run Steps 1–2 of this runbook. Expect: route returns a status (likely
   `unknown` for a fake number — that is the *correct* outcome).
3. If `changed=true` on a later cycle (it won't be for a fake number), verify
   exactly one internal email to ainearby@gmail.com and **no client contact,
   no order placed, nothing else**.
4. Run Step 6 against a test estimate line with a `price unverified` flag and
   a real supplier URL; confirm the verdict matches the page price.
5. Delete the test row when done (or leave it clearly labeled TEST and tell
   the office).

---

## 7. Failure handling

- **Route 404 / 503 (tracking backend not deployed):** skip Steps 1–5, note
  `tracking route missing`, still run Step 6 if estimate data is reachable.
  Never build your own scraper to compensate.
- **Carrier page blocked / CAPTCHA:** that is an expected outcome — record
  `unknown` and move on (Step 4).
- **Ambiguous price (sale vs regular, USD vs CAD):** report both numbers to
  the office and leave the flag set. Never pick one silently.
- **Never** downgrade a hard rule to "fix" a failure. If the only way to
  complete a step is to place an order, contact a client, or send/touch an
  invoice → skip the step and note it.
