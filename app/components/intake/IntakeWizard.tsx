'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Icon, Modal } from '../../ui';
import { SERVICES, serviceLabel, type Service } from '../../lib/domain';
import { supabase } from '../../lib_supabase';

// ---------- types ----------

type Role = 'owner' | 'tenant' | 'property_management' | 'commercial' | 'other';

interface JobAnswers {
  // locksmith
  lockCount: string;
  lockType: '' | 'Regular lock' | 'Gripset' | 'Smart lock';
  urgency: '' | 'Standard' | 'Priority' | 'Emergency';
  // security film
  paneCount: string;
  filmWidth: string;
  filmHeight: string;
  filmType: '' | 'Standard' | 'Premium' | 'Heavy security';
  // windows
  windowCount: string;
  windowWidth: string;
  windowHeight: string;
  glazing: '' | 'Single' | 'Double' | 'Triple';
  // doors
  doorType: '' | 'Pre-hung' | 'Slab' | 'Patio-sliding';
  doorWidth: string;
  doorHeight: string;
  newLock: '' | 'Yes' | 'No';
  // skincare
  treatment: '' | 'Advanced facial' | 'Red light therapy' | 'Consultation';
  // all
  notes: string;
}

const emptyAnswers: JobAnswers = {
  lockCount: '', lockType: '', urgency: 'Standard',
  paneCount: '', filmWidth: '', filmHeight: '', filmType: '',
  windowCount: '', windowWidth: '', windowHeight: '', glazing: '',
  doorType: '', doorWidth: '', doorHeight: '', newLock: '',
  treatment: '',
  notes: '',
};

const STEP_TITLES = [
  'Service type',
  'Client type',
  'Contact info',
  'Job details',
  'Photos',
  'Review',
  'Done',
];

const SERVICE_KEYS: { key: string; display: string }[] = [
  { key: 'locksmith', display: 'Locksmith' },
  { key: 'security_film', display: 'Security Window Film' },
  { key: 'windows', display: 'Windows' },
  { key: 'doors', display: 'Doors' },
  { key: 'skincare', display: 'Skincare' },
];

const ROLE_OPTIONS: { value: Role; display: string; note?: string }[] = [
  { value: 'tenant', display: 'Tenant' },
  { value: 'owner', display: 'Landlord', note: 'Landlords are billed as the property owner.' },
  { value: 'property_management', display: 'Property Management' },
  { value: 'commercial', display: 'Commercial' },
  { value: 'other', display: 'Other' },
];

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function isPositiveInt(value: string): boolean {
  return /^\d+$/.test(value.trim()) && Number(value) >= 1;
}

// ---------- small building blocks ----------

function StepHeading({ title, subtitle, headingRef }: { title: string; subtitle?: string; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  return (
    <div className="mb-5">
      <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold text-[#101311] outline-none">
        {title}
      </h2>
      {subtitle && <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>}
    </div>
  );
}

function OptionCard<T extends string>({
  name, value, checked, onChange, title, detail,
}: { name: string; value: T; checked: boolean; onChange: (v: T) => void; title: string; detail?: string }) {
  return (
    <label
      className={`relative flex min-h-[44px] cursor-pointer items-start gap-3 rounded-2xl border bg-white p-4 shadow-sm transition focus-within:ring-2 focus-within:ring-[#101311] focus-within:ring-offset-2 ${
        checked ? 'border-[#101311] ring-2 ring-[#101311] ring-offset-2' : 'border-neutral-200 hover:border-neutral-400'
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        aria-checked={checked}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${checked ? 'border-[#101311] bg-[#FFD60A]' : 'border-neutral-300 bg-white'}`} aria-hidden="true">
        {checked && <Icon name="check" className="h-3 w-3 text-[#101311]" />}
      </span>
      <span>
        <span className="block font-medium text-[#101311]">{title}</span>
        {detail && <span className="block text-sm text-neutral-600">{detail}</span>}
      </span>
      {checked && <span className="sr-only">(selected)</span>}
    </label>
  );
}

function RadioGroup<T extends string>({
  legend, name, options, value, onChange,
}: { legend: string; name: string; options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium text-[#101311]">{legend}</legend>
      {options.map(opt => (
        <OptionCard key={opt} name={name} value={opt} title={opt} checked={value === opt} onChange={onChange} />
      ))}
    </fieldset>
  );
}

const inputCls = (invalid: boolean) =>
  `min-h-[44px] w-full rounded-2xl border bg-white px-4 py-3 text-[#101311] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[#101311] focus-visible:ring-offset-2 ${
    invalid ? 'border-red-600' : 'border-neutral-300'
  }`;

// ---------- summary builders ----------

function roleDisplay(role: Role): string {
  const found = ROLE_OPTIONS.find(r => r.value === role);
  return found ? found.display : role;
}

function detailLines(service: Service, a: JobAnswers): string[] {
  const plural = (n: string, one: string, many: string) => `${n} ${Number(n) === 1 ? one : many}`;
  switch (service) {
    case 'Locksmith':
      return [`${plural(a.lockCount, 'lock', 'locks')}, ${a.lockType.toLowerCase()}`, `Urgency: ${a.urgency}`];
    case 'Security Film':
      return [`${plural(a.paneCount, 'pane', 'panes')}, approx ${a.filmWidth}" × ${a.filmHeight}"`, `Film type: ${a.filmType}`];
    case 'Windows':
      return [`${plural(a.windowCount, 'window', 'windows')}, approx ${a.windowWidth}" × ${a.windowHeight}"`, `Glazing: ${a.glazing}`];
    case 'Doors':
      return [`${a.doorType} door, approx ${a.doorWidth}" × ${a.doorHeight}"`, `New lock needed: ${a.newLock}`];
    case 'Skincare':
      return [`Treatment: ${a.treatment}`];
    default:
      return [];
  }
}

function jobTitle(service: Service, a: JobAnswers): string {
  switch (service) {
    case 'Locksmith':
      return `Locksmith — ${a.lockCount} lock${Number(a.lockCount) === 1 ? '' : 's'}, ${a.lockType.toLowerCase()} (${a.urgency})`;
    case 'Security Film':
      return `Security Window Film — ${a.paneCount} pane${Number(a.paneCount) === 1 ? '' : 's'}, ${a.filmWidth}"×${a.filmHeight}" ${a.filmType.toLowerCase()} film`;
    case 'Windows':
      return `Windows — ${a.windowCount} window${Number(a.windowCount) === 1 ? '' : 's'}, ${a.windowWidth}"×${a.windowHeight}" ${a.glazing.toLowerCase()} glazing`;
    case 'Doors':
      return `Doors — ${a.doorType.toLowerCase()} door, ${a.doorWidth}"×${a.doorHeight}"${a.newLock === 'Yes' ? ', new lock' : ''}`;
    case 'Skincare':
      return `Skincare — ${a.treatment.toLowerCase()}`;
    default:
      return service;
  }
}

// ---------- main component ----------

export default function IntakeWizard({ orgId, onClose, onSaved }: { orgId: string; onClose: () => void; onSaved: (jobId: string) => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [service, setService] = useState<Service | ''>('');
  const [role, setRole] = useState<Role | ''>('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [answers, setAnswers] = useState<JobAnswers>(emptyAnswers);
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [photoError, setPhotoError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [photoFailures, setPhotoFailures] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const announceRef = useRef<HTMLParagraphElement | null>(null);
  const reduceMotion = useReducedMotion();

  const totalSteps = STEP_TITLES.length;

  // Announce step changes + move focus to the step heading.
  useEffect(() => {
    const msg = `Step ${step + 1} of ${totalSteps}: ${STEP_TITLES[step]}`;
    if (announceRef.current) announceRef.current.textContent = msg;
    headingRef.current?.focus({ preventScroll: false });
  }, [step, totalSteps]);

  // Revoke preview URLs on unmount.
  useEffect(() => () => { photos.forEach(p => URL.revokeObjectURL(p.preview)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function goTo(next: number) {
    setDirection(next > step ? 1 : -1);
    setStep(next);
    setErrors({});
    setSubmitError('');
  }

  function setA<K extends keyof JobAnswers>(key: K, value: JobAnswers[K]) {
    setAnswers(prev => ({ ...prev, [key]: value }));
  }

  // ---------- validation ----------

  function validateContact(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Please enter the client’s name.';
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) e.phone = 'Phone number needs at least 7 digits.';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Enter a valid email address, or leave it blank.';
    if (!address.trim()) e.address = 'Please enter the job address.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateDetails(): boolean {
    const e: Record<string, string> = {};
    const req = (key: string, ok: boolean, msg: string) => { if (!ok) e[key] = msg; };
    switch (service) {
      case 'Locksmith':
        req('lockCount', isPositiveInt(answers.lockCount), 'Enter the number of locks (1 or more).');
        req('lockType', !!answers.lockType, 'Choose a lock type.');
        break;
      case 'Security Film':
        req('paneCount', isPositiveInt(answers.paneCount), 'Enter the number of panes (1 or more).');
        req('filmWidth', isPositiveInt(answers.filmWidth), 'Enter an approximate width in inches.');
        req('filmHeight', isPositiveInt(answers.filmHeight), 'Enter an approximate height in inches.');
        req('filmType', !!answers.filmType, 'Choose a film type.');
        break;
      case 'Windows':
        req('windowCount', isPositiveInt(answers.windowCount), 'Enter the number of windows (1 or more).');
        req('windowWidth', isPositiveInt(answers.windowWidth), 'Enter an approximate width in inches.');
        req('windowHeight', isPositiveInt(answers.windowHeight), 'Enter an approximate height in inches.');
        req('glazing', !!answers.glazing, 'Choose a glazing type.');
        break;
      case 'Doors':
        req('doorType', !!answers.doorType, 'Choose a door type.');
        req('doorWidth', isPositiveInt(answers.doorWidth), 'Enter an approximate width in inches.');
        req('doorHeight', isPositiveInt(answers.doorHeight), 'Enter an approximate height in inches.');
        req('newLock', !!answers.newLock, 'Choose whether a new lock is needed.');
        break;
      case 'Skincare':
        req('treatment', !!answers.treatment, 'Choose a treatment.');
        break;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function canContinue(): boolean {
    switch (step) {
      case 0: return !!service;
      case 1: return !!role;
      case 2: return validateContact();
      case 3: return validateDetails();
      case 4: return true;
      default: return true;
    }
  }

  function next() {
    if (!canContinue()) {
      // Move focus to first error so screen reader users land on it.
      requestAnimationFrame(() => {
        const first = document.querySelector('[role="alert"]') as HTMLElement | null;
        first?.scrollIntoView({ block: 'nearest' });
      });
      return;
    }
    if (step === 5) { void submit(); return; }
    goTo(Math.min(step + 1, totalSteps - 1));
  }

  function back() {
    if (step > 0 && !saving) goTo(step - 1);
  }

  // ---------- photos ----------

  function addPhotos(files: FileList | null) {
    if (!files) return;
    setPhotoError('');
    const accepted = Array.from(files);
    const valid: File[] = [];
    for (const f of accepted) {
      if (!ACCEPTED_TYPES.includes(f.type)) { setPhotoError(`"${f.name}" is not a supported image. Use JPG, PNG or WebP.`); continue; }
      if (f.size > MAX_PHOTO_BYTES) { setPhotoError(`"${f.name}" is over 1.5 MB.`); continue; }
      valid.push(f);
    }
    const room = MAX_PHOTOS - photos.length;
    if (valid.length > room) {
      setPhotoError(`Only ${room} more photo${room === 1 ? '' : 's'} can be added (max ${MAX_PHOTOS}).`);
    }
    const take = valid.slice(0, Math.max(room, 0));
    setPhotos(prev => [...prev, ...take.map(file => ({ file, preview: URL.createObjectURL(file) }))]);
  }

  function removePhoto(index: number) {
    setPhotos(prev => {
      const copy = [...prev];
      const [removed] = copy.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.preview);
      return copy;
    });
  }

  // ---------- submit ----------

  async function submit() {
    if (saving || !service || !role) return;
    setSaving(true);
    setSubmitError('');
    setPhotoFailures([]);
    try {
      const title = jobTitle(service, answers);
      const details = [...detailLines(service, answers), answers.notes.trim() ? `Notes: ${answers.notes.trim()}` : '']
        .filter(Boolean)
        .join('\n');
      const safe = (s: string) => s.replace(/[\[\]<>]/g, '').replace(/\n/g, ' ');
      const markdown =
        `# ${safe(title)}\n\n**Service:** ${service}\n\n## Client\n` +
        `- **Name:** ${safe(name.trim())}\n` +
        `- **Property role:** ${role.replaceAll('_', ' ')}\n` +
        `- **Phone:** ${safe(phone.trim())}\n` +
        `- **Email:** ${safe(email.trim()) || 'Not provided'}\n` +
        `- **Address:** ${safe(address.trim())}\n\n` +
        `## Work requested\n${details}`;

      const { data, error } = await supabase.rpc('create_clarifi_request', {
        target_org: orgId,
        client_info: { name: name.trim(), role, email: email.trim(), phone: phone.trim(), address: address.trim() },
        job_info: { title, details, service, markdown, technician_id: null, latitude: null, longitude: null },
      });
      if (error) throw error;
      const newJobId = data as string;

      // Upload photos after lead creation.
      const failures: string[] = [];
      for (const { file } of photos) {
        try {
          const path = `${newJobId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
          const up = await supabase.storage.from('job-files').upload(path, file);
          if (up.error) throw up.error;
          const saved = await supabase.from('job_files').insert({
            organization_id: orgId,
            job_id: newJobId,
            storage_path: path,
            file_name: file.name,
            mime_type: file.type,
          });
          if (saved.error) throw saved.error;
        } catch {
          failures.push(file.name);
        }
      }
      setPhotoFailures(failures);
      setJobId(newJobId);
      goTo(6);
    } catch (e) {
      setSubmitError((e as Error).message || 'Could not save the request. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ---------- step renderers ----------

  function renderServiceStep() {
    return (
      <fieldset>
        <legend className="sr-only">Service type</legend>
        <StepHeading title="What service is needed?" subtitle="Choose the service this request is for." headingRef={headingRef} />
        <div className="space-y-2">
          {SERVICE_KEYS.map(({ key, display }) => {
            const meta = SERVICES.find(s => s.key === key);
            const value = serviceLabel(key);
            return (
              <OptionCard
                key={key}
                name="intake-service"
                value={value}
                title={display}
                detail={meta?.detail}
                checked={service === value}
                onChange={v => setService(v as Service)}
              />
            );
          })}
        </div>
        {!service && <p className="mt-3 text-sm text-neutral-600">Pick one to continue.</p>}
      </fieldset>
    );
  }

  function renderRoleStep() {
    return (
      <fieldset>
        <legend className="sr-only">Client type</legend>
        <StepHeading title="Who is the client?" subtitle="This sets how the job is billed." headingRef={headingRef} />
        <div className="space-y-2">
          {ROLE_OPTIONS.map(r => (
            <OptionCard
              key={r.value}
              name="intake-role"
              value={r.value}
              title={r.display}
              detail={r.note}
              checked={role === r.value}
              onChange={v => setRole(v as Role)}
            />
          ))}
        </div>
      </fieldset>
    );
  }

  function renderContactStep() {
    const inputProps = (field: string, hasError: boolean) => ({
      id: `intake-${field}`,
      'aria-invalid': hasError || undefined,
      'aria-describedby': hasError ? `intake-${field}-error` : undefined,
    });
    return (
      <div>
        <StepHeading title="How do we reach them?" subtitle="Contact and site details for this request." headingRef={headingRef} />
        <div className="space-y-4">
          <div>
            <label htmlFor="intake-name" className="mb-1 block text-sm font-medium text-[#101311]">Full name <span aria-hidden="true">*</span></label>
            <input {...inputProps('name', !!errors.name)} className={inputCls(!!errors.name)} type="text" autoComplete="name" value={name} onChange={e => setName(e.target.value)} />
            {errors.name && <p id="intake-name-error" role="alert" className="mt-1 text-sm font-medium text-red-700">{errors.name}</p>}
          </div>
          <div>
            <label htmlFor="intake-phone" className="mb-1 block text-sm font-medium text-[#101311]">Phone <span aria-hidden="true">*</span></label>
            <input {...inputProps('phone', !!errors.phone)} className={inputCls(!!errors.phone)} type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} />
            {errors.phone && <p id="intake-phone-error" role="alert" className="mt-1 text-sm font-medium text-red-700">{errors.phone}</p>}
          </div>
          <div>
            <label htmlFor="intake-email" className="mb-1 block text-sm font-medium text-[#101311]">Email <span className="font-normal text-neutral-500">(optional)</span></label>
            <input {...inputProps('email', !!errors.email)} className={inputCls(!!errors.email)} type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
            {errors.email && <p id="intake-email-error" role="alert" className="mt-1 text-sm font-medium text-red-700">{errors.email}</p>}
          </div>
          <div>
            <label htmlFor="intake-address" className="mb-1 block text-sm font-medium text-[#101311]">Job address <span aria-hidden="true">*</span></label>
            <input {...inputProps('address', !!errors.address)} className={inputCls(!!errors.address)} type="text" autoComplete="street-address" value={address} onChange={e => setAddress(e.target.value)} />
            {errors.address && <p id="intake-address-error" role="alert" className="mt-1 text-sm font-medium text-red-700">{errors.address}</p>}
          </div>
        </div>
      </div>
    );
  }

  function numberField(key: 'lockCount' | 'paneCount' | 'filmWidth' | 'filmHeight' | 'windowCount' | 'windowWidth' | 'windowHeight' | 'doorWidth' | 'doorHeight', label: string, hint?: string) {
    const id = `intake-${key}`;
    const err = errors[key];
    return (
      <div>
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-[#101311]">{label}</label>
        {hint && <p className="mb-1 text-xs text-neutral-600">{hint}</p>}
        <input
          id={id}
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          className={inputCls(!!err)}
          value={answers[key]}
          onChange={e => setA(key, e.target.value)}
          aria-invalid={!!err || undefined}
          aria-describedby={err ? `${id}-error` : undefined}
        />
        {err && <p id={`${id}-error`} role="alert" className="mt-1 text-sm font-medium text-red-700">{err}</p>}
      </div>
    );
  }

  function renderDetailsStep() {
    const radioErr = (key: string) => errors[key] && (
      <p role="alert" className="mt-1 text-sm font-medium text-red-700">{errors[key]}</p>
    );
    const notesField = (
      <div>
        <label htmlFor="intake-notes" className="mb-1 block text-sm font-medium text-[#101311]">
          Anything else we should know? <span className="font-normal text-neutral-500">(optional)</span>
        </label>
        <textarea id="intake-notes" rows={3} className={inputCls(false)} value={answers.notes} onChange={e => setA('notes', e.target.value)} />
      </div>
    );
    return (
      <div>
        <StepHeading title="Tell us about the job" subtitle={`${service} — answer what you can, the office will confirm the rest.`} headingRef={headingRef} />
        <div className="space-y-6">
          {service === 'Locksmith' && (
            <>
              {numberField('lockCount', 'Number of locks')}
              <RadioGroup legend="Lock type" name="intake-locktype" options={['Regular lock', 'Gripset', 'Smart lock'] as const} value={answers.lockType} onChange={v => setA('lockType', v)} />
              {radioErr('lockType')}
              <RadioGroup legend="Urgency" name="intake-urgency" options={['Standard', 'Priority', 'Emergency'] as const} value={answers.urgency} onChange={v => setA('urgency', v)} />
              {notesField}
            </>
          )}
          {service === 'Security Film' && (
            <>
              {numberField('paneCount', 'Number of panes')}
              <div className="grid grid-cols-2 gap-3">
                {numberField('filmWidth', 'Approx width (in)')}
                {numberField('filmHeight', 'Approx height (in)')}
              </div>
              <RadioGroup legend="Film type" name="intake-filmtype" options={['Standard', 'Premium', 'Heavy security'] as const} value={answers.filmType} onChange={v => setA('filmType', v)} />
              {radioErr('filmType')}
              {notesField}
            </>
          )}
          {service === 'Windows' && (
            <>
              {numberField('windowCount', 'Number of windows')}
              <div className="grid grid-cols-2 gap-3">
                {numberField('windowWidth', 'Approx width (in)')}
                {numberField('windowHeight', 'Approx height (in)')}
              </div>
              <RadioGroup legend="Glazing" name="intake-glazing" options={['Single', 'Double', 'Triple'] as const} value={answers.glazing} onChange={v => setA('glazing', v)} />
              {radioErr('glazing')}
              {notesField}
            </>
          )}
          {service === 'Doors' && (
            <>
              <RadioGroup legend="Door type" name="intake-doortype" options={['Pre-hung', 'Slab', 'Patio-sliding'] as const} value={answers.doorType} onChange={v => setA('doorType', v)} />
              {radioErr('doorType')}
              <div className="grid grid-cols-2 gap-3">
                {numberField('doorWidth', 'Approx width (in)')}
                {numberField('doorHeight', 'Approx height (in)')}
              </div>
              <RadioGroup legend="New lock needed?" name="intake-newlock" options={['Yes', 'No'] as const} value={answers.newLock} onChange={v => setA('newLock', v)} />
              {radioErr('newLock')}
              {notesField}
            </>
          )}
          {service === 'Skincare' && (
            <>
              <RadioGroup legend="Treatment" name="intake-treatment" options={['Advanced facial', 'Red light therapy', 'Consultation'] as const} value={answers.treatment} onChange={v => setA('treatment', v)} />
              {radioErr('treatment')}
              {notesField}
            </>
          )}
        </div>
      </div>
    );
  }

  function renderPhotosStep() {
    return (
      <div>
        <StepHeading title="Add photos" subtitle="Optional — up to 5 photos (JPG, PNG or WebP, max 1.5 MB each)." headingRef={headingRef} />
        <label
          htmlFor="intake-photos"
          className="flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-300 bg-white p-6 text-center font-medium text-[#101311] shadow-sm transition hover:border-neutral-500 focus-within:ring-2 focus-within:ring-[#101311] focus-within:ring-offset-2"
        >
          <Icon name="photo" className="h-5 w-5" />
          <span>{photos.length === 0 ? 'Choose photos' : `Add more (${photos.length}/${MAX_PHOTOS})`}</span>
          <input
            id="intake-photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            onChange={e => { addPhotos(e.target.files); e.target.value = ''; }}
            aria-describedby="intake-photos-hint"
          />
        </label>
        <p id="intake-photos-hint" className="mt-2 text-xs text-neutral-600">
          Photos are uploaded after the request is created. They help the technician arrive prepared.
        </p>
        {photoError && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{photoError}</p>}
        {photos.length > 0 && (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Selected photos">
            {photos.map((p, i) => (
              <li key={p.preview} className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
                <img src={p.preview} alt={`Photo ${i + 1}: ${p.file.name}`} className="aspect-square w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute right-2 top-2 flex min-h-[44px] items-center justify-center rounded-full bg-[#101311] px-4 text-sm font-medium text-white shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD60A] focus-visible:ring-offset-2"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  function renderReviewStep() {
    if (!service || !role) return null;
    const rows: { label: string; value: string; step: number }[] = [
      { label: 'Service', value: service, step: 0 },
      { label: 'Client type', value: roleDisplay(role), step: 1 },
      { label: 'Name', value: name.trim(), step: 2 },
      { label: 'Phone', value: phone.trim(), step: 2 },
      { label: 'Email', value: email.trim() || 'Not provided', step: 2 },
      { label: 'Address', value: address.trim(), step: 2 },
      ...detailLines(service, answers).map((value, i) => ({
        label: i === 0 ? 'Job details' : '',
        value,
        step: 3,
      })),
      { label: 'Notes', value: answers.notes.trim() || 'None', step: 3 },
      { label: 'Photos', value: photos.length === 0 ? 'None' : `${photos.length} photo${photos.length === 1 ? '' : 's'}`, step: 4 },
    ];
    return (
      <div>
        <StepHeading title="Review your request" subtitle="Check everything before sending it to the queue." headingRef={headingRef} />
        <dl className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white shadow-sm">
          {rows.map((r, i) => (
            <div key={i} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                {r.label && <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{r.label}</dt>}
                <dd className="mt-0.5 break-words text-[#101311]">{r.value}</dd>
              </div>
              <button
                type="button"
                onClick={() => goTo(r.step)}
                aria-label={`Edit ${r.label || 'job details'}`}
                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl px-3 text-sm font-medium text-[#101311] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#101311] focus-visible:ring-offset-2"
              >
                Edit
              </button>
            </div>
          ))}
        </dl>
        {submitError && <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700">{submitError}</p>}
      </div>
    );
  }

  function renderDoneStep() {
    return (
      <div className="py-4 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FFD60A]" aria-hidden="true">
          <Icon name="check" className="h-8 w-8 text-[#101311]" />
        </span>
        <StepHeading title="Request received" headingRef={headingRef} />
        <p className="mx-auto max-w-sm text-neutral-600">
          The job is in the queue. The office will review it and reach out to the client shortly.
        </p>
        {photoFailures.length > 0 && (
          <p role="alert" className="mx-auto mt-3 max-w-sm rounded-2xl bg-red-50 p-3 text-sm font-medium text-red-700">
            {photoFailures.length} photo{photoFailures.length === 1 ? '' : 's'} could not be uploaded — they can be added later from the job.
          </p>
        )}
        <button
          type="button"
          onClick={async () => { if (jobId) { await onSaved(jobId); onClose(); } }}
          className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-[#FFD60A] px-8 py-3 font-semibold text-[#101311] shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#101311] focus-visible:ring-offset-2"
        >
          Open job
        </button>
      </div>
    );
  }

  // ---------- chrome ----------

  const isLastFormStep = step === 5;
  const primaryLabel = isLastFormStep ? (saving ? 'Saving…' : 'Submit request') : 'Next';
  const canGoBack = step > 0 && step < 6 && !saving;
  const showNav = step < 6;

  const slideX = reduceMotion ? 0 : 24 * direction;

  return (
    <Modal title="New request" onClose={onClose}>
      <p ref={announceRef} aria-live="polite" className="sr-only" />
      <div className="px-6 pt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-[#101311]" aria-hidden="true">
            Step {Math.min(step + 1, totalSteps)} of {totalSteps}
          </span>
          <span className="text-neutral-500">{STEP_TITLES[step]}</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={Math.min(step + 1, totalSteps)}
          aria-valuemin={1}
          aria-valuemax={totalSteps}
          aria-label={`Step ${Math.min(step + 1, totalSteps)} of ${totalSteps}: ${STEP_TITLES[step]}`}
          className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-200"
        >
          <div
            className="h-full rounded-full bg-[#101311] transition-all"
            style={{ width: `${((Math.min(step + 1, totalSteps)) / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      <div className="px-6 py-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: slideX }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -slideX }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: 'easeOut' }}
          >
            {step === 0 && renderServiceStep()}
            {step === 1 && renderRoleStep()}
            {step === 2 && renderContactStep()}
            {step === 3 && renderDetailsStep()}
            {step === 4 && renderPhotosStep()}
            {step === 5 && renderReviewStep()}
            {step === 6 && renderDoneStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {showNav && (
        <div className="flex items-center justify-between gap-3 border-t border-neutral-200 px-6 py-4">
          <button
            type="button"
            onClick={back}
            disabled={!canGoBack}
            className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-neutral-300 bg-white px-6 py-3 font-medium text-[#101311] shadow-sm transition hover:border-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#101311] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Back
          </button>
          {isLastFormStep ? (
            <button
              type="button"
              onClick={next}
              disabled={saving}
              aria-busy={saving}
              className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-[#FFD60A] px-8 py-3 font-semibold text-[#101311] shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#101311] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Submit request'}
            </button>
          ) : (
            <button
              type="button"
              onClick={next}
              className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-[#101311] px-8 py-3 font-semibold text-white shadow-sm transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#101311] focus-visible:ring-offset-2"
            >
              {primaryLabel}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
