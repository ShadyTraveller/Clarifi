import 'server-only';
import { readBody } from '../../../lib/server';
import { serviceDb, cronDenied } from '../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Receptionist agent → POST /api/agents/requests
 * Auth: Authorization: Bearer <CRON_SECRET>.
 *
 * Creates a structured Request: find-or-create the client, then insert a
 * `jobs` row with status='lead'. Used by the receptionist cron worker, which
 * runs without a user session (service role bypasses RLS).
 *
 * Body: { organization_id, service, full_name?, role?, phone?, email?,
 *   address?, unit_number?, gate_code?, coi_request?, request_title?,
 *   details?, two_jobs? }
 * - service must be one of: doors | security-film | locksmith | skincare.
 * - role: tenant | landlord | owner | property_management | institution |
 *   commercial | other (stored in notes; tenant/landlord flips the
 *   assessment flag to collect_before_visit).
 * - two_jobs=true → assessment_fee_cents = 13800 (2×$69), else 6900.
 *
 * Never sends anything to clients. Returns { ok, client_id, job_id }.
 */

const SERVICE_KEYS = ['doors', 'security-film', 'locksmith', 'skincare'] as const;

function normalizeService(raw: unknown): string | null {
  const s = String(raw || '').trim().toLowerCase().replace(/_/g, '-');
  return (SERVICE_KEYS as readonly string[]).includes(s) ? s : null;
}

function clean(v: unknown, max = 500): string | null {
  const s = String(v || '').trim();
  return s ? s.slice(0, max) : null;
}

export async function POST(request: Request) {
  try {
    const denied = cronDenied(request);
    if (denied) return denied;

    const body = await readBody(request, 200_000);
    const organization_id = String(body.organization_id || '');
    const detailsRaw = clean(body.details, 8000);
    if (!organization_id) {
      return Response.json({ error: 'organization_id is required.' }, { status: 400 });
    }
    const service = normalizeService(body.service);
    if (!service) {
      return Response.json({ error: 'Unsupported service.' }, { status: 400 });
    }

    const full_name = clean(body.full_name, 200);
    const role = String(body.role || 'other').trim().toLowerCase().slice(0, 40) || 'other';
    const phone = clean(body.phone, 60);
    const email = clean(body.email, 320);
    const address = clean(body.address, 500);
    const unit_number = clean(body.unit_number, 60);
    const gate_code = clean(body.gate_code, 60);
    const coi_request = clean(body.coi_request, 500);
    const two_jobs = body.two_jobs === true;

    if (!full_name && !phone && !email && !detailsRaw) {
      return Response.json({ error: 'At least a name, phone, email or details is required.' }, { status: 400 });
    }

    const db = serviceDb();

    // Find-or-create client: prefer email match, fall back to phone.
    let client_id: string | null = null;
    if (email) {
      const { data } = await db
        .from('clients')
        .select('id')
        .eq('organization_id', organization_id)
        .eq('email', email)
        .maybeSingle();
      client_id = data?.id || null;
    }
    if (!client_id && phone) {
      const { data } = await db
        .from('clients')
        .select('id')
        .eq('organization_id', organization_id)
        .eq('phone', phone)
        .maybeSingle();
      client_id = data?.id || null;
    }
    const clientNotes = [
      role && role !== 'other' ? `role: ${role}` : null,
      unit_number ? `unit: ${unit_number}` : null,
      gate_code ? `gate code: ${gate_code}` : null,
      coi_request ? `COI request: ${coi_request}` : null,
      phone && /ext/i.test(phone) ? 'extension present — ask for direct line' : null,
    ]
      .filter(Boolean)
      .join('\n');
    if (!client_id) {
      const { data, error } = await db
        .from('clients')
        .insert({
          organization_id,
          name: full_name || 'Unknown',
          email,
          phone,
          address,
          notes: clientNotes || null,
        })
        .select('id')
        .single();
      if (error) throw error;
      client_id = data.id;
    }

    const detailLines = [
      full_name ? `Name: ${full_name}` : null,
      `Role: ${role}`,
      phone ? `Phone: ${phone}` : null,
      email ? `Email: ${email}` : null,
      address ? `Address: ${address}` : null,
      unit_number ? `Unit: ${unit_number}` : null,
      gate_code ? `Gate code: ${gate_code}` : null,
      coi_request ? `COI request: ${coi_request}` : null,
      detailsRaw ? `\n${detailsRaw}` : null,
      '\nSource: Gmail (ainearby@gmail.com)',
    ].filter(Boolean) as string[];

    const request_title =
      clean(body.request_title, 200) ||
      `Request: ${service} — ${full_name || 'new client'}`.slice(0, 200);

    const assessment_fee_cents = two_jobs ? 13800 : 6900;
    const assessment_fee_status = role === 'tenant' || role === 'landlord' ? 'collect_before_visit' : 'pending';

    const { data: job, error: jobError } = await db
      .from('jobs')
      .insert({
        organization_id,
        client_id,
        request: request_title,
        details: detailLines.join('\n'),
        status: 'lead',
        service,
        assessment_fee_cents,
        assessment_fee_status,
      })
      .select('id')
      .single();
    if (jobError) throw jobError;

    return Response.json({
      ok: true,
      client_id,
      job_id: job.id,
      assessment_fee_cents,
      assessment_fee_status,
    });
  } catch (error) {
    return Response.json({ error: 'The request could not be created.' }, { status: 500 });
  }
}
