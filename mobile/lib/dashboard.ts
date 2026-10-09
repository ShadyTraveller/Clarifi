import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceKeys, type DashboardData, type DashboardJob, type Membership } from './model';
import { torontoDayBounds } from './day';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function fetchDashboard(db: SupabaseClient, member: Membership, signal: AbortSignal): Promise<DashboardData> {
  const { start, end } = torontoDayBounds();
  const tech = member.role === 'technician';
  let query = db.from('jobs')
    .select('id,client_id,request,status,service,scheduled_start,scheduled_end,assigned_to,technician_id')
    .eq('organization_id', member.organization_id).in('service', serviceKeys)
    .gte('scheduled_start', start).lt('scheduled_start', end).order('scheduled_start');
  if (tech) {
    if (!uuid.test(member.user_id)) throw new Error('Invalid staff identity.');
    const profile = await db.from('technicians').select('id').eq('organization_id', member.organization_id)
      .eq('auth_user_id', member.user_id).eq('active', true).abortSignal(signal);
    if (profile.error) throw new Error('Could not load technician assignments.');
    const ids = (profile.data ?? []).map(row => String(row.id));
    if (ids.some(id => !uuid.test(id))) throw new Error('Invalid technician profile.');
    query = ids.length ? query.or(`assigned_to.eq.${member.user_id},technician_id.in.(${ids.join(',')})`) : query.eq('assigned_to', member.user_id);
  }
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
  const clientIds = [...new Set(rows.map(row => String(row.client_id)))];
  const clients = clientIds.length ? await db.from('clients').select('id,name,address')
    .eq('organization_id', member.organization_id).in('id', clientIds).abortSignal(signal) : null;
  if (clients?.error) throw new Error('Could not load client details. Try again.');
  const clientMap = new Map((clients?.data ?? []).map(client => [client.id, client]));
  return {
    jobs: rows.map(row => ({ ...row, clientName: clientMap.get(row.client_id)?.name ?? 'Client', address: clientMap.get(row.client_id)?.address ?? null })) as DashboardJob[],
    unassigned: requests?.count ?? null, alerts: alerts?.count ?? null, checkedAt: new Date(),
  };
}
