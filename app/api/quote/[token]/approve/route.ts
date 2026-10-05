import { customerAction } from '../../../../lib/customer';
import { readBody, errorResponse } from '../../../../lib/server';
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    // Larger limit: the body may carry a drawn-signature PNG data URL.
    const body = await readBody(request, 262144);
    return customerAction((await params).token, 'approve', {
      name: body.typed_name,
      accepted: body.accepted === true,
      signature: typeof body.signature === 'string' ? body.signature : undefined,
    });
  } catch (error) { return errorResponse(error); }
}
