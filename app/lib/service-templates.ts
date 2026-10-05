import { PHOTO_CHECKLISTS } from './domain';
import type { Service } from './domain';

export type LaborTierKey = 'standard' | 'priority' | 'emergency';

export const LABOR_TIERS: { key: LaborTierKey; label: string; rate: number }[] = [
  { key: 'standard', label: 'Standard', rate: 150 },
  { key: 'priority', label: 'Priority', rate: 180 },
  { key: 'emergency', label: 'Emergency / Complex / Two-tech', rate: 220 },
];

export function tierRate(key: LaborTierKey): number {
  return LABOR_TIERS.find(t => t.key === key)?.rate ?? LABOR_TIERS[0].rate;
}

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
  service: Service;
  name: string;
  description: string;
  materials: TemplateMaterial[];
  labor: TemplateLabor[];
  measurements: TemplateMeasurement[];
  photoChecklist: string[];
  margin: TemplateMargin;
}

export const SERVICE_TEMPLATES: ServiceTemplate[] = [
  {
    key: 'locksmith',
    service: 'Locksmith',
    name: 'Locksmith — Rekey / lock change',
    description: 'Residential rekey and lock change (no cars or key fobs). Hardware is priced at office-supplied supplier cost plus the template markup.',
    // PLACEHOLDER material list — replace with real supplier list
    materials: [
      { id: 'lm-deadbolt', name: 'Deadbolt', unit: 'each', defaultQty: 1, placeholder: true },
      { id: 'lm-gripset', name: 'Gripset', unit: 'each', defaultQty: 1, placeholder: true },
      { id: 'lm-rekey-kit', name: 'Rekey kit / consumables', unit: 'each', defaultQty: 1, placeholder: true },
      { id: 'lm-strike', name: 'Strike plate', unit: 'each', defaultQty: 1, placeholder: true },
    ],
    labor: [{ id: 'll-call', name: 'Service call & labour', defaultHours: 1, defaultTier: 'standard' }],
    measurements: [
      { key: 'locks', label: 'Locks to service', unit: 'count', required: true },
    ],
    photoChecklist: PHOTO_CHECKLISTS.Locksmith,
    margin: {
      laborMarginPct: 75,
      materialMarkupPct: 42,
      netWarnBelow: 24,
      note: 'Emergency calls drive the highest margins',
    },
  },
  {
    key: 'security_film',
    service: 'Security Film',
    name: 'Security film — supply & install',
    description: 'Security window film supplied and installed. Film quantity is driven by measured pane area (sq ft).',
    // PLACEHOLDER material list — replace with real supplier list
    materials: [
      { id: 'fm-film', name: 'Security film', unit: 'sq ft', defaultQty: 40, placeholder: true, notes: 'Estimate 40 sq ft for an average sliding door' },
      { id: 'fm-solution', name: 'Installation solution', unit: 'bottle', defaultQty: 1, placeholder: true },
      { id: 'fm-sealant', name: 'Edge sealant', unit: 'tube', defaultQty: 1, placeholder: true },
    ],
    labor: [{ id: 'fl-install', name: 'Film installation labour', defaultHours: 2, defaultTier: 'standard' }],
    measurements: [
      { key: 'width', label: 'Pane width', unit: 'in', required: true },
      { key: 'height', label: 'Pane height', unit: 'in', required: true },
      { key: 'panes', label: 'Pane count', unit: 'count', required: false },
    ],
    photoChecklist: PHOTO_CHECKLISTS['Security Film'],
    margin: {
      laborMarginPct: 77,
      // A 400% markup equals a 5x multiplier on supplier cost (cost × (1 + 400/100)).
      materialMarkupPct: 400,
      materialMarkupMax: 900,
      netWarnBelow: 15,
      note: 'Material markup often up to 10x; premium film higher',
    },
  },
  {
    key: 'windows',
    service: 'Windows',
    name: 'Windows — replacement',
    description: 'Glass replacement and window installation. Rough-opening measurements confirm glass sizing.',
    // PLACEHOLDER material list — replace with real supplier list
    materials: [
      { id: 'wm-glass', name: 'Replacement glass unit', unit: 'each', defaultQty: 1, placeholder: true },
      { id: 'wm-vinyl', name: 'Glazing vinyl', unit: 'ft', defaultQty: 10, placeholder: true },
      { id: 'wm-sealant', name: 'Sealant', unit: 'tube', defaultQty: 1, placeholder: true },
    ],
    labor: [{ id: 'wl-install', name: 'Window installation labour', defaultHours: 3, defaultTier: 'standard' }],
    measurements: [
      { key: 'width', label: 'Rough opening width', unit: 'in', required: true },
      { key: 'height', label: 'Rough opening height', unit: 'in', required: true },
      { key: 'count', label: 'Window count', unit: 'count', required: true },
    ],
    photoChecklist: PHOTO_CHECKLISTS.Windows,
    margin: {
      laborMarginPct: 46,
      materialMarkupPct: 15,
      netWarnBelow: 10,
      note: 'Standard replacement margin',
    },
  },
  {
    key: 'doors',
    service: 'Doors',
    name: 'Doors — repair / replacement',
    description: 'Door repair or replacement, including pre-hung slab installs. Confirm handing and configuration on site.',
    // PLACEHOLDER material list — replace with real supplier list
    materials: [
      { id: 'dm-slab', name: 'Pre-hung door slab', unit: 'each', defaultQty: 1, placeholder: true },
      { id: 'dm-shim', name: 'Shim & fastener kit', unit: 'each', defaultQty: 1, placeholder: true },
      { id: 'dm-weather', name: 'Weather stripping', unit: 'ft', defaultQty: 20, placeholder: true },
      { id: 'dm-lockset', name: 'Entry lockset', unit: 'each', defaultQty: 1, placeholder: true },
    ],
    labor: [{ id: 'dl-install', name: 'Door installation labour', defaultHours: 2.5, defaultTier: 'standard' }],
    measurements: [
      { key: 'width', label: 'Rough opening width', unit: 'in', required: true },
      { key: 'height', label: 'Rough opening height', unit: 'in', required: true },
      { key: 'doors', label: 'Door count', unit: 'count', required: true },
    ],
    photoChecklist: PHOTO_CHECKLISTS.Doors,
    margin: {
      laborMarginPct: 45,
      materialMarkupPct: 15,
      netWarnBelow: 8,
      note: 'Complex multi-unit commercial runs 8–15% net',
    },
  },
  {
    key: 'skincare',
    service: 'Skincare',
    name: 'Skincare / Med Spa — service call',
    description: 'Skincare treatment service call. Consumables are priced per treatment.',
    // PLACEHOLDER material list — replace with real supplier list
    materials: [
      { id: 'sm-consumables', name: 'Treatment consumables kit', unit: 'each', defaultQty: 1, placeholder: true },
      { id: 'sm-aftercare', name: 'Aftercare product', unit: 'each', defaultQty: 1, placeholder: true },
    ],
    labor: [{ id: 'sl-treatment', name: 'Treatment labour', defaultHours: 1, defaultTier: 'standard' }],
    measurements: [
      { key: 'sessions', label: 'Session count', unit: 'count', required: false },
    ],
    photoChecklist: PHOTO_CHECKLISTS.Skincare,
    margin: {
      laborMarginPct: 70,
      materialMarkupPct: 25,
      netWarnBelow: 20,
      note: 'Consumables priced per treatment',
    },
  },
];

/** Resolve a template from a job service value (key or label). Falls back to the first template. */
export function getTemplate(serviceValue: string): ServiceTemplate {
  const needle = (serviceValue ?? '').trim().toLowerCase();
  return SERVICE_TEMPLATES.find(t => t.key.toLowerCase() === needle || t.service.toLowerCase() === needle)
    ?? SERVICE_TEMPLATES[0];
}
