import { customerAction } from '../../../../lib/customer';
import { readBody, errorResponse } from '../../../../lib/server';
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try { const body = await readBody(request, 16000); return customerAction((await params).token, 'approve', { name: body.typed_name, accepted: body.accepted === true }); } catch (error) { return errorResponse(error); }
}
