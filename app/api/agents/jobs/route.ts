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
