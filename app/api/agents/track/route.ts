import 'server-only';
import { readBody } from '../../../lib/server';
import { serviceDb, cronDenied, OFFICE_EMAIL } from '../lib';
import {
  detectCarrier,
  normalizeStatus,
  shouldNotifyOffice,
  type CarrierKey,
  type TrackingStatus,
} from '../agent-libs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Warehouse agent → POST /api/agents/track
 * Auth: Authorization: Bearer <CRON_SECRET>.
 *
 * Actions (see docs/agents/warehouse-runbook.md):
 * - { action:'due', organization_id } → list part_tracking rows not yet delivered.
 * - { tracking_id | part_tracking_id } → best-effort carrier check for one row;
 *   updates last_checked_at (+ status when a real signal was found) and
 *   returns a notify payload for the office when shouldNotifyOffice fires.
 * - { action:'update', part_tracking_id, status?, eta?, carrier? } → manual
 *   status set after the office visually verified a carrier page (runbook Step 4).
 *
 * Carrier status pages are bot-walled; a check that finds nothing degrades to
 * 'unknown' with last_event='Check manually' — the route never invents a status.
 * It never places orders and never contacts anyone but the office.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** Map runbook-style carrier variants to the lib's CarrierKey convention. */
function normalizeCarrierInput(value: unknown): CarrierKey {
  const s = String(value || '').trim().toLowerCase();
  const map: Record<string, CarrierKey> = {
    'canadapost': 'canada-post',
    'canada-post': 'canada-post',
    amazon: 'amazon-logistics',
    'amazon-logistics': 'amazon-logistics',
    ups: 'ups',
    fedex: 'fedex',
    purolator: 'purolator',
    dragonfly: 'dragonfly',
    unknown: 'unknown',
  };
  return map[s] ?? 'unknown';
}

/** Canonical TrackingStatus for a stored value (runbook also writes 'ordered'/'delayed'). */
function toCanonical(value: unknown): TrackingStatus | null {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'in_transit' || s === 'out_for_delivery' || s === 'delivered' || s === 'exception' || s === 'unknown') {
    return s as TrackingStatus;
  }
  if (s === 'ordered') return 'in_transit';
  if (s === 'delayed') return 'exception';
  return null;
}

function carrierTrackUrl(carrier: CarrierKey, trackingNumber: string): string | null {
  const n = encodeURIComponent(trackingNumber);
  switch (carrier) {
    case 'ups':
      return `https://www.ups.com/track?loc=en_US&tracknum=${n}&requester=ST/`;
    case 'fedex':
      return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
    case 'canada-post':
      return `https://www.canadapost-postescanada.ca/track-reperage/en#/resultList?searchFor=${n}`;
    case 'purolator':
      return `https://www.purolator.com/en/shipping/tracker?pin=${n}`;
    case 'amazon-logistics':
      return `https://track.amazon.com/?trackingId=${n}`;
    case 'dragonfly':
      return `https://www.dragonflyshipping.com/track?trackingNumber=${n}`;
    default:
      return null;
  }
}

async function fetchPageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.text()).slice(0, 500_000);
  } catch {
    return null;
  }
}

interface CarrierSignal {
  status: TrackingStatus;
  lastEvent: string;
  etaDate: string | null;
}

async function bestEffortStatus(carrier: CarrierKey, trackingNumber: string): Promise<CarrierSignal> {
  const url = carrierTrackUrl(carrier, trackingNumber);
  if (!url) return { status: 'unknown', lastEvent: 'Check manually', etaDate: null };
  const text = await fetchPageText(url);
  if (!text) return { status: 'unknown', lastEvent: 'Check manually', etaDate: null };
  const status = normalizeStatus(text);
  let etaDate: string | null = null;
  const m = /deliver(?:y|ed)?[^.\n]{0,80}?(\d{4}-\d{2}-\d{2})/i.exec(text) || /(\d{4}-\d{2}-\d{2})[^.\n]{0,80}?deliver/i.exec(text);
  if (m) etaDate = m[1];
  return {
    status,
    etaDate,
    lastEvent: status === 'unknown' ? 'Check manually' : `Carrier page suggests: ${status.replace(/_/g, ' ')}`,
  };
}

type Db = ReturnType<typeof serviceDb>;

async function listDue(db: Db, organization_id: string) {
  const { data, error } = await db
    .from('part_tracking')
    .select('id, job_id, part_name, supplier, tracking_number, carrier, status, eta_date, last_checked_at')
    .eq('organization_id', organization_id)
    .neq('status', 'delivered')
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(200);
  if (error) throw error;
  return Response.json({ ok: true, parts: data || [] });
}

async function manualUpdate(db: Db, body: Record<string, unknown>, organization_id: string) {
  const part_tracking_id = String(body.part_tracking_id || '');
  if (!part_tracking_id) return Response.json({ error: 'part_tracking_id is required.' }, { status: 400 });
  const patch: Record<string, unknown> = { last_checked_at: new Date().toISOString() };
  if (body.status !== undefined) {
    const canonical = toCanonical(body.status);
    if (!canonical) return Response.json({ error: 'Unknown status value.' }, { status: 400 });
    patch.status = body.status === 'ordered' || body.status === 'delayed' ? String(body.status) : canonical;
  }
  if (body.eta !== undefined) patch.eta_date = body.eta ? String(body.eta) : null;
  if (body.carrier !== undefined) patch.carrier = normalizeCarrierInput(body.carrier);
  const { error } = await db
    .from('part_tracking')
    .update(patch)
    .eq('id', part_tracking_id)
    .eq('organization_id', organization_id);
  if (error) throw error;
  return Response.json({ ok: true, updated: true });
}

async function checkOne(db: Db, body: Record<string, unknown>, organization_id: string) {
  const part_tracking_id = String(body.tracking_id || body.part_tracking_id || '');
  if (!part_tracking_id) return Response.json({ error: 'tracking_id is required.' }, { status: 400 });

  const { data: row, error } = await db
    .from('part_tracking')
    .select('id, organization_id, job_id, part_name, supplier, tracking_number, carrier, status, eta_date, last_event')
    .eq('id', part_tracking_id)
    .eq('organization_id', organization_id)
    .maybeSingle();
  if (error || !row) return Response.json({ error: 'Part tracking record not found.' }, { status: 404 });

  let carrier = normalizeCarrierInput(row.carrier);
  if (carrier === 'unknown') carrier = detectCarrier(String(row.tracking_number || ''));
  const previousRaw = String(row.status || 'unknown');
  const prev = toCanonical(previousRaw) ?? 'unknown';
  const prevEta = row.eta_date ? String(row.eta_date) : null;

  const signal = await bestEffortStatus(carrier, String(row.tracking_number));
  const nextEta = signal.etaDate ?? prevEta;

  // Only overwrite a real status; an inconclusive check keeps the last known
  // status and stamps 'Check manually' (runbook Step 4).
  const storedStatus = signal.status === 'unknown' ? previousRaw : signal.status;
  await db
    .from('part_tracking')
    .update({
      carrier,
      status: storedStatus,
      eta_date: nextEta,
      last_event: signal.lastEvent,
      last_checked_at: new Date().toISOString(),
    })
    .eq('id', row.id);

  const changed = shouldNotifyOffice(prev, signal.status, prevEta, nextEta);
  if (changed) {
    const subject = `[Yavamo warehouse] Part update — ${row.part_name}`;
    const notifyBody =
      `Part: ${row.part_name}\n` +
      `Carrier: ${carrier} — tracking ${row.tracking_number}\n` +
      `Status: ${previousRaw} → ${signal.status}${nextEta && nextEta !== prevEta ? ` (ETA changed: ${nextEta})` : ''}\n` +
      `ETA: ${nextEta || 'not provided by carrier'}\n\n` +
      `Action: none required from the agent — FYI only.` +
      (signal.status === 'exception' ? '\nFlag: may need office decision on a replacement part.' : '');
    return Response.json({
      ok: true,
      changed: true,
      previous: previousRaw,
      current: storedStatus,
      eta: nextEta,
      notify: { to: OFFICE_EMAIL, subject, body: notifyBody },
    });
  }
  return Response.json({ ok: true, changed: false, previous: previousRaw, current: storedStatus, eta: nextEta });
}

export async function POST(request: Request) {
  try {
    const denied = cronDenied(request);
    if (denied) return denied;

    const body = await readBody(request, 200_000);
    const organization_id = String(body.organization_id || '');
    if (!organization_id) {
      return Response.json({ error: 'organization_id is required.' }, { status: 400 });
    }
    const db = serviceDb();

    if (body.action === 'due') return listDue(db, organization_id);
    if (body.action === 'update') return manualUpdate(db, body, organization_id);
    return checkOne(db, body, organization_id);
  } catch (error) {
    return Response.json({ error: 'The tracking check could not run.' }, { status: 500 });
  }
}
