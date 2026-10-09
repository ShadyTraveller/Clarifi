// @yavamo/core — barrel exports.
// The Next.js web app imports via the "@yavamo/core" tsconfig path alias;
// the Expo mobile app resolves the same package through its own config.

export type {
  ServiceKey,
  AgentServiceKey,
  LaborTierKey,
  TemplateMaterial,
  TemplateLabor,
  TemplateMeasurement,
  TemplateMargin,
  ServiceTemplate,
  PricedMaterialLine,
  PricedLaborLine,
  EstimateResult,
  EstimateInput,
  ClientMaterialLine,
  ClientLaborLine,
  ClientEstimate,
  AgentPart,
  AgentEstimateOutput,
  CompletionEvent,
  CarrierKey,
  TrackingStatus,
} from './types';

export {
  LABOR_TIERS,
  tierRate,
  ASSESSMENT_FEE_CENTS,
  PART_MARGIN_DEFAULT_PCT,
  LABOR_FLAT,
  SHIPPING_FLAT,
  roundMoney,
} from './pricing';

export { buildEstimate, customerProjection, buildAgentEstimateInput } from './estimate';

export {
  isOutOfScope,
  hasExtension,
  isBusinessHours,
  SERVICE_QUESTIONS,
  buildInquiryDraft,
  buildAfterHoursDraft,
  buildDeclineDraft,
  classifyAssist,
  assessCompletion,
} from './classify';
