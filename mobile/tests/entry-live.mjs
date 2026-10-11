// Live writes use an existing TEST client and remove only this run's job/photo.
// A contact-less TEST fixture gets a temporary email, restored during cleanup.
// Credentials must come from runtime settings outside the Expo project.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { registerHooks } from 'node:module';
import { createClient } from '@supabase/supabase-js';

const libURL = new URL('../lib/', import.meta.url).href;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.startsWith(libURL) && specifier.startsWith('.') && !specifier.endsWith('.ts')) {
    return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
} });
const { createLead, findClients, uploadEntryPhoto } = await import('../lib/entry-api.ts');
const { fetchWork } = await import('../lib/jobs.ts');
const { emptyEntry } = await import('../lib/entry-model.ts');
function required(name) {
  if (!process.env[name]) throw new Error(`Missing runtime setting: ${name}`);
  return process.env[name];
}
const db = createClient(required('EXPO_PUBLIC_SUPABASE_URL'), required('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const org = required('YAVAMO_TEST_ORG_A'), clientId = required('YAVAMO_TEST_CLIENT_ID');
const jobId = randomUUID(), photoId = randomUUID(), title = `TEST mobile entry ${jobId}`;
const path = `${jobId}/${photoId}-verification.png`;
const signal = AbortSignal.timeout(120000);
const bytes = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64')).buffer;
let stage = 'sign-in', loggedIn = false, attempted = false, failed = false;
let fixtureEmail = null, originalEmail = null;
try {
  const login = await db.auth.signInWithPassword({ email: required('YAVAMO_DISPATCH_EMAIL'), password: required('YAVAMO_DISPATCH_PASSWORD') });
  assert.equal(login.error, null); loggedIn = true;
  stage = 'active office membership';
  const membership = await db.from('organization_members').select('id,user_id,organization_id,role')
    .eq('user_id', login.data.user.id).eq('organization_id', org).eq('active', true).single();
  assert.equal(membership.error, null); assert.equal(membership.data.role, 'dispatcher');
  const member = membership.data;
  stage = 'existing TEST client';
  const contact = await db.from('clients').select('id,name,email,phone,address,relationship')
    .eq('organization_id', org).eq('id', clientId).single();
  assert.equal(contact.error, null); assert.ok(/^test(?:[\s:_-]|$)/i.test(contact.data.name));
  if (!contact.data.email?.trim() && !contact.data.phone?.trim()) {
    stage = 'temporary TEST contact setup'; originalEmail = contact.data.email;
    fixtureEmail = `mobile-${jobId}@example.invalid`;
    let setup = db.from('clients').update({ email: fixtureEmail }).eq('organization_id', org).eq('id', clientId);
    setup = originalEmail === null ? setup.is('email', null) : setup.eq('email', originalEmail);
    const updated = await setup.select('id,email').single();
    assert.equal(updated.error, null); assert.equal(updated.data.email, fixtureEmail);
    contact.data.email = fixtureEmail;
  }
  const draft = { ...emptyEntry, name: contact.data.name, email: contact.data.email ?? '', phone: contact.data.phone ?? '',
    request: title, service: 'security_film', unit: 'TEST', gate: 'TEST', details: 'Synthetic mobile verification. No action required.' };
  stage = 'contact matching';
  assert.ok((await findClients(db, member, draft, signal)).some(row => row.id === clientId));
  stage = 'lead save and retry'; attempted = true;
  assert.equal(await createLead(db, member, draft, contact.data, jobId, signal), jobId);
  assert.equal(await createLead(db, member, draft, contact.data, jobId, signal), jobId);
  const job = await db.from('jobs').select('id,status,service,client_id,technician_id,assigned_to,scheduled_start,latitude,longitude,details')
    .eq('organization_id', org).eq('id', jobId).single();
  assert.equal(job.error, null); assert.equal(job.data.status, 'lead'); assert.equal(job.data.service, 'security_film');
  assert.equal(job.data.client_id, clientId);
  for (const key of ['technician_id', 'assigned_to', 'scheduled_start', 'latitude', 'longitude']) assert.equal(job.data[key], null);
  assert.equal(job.data.details, 'Unit TEST, Gate TEST\n\nSynthetic mobile verification. No action required.');
  stage = 'photo upload and retry';
  const photo = { id: photoId, uri: '', name: 'verification.png', mime: 'image/png', size: bytes.byteLength, saved: false };
  await uploadEntryPhoto(db, member, jobId, clientId, photo, bytes, signal);
  await uploadEntryPhoto(db, member, jobId, clientId, photo, bytes, signal);
  stage = 'photo metadata';
  const files = await db.from('job_files').select('id,storage_path,file_name,mime_type', { count: 'exact' })
    .eq('organization_id', org).eq('job_id', jobId);
  assert.equal(files.error, null); assert.equal(files.count, 1); assert.equal(files.data[0].storage_path, path);
  assert.equal(files.data[0].file_name, 'verification.png'); assert.equal(files.data[0].mime_type, 'image/png');
  stage = 'signed photo download';
  const signed = await db.storage.from('job-files').createSignedUrl(path, 3600);
  assert.equal(signed.error, null);
  const image = await fetch(signed.data.signedUrl, { signal });
  assert.equal(image.status, 200); assert.deepEqual(new Uint8Array(await image.arrayBuffer()), new Uint8Array(bytes));
  stage = 'job detail read';
  const detail = await fetchWork(db, member, signal, { id: jobId });
  assert.equal(detail.jobs.length, 1); assert.equal(detail.jobs[0].service, 'security_film');
  assert.equal(detail.jobs[0].details, job.data.details);
  stage = 'contact preservation';
  const unchanged = await db.from('clients').select('id,name,email,phone,address,relationship').eq('organization_id', org).eq('id', clientId).single();
  assert.equal(unchanged.error, null); assert.deepEqual(unchanged.data, contact.data);
  console.log('Live entry passed: signed-in lead save, canonical film key, safe retry, unassigned/unscheduled state, photo upload, metadata, signed download, scoped detail, and unchanged contact.');
} catch {
  failed = true; console.error(`Live entry verification failed at ${stage}. No credentials or API responses are logged.`);
} finally {
  if (attempted) {
    const removedObject = await db.storage.from('job-files').remove([path]);
    const removedMetadata = await db.from('job_files').delete().eq('organization_id', org).eq('job_id', jobId).eq('id', photoId);
    const removedJob = await db.from('jobs').delete().eq('organization_id', org).eq('id', jobId).eq('request', title);
    const remaining = await db.from('jobs').select('id').eq('organization_id', org).eq('id', jobId);
    if (removedObject.error || removedMetadata.error || removedJob.error || remaining.error || remaining.data.length) {
      failed = true; console.error('Test cleanup could not be confirmed; review this run’s labelled TEST records.');
    } else console.log('Live verification cleanup passed. The existing TEST client was retained.');
  }
  if (fixtureEmail) {
    const restored = await db.from('clients').update({ email: originalEmail }).eq('organization_id', org)
      .eq('id', clientId).eq('email', fixtureEmail).select('id').single();
    const original = await db.from('clients').select('email').eq('organization_id', org).eq('id', clientId).single();
    if (restored.error || original.error || original.data?.email !== originalEmail) {
      failed = true; console.error('TEST contact restoration could not be confirmed.');
    } else console.log('Temporary TEST contact restored.');
  }
  if (loggedIn) await db.auth.signOut({ scope: 'local' });
  if (failed) process.exitCode = 1;
}
