import { staffClient, errorResponse, readBody } from '../../lib/server';
import { verifyProduct } from '../../lib/sourcing';
import type { Product } from '../../lib/domain';

const ALLOWED_HOSTS = ['homedepot.ca', 'www.homedepot.ca', 'amazon.ca', 'www.amazon.ca'];

/**
 * Staff-only supplier price lookup for the estimate builder.
 * Accepts a retailer product URL, allowlists the host, and verifies a CAD
 * price via verifyProduct. Never blocks estimate creation — failures return
 * { cost: null } so the office can enter the price manually.
 */
export async function POST(request: Request) {
  try {
    await staffClient(request);
    const { url } = await readBody(request, 100_000);
    let parsed: URL;
    try {
      parsed = new URL(String(url ?? ''));
    } catch {
      return Response.json({ cost: null, note: 'That link is not valid.' });
    }
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      return Response.json({ cost: null, note: 'Only homedepot.ca and amazon.ca links are supported.' });
    }
    const supplier = parsed.hostname.includes('homedepot') ? 'Home Depot Canada' : 'Amazon Canada';
    const slug = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? 'Product')
      .replace(/[-_+]+/g, ' ')
      .replace(/\.html?$/i, '')
      .slice(0, 120)
      .trim();
    const product: Product = {
      name: slug || 'Supplier product',
      supplier,
      cost: null,
      url: parsed.href,
      image: null,
      evidence: '',
      checked_at: new Date().toISOString(),
    };
    const verified = await verifyProduct(product);
    if (verified.cost == null) {
      return Response.json({ cost: null, note: "Couldn't verify a price — enter it manually." });
    }
    return Response.json({ cost: verified.cost, note: null });
  } catch (e) {
    return errorResponse(e);
  }
}
