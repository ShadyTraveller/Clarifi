import 'server-only';
import { readBody } from '../../../lib/server';
import { serviceDb, cronDenied, OFFICE_EMAIL } from '../lib';
import { assessCompletion, type CompletionEvent } from '../agent-libs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Receptionist agent → POST /api/agents/job-complete
 * Auth: Authorization: Bearer <CRON_SECRET>.
 *
 * Tech-marks-complete mistake-guard sweep:
 * - job.status != 'completed' → noop (nothing to guard).
 * - completion invalid (no notes/photos recorded for the visit) → revert the
 *   job to active, stamp completion_reverted_at, log a job_events row, and
 *   hand the caller an office-only notify payload (the caller emails the office).
 * - valid → report whether the notes mention an assessment, so the caller can
 *   trigger /api/agents/estimate-draft.
 *
 * Never sends email itself; never contacts the client.
 */

/** Extract free text from a job_events row's metadata (notes live here). */
function eventText(metadata: unknown): string {
  if (typeof metadata === 'string') return metadata;
  if (metadata && typeof metadata === 'object') {
    const m = metadata as Record<string, unknown>;
    for (const key of ['note', 'body', 'text', 'message', 'description', 'details']) {
      if (typeof m[key] === 'string' && (m[key] as string).trim()) return m[key] as string;
    }
    try {
      const s = JSON.stringify(m);
      return s === '{}' ? '' : s;
    } catch {
      return '';
    }
  }
  return '';
}

export async function POST(request: Request) {
  try {
    const denied = cronDenied(request);
    if (denied) return denied;

    const body = await readBody(request, 200_000);
    const organization_id = String(body.organization_id || '');
    const job_id = String(body.job_id || '');
    if (!organization_id || !job_id) {
      return Response.json({ error: 'organization_id and job_id are required.' }, { status: 400 });
    }

    const db = serviceDb();
    const { data: job, error: jobError } = await db
      .from('jobs')
      .select('id, organization_id, status, visit_started_at, request')
      .eq('id', job_id)
      .eq('organization_id', organization_id)
      .maybeSingle();
    if (jobError || !job) {
      return Response.json({ error: 'Job not found.' }, { status: 404 });
    }
    if (job.status !== 'completed') {
      return Response.json({ ok: true, noop: true });
    }

    // Idempotency: a completed job the guard already cleared must not be
    // re-reported (avoids duplicate estimate-draft triggers on re-sweeps).
    const { data: guardRow } = await db
      .from('job_events')
      .select('id')
      .eq('organization_id', organization_id)
      .eq('job_id', job.id)
      .eq('event_type', 'completion_guarded')
      .limit(1)
      .maybeSingle();
    if (guardRow) {
      return Response.json({ ok: true, already_guarded: true });
    }

    const [{ data: events }, { data: files }] = await Promise.all([
      db
        .from('job_events')
        .select('event_type, metadata, created_at')
        .eq('organization_id', organization_id)
        .eq('job_id', job.id)
        .order('created_at', { ascending: true })
        .limit(200),
      db
        .from('job_files')
        .select('file_name, mime_type, created_at')
        .eq('organization_id', organization_id)
        .eq('job_id', job.id)
        .limit(200),
    ]);

    const texts: string[] = [];
    const noteEvents: CompletionEvent[] = [];
    for (const e of events || []) {
      const text = eventText(e.metadata);
      if (text.trim()) texts.push(text);
      noteEvents.push({ at: String(e.created_at || '') });
    }
    const photoFiles: CompletionEvent[] = (files || [])
      .filter((f) => String(f.mime_type || '').startsWith('image/'))
      .map((f) => ({ at: String(f.created_at || '') }));

    const { valid, reason } = assessCompletion({
      visitStartedAt: job.visit_started_at ?? null,
      noteEvents,
      photoFiles,
    });

    if (!valid) {
      const now = new Date().toISOString();
      await db
        .from('jobs')
        .update({ status: 'active', completed_at: null, completion_reverted_at: now })
        .eq('id', job.id);
      await db.from('job_events').insert({
        organization_id,
        job_id: job.id,
        event_type: 'completion_reverted',
        metadata: { reason, reverted_at: now, by: 'mistake-guard' },
      });
      const shortRef = String(job.id).slice(0, 8);
      const subject = `[Yavamo] Completion reverted — ${job.request || 'job'} (${shortRef})`;
      const notifyBody =
        `A completion on job "${job.request || job.id}" was reverted to active by the mistake-guard.\n\n` +
        `Reason: ${reason}\n\n` +
        `The job needs office review before it is marked complete again.`;
      return Response.json({
        ok: true,
        reverted: true,
        reasons: [reason],
        notify: { to: OFFICE_EMAIL, subject, body: notifyBody },
      });
    }

    const notesText = texts.join('\n').toLowerCase();
    const hasAssessment = /assess|part|material|diagnos|replac|repair/.test(notesText);
    await db.from('job_events').insert({
      organization_id,
      job_id: job.id,
      event_type: 'completion_guarded',
      metadata: { by: 'mistake-guard', has_assessment: hasAssessment },
    });
    return Response.json({ ok: true, reverted: false, hasAssessment });
  } catch (error) {
    return Response.json({ error: 'The completion check could not run.' }, { status: 500 });
  }
}
