'use client';
import { useState } from 'react';
import { supabase } from './lib_supabase';
import { AsyncButton, Modal, money } from './ui';
import Markdown from './Markdown';
import { SERVICES, serviceLabel, squareFeet, totals, requestMarkdown, type RequestDraft, type EstimateDraft, type EstimateLine, type Service, type Product } from './lib/domain';

export async function assistant(body: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Sign in to continue.');
  const response = await fetch('/api/assistant', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to generate this draft.');
  return result;
}
export async function readPhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 1_500_000) throw new Error('Choose a JPG, PNG or WebP image under 1.5 MB.');
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not read the photo.')); reader.readAsDataURL(file); });
}
function ServicePicker({ value, onChange }: { value: Service; onChange: (value: Service) => void }) {
  return <label>Service<select value={value} onChange={e => onChange(e.target.value as Service)}>{SERVICES.map(s => <option key={s.key}>{s.label}</option>)}</select></label>;
}
export function RequestComposer({ orgId, techs, onClose, onSaved }: { orgId: string; techs: any[]; onClose: () => void; onSaved: (id: string) => Promise<void> }) {
  const [service, setService] = useState<Service>('Locksmith'), [text, setText] = useState(''), [draft, setDraft] = useState<RequestDraft | null>(null);
  const [error, setError] = useState(''), [edit, setEdit] = useState(false), [translation, setTranslation] = useState('');
  const [lat, setLat] = useState(''), [lng, setLng] = useState('');
  async function generate() {
    setError(''); setTranslation('');
    try { const result = await assistant({ action: 'request', service, text, latitude: lat === '' ? null : Number(lat), longitude: lng === '' ? null : Number(lng) }); setDraft(result); } catch (e) { setError((e as Error).message); }
  }
  async function save() {
    if (!draft?.client.name.trim() || !draft.title.trim()) return setError('Add the client name and request title before saving.');
    setError('');
    try {
      const { data, error } = await supabase.rpc('create_clarifi_request', { target_org: orgId, client_info: draft.client, job_info: { title: draft.title, details: draft.details, service: draft.service, markdown: draft.markdown, technician_id: draft.technician_id, latitude: draft.latitude, longitude: draft.longitude } });
      if (error) throw error; await onSaved(data); onClose();
    } catch (e) { setError((e as Error).message); }
  }
  function clientField(field: keyof RequestDraft['client'], value: string) {
    if (!draft) return;
    const labels = { name: 'Name', role: 'Property role', email: 'Email', phone: 'Phone', address: 'Address' };
    const pattern = new RegExp('(- \\*\\*' + labels[field] + ':\\*\\* )[^\\n]*');
    const display = (field === 'role' ? value.replaceAll('_', ' ') : value).replace(/[\n<>]/g, ' ') || 'Not provided';
    setDraft({ ...draft, client: { ...draft.client, [field]: value }, markdown: draft.markdown.replace(pattern, (_, prefix) => prefix + display) });
  }
  return <Modal title="Start with the call." onClose={onClose}><div className="composer">
    <p className="helper">Write the client’s name, property role, contact details, address, and what needs to be done.</p>
    <ServicePicker value={service} onChange={value => { setService(value); setDraft(null); }} />
    <form onSubmit={e => { e.preventDefault(); if (text.trim()) generate(); }}><textarea className="chat-input" aria-label="Client call" value={text} onChange={e => setText(e.target.value)} placeholder={'Maria Lopez, owner, 416-555-0123. Residential lock change at 25 King Street, Toronto. Existing gripset is loose; wants matte black.'} rows={5} />
    <details><summary>Request location (optional)</summary><p className="helper">Enter map coordinates for automatic matching. An address is located automatically when geocoding is configured.</p><div className="form-grid"><label>Latitude<input type="number" min="-90" max="90" step="any" value={lat} onChange={e => setLat(e.target.value)} /></label><label>Longitude<input type="number" min="-180" max="180" step="any" value={lng} onChange={e => setLng(e.target.value)} /></label></div></details>
    <div className="composer-actions"><AsyncButton disabled={!text.trim()} onClick={generate}>New request ↗</AsyncButton><button type="button" className="text-button" onClick={() => { const d: RequestDraft = { client: { name: '', role: 'owner', email: '', phone: '', address: '' }, title: '', details: text, service, markdown: '', latitude: lat === '' ? null : Number(lat), longitude: lng === '' ? null : Number(lng), technician_id: null, assignment_reason: 'Unassigned — select a technician or leave this request in the queue.' }; d.markdown = requestMarkdown(d); setDraft(d); setEdit(true); }}>Start blank draft</button></div></form>
    {error && <p className="notice error" role="alert">{error}</p>}
    {draft && <section className="answer"><div className="answer-toolbar"><strong>Clarifi request</strong><button className="text-button" onClick={() => setEdit(!edit)}>{edit ? 'Preview' : 'Edit / annotate'}</button><AsyncButton className="text-button" onClick={async () => { try { setTranslation((await assistant({ action: 'translate', text: draft.markdown })).translation); } catch (e) { setError((e as Error).message); } }}>Translate to Spanish</AsyncButton></div>
      {edit ? <><div className="form-grid"><label>Client name<input value={draft.client.name} onChange={e => clientField('name', e.target.value)} /></label><label>Property role<select value={draft.client.role} onChange={e => clientField('role', e.target.value)}>{['owner', 'tenant', 'property_management', 'commercial', 'other'].map(role => <option value={role} key={role}>{role.replaceAll('_', ' ')}</option>)}</select></label><label>Phone<input type="tel" value={draft.client.phone} onChange={e => clientField('phone', e.target.value)} /></label><label>Email<input type="email" value={draft.client.email} onChange={e => clientField('email', e.target.value)} /></label><label>Address<input value={draft.client.address} onChange={e => clientField('address', e.target.value)} /></label><label>Request title<input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label></div><label>Markdown answer<textarea rows={12} value={draft.markdown} onChange={e => setDraft({ ...draft, markdown: e.target.value })} /></label></> : <Markdown>{draft.markdown}</Markdown>}
      <label>Assignment<select value={draft.technician_id || ''} onChange={e => setDraft({ ...draft, technician_id: e.target.value || null })}><option value="">Unassigned</option>{techs.map(t => <option key={t.id} value={t.id}>{t.name} · {(t.specialties || []).join(', ')}</option>)}</select></label>
      {translation && <details open><summary>Spanish translation</summary><Markdown>{translation}</Markdown></details>}
      <div className="modal-actions"><AsyncButton onClick={save}>Save as new request</AsyncButton></div></section>}
  </div></Modal>;
}
export function EstimatePreview({ scope, lines, taxPct, depositPct }: { scope: string; lines: EstimateLine[]; taxPct: number; depositPct: number }) {
  const amount = totals(lines, taxPct, depositPct);
  return <div className="estimate-preview"><p className="eyebrow">CLARIFI · ESTIMATE</p><Markdown>{scope}</Markdown>{lines.map((l, i) => <div className="quote-line" key={i}><div><strong>{l.name}</strong><small>{l.quantity} {l.unit}</small></div><span>{l.price == null ? 'To be confirmed' : money(l.quantity * l.price)}</span></div>)}<dl className="totals"><div><dt>Subtotal</dt><dd>{money(amount.subtotal)}</dd></div><div><dt>Tax ({taxPct}%)</dt><dd>{money(amount.tax)}</dd></div><div className="grand"><dt>Total CAD</dt><dd>{money(amount.total)}</dd></div><div><dt>Deposit ({depositPct}%)</dt><dd>{money(amount.deposit)}</dd></div></dl></div>;
}
export function EstimateComposer({ jobs, templates, jobId = '', onClose, onSaved }: { jobs: any[]; templates: any[]; jobId?: string; onClose: () => void; onSaved: (quoteId: string) => Promise<void> }) {
  const [selected, setSelected] = useState(jobId), [template, setTemplate] = useState(''), [text, setText] = useState(''), [images, setImages] = useState<string[]>([]);
  const [width, setWidth] = useState(''), [height, setHeight] = useState(''), [count, setCount] = useState('1');
  const [draft, setDraft] = useState<EstimateDraft | null>(null), [preview, setPreview] = useState(false), [error, setError] = useState(''), [translation, setTranslation] = useState('');
  const [tax, setTax] = useState('13'), [deposit, setDeposit] = useState('50'), [days, setDays] = useState('14');
  const job = jobs.find(j => j.id === selected), service = serviceLabel(job?.service || 'Locksmith');
  const choices = templates.filter(t => serviceLabel(t.trade) === service), picked = choices.find(t => t.id === template) || choices[0];
  const area = squareFeet(Number(width), Number(height), Number(count));
  function updateLine(index: number, patch: Partial<EstimateLine>) { if (draft) setDraft({ ...draft, lines: draft.lines.map((l, i) => i === index ? { ...l, ...patch } : l) }); }
  async function generate() {
    setError(''); setTranslation('');
    try { setDraft(await assistant({ action: 'estimate', job_id: selected, service, template_name: picked?.name || 'Skincare Service Call', text, images, width, height, count })); } catch (e) { setError((e as Error).message); }
  }
  function selectProduct(p: Product) {
    if (draft) setDraft({ ...draft, lines: [...draft.lines.filter(l => !l.source), { name: p.name, quantity: 1, unit: 'each', cost: p.cost, price: p.cost == null ? null : Math.round(p.cost * 1.2 * 100) / 100, markup: 20, source: p.url, image: p.image || '' }] });
  }
  async function save() {
    if (!draft || !selected || !draft.scope.trim() || draft.lines.some(l => !l.name.trim() || !Number.isFinite(l.quantity) || l.quantity <= 0 || l.price == null || !Number.isFinite(l.price) || l.price < 0)) return setError('Confirm every item’s name, quantity, and customer price before saving.');
    if (![Number(tax), Number(deposit)].every(n => Number.isFinite(n) && n >= 0 && n <= 100) || !Number.isInteger(Number(days)) || Number(days) < 1 || Number(days) > 365) return setError('Use tax and deposit percentages from 0–100 and validity from 1–365 days.');
    setError('');
    try { const { data, error } = await supabase.rpc('save_clarifi_estimate', { target_job: selected, scope_text: draft.scope, lines: draft.lines.map(l => ({ ...l, cost: l.cost ?? 0 })), tax_pct: Number(tax), deposit_pct: Number(deposit), valid_days: Number(days) }); if (error) throw error; await onSaved(data); onClose(); } catch (e) { setError((e as Error).message); }
  }
  return <Modal title="Diagnosis in. Estimate out." onClose={onClose}><div className="composer"><label>Request<select value={selected} onChange={e => { setSelected(e.target.value); setDraft(null); setTemplate(''); const j = jobs.find(j => j.id === e.target.value); setDeposit(['property_management', 'commercial'].includes(j?.clients?.relationship) ? '25' : j?.clients?.relationship === 'tenant' ? '100' : '50'); }}><option value="">Choose a saved request</option>{jobs.filter(j => j.status !== 'completed').map(j => <option value={j.id} key={j.id}>{j.clients?.name} — {j.request}</option>)}</select></label>
    {!jobs.length && <p className="helper">Create a request first so the estimate stays connected to the client.</p>}
    <label>Scope template<select value={picked?.id || ''} onChange={e => { setTemplate(e.target.value); setDraft(null); }}>{choices.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}{!choices.length && <option>Skincare Service Call</option>}</select></label>
    <textarea className="chat-input" aria-label="Technician diagnosis" rows={4} value={text} onChange={e => setText(e.target.value)} placeholder="Residential lock change. Client wants a matte black gripset. Include rekey, consumables, and installation labour." />
    <div className="measure-pair"><label>Width (in)<input min="0" type="number" step="any" value={width} onChange={e => setWidth(e.target.value)} /></label><span>×</span><label>Height (in)<input min="0" type="number" step="any" value={height} onChange={e => setHeight(e.target.value)} /></label><label>Count<input min="1" type="number" value={count} onChange={e => setCount(e.target.value)} /></label></div>
    {area > 0 && <Markdown>{`$${width} \\times ${height} \\times ${count} \\div 144 = ${area.toFixed(2)}\\;\\text{sq ft}$`}</Markdown>}
    <div className="photo-strip">{images.map((image, i) => <button key={i} className="photo-thumbnail" aria-label={`Remove photo ${i + 1}`} onClick={() => setImages(images.filter((_, n) => n !== i))}><img src={image} alt={`Supplies reference ${i + 1}`} /><span>×</span></button>)}</div>
    <div className="composer-actions"><label className="secondary upload-button">Add supplies photo<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { if (images.length >= 3) throw new Error('Use up to three photos.'); setImages([...images, await readPhoto(f)]); } catch (err) { setError((err as Error).message); } e.target.value = ''; }} /></label><AsyncButton disabled={!selected || (!text.trim() && !images.length)} onClick={generate}>New estimate ↗</AsyncButton><button className="text-button" disabled={!selected} onClick={() => setDraft({ scope: `# ${picked?.name || 'Skincare Service Call'}\n\n${picked?.description || 'Service call and supplies as confirmed.'}\n\n## Notes\n${text}\n\n${area > 0 ? `Confirmed area: ${area.toFixed(2)} sq ft (${width} × ${height} inches × ${count} ÷ 144).` : 'Measurements to be confirmed.'}`, lines: [{ name: 'Installation / service labour', quantity: 1, unit: 'hour', cost: null, price: null }, { name: 'Supplies', quantity: area > 0 && ['Windows', 'Security Film'].includes(service) ? area : 1, unit: area > 0 && ['Windows', 'Security Film'].includes(service) ? 'sq ft' : 'each', cost: null, price: null }], products: [], notes: 'Enter confirmed supplies and customer pricing before saving.', template_name: picked?.name || 'Skincare Service Call' })}>Start blank draft</button></div>
    {error && <p className="notice error" role="alert">{error}</p>}
    {draft && <section className="answer"><div className="answer-toolbar"><strong>Clarifi estimate</strong><button className="text-button" onClick={() => setPreview(!preview)}>{preview ? 'Edit estimate' : 'Client preview'}</button><AsyncButton className="text-button" onClick={async () => { try { setTranslation((await assistant({ action: 'translate', text: draft.scope })).translation); } catch (e) { setError((e as Error).message); } }}>Translate to Spanish</AsyncButton></div>
      {preview ? <EstimatePreview scope={draft.scope} lines={draft.lines} taxPct={Number(tax)} depositPct={Number(deposit)} /> : <><label>Scope / annotations<textarea rows={9} value={draft.scope} onChange={e => setDraft({ ...draft, scope: e.target.value })} /></label><p className="eyebrow">STAFF ONLY · SUPPLIER OPTIONS</p><div className="product-options">{draft.products.map((p, i) => <article key={p.url}><span className="eyebrow">0{i + 1}</span>{p.image ? <img src={p.image} alt={p.name} loading="lazy" referrerPolicy="no-referrer" /> : <div className="product-photo-empty">Photo unavailable</div>}<strong>{p.name}</strong><small>{p.supplier}</small><b>{p.cost == null ? 'Price needs confirmation' : money(p.cost)}</b><a href={p.url} target="_blank" rel="noopener noreferrer">View source ↗</a><small>Checked {new Date(p.checked_at).toLocaleDateString()}</small><button className="secondary" onClick={() => selectProduct(p)}>Use this option</button></article>)}</div>{draft.notes && <p className="helper">{draft.notes}</p>}
      <div className="estimate-lines">{draft.lines.map((l, i) => <div className="estimate-line-editor" key={i}><label>Item<input value={l.name} onChange={e => updateLine(i, { name: e.target.value })} /></label><label>Quantity<input type="number" min="0.01" step="any" value={l.quantity} onChange={e => updateLine(i, { quantity: Number(e.target.value) })} /></label><label>Unit<input value={l.unit} onChange={e => updateLine(i, { unit: e.target.value })} /></label><label>Cost (internal)<input type="number" min="0" step="0.01" value={l.cost ?? ''} placeholder="Unconfirmed" onChange={e => updateLine(i, { cost: e.target.value === '' ? null : Number(e.target.value) })} /></label><label>Client price (CAD)<input type="number" min="0" step="0.01" value={l.price ?? ''} placeholder="Confirm price" onChange={e => updateLine(i, { price: e.target.value === '' ? null : Number(e.target.value) })} /></label><button className="text-button" aria-label={`Remove ${l.name}`} onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, n) => n !== i) })}>Remove</button></div>)}</div><button className="secondary" onClick={() => setDraft({ ...draft, lines: [...draft.lines, { name: '', quantity: 1, unit: 'each', cost: null, price: null }] })}>Add item</button></>}
      <div className="form-grid"><label>Tax %<input type="number" min="0" max="100" step="any" value={tax} onChange={e => setTax(e.target.value)} /></label><label>Deposit %<input type="number" min="0" max="100" step="any" value={deposit} onChange={e => setDeposit(e.target.value)} /></label><label>Valid for (days)<input type="number" min="1" max="365" value={days} onChange={e => setDays(e.target.value)} /></label></div>
      {translation && <details open><summary>Spanish translation</summary><Markdown>{translation}</Markdown></details>}
      <div className="modal-actions"><AsyncButton disabled={!draft.lines.length} onClick={save}>Save as new estimate</AsyncButton></div></section>}
  </div></Modal>;
}
