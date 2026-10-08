import 'server-only';

/**
 * Single import point for the agent helper libs at app/lib/agents/*
 * (estimate-draft.ts, mistake-guard.ts, tracking.ts). Routes import from here;
 * the libs themselves own the logic and its tests.
 */
export {
  buildAgentEstimateInput,
  ASSESSMENT_FEE_CENTS,
  PART_MARGIN_DEFAULT_PCT,
  LABOR_FLAT,
  SHIPPING_FLAT,
} from '../../lib/agents/estimate-draft';
export type { AgentPart, AgentEstimateOutput } from '../../lib/agents/estimate-draft';

export { assessCompletion } from '../../lib/agents/mistake-guard';
export type { CompletionEvent } from '../../lib/agents/mistake-guard';

export { detectCarrier, normalizeStatus, shouldNotifyOffice } from '../../lib/agents/tracking';
export type { CarrierKey, TrackingStatus } from '../../lib/agents/tracking';
