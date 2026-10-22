import 'server-only';
import { staffClient, errorResponse, readBody, HttpError } from '../../lib/server';
import { getSectionTemplate, buildSectionDraft } from '../../lib/section-templates';
import type { CatalogMaterial } from '../../lib/catalog-match';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Billdr-style sectioned estimate generator → POST /api/estimate-sections
 * Auth: staff session (Bearer), same as /api/lookup-price.
 *
 * Runs the real draft-generation flow and returns the draft + step trace:
 *   1. Gathering context — job record (when job_id is given) + template.
 *   2. Looking things up — deterministic catalog match per template line
 *      against supplier_materials (app/lib/catalog-match.ts, the same
 *      matcher the auto-estimate agent uses). Misses degrade to flagged
 *      placeholder lines; the office fills them with the existing
 *      /api/lookup-price pattern. A price is never invented.
 *   3. Quote summary — priced with @yavamo/core section math in the client.
 *
 * READ-ONLY BY DESIGN: this preview never writes quotes/jobs to the shared
 * production database. Every generated line stays DRAFT in the browser
 * behind the office review gate; saving is disabled in the preview.
 */

const CATALOG_SERVICES = ['doors', 'security-film', 'locksmith'] as const;

export async function POST(request: Request) {
  try {
    const { db, member } = await staffClient(request);
    const body = await readBody(request, 200_000);
    const template = getSectionTemplate(String(body.template_key || ''));
    const text = typeof body.text === 'string' ? body.text.slice(0, 18_000) : '';

    let job: any = null;
    if (body.job_id) {
      const { data } = await db
        .from('jobs')
        .select('id, request, details, service, status, clients(name, address)')
        .eq('id', String(body.job_id))
        .eq('organization_id', member.organization_id)
        .maybeSingle();
      if (!data) throw new HttpError(404, 'Job not found.');
      job = data;
    }

    const { data: materialRows, error: materialsError } = await db
      .from('supplier_materials')
      .select('id, name, brand, public_price_cents, retailer, source_url, unit, notes, service')
      .eq('organization_id', member.organization_id)
      .in('service', CATALOG_SERVICES as unknown as string[])
      .eq('is_active', true);
    if (materialsError) throw materialsError;

    const catalogByService: Record<string, CatalogMaterial[]> = {};
    for (const row of (materialRows || []) as any[]) {
      const { service, ...material } = row;
      (catalogByService[service] ||= []).push(material as CatalogMaterial);
    }

    const jobText = [
      text,
      job ? String(job.request || '') : '',
      job ? String(job.details || '') : '',
      template.name,
      template.description,
    ].filter(Boolean).join('\n');

    const jobLabel = job
      ? `${(job as any).clients?.name || 'Client'} — ${String(job.request || '').slice(0, 120)}`
      : undefined;

    const draft = buildSectionDraft({ template, catalogByService, jobText, jobLabel });

    return Response.json({
      ok: true,
      template: {
        key: draft.template.key,
        name: draft.template.name,
        service: draft.template.service,
        service_label: draft.template.serviceLabel,
        setting: draft.template.setting,
        description: draft.template.description,
      },
      sections: draft.sections,
      flags: draft.flags,
      trace: draft.trace,
      catalog_size: draft.catalogSize,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
