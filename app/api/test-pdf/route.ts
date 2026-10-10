import { PDFDocument, StandardFonts } from 'pdf-lib';

export const dynamic = 'force-dynamic';

export async function GET() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([612, 792]);
  page.drawText('Test', { x: 50, y: 700, size: 24, font });
  const bytes = await pdf.save();
  return new Response(bytes as unknown as BodyInit, {
    headers: { 'Content-Type': 'application/pdf' },
  });
}
