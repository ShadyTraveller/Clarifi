import 'server-only';
import { serviceDb, cronDenied } from '../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Agents → GET /api/agents/org
 * Auth: Authorization: Bearer <CRON_SECRET>.
 *
 * Returns the organizations visible to the service key so cron workers can
 * resolve an organization_id for routes that require one (email-intake,
 * notify, job-complete, approval-sweep, track). Read-only; never contacts
 * anyone. Single-org deployments can take organizations[0].id.
 */

export async function GET(request: Request) {
  try {
    const denied = cronDenied(request);
    if (denied) return denied;

    const db = serviceDb();
    const { data, error } = await db
      .from('organizations')
      .select('id, name')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return Response.json({ organizations: data || [] });
  } catch (error) {
    return Response.json({ error: 'The organization lookup could not run.' }, { status: 500 });
  }
}
