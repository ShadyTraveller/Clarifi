// @yavamo/core — Billdr-style SECTIONED estimate model + pricing math.
// Framework-free and pure, like the rest of @yavamo/core.
//
// A sectioned estimate groups lines into collapsible sections (e.g. "Site
// prep", "Framing"). Every line carries BOTH a material unit cost and a
// labour unit cost, and one markup % applied to their sum:
//
//   lineTotal = quantity × (materialCost + laborUnit) × (1 + markupPct / 100)
//
// materialCost / laborUnit are INTERNAL cost basis (supplier cost and
// tier-rate labour cost). They must never reach a client view — use
// sectionCustomerProjection() for anything client-facing, mirroring the
// buildEstimate/customerProjection split in estimate.ts.
//
// Labour unit cost is derived from the shared tier table (pricing.ts):
//   laborUnit = tierRate(tierKey) × laborHoursPerUnit
// so section labour can never drift from LABOR_TIERS. Editing the labour $
// in the UI back-solves laborHoursPerUnit = laborUnit / tierRate.

import { roundMoney, tierRate } from './pricing';
import type { LaborTierKey } from './types';

/** Where a line's material price came from. 'placeholder' = deliberately unpriced. */
export type SectionLineSource = 'catalog' | 'lookup' | 'manual' | 'placeholder';

export interface SectionLine {
  id: string;
  task: string;
  quantity: number;
  unit: string;
  /** Internal supplier unit cost. null = unpriced (placeholder / needs lookup). 0 = no material. */
  materialCost: number | null;
  /** Internal labour unit cost (per quantity unit). Derived from tier × hours-per-unit. */
  laborUnit: number;
  /** Estimated labour hours per quantity unit; section headers roll these up. */
  laborHoursPerUnit: number;
  tierKey: LaborTierKey;
  markupPct: number;
  source: SectionLineSource;
  /** Internal provenance, e.g. "Home Depot Canada — Schlage … · $59.98". Office only. */
  sourceNote: string;
  /** True when the office must act on this line before the estimate can be sent. */
  needsReview: boolean;
  reviewNote?: string;
  /** Office-facing hint that is not a blocker (e.g. "delete if rekey only"). */
  note?: string;
}

export interface EstimateSection {
  id: string;
  title: string;
  lines: SectionLine[];
}

export interface PricedSectionLine extends SectionLine {
  /** Client unit price for the line: (materialCost + laborUnit) × (1 + markup). null when unpriced. */
  unitPrice: number | null;
  lineTotal: number | null;
  /** quantity × laborHoursPerUnit, rounded to 2dp. */
  estHours: number;
}

export interface PricedSection {
  id: string;
  title: string;
  lines: PricedSectionLine[];
  /** Sum of priced line totals; null when the section has lines but none are priced. */
  subtotal: number | null;
  estHours: number;
  complete: boolean;
}

export interface SectionedEstimateResult {
  sections: PricedSection[];
  subtotal: number | null;
  taxPct: number;
  tax: number | null;
  total: number | null;
  estHours: number;
  complete: boolean;
  /** Every line the office must resolve (unpriced, placeholder, catalog VERIFY, …). */
  flags: string[];
}

/** Labour unit cost for a tier at a given hours-per-unit. The ONLY way labour $ is derived. */
export function laborUnitFromTier(tierKey: LaborTierKey, laborHoursPerUnit: number): number {
  const hours = Number.isFinite(laborHoursPerUnit) && laborHoursPerUnit > 0 ? laborHoursPerUnit : 0;
  return roundMoney(tierRate(tierKey) * hours);
}

function sanitizeQty(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function sanitizeCost(n: unknown): number | null {
  if (n == null) return null;
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? v : null;
}

export function priceSectionLine(line: SectionLine): PricedSectionLine {
  const quantity = sanitizeQty(line.quantity);
  const materialCost = sanitizeCost(line.materialCost);
  const laborUnit = sanitizeCost(line.laborUnit) ?? 0;
  const markupPct = Number.isFinite(Number(line.markupPct)) ? Math.max(Number(line.markupPct), 0) : 0;
  const estHours = roundMoney(quantity * (Number.isFinite(line.laborHoursPerUnit) && line.laborHoursPerUnit > 0 ? line.laborHoursPerUnit : 0));
  // Line total follows the Billdr formula exactly: quantity × (material +
  // labor) × (1 + markup), rounded ONCE at the total. Rounding the unit
  // price first would drift high-quantity lines by cents (200 sq ft at
  // $3.2875 must total $657.50, not $658.00). unitPrice is display-only.
  const unitPrice = materialCost != null ? roundMoney((materialCost + laborUnit) * (1 + markupPct / 100)) : null;
  const lineTotal = materialCost != null ? roundMoney(quantity * (materialCost + laborUnit) * (1 + markupPct / 100)) : null;
  return { ...line, quantity, materialCost, laborUnit, markupPct, unitPrice, lineTotal, estHours };
}

export function priceSection(section: EstimateSection): PricedSection {
  const lines = section.lines.map(priceSectionLine);
  const priced = lines.filter(l => l.lineTotal != null);
  const subtotal = lines.length === 0 ? 0 : priced.length ? roundMoney(priced.reduce((s, l) => s + (l.lineTotal as number), 0)) : null;
  return {
    id: section.id,
    title: section.title,
    lines,
    subtotal,
    estHours: roundMoney(lines.reduce((s, l) => s + l.estHours, 0)),
    complete: lines.every(l => l.lineTotal != null),
  };
}

export function priceSectionedEstimate(sections: EstimateSection[], taxPct = 13): SectionedEstimateResult {
  const pricedSections = sections.map(priceSection);
  const allLines = pricedSections.flatMap(s => s.lines);
  const priced = allLines.filter(l => l.lineTotal != null);
  const subtotal = allLines.length === 0 ? 0 : priced.length ? roundMoney(priced.reduce((s, l) => s + (l.lineTotal as number), 0)) : null;
  const tax = subtotal != null ? roundMoney(subtotal * taxPct / 100) : null;
  const total = subtotal != null && tax != null ? roundMoney(subtotal + tax) : null;
  const flags: string[] = [];
  for (const s of pricedSections) {
    for (const l of s.lines) {
      if (l.needsReview) flags.push(`"${l.task}": ${l.reviewNote || 'needs office review.'}`);
      else if (l.lineTotal == null) flags.push(`"${l.task}": unpriced — enter a material price or remove the line.`);
    }
  }
  return {
    sections: pricedSections,
    subtotal,
    taxPct,
    tax,
    total,
    estHours: roundMoney(pricedSections.reduce((s, x) => s + x.estHours, 0)),
    complete: allLines.length > 0 && allLines.every(l => l.lineTotal != null),
    flags,
  };
}

// ---- Client-safe projection -------------------------------------------------
// Only task / quantity / unit / unit price / line total survive. Supplier
// cost, labour cost, markup, tier and provenance are internal and stripped,
// exactly like customerProjection() in estimate.ts.

export interface ClientSectionLine { task: string; quantity: number; unit: string; unitPrice: number; lineTotal: number }
export interface ClientSection { title: string; lines: ClientSectionLine[]; subtotal: number }
export interface ClientSectionedEstimate {
  sections: ClientSection[];
  subtotal: number | null;
  taxPct: number;
  tax: number | null;
  total: number | null;
  estHours: number;
  complete: boolean;
}

export function sectionCustomerProjection(r: SectionedEstimateResult): ClientSectionedEstimate {
  return {
    sections: r.sections.map(s => ({
      title: s.title,
      lines: s.lines
        .filter(l => l.lineTotal != null)
        .map(l => ({ task: l.task, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice as number, lineTotal: l.lineTotal as number })),
      subtotal: s.subtotal ?? 0,
    })),
    subtotal: r.subtotal,
    taxPct: r.taxPct,
    tax: r.tax,
    total: r.total,
    estHours: r.estHours,
    complete: r.complete,
  };
}
