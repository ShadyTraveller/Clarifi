import 'server-only';
import { readBody } from '../../../lib/server';
import { serviceDb, cronDenied } from '../lib';
import { ASSESSMENT_FEE_CENTS } from '../agent-libs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Receptionist agent → POST /api/agents/approval-sweep
 * Auth: Authorization: Bearer <CRON_SECRET>.
 *
 * Every cycle: find quotes with status='approved' that have not been credited
 * yet (assessment_credited_cents=0).
 * - If the job collected the assessment fee before the visit
 *   (jobs.assessment_fee_status='collect_before_visit') → credit $69
 *   (assessment_credited_cents=6900) and flip the job to 'credited'.
 * - Otherwise leave 0 and report "add $69 assessment fee to invoice".
 *
 * Idempotent: only rows with assessment_credited_cents=0 are touched, and
 * quote ids already processed by a previous sweep run (recorded in agent_runs)
 * are skipped so the office is not nagged twice.
 *
 * Never touches invoices (invoices are only sent by the office — hard rule);
 * the caller emails the office summary.
 */

interface ProcessedItem {
  quote_id: string;
  credited: boolean;
  note: string;
}

export async function POST(request: Request) {
  try {
    const denied = cronDenied(request);
    if (denied) return denied;

    const body = await readBody(request, 200_000);
    const organization_id = String(body.organization_id || '');
    if (!organization_id) {
      return Response.json({ error: 'organization_id is required.' }, { status: 400 });
    }

    const db = serviceDb();

    // Idempotency: quote ids this sweep already handled in earlier runs.
    const handled = new Set<string>();
    const { data: runs } = await db
      .from('agent_runs')
      .select('summary')
      .eq('organization_id', organization_id)
      .eq('agent', 'approval_sweep')
      .order('started_at', { ascending: false })
      .limit(25);
    for (const run of runs || []) {
      const ids = (run.summary as { handled_quote_ids?: unknown } | null)?.handled_quote_ids;
      if (Array.isArray(ids)) for (const id of ids) handled.add(String(id));
    }

    const { data: quotes, error: quotesError } = await db
      .from('quotes')
      .select('id, job_id, assessment_credited_cents, jobs!inner(assessment_fee_status)')
      .eq('organization_id', organization_id)
      .eq('status', 'approved')
      .eq('assessment_credited_cents', 0);
    if (quotesError) throw quotesError;

    const processed: ProcessedItem[] = [];
    const handledIds: string[] = [];

    for (const quote of quotes || []) {
      if (handled.has(String(quote.id))) continue;
      handledIds.push(String(quote.id));
      const jobStatus = (quote.jobs as { assessment_fee_status?: string } | null)?.assessment_fee_status;

      if (jobStatus === 'collect_before_visit') {
        const { error: quoteError } = await db
          .from('quotes')
          .update({ assessment_credited_cents: ASSESSMENT_FEE_CENTS })
          .eq('id', quote.id);
        if (quoteError) throw quoteError;
        const { error: jobError } = await db
          .from('jobs')
          .update({ assessment_fee_status: 'credited' })
          .eq('id', quote.job_id);
        if (jobError) throw jobError;
        processed.push({
          quote_id: String(quote.id),
          credited: true,
          note: '$69 assessment fee credited toward the job invoice.',
        });
      } else {
        processed.push({
          quote_id: String(quote.id),
          credited: false,
          note: 'Add $69 assessment fee to the invoice — it was not collected before the visit.',
        });
      }
    }

    await db.from('agent_runs').insert({
      organization_id,
      agent: 'approval_sweep',
      finished_at: new Date().toISOString(),
      status: 'completed',
      summary: { handled_quote_ids: handledIds, processed },
    });

    return Response.json({ ok: true, processed });
  } catch (error) {
    return Response.json({ error: 'The approval sweep could not run.' }, { status: 500 });
  }
}
