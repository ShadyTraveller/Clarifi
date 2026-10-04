'use client';
import { useState } from 'react';
import { supabase } from './lib_supabase';
import { Panel, AsyncButton } from './ui';
import { PHOTO_CHECKLISTS, serviceLabel } from './lib/domain';
import { assistant, readPhoto } from './Composers';
import Markdown from './Markdown';
export default function PhotosPanel({ job, orgId, files, requirements, onRefresh }: { job: any; orgId: string; files: any[]; requirements: any[]; onRefresh: () => Promise<void> }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const list = PHOTO_CHECKLISTS[serviceLabel(job.service)];
  async function upload(file: File) {
    setBusy(true); setError('');
    try {
      const image = await readPhoto(file), path = `${job.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
      const up = await supabase.storage.from('job-files').upload(path, file); if (up.error) throw up.error;
      const saved = await supabase.from('job_files').insert({ organization_id: orgId, job_id: job.id, storage_path: path, file_name: file.name, mime_type: file.type }).select().single(); if (saved.error) throw saved.error;
      await onRefresh();
      try { const assessment = await assistant({ action: 'photo', service: serviceLabel(job.service), text: job.request, images: [image] }); const result = await supabase.from('job_files').update({ assessment }).eq('id', saved.data.id); if (result.error) throw result.error; await onRefresh(); } catch (e) { setError('Photo saved. Assessment unavailable: ' + (e as Error).message); }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Panel title="Photos" subtitle="Capture the checklist. Review what the photo confirms."><div className="checklist">{list.map(label => { const r = requirements.find(r => r.label === label); return <label className="checklist-row" key={label}><input type="checkbox" checked={r?.completed || false} disabled={!r} onChange={async e => { const { error } = await supabase.from('job_requirements').update({ completed: e.target.checked }).eq('id', r.id); if (error) setError(error.message); else await onRefresh(); }} /><span>{label}</span></label>; })}</div><label className={`secondary upload-button ${busy ? 'disabled' : ''}`}>{busy ? 'Saving and assessing…' : 'Upload photo'}<input type="file" disabled={busy} hidden accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e => { if (e.target.files?.[0]) upload(e.target.files[0]); e.target.value = ''; }} /></label>{error && <p className="notice" role="status">{error}</p>}
    <div className="photo-assessments">{files.map(f => <article key={f.id}><strong>{f.file_name}</strong><AsyncButton className="text-button" onClick={async () => { const { data, error } = await supabase.storage.from('job-files').createSignedUrl(f.storage_path, 60); if (error) return setError(error.message); window.open(data.signedUrl, '_blank', 'noopener,noreferrer'); }}>View photo ↗</AsyncButton>{f.assessment ? <><Markdown>{f.assessment.summary}</Markdown>{f.assessment.items?.map((item: any) => <p key={item.label}><span className={`evidence ${item.status}`}>{item.status.replaceAll('_', ' ')}</span> <strong>{item.label}</strong> — {item.evidence}</p>)}</> : <p className="helper">No AI assessment saved. The photo remains available for manual review.</p>}</article>)}</div>
  </Panel>;
}
