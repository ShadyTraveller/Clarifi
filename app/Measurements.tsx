'use client';
import { useState } from 'react';
import { supabase } from './lib_supabase';
import { Panel, AsyncButton } from './ui';
import Markdown from './Markdown';
import { squareFeet } from './lib/domain';
export default function Measurements({ jobId, orgId, measurements, onRefresh }: { jobId: string; orgId: string; measurements: any[]; onRefresh: () => Promise<void> }) {
  const [width, setWidth] = useState(''), [height, setHeight] = useState(''), [count, setCount] = useState('1'), [label, setLabel] = useState(''), [error, setError] = useState('');
  const area = squareFeet(Number(width), Number(height), Number(count));
  async function save() { setError(''); if (!area || !label.trim()) return setError('Enter a label, positive width, height, and count.'); const { error } = await supabase.from('job_measurements').insert({ organization_id: orgId, job_id: jobId, label, value: area, unit: 'sq ft', notes: `${width} × ${height} inches × ${count} ÷ 144` }); if (error) setError(error.message); else { await onRefresh(); setLabel(''); setWidth(''); setHeight(''); } }
  return <Panel title="Measurements" subtitle="Enter width and height in inches."><label>Opening / pane<input value={label} onChange={e => setLabel(e.target.value)} placeholder="Living room window" /></label><div className="measure-pair"><label>Width (in)<input type="number" min="0" step="any" value={width} onChange={e => setWidth(e.target.value)} /></label><span>×</span><label>Height (in)<input type="number" min="0" step="any" value={height} onChange={e => setHeight(e.target.value)} /></label><label>Count<input type="number" min="1" step="1" value={count} onChange={e => setCount(e.target.value)} /></label></div>{area > 0 && <Markdown>{`$${width} \\times ${height} \\times ${count} \\div 144 = ${area.toFixed(2)}\\;\\text{sq ft}$`}</Markdown>}<AsyncButton className="secondary" onClick={save}>Save measurement</AsyncButton>{error && <p className="notice" role="alert">{error}</p>}<div className="measurement-list">{measurements.map(m => <article key={m.id}><div><strong>{m.label}</strong><small>{m.notes || ''}</small></div><span>{Number(m.value).toFixed(2)} {m.unit}</span></article>)}</div></Panel>;
}
