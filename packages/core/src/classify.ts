// @yavamo/core — deterministic text classification, draft builders, and the
// job-completion mistake guard.
// No React, no AI calls, no randomness, no invented prices.
//
// Moved verbatim on 2026-10-09 from app/lib/agents/classify.ts
// (isOutOfScope, hasExtension, isBusinessHours, SERVICE_QUESTIONS and the draft
// builders, classifyAssist) and app/lib/agents/mistake-guard.ts
// (assessCompletion). One deliberate scope change versus the originals:
// WINDOWS IS OUT — the 'windows' service key, its question set, its keyword
// signals and its mention in the decline-draft service list have been removed,
// per Lavie's 2026-10-08 scope decision (doors, security film, locksmith,
// skincare only). Everything else is behaviour-identical.

import type { AgentServiceKey, CompletionEvent } from './types';

interface OutOfScopeRule {
  pattern: RegExp;
  reason: string;
}

// Conservative on purpose: every rule requires an explicit out-of-scope phrase.
// Bare "lock" / "door lock" never matches — locksmith work is in scope.
const OUT_OF_SCOPE_RULES: OutOfScopeRule[] = [
  { pattern: /\bkey[\s-]?fobs?\b/i, reason: 'key fob' },
  { pattern: /\baccess\s+control\b/i, reason: 'access control system' },
  { pattern: /\bcard\s+reader\b/i, reason: 'access control system' },
  { pattern: /\bignition\b/i, reason: 'ignition' },
  { pattern: /\btoaster(\s+oven)?\b/i, reason: 'small appliance (toaster)' },
  { pattern: /\bair\s*fryer\b/i, reason: 'small appliance (air fryer)' },
  { pattern: /\bkettle\b/i, reason: 'small appliance (kettle)' },
  { pattern: /\bblender\b/i, reason: 'small appliance (blender)' },
  { pattern: /\bmicrowave\b/i, reason: 'small appliance (microwave)' },
];

/**
 * Conservative keyword check for work Yavamo does not do.
 * Returns { out: true, reason } only on an explicit out-of-scope phrase.
 */
export function isOutOfScope(text: string): { out: boolean; reason: string | null } {
  const t = text ?? '';
  for (const rule of OUT_OF_SCOPE_RULES) {
    if (rule.pattern.test(t)) return { out: true, reason: rule.reason };
  }
  return { out: false, reason: null };
}

const EXT_PATTERNS: RegExp[] = [
  /\bext(?:ension)?\.?\s*\d+/i, // ext 12, ext. 12, extension 45
  /(?:^|\s)x\s*\d+\s*$/i, // trailing " x204"
  /#\s*\d+\s*$/, // trailing "#123"
];

/** Detects phone-extension suffixes: x123, ext 123, ext. 123, extension 123, #123. */
export function hasExtension(phone: string): boolean {
  const p = (phone ?? '').trim();
  if (!p) return false;
  return EXT_PATTERNS.some(re => re.test(p));
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/**
 * True Mon–Fri 9:00–17:00 in the given IANA timezone (default America/Toronto).
 * Weekends are always after hours. Uses Intl so DST is handled by the runtime.
 */
export function isBusinessHours(d: Date = new Date(), timeZone = 'America/Toronto'): boolean {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(d);
  const hourRaw = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(d);
  const hour = Number(hourRaw) % 24; // some ICU builds emit "24" at midnight
  return WEEKDAYS.includes(weekday) && hour >= 9 && hour < 17;
}

/** Detail questions the inquiry template asks for, per service. 'generic' is the fallback. */
export const SERVICE_QUESTIONS: Record<string, string[]> = {
  doors: [
    'How many doors need work — repair or full replacement?',
    'Is it an entry door, interior door, or patio/sliding door?',
    'What is the approximate door size (e.g. 36" x 80")?',
    'Should the lock/handle be replaced at the same time?',
  ],
  security_film: [
    'How many panes need film, or what is the approximate total area in sq ft?',
    'Is this for a home or a business (storefront)?',
    'What is the main goal — break-in protection, UV reduction, or privacy?',
    'Is there any existing damage to the glass?',
  ],
  locksmith: [
    'How many locks are involved?',
    'What type of lock (deadbolt, knob, smart lock)?',
    'Is this urgent / are you locked out?',
    'Do all the locks need to work on one key?',
  ],
  skincare: [
    'What is the main skin concern or goal for the treatment?',
    'Have you had professional treatments before? Any allergies or sensitivities?',
    'What day/time generally works best for an appointment?',
  ],
  generic: [
    'Can you describe the work you need in a sentence or two?',
    'What is the address where the work would happen?',
    'Is there a deadline or preferred timing?',
  ],
};

function safeName(name: string): string {
  return (name ?? '').trim() || 'there';
}

function questionsFor(service: string): string[] {
  return SERVICE_QUESTIONS[(service ?? '').trim().toLowerCase()] ?? SERVICE_QUESTIONS.generic;
}

const SERVICE_AREA_LABEL: Record<string, string> = {
  doors: 'door',
  security_film: 'security film',
  locksmith: 'lock',
  skincare: 'treatment',
};

const URGENT_LINE = 'If this is urgent (lockout, broken window/door), please call us directly.';

/**
 * Polite inquiry template: thanks them, asks for photos of the issue/area plus
 * answers to the per-service questions. Plain text, warm, concise. Never invents pricing.
 */
export function buildInquiryDraft(opts: { name: string; service: string }): { subject: string; body: string } {
  const name = safeName(opts.name);
  const key = (opts.service || '').trim().toLowerCase();
  const area = SERVICE_AREA_LABEL[key] ?? 'service';
  const questions = questionsFor(opts.service);
  const lines = questions.map(q => `  - ${q}`).join('\n');
  return {
    subject: `Thanks for reaching out, ${name} — a few quick questions`,
    body:
      `Hi ${name},\n\n` +
      `Thanks for reaching out to Yavamo. To put together an accurate estimate, could you please send:\n\n` +
      `1. A few photos of the ${area} area (a close-up plus one showing the full area)\n` +
      `2. Answers to these quick questions:\n${lines}\n\n` +
      `Once we have those, our office will review everything and get back to you with next steps. ${URGENT_LINE}\n\n` +
      `— Yavamo`,
  };
}

/** After-hours hold message: office closed, 9 AM–5 PM Mon–Fri, reply in the morning. */
export function buildAfterHoursDraft(opts: { name: string }): { subject: string; body: string } {
  const name = safeName(opts.name);
  return {
    subject: `Thanks for reaching out — we'll respond in the morning`,
    body:
      `Hi ${name},\n\n` +
      `Thanks for reaching out to Yavamo. Our office is currently closed — our hours are 9 AM–5 PM, Monday to Friday (Toronto time).\n\n` +
      `We've received your message and will review it and respond in the morning. ${URGENT_LINE}\n\n` +
      `— Yavamo`,
  };
}

/**
 * Polite decline for out-of-scope work. States no one is available "at this time"
 * and never promises future availability.
 */
export function buildDeclineDraft(opts: { name: string; reason: string | null }): { subject: string; body: string } {
  const name = safeName(opts.name);
  const reason = (opts.reason ?? '').trim() || 'this type of request';
  return {
    subject: `Thanks for reaching out, ${name}`,
    body:
      `Hi ${name},\n\n` +
      `Thanks for reaching out to Yavamo. We don't have anyone available at this time for ${reason} — it's outside the services we offer.\n\n` +
      `Our services: doors, security film, locksmithing (rekey/lock change — no cars), and private skincare treatments.\n\n` +
      `Wishing you the best finding the right help.\n\n` +
      `— Yavamo`,
  };
}

interface ServiceSignal {
  service: AgentServiceKey;
  keyword: string;
  pattern: RegExp;
}

// Word-boundary patterns; each keyword counts once per message even if repeated.
// "window film" / "window tint" resolve to security_film (negative lookahead on
// the bare-window pattern is unnecessary now that windows is out of scope, but
// the film/tint signals are kept verbatim).
const SERVICE_SIGNAL_PATTERNS: ServiceSignal[] = [
  { service: 'locksmith', keyword: 'deadbolt', pattern: /\bdeadbolts?\b/i },
  { service: 'locksmith', keyword: 'rekey', pattern: /\brekey\w*/i },
  { service: 'locksmith', keyword: 'locked out', pattern: /\blocked\s*out\b/i },
  { service: 'locksmith', keyword: 'lock change', pattern: /\block\s*change\b/i },
  { service: 'locksmith', keyword: 'doorknob', pattern: /\bdoorknobs?\b/i },
  { service: 'locksmith', keyword: 'cylinder', pattern: /\bcylinders?\b/i },
  { service: 'locksmith', keyword: 'keyway', pattern: /\bkeyways?\b/i },
  { service: 'locksmith', keyword: 'lock', pattern: /\block\b/i },
  { service: 'doors', keyword: 'door', pattern: /\bdoors?\b/i },
  { service: 'doors', keyword: 'slab', pattern: /\bslabs?\b/i },
  { service: 'doors', keyword: 'pre-hung', pattern: /\bpre[-\s]?hung\b/i },
  { service: 'doors', keyword: 'hinge', pattern: /\bhinges?\b/i },
  { service: 'doors', keyword: 'jamb', pattern: /\bjamb\b/i },
  { service: 'security_film', keyword: 'security film', pattern: /\bsecurity\s+film\b/i },
  { service: 'security_film', keyword: 'window film', pattern: /\bwindow\s+film\b/i },
  { service: 'security_film', keyword: 'window tint', pattern: /\bwindow\s+tint\b/i },
  { service: 'security_film', keyword: 'film', pattern: /\bfilm\b/i },
  { service: 'security_film', keyword: 'tint', pattern: /\btints?\b/i },
  { service: 'security_film', keyword: 'shatter', pattern: /\bshatter\b/i },
  { service: 'skincare', keyword: 'skincare', pattern: /\bskincare\b/i },
  { service: 'skincare', keyword: 'med spa', pattern: /\bmed\s?spa\b/i },
  { service: 'skincare', keyword: 'facial', pattern: /\bfacials?\b/i },
  { service: 'skincare', keyword: 'skin', pattern: /\bskin\b/i },
  { service: 'skincare', keyword: 'treatment', pattern: /\btreatment\b/i },
];

/**
 * Keyword-based guess at which service a message is about.
 * Scores each service by distinct matched keywords; returns the strict winner.
 * Returns null when nothing matches, when scores tie (ambiguous), or when the
 * message is out of scope. Signals are the matched keywords for the winner.
 */
export function classifyAssist(text: string): { service: AgentServiceKey | null; signals: string[] } {
  const t = text ?? '';
  if (isOutOfScope(t).out) return { service: null, signals: [] };

  const matched = SERVICE_SIGNAL_PATTERNS.filter(s => s.pattern.test(t));
  const byService = new Map<AgentServiceKey, string[]>();
  for (const m of matched) {
    const list = byService.get(m.service) ?? [];
    if (!list.includes(m.keyword)) list.push(m.keyword);
    byService.set(m.service, list);
  }
  if (byService.size === 0) return { service: null, signals: [] };

  let best: AgentServiceKey | null = null;
  let bestCount = 0;
  let tied = false;
  for (const [service, keywords] of byService) {
    if (keywords.length > bestCount) {
      best = service;
      bestCount = keywords.length;
      tied = false;
    } else if (keywords.length === bestCount) {
      tied = true;
    }
  }
  if (best == null || tied) return { service: null, signals: [] };
  return { service: best, signals: byService.get(best) ?? [] };
}

/**
 * Tech mistake-guard: validates that a "job complete" tap is backed by real
 * field evidence (notes or photos recorded during the visit).
 * (Moved verbatim from app/lib/agents/mistake-guard.ts.)
 * Deterministic, no I/O.
 *
 * valid = true when at least one note or photo exists with at >= visitStartedAt
 * (or any note/photo at all when visitStartedAt is null).
 * Otherwise valid = false — the tap was likely accidental and the job must stay open.
 * Events with unparseable timestamps are ignored.
 */
export function assessCompletion(opts: {
  visitStartedAt: string | null;
  noteEvents: CompletionEvent[];
  photoFiles: CompletionEvent[];
}): { valid: boolean; reason: string } {
  const start = opts.visitStartedAt != null ? Date.parse(opts.visitStartedAt) : NaN;
  const hasStart = Number.isFinite(start);

  const relevant = [...opts.noteEvents, ...opts.photoFiles].filter(e => {
    const t = Date.parse(e.at);
    if (!Number.isFinite(t)) return false;
    return hasStart ? t >= (start as number) : true;
  });

  if (relevant.length > 0) {
    return {
      valid: true,
      reason: `Found ${relevant.length} note/photo record(s) recorded for this visit.`,
    };
  }
  return {
    valid: false,
    reason: 'No notes or photos recorded for this visit — likely an accidental tap.',
  };
}
