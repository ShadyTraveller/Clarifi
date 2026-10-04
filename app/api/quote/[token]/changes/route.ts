import { customerAction } from '../../../../lib/customer';
import { readBody, errorResponse } from '../../../../lib/server';
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try { const body = await readBody(request, 16000); return customerAction((await params).token, 'changes', { change: body.request_text }); } catch (error) { return errorResponse(error); }
}
