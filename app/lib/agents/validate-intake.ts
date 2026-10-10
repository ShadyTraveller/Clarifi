/**
 * Intake validation: verify client contact data at request creation.
 *
 * Three free services, all "validate and flag" — they warn the office about
 * suspicious data but NEVER block or auto-reject a request. The office
 * reviews everything.
 *
 * - Nominatim (OpenStreetMap): address exists? + coordinates for dispatch.
 *   No key. Usage policy: 1 req/sec, identify with User-Agent.
 * - LifeStep: email syntax, MX records, disposable detection, typo suggestions.
 *   No key. GET /validate?email=...
 * - Veriphone: phone number validity + carrier/line type.
 *   Needs VERIPHONE_API_KEY (free tier). Skipped gracefully if unset.
 *
 * Every check has a timeout and fails open: on network/API error the field
 * is marked "unchecked", never "invalid".
 */

export interface EmailCheck {
  checked: boolean;
  valid: boolean | null; // null = unchecked
  verdict?: string;
  suggestion?: string | null;
  is_disposable?: boolean;
  score?: number;
}

export interface PhoneCheck {
  checked: boolean;
  valid: boolean | null;
  carrier?: string | null;
  line_type?: string | null;
}

export interface AddressCheck {
  checked: boolean;
  found: boolean | null;
  latitude?: number | null;
  longitude?: number | null;
  display_name?: string | null;
}

export interface IntakeValidation {
  email: EmailCheck;
  phone: PhoneCheck;
  address: AddressCheck;
}

const FETCH_TIMEOUT_MS = 8000;

async function fetchJson(url: string, init?: RequestInit): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** LifeStep: heuristic email validation (no SMTP probe). */
export async function validateEmail(email: string): Promise<EmailCheck> {
  if (!email || !email.includes('@')) {
    return { checked: true, valid: false, verdict: 'invalid_syntax' };
  }
  const data = await fetchJson(
    `https://email.lifestep.io/validate?email=${encodeURIComponent(email.trim())}`
  );
  if (!data || typeof data.syntax_valid !== 'boolean') {
    return { checked: false, valid: null };
  }
  const valid =
    data.syntax_valid && data.has_mx === true && data.is_disposable === false;
  return {
    checked: true,
    valid,
    verdict: data.verdict || undefined,
    suggestion: data.suggestion || null,
    is_disposable: data.is_disposable ?? undefined,
    score: typeof data.score === 'number' ? data.score : undefined,
  };
}

/** Veriphone: phone validity + carrier. Skipped when no API key is set. */
export async function validatePhone(phone: string): Promise<PhoneCheck> {
  const key = process.env.VERIPHONE_API_KEY;
  if (!key) return { checked: false, valid: null };
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.replace('+', '').length < 7) {
    return { checked: true, valid: false };
  }
  const data = await fetchJson(
    `https://api.veriphone.io/v2/verify?phone=${encodeURIComponent(digits)}&key=${encodeURIComponent(key)}`
  );
  if (!data || typeof data.phone_valid !== 'boolean') {
    return { checked: false, valid: null };
  }
  return {
    checked: true,
    valid: data.phone_valid,
    carrier: data.carrier || null,
    line_type: data.phone_type || null,
  };
}

/** Nominatim: address exists? + coordinates. Biased to Canada. */
export async function geocodeAddress(address: string): Promise<AddressCheck> {
  if (!address || address.trim().length < 5) {
    return { checked: true, found: false };
  }
  const data = await fetchJson(
    `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(address.trim())}&format=json&limit=1&countrycodes=ca`,
    { headers: { 'User-Agent': 'Yavamo/1.0 (office@yavamo.ca)' } }
  );
  if (!Array.isArray(data)) {
    return { checked: false, found: null };
  }
  if (data.length === 0) {
    return { checked: true, found: false };
  }
  const hit = data[0];
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  return {
    checked: true,
    found: Number.isFinite(lat) && Number.isFinite(lng),
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
    display_name: hit.display_name || null,
  };
}

/** Run all three checks in parallel. Never throws. */
export async function validateIntake(opts: {
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}): Promise<IntakeValidation> {
  const [email, phone, address] = await Promise.all([
    opts.email ? validateEmail(opts.email) : Promise.resolve({ checked: false, valid: null } as EmailCheck),
    opts.phone ? validatePhone(opts.phone) : Promise.resolve({ checked: false, valid: null } as PhoneCheck),
    opts.address ? geocodeAddress(opts.address) : Promise.resolve({ checked: false, found: null } as AddressCheck),
  ]);
  return { email, phone, address };
}

/**
 * Human-readable flags for the office. Returns [] when everything is fine
 * or unchecked. These are warnings, not rejections.
 */
export function validationFlags(v: IntakeValidation): string[] {
  const flags: string[] = [];
  if (v.email.checked && (v.email.valid === false || v.email.verdict === 'risky')) {
    flags.push(
      v.email.suggestion
        ? `Email looks wrong — did you mean ${v.email.suggestion}?`
        : `Email failed validation (${v.email.verdict || 'invalid'}).`
    );
  } else if (v.email.checked && v.email.is_disposable) {
    flags.push('Email is from a disposable provider.');
  }
  if (v.phone.checked && v.phone.valid === false) {
    flags.push('Phone number failed validation.');
  }
  if (v.address.checked && v.address.found === false) {
    flags.push('Address not found — please confirm with the client.');
  }
  return flags;
}
