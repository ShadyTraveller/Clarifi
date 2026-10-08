import 'server-only';
import { sendEmail } from '../../../lib/email';
import { readBody } from '../../../lib/server';
import { serviceDb, cronDenied, OFFICE_EMAIL, stripHtml } from '../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Agents → POST /api/agents/notify
 * Auth: Authorization: Bearer <CRON_SECRET>.
 *
 * OFFICE NOTIFICATIONS ONLY — hard rule: `to` must be the office address
 * (ainearby@gmail.com, or OFFICE_NOTIFICATION_EMAIL when set). Anything else
 * is rejected with 403. This endpoint never sends to clients.
 *
 * Tries sendEmail; when Resend is unconfigured (sendEmail returns {ok:false})
 * the message is queued in the notifications table (emailed=false) for the
 * in-app queue. Never throws.
 */

export async function POST(request: Request) {
  try {
    const denied = cronDenied(request);
    if (denied) return denied;

    const body = await readBody(request, 500_000);
    const organization_id = String(body.organization_id || '');
    const to = String(body.to || '').trim().toLowerCase();
    const subject = String(body.subject || '').slice(0, 200);
    const html = String(body.html || '');
    const kind = String(body.kind || 'info').slice(0, 60);

    if (!organization_id) {
      return Response.json({ error: 'organization_id is required.' }, { status: 400 });
    }
    // HARD RULE: office inbox only. No client sends through this endpoint.
    if (to !== OFFICE_EMAIL) {
      return Response.json({ error: 'This endpoint only sends to the office inbox.' }, { status: 403 });
    }
    if (!subject || !html) {
      return Response.json({ error: 'subject and html are required.' }, { status: 400 });
    }

    const db = serviceDb();
    const result = await sendEmail({ to, subject, html });
    const emailed = result.ok === true;
    await db.from('notifications').insert({
      organization_id,
      kind,
      title: subject,
      body: stripHtml(html),
      email_to: to,
      emailed,
      read: false,
    });

    return Response.json(emailed ? { ok: true, sent: true } : { ok: true, queued: true });
  } catch (error) {
    return Response.json({ error: 'The notification could not be processed.' }, { status: 500 });
  }
}
