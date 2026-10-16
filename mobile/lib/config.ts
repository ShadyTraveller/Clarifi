import { toByteArray } from 'base64-js';

export function validatePublicConfig(url: string | undefined, key: string | undefined) {
  if (!url || !key) throw new Error('Workspace connection is not configured. Follow mobile/README.md to add the project settings.');
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('The workspace URL must be a valid HTTPS URL.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('The workspace URL must use HTTPS without embedded credentials.');
  if (key.startsWith('sb_publishable_')) return { url, key };
  try {
    const payload = key.split('.')[1];
    const encoded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = toByteArray(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='));
    const claim = JSON.parse(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
    if (claim.role === 'anon') return { url, key };
  } catch { /* Fail closed without including the supplied value in an error. */ }
  throw new Error('Use a Supabase publishable key or legacy anon key. Server credentials are not supported.');
}
