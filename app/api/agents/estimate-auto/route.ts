import 'server-only';
import OpenAI from 'openai';
import { roundMoney, PART_MARGIN_DEFAULT_PCT } from '@yavamo/core';
import { readBody } from '../../../lib/server';
import { serviceDb, cronDenied } from '../lib';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Auto-estimate agent → POST /api/agents/estimate-auto
 * Auth: Authorization: Bearer <CRON_SECRET>.
 *
 * Billdr-style automatic estimates. Given a lead-stage job, clones the active
 * estimate_templates row for the job's service into a draft quote
 * (quotes → quote_versions v1 → quote_line_items), reusing the packages/core
 * pricing math (roundMoney + PART_MARGIN_DEFAULT_PCT) and the clone contract
 * from supabase/migrations/202610090001_estimate_templates.sql:
 *   part     → unit_cost = unit_price_cents ?? material.public_price_cents, /100
 *             markup = pricing_rule.markup_percent ?? 20
 *             unit_price = round(unit_cost * (1 + markup/100), 2)
 *   labour / shipping / fee → flat pricing_rule.amount_cents / 100, markup 0
 *   total    → unit_price * quantity (every kind)
 *
 * Part lines with material_id NULL ("pick from catalog") are resolved by
 * gpt-4o-mini against supplier_materials for the service. The model may only
 * return ids from the provided candidate list — never invented products. Any
 * line it cannot resolve (or when OpenAI is unavailable) is kept as an
 * unpriced line and flagged in needs_review for the office.
 *
 * INTERNAL-ONLY: unit_cost, markup_percent and supplier source URLs stay in
 * DB columns the client views never read. The client quote page renders
 * name/description/total, so description is kept client-safe; cost basis and
 * source URLs go into quotes.internal_notes instead.
 *
 * NEVER sends anything to clients. The office review gate stays mandatory:
 * the quote is created with status 'draft', source 'agent'.
 */

const SERVICE_KEYS = ['doors', 'security-film', 'locksmith', 'skincare'] as const;

interface TemplateRow {
  id: string;
  name: string;
  version: number;
}

interface TemplateLine {
  id: string;
  kind: 'part' | 'labour' | 'shipping' | 'fee';
  label: string;
  material_id: string | null;
  quantity: number;
  unit_price_cents: number | null;
  pricing_rule: { markup_percent?: number; amount_cents?: number };
  sort_order: number;
}

interface Material {
  id: string;
  name: string;
  brand: string | null;
  public_price_cents: number;
  retailer: string | null;
  source_url: string | null;
  unit: string;
  notes: string | null;
}

interface PickResult {
  material_id: string | null;
  quantity: number;
}

function quoteNumber(): string {
  return `AG-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/** Normalize job service values ('security_film' vs 'security-film'); null when out of scope. */
function normalizeService(raw: unknown): string | null {
  const s = String(raw || '').trim().toLowerCase().replace(/_/g, '-');
  return (SERVICE_KEYS as readonly string[]).includes(s) ? s : null;
}

function cleanLabel(label: string): string {
  return label.replace(/\s*[—–-]\s*pick from catalog\s*$/i, '').trim() || label;
}

function sanitizeQty(n: unknown, fallback: number): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * Ask gpt-4o-mini to pick the single best catalog product for a template part
 * line. Returns null on ANY failure (no key, network error, bad JSON, id not
 * in the candidate list) — the caller then flags the line for office pick.
 */
async function pickMaterial(opts: {
  jobText: string;
  lineLabel: string;
  templateQty: number;
  candidates: Material[];
}): Promise<{ pick: PickResult | null; reason: string }> {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) return { pick: null, reason: 'no OPENAI_API_KEY in runtime env' };
  if (opts.candidates.length === 0) return { pick: null, reason: 'zero candidates for service' };

  const candidateLines = opts.candidates.map(
    m =>
      `${m.id} | ${m.name} | ${m.brand || 'no brand'} | $${(m.public_price_cents / 100).toFixed(2)} CAD | per ${m.unit}`,
  );

  const ai = new OpenAI({ apiKey, timeout: 25000, maxRetries: 0 });
  try {
    const completion = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content:
            'You pick one product from an internal materials catalog for a field-service estimate. ' +
            'Reply with ONLY valid JSON, no markdown, no explanation.',
        },
        {
          role: 'user',
          content:
            `Job: ${opts.jobText.slice(0, 1500)}\n` +
            `Line to fill: "${opts.lineLabel}" (template quantity ${opts.templateQty})\n` +
            `Candidates (id | name | brand | price | unit):\n${candidateLines.join('\n')}\n\n` +
            `Return {"material_id": "<one id from the list above>" | null, "quantity": <number>}. ` +
            `Pick the single best match; quantity = units needed for the job (default 1). ` +
            `Return material_id null when nothing fits. Never invent an id.`,
        },
      ],
    });
    const text = completion.choices?.[0]?.message?.content ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { pick: null, reason: 'no JSON object in model response' };
    const parsed = JSON.parse(match[0]) as { material_id?: unknown; quantity?: unknown };
    const ids = new Set(opts.candidates.map(c => c.id));
    const material_id =
      typeof parsed.material_id === 'string' && ids.has(parsed.material_id) ? parsed.material_id : null;
    const quantity = sanitizeQty(parsed.quantity, 1);
    return { pick: { material_id, quantity: Math.min(quantity, 100) }, reason: 'ok' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { pick: null, reason: 'openai call failed: ' + msg.slice(0, 220) };
  }
}

export async function POST(request: Request) {
  try {
    const denied = cronDenied(request);
    if (denied) return denied;

    const body = await readBody(request, 200_000);
    const organization_id = String(body.organization_id || '');
    const job_id = String(body.job_id || '');
    if (!organization_id || !job_id) {
      return Response.json({ error: 'organization_id and job_id are required.' }, { status: 400 });
    }

    const db = serviceDb();

    const { data: job, error: jobError } = await db
      .from('jobs')
      .select('id, organization_id, status, service, request, details')
      .eq('id', job_id)
      .eq('organization_id', organization_id)
      .maybeSingle();
    if (jobError || !job || job.status !== 'lead') {
      return Response.json({ error: 'Job not found.' }, { status: 404 });
    }

    const service = normalizeService(job.service);
    if (!service) {
      return Response.json({ error: 'Unsupported service.' }, { status: 400 });
    }

    const { data: template, error: templateError } = await db
      .from('estimate_templates')
      .select('id, name, version')
      .eq('organization_id', organization_id)
      .eq('service', service)
      .eq('is_active', true)
      .order('version', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (templateError || !template) {
      return Response.json({ error: 'No active estimate template for this service.' }, { status: 400 });
    }
    const tpl = template as TemplateRow;

    const { data: lineRows, error: linesError } = await db
      .from('template_line_items')
      .select('id, kind, label, material_id, quantity, unit_price_cents, pricing_rule, sort_order')
      .eq('template_id', tpl.id)
      .order('sort_order', { ascending: true });
    if (linesError) throw linesError;
    const lines = (lineRows || []) as TemplateLine[];

    const { data: materialRows, error: materialsError } = await db
      .from('supplier_materials')
      .select('id, name, brand, public_price_cents, retailer, source_url, unit, notes')
      .eq('organization_id', organization_id)
      .eq('service', service)
      .eq('is_active', true);
    if (materialsError) throw materialsError;
    const materials = (materialRows || []) as Material[];

    const jobText = `${String(job.request || '')}\n${String(job.details || '')}`.trim() || '(no details provided)';

    const debug = body.debug === true;
    const debugPicks: { line: string; reason: string }[] = [];
    const needs_review: string[] = [];
    const internalRefs: string[] = [];
    const items: {
      quote_version_id?: string;
      item_name: string;
      description: string | null;
      quantity: number;
      unit: string;
      unit_cost: number;
      markup_percent: number;
      unit_price: number;
      total: number;
      sort_order: number;
    }[] = [];

    for (const line of lines) {
      const rule = line.pricing_rule || {};
      const quantity = sanitizeQty(line.quantity, 1);

      if (line.kind === 'part') {
        // Resolve the material: pinned on the template, else AI pick from catalog.
        let material: Material | null =
          line.material_id != null ? materials.find(m => m.id === line.material_id) || null : null;
        let qty = quantity;
        if (!material && line.material_id == null) {
          const pres = await pickMaterial({
            jobText,
            lineLabel: line.label,
            templateQty: quantity,
            candidates: materials,
          });
          if (debug) debugPicks.push({ line: cleanLabel(line.label), reason: pres.reason });
          if (pres.pick?.material_id) {
            material = materials.find(m => m.id === pres.pick.material_id) || null;
            qty = pres.pick.quantity;
          }
        }

        const markup = Number.isFinite(Number(rule.markup_percent))
          ? Number(rule.markup_percent)
          : PART_MARGIN_DEFAULT_PCT;
        const unit_cost =
          line.unit_price_cents != null && line.unit_price_cents >= 0
            ? line.unit_price_cents / 100
            : material
              ? material.public_price_cents / 100
              : 0;
        const unit_price = roundMoney(unit_cost * (1 + markup / 100));
        const total = roundMoney(unit_price * qty);

        const label = cleanLabel(line.label);
        if (!material) {
          needs_review.push(`"${label}": no catalog product matched — office pick required.`);
          internalRefs.push(`${label}: UNPRICED — office must pick a product.`);
        } else {
          if (material.notes && /verify/i.test(material.notes)) {
            needs_review.push(`"${label}": "${material.name}" flagged VERIFY in catalog — confirm before ordering.`);
          }
          internalRefs.push(
            `${label}: cost $${unit_cost.toFixed(2)} ← ${material.retailer || 'catalog'} ${material.source_url || ''}`.trim(),
          );
        }

        items.push({
          item_name: material ? material.name : label,
          // Client-safe: the client quote page renders description, so no
          // URLs or cost basis here — those stay in internal_notes.
          description: material && material.brand ? material.brand : null,
          quantity: qty,
          unit: material?.unit || 'each',
          unit_cost,
          markup_percent: markup,
          unit_price,
          total,
          sort_order: line.sort_order,
        });
      } else {
        // labour / shipping / fee: flat pricing_rule.amount_cents, never marked up.
        const unit_cost = Number.isFinite(Number(rule.amount_cents)) && Number(rule.amount_cents) >= 0
          ? Number(rule.amount_cents) / 100
          : 0;
        const total = roundMoney(unit_cost * quantity);
        items.push({
          item_name: line.label,
          description: line.kind === 'labour' ? 'Flat-rate labour' : null,
          quantity,
          unit: line.kind === 'labour' ? 'job' : 'flat',
          unit_cost,
          markup_percent: 0,
          unit_price: unit_cost,
          total,
          sort_order: line.sort_order,
        });
      }
    }

    const subtotal = roundMoney(items.reduce((s, l) => s + l.total, 0));
    const tax = roundMoney(subtotal * 0.13);
    const total = roundMoney(subtotal + tax);

    const internal_notes = [
      `source: estimate-auto · template: ${tpl.name} v${tpl.version} · service: ${service}`,
      ...needs_review,
      '',
      'Internal cost basis — office only, never shown to clients:',
      ...internalRefs,
    ].join('\n');

    const { data: quote, error: quoteError } = await db
      .from('quotes')
      .insert({
        organization_id,
        job_id: job.id,
        quote_number: quoteNumber(),
        status: 'draft',
        source: 'agent',
        internal_notes,
      })
      .select('id')
      .single();
    if (quoteError) throw quoteError;

    const { data: version, error: versionError } = await db
      .from('quote_versions')
      .insert({ quote_id: quote.id, version_number: 1, subtotal, tax, total })
      .select('id')
      .single();
    if (versionError) throw versionError;

    const { error: itemsError } = await db
      .from('quote_line_items')
      .insert(items.map((l, i) => ({ ...l, quote_version_id: version.id, sort_order: i })));
    if (itemsError) throw itemsError;

    // Move the request onto the estimate board column (mirrors estimate-draft).
    await db.from('jobs').update({ status: 'estimate' }).eq('id', job.id);

    return Response.json({
      ok: true,
      quote_id: quote.id,
      version_id: version.id,
      lines: items.length,
      needs_review,
      ...(debug
        ? {
            _debug: {
              service,
              materials_found: materials.length,
              has_openai_key: !!process.env.OPENAI_API_KEY,
              picks: debugPicks,
            },
          }
        : {}),
    });
  } catch (error) {
    return Response.json({ error: 'The automatic estimate could not be created.' }, { status: 500 });
  }
}
