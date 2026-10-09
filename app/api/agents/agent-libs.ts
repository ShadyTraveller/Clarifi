import 'server-only';

/**
 * Single import point for the agent helper libs.
 * The deterministic engine (estimate math, pricing constants, classification,
 * mistake-guard) lives in @yavamo/core (packages/core/src) — the canonical
 * home shared with the Expo mobile app. Warehouse tracking helpers stay in
 * app/lib/agents/tracking.ts (server cron use).
 */
export {
  buildAgentEstimateInput,
  ASSESSMENT_FEE_CENTS,
  PART_MARGIN_DEFAULT_PCT,
  LABOR_FLAT,
  SHIPPING_FLAT,
  assessCompletion,
} from '@yavamo/core';
export type { AgentPart, AgentEstimateOutput, CompletionEvent } from '@yavamo/core';

export { detectCarrier, normalizeStatus, shouldNotifyOffice } from '../../lib/agents/tracking';
export type { CarrierKey, TrackingStatus } from '../../lib/agents/tracking';
