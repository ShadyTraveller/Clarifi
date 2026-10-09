// @yavamo/core — pricing constants and labour-tier lookup.
// Framework-free: no React, no Next.js, no Supabase, no DOM.
//
// Moved verbatim on 2026-10-09 from:
//  - app/lib/service-templates.ts (LABOR_TIERS, tierRate)
//  - app/lib/agents/estimate-draft.ts (ASSESSMENT_FEE_CENTS, PART_MARGIN_DEFAULT_PCT,
//    LABOR_FLAT, SHIPPING_FLAT)
//  - app/lib/domain.ts (roundMoney)
// Behaviour is unchanged; only the module location moved.

import type { LaborTierKey } from './types';

export const LABOR_TIERS: { key: LaborTierKey; label: string; rate: number }[] = [
  { key: 'standard', label: 'Standard', rate: 150 },
  { key: 'priority', label: 'Priority', rate: 180 },
  { key: 'emergency', label: 'Emergency / Complex / Two-tech', rate: 220 },
];

export function tierRate(key: LaborTierKey): number {
  return LABOR_TIERS.find(t => t.key === key)?.rate ?? LABOR_TIERS[0].rate;
}

/** Assessment fee: $69.00, in cents. */
export const ASSESSMENT_FEE_CENTS = 6900;
/** Default parts margin applied when the agent does not specify one. */
export const PART_MARGIN_DEFAULT_PCT = 20;
/** Flat labour line the agent uses per job ($180 priority / $220 emergency via tierKey). */
export const LABOR_FLAT = 180;
/** Flat shipping line per estimate. */
export const SHIPPING_FLAT = 20;

/** Round to cents. Every money value in the engine goes through this. */
export const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
