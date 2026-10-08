// Tech mistake-guard: validates that a "job complete" tap is backed by real field
// evidence (notes or photos recorded during the visit). Deterministic, no I/O.

export interface CompletionEvent {
  at: string;
}

/**
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
