import 'server-only';
import OpenAI from 'openai';
import { serviceDb, cronDenied } from '../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Diagnostics → POST /api/agents/debug-openai
 * Auth: Authorization: Bearer <CRON_SECRET>.
 *
 * Answers three questions for the estimate-auto part-matching failure:
 *  1. Is OPENAI_API_KEY present in the runtime? (boolean + length only)
 *  2. How many active locksmith materials does the filtered query return?
 *  3. Does a minimal gpt-4o-mini call succeed, and if not, what is the error?
 *
 * Never exposes key material. Temporary diagnostic route.
 */
export async function POST(request: Request) {
  try {
    const denied = cronDenied(request);
    if (denied) return denied;

    let organization_id = '';
    try {
      const body = await request.json();
      organization_id = String(body.organization_id || '');
    } catch {
      organization_id = '';
    }

    const db = serviceDb();
    const apiKey = process.env.OPENAI_API_KEY || '';
    const out: Record<string, unknown> = {
      has_openai_key: !!apiKey,
      key_length: apiKey.length,
    };

    if (organization_id) {
      const { count, error } = await db
        .from('supplier_materials')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organization_id)
        .eq('service', 'locksmith')
        .eq('is_active', true);
      out.materials_locksmith = error ? 'query error: ' + error.message : count;
    } else {
      out.materials_locksmith = 'skipped (no organization_id)';
    }

    if (apiKey) {
      try {
        const ai = new OpenAI({ apiKey, timeout: 15000, maxRetries: 0 });
        const c = await ai.chat.completions.create({
          model: 'gpt-4o-mini',
          max_tokens: 20,
          messages: [{ role: 'user', content: 'Reply with exactly: {"ok": true}' }],
        });
        out.openai_test = c.choices?.[0]?.message?.content ?? '(empty response)';
      } catch (e) {
        out.openai_test = 'ERROR: ' + (e instanceof Error ? e.message : String(e)).slice(0, 300);
      }
    } else {
      out.openai_test = 'skipped (no key)';
    }

    return Response.json({ ok: true, ...out });
  } catch {
    return Response.json({ error: 'debug failed' }, { status: 500 });
  }
}
