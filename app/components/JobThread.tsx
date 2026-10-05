'use client';
import { useState } from 'react';
import { supabase } from '../lib_supabase';
import { Panel, AsyncButton, Icon } from '../ui';

/* Persistent notes + file thread for a job. Visible across every stage, usable by office and tech. */
export default function JobThread({ job, files, orgId, onRefresh, onNotice }: {
  job: any; files: any[]; orgId: string; onRefresh: () => Promise<void>; onNotice: (m: string) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function addNote() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      const stamp = new Date().toLocaleString();
      const next = `${job?.details || ''}\n[${stamp}] ${note.trim()}`.trim();
      const { error } = await supabase.from('jobs').update({ details: next }).eq('id', job.id);
      if (error) throw error;
      setNote('');
      await onRefresh();
      onNotice('Note added to the job thread.');
    } catch (e) { onNotice((e as Error).message); } finally { setBusy(false); }
  }

  async function upload(file: File) {
    if (file.size > 10 * 1024 * 1024) { onNotice('Files must be under 10 MB.'); return; }
    setBusy(true);
    try {
      const path = `${job.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
      const up = await supabase.storage.from('job-files').upload(path, file);
      if (up.error) throw up.error;
      const saved = await supabase.from('job_files').insert({
        organization_id: orgId, job_id: job.id, storage_path: path, file_name: file.name, mime_type: file.type,
      });
      if (saved.error) throw saved.error;
      await onRefresh();
      onNotice('File added to the job thread.');
    } catch (e) { onNotice((e as Error).message); } finally { setBusy(false); }
  }

  async function openFile(f: any) {
    const { data, error } = await supabase.storage.from('job-files').createSignedUrl(f.storage_path, 120);
    if (error) return onNotice(error.message);
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  return <Panel title="Job thread" subtitle="Notes and files follow this job from request to completion.">
    <div className="job-thread">
      {job?.details && <div className="thread-item">
        <span className="thread-icon"><Icon name="request" /></span>
        <div><small>Notes so far</small><p>{job.details}</p></div>
      </div>}
      {files.map(f => <div className="thread-item" key={f.id}>
        <span className="thread-icon"><Icon name="photo" /></span>
        <div><small>{new Date(f.created_at).toLocaleString()}</small><p><strong>{f.file_name}</strong></p>
          <button className="text-button" onClick={() => openFile(f)}>Open file ↗</button></div>
      </div>)}
      {!job?.details && !files.length && <p className="helper">No notes or files yet. Add the first note below.</p>}
    </div>
    <label style={{ marginTop: 16 }}>Add a note
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Update, observation, client request…" />
    </label>
    <div className="button-wrap">
      <AsyncButton className="secondary" onClick={addNote} disabled={!note.trim() || busy}>Add note</AsyncButton>
      <label className="secondary upload-button">Attach file
        <input hidden type="file" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
      </label>
    </div>
  </Panel>;
}
