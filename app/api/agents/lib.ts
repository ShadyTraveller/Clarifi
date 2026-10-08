import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Shared plumbing for the /api/agents/* cron-agent routes.
 * - Auth is a shared CRON_SECRET compared in constant time (mirrors the
 *   x-webhook-secret style of app/api/intake/google-form/route.ts).
 * - DB access uses the service key (service role bypasses RLS), same as the
 *   intake webhook. Never the user's session: these routes are called by
 *   scheduled agents, not signed-in staff.
 */

/** Office inbox for every internal agent alert. Set OFFICE_NOTIFICATION_EMAIL to override. */
export const OFFICE_EMAIL = (process.env.OFFICE_NOTIFICATION_EMAIL || 'ainearby@gmail.com').trim().toLowerCase();

function secretsMatch(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function serviceDb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Returns a 401/503 Response when the cron secret is wrong or unset, else null. */
export function cronDenied(request: Request): Response | null {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) {
    return Response.json({ error: 'Agent API is not configured.' }, { status: 503 });
  }
  const header = request.headers.get('authorization') || '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!secretsMatch(provided, expected)) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  return null;
}

/** Strip HTML to plain text for the in-app notification queue. */
export function stripHtml(html: string): string {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}
