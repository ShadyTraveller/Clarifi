'use client';
import { useMemo, useState } from 'react';
import { supabase } from '../../lib_supabase';
import { AsyncButton, Icon, Modal, money } from '../../ui';
import { serviceLabel, squareFeet } from '../../lib/domain';
import { getTemplate, LABOR_TIERS, type LaborTierKey, type ServiceTemplate } from '../../lib/service-templates';
import { buildEstimate, customerProjection, type ClientEstimate, type PricedLaborLine, type PricedMaterialLine } from '../../lib/estimate';
import { assistant } from '../../Composers';

interface MaterialRow { id: string; name: string; quantity: number; unit: string; supplierCost: number | null; markupPct: number }
interface LaborRow { id: string; name: string; hours: number; tierKey: LaborTierKey }

function defaultDeposit(relationship?: string): number {
  if (relationship === 'property_management' || relationship === 'commercial') return 25;
  if (relationship === 'tenant') return 100;
  return 50;
}

function materialRowsFor(t: ServiceTemplate): MaterialRow[] {
  return t.materials.map(m => ({ id: m.id, name: m.name, quantity: m.defaultQty, unit: m.unit, supplierCost: null, markupPct: t.margin.materialMarkupPct }));
}

function laborRowsFor(t: ServiceTemplate): LaborRow[] {
  return t.labor.map(l => ({ id: l.id, name: l.name, hours: l.defaultHours, tierKey: l.defaultTier }));
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

const inputCls = 'w-full min-h-[44px] rounded-xl border border-neutral-300 bg-white px-3 py-2 text-[15px] text-[#101311] focus:outline-none focus:ring-2 focus:ring-[#FFD60A]';
const labelCls = 'block text-sm font-medium text-[#101311]';
const badgeCls = 'ml-2 inline-block rounded-full bg-[#101311] px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-widest text-white';

function tierLabel(key: LaborTierKey): string {
  return LABOR_TIERS.find(t => t.key === key)?.label ?? key;
}

/** Client preview renders ONLY from the customer projection — never from the full EstimateResult. */
function ClientPreview({ projection, showQty, groupByCategory, validDays }: { projection: ClientEstimate; showQty: boolean; groupByCategory: boolean; validDays: number }) {
  // Runtime assertion: no internal pricing fields may reach the client view.
  const probe = JSON.stringify(projection);
  if (/supplierCost|lineCost|totalCost|marginPct|markupPct/.test(probe)) {
    throw new Error('Internal pricing data reached the client preview.');
  }
  const materialRows = projection.materials.map(m => ({ kind: 'Material', name: m.name, qty: m.quantity, unit: m.unit, unitPrice: m.unitPrice, lineTotal: m.lineTotal }));
  const laborRows = projection.labor.map(l => ({ kind: 'Labor', name: l.name, qty: l.hours, unit: 'hr', unitPrice: l.unitPrice, lineTotal: l.lineTotal }));
  const groups = groupByCategory
    ? [{ title: 'Materials', rows: materialRows }, { title: 'Labor', rows: laborRows }]
    : [{ title: 'Estimate', rows: [...materialRows, ...laborRows] }];
  return (
    <section aria-label="Client preview" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
      <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">Client preview</p>
      <h3 className="mt-1 text-lg font-semibold">Estimate</h3>
      {groups.map(g => g.rows.length > 0 && (
        <div key={g.title} className="mt-4">
          {groupByCategory && <h4 className="text-sm font-semibold">{g.title}</h4>}
          <table className="mt-1 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
                <th scope="col" className="py-2 pr-2">Item</th>
                {showQty && <th scope="col" className="py-2 pr-2 text-right">Qty</th>}
                <th scope="col" className="py-2 pr-2 text-right">Unit price</th>
                <th scope="col" className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map(r => (
                <tr key={`${r.kind}-${r.name}`} className="border-t border-neutral-100">
                  <td className="py-2 pr-2 font-medium">{r.name}</td>
                  {showQty && <td className="py-2 pr-2 text-right tabular-nums">{r.qty} {r.unit}</td>}
                  <td className="py-2 pr-2 text-right tabular-nums">{money(r.unitPrice)}</td>
                  <td className="py-2 text-right tabular-nums">{money(r.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <dl className="mt-4 space-y-1 border-t border-neutral-200 pt-3 text-sm">
        <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{money(projection.subtotal ?? 0)}</dd></div>
        <div className="flex justify-between"><dt>Tax ({projection.taxPct}%)</dt><dd className="tabular-nums">{money(projection.tax ?? 0)}</dd></div>
        <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(projection.total ?? 0)}</dd></div>
        <div className="flex justify-between"><dt>Deposit due ({projection.depositPct}%)</dt><dd className="tabular-nums">{money(projection.deposit ?? 0)}</dd></div>
      </dl>
      <p className="mt-3 text-xs text-neutral-500">This estimate is valid for {validDays} days.</p>
      {!projection.complete && <p className="mt-2 text-xs text-neutral-500">Draft preview — some lines are still being priced.</p>}
    </section>
  );
}

export default function EstimateBuilder({ jobs, initialJobId = '', onClose, onSaved }: {
  jobs: any[];
  initialJobId?: string;
  onClose: () => void;
  onSaved: (quoteId: string) => Promise<void>;
}) {
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const openJobs = safeJobs.filter(j => j && j.status !== 'closed' && j.status !== 'cancelled');
  const [jobId, setJobId] = useState(initialJobId || openJobs[0]?.id || '');
  const job = safeJobs.find(j => j?.id === jobId);
  const [template, setTemplate] = useState<ServiceTemplate>(() => getTemplate(serviceLabel(job?.service ?? '')));
  const [materials, setMaterials] = useState<MaterialRow[]>(() => materialRowsFor(getTemplate(serviceLabel(job?.service ?? ''))));
  const [labor, setLabor] = useState<LaborRow[]>(() => laborRowsFor(getTemplate(serviceLabel(job?.service ?? ''))));
  const [laborMarginPct, setLaborMarginPct] = useState(() => getTemplate(serviceLabel(job?.service ?? '')).margin.laborMarginPct);
  const [taxPct, setTaxPct] = useState(13);
  const [depositPct, setDepositPct] = useState(() => defaultDeposit(job?.clients?.relationship ?? job?.client?.relationship));
  const [validDays, setValidDays] = useState(14);
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [showQty, setShowQty] = useState(true);
  const [groupByCategory, setGroupByCategory] = useState(true);
  const [showCosts, setShowCosts] = useState(true);
  const [showMarkup, setShowMarkup] = useState(true);
  const [mode, setMode] = useState<'office' | 'client'>('office');
  const [scope, setScope] = useState('');
  const [scopeNote, setScopeNote] = useState('');
  const [lookupId, setLookupId] = useState<string | null>(null);
  const [lookupUrl, setLookupUrl] = useState('');
  const [lookupNote, setLookupNote] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [saveError, setSaveError] = useState('');
  const [savedQuoteId, setSavedQuoteId] = useState<string | null>(null);

  function changeJob(nextId: string) {
    setJobId(nextId);
    const nextJob = safeJobs.find(j => j?.id === nextId);
    const t = getTemplate(serviceLabel(nextJob?.service ?? ''));
    setTemplate(t);
    setMaterials(materialRowsFor(t));
    setLabor(laborRowsFor(t));
    setLaborMarginPct(t.margin.laborMarginPct);
    setDepositPct(defaultDeposit(nextJob?.clients?.relationship ?? nextJob?.client?.relationship));
    setMeasurements({});
    setLookupId(null);
    setLookupNote('');
    setErrors([]);
    setSaveError('');
  }

  const result = useMemo(() => buildEstimate({
    template,
    materials: materials.map(m => ({ id: m.id, name: m.name, quantity: m.quantity, unit: m.unit, supplierCost: m.supplierCost, markupPct: m.markupPct })),
    labor: labor.map(l => ({ id: l.id, name: l.name, hours: l.hours, tierKey: l.tierKey })),
    laborMarginPct,
    taxPct,
    depositPct,
  }), [template, materials, labor, laborMarginPct, taxPct, depositPct]);

  const projection = useMemo(() => customerProjection(result), [result]);

  const derivedSqft = useMemo(() => {
    const w = Number(measurements.width), h = Number(measurements.height);
    const c = Number(measurements.panes ?? measurements.count ?? measurements.doors ?? 1);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return squareFeet(w, h, Number.isFinite(c) && c > 0 ? c : 1);
  }, [measurements]);

  function updateMaterial(id: string, patch: Partial<MaterialRow>) {
    setMaterials(ms => ms.map(m => m.id === id ? { ...m, ...patch } : m));
  }
  function updateLabor(id: string, patch: Partial<LaborRow>) {
    setLabor(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l));
  }
  function addMaterial() {
    const id = uid('m');
    setMaterials(ms => [...ms, { id, name: '', quantity: 1, unit: 'each', supplierCost: null, markupPct: template.margin.materialMarkupPct }]);
  }
  function addLabor() {
    const id = uid('l');
    setLabor(ls => [...ls, { id, name: '', hours: 1, tierKey: 'standard' }]);
  }

  async function verifyLookup(row: MaterialRow) {
    setLookupNote('');
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error('Sign in to continue.');
      const response = await fetch('/api/lookup-price', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ url: lookupUrl }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Lookup failed.');
      if (body.cost != null && Number.isFinite(Number(body.cost)) && Number(body.cost) > 0) {
        updateMaterial(row.id, { supplierCost: Number(body.cost) });
        setLookupNote(`Verified supplier price: ${money(body.cost)}. Confirm it matches the item, then save.`);
      } else {
        setLookupNote(body.note || "Couldn't verify a price — enter it manually.");
      }
    } catch {
      setLookupNote("Couldn't verify a price — enter it manually.");
    }
  }

  async function generateScope() {
    setScopeNote('');
    try {
      const result = await assistant({ action: 'estimate', job_id: jobId, text: scope.trim() || template.description });
      // Only the scope text is used — line prices are never taken from the AI draft.
      if (result?.scope) {
        setScope(String(result.scope));
      } else {
        setScopeNote('No scope text was returned — describe the work manually.');
      }
    } catch {
      setScopeNote('Could not generate a scope draft — describe the work manually.');
    }
  }

  function validate(): string[] {
    const errs: string[] = [];
    if (!jobId) errs.push('Choose a job first.');
    materials.forEach((m, i) => {
      const label = m.name.trim() || `Material row ${i + 1}`;
      if (!m.name.trim()) errs.push(`Material row ${i + 1}: enter an item name.`);
      if (!(m.quantity > 0)) errs.push(`"${label}": quantity must be greater than 0.`);
      if (!(m.supplierCost != null && m.supplierCost > 0)) errs.push(`"${label}": enter a supplier price.`);
    });
    labor.forEach((l, i) => {
      const label = l.name.trim() || `Labor row ${i + 1}`;
      if (!l.name.trim()) errs.push(`Labor row ${i + 1}: enter a description.`);
      if (!(l.hours > 0)) errs.push(`"${label}": hours must be greater than 0.`);
    });
    if (scope.trim().length < 3) errs.push('Add a scope description (or generate one with AI and review it).');
    if (!result.complete) errs.push('Every line needs a valid price before saving.');
    return errs;
  }

  async function save() {
    const errs = validate();
    setErrors(errs);
    setSaveError('');
    if (errs.length > 0) return;
    try {
      // RPC payload — cost mapping:
      //   material lines: cost = supplier cost per unit, price = client unit price
      //   labor lines:    cost = tier hourly rate,            price = client hourly rate
      // The RPC stores numbers only; margin math stays in this app.
      const lines = [
        ...result.materials.map(m => ({ name: m.name, quantity: m.quantity, unit: m.unit, cost: m.supplierCost ?? 0, price: m.unitPrice ?? 0, source: 'office-template' })),
        ...result.labor.map(l => ({ name: l.name, quantity: l.hours, unit: 'hr', cost: l.tierRate, price: l.unitPrice, source: 'office-template' })),
      ];
      const { data, error } = await supabase.rpc('save_clarifi_estimate', {
        target_job: jobId,
        scope_text: scope.trim(),
        lines,
        tax_pct: taxPct,
        deposit_pct: depositPct,
        valid_days: validDays,
      });
      if (error) throw error;
      await onSaved(data as string);
      setSavedQuoteId(data as string);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Unable to save this estimate.');
    }
  }

  const netOk = result.netMarginPct != null && result.netMarginPct >= template.margin.netWarnBelow;

  function priceCell(m: PricedMaterialLine) {
    return (
      <td className="py-2 text-right tabular-nums">
        <span className={m.unitPrice == null ? 'text-neutral-400' : 'font-medium'}>{m.unitPrice == null ? '—' : money(m.unitPrice)}</span>
        {m.marginPct != null && <span className="block text-[11px] text-neutral-500">{m.marginPct}% margin</span>}
      </td>
    );
  }

  return (
    <Modal title="Build estimate" onClose={onClose}>
      <div className="bg-[#FAFAF7] px-4 py-4 text-[#101311] sm:px-6 sm:py-6">
        {savedQuoteId ? (
          <div className="mx-auto max-w-lg rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#FFD60A] text-[#101311]"><Icon name="check" /></span>
            <h3 className="mt-3 text-lg font-semibold">Estimate saved as DRAFT</h3>
            <p className="mt-2 text-sm text-neutral-700">
              Office review is required before an approval link can be created. Review this estimate in the job detail Review stage —
              this builder never creates approval links itself.
            </p>
            <div className="mt-6 flex justify-end">
              <button type="button" onClick={onClose} className="min-h-[44px] rounded-xl bg-[#101311] px-5 font-medium text-white">Done</button>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            {/* LEFT: editor */}
            <div className="space-y-6">
              <section aria-label="Job" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                <label htmlFor="est-job" className={labelCls}>Job</label>
                <select id="est-job" value={jobId} onChange={e => changeJob(e.target.value)} className={`${inputCls} mt-1`}>
                  <option value="">Choose a job…</option>
                  {openJobs.map(j => (
                    <option key={j.id} value={j.id}>{j.title || j.id} · {serviceLabel(j.service)}</option>
                  ))}
                </select>
                <div className="mt-4 rounded-xl bg-[#FAFAF7] p-4 ring-1 ring-neutral-200">
                  <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">Template</p>
                  <h3 className="mt-1 font-semibold">{template.name}</h3>
                  <p className="mt-1 text-sm text-neutral-700">{template.description}</p>
                  <p className="mt-2 text-xs text-neutral-500">{template.margin.note}</p>
                </div>
              </section>

              {template.measurements.length > 0 && (
                <fieldset className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                  <legend className="px-2 text-sm font-semibold">Measurements</legend>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {template.measurements.map(m => (
                      <div key={m.key}>
                        <label htmlFor={`est-m-${m.key}`} className={labelCls}>
                          {m.label} <span className="font-normal text-neutral-500">({m.unit}){m.required ? ' *' : ''}</span>
                        </label>
                        <input id={`est-m-${m.key}`} type="number" min="0" step="any" inputMode="decimal" value={measurements[m.key] ?? ''} onChange={e => setMeasurements(ms => ({ ...ms, [m.key]: e.target.value }))} className={`${inputCls} mt-1`} />
                      </div>
                    ))}
                  </div>
                  {derivedSqft != null && (
                    <p className="mt-3 text-sm text-neutral-700">
                      Area: <strong>{derivedSqft.toFixed(1)} sq ft</strong>
                      {materials.some(r => r.unit === 'sq ft') && (
                        <button
                          type="button"
                          onClick={() => {
                            const target = materials.find(r => r.unit === 'sq ft');
                            if (target) updateMaterial(target.id, { quantity: Math.round(derivedSqft * 10) / 10 });
                          }}
                          className="ml-3 min-h-[44px] rounded-xl bg-[#FFD60A] px-4 font-medium text-[#101311]"
                        >
                          Apply to film quantity
                        </button>
                      )}
                    </p>
                  )}
                </fieldset>
              )}

              <fieldset className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                <legend className="px-2 text-sm font-semibold">Labor</legend>
                <div className="space-y-4">
                  {labor.map(l => (
                    <div key={l.id} className="grid gap-3 rounded-xl bg-[#FAFAF7] p-3 ring-1 ring-neutral-200 sm:grid-cols-[1fr_96px_1fr_auto]">
                      <div>
                        <label htmlFor={`est-l-name-${l.id}`} className={labelCls}>Description</label>
                        <input id={`est-l-name-${l.id}`} value={l.name} onChange={e => updateLabor(l.id, { name: e.target.value })} className={`${inputCls} mt-1`} />
                      </div>
                      <div>
                        <label htmlFor={`est-l-hours-${l.id}`} className={labelCls}>Hours</label>
                        <input id={`est-l-hours-${l.id}`} type="number" min="0" step="0.25" inputMode="decimal" value={l.hours} onChange={e => updateLabor(l.id, { hours: Number(e.target.value) })} className={`${inputCls} mt-1`} />
                      </div>
                      <div>
                        <label htmlFor={`est-l-tier-${l.id}`} className={labelCls}>Tier</label>
                        <select id={`est-l-tier-${l.id}`} value={l.tierKey} onChange={e => updateLabor(l.id, { tierKey: e.target.value as LaborTierKey })} className={`${inputCls} mt-1`}>
                          {LABOR_TIERS.map(t => <option key={t.key} value={t.key}>{t.label} — ${t.rate}/hr</option>)}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <button type="button" aria-label={`Remove ${l.name || 'labor line'}`} onClick={() => setLabor(ls => ls.filter(x => x.id !== l.id))} className="min-h-[44px] min-w-[44px] rounded-xl ring-1 ring-neutral-300"><Icon name="minus" /></button>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={addLabor} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 font-medium ring-1 ring-neutral-300"><Icon name="plus" /> Add labor line</button>
                </div>
                <div className="mt-4">
                  <label htmlFor="est-labor-margin" className={labelCls}>Labor margin % <span className="font-normal text-neutral-500">(default {template.margin.laborMarginPct}%)</span></label>
                  <input id="est-labor-margin" type="number" min="0" max="95" step="1" value={laborMarginPct} onChange={e => setLaborMarginPct(Number(e.target.value))} className={`${inputCls} mt-1 max-w-[160px]`} />
                </div>
              </fieldset>

              <fieldset className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                <legend className="px-2 text-sm font-semibold">Materials</legend>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
                        <th scope="col" className="py-2 pr-2">Item</th>
                        <th scope="col" className="py-2 pr-2 text-right">Qty</th>
                        {showCosts && <th scope="col" className="py-2 pr-2 text-right">Supplier cost<span className={badgeCls}>Internal</span></th>}
                        {showMarkup && <th scope="col" className="py-2 pr-2 text-right">Markup %<span className={badgeCls}>Internal</span></th>}
                        <th scope="col" className="py-2 pr-2 text-right">Client price</th>
                        <th scope="col" className="py-2 text-right">Total</th>
                        <th scope="col"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {materials.map((m, i) => {
                        const priced: PricedMaterialLine | undefined = result.materials[i];
                        const q = encodeURIComponent(m.name || 'product');
                        return (
                          <tr key={m.id} className="border-t border-neutral-100 align-top">
                            <td className="py-2 pr-2">
                              <label htmlFor={`est-m-name-${m.id}`} className="sr-only">Item name</label>
                              <input id={`est-m-name-${m.id}`} value={m.name} onChange={e => updateMaterial(m.id, { name: e.target.value })} className={`${inputCls} min-w-[160px]`} />
                              {m.name && (
                                <button
                                  type="button"
                                  onClick={() => { setLookupId(lookupId === m.id ? null : m.id); setLookupUrl(''); setLookupNote(''); }}
                                  aria-expanded={lookupId === m.id}
                                  className="mt-1 inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-neutral-700 ring-1 ring-neutral-300"
                                >
                                  <Icon name="search" /> Look up price
                                </button>
                              )}
                              {lookupId === m.id && (
                                <div className="mt-2 rounded-xl bg-[#FAFAF7] p-3 ring-1 ring-neutral-200">
                                  <p className="text-xs font-semibold">Check supplier price</p>
                                  <div className="mt-1 flex flex-wrap gap-2 text-sm">
                                    <a href={`https://www.homedepot.ca/search?q=${q}`} target="_blank" rel="noopener" className="min-h-[44px] inline-flex items-center rounded-lg bg-[#FFD60A] px-3 font-medium text-[#101311]">Home Depot Canada</a>
                                    <a href={`https://www.amazon.ca/s?k=${q}`} target="_blank" rel="noopener" className="min-h-[44px] inline-flex items-center rounded-lg bg-[#FFD60A] px-3 font-medium text-[#101311]">Amazon Canada</a>
                                  </div>
                                  <label htmlFor={`est-lookup-${m.id}`} className="mt-2 block text-xs font-medium">Paste product URL</label>
                                  <div className="mt-1 flex gap-2">
                                    <input id={`est-lookup-${m.id}`} value={lookupUrl} onChange={e => setLookupUrl(e.target.value)} placeholder="https://www.homedepot.ca/…" inputMode="url" className={inputCls} />
                                    <AsyncButton className="min-h-[44px] shrink-0 rounded-xl bg-[#101311] px-4 font-medium text-white" onClick={() => verifyLookup(m)}>Verify &amp; fill</AsyncButton>
                                  </div>
                                  {lookupNote && <p aria-live="polite" className="mt-1 text-xs text-neutral-700">{lookupNote}</p>}
                                </div>
                              )}
                            </td>
                            <td className="py-2 pr-2">
                              <label htmlFor={`est-m-qty-${m.id}`} className="sr-only">Quantity</label>
                              <input id={`est-m-qty-${m.id}`} type="number" min="0" step="any" inputMode="decimal" value={m.quantity} onChange={e => updateMaterial(m.id, { quantity: Number(e.target.value) })} className={`${inputCls} w-24 text-right`} />
                              <span className="block text-[11px] text-neutral-500">{m.unit}</span>
                            </td>
                            {showCosts && (
                              <td className="py-2 pr-2">
                                <label htmlFor={`est-m-cost-${m.id}`} className="sr-only">Supplier cost (internal)</label>
                                <input id={`est-m-cost-${m.id}`} type="number" min="0" step="0.01" inputMode="decimal" value={m.supplierCost ?? ''} onChange={e => updateMaterial(m.id, { supplierCost: e.target.value === '' ? null : Number(e.target.value) })} placeholder="0.00" className={`${inputCls} w-28 text-right`} />
                              </td>
                            )}
                            {showMarkup && (
                              <td className="py-2 pr-2">
                                <label htmlFor={`est-m-markup-${m.id}`} className="sr-only">Markup percent (internal)</label>
                                <input id={`est-m-markup-${m.id}`} type="number" min="0" step="1" inputMode="decimal" value={m.markupPct} onChange={e => updateMaterial(m.id, { markupPct: Number(e.target.value) })} className={`${inputCls} w-24 text-right`} />
                              </td>
                            )}
                            {priced ? priceCell(priced) : <td className="py-2 text-right text-neutral-400">—</td>}
                            <td className="py-2 text-right font-medium tabular-nums">{priced?.lineTotal == null ? '—' : money(priced.lineTotal)}</td>
                            <td className="py-2 pl-2">
                              <button type="button" aria-label={`Remove ${m.name || 'material line'}`} onClick={() => setMaterials(ms => ms.filter(x => x.id !== m.id))} className="min-h-[44px] min-w-[44px] rounded-xl ring-1 ring-neutral-300"><Icon name="minus" /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <button type="button" onClick={addMaterial} className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 font-medium ring-1 ring-neutral-300"><Icon name="plus" /> Add material line</button>
                <p className="mt-2 text-xs text-neutral-500">Material list is a placeholder — the office replaces it with the real supplier list.</p>
              </fieldset>

              <section aria-label="Scope" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                <label htmlFor="est-scope" className={labelCls}>Scope description</label>
                <textarea id="est-scope" value={scope} onChange={e => setScope(e.target.value)} rows={4} className={`${inputCls} mt-1`} placeholder="Describe the work the client is approving…" />
                <div className="mt-2 flex items-center gap-3">
                  <AsyncButton className="min-h-[44px] rounded-xl px-4 font-medium ring-1 ring-neutral-300" onClick={generateScope}>Generate with AI</AsyncButton>
                  {scopeNote && <p className="text-xs text-neutral-600">{scopeNote}</p>}
                </div>
              </section>

              <fieldset className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                <legend className="px-2 text-sm font-semibold">Tax, deposit &amp; validity</legend>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="est-tax" className={labelCls}>Tax %</label>
                    <input id="est-tax" type="number" min="0" step="0.01" value={taxPct} onChange={e => setTaxPct(Number(e.target.value))} className={`${inputCls} mt-1`} />
                  </div>
                  <div>
                    <label htmlFor="est-deposit" className={labelCls}>Deposit %</label>
                    <input id="est-deposit" type="number" min="0" max="100" step="1" value={depositPct} onChange={e => setDepositPct(Number(e.target.value))} className={`${inputCls} mt-1`} />
                  </div>
                  <div>
                    <label htmlFor="est-days" className={labelCls}>Valid days</label>
                    <input id="est-days" type="number" min="1" step="1" value={validDays} onChange={e => setValidDays(Number(e.target.value))} className={`${inputCls} mt-1`} />
                  </div>
                </div>
              </fieldset>
            </div>

            {/* RIGHT: office panel */}
            <aside className="space-y-6 lg:sticky lg:top-4 lg:self-start">
              <fieldset className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                <legend className="px-2 text-sm font-semibold">Display options</legend>
                <div role="group" aria-label="View mode" className="grid grid-cols-2 gap-1 rounded-xl bg-[#FAFAF7] p-1 ring-1 ring-neutral-200">
                  {(['office', 'client'] as const).map(v => (
                    <button key={v} type="button" aria-pressed={mode === v} onClick={() => setMode(v)}
                      className={`min-h-[44px] rounded-lg text-sm font-medium ${mode === v ? 'bg-[#101311] text-white' : 'text-neutral-700'}`}>
                      {v === 'office' ? 'Office view' : 'Client preview'}
                    </button>
                  ))}
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  {[
                    ['Show quantities', showQty, setShowQty],
                    ['Group by category', groupByCategory, setGroupByCategory],
                    ['Show supplier costs (internal only)', showCosts, setShowCosts],
                    ['Show markup (internal only)', showMarkup, setShowMarkup],
                  ].map(([label, value, setter]) => (
                    <label key={label as string} className="flex min-h-[44px] cursor-pointer items-center gap-3">
                      <input type="checkbox" checked={value as boolean} onChange={e => (setter as (b: boolean) => void)(e.target.checked)} className="h-5 w-5 accent-[#101311]" />
                      {label as string}
                    </label>
                  ))}
                </div>
              </fieldset>

              {mode === 'client' ? (
                <ClientPreview projection={projection} showQty={showQty} groupByCategory={groupByCategory} validDays={validDays} />
              ) : (
                <section aria-label="Margin check" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                  <h3 className="text-sm font-semibold">Margin check</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {result.materials.map(m => (
                      <li key={m.id} className="flex justify-between gap-2">
                        <span className="truncate">{m.name}</span>
                        <span className="tabular-nums text-neutral-600">{m.marginPct == null ? '—' : `${m.marginPct}%`}</span>
                      </li>
                    ))}
                    {result.labor.map((l: PricedLaborLine) => (
                      <li key={l.id} className="flex justify-between gap-2">
                        <span className="truncate">{l.name} ({tierLabel(l.tierKey)})</span>
                        <span className="tabular-nums text-neutral-600">{l.marginPct}%</span>
                      </li>
                    ))}
                  </ul>
                  <div className={`mt-3 flex items-start gap-2 rounded-xl p-3 text-sm ${netOk ? 'bg-neutral-100' : 'bg-red-50 ring-1 ring-red-200'}`}>
                    <span className={netOk ? 'text-neutral-600' : 'text-red-700'}><Icon name={netOk ? 'check' : 'close'} /></span>
                    <p>
                      Net margin <strong className="tabular-nums">{result.netMarginPct == null ? '—' : `${result.netMarginPct}%`}</strong>
                      {' '}vs guardrail {template.margin.netWarnBelow}%.
                      {!netOk && result.netMarginPct != null && ' Below the guardrail — adjust pricing before sending.'}
                    </p>
                  </div>
                  {result.warnings.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {result.warnings.map((w, i) => {
                        const critical = w.startsWith('Net margin');
                        return (
                          <li key={i} className={`flex items-start gap-2 rounded-xl p-3 text-sm ${critical ? 'bg-red-50 text-red-800 ring-1 ring-red-200' : 'bg-yellow-50 text-yellow-900 ring-1 ring-yellow-200'}`}>
                            <span aria-hidden="true"><Icon name={critical ? 'close' : 'check'} /></span>
                            <span>{w}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              )}

              <section aria-label="Totals" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                <dl aria-live="polite" aria-atomic="true" className="space-y-1 text-sm">
                  <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{money(result.subtotal ?? 0)}</dd></div>
                  <div className="flex justify-between"><dt>Tax ({taxPct}%)</dt><dd className="tabular-nums">{money(result.tax ?? 0)}</dd></div>
                  <div className="flex justify-between text-lg font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(result.total ?? 0)}</dd></div>
                  <div className="flex justify-between"><dt>Deposit ({depositPct}%)</dt><dd className="tabular-nums">{money(result.deposit ?? 0)}</dd></div>
                </dl>
                {errors.length > 0 && (
                  <ul aria-live="polite" className="mt-3 space-y-1 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
                    {errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
                {saveError && <p aria-live="polite" className="mt-3 text-sm text-red-800">{saveError}</p>}
                <AsyncButton
                  className={`mt-4 min-h-[48px] w-full rounded-xl font-semibold ${result.complete ? 'bg-[#FFD60A] text-[#101311]' : 'bg-neutral-200 text-neutral-500'}`}
                  onClick={save}
                >
                  Save estimate as draft
                </AsyncButton>
                <p className="mt-2 text-xs text-neutral-500">
                  Saves as DRAFT — office review is required before an approval link can be created.
                </p>
              </section>
            </aside>
          </div>
        )}
      </div>
    </Modal>
  );
}
