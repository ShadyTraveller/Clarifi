import { customerAction } from '../../../lib/customer';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) { return customerAction((await params).token, 'read'); }
