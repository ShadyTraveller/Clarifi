import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { mapFormResponses, type FormAttachment } from '../../../lib/google-form';
import { readBody } from '../../../lib/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Google Form self-intake webhook.
 *
 * POST: accepts { responses: {questionTitle: answer}, attachments?: [{name, mimeType, dataBase64}],
 *         secret?: string, organization_id?: string } and creates a Lead.
 *         Auth is a shared secret (GOOGLE_FORM_WEBHOOK_SECRET) sent as the
 *         `x-webhook-secret` header or `secret` body field by the Apps Script.
 * GET:  returns { ok, configured } so the office UI can show the webhook status.
 */

// Roles known-safe for the clients.relationship enum (see migration 202609280001).
// 'institution' is attempted via RPC first; the direct-insert fallback downgrades
// to 'other' and preserves the original label in the notes.
const ENUM_SAFE_ROLES = new Set(['tenant', 'landlord', 'property_management', 'commercial', 'other']);

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024; // decoded bytes per photo
const BODY_LIMIT = 30_000_000;

// Light in-memory rate limit: 30 submits per IP per minute.
const recent = new Map<string, number[]>();

function serviceDb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function secretsMatch(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const calls = (recent.get(ip) || []).filter((n) => n > now - 60000);
  if (calls.length >= 30) return false;
  recent.set(ip, [...calls, now]);
  return true;
}

function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    (request as unknown as { ip?: string }).ip ||
    'unknown'
  );
}

function sanitizeFileName(name: string): string {
  const base = String(name || 'photo').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120) || 'photo';
  return base;
}

export async function GET() {
  const configured = !!(process.env.GOOGLE_FORM_WEBHOOK_SECRET && process.env.SUPABASE_SECRET_KEY);
  return Response.json({ ok: true, configured });
}

export async function POST(request: Request) {
  try {
    if (!checkRateLimit(clientIp(request))) {
      return Response.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 });
    }

    const expected = process.env.GOOGLE_FORM_WEBHOOK_SECRET || '';
    if (!expected) {
      return Response.json(
        { error: 'Intake webhook is not configured. Set GOOGLE_FORM_WEBHOOK_SECRET.' },
        { status: 503 },
      );
    }

    const body = await readBody(request, BODY_LIMIT);
    const provided = String(request.headers.get('x-webhook-secret') || body.secret || '');
    if (!secretsMatch(provided, expected)) {
      return Response.json({ error: 'Invalid webhook secret.' }, { status: 401 });
    }

    // Accept { responses: {...} } or a flat { title: answer } payload.
    const pairs =
      body.responses && typeof body.responses === 'object' ? body.responses : (
        Object.fromEntries(
          Object.entries(body).filter(([k]) => !['secret', 'organization_id', 'attachments'].includes(k)),
        )
      );
    const attachments: FormAttachment[] = Array.isArray(body.attachments) ? body.attachments : [];
    const mapped = mapFormResponses(pairs, Math.min(attachments.length, MAX_ATTACHMENTS));

    const db = serviceDb();

    // Resolve the workspace: explicit override wins, else the first organization.
    let orgId: string | null = typeof body.organization_id === 'string' ? body.organization_id : null;
    if (!orgId) {
      const { data: org } = await db.from('organizations').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle();
      orgId = org?.id ?? null;
    }
    if (!orgId) {
      return Response.json({ error: 'No workspace found for this intake.' }, { status: 503 });
    }

    const clientInfo = {
      name: mapped.name || 'Website intake',
      role: mapped.role,
      email: mapped.email || null,
      phone: mapped.phone || null,
      address: mapped.address || null,
    };
    const jobInfo = {
      title: mapped.title,
      details: mapped.details,
      service: null as string | null,
      markdown: mapped.markdown,
      technician_id: null,
      latitude: null,
      longitude: null,
    };

    // Primary path: the same RPC the app's own intake uses.
    let jobId: string | null = null;
    let via: 'rpc' | 'direct' = 'rpc';
    try {
      const { data, error } = await db.rpc('create_clarifi_request', {
        target_org: orgId,
        client_info: clientInfo,
        job_info: jobInfo,
      });
      if (error) throw error;
      jobId = data as string;
    } catch {
      // Fallback: direct insert (e.g. the role enum doesn't know 'institution' yet).
      // Never fail the lead because of the role — downgrade and preserve the label.
      via = 'direct';
      const safeRole = ENUM_SAFE_ROLES.has(mapped.role) ? mapped.role : 'other';
      const downgradeNote =
        safeRole === mapped.role ? '' : `Client type from form: ${mapped.roleRaw || mapped.role} (recorded as ${safeRole}).\n`;
      const { data: client, error: clientError } = await db
        .from('clients')
        .insert({
          organization_id: orgId,
          name: clientInfo.name,
          email: clientInfo.email,
          phone: clientInfo.phone,
          address: clientInfo.address,
          relationship: safeRole,
        })
        .select('id')
        .single();
      if (clientError) throw clientError;
      const { data: job, error: jobError } = await db
        .from('jobs')
        .insert({
          organization_id: orgId,
          client_id: client.id,
          request: mapped.title,
          details: downgradeNote + mapped.details,
          status: 'lead',
          service: null,
        })
        .select('id')
        .single();
      if (jobError) throw jobError;
      jobId = job.id;
    }

    if (!jobId) {
      return Response.json({ error: 'The lead could not be created. Try again shortly.' }, { status: 502 });
    }

    // Attach photos to the lead's files thread. Individual failures never fail the lead.
    let photosAttached = 0;
    let photosFailed = 0;
    for (const att of attachments.slice(0, MAX_ATTACHMENTS)) {
      try {
        const mimeType = String(att.mimeType || '');
        if (!mimeType.startsWith('image/')) throw new Error('not an image');
        const buffer = Buffer.from(String(att.dataBase64 || ''), 'base64');
        if (!buffer.length || buffer.length > MAX_ATTACHMENT_BYTES) throw new Error('bad size');
        const path = `${jobId}/${crypto.randomUUID()}-${sanitizeFileName(att.name)}`;
        const { error: upError } = await db.storage.from('job-files').upload(path, buffer, { contentType: mimeType });
        if (upError) throw upError;
        const { error: rowError } = await db.from('job_files').insert({
          organization_id: orgId,
          job_id: jobId,
          storage_path: path,
          file_name: sanitizeFileName(att.name),
          mime_type: mimeType,
        });
        if (rowError) throw rowError;
        photosAttached++;
      } catch {
        photosFailed++;
      }
    }

    return Response.json({ ok: true, job_id: jobId, via, photos_attached: photosAttached, photos_failed: photosFailed });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_CONFIGURED') {
      return Response.json({ error: 'Intake webhook is not configured.' }, { status: 503 });
    }
    return Response.json({ error: 'The lead could not be created. Try again shortly.' }, { status: 502 });
  }
}
