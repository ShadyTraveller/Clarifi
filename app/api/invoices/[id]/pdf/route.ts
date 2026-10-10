import { staffClient, errorResponse } from '../../../../lib/server';
import { serviceDb } from '../../../agents/lib';

export const dynamic = 'force-dynamic';

const money = (n: number) =>
  `$${Number(n || 0).toFixed(2)}`;

/**
 * Office → GET /api/invoices/[id]/pdf
 * Auth: staff session (same as quote send route).
 * Generates a printable invoice PDF in-house (pdfkit, no external API).
 * Line items come from the job's latest approved quote.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await staffClient(request);
    const { id } = await params;
    if (!id) return errorResponse(400, 'Invoice id is required.');

    const db = serviceDb();

    const { data: invoice, error: invErr } = await db
      .from('invoices')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (invErr || !invoice) return errorResponse(404, 'Invoice not found.');

    const [{ data: client }, { data: job }] = await Promise.all([
      db.from('clients').select('*').eq('id', invoice.client_id).maybeSingle(),
      db.from('jobs').select('*').eq('id', invoice.job_id).maybeSingle(),
    ]);

    // Line items from the latest version of the job's most recent quote.
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

    // Build PDF with pdfkit.
    const { default: PDFDocument } = await import('pdfkit');
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks)))
    );

    const inv = invoice as any;
    const cl = (client || {}) as any;
    const jb = (job || {}) as any;

    // Header
    doc.fontSize(24).font('Helvetica-Bold').text('YAVAMO', 50, 50);
    doc.fontSize(10).font('Helvetica').fillColor('#666')
      .text('yavamo.ca', 50, 78);
    doc.fillColor('#000');
    doc.fontSize(20).font('Helvetica-Bold')
      .text('INVOICE', 400, 50, { align: 'right' });
    doc.fontSize(10).font('Helvetica')
      .text(`Invoice ${inv.invoice_number || ''}`, 400, 76, { align: 'right' })
      .text(`Date: ${new Date(inv.created_at).toLocaleDateString()}`, 400, 90, { align: 'right' })
      .text(`Status: ${(inv.status || 'draft').toUpperCase()}`, 400, 104, { align: 'right' });

    // Bill to
    doc.fontSize(11).font('Helvetica-Bold').text('Bill to:', 50, 140);
    doc.font('Helvetica').fontSize(10)
      .text(cl.name || 'Client', 50, 156)
      .text(cl.address || '', 50, 170)
      .text([cl.phone, cl.email].filter(Boolean).join(' · '), 50, 184);

    // Job ref
    if (jb.request) {
      doc.fontSize(10).fillColor('#666').text(`Job: ${jb.request}`, 50, 210);
      doc.fillColor('#000');
    }

    // Line items table
    let y = 240;
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Description', 50, y);
    doc.text('Qty', 350, y, { width: 50, align: 'right' });
    doc.text('Unit', 410, y, { width: 70, align: 'right' });
    doc.text('Total', 490, y, { width: 70, align: 'right' });
    y += 16;
    doc.moveTo(50, y).lineTo(560, y).strokeColor('#ccc').stroke();
    y += 10;

    doc.font('Helvetica');
    for (const l of lines) {
      if (y > 680) { doc.addPage(); y = 50; }
      doc.text(l.label, 50, y, { width: 290 });
      doc.text(String(l.quantity), 350, y, { width: 50, align: 'right' });
      doc.text(money(l.unit_price), 410, y, { width: 70, align: 'right' });
      doc.text(money(l.total), 490, y, { width: 70, align: 'right' });
      y += 18;
    }
    if (lines.length === 0) {
      doc.fillColor('#666').text('See approved estimate for line-item detail.', 50, y);
      doc.fillColor('#000');
      y += 18;
    }

    // Totals
    y += 10;
    doc.moveTo(380, y).lineTo(560, y).strokeColor('#ccc').stroke();
    y += 10;
    doc.fontSize(10);
    doc.text('Subtotal', 400, y, { width: 80, align: 'right' });
    doc.text(money(inv.subtotal), 490, y, { width: 70, align: 'right' });
    y += 16;
    doc.text('Tax', 400, y, { width: 80, align: 'right' });
    doc.text(money(inv.tax), 490, y, { width: 70, align: 'right' });
    y += 16;
    doc.font('Helvetica-Bold').fontSize(12);
    doc.text('Total', 400, y, { width: 80, align: 'right' });
    doc.text(money(inv.total), 490, y, { width: 70, align: 'right' });

    // Footer
    doc.font('Helvetica').fontSize(9).fillColor('#666')
      .text('Thank you for choosing Yavamo.', 50, 720, { align: 'center', width: 510 });

    doc.end();
    const pdf = await done;

    return new Response(pdf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${inv.invoice_number || id.slice(0, 8)}.pdf"`,
        'Content-Length': String(pdf.length),
      },
    });
  } catch (e: any) {
    return errorResponse(e?.status || 500, e?.message || 'Could not generate the invoice PDF.');
  }
}
