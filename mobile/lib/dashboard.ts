import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceKeys, type DashboardData, type DashboardJob, type Membership } from './model';
import { torontoDayBounds } from './day';
import { jobDisplayColumns, technicianFilter, withClients } from './jobs';

export async function fetchDashboard(db: SupabaseClient, member: Membership, signal: AbortSignal): Promise<DashboardData> {
  const { start, end } = torontoDayBounds();
  const tech = member.role === 'technician';
  let query = db.from('jobs')
    .select(jobDisplayColumns)
    .eq('organization_id', member.organization_id).in('service', serviceKeys)
    .gte('scheduled_start', start).lt('scheduled_start', end).order('scheduled_start');
  const filter = await technicianFilter(db, member, signal);
  if (filter) query = query.or(filter);
  const [result, requests, alerts] = await Promise.all([
    query.abortSignal(signal),
    tech ? Promise.resolve(null) : db.from('jobs').select('id', { count: 'exact', head: true })
      .eq('organization_id', member.organization_id).in('service', serviceKeys).eq('status', 'lead')
      .is('assigned_to', null).is('technician_id', null).abortSignal(signal),
    tech ? Promise.resolve(null) : db.from('notifications').select('id', { count: 'exact', head: true })
      .eq('organization_id', member.organization_id).eq('read', false).abortSignal(signal),
  ]);
  if (result.error || requests?.error || alerts?.error) throw new Error('Could not refresh the workspace. Check your connection and try again.');
  const rows = result.data ?? [];
  const jobs = await withClients(db, member, rows as Omit<DashboardJob, 'clientName' | 'address'>[], signal);
  return {
    jobs: jobs as DashboardJob[],
    unassigned: requests?.count ?? null, alerts: alerts?.count ?? null, checkedAt: new Date(),
  };
}
