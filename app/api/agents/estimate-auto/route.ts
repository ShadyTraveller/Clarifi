import 'server-only';
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
 * Part lines with material_id NULL ("pick from catalog") are resolved by a
 * deterministic keyword matcher against supplier_materials for the service. The matcher may only
 * return ids from the provided candidate list — never invented products. Any
 * line it cannot resolve is kept as an unpriced line and flagged in
 * needs_review for the office.
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
 * Deterministic catalog matcher: picks the best product for a template part
 * line using keyword overlap (IDF-weighted) between the line label + job text
 * and each candidate's name/brand. No network calls, no API keys, no cost.
 *
 * - Label keywords weigh 2x (they define what's needed); job keywords 0.5x.
 * - Rare words (e.g. "rekey", "squeegee") weigh more than common ones ("door").
 * - Concept tags map domain terms to catalog vocabulary
 *   (e.g. "security" <-> "explosion-proof").
 * - Near-ties break by lowest price (deterministic); anything below the
 *   confidence threshold returns null so the office picks it.
 */
const MATCH_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'on', 'in', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that',
  'i', 'we', 'you', 'he', 'she', 'they', 'my', 'our', 'your', 'his', 'her',
  'their', 'me', 'us', 'him', 'them', 'at', 'by', 'from', 'as',
  'how', 'much', 'need', 'needs', 'needed', 'want', 'wants', 'wanted',
  'please', 'hi', 'hello', 'thanks', 'thank', 'just', 'like', 'new',
]);
const MATCH_GENERIC = new Set(['set', 'kit', 'pack', 'pair']);
const MATCH_CONCEPTS: Array<{ concept: string[]; triggers: string[] }> = [
  {
    concept: ['security'],
    triggers: [
      'explosion-proof', 'explosionproof', 'shatterproof',
      'shatter-proof', 'safety', 'protective', '8mil', '12mil',
    ],
  },
  { concept: ['squeegee'], triggers: ['squeegee', 'squeegees'] },
];
const MATCH_THRESHOLD = 6.0;

function matchStem(w: string): string {
  for (const suf of ['ing', 'ies', 'es', 'ed', 's']) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) {
      return suf === 'ies' ? w.slice(0, -3) + 'y' : w.slice(0, -suf.length);
    }
  }
  return w;
}

function matchTokens(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  return words.map(matchStem).filter(w => !MATCH_STOPWORDS.has(w) && w.length > 1);
}

function matchCandidateTokens(c: Material): Set<string> {
  const toks = new Set(matchTokens(`${c.name} ${c.brand || ''}`));
  for (const { concept, triggers } of MATCH_CONCEPTS) {
    for (const trig of triggers) {
      const trigToks = matchTokens(trig);
      if (trigToks.length > 0 && trigToks.every(t => toks.has(t))) {
        concept.forEach(t => toks.add(t));
        break;
      }
    }
  }
  return toks;
}

function pickMaterial(opts: {
  jobText: string;
  lineLabel: string;
  templateQty: number;
  candidates: Material[];
}): PickResult | null {
  const n = opts.candidates.length;
  if (n === 0) return null;
  const labelToks = matchTokens(opts.lineLabel);
  const jobToks = matchTokens(opts.jobText);
  const toksets = opts.candidates.map(matchCandidateTokens);
  const df = new Map<string, number>();
  for (const toks of toksets) {
    for (const t of toks) df.set(t, (df.get(t) || 0) + 1);
  }
  const idf = (t: string) => Math.log(n / (1 + (df.get(t) || 0))) + 1;
  const scored = opts.candidates.map((c, i) => {
    const toks = toksets[i];
    let s = 0;
    for (const t of new Set(labelToks)) {
      if (toks.has(t)) s += (MATCH_GENERIC.has(t) ? 1 : 2) * idf(t);
    }
    for (const t of new Set(jobToks)) {
      if (toks.has(t)) s += 0.5 * idf(t);
    }
    return { s, c };
  });
  scored.sort((a, b) => b.s - a.s || a.c.public_price_cents - b.c.public_price_cents);
  if (scored[0].s < MATCH_THRESHOLD) return null;
  return { material_id: scored[0].c.id, quantity: opts.templateQty };
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
          const pick = await pickMaterial({
            jobText,
            lineLabel: line.label,
            templateQty: quantity,
            candidates: materials,
          });
          if (pick?.material_id) {
            material = materials.find(m => m.id === pick.material_id) || null;
            qty = pick.quantity;
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
    });
  } catch (error) {
    return Response.json({ error: 'The automatic estimate could not be created.' }, { status: 500 });
  }
}
