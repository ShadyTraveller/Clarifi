import 'server-only';
import { serviceDb, cronDenied } from '../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Receptionist agent → GET /api/agents/jobs
 * Auth: Authorization: Bearer <CRON_SECRET>.
 *
 * Lists jobs for the worker sweeps (completion mistake-guard).
 *
 * Query params:
 * - organization_id (required)
 * - status (optional): lead | estimate | active | completed | ...
 * - completed_since (optional): ISO timestamp — returns completed jobs where
 *   COALESCE(completed_at, updated_at) >= completed_since.
 * - limit (optional, default 50, max 200)
 *
 * Read-only. Never sends anything.
 */
export async function GET(request: Request) {
  try {
    const denied = cronDenied(request);
    if (denied) return denied;

    const url = new URL(request.url);
    const organization_id = url.searchParams.get('organization_id') || '';
    if (!organization_id) {
      return Response.json({ error: 'organization_id is required.' }, { status: 400 });
    }
    const status = url.searchParams.get('status');
    const completed_since = url.searchParams.get('completed_since');
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 200);

    const db = serviceDb();
    let q = db
      .from('jobs')
      .select('id, request, status, service, completed_at, updated_at')
      .eq('organization_id', organization_id)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;

    let jobs = data || [];
    if (completed_since) {
      const since = Date.parse(completed_since);
      if (!Number.isNaN(since)) {
        jobs = jobs.filter((j) => {
          const t = Date.parse(String((j as { completed_at?: string }).completed_at || (j as { updated_at?: string }).updated_at || ''));
          return !Number.isNaN(t) && t >= since;
        });
      }
    }

    return Response.json({ ok: true, count: jobs.length, jobs });
  } catch (error) {
    return Response.json({ error: 'Jobs could not be listed.' }, { status: 500 });
  }
}

/**
 * Receptionist/office → DELETE /api/agents/jobs?organization_id=...&job_id=...
 * Auth: Authorization: Bearer <CRON_SECRET>.
 *
 * Removes a junk/test job and its draft estimates. Safety rules:
 * - 404 if the job does not belong to the organization.
 * - 409 if the job has any invoices (never delete billed work).
 * - 409 if the job status is 'completed' (history must be preserved).
 * - Cascades: quote_line_items → quote_versions → quotes → job_events → job.
 * - Does NOT delete the client (use the client delete when it exists).
 *
 * Never sends anything. Returns { ok, deleted: { quotes, versions, items, events } }.
 */
export async function DELETE(request: Request) {
  try {
    const denied = cronDenied(request);
    if (denied) return denied;

    const url = new URL(request.url);
    const organization_id = url.searchParams.get('organization_id') || '';
    const job_id = url.searchParams.get('job_id') || '';
    if (!organization_id || !job_id) {
      return Response.json({ error: 'organization_id and job_id are required.' }, { status: 400 });
    }

    const db = serviceDb();
    const { data: job, error: jobError } = await db
      .from('jobs')
      .select('id, status')
      .eq('id', job_id)
      .eq('organization_id', organization_id)
      .maybeSingle();
    if (jobError || !job) {
      return Response.json({ error: 'Job not found.' }, { status: 404 });
    }
    if (job.status === 'completed') {
      return Response.json({ error: 'Completed jobs cannot be deleted (history).' }, { status: 409 });
    }

    const { count: invoiceCount } = await db
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organization_id)
      .eq('job_id', job.id);
    if ((invoiceCount || 0) > 0) {
      return Response.json({ error: 'Jobs with invoices cannot be deleted.' }, { status: 409 });
    }

    const { data: quotes } = await db
      .from('quotes')
      .select('id')
      .eq('organization_id', organization_id)
      .eq('job_id', job.id);
    const quoteIds = (quotes || []).map(q => q.id as string);

    let versions = 0;
    let items = 0;
    if (quoteIds.length > 0) {
      const { data: vers } = await db
        .from('quote_versions')
        .select('id')
        .in('quote_id', quoteIds);
      const versionIds = (vers || []).map(v => v.id as string);
      versions = versionIds.length;
      if (versionIds.length > 0) {
        const { count } = await db
          .from('quote_line_items')
          .delete({ count: 'exact' })
          .in('quote_version_id', versionIds);
        items = count || 0;
        await db.from('quote_versions').delete().in('id', versionIds);
      }
      await db.from('quotes').delete().in('id', quoteIds);
    }

    const { count: events } = await db
      .from('job_events')
      .delete({ count: 'exact' })
      .eq('organization_id', organization_id)
      .eq('job_id', job.id);

    await db.from('jobs').delete().eq('id', job.id);

    return Response.json({
      ok: true,
      deleted: {
        quotes: quoteIds.length,
        versions,
        items,
        events: events || 0,
      },
    });
  } catch (error) {
    return Response.json({ error: 'The job could not be deleted.' }, { status: 500 });
  }
}
