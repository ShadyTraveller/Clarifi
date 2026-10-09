import 'server-only';
import { getTemplate } from '../../../lib/service-templates';
import {
  buildAgentEstimateInput,
  buildEstimate,
  ASSESSMENT_FEE_CENTS,
  type AgentPart,
  type LaborTierKey,
} from '@yavamo/core';
import { verifyProduct } from '../../../lib/sourcing';
import type { Product } from '../../../lib/domain';
import { readBody } from '../../../lib/server';
import { serviceDb, cronDenied } from '../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Receptionist agent → POST /api/agents/estimate-draft
 * Auth: Authorization: Bearer <CRON_SECRET>.
 *
 * Builds a DRAFT quote (status 'draft', source 'agent') from tech assessment
 * notes: parts at supplier cost + margin via the deterministic buildEstimate
 * engine (see packages/core/src/estimate.ts). Never sends the quote to the
 * client; the office review gate sends the approval link.
 *
 * Two jobs in one request (body.twoJobs === true, or body.jobCount > 1): the
 * estimate carries parts for both jobs with a single $180 labour line, and the
 * JOB is stamped assessment_fee_cents=13800 (2×$69) — Lavie's correction,
 * 2026-10-08.
 */

const MAX_PARTS = 15;

interface PartInput {
  name?: unknown;
  quantity?: unknown;
  unit?: unknown;
  supplierCost?: unknown;
  supplierUrl?: unknown;
  aftermarket?: unknown;
}

function quoteNumber(): string {
  return `AG-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function POST(request: Request) {
  try {
    const denied = cronDenied(request);
    if (denied) return denied;

    const body = await readBody(request, 1_000_000);
    const organization_id = String(body.organization_id || '');
    const job_id = String(body.job_id || '');
    if (!organization_id || !job_id) {
      return Response.json({ error: 'organization_id and job_id are required.' }, { status: 400 });
    }
    const tierKey: LaborTierKey = body.tierKey === 'emergency' ? 'emergency' : 'priority';
    const marginPct = Number.isFinite(Number(body.marginPct))
      ? Math.min(Math.max(Number(body.marginPct), 0), 100)
      : 20;
    const jobCount = Number.isFinite(Number(body.jobCount)) && Number(body.jobCount) > 1
      ? Math.floor(Number(body.jobCount))
      : 1;
    // Two distinct jobs folded into one job record (Lavie correction 2026-10-08).
    const twoJobs = body.twoJobs === true || jobCount > 1;
    const partsIn: PartInput[] = Array.isArray(body.parts) ? body.parts.slice(0, MAX_PARTS) : [];

    const db = serviceDb();
    const { data: job, error: jobError } = await db
      .from('jobs')
      .select('id, organization_id, status, service, request')
      .eq('id', job_id)
      .eq('organization_id', organization_id)
      .maybeSingle();
    if (jobError || !job) {
      return Response.json({ error: 'Job not found.' }, { status: 404 });
    }

    // Template keyed by the job's service (falls back to the first template for unknown services).
    const template = getTemplate(String(body.service || job.service || ''));
    const flags: string[] = [`source: agent · template: ${template.name} · tier: ${tierKey} · margin: ${marginPct}%`];
    if (twoJobs) {
      flags.push(`Two jobs in one request: assessment fee $${(ASSESSMENT_FEE_CENTS * 2 / 100).toFixed(0)} (2×$69); single labour line.`);
    }

    const parts: AgentPart[] = [];
    for (const p of partsIn) {
      const name = String(p.name || '').trim().slice(0, 200);
      if (!name) continue;
      const quantity = Number.isFinite(Number(p.quantity)) && Number(p.quantity) > 0 ? Number(p.quantity) : 1;
      const unit = String(p.unit || 'each').slice(0, 32);
      let supplierCost: number | null =
        Number.isFinite(Number(p.supplierCost)) && Number(p.supplierCost) > 0 ? Number(p.supplierCost) : null;
      const supplierUrl = typeof p.supplierUrl === 'string' && p.supplierUrl.trim() ? p.supplierUrl.trim() : null;
      const aftermarket = p.aftermarket === true;

      // Confirm CAD prices from approved supplier pages; keep the tech's number
      // but flag it when verification fails — never invent a price.
      if (supplierUrl) {
        try {
          const product: Product = {
            name,
            supplier: '',
            cost: null,
            url: supplierUrl,
            image: null,
            evidence: '',
            checked_at: new Date().toISOString(),
          };
          const verified = await verifyProduct(product);
          if (verified.cost != null && verified.cost > 0) {
            supplierCost = verified.cost;
          } else {
            flags.push(`price unverified: ${name}`);
          }
        } catch {
          flags.push(`price unverified: ${name}`);
        }
      }
      parts.push({ name, quantity, unit, supplierCost, supplierUrl, aftermarket });
    }
    if (!parts.length) {
      return Response.json({ error: 'At least one part is required.' }, { status: 400 });
    }

    // The lib always emits exactly ONE labour line; jobCount is retained for
    // context only. Two-jobs-in-one-request stamps 2× the assessment fee.
    const { input, flags: libFlags } = buildAgentEstimateInput({
      template,
      parts,
      tierKey,
      jobCount,
      marginPct,
    });
    const result = buildEstimate(input);
    const allFlags = [...flags, ...libFlags];

    // Mirrors the app's quote shape: quotes row → quote_versions (v1) →
    // quote_line_items ordered by sort_order (see app/page.tsx read path).
    // unit_cost/markup_percent stay internal — the client page renders only
    // name/description/total (see app/quote/[token]/page.tsx).
    const { data: quote, error: quoteError } = await db
      .from('quotes')
      .insert({
        organization_id,
        job_id: job.id,
        quote_number: quoteNumber(),
        status: 'draft',
        source: 'agent',
        internal_notes: allFlags.join('\n'),
      })
      .select('id')
      .single();
    if (quoteError) throw quoteError;

    const { data: version, error: versionError } = await db
      .from('quote_versions')
      .insert({
        quote_id: quote.id,
        version_number: 1,
        subtotal: result.subtotal ?? 0,
        tax: result.tax ?? 0,
        total: result.total ?? 0,
      })
      .select('id')
      .single();
    if (versionError) throw versionError;

    const lines = [
      ...result.materials.map((m, i) => ({
        quote_version_id: version.id,
        item_name: m.name,
        description: null,
        quantity: m.quantity,
        unit: m.unit,
        unit_cost: m.supplierCost ?? 0,
        markup_percent: m.markupPct,
        unit_price: m.unitPrice ?? 0,
        total: m.lineTotal ?? 0,
        sort_order: i,
      })),
      ...result.labor.map((l, i) => ({
        quote_version_id: version.id,
        item_name: l.name,
        description: 'Flat-rate labour',
        quantity: l.hours,
        unit: 'job',
        unit_cost: l.tierRate,
        markup_percent: 0,
        unit_price: l.unitPrice,
        total: l.lineTotal,
        sort_order: result.materials.length + i,
      })),
    ];
    const { error: linesError } = await db.from('quote_line_items').insert(lines);
    if (linesError) throw linesError;

    // Move the job onto the estimate board column. Two-jobs-in-one-request:
    // the single job record carries 2× the $69 assessment fee.
    if (job.status === 'lead' || job.status === 'active') {
      await db.from('jobs').update({ status: 'estimate' }).eq('id', job.id);
    }
    if (twoJobs) {
      await db.from('jobs').update({ assessment_fee_cents: ASSESSMENT_FEE_CENTS * 2 }).eq('id', job.id);
    }

    return Response.json({ ok: true, quote_id: quote.id, total: result.total, flags: allFlags, warnings: result.warnings });
  } catch (error) {
    return Response.json({ error: 'The agent estimate could not be created.' }, { status: 500 });
  }
}
