import 'server-only';
export async function customerAction(token: string, action: 'read' | 'approve' | 'changes', fields = {}) {
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  if (!/^[0-9a-f]{64}$/.test(token)) return Response.json({ error: 'Link unavailable or expired.' }, { status: 400, headers });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return Response.json({ error: 'Estimate service is not configured.' }, { status: 503, headers });
  try {
    const result = await fetch(`${url}/functions/v1/clarifi-customer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, action, ...fields }), cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const data = await result.json();
    if (!result.ok) return Response.json({ error: data.error || 'Link unavailable or expired.' }, { status: result.status, headers });
    // This Edge Function returns an allowlisted customer projection, never supplier costs.
    return Response.json({ ...data, valid: true, ok: true }, { headers });
  } catch { return Response.json({ error: 'Estimate service unavailable. Try again shortly.' }, { status: 503, headers }); }
}
