import 'server-only';
import { readBody } from '../../../lib/server';
import { serviceDb, cronDenied } from '../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Receptionist agent → /api/agents/email-intake
 * Auth: Authorization: Bearer <CRON_SECRET>.
 *
 * Idempotency for the Gmail inbox sweep (receptionist runbook Step 3):
 * - GET  ?organization_id=…&gmail_message_id=… → { logged: true|false }
 *   (the agent skips any message id already logged).
 * - POST { organization_id, gmail_message_id, gmail_thread_id?, from_addr?,
 *   subject?, classification, action_taken, job_id?, draft_id? } →
 *   { ok:true } (unique constraint makes double-logging a no-op).
 *
 * Writes to email_intake_log only; never contacts anyone.
 */

export async function GET(request: Request) {
  try {
    const denied = cronDenied(request);
    if (denied) return denied;

    const url = new URL(request.url);
    const organization_id = url.searchParams.get('organization_id') || '';
    const gmail_message_id = url.searchParams.get('gmail_message_id') || '';
    if (!organization_id || !gmail_message_id) {
      return Response.json({ error: 'organization_id and gmail_message_id are required.' }, { status: 400 });
    }

    const db = serviceDb();
    const { data, error } = await db
      .from('email_intake_log')
      .select('id, classification, action_taken, job_id, processed_at')
      .eq('organization_id', organization_id)
      .eq('gmail_message_id', gmail_message_id)
      .maybeSingle();
    if (error) throw error;
    return Response.json({ logged: !!data, entry: data || null });
  } catch (error) {
    return Response.json({ error: 'The intake-log check could not run.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = cronDenied(request);
    if (denied) return denied;

    const body = await readBody(request, 200_000);
    const organization_id = String(body.organization_id || '');
    const gmail_message_id = String(body.gmail_message_id || '');
    const classification = String(body.classification || '');
    const action_taken = String(body.action_taken || '');
    if (!organization_id || !gmail_message_id || !classification || !action_taken) {
      return Response.json(
        { error: 'organization_id, gmail_message_id, classification and action_taken are required.' },
        { status: 400 },
      );
    }

    const db = serviceDb();
    const row = {
      organization_id,
      gmail_message_id,
      gmail_thread_id: body.gmail_thread_id ? String(body.gmail_thread_id) : null,
      from_addr: body.from_addr ? String(body.from_addr).slice(0, 320) : null,
      subject: body.subject ? String(body.subject).slice(0, 320) : null,
      classification: classification.slice(0, 60),
      action_taken: action_taken.slice(0, 120),
      job_id: body.job_id ? String(body.job_id) : null,
      draft_id: body.draft_id ? String(body.draft_id).slice(0, 120) : null,
    };
    const { error } = await db.from('email_intake_log').insert(row);
    if (error && !error.message.includes('duplicate')) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: 'The intake-log entry could not be saved.' }, { status: 500 });
  }
}
