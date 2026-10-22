// Job Report helpers — pure functions over EXISTING records only.
// Nothing here invents data: every number comes from the job's quotes,
// quote_versions and invoices rows, and every file grouping comes from
// job_files metadata (file_name / mime_type).
//
// Payments caveat (Lavie, 2026-10-21: "leave the payments for now"):
// paid-to-date is derived from invoices whose status is 'paid' — the only
// paid signal that exists in the current schema. The payments table /
// provider integration is deferred, so an invoice that was paid outside
// the app's status flow will not be reflected until its status is updated.

import { roundMoney } from '@yavamo/core';

// ---- Progress ---------------------------------------------------------------
// Derived from the existing project_status enum (lead / estimate / active /
// completed) — the same four board columns as the pipeline. No new states.

export const JOB_PROGRESS_STAGES = [
  { key: 'lead', label: 'Lead' },
  { key: 'estimate', label: 'Estimate' },
  { key: 'active', label: 'Job' },
  { key: 'completed', label: 'Completed' },
] as const;

export function jobProgress(status: string): { index: number; pct: number; label: string } {
  const idx = JOB_PROGRESS_STAGES.findIndex(s => s.key === status);
  const index = idx >= 0 ? idx : 0;
  return {
    index,
    pct: Math.round(((index + 1) / JOB_PROGRESS_STAGES.length) * 100),
    label: JOB_PROGRESS_STAGES[index].label,
  };
}

// ---- Budget -----------------------------------------------------------------

export interface BudgetQuote {
  id: string;
  quote_number: string;
  status: string;
  created_at: string;
  quote_versions?: { version_number: number; subtotal: number; tax: number; total: number }[] | null;
}

export interface BudgetInvoice {
  id: string;
  invoice_number: string;
  status: string;
  total: number;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface JobBudget {
  /** Approved estimate total (latest version of the approved quote). */
  contractTotal: number | null;
  contractQuoteNumber: string | null;
  contractApproved: boolean;
  /** Latest quote total when nothing is approved yet — labelled as such in the UI. */
  latestEstimateTotal: number | null;
  latestEstimateNumber: string | null;
  /** Sum of issued invoices (status sent / paid / overdue). Drafts excluded. */
  invoiced: number;
  /** Sum of invoices with status 'paid' (see payments caveat above). */
  paid: number;
  /** invoiced − paid. */
  balance: number;
  invoiceCount: number;
  draftInvoiceCount: number;
}

function latestVersionTotal(q: BudgetQuote): number | null {
  const versions = [...(q.quote_versions || [])].sort((a, b) => b.version_number - a.version_number);
  return versions.length ? Number(versions[0].total) || 0 : null;
}

const ISSUED_INVOICE_STATUSES = new Set(['sent', 'paid', 'overdue']);

export function summarizeJobBudget(quotes: BudgetQuote[], invoices: BudgetInvoice[]): JobBudget {
  const byNewest = [...quotes].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const approved = byNewest.find(q => q.status === 'approved') || null;
  const latest = byNewest[0] || null;

  const issued = invoices.filter(i => ISSUED_INVOICE_STATUSES.has(i.status));
  const invoiced = roundMoney(issued.reduce((s, i) => s + (Number(i.total) || 0), 0));
  const paid = roundMoney(invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (Number(i.total) || 0), 0));

  return {
    contractTotal: approved ? latestVersionTotal(approved) : null,
    contractQuoteNumber: approved?.quote_number ?? null,
    contractApproved: !!approved,
    latestEstimateTotal: latest ? latestVersionTotal(latest) : null,
    latestEstimateNumber: latest?.quote_number ?? null,
    invoiced,
    paid,
    balance: roundMoney(invoiced - paid),
    invoiceCount: issued.length,
    draftInvoiceCount: invoices.filter(i => i.status === 'draft').length,
  };
}

// ---- Files ------------------------------------------------------------------
// Folder-style grouping from existing metadata only:
//   image/* mime → Photos; otherwise the file name decides (invoice /
//   quote|estimate / approval|contract|signed|coi), else Other uploads.
// job_files has NO caption and NO client-visibility column in the current
// schema — the report uses the file name as its caption and cannot offer a
// per-file "shared with client" toggle without an additive migration.

export type JobFileGroupKey = 'estimates' | 'invoices' | 'photos' | 'approvals' | 'other';

export const JOB_FILE_GROUPS: { key: JobFileGroupKey; label: string }[] = [
  { key: 'estimates', label: 'Estimates / Quotes' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'photos', label: 'Photos' },
  { key: 'approvals', label: 'Approvals / Contracts' },
  { key: 'other', label: 'Other uploads' },
];

export interface JobFileLike {
  id: string;
  file_name: string;
  mime_type: string | null;
  storage_path: string;
  created_at: string;
}

export function classifyJobFile(f: Pick<JobFileLike, 'file_name' | 'mime_type'>): JobFileGroupKey {
  if ((f.mime_type || '').toLowerCase().startsWith('image/')) return 'photos';
  const n = (f.file_name || '').toLowerCase();
  if (/invoice/.test(n)) return 'invoices';
  if (/quote|estimate|proposal/.test(n)) return 'estimates';
  if (/approval|approved|contract|agreement|signed|signature|coi|certificate/.test(n)) return 'approvals';
  return 'other';
}

export function isPhotoFile(f: Pick<JobFileLike, 'file_name' | 'mime_type'>): boolean {
  return classifyJobFile(f) === 'photos';
}

export function groupJobFiles<T extends JobFileLike>(files: T[]): { key: JobFileGroupKey; label: string; files: T[] }[] {
  return JOB_FILE_GROUPS.map(g => ({ ...g, files: files.filter(f => classifyJobFile(f) === g.key) }))
    .filter(g => g.files.length > 0);
}
