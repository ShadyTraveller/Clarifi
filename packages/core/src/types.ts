// @yavamo/core — shared TypeScript types for the Yavamo estimate/pricing engine.
// Framework-free: no React, no Next.js, no Supabase, no DOM. Safe to import from
// the Next.js web app and the React Native/Expo mobile app alike.
//
// Moved verbatim from app/lib/service-templates.ts, app/lib/estimate.ts and
// app/lib/agents/* on 2026-10-09. Behaviour is unchanged; only the module
// location moved. Two deliberate scope decisions (see MANIFEST):
//  1. ServiceKey is the four in-scope services — windows is excluded.
//  2. ServiceTemplate.service is typed `string` (was the app-local `Service`
//     label union in app/lib/domain.ts) so the core package does not depend on
//     app code. The web app keeps its own Service union for UI labels.

/** Canonical in-scope service keys. Windows is excluded (out of scope). */
export type ServiceKey = 'doors' | 'security_film' | 'locksmith' | 'skincare';

/** Alias used by the receptionist classifier. Identical to ServiceKey. */
export type AgentServiceKey = ServiceKey;

/** Labour price tiers. Rates live in pricing.ts (LABOR_TIERS). */
export type LaborTierKey = 'standard' | 'priority' | 'emergency';

// ---- Estimate templates ----------------------------------------------------

export interface TemplateMaterial {
  id: string;
  name: string;
  unit: string;
  defaultQty: number;
  placeholder: boolean;
  notes?: string;
}

export interface TemplateLabor {
  id: string;
  name: string;
  defaultHours: number;
  defaultTier: LaborTierKey;
}

export interface TemplateMeasurement {
  key: string;
  label: string;
  unit: string;
  required: boolean;
}

export interface TemplateMargin {
  laborMarginPct: number;
  materialMarkupPct: number;
  materialMarkupMax?: number;
  netWarnBelow: number;
  note: string;
}

export interface ServiceTemplate {
  key: string;
  /** Display label (e.g. 'Doors'). Typed string so core stays app-independent. */
  service: string;
  name: string;
  description: string;
  materials: TemplateMaterial[];
  labor: TemplateLabor[];
  measurements: TemplateMeasurement[];
  photoChecklist: string[];
  margin: TemplateMargin;
}

// ---- Deterministic estimate engine -----------------------------------------

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

// ---- Agent estimate-draft ---------------------------------------------------

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

// ---- Job-completion mistake guard -------------------------------------------

export interface CompletionEvent {
  at: string;
}

// ---- Warehouse tracking -----------------------------------------------------

export type CarrierKey =
  | 'canada-post'
  | 'purolator'
  | 'ups'
  | 'fedex'
  | 'amazon-logistics'
  | 'dragonfly'
  | 'unknown';

export type TrackingStatus = 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'unknown';
