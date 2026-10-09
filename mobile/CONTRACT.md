# Yavamo Mobile — Codex Contract

> **Read this whole file before writing any code.** It is the contract between
> the backend owner (Muse) and the mobile UI builder (Codex). If anything here
> is ambiguous, ask Lavie — do not guess on pricing, auth, or data shapes.

## 1. What you're building

**Yavamo** — field-services app for a Toronto business (doors, security film,
locksmithing rekey/lock-change only, private skincare via red-light therapy
devices only). **Windows is OUT of scope** — never build windows UI, copy, or
options.

A **React Native / Expo** mobile app, **Android-first** (iOS later — no Apple
Developer work now). It lives **alongside** the existing Next.js web app
(live at https://www.yavamo.ca): web = office dispatch, mobile = field techs
**and** dispatch-on-the-go. Same Supabase backend, same tables, same RLS.

**v1 non-goals:** iOS builds, offline support (v1 requires connectivity),
client-facing screens (office/tech only), payments.

## 2. Repo layout

```
ShadyTraveller/Clarifi
├── app/                  # Next.js web app (office) — DO NOT RESTRUCTURE
├── packages/core/        # @yavamo/core — shared engine (see §3)
├── mobile/               # <-- YOU BUILD HERE (Expo app)
│   ├── CONTRACT.md       # this file
│   ├── app/              # expo-router screens
│   ├── components/
│   └── lib/              # supabase client, api helpers
├── supabase/migrations/  # DB migrations — DO NOT EDIT (Muse owns)
└── docs/agents/          # agent runbooks — read-only reference
```

**Branches:** `main` = production web app (always deployable). All mobile work
on the `mobile` branch; feature branches off `mobile` (`mobile/dispatch-map`);
PRs into `mobile`. Never push directly to `main`.

## 3. Shared engine — @yavamo/core (already exists, USE IT)

`packages/core/src/` is framework-free TypeScript. **Import it — never
reimplement its math.**

```ts
import {
  buildEstimate,        // deterministic estimate engine
  customerProjection,    // strips internal pricing for client views
  roundMoney,
  LABOR_TIERS, tierRate, // 150 / 180 / 220
  ASSESSMENT_FEE_CENTS,  // 6900 ($69)
  PART_MARGIN_DEFAULT_PCT, // 20 (office-adjustable 15–25)
  LABOR_FLAT, SHIPPING_FLAT, // 180 / 20
  isOutOfScope, hasExtension, isBusinessHours,
  buildInquiryDraft, buildAfterHoursDraft, buildDeclineDraft,
  type ServiceKey,      // 'doors' | 'security-film' | 'locksmith' | 'skincare'
  type EstimateInput, type EstimateResult, type ClientEstimate,
} from '@yavamo/core';
```

Expo resolution: configure the same path alias the web app uses
(`@yavamo/core` → `../packages/core/src`) via `babel-plugin-module-resolver`
or tsconfig paths. The package is source-only (`main` → `./src/index.ts`).

**Pricing rules (hard, from the business):**
- Client estimate = parts at (public price + 20% margin) + **$180 flat labour**
  (once per estimate; **$220** for emergency/complex/two-tech) + **$20 flat
  shipping** (once per estimate, only if parts are ordered).
- Two distinct jobs in one request → 2× $69 assessment fee ($138), labour
  stays $180 × 1.
- Internal cost basis (`unit_cost`, supplier URLs, margin math) is **NEVER**
  shown to clients or techs — office eyes only.

## 4. Backend access

**Supabase directly** (reads/writes the app needs):
- JS client `@supabase/supabase-js`, project URL + **anon/publishable key**
  (same values as the web app's `NEXT_PUBLIC_*` env — ask Lavie, or read from
  the Vercel project env).
- Auth: Supabase Auth (email/password). Session via `expo-secure-store`.
- RLS enforces org scoping (`private.is_org_member`) — you get it for free;
  always filter by the user's `organization_id`.

**Agent routes (`/api/agents/*`) — DO NOT CALL FROM THE APP.**
They authenticate with a server-side bearer secret (`CRON_SECRET`) that must
never ship in a mobile binary. The mobile app surfaces agent **outputs**
(read-only, §6), never triggers agent **actions**. If a screen needs an
action (e.g. "generate auto-estimate"), leave a clearly-marked TODO —
a session-authenticated wrapper endpoint will be added backend-side.

Key tables (all org-scoped):
| Table | Purpose |
|---|---|
| `clients` | client records |
| `jobs` | requests (`status='lead'`), estimates, active jobs, completed |
| `quotes` / `quote_versions` / `quote_line_items` | estimates; `source='agent'` = auto-drafted |
| `estimate_templates` / `template_line_items` | master templates (Request→Template→Estimate cloning) |
| `supplier_materials` | internal catalog: public CAD price + source URL (**never client-visible**) |
| `part_tracking` | warehouse: ordered parts + carrier tracking |
| `notifications` | office notification queue (`emailed`, `read`) |
| `invoices` | invoices (office sends only — mobile is read-only) |

## 5. Design system (port the web app's look, don't invent one)

- **Ink-black** top command bar (`#111` range) with live queue signal
- **Yellow** `#FFD60A` — only on ink-black or with black text
- **Warm off-white** background `#FAFAF7`
- **Inter** typeface; flattened nav; Google-minimal density
- Mobile-first: big touch targets, works one-handed in the field

## 6. v1 screens

1. **Dispatch home** — today's jobs, unassigned requests count, alerts count.
2. **Client quick-entry** — name, phone (flag extensions: "ask for direct
   line"), email, address + unit + gate code, role
   (tenant/landlord/owner/property-management/institution/commercial), service,
   job details, photos. Creates a `jobs` row with `status='lead'`.
3. **Map** — tech pins (manual pins for v1: tap-to-drop / address geocode;
   **no live GPS**), job pins. Leaflet/ OSM equivalent for RN
   (`react-native-maps` with OSM tiles is fine).
4. **Week view** — appointments for the week, assign tech to job.
5. **Status boards** — Requests / Estimates / Jobs / Invoices, same columns as
   the web pipeline (Lead → Estimate → Job → Completed).
6. **Agent-output feed** — the money screen for "fast, efficient, done
   right": draft estimates needing office review (`quotes` where
   `source='agent'` and `status='draft'`, with `needs_review` flags surfaced
   from `internal_notes`), part-tracking alerts (out-for-delivery / delivered /
   delay from `part_tracking`), completion-reversal alerts. Tapping an item
   deep-links to the relevant board. **Read-only except: mark notification
   read.**
7. **Job detail** — notes/files thread (photos stay visible), status moves,
   tech completion with the mistake-guard rule surfaced (no notes/photos →
   warn before completing).

## 7. Definition of done (per screen)

- Runs on Android via `npx expo start` / dev build; no TypeScript errors.
- Reads/writes go through Supabase with the signed-in user's session (prove
  RLS scoping: user A never sees org B — single org now, but code it right).
- No `CRON_SECRET`, no service keys, no internal pricing in the bundle or on
  any screen a tech could screenshot to a client.
- Every screen handles loading / empty / error states.

## 8. Ownership & workflow

- **Muse owns:** `supabase/migrations/`, `packages/core/`, `app/api/agents/`,
  this contract. Backend questions → ask in the PR, don't work around.
- **Codex owns:** everything under `mobile/`.
- Keep PRs small (one screen or one feature). PR description states what was
  built, what was stubbed, and the manual test steps on Android.
