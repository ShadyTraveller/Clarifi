// Receptionist estimate-draft builder: turns agent-found parts into a deterministic
// EstimateInput for buildEstimate. No invented prices, no randomness.
// Server-safe: no React, no AI calls.

import type { EstimateInput } from '../estimate';
import type { ServiceTemplate } from '../service-templates';

/** Assessment fee: $69.00, in cents. */
export const ASSESSMENT_FEE_CENTS = 6900;
/** Default parts margin applied when the agent does not specify one. */
export const PART_MARGIN_DEFAULT_PCT = 20;
/** Flat labour line the agent uses per job ($180 priority / $220 emergency via tierKey). */
export const LABOR_FLAT = 180;
/** Flat shipping line per estimate. */
export const SHIPPING_FLAT = 20;

/** A part the agent priced via web lookup (or failed to price). */
export interface AgentPart {
  name: string;
  quantity?: number;
  unit?: string;
  /** Sourced supplier cost in dollars. null = unpriced (flagged for office decision). */
  supplierCost: number | null;
  supplierUrl?: string | null;
  /** True when the part is an aftermarket substitute — flagged, never silently used. */
  aftermarket?: boolean;
}

export interface AgentEstimateOutput {
  input: EstimateInput;
  /** Every "needs office decision" item: aftermarket parts and unpriced parts. */
  flags: string[];
}

/**
 * Build an EstimateInput from agent-sourced parts.
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
