'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../lib_supabase';
import { Brand, Icon, money } from '../../ui';
import { serviceLabel } from '../../lib/domain';
import {
  JOB_PROGRESS_STAGES,
  groupJobFiles,
  isPhotoFile,
  jobProgress,
  summarizeJobBudget,
  type JobFileLike,
} from '../../lib/job-report';

/**
 * Job Report — one clean page per job/assessment (Billdr-style), built
 * ONLY from existing records:
 *   header + client block  ← jobs + clients
 *   progress               ← jobs.status (lead → estimate → active → completed)
 *   budget cards           ← quotes/quote_versions (approved estimate) and
 *                            invoices (invoiced / paid / balance). Paid is
 *                            derived from invoices with status 'paid' —
 *                            payments integration is deferred, so nothing
 *                            else is claimed.
 *   photos                 ← job_files image rows (bucket 'job-files')
 *   files                  ← job_files grouped by mime/name metadata
 *   activity               ← job_timeline RPC (fallback: job_notes)
 *
 * Per-file "shared with client" is NOT shown as a toggle: job_files has
 * no visibility column in the current schema, so every file is treated
 * as office-only here. Adding sharing needs one additive migration —
 * flagged for Lavie's approval, not improvised.
 *
 * Internal data (office notes, gate code, internal file handling) only
 * renders in Office view; the Client view is a separate projection that
 * never receives those fields.
 */

interface TimelineEntry {
  id: string;
  kind: string;
  created_at: string;
  actor_name?: string;
  title: string;
  body: string | null;
  metadata?: any;
}

const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const fmtDateTime = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

export default function JobReportPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = String(params?.jobId || '');
  const [session, setSession] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [job, setJob] = useState<any>(null);
  const [jobsList, setJobsList] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [files, setFiles] = useState<JobFileLike[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [timelineFallback, setTimelineFallback] = useState(false);
  const [techName, setTechName] = useState('');
  const [view, setView] = useState<'office' | 'client'>('office');
  const [fileSearch, setFileSearch] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
  }, []);

  useEffect(() => {
    if (!session || !jobId) return;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [jobRes, quotesRes, invoicesRes, filesRes, listRes] = await Promise.all([
          supabase.from('jobs').select('*,clients(*)').eq('id', jobId).maybeSingle(),
          supabase.from('quotes').select('*,quote_versions(*)').eq('job_id', jobId).order('created_at', { ascending: false }),
          supabase.from('invoices').select('*').eq('job_id', jobId).order('created_at', { ascending: false }),
          supabase.from('job_files').select('*').eq('job_id', jobId).order('created_at', { ascending: false }),
          supabase.from('jobs').select('id, request, status, clients(name)').order('created_at', { ascending: false }).limit(100),
        ]);
        if (jobRes.error) throw jobRes.error;
        if (!jobRes.data) { setError('Job not found, or it belongs to another workspace.'); setLoading(false); return; }
        const j = jobRes.data as any;
        setJob(j);
        setQuotes(quotesRes.data || []);
        setInvoices(invoicesRes.data || []);
        setFiles((filesRes.data || []) as JobFileLike[]);
        setJobsList(listRes.data || []);

        if (j.technician_id) {
          const { data: tech } = await supabase.from('technicians').select('name').eq('id', j.technician_id).maybeSingle();
          setTechName((tech as any)?.name || '');
        }

        // Signed URLs for every file (photos render inline; others open on click).
        const rows = (filesRes.data || []) as JobFileLike[];
        if (rows.length) {
          const { data: signed } = await supabase.storage.from('job-files').createSignedUrls(rows.map(r => r.storage_path), 3600);
          const map: Record<string, string> = {};
          (signed || []).forEach((s: any, i: number) => { if (s?.signedUrl) map[rows[i].storage_path] = s.signedUrl; });
          setSignedUrls(map);
        }

        // Activity timeline — reuse the job_timeline RPC; degrade to the
        // notes thread if the RPC is unavailable on this project.
        const { data: tl, error: tlError } = await supabase.rpc('job_timeline', { p_job_id: jobId });
        if (!tlError && Array.isArray(tl)) {
          setTimeline(tl as TimelineEntry[]);
          setTimelineFallback(false);
        } else {
          const { data: notes } = await supabase
            .from('job_notes')
            .select('id, body, visibility, created_at')
            .eq('job_id', jobId)
            .order('created_at', { ascending: false });
          const entries: TimelineEntry[] = (notes || []).map((n: any) => ({
            id: n.id, kind: 'note', created_at: n.created_at,
            title: n.visibility === 'office' ? 'Office note' : 'Note',
            body: n.body, metadata: { visibility: n.visibility },
          }));
          entries.push({ id: `${j.id}-created`, kind: 'lifecycle', created_at: j.created_at, title: 'Request created', body: j.request, metadata: { status: j.status } });
          setTimeline(entries);
          setTimelineFallback(true);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The report could not be loaded.');
      } finally {
        setLoading(false);
      }
    })();
  }, [session, jobId]);

  const budget = useMemo(() => summarizeJobBudget(quotes, invoices), [quotes, invoices]);
  const progress = useMemo(() => jobProgress(job?.status || 'lead'), [job]);
  const photos = useMemo(() => files.filter(isPhotoFile), [files]);
  const filteredFiles = useMemo(
    () => files.filter(f => !fileSearch.trim() || f.file_name.toLowerCase().includes(fileSearch.trim().toLowerCase())),
    [files, fileSearch],
  );
  const fileGroups = useMemo(() => groupJobFiles(filteredFiles), [filteredFiles]);
  const visibleTimeline = useMemo(
    () => view === 'client' ? timeline.filter(t => t.metadata?.visibility !== 'office') : timeline,
    [timeline, view],
  );

  if (!authReady) return <main className="mx-auto max-w-3xl px-4 py-16"><p role="status">Loading…</p></main>;
  if (!session) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-[#101311]">
        <Brand />
        <h1 className="mt-6 text-2xl font-bold">Job report</h1>
        <p className="mt-2 text-neutral-600">Sign in with an office account to view job reports.</p>
        <a href="/" className="mt-4 inline-block min-h-[44px] rounded-xl bg-[#101311] px-5 py-3 font-medium text-white">Go to sign in</a>
      </main>
    );
  }
  if (loading) return <main className="mx-auto max-w-3xl px-4 py-16"><p role="status">Loading report…</p></main>;
  if (error || !job) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-[#101311]">
        <Brand />
        <p role="alert" className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-red-800 ring-1 ring-red-200">{error || 'Job not found.'}</p>
        <a href="/" className="mt-4 inline-block font-medium underline">Back to workspace</a>
      </main>
    );
  }

  const client = job.clients || {};
  const reportNo = `JR-${String(job.id).slice(0, 8).toUpperCase()}`;
  const issuedInvoices = invoices.filter(i => ['sent', 'paid', 'overdue'].includes(i.status));

  return (
    <main className="min-h-screen bg-[#FAFAF7] text-[#101311]">
      <header className="bg-[#101311] text-white print:hidden">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-4 px-4 py-3">
          <Brand />
          <span className="rounded-full bg-[#FFD60A] px-3 py-1 text-xs font-bold uppercase tracking-widest text-[#101311]">Job report · Preview</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="jr-switch">Switch job</label>
            <select id="jr-switch" value={job.id} onChange={e => router.push(`/job-report/${e.target.value}`)} className="min-h-[40px] rounded-xl border border-neutral-600 bg-[#101311] px-3 text-sm text-white">
              {jobsList.map((j: any) => <option key={j.id} value={j.id}>{j.clients?.name || 'Client'} · {String(j.request || '').slice(0, 40)}</option>)}
            </select>
            <div role="group" aria-label="Report view" className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-800 p-1">
              {(['office', 'client'] as const).map(v => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`min-h-[36px] rounded-lg px-3 text-sm font-medium capitalize ${view === v ? 'bg-[#FFD60A] text-[#101311]' : 'text-neutral-300'}`}>{v} view</button>
              ))}
            </div>
            <button type="button" onClick={() => window.print()} className="min-h-[40px] rounded-xl bg-white px-4 font-medium text-[#101311]">Print</button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1200px] px-4 py-5">
        {/* Report header */}
        <section aria-label="Report header" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
          <div className="flex flex-wrap items-start gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">Job report</p>
              <h1 className="mt-1 text-2xl font-bold">{serviceLabel(job.service || '')} — {client.name || 'Client'}</h1>
              <p className="mt-1 max-w-2xl text-sm text-neutral-700">{job.request}</p>
            </div>
            <dl className="ml-auto space-y-1 text-right text-sm">
              <div className="flex justify-end gap-3"><dt className="text-neutral-500">Report</dt><dd className="font-semibold">{reportNo}</dd></div>
              <div className="flex justify-end gap-3"><dt className="text-neutral-500">Date</dt><dd className="font-semibold">{fmtDate(new Date().toISOString())}</dd></div>
              <div className="flex justify-end gap-3"><dt className="text-neutral-500">Job opened</dt><dd className="font-semibold">{fmtDate(job.created_at)}</dd></div>
              {techName && <div className="flex justify-end gap-3"><dt className="text-neutral-500">Technician</dt><dd className="font-semibold">{techName}</dd></div>}
              {job.scheduled_start && <div className="flex justify-end gap-3"><dt className="text-neutral-500">Scheduled</dt><dd className="font-semibold">{fmtDateTime(job.scheduled_start)}</dd></div>}
            </dl>
          </div>

          {/* Progress */}
          <div className="mt-5" aria-label="Job progress">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-neutral-500">
              <span>Progress</span><span>{progress.pct}% — {progress.label}</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-[#FFD60A]" style={{ width: `${progress.pct}%` }} />
            </div>
            <ol className="mt-2 grid grid-cols-4 gap-2">
              {JOB_PROGRESS_STAGES.map((s, i) => (
                <li key={s.key} className={`rounded-lg px-2 py-1.5 text-center text-xs font-semibold ${i < progress.index ? 'bg-neutral-800 text-white' : i === progress.index ? 'bg-[#101311] text-white ring-2 ring-[#FFD60A]' : 'bg-neutral-100 text-neutral-500'}`}>
                  {i < progress.index ? '✓ ' : ''}{s.label}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-[340px_1fr]">
          {/* Client block */}
          <section aria-label="Client" className="h-fit rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
            <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500">Client</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div><dt className="text-neutral-500">Name</dt><dd className="font-semibold">{client.name || '—'}</dd></div>
              {client.email && <div><dt className="text-neutral-500">Email</dt><dd>{client.email}</dd></div>}
              {client.phone && <div><dt className="text-neutral-500">Phone</dt><dd>{client.phone}</dd></div>}
              <div><dt className="text-neutral-500">Service address</dt><dd>{client.address || '—'}{job.unit_number ? ` · Unit ${job.unit_number}` : ''}</dd></div>
              <div><dt className="text-neutral-500">Billing address</dt><dd>{client.address || '—'}</dd><p className="text-xs text-neutral-500">Same as service address — no separate billing address is stored for this client.</p></div>
              {client.relationship && <div><dt className="text-neutral-500">Relationship</dt><dd className="capitalize">{String(client.relationship).replaceAll('_', ' ')}</dd></div>}
            </dl>
            {view === 'office' && (job.gate_code || job.access_notes || job.coi_required || job.coi_notes) && (
              <div className="mt-4 border-t border-neutral-100 pt-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500">Access &amp; COI · office only</h3>
                <dl className="mt-2 space-y-2 text-sm">
                  {job.gate_code && <div><dt className="text-neutral-500">Gate code</dt><dd>{job.gate_code}</dd></div>}
                  {job.access_notes && <div><dt className="text-neutral-500">Access notes</dt><dd className="whitespace-pre-wrap">{job.access_notes}</dd></div>}
                  {job.coi_required && <div><dt className="text-neutral-500">COI required</dt><dd>{job.coi_notes || 'Yes'}</dd></div>}
                </dl>
              </div>
            )}
            {job.details && (
              <div className="mt-4 border-t border-neutral-100 pt-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500">Job details</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm">{job.details}</p>
              </div>
            )}
          </section>

          <div className="space-y-4">
            {/* Budget overview */}
            <section aria-label="Budget overview" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
              <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500">Budget overview</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl bg-[#FAFAF7] p-4 ring-1 ring-neutral-200">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{budget.contractApproved ? 'Approved estimate' : 'Latest estimate'}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{budget.contractTotal != null ? money(budget.contractTotal) : budget.latestEstimateTotal != null ? money(budget.latestEstimateTotal) : '—'}</p>
                  <p className="text-xs text-neutral-500">
                    {budget.contractApproved
                      ? `Quote ${budget.contractQuoteNumber} · approved`
                      : budget.latestEstimateNumber
                        ? `Quote ${budget.latestEstimateNumber} · not approved yet`
                        : 'No estimate yet'}
                  </p>
                </div>
                <div className="rounded-xl bg-[#FAFAF7] p-4 ring-1 ring-neutral-200">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Invoiced to date</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{money(budget.invoiced)}</p>
                  <p className="text-xs text-neutral-500">{budget.invoiceCount} issued invoice{budget.invoiceCount === 1 ? '' : 's'}{budget.draftInvoiceCount ? ` · ${budget.draftInvoiceCount} draft not counted` : ''}</p>
                </div>
                <div className="rounded-xl bg-[#FAFAF7] p-4 ring-1 ring-neutral-200">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Paid to date</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{money(budget.paid)}</p>
                  <p className="text-xs text-neutral-500">From invoices marked paid</p>
                </div>
                <div className="rounded-xl bg-[#101311] p-4 text-white ring-1 ring-neutral-800">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Balance due</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{money(budget.balance)}</p>
                  <p className="text-xs text-neutral-400">Invoiced − paid</p>
                </div>
              </div>
              {issuedInvoices.length > 0 && (
                <ul className="mt-4 divide-y divide-neutral-100 text-sm">
                  {issuedInvoices.map(i => (
                    <li key={i.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className="font-medium">{i.invoice_number}</span>
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-600">{i.status}</span>
                      {i.due_at && <span className="text-xs text-neutral-500">Due {fmtDate(i.due_at)}</span>}
                      {i.paid_at && <span className="text-xs text-neutral-500">Paid {fmtDate(i.paid_at)}</span>}
                      <span className="ml-auto font-semibold tabular-nums">{money(i.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-neutral-500">Paid-to-date reflects invoices whose status is “paid” in the workspace. Online payment tracking is not connected yet, so payments recorded elsewhere will not appear here.</p>
            </section>

            {/* Photos */}
            <section aria-label="Photos" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
              <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500">Photos · {photos.length}</h2>
              {photos.length === 0 && <p className="mt-3 text-sm text-neutral-600">No photos uploaded for this job yet — intake and technician photos will appear here.</p>}
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map(f => (
                  <figure key={f.id} className="overflow-hidden rounded-xl ring-1 ring-neutral-200">
                    {signedUrls[f.storage_path]
                      ? <a href={signedUrls[f.storage_path]} target="_blank" rel="noopener"><img src={signedUrls[f.storage_path]} alt={f.file_name} className="aspect-[4/3] w-full object-cover" loading="lazy" /></a>
                      : <div className="flex aspect-[4/3] items-center justify-center bg-neutral-100 text-neutral-400"><Icon name="photo" /></div>}
                    <figcaption className="px-2 py-1.5 text-xs">
                      <span className="block truncate font-medium" title={f.file_name}>{f.file_name}</span>
                      <span className="text-neutral-500">{fmtDate(f.created_at)}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
              <p className="mt-2 text-xs text-neutral-500">Captions use the uploaded file name — photo captions are not a stored field yet.</p>
            </section>

            {/* Files */}
            <section aria-label="Files" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500">Files · {files.length}</h2>
                <label className="ml-auto flex min-h-[40px] items-center gap-2 rounded-xl border border-neutral-300 px-3 print:hidden">
                  <Icon name="search" />
                  <input value={fileSearch} onChange={e => setFileSearch(e.target.value)} placeholder="Search this job’s files…" className="w-48 border-0 bg-transparent text-sm focus:outline-none" aria-label="Search files" />
                </label>
              </div>
              {view === 'client' ? (
                <p className="mt-3 rounded-xl bg-[#FAFAF7] p-4 text-sm text-neutral-700 ring-1 ring-neutral-200">
                  Documents for this job are shared by the office directly. Per-file client sharing isn’t available on job files yet, so nothing is listed here until the office sends it.
                </p>
              ) : (
                <>
                  <p className="mt-2 text-xs text-neutral-500">All files below are <strong>office-only</strong>. Job files have no per-file client-visibility field in the current schema, so this page cannot share individual files with the client yet.</p>
                  {fileGroups.length === 0 && <p className="mt-3 text-sm text-neutral-600">{files.length ? 'No files match your search.' : 'No files uploaded for this job yet.'}</p>}
                  {fileGroups.map(g => (
                    <div key={g.key} className="mt-4">
                      <h3 className="flex items-center gap-2 text-sm font-semibold"><Icon name="template" />{g.label}<span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{g.files.length}</span></h3>
                      <ul className="mt-1 divide-y divide-neutral-100 text-sm">
                        {g.files.map(f => (
                          <li key={f.id} className="flex flex-wrap items-center gap-2 py-2">
                            <span className="font-medium">{f.file_name}</span>
                            <span className="text-xs text-neutral-500">{fmtDate(f.created_at)}</span>
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-300">Office only</span>
                            {signedUrls[f.storage_path] && (
                              <a href={signedUrls[f.storage_path]} target="_blank" rel="noopener" className="ml-auto inline-flex min-h-[36px] items-center rounded-lg px-3 font-medium ring-1 ring-neutral-300 print:hidden">Open ↗</a>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </>
              )}
            </section>

            {/* Activity */}
            <section aria-label="Activity" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
              <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-500">Activity</h2>
              {timelineFallback && view === 'office' && <p className="mt-1 text-xs text-neutral-500">Timeline service unavailable — showing the notes thread directly.</p>}
              {visibleTimeline.length === 0 && <p className="mt-3 text-sm text-neutral-600">No activity recorded yet.</p>}
              <ol className="mt-3 space-y-3">
                {visibleTimeline.map(t => (
                  <li key={`${t.kind}-${t.id}-${t.created_at}`} className="flex gap-3 text-sm">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${t.kind === 'note' ? 'bg-[#FFD60A]' : t.kind === 'customer_update' ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
                    <div>
                      <p className="font-medium">{t.title}{t.metadata?.visibility === 'office' && view === 'office' && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-300">Office only</span>}</p>
                      {t.body && <p className="whitespace-pre-wrap text-neutral-700">{t.body}</p>}
                      <p className="text-xs text-neutral-500">{t.actor_name ? `${t.actor_name} · ` : ''}{fmtDateTime(t.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>

        <p className="mt-4 text-xs text-neutral-500 print:hidden">Report {reportNo} · Generated from live workspace records on {fmtDate(new Date().toISOString())}. Files are grouped by file name/type metadata; anything unrecognized lands in “Other uploads”.</p>
      </div>
    </main>
  );
}
