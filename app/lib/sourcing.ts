import 'server-only';
import { approvedSupplierUrl, type Product } from './domain';
// Only explicit CAD offers from a retailer's product page are accepted as costs.
export async function verifyProduct(product: Product): Promise<Product> {
  const unconfirmed = { ...product, cost: null, image: null, evidence: 'Retailer price or photo could not be independently confirmed. Check the source.' };
  try {
    let url = product.url, response: Response | null = null;
    for (let i = 0; i < 3; i++) {
      if (!approvedSupplierUrl(url)) return unconfirmed;
      response = await fetch(url, { redirect: 'manual', headers: { accept: 'text/html' }, signal: AbortSignal.timeout(7000) });
      if (response.status >= 300 && response.status < 400) { url = new URL(response.headers.get('location') || '', url).href; continue; }
      break;
    }
    if (!response?.ok) return unconfirmed;
    const html = (await response.text()).slice(0, 2_000_000);
    let price: number | null = null, image: string | null = null;
    function inspect(value: any) {
      if (Array.isArray(value)) { value.forEach(inspect); return; }
      if (!value || typeof value !== 'object') return;
      if (value['@type'] === 'Product' || value['@type']?.includes?.('Product')) {
        const offers = Array.isArray(value.offers) ? value.offers : [value.offers];
        for (const offer of offers) if (offer?.priceCurrency === 'CAD' && Number.isFinite(Number(offer.price)) && Number(offer.price) >= 0) { price = Number(offer.price); break; }
        const candidate = Array.isArray(value.image) ? value.image[0] : value.image;
        if (typeof candidate === 'string' && candidate.startsWith('https://')) image = candidate;
      }
      if (value['@graph']) inspect(value['@graph']);
    }
    for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) { try { inspect(JSON.parse(match[1])); } catch {} }
    if (price == null) return unconfirmed;
    return { ...product, cost: price, image, evidence: 'CAD price verified from the retailer’s product offer.', checked_at: new Date().toISOString() };
  } catch { return unconfirmed; }
}
