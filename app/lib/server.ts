import 'server-only';
import { createClient } from '@supabase/supabase-js';
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function staffClient(request: Request) {
  const bearer = request.headers.get('authorization');
  if (!bearer?.startsWith('Bearer ')) throw new HttpError(401, 'Sign in to continue.');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new HttpError(503, 'Workspace connection is not configured.');
  const db = createClient(url, key, { global: { headers: { Authorization: bearer } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.getUser(bearer.slice(7));
  if (error || !data.user) throw new HttpError(401, 'Your session has expired. Sign in again.');
  const { data: member } = await db.from('organization_members').select('organization_id,role,active').eq('user_id', data.user.id).eq('active', true).limit(1).single();
  if (!member) throw new HttpError(403, 'No active workspace membership.');
  return { db, member, user: data.user };
}
export function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof HttpError ? error.message : 'Unable to complete this action. Please try again.' }, { status: error instanceof HttpError ? error.status : 500 });
}
export async function readBody(request: Request, limit = 7_000_000) {
  if (Number(request.headers.get('content-length')) > limit) throw new HttpError(413, 'This upload is too large.');
  const text = await request.text();
  if (text.length > limit) throw new HttpError(413, 'This upload is too large.');
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'Invalid request.'); }
}
