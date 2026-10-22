// Billdr-style SECTIONED estimate templates + deterministic draft builder.
//
// Scope (Lavie, 2026-10-21 — supersedes the four-service scope):
//   1. Security film — RESIDENTIAL ONLY for now.
//   2. Locksmith — residential + commercial: rekeys, lock changes, lock
//      repair (lock repair is newly in scope). Still excluded: cars, key
//      fobs, ignition, access control.
//   3. Doors — residential + commercial: replacements and repairs.
//
// Pricing behaviour (zero-cost, no new APIs):
//   - Catalog-first: each material line is resolved by the SAME deterministic
//     matcher the auto-estimate agent uses (app/lib/catalog-match.ts) against
//     the org's supplier_materials catalog (Home Depot Canada, Canadian Tire,
//     Amazon Canada, Walmart Canada prices seeded 2026-10-09).
//   - On a miss the line degrades to a flagged PLACEHOLDER (materialCost null)
//     for office review — a price is never invented. The builder UI offers
//     the existing live-lookup pattern (paste a homedepot.ca / amazon.ca URL
//     → POST /api/lookup-price) to fill it.
//   - Labour $ is derived ONLY from @yavamo/core tierRate via
//     laborUnitFromTier (priority $180/hr is the standard working tier per
//     the 2026-10-15 labour correction; emergency $220/hr is the
//     two-tech / complex / emergency tier).
//   - Markup defaults sit inside Lavie's confirmed margins:
//       locksmith labour 70–80% margin → 300% markup (≈75% margin)
//       locksmith hardware 35–50% margin → 65% markup (≈39% margin)
//       security film labour 70–85% margin → 300% markup; materials up to
//         10x → 400% markup (mirrors the existing film template)
//       doors labour 40–50% margin → 82% markup (≈45% margin)
//       doors materials 10–20% margin → 18% markup (≈15% margin)
//     Every default is office-editable per line; prep/cleanup lines use 25%.
//   - Lines the catalog genuinely lacks (edge sealant, replacement cylinder,
//     commercial door closer, key blanks) are explicit placeholders with a
//     review note — never silently priced.

import {
  laborUnitFromTier,
  type EstimateSection,
  type LaborTierKey,
  type SectionLine,
} from '@yavamo/core';
import { pickMaterial, type CatalogMaterial } from './catalog-match';

export interface SectionTemplateLine {
  id: string;
  task: string;
  quantity: number;
  unit: string;
  /** Catalog search label for the deterministic matcher; null = no catalog material. */
  matchLabel: string | null;
  /** Catalog service pool to match against; defaults to the template's service. */
  catalogService?: string;
  /** Known material cost for non-catalog lines (e.g. the $20 flat shipping line). */
  fixedMaterialCost?: number;
  laborHoursPerUnit: number;
  tierKey: LaborTierKey;
  markupPct: number;
  /** Deliberately unpriced — the office must source/price or delete the line. */
  placeholder?: boolean;
  placeholderNote?: string;
  note?: string;
}

export interface SectionTemplateSection {
  id: string;
  title: string;
  lines: SectionTemplateLine[];
}

export interface SectionTemplate {
  key: string;
  /** supplier_materials / estimate_templates service key ('doors' | 'security-film' | 'locksmith'). */
  service: string;
  serviceLabel: string;
  setting: 'residential' | 'commercial' | 'residential + commercial';
  name: string;
  description: string;
  sections: SectionTemplateSection[];
}

const SHIPPING_LINE: SectionTemplateLine = {
  id: 'shipping', task: 'Flat shipping', quantity: 1, unit: 'flat',
  matchLabel: null, fixedMaterialCost: 20, laborHoursPerUnit: 0,
  tierKey: 'priority', markupPct: 0,
  note: 'Yavamo flat shipping per estimate — matches the agent estimate flow.',
};
const CLEANUP_LINE: SectionTemplateLine = {
  id: 'cleanup', task: 'Cleanup & final inspection', quantity: 1, unit: 'each',
  matchLabel: null, laborHoursPerUnit: 0.5, tierKey: 'priority', markupPct: 25,
};

export const SECTION_TEMPLATES: SectionTemplate[] = [
  {
    key: 'security-film-residential',
    service: 'security-film',
    serviceLabel: 'Security Film',
    setting: 'residential',
    name: 'Security film — residential',
    description: 'Residential security film supply & install: site protection, film and install kit from catalog, flat shipping. Commercial film is out of scope for now.',
    sections: [
      {
        id: 'prep', title: 'Site prep', lines: [
          { id: 'sf-protect', task: 'Site protection during work', quantity: 1, unit: 'each', matchLabel: null, laborHoursPerUnit: 0.5, tierKey: 'priority', markupPct: 25 },
          { id: 'sf-glassprep', task: 'Glass cleaning & prep', quantity: 1, unit: 'each', matchLabel: null, laborHoursPerUnit: 0.5, tierKey: 'priority', markupPct: 25 },
        ],
      },
      {
        id: 'materials', title: 'Film & materials', lines: [
          { id: 'sf-film', task: 'Security film — supply', quantity: 1, unit: 'roll', matchLabel: 'Security film roll', laborHoursPerUnit: 0, tierKey: 'priority', markupPct: 400 },
          { id: 'sf-kit', task: 'Install kit (squeegee, solution)', quantity: 1, unit: 'each', matchLabel: 'Install kit (squeegee, solution)', laborHoursPerUnit: 0, tierKey: 'priority', markupPct: 400 },
          {
            id: 'sf-sealant', task: 'Edge sealant / attachment', quantity: 1, unit: 'tube', matchLabel: null,
            laborHoursPerUnit: 0, tierKey: 'priority', markupPct: 400, placeholder: true,
            placeholderNote: 'No edge sealant in the catalog — office to source and price; confirm whether this install needs sealant/attachment.',
          },
        ],
      },
      {
        id: 'install', title: 'Installation', lines: [
          { id: 'sf-install', task: 'Film installation labour', quantity: 1, unit: 'roll', matchLabel: null, laborHoursPerUnit: 1.5, tierKey: 'priority', markupPct: 300, note: 'Quantity follows the film rolls above — keep them in step.' },
        ],
      },
      { id: 'finishing', title: 'Finishing', lines: [CLEANUP_LINE, SHIPPING_LINE] },
    ],
  },
  {
    key: 'locksmith-rekey',
    service: 'locksmith',
    serviceLabel: 'Locksmith',
    setting: 'residential + commercial',
    name: 'Locksmith — rekey',
    description: 'Rekey existing locks (residential & commercial). Mechanical only — no cars, key fobs, ignition or access control.',
    sections: [
      {
        id: 'hardware', title: 'Hardware', lines: [
          { id: 'lk-rekey-kit', task: 'Rekey kit / pin kit', quantity: 1, unit: 'each', matchLabel: 'Rekey kit / pin kit', laborHoursPerUnit: 0, tierKey: 'priority', markupPct: 65 },
          { id: 'lk-deadbolt-opt', task: 'Replacement deadbolt (if required)', quantity: 1, unit: 'each', matchLabel: 'Deadbolt', laborHoursPerUnit: 0, tierKey: 'priority', markupPct: 65, note: 'Optional — delete when the existing deadbolt is rekeyed and reused.' },
        ],
      },
      {
        id: 'labour', title: 'Labour', lines: [
          { id: 'lk-rekey-labour', task: 'Rekey labour (per lock)', quantity: 2, unit: 'lock', matchLabel: null, laborHoursPerUnit: 0.5, tierKey: 'priority', markupPct: 300 },
        ],
      },
      {
        id: 'finishing', title: 'Finishing', lines: [
          {
            id: 'lk-keys', task: 'Key copies & handover', quantity: 1, unit: 'each', matchLabel: null,
            laborHoursPerUnit: 0, tierKey: 'priority', markupPct: 65, placeholder: true,
            placeholderNote: 'Key blanks/copies are not in the catalog — office to price per key.',
          },
          SHIPPING_LINE,
        ],
      },
    ],
  },
  {
    key: 'locksmith-lock-change',
    service: 'locksmith',
    serviceLabel: 'Locksmith',
    setting: 'residential + commercial',
    name: 'Locksmith — lock change',
    description: 'Replace lock hardware (residential & commercial). Mechanical only — no cars, key fobs, ignition or access control.',
    sections: [
      {
        id: 'hardware', title: 'Hardware', lines: [
          { id: 'lc-set', task: 'Deadbolt + knob/lever set', quantity: 1, unit: 'each', matchLabel: 'Deadbolt + knob/lever set', laborHoursPerUnit: 0, tierKey: 'priority', markupPct: 65 },
          { id: 'lc-strike', task: 'Strike plate / reinforcement', quantity: 1, unit: 'each', matchLabel: 'Strike plate / reinforcement', laborHoursPerUnit: 0, tierKey: 'priority', markupPct: 65 },
        ],
      },
      {
        id: 'labour', title: 'Labour', lines: [
          { id: 'lc-labour', task: 'Lock change labour', quantity: 1, unit: 'each', matchLabel: null, laborHoursPerUnit: 1, tierKey: 'priority', markupPct: 300 },
        ],
      },
      { id: 'finishing', title: 'Finishing', lines: [CLEANUP_LINE, SHIPPING_LINE] },
    ],
  },
  {
    key: 'locksmith-lock-repair',
    service: 'locksmith',
    serviceLabel: 'Locksmith',
    setting: 'residential + commercial',
    name: 'Locksmith — lock repair',
    description: 'Diagnose and repair a malfunctioning lock (residential & commercial) — new scope 2026-10-21. Mechanical only — no cars, key fobs, ignition or access control.',
    sections: [
      {
        id: 'repair', title: 'Diagnosis & repair', lines: [
          { id: 'lr-labour', task: 'Lock diagnosis & repair labour', quantity: 1, unit: 'each', matchLabel: null, laborHoursPerUnit: 1, tierKey: 'priority', markupPct: 300 },
          { id: 'lr-plate', task: 'Door / lock reinforcement plate', quantity: 1, unit: 'each', matchLabel: 'Reinforcement plate', laborHoursPerUnit: 0, tierKey: 'priority', markupPct: 65 },
          {
            id: 'lr-cylinder', task: 'Replacement cylinder (if required)', quantity: 1, unit: 'each', matchLabel: null,
            laborHoursPerUnit: 0, tierKey: 'priority', markupPct: 65, placeholder: true,
            placeholderNote: 'Cylinders are not in the catalog — office to source and price; confirm the keyway on site first.',
          },
        ],
      },
      { id: 'finishing', title: 'Finishing', lines: [CLEANUP_LINE, SHIPPING_LINE] },
    ],
  },
  {
    key: 'doors-replacement',
    service: 'doors',
    serviceLabel: 'Doors',
    setting: 'residential + commercial',
    name: 'Doors — replacement',
    description: 'Door replacement (residential & commercial): pre-hung/slab door with hinges and hardware set, weather stripping, entry lockset, installation labour and finishing.',
    sections: [
      {
        id: 'door-hardware', title: 'Door & hardware', lines: [
          { id: 'dr-slab', task: 'Door slab / pre-hung unit', quantity: 1, unit: 'each', matchLabel: 'Door slab', laborHoursPerUnit: 0, tierKey: 'priority', markupPct: 18 },
          { id: 'dr-hinges', task: 'Hinges + hardware set', quantity: 1, unit: 'each', matchLabel: 'Hinges + hardware set', laborHoursPerUnit: 0, tierKey: 'priority', markupPct: 18 },
          { id: 'dr-lockset', task: 'Entry lockset', quantity: 1, unit: 'each', matchLabel: 'Deadbolt + knob/lever set', catalogService: 'locksmith', laborHoursPerUnit: 0, tierKey: 'priority', markupPct: 18, note: 'Priced from the locksmith catalog pool.' },
          { id: 'dr-weather', task: 'Weather stripping & seal set', quantity: 1, unit: 'each', matchLabel: 'Weather stripping', laborHoursPerUnit: 0, tierKey: 'priority', markupPct: 18 },
        ],
      },
      {
        id: 'install', title: 'Installation', lines: [
          { id: 'dr-install', task: 'Door installation labour', quantity: 1, unit: 'each', matchLabel: null, laborHoursPerUnit: 2.5, tierKey: 'priority', markupPct: 82 },
          {
            id: 'dr-closer', task: 'Door closer — commercial (if required)', quantity: 1, unit: 'each', matchLabel: null,
            laborHoursPerUnit: 0, tierKey: 'priority', markupPct: 18, placeholder: true,
            placeholderNote: 'Commercial door closers are not in the catalog — office to source and price; delete for residential jobs.',
          },
        ],
      },
      { id: 'finishing', title: 'Finishing', lines: [CLEANUP_LINE, SHIPPING_LINE] },
    ],
  },
  {
    key: 'doors-repair',
    service: 'doors',
    serviceLabel: 'Doors',
    setting: 'residential + commercial',
    name: 'Doors — repair',
    description: 'Door repair (residential & commercial): alignment, planing and hardware adjustment labour, replacement hinges, weather stripping and threshold from catalog.',
    sections: [
      {
        id: 'repair', title: 'Diagnosis & repair', lines: [
          { id: 'dp-labour', task: 'Door repair labour (alignment, planing, hardware adjust)', quantity: 1, unit: 'each', matchLabel: null, laborHoursPerUnit: 1.5, tierKey: 'priority', markupPct: 82 },
          { id: 'dp-hinges', task: 'Hinges (replacement set)', quantity: 1, unit: 'each', matchLabel: 'Hinges + hardware set', laborHoursPerUnit: 0, tierKey: 'priority', markupPct: 18 },
          { id: 'dp-weather', task: 'Weather stripping / door sweep', quantity: 1, unit: 'each', matchLabel: 'Weather stripping', laborHoursPerUnit: 0, tierKey: 'priority', markupPct: 18 },
          { id: 'dp-threshold', task: 'Threshold (if required)', quantity: 1, unit: 'each', matchLabel: 'Threshold replacement', laborHoursPerUnit: 0, tierKey: 'priority', markupPct: 18 },
        ],
      },
      { id: 'finishing', title: 'Finishing', lines: [CLEANUP_LINE, SHIPPING_LINE] },
    ],
  },
];

export function getSectionTemplate(key: string): SectionTemplate {
  return SECTION_TEMPLATES.find(t => t.key === key) ?? SECTION_TEMPLATES[0];
}

// ---- Draft generation --------------------------------------------------------

export interface DraftTraceItem { label: string; detail: string; ok: boolean }
export interface DraftTracePhase { id: string; label: string; ms: number; items: DraftTraceItem[] }

export interface SectionDraft {
  template: SectionTemplate;
  sections: EstimateSection[];
  flags: string[];
  trace: DraftTracePhase[];
  catalogSize: number;
}

/**
 * Build a sectioned draft from a template + the org catalog + job text.
 * Pure and deterministic apart from the phase timings in the trace.
 * Every AI/draft line stays behind the office review gate — this only
 * produces the draft; nothing is saved or sent here.
 */
export function buildSectionDraft(opts: {
  template: SectionTemplate;
  catalogByService: Record<string, CatalogMaterial[]>;
  jobText: string;
  jobLabel?: string;
}): SectionDraft {
  const { template } = opts;
  const flags: string[] = [];
  const matchItems: DraftTraceItem[] = [];
  const lookupItems: DraftTraceItem[] = [];

  const t0 = Date.now();
  const contextItems: DraftTraceItem[] = [
    { label: 'Job description', detail: opts.jobLabel || 'Free-text description provided', ok: true },
    { label: 'Account template', detail: `${template.name} (${template.setting})`, ok: true },
    {
      label: 'Catalog loaded',
      detail: `${Object.values(opts.catalogByService).reduce((s, c) => s + c.length, 0)} products — Home Depot Canada · Canadian Tire · Amazon Canada · Walmart Canada`,
      ok: true,
    },
  ];
  const contextMs = Date.now() - t0;

  const t1 = Date.now();
  const sections: EstimateSection[] = template.sections.map(sec => ({
    id: sec.id,
    title: sec.title,
    lines: sec.lines.map((tl): SectionLine => {
      const base: SectionLine = {
        id: tl.id,
        task: tl.task,
        quantity: tl.quantity,
        unit: tl.unit,
        materialCost: null,
        laborUnit: laborUnitFromTier(tl.tierKey, tl.laborHoursPerUnit),
        laborHoursPerUnit: tl.laborHoursPerUnit,
        tierKey: tl.tierKey,
        markupPct: tl.markupPct,
        source: 'manual',
        sourceNote: '',
        needsReview: false,
        note: tl.note,
      };
      if (tl.placeholder) {
        return {
          ...base, source: 'placeholder', needsReview: true,
          reviewNote: tl.placeholderNote || 'Placeholder line — office to price or remove.',
        };
      }
      if (tl.fixedMaterialCost != null) {
        return { ...base, materialCost: tl.fixedMaterialCost, source: 'manual', sourceNote: tl.note || 'Fixed Yavamo rate.' };
      }
      if (!tl.matchLabel) {
        // Labour-only / no-material line: material cost is genuinely $0.
        return { ...base, materialCost: 0, source: 'manual', sourceNote: 'Labour only — no material.' };
      }
      const pool = opts.catalogByService[tl.catalogService || template.service] || [];
      const pick = pickMaterial({ jobText: opts.jobText, lineLabel: tl.matchLabel, templateQty: tl.quantity, candidates: pool });
      const material = pick?.material_id ? pool.find(m => m.id === pick.material_id) || null : null;
      if (!material) {
        flags.push(`"${tl.task}": no catalog product matched — office pick or price lookup required.`);
        lookupItems.push({ label: tl.task, detail: 'No catalog match — flagged for Home Depot Canada / Amazon Canada lookup or manual entry.', ok: false });
        return {
          ...base, source: 'placeholder', needsReview: true,
          reviewNote: 'No catalog product matched — use price lookup (Home Depot Canada / Amazon Canada) or enter a price manually.',
        };
      }
      const cost = material.public_price_cents / 100;
      const verify = material.notes != null && /verify/i.test(material.notes);
      if (verify) flags.push(`"${tl.task}": "${material.name}" is flagged VERIFY in the catalog — confirm before ordering.`);
      matchItems.push({
        label: tl.task,
        detail: `${material.name} — ${material.retailer || 'catalog'} · $${cost.toFixed(2)}`,
        ok: true,
      });
      return {
        ...base,
        quantity: pick?.quantity ?? tl.quantity,
        unit: material.unit || tl.unit,
        materialCost: cost,
        source: 'catalog',
        sourceNote: `${material.retailer || 'Catalog'} — ${material.name}`,
        needsReview: verify,
        reviewNote: verify ? 'Catalog product is flagged VERIFY — confirm price and suitability before ordering.' : undefined,
      };
    }),
  }));
  const matchMs = Date.now() - t1;

  const trace: DraftTracePhase[] = [
    { id: 'context', label: 'Gathering context', ms: contextMs, items: contextItems },
    {
      id: 'lookup', label: 'Looking things up', ms: matchMs,
      items: [
        ...matchItems,
        ...lookupItems,
        { label: 'Quote summary', detail: 'Draft assembled — every line stays DRAFT behind the office review gate.', ok: true },
      ],
    },
  ];

  return {
    template,
    sections,
    flags,
    trace,
    catalogSize: Object.values(opts.catalogByService).reduce((s, c) => s + c.length, 0),
  };
}
