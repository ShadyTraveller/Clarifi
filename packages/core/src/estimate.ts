// @yavamo/core — deterministic estimate pricing engine + agent estimate builder.
// NO React, NO AI, NO randomness, NO invented prices.
// Every money value is rounded with roundMoney; every function is pure.
//
// Moved verbatim on 2026-10-09 from app/lib/estimate.ts (buildEstimate,
// customerProjection) and app/lib/agents/estimate-draft.ts
// (buildAgentEstimateInput). Behaviour is unchanged; only the module location
// moved.

import { roundMoney, tierRate, PART_MARGIN_DEFAULT_PCT, SHIPPING_FLAT } from './pricing';
import type {
  AgentEstimateOutput,
  AgentPart,
  ClientEstimate,
  EstimateInput,
  EstimateResult,
  ServiceTemplate,
} from './types';

function sanitizeQty(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Supplier cost is valid only when it is a positive number. Zero / null / NaN means "unpriced". */
function sanitizeCost(n: unknown): number | null {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function buildEstimate(input: EstimateInput): EstimateResult {
  const { template } = input;
  const taxPct = input.taxPct ?? 13;
  const depositPct = input.depositPct ?? 50;
  const laborMargin = input.laborMarginPct ?? template.margin.laborMarginPct;
  const markupMax = template.margin.materialMarkupMax ?? 1000;
  const warnings: string[] = [];

  const materials = input.materials.map(m => {
    const quantity = sanitizeQty(m.quantity);
    const supplierCost = sanitizeCost(m.supplierCost);
    const requestedMarkup = Number.isFinite(Number(m.markupPct)) ? Number(m.markupPct) : template.margin.materialMarkupPct;
    const markupPct = Math.min(Math.max(requestedMarkup, 0), markupMax);
    if (markupPct !== requestedMarkup) {
      warnings.push(`Markup for "${m.name}" was clamped to ${markupPct}%.`);
    }
    // unitPrice = supplierCost * (1 + markupPct/100); null when the line is unpriced.
    const unitPrice = supplierCost != null ? roundMoney(supplierCost * (1 + markupPct / 100)) : null;
    const lineTotal = unitPrice != null ? roundMoney(quantity * unitPrice) : null;
    const lineCost = supplierCost != null ? roundMoney(quantity * supplierCost) : null;
    const marginPct = unitPrice != null && supplierCost != null && unitPrice > 0
      ? roundMoney((unitPrice - supplierCost) / unitPrice * 100)
      : null;
    return { id: m.id, name: m.name, quantity, unit: m.unit, supplierCost, markupPct, unitPrice, lineTotal, lineCost, marginPct };
  });

  const labor = input.labor.map(l => {
    const hours = sanitizeQty(l.hours);
    const rate = tierRate(l.tierKey);
    // effectiveRate = tierRate / (1 - laborMarginPct/100)
    const effectiveRate = rate / (1 - laborMargin / 100);
    const unitPrice = roundMoney(effectiveRate);
    return {
      id: l.id,
      name: l.name,
      hours,
      tierKey: l.tierKey,
      tierRate: rate,
      unitPrice,
      lineTotal: roundMoney(hours * effectiveRate),
      lineCost: roundMoney(hours * rate),
      marginPct: laborMargin,
    };
  });

  const all = [...materials, ...labor];
  const priced = all.filter(l => l.lineTotal != null);
  const subtotal = priced.length ? roundMoney(priced.reduce((s, l) => s + (l.lineTotal as number), 0)) : null;
  const tax = subtotal != null ? roundMoney(subtotal * taxPct / 100) : null;
  const total = subtotal != null ? roundMoney(subtotal + (tax as number)) : null;
  const deposit = total != null ? roundMoney(total * depositPct / 100) : null;

  // totalCost: null if nothing is priced; null if any PRICED line lacks a cost.
  let totalCost: number | null = null;
  if (priced.length > 0) {
    totalCost = priced.some(l => l.lineCost == null)
      ? null
      : roundMoney(priced.reduce((s, l) => s + (l.lineCost as number), 0));
  }

  const netMarginPct = totalCost != null && subtotal != null && subtotal > 0
    ? roundMoney((subtotal - totalCost) / subtotal * 100)
    : null;

  for (const m of materials) {
    if (m.supplierCost == null) warnings.push(`Unpriced material: ${m.name} — enter a supplier price`);
  }
  if (netMarginPct != null && netMarginPct < template.margin.netWarnBelow) {
    warnings.push(`Net margin ${netMarginPct}% is below the ${template.margin.netWarnBelow}% guardrail for ${template.name}`);
  }

  const complete = all.length > 0 && all.every(l => l.lineTotal != null);

  return { materials, labor, subtotal, taxPct, tax, total, depositPct, deposit, totalCost, netMarginPct, warnings, complete };
}

/**
 * Strip every internal field (supplierCost, lineCost, totalCost, marginPct, markupPct)
 * plus internal-only warnings (net margin guardrail). The client preview MUST render
 * from this object, never from the full EstimateResult.
 */
export function customerProjection(r: EstimateResult): ClientEstimate {
  return {
    materials: r.materials
      .filter(m => m.lineTotal != null)
      .map(m => ({ name: m.name, quantity: m.quantity, unit: m.unit, unitPrice: m.unitPrice as number, lineTotal: m.lineTotal as number })),
    labor: r.labor.map(l => ({ name: l.name, hours: l.hours, tierKey: l.tierKey, unitPrice: l.unitPrice, lineTotal: l.lineTotal })),
    subtotal: r.subtotal,
    taxPct: r.taxPct,
    tax: r.tax,
    total: r.total,
    depositPct: r.depositPct,
    deposit: r.deposit,
    complete: r.complete,
    warnings: r.warnings.filter(w => !w.startsWith('Net margin')),
  };
}

/**
 * Build an EstimateInput from agent-sourced parts.
 * (Moved verbatim from app/lib/agents/estimate-draft.ts.)
 *
 * - Materials: each part at `marginPct` (default 20%). Aftermarket parts get
 *   " (aftermarket — needs office decision)" appended to the name and a flag.
 *   Unpriced parts (supplierCost null) are kept as unpriced lines and flagged.
 * - Labour: exactly ONE flat line of 1 hour at the given tier with
 *   laborMarginPct 0, so the client price is exactly the tier rate
 *   ($180 priority / $220 emergency). Per Lavie (2026-10-08): even when one
 *   request contains two distinct jobs, labour stays $180 x 1 — only the
 *   assessment fee doubles ($138), which is recorded on the job, not here.
 *   The `jobCount` option is retained for compatibility but no longer
 *   multiplies labour lines.
 * - Shipping: one flat $20 line, 0% markup.
 */
export function buildAgentEstimateInput(opts: {
  template: ServiceTemplate;
  parts: AgentPart[];
  tierKey: 'priority' | 'emergency';
  /** Retained for compatibility; does NOT multiply labour (always 1 line). */
  jobCount?: number;
  marginPct?: number;
}): AgentEstimateOutput {
  const marginPct = opts.marginPct ?? PART_MARGIN_DEFAULT_PCT;
  const flags: string[] = [];

  const materials: EstimateInput['materials'] = opts.parts.map((p, i) => {
    const aftermarket = p.aftermarket === true;
    if (aftermarket) {
      flags.push(`Aftermarket part: "${p.name}" — needs office decision before ordering.`);
    }
    if (p.supplierCost == null) {
      flags.push(`Unpriced part: "${p.name}" — no supplier price found; needs office decision.`);
    }
    return {
      id: `agent-part-${i + 1}`,
      name: aftermarket ? `${p.name} (aftermarket — needs office decision)` : p.name,
      quantity: p.quantity ?? 1,
      unit: p.unit ?? 'each',
      supplierCost: p.supplierCost,
      markupPct: marginPct,
    };
  });

  materials.push({
    id: 'shipping',
    name: 'Flat shipping',
    quantity: 1,
    unit: 'flat',
    supplierCost: SHIPPING_FLAT,
    markupPct: 0,
  });

  const labor: EstimateInput['labor'] = [{
    id: 'agent-labor-1',
    name: 'Labour',
    hours: 1,
    tierKey: opts.tierKey,
  }];

  const input: EstimateInput = {
    template: opts.template,
    materials,
    labor,
    // 0% labour margin: client price = exactly the flat tier rate (180 / 220).
    laborMarginPct: 0,
    taxPct: 13,
    depositPct: 50,
  };

  return { input, flags };
}
