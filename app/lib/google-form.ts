/**
 * Google Form self-intake → Lead mapping.
 *
 * Pure functions (no I/O) so the mapping is unit-testable.
 *
 * Verified form structure:
 *   Page 1 — Email (required), Name (required), Number (required), Address (required, paragraph)
 *   Page 2 — Role (choice: tenant | landlord | property management | institution | commercial),
 *            Job details (text), Photo upload (file upload)
 *
 * Mapping is precise for the known titles but keeps a DYNAMIC fallback:
 * every other question/answer pair is preserved verbatim in the lead's
 * details/notes. Unknown fields are never dropped and never fail the import.
 */

export interface FormPairs {
  [title: string]: unknown;
}

export interface ExtraAnswer {
  title: string;
  answer: string;
}

export type ClientRole = 'tenant' | 'landlord' | 'property_management' | 'institution' | 'commercial' | 'other';

export interface FormAttachment {
  name: string;
  mimeType: string;
  /** Base64-encoded file bytes (sent by the Apps Script for file-upload items). */
  dataBase64: string;
}

export interface MappedLead {
  name: string;
  email: string;
  phone: string;
  address: string;
  emailValid: boolean;
  /** Raw email value when it failed validation (kept for the office to fix). */
  emailRaw: string;
  role: ClientRole;
  /** Original Role answer text (for the notes thread). */
  roleRaw: string;
  /** The "Job details" answer — becomes the lead's job details / notes. */
  jobDetails: string;
  extras: ExtraAnswer[];
  /** Number of photo attachments supplied alongside the responses. */
  attachmentCount: number;
  title: string;
  details: string;
  markdown: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FIELD_ALIASES: Record<'email' | 'name' | 'phone' | 'address', string[]> = {
  email: ['email', 'e-mail', 'email address', 'your email', 'e mail'],
  name: ['name', 'full name', 'your name', 'client name', 'contact name'],
  phone: ['number', 'phone', 'phone number', 'mobile', 'mobile number', 'contact number', 'telephone', 'tel'],
  address: ['address', 'property address', 'job address', 'street address', 'site address', 'home address'],
};

const ROLE_QUESTION_TITLES = ['role', 'client type', 'property role', 'i am a', 'you are a', 'client role'];
const JOB_DETAILS_TITLES = [
  'job details',
  'details',
  'describe the job',
  'job description',
  'what do you need',
  'tell us about the job',
  'work requested',
  'description',
];
const PHOTO_QUESTION_TITLES = ['photo', 'photos', 'upload photo', 'upload photos', 'pictures', 'images', 'attachments', 'photo upload'];

const ROLE_VALUE_MAP: Record<string, ClientRole> = {
  tenant: 'tenant',
  landlord: 'landlord',
  'property management': 'property_management',
  property_management: 'property_management',
  institution: 'institution',
  commercial: 'commercial',
};

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

function fieldForTitle(title: string): 'email' | 'name' | 'phone' | 'address' | null {
  const t = normalizeTitle(title);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.includes(t)) return field as 'email' | 'name' | 'phone' | 'address';
  }
  return null;
}

function isRoleQuestion(title: string): boolean {
  return ROLE_QUESTION_TITLES.includes(normalizeTitle(title));
}

function isJobDetailsQuestion(title: string): boolean {
  return JOB_DETAILS_TITLES.includes(normalizeTitle(title));
}

function isPhotoQuestion(title: string): boolean {
  return PHOTO_QUESTION_TITLES.includes(normalizeTitle(title));
}

/** Normalize any form answer to a display string. Arrays (checkboxes) are joined. */
export function answerToString(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map((v) => String(v ?? '').trim()).filter(Boolean).join(', ');
  return String(value).trim();
}

export function mapRoleAnswer(answer: string): { role: ClientRole; raw: string } {
  const raw = answerToString(answer);
  const mapped = ROLE_VALUE_MAP[normalizeTitle(raw)];
  return { role: mapped ?? 'other', raw };
}

export function mapFormResponses(pairs: FormPairs, attachmentCount = 0): MappedLead {
  const fields: Record<'email' | 'name' | 'phone' | 'address', string> = {
    email: '',
    name: '',
    phone: '',
    address: '',
  };
  let role: ClientRole = 'other';
  let roleRaw = '';
  let jobDetails = '';
  const extras: ExtraAnswer[] = [];

  for (const [rawTitle, rawValue] of Object.entries(pairs || {})) {
    const title = String(rawTitle ?? '').trim();
    if (!title) continue;
    const answer = answerToString(rawValue);

    // Precise page-2 mappings first.
    if (isRoleQuestion(title)) {
      const mapped = mapRoleAnswer(answer);
      role = mapped.role;
      roleRaw = mapped.raw || answer;
      continue;
    }
    if (isJobDetailsQuestion(title)) {
      // Concatenate if the form ever repeats the question.
      jobDetails = jobDetails ? `${jobDetails}\n${answer}` : answer;
      continue;
    }
    if (isPhotoQuestion(title)) {
      // File bytes arrive via `attachments`; a text answer here is just a reference.
      if (answer) extras.push({ title: `${title} (see attached photos)`, answer });
      continue;
    }

    // Page-1 known fields.
    const field = fieldForTitle(title);
    if (field && !fields[field] && answer) {
      fields[field] = answer;
    } else {
      // Dynamic fallback: never drop, never fail.
      extras.push({ title, answer });
    }
  }

  const emailRaw = fields.email;
  const emailNormalized = emailRaw.trim().toLowerCase();
  const emailValid = emailNormalized === '' ? false : EMAIL_RE.test(emailNormalized);

  const name = fields.name;
  const title = `Website intake — ${name || 'New client'}`;
  const received = new Date().toLocaleString('en-CA');

  const roleLabel = roleRaw || role.replaceAll('_', ' ');
  const detailLines = [
    `Client self-intake via Google Form (received ${received}).`,
    '',
    '## Client',
    `- Name: ${name || 'Not provided'}`,
    `- Email: ${emailValid ? emailNormalized : emailRaw ? `${emailRaw} (needs verification)` : 'Not provided'}`,
    `- Phone: ${fields.phone || 'Not provided'}`,
    `- Address: ${fields.address || 'Not provided'}`,
    `- Client type: ${roleLabel}`,
  ];
  if (jobDetails) {
    detailLines.push('', '## Job details', jobDetails);
  }
  if (attachmentCount > 0) {
    detailLines.push('', `## Photos`, `${attachmentCount} photo(s) attached — see the files thread.`);
  }
  if (extras.length) {
    detailLines.push('', '## Other answers from the form');
    for (const e of extras) detailLines.push(`- ${e.title}: ${e.answer || '—'}`);
  }
  const details = detailLines.join('\n');

  const markdown = [
    `# ${title}`,
    '',
    '## Client',
    `- **Name:** ${name || 'Not provided'}`,
    `- **Email:** ${emailValid ? emailNormalized : emailRaw ? `${emailRaw} (needs verification)` : 'Not provided'}`,
    `- **Phone:** ${fields.phone || 'Not provided'}`,
    `- **Address:** ${fields.address || 'Not provided'}`,
    `- **Client type:** ${roleLabel}`,
    '',
    ...(jobDetails ? ['## Job details', jobDetails, ''] : []),
    ...(attachmentCount > 0 ? [`_${attachmentCount} photo(s) attached — see the files thread._`, ''] : []),
    '## Other form answers',
    ...extras.map((e) => `- **${e.title}:** ${e.answer || '—'}`),
    '',
    '_Source: Google Form self-intake._',
  ].join('\n');

  return {
    name,
    email: emailValid ? emailNormalized : '',
    phone: fields.phone,
    address: fields.address,
    emailValid,
    emailRaw,
    role,
    roleRaw,
    jobDetails,
    extras,
    attachmentCount,
    title,
    details,
    markdown,
  };
}
