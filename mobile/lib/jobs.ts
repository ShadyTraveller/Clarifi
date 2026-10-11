import type { SupabaseClient } from '@supabase/supabase-js';
import { serviceKeys, type JobStatus, type Membership, type WorkJob } from './model';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const jobDisplayColumns = 'id,client_id,request,status,service,scheduled_start,scheduled_end,assigned_to,technician_id';

// Every destination, including a direct detail link, uses the same assignment filter.
export async function technicianFilter(db: SupabaseClient, member: Membership, signal: AbortSignal) {
  if (member.role !== 'technician') return null;
  if (!uuid.test(member.user_id)) throw new Error('Invalid staff identity.');
  const response = await db.from('technicians').select('id').eq('organization_id', member.organization_id)
    .eq('auth_user_id', member.user_id).eq('active', true).abortSignal(signal);
  if (response.error) throw new Error('Could not load technician assignments.');
  const ids = (response.data ?? []).map(row => String(row.id));
  if (ids.some(id => !uuid.test(id))) throw new Error('Invalid technician profile.');
  return ids.length ? `assigned_to.eq.${member.user_id},technician_id.in.(${ids.join(',')})` : `assigned_to.eq.${member.user_id}`;
}

export async function withClients(db: SupabaseClient, member: Membership, rows: Omit<WorkJob, 'clientName' | 'address'>[], signal: AbortSignal) {
  const ids = [...new Set(rows.map(row => row.client_id).filter(Boolean))];
  const response = ids.length ? await db.from('clients').select('id,name,address')
    .eq('organization_id', member.organization_id).in('id', ids).abortSignal(signal) : null;
  if (response?.error) throw new Error('Could not load client details. Try again.');
  const clients = new Map((response?.data ?? []).map(client => [client.id, client]));
  return rows.map(row => ({ ...row, clientName: clients.get(row.client_id)?.name ?? 'Client', address: clients.get(row.client_id)?.address ?? null }));
}

export const workPageSize = 25;
export async function fetchWork(db: SupabaseClient, member: Membership, signal: AbortSignal, options: {
  status?: JobStatus; start?: string; end?: string; id?: string; page?: number; search?: string;
}) {
  const filter = await technicianFilter(db, member, signal);
  const detailColumns = `${jobDisplayColumns},details` as const;
  const columns = options.id ? detailColumns : jobDisplayColumns;
  let query = db.from('jobs').select(columns, { count: 'exact' })
    .eq('organization_id', member.organization_id).in('service', serviceKeys);
  if (filter) query = query.or(filter);
  if (options.status) query = query.eq('status', options.status);
  if (options.start) query = query.gte('scheduled_start', options.start);
  if (options.end) query = query.lt('scheduled_start', options.end);
  if (options.id) query = query.eq('id', options.id);
  if (options.search) query = query.ilike('request', `%${options.search.replace(/[\\%_]/g, '\\$&')}%`);
  query = query.order('scheduled_start', { nullsFirst: false }).order('id');
  const page = options.page ?? 0;
  // Calendar also paginates rather than silently dropping appointments at the API row limit.
  const response = await query.range(page * workPageSize, (page + 1) * workPageSize - 1).abortSignal(signal)
    .overrideTypes<Omit<WorkJob, 'clientName' | 'address'>[], { merge: false }>();
  if (response.error) throw new Error('Could not load work. Check your connection and try again.');
  const jobs = await withClients(db, member, response.data ?? [], signal);
  return { jobs, total: response.count ?? jobs.length };
}
