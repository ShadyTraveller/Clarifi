import type { ServiceKey } from '@yavamo/core';

export const relationships = { tenant: 'Tenant', landlord: 'Landlord', owner: 'Owner', property_management: 'Property management', institution: 'Institution', commercial: 'Commercial', other: 'Other' } as const;
export type Relationship = keyof typeof relationships;
export type EntryDraft = { name: string; email: string; phone: string; address: string; relationship: Relationship; service: ServiceKey; request: string; details: string; unit: string; gate: string };
export const emptyEntry: EntryDraft = { name: '', email: '', phone: '', address: '', relationship: 'tenant', service: 'locksmith', request: '', details: '', unit: '', gate: '' };
export type ClientMatch = { id: string; name: string; email: string | null; phone: string | null; address: string | null; relationship: Exclude<Relationship, 'owner'> };
export type EntryPhoto = { id: string; uri: string; name: string; mime: string; size: number; saved: boolean };
export const maxPhotoBytes = 4 * 1024 * 1024;
export function normalizeEmail(email: string | null) { return email?.trim().toLowerCase() || null; }
export function phoneDigits(phone: string | null) { return phone?.replace(/\D/g, '') || null; }
export function sameContact(client: Pick<ClientMatch, 'email' | 'phone'>, draft: Pick<EntryDraft, 'email' | 'phone'>) {
  const email = normalizeEmail(draft.email), phone = phoneDigits(draft.phone);
  return !!((email && email === normalizeEmail(client.email)) || (phone && phone === phoneDigits(client.phone)));
}
export function validateEntry(draft: EntryDraft) {
  const errors: Partial<Record<keyof EntryDraft, string>> = {};
  if (!draft.name.trim()) errors.name = 'Enter the client’s name.';
  if (!draft.request.trim()) errors.request = 'Add a short request title.';
  if (draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) errors.email = 'Enter a valid email address.';
  if (draft.phone.trim() && (phoneDigits(draft.phone)?.length ?? 0) < 7) errors.phone = 'Enter a phone number with at least 7 digits.';
  return errors;
}
export function clientPayload(draft: EntryDraft, organizationId: string) {
  return { organization_id: organizationId, name: draft.name.trim(), email: normalizeEmail(draft.email), phone: draft.phone.trim() || null, address: draft.address.trim() || null, relationship: draft.relationship === 'owner' ? 'other' : draft.relationship };
}
export function leadPayload(draft: EntryDraft, organizationId: string, clientId: string) {
  const access = [draft.unit.trim() && `Unit ${draft.unit.trim()}`, draft.gate.trim() && `Gate ${draft.gate.trim()}`].filter(Boolean).join(', ');
  return { organization_id: organizationId, client_id: clientId, request: draft.request.trim(), details: [access, draft.details.trim()].filter(Boolean).join('\n\n') || null, status: 'lead' as const, service: draft.service };
}
export function requestPayload(draft: EntryDraft, organizationId: string, sourceRef: string) {
  const contact = clientPayload(draft, organizationId);
  const job = leadPayload(draft, organizationId, '');
  return {
    target_org: organizationId,
    client_info: { name: contact.name, role: contact.relationship, email: contact.email, phone: contact.phone, address: contact.address },
    job_info: { title: job.request, details: job.details, service: job.service, markdown: null, technician_id: null, latitude: null, longitude: null },
    p_source_ref: sourceRef,
  };
}
export function sanitizePhotoName(name: string) { return name.toLowerCase().replace(/[^a-z0-9.-]/g, '-') || 'photo.jpg'; }
export function validatePhoto(size: number, mime: string) {
  if (!mime.startsWith('image/')) return 'Choose an image file.';
  if (!Number.isFinite(size) || size <= 0) return 'This photo could not be read. Choose it again.';
  return size > maxPhotoBytes ? 'Each photo must be 4 MB or smaller.' : null;
}
