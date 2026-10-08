// Warehouse tracking helpers: carrier detection, status normalization, and the
// office-notification decision. Deterministic heuristics only — detectCarrier
// returns 'unknown' rather than guessing. Server-safe: no React, no AI, no I/O.

export type CarrierKey =
  | 'canada-post'
  | 'purolator'
  | 'ups'
  | 'fedex'
  | 'amazon-logistics'
  | 'dragonfly'
  | 'unknown';

/**
 * Best-effort carrier detection from a tracking number. Spaces and dashes are
 * stripped before matching. Returns 'unknown' when unsure — never guesses.
 *
 * Patterns (checked in this order):
 * - ups: ^1Z + 16 alphanumerics (18 chars total)
 * - amazon-logistics: ^TBA + 9+ digits
 * - fedex: 12 digits starting 4/7/9 (FedEx Express), 15 digits (Ground), 20 digits
 * - canada-post: 16 digits, or UPU S10 format ending in CA (e.g. LX123456789CA)
 * - purolator: 3 letters + 9 digits (e.g. KYV009956937), or 12 digits starting 33
 *   (12-digit PINs starting 4/7/9 are FedEx; other 12-digit numbers are ambiguous
 *   and return 'unknown')
 * - dragonfly: BEST-EFFORT / UNVERIFIED — alphanumeric 10–14 chars starting with DF.
 *   The Canadian last-mile Dragonfly publishes no tracking-number spec; this is a
 *   guess kept only so the pipeline can label it, and should be revisited.
 */
export function detectCarrier(trackingNumber: string): CarrierKey {
  const t = (trackingNumber ?? '').replace(/[\s-]/g, '').toUpperCase();
  if (!t) return 'unknown';

  if (/^1Z[0-9A-Z]{16}$/.test(t)) return 'ups';
  if (/^TBA\d{9,}$/.test(t)) return 'amazon-logistics';
  if (/^[479]\d{11}$/.test(t)) return 'fedex';
  if (/^\d{15}$/.test(t)) return 'fedex';
  if (/^\d{20}$/.test(t)) return 'fedex';
  if (/^\d{16}$/.test(t)) return 'canada-post';
  if (/^[A-Z]{2}\d{9}CA$/.test(t)) return 'canada-post';
  if (/^[A-Z]{3}\d{9}$/.test(t)) return 'purolator';
  if (/^33\d{10}$/.test(t)) return 'purolator';
  // Best-effort, unverified: Dragonfly tracking format is not publicly documented.
  if (/^DF[A-Z0-9]{8,12}$/.test(t)) return 'dragonfly';

  return 'unknown';
}

export type TrackingStatus = 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'unknown';

const STATUS_PATTERNS: { status: TrackingStatus; pattern: RegExp }[] = [
  { status: 'out_for_delivery', pattern: /out for delivery|on vehicle for delivery|out on delivery/i },
  { status: 'delivered', pattern: /\bdelivered\b/i },
  {
    status: 'exception',
    pattern: /exception|delay|failed|unable to deliver|delivery attempt|attempted delivery|returned to sender|damaged|\blost\b|\bheld\b/i,
  },
  {
    status: 'in_transit',
    pattern: /in transit|on the way|\bdeparted\b|\barrived\b|picked up|\bshipped\b|processed|at .* (facility|depot|hub|sort|distribution)|information received|label created/i,
  },
];

/** Maps a carrier's raw status phrase to a canonical TrackingStatus. Unmapped -> 'unknown'. */
export function normalizeStatus(raw: string): TrackingStatus {
  const t = raw ?? '';
  for (const { status, pattern } of STATUS_PATTERNS) {
    if (pattern.test(t)) return status;
  }
  return 'unknown';
}

const NOTIFY_STATUSES: TrackingStatus[] = ['out_for_delivery', 'delivered', 'exception'];

/** Extracts the YYYY-MM-DD calendar date as written (no timezone conversion). */
function etaDate(s: string | null): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec((s ?? '').trim());
  return m ? m[1] : null;
}

/**
 * True when the office (ainearby@gmail.com) should be emailed about a tracking update:
 * - the status moved INTO out_for_delivery / delivered / exception (and actually changed), or
 * - the ETA calendar date changed materially (appeared, disappeared, or moved days).
 */
export function shouldNotifyOffice(
  prev: TrackingStatus | null,
  next: TrackingStatus,
  prevEta: string | null,
  nextEta: string | null,
): boolean {
  if (next !== prev && NOTIFY_STATUSES.includes(next)) return true;

  const a = etaDate(prevEta);
  const b = etaDate(nextEta);
  if (a !== b && (a !== null || b !== null)) return true;

  return false;
}
