import { staffClient, errorResponse, HttpError } from '../../../../lib/server';
import { serviceDb } from '../../../agents/lib';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const dynamic = 'force-dynamic';

const money = (n: number) => `$${Number(n || 0).toFixed(2)}`;

/**
 * Office → GET /api/invoices/[id]/pdf
 * Auth: staff session (same as quote send route).
 * Generates a printable invoice PDF in-house (pdf-lib, no external API).
 * Line items come from the job's latest quote.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await staffClient(request);
    const { id } = await params;
    if (!id) throw new HttpError(400, 'Invoice id is required.');

    const db = serviceDb();

    const { data: invoice, error: invErr } = await db
      .from('invoices')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (invErr || !invoice) throw new HttpError(404, 'Invoice not found.');

    const [{ data: client }, { data: job }] = await Promise.all([
      db.from('clients').select('*').eq('id', invoice.client_id).maybeSingle(),
      db.from('jobs').select('*').eq('id', invoice.job_id).maybeSingle(),
    ]);

    let lines: Array<{ label: string; quantity: number; unit_price: number; total: number }> = [];
    const { data: quotes } = await db
      .from('quotes')
      .select('id')
      .eq('job_id', invoice.job_id)
      .order('created_at', { ascending: false })
      .limit(1);
    if (quotes && quotes.length > 0) {
      const { data: versions } = await db
        .from('quote_versions')
        .select('id')
        .eq('quote_id', quotes[0].id)
        .order('version_number', { ascending: false })
        .limit(1);
      if (versions && versions.length > 0) {
        const { data: items } = await db
          .from('quote_line_items')
          .select('label, quantity, unit_price, line_total')
          .eq('quote_version_id', versions[0].id)
          .order('sort_order');
        lines = (items || []).map((l: any) => ({
          label: l.label || 'Item',
          quantity: Number(l.quantity) || 1,
          unit_price: Number(l.unit_price) || 0,
          total: Number(l.line_total) || 0,
        }));
      }
    }

    const inv = invoice as any;
    const cl = (client || {}) as any;
    const jb = (job || {}) as any;

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const page = pdf.addPage([612, 792]); // LETTER
    const { height } = page.getSize();
    const black = rgb(0, 0, 0);
    const grey = rgb(0.4, 0.4, 0.4);

    let y = height - 60;
    page.drawText('YAVAMO', { x: 50, y, size: 24, font: bold, color: black });
    page.drawText('INVOICE', { x: 470, y, size: 20, font: bold, color: black });
    y -= 22;
    page.drawText('yavamo.ca', { x: 50, y, size: 10, font, color: grey });
    page.drawText(`Invoice ${inv.invoice_number || ''}`, { x: 400, y, size: 10, font, color: black });
    y -= 14;
    page.drawText(`Date: ${new Date(inv.created_at).toLocaleDateString()}`, { x: 400, y, size: 10, font });
    y -= 14;
    page.drawText(`Status: ${(inv.status || 'draft').toUpperCase()}`, { x: 400, y, size: 10, font });

    y -= 36;
    page.drawText('Bill to:', { x: 50, y, size: 11, font: bold });
    y -= 16;
    page.drawText(cl.name || 'Client', { x: 50, y, size: 10, font });
    y -= 14;
    if (cl.address) { page.drawText(String(cl.address), { x: 50, y, size: 10, font }); y -= 14; }
    const contact = [cl.phone, cl.email].filter(Boolean).join(' · ');
    if (contact) { page.drawText(contact, { x: 50, y, size: 10, font }); y -= 14; }
    if (jb.request) {
      y -= 8;
      page.drawText(`Job: ${String(jb.request).slice(0, 80)}`, { x: 50, y, size: 10, font, color: grey });
    }

    y -= 30;
    page.drawText('Description', { x: 50, y, size: 10, font: bold });
    page.drawText('Qty', { x: 350, y, size: 10, font: bold });
    page.drawText('Unit', { x: 410, y, size: 10, font: bold });
    page.drawText('Total', { x: 490, y, size: 10, font: bold });
    y -= 8;
    page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1, color: grey });
    y -= 16;

    for (const l of lines) {
      if (y < 120) break; // single page; totals below
      page.drawText(l.label.slice(0, 48), { x: 50, y, size: 10, font });
      page.drawText(String(l.quantity), { x: 350, y, size: 10, font });
      page.drawText(money(l.unit_price), { x: 410, y, size: 10, font });
      page.drawText(money(l.total), { x: 490, y, size: 10, font });
      y -= 16;
    }
    if (lines.length === 0) {
      page.drawText('See approved estimate for line-item detail.', { x: 50, y, size: 10, font, color: grey });
      y -= 16;
    }

    y -= 12;
    page.drawLine({ start: { x: 380, y }, end: { x: 562, y }, thickness: 1, color: grey });
    y -= 18;
    page.drawText('Subtotal', { x: 420, y, size: 10, font });
    page.drawText(money(inv.subtotal), { x: 490, y, size: 10, font });
    y -= 16;
    page.drawText('Tax', { x: 420, y, size: 10, font });
    page.drawText(money(inv.tax), { x: 490, y, size: 10, font });
    y -= 18;
    page.drawText('Total', { x: 420, y, size: 12, font: bold });
    page.drawText(money(inv.total), { x: 490, y, size: 12, font: bold });

    page.drawText('Thank you for choosing Yavamo.', {
      x: 50, y: 60, size: 9, font, color: grey,
    });

    const bytes = await pdf.save();
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${inv.invoice_number || id.slice(0, 8)}.pdf"`,
        'Content-Length': String(bytes.length),
      },
    });
  } catch (e: any) {
    return errorResponse(e);
  }
}
