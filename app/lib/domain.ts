export const SERVICES = [
  { key: 'security_film', label: 'Security Film', detail: 'High-impact shatter film and installation' },
  { key: 'locksmith', label: 'Locksmith', detail: 'Rekey and lock change · no cars or key fobs' },
  { key: 'windows', label: 'Windows', detail: 'Glass replacement' },
  { key: 'doors', label: 'Doors', detail: 'Repair or replacement' },
  { key: 'skincare', label: 'Skincare', detail: 'Skincare service call' },
] as const;
export type Service = typeof SERVICES[number]['label'];
export function serviceLabel(value: string): Service {
  return SERVICES.find(s => s.key === value || s.label.toLowerCase() === value?.toLowerCase())?.label || 'Doors';
}
const openingPhotos = ['Threshold / sill', 'Existing lock / handle close-up', 'Manufacturer label / sticker if present', 'Exterior cladding / flashing', 'Access path / work area', 'Verify rough opening width and height', 'Confirm configuration / handing', 'Confirm frame, glazing and lock specification', 'Confirm trim, flashing, disposal and access', 'Full patio door — exterior', 'Full patio door — interior', 'Frame / jamb close-ups'];
export const PHOTO_CHECKLISTS: Record<Service, string[]> = {
  Doors: openingPhotos, Windows: openingPhotos,
  'Security Film': ['Full glazing — interior', 'Full glazing — exterior', 'Glass edges and existing damage', 'Manufacturer label / glass specification', 'Width and height of each pane', 'Access path and work area'],
  Locksmith: ['Existing damage close-up — scratches, splintered wood or warped frame', 'Lock faceplate / edge of door — latch, deadbolt and manufacturer', 'Existing cylinder / keyway close-up', 'Handle / lever / trim — interior and exterior design and finish', 'Strike plate & door jamb — condition and alignment'],
  Skincare: ['Primary concern close-up, with client consent', 'Treatment area overview, with client consent', 'Products or equipment requested'],
};
export type ClientInfo = { name: string; role: 'owner' | 'tenant' | 'property_management' | 'commercial' | 'other'; email: string; phone: string; address: string };
export type RequestDraft = { client: ClientInfo; title: string; details: string; service: Service; markdown: string; latitude: number | null; longitude: number | null; technician_id: string | null; assignment_reason: string };
export type Product = { name: string; supplier: string; cost: number | null; url: string; image: string | null; evidence: string; checked_at: string };
export type EstimateLine = { name: string; quantity: number; unit: string; cost: number | null; price: number | null; source?: string; image?: string; markup?: number };
export type EstimateDraft = { scope: string; lines: EstimateLine[]; products: Product[]; notes: string; template_name: string };
export function squareFeet(width: number, height: number, count = 1) {
  if (![width, height, count].every(Number.isFinite) || width <= 0 || height <= 0 || count <= 0) return 0;
  return width * height * count / 144;
}
import { roundMoney } from '@yavamo/core';
// Canonical money rounding lives in @yavamo/core (packages/core/src/pricing.ts);
// re-exported here so existing domain.ts consumers are unaffected.
export { roundMoney };
export function totals(lines: EstimateLine[], taxPct = 13, depositPct = 50) {
  const subtotal = roundMoney(lines.reduce((sum, l) => sum + roundMoney(l.quantity * (l.price ?? 0)), 0));
  const tax = roundMoney(subtotal * taxPct / 100), total = roundMoney(subtotal + tax);
  return { subtotal, tax, total, deposit: roundMoney(total * depositPct / 100) };
}
export function hasCoordinates(point: { latitude?: unknown; longitude?: unknown }) {
  return point.latitude != null && point.longitude != null && Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)) && Math.abs(Number(point.latitude)) <= 90 && Math.abs(Number(point.longitude)) <= 180;
}
export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = (n: number) => n * Math.PI / 180;
  const dlat = rad(b.latitude - a.latitude), dlng = rad(b.longitude - a.longitude);
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dlng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function closestTechnician(techs: any[], service: Service, point: { latitude: number | null; longitude: number | null }, now = Date.now()) {
  if (!hasCoordinates(point)) return null;
  const eligible = techs.filter(t => t.active !== false && t.specialties?.some((s: string) => SERVICES.some(option => (s.toLowerCase() === option.key || s.toLowerCase() === option.label.toLowerCase()) && option.label === service)) && hasCoordinates(t) && Number.isFinite(new Date(t.location_updated_at || 0).getTime()) && now - new Date(t.location_updated_at || 0).getTime() >= 0 && now - new Date(t.location_updated_at || 0).getTime() < 30 * 60 * 1000);
  return eligible.map(t => ({ ...t, distance: distanceKm(point as { latitude: number; longitude: number }, t) })).sort((a, b) => a.distance - b.distance)[0] || null;
}
export function requestMarkdown(d: Pick<RequestDraft, 'client' | 'title' | 'details' | 'service' | 'assignment_reason'>) {
  const safe = (s: string) => s.replace(/[\[\]<>]/g, '').replace(/\n/g, ' ');
  return `# ${safe(d.title)}\n\n**Service:** ${d.service}\n\n## Client\n- **Name:** ${safe(d.client.name)}\n- **Property role:** ${d.client.role.replaceAll('_', ' ')}\n- **Phone:** ${safe(d.client.phone) || 'Not provided'}\n- **Email:** ${safe(d.client.email) || 'Not provided'}\n- **Address:** ${safe(d.client.address) || 'Not provided'}\n\n## Work requested\n${d.details}\n\n## Assignment\n${d.assignment_reason}`;
}
export function approvedSupplierUrl(url: string) {
  try { const u = new URL(url); return u.protocol === 'https:' && ['amazon.ca', 'www.amazon.ca', 'homedepot.ca', 'www.homedepot.ca'].includes(u.hostname); } catch { return false; }
}
