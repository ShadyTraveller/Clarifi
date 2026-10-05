// Deterministic estimate pricing engine.
// NO React, NO AI, NO randomness, NO invented prices.
// Every money value is rounded with roundMoney; every function is pure.

import { roundMoney } from './domain';
import { tierRate } from './service-templates';
import type { LaborTierKey, ServiceTemplate } from './service-templates';

export interface PricedMaterialLine {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  supplierCost: number | null;
  markupPct: number;
  unitPrice: number | null;
  lineTotal: number | null;
  lineCost: number | null;
  marginPct: number | null;
}

export interface PricedLaborLine {
  id: string;
  name: string;
  hours: number;
  tierKey: LaborTierKey;
  tierRate: number;
  /** Client hourly price: tierRate / (1 - laborMarginPct/100) */
  unitPrice: number;
  lineTotal: number;
  lineCost: number;
  marginPct: number;
}

export interface EstimateResult {
  materials: PricedMaterialLine[];
  labor: PricedLaborLine[];
  subtotal: number | null;
  taxPct: number;
  tax: number | null;
  total: number | null;
  depositPct: number;
  deposit: number | null;
  totalCost: number | null;
  netMarginPct: number | null;
  warnings: string[];
  complete: boolean;
}

export interface EstimateInput {
  template: ServiceTemplate;
  materials: { id: string; name: string; quantity: number; unit: string; supplierCost: number | null; markupPct?: number }[];
  labor: { id: string; name: string; hours: number; tierKey: LaborTierKey }[];
  /** Per-estimate labor margin override (percent). Defaults to template.margin.laborMarginPct. */
  laborMarginPct?: number;
  taxPct?: number;
  depositPct?: number;
}

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

  const materials: PricedMaterialLine[] = input.materials.map(m => {
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

  const labor: PricedLaborLine[] = input.labor.map(l => {
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

/** Client-safe line shapes — supplier cost, line cost, margin and markup are stripped. */
export interface ClientMaterialLine { name: string; quantity: number; unit: string; unitPrice: number; lineTotal: number }
export interface ClientLaborLine { name: string; hours: number; tierKey: LaborTierKey; unitPrice: number; lineTotal: number }
export interface ClientEstimate {
  materials: ClientMaterialLine[];
  labor: ClientLaborLine[];
  subtotal: number | null;
  taxPct: number;
  tax: number | null;
  total: number | null;
  depositPct: number;
  deposit: number | null;
  validDays?: number;
  complete: boolean;
  warnings: string[];
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
