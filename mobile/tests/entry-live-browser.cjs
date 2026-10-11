// Run only with approved test credentials and an existing labelled TEST client.
// No traces, screenshots, passwords, tokens, or raw API responses are logged.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
function required(name) { if (!process.env[name]) throw Error(`Missing ${name}`); return process.env[name]; }
const db = createClient(required('EXPO_PUBLIC_SUPABASE_URL'), required('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const org = required('YAVAMO_TEST_ORG_A'), clientId = required('YAVAMO_TEST_CLIENT_ID');
const title = `TEST mobile browser ${randomUUID()}`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64');
let stage = 'test setup', browser, page, jobId, fixtureEmail, originalEmail, failed = false;
async function signIn(page, prefix) {
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:8768');
  await page.getByLabel('Work email').fill(required(`${prefix}_EMAIL`));
  await page.getByLabel('Password', { exact: true }).fill(required(`${prefix}_PASSWORD`));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByTestId('home-screen').waitFor();
}
async function signOut(page) {
  await page.getByRole('tab', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out of this device', exact: true }).click();
  await page.getByLabel('Work email').waitFor();
}
(async () => {
try {
  const login = await db.auth.signInWithPassword({ email: required('YAVAMO_DISPATCH_EMAIL'), password: required('YAVAMO_DISPATCH_PASSWORD') });
  assert.equal(login.error, null);
  const member = await db.from('organization_members').select('role').eq('user_id', login.data.user.id)
    .eq('organization_id', org).eq('active', true).single();
  assert.equal(member.error, null); assert.equal(member.data.role, 'dispatcher');
  const contact = await db.from('clients').select('id,name,email,phone,address,relationship').eq('organization_id', org).eq('id', clientId).single();
  assert.equal(contact.error, null); assert.ok(/^test(?:[\s:_-]|$)/i.test(contact.data.name));
  if (!contact.data.email?.trim() && !contact.data.phone?.trim()) {
    originalEmail = contact.data.email; fixtureEmail = `browser-${randomUUID()}@example.invalid`;
    let setup = db.from('clients').update({ email: fixtureEmail }).eq('organization_id', org).eq('id', clientId);
    setup = originalEmail === null ? setup.is('email', null) : setup.eq('email', originalEmail);
    const updated = await setup.select('id').single(); assert.equal(updated.error, null);
    contact.data.email = fixtureEmail;
  }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  page = await context.newPage(); page.setDefaultTimeout(30000);
  let pageErrors = 0, jobWrites = 0, fileWrites = 0;
  page.on('pageerror', () => { pageErrors++; });
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.origin !== process.env.EXPO_PUBLIC_SUPABASE_URL || req.method() !== 'POST') return;
    if (url.pathname === '/rest/v1/jobs') { jobWrites++; jobId = req.postDataJSON().id; }
    if (url.pathname === '/rest/v1/job_files') fileWrites++;
  });
  stage = 'browser sign-in'; await signIn(page, 'YAVAMO_DISPATCH');
  stage = 'existing contact lookup';
  await page.getByRole('button', { name: 'New request', exact: true }).click();
  if (contact.data.email) await page.getByLabel('Email', { exact: true }).fill(contact.data.email);
  else await page.getByLabel('Phone', { exact: true }).fill(contact.data.phone);
  await page.getByRole('button', { name: 'Check existing client', exact: true }).click();
  await page.getByRole('button', { name: `Use client ${contact.data.name}`, exact: true }).click();
  stage = 'browser form and photo';
  await page.getByRole('radio', { name: 'Security film', exact: true }).click();
  await page.getByLabel('Request title', { exact: true }).fill(title);
  await page.getByLabel('Job details', { exact: true }).fill('Synthetic browser verification. No action required.');
  await page.getByLabel('Unit', { exact: true }).fill('TEST');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose photos', exact: true }).click();
  await (await chooser).setFiles({ name: 'Browser Verification.PNG', mimeType: 'image/png', buffer: png });
  await page.getByText('browser-verification.png', { exact: true }).waitFor();
  stage = 'browser save';
  await page.getByRole('button', { name: 'Save request', exact: true }).click();
  await page.getByRole('button', { name: 'Create another request', exact: true }).waitFor();
  assert.equal(jobWrites, 1); assert.equal(fileWrites, 1); assert.ok(jobId);
  stage = 'browser detail and signed image';
  await page.getByRole('button', { name: 'Open request', exact: true }).click();
  await page.getByText(title, { exact: true }).waitFor();
  await page.getByText(/Unit TEST\s+Synthetic browser verification/).waitFor();
  await page.getByLabel('Job photo browser-verification.png', { exact: true }).waitFor();
  await page.waitForFunction(() => {
    const photo = document.querySelector('[aria-label="Job photo browser-verification.png"]');
    const image = photo?.querySelector('img'); return image?.complete && image.naturalWidth > 0;
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  stage = 'database result';
  const job = await db.from('jobs').select('status,service,client_id,assigned_to,technician_id,scheduled_start')
    .eq('organization_id', org).eq('id', jobId).single();
  assert.equal(job.error, null); assert.equal(job.data.status, 'lead'); assert.equal(job.data.service, 'security_film');
  assert.equal(job.data.client_id, clientId); assert.equal(job.data.assigned_to, null);
  assert.equal(job.data.technician_id, null); assert.equal(job.data.scheduled_start, null);
  const unchanged = await db.from('clients').select('id,name,email,phone,address,relationship').eq('organization_id', org).eq('id', clientId).single();
  assert.equal(unchanged.error, null); assert.deepEqual(unchanged.data, contact.data);
  stage = 'draft reset';
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'New request', exact: true }).click();
  await signOut(page);
  await signIn(page, 'YAVAMO_DISPATCH');
  await page.getByRole('button', { name: 'New request', exact: true }).click();
  assert.equal(await page.getByLabel('Request title', { exact: true }).inputValue(), '');
  await signOut(page);
  stage = 'technician entry visibility'; await signIn(page, 'YAVAMO_TECH');
  assert.equal(await page.getByRole('button', { name: 'New request', exact: true }).count(), 0);
  await signOut(page); assert.equal(pageErrors, 0);
  console.log('Live browser entry passed: sign-in, contact lookup, film lead, image picking/upload/display, persisted data, unchanged contact, sign-out draft reset, and technician entry visibility.');
} catch {
  failed = true; console.error(`Live browser verification failed at ${stage}. No secrets or API responses logged.`);
} finally {
  // Resolve only this run's labelled job if an insert response was lost.
  const saved = await db.from('jobs').select('id').eq('organization_id', org).eq('request', title);
  if (saved.error || saved.data?.length > 1) { failed = true; console.error('Could not reconcile labelled browser test job.'); }
  if (saved.data?.length === 1) {
    const id = saved.data[0].id;
    const files = await db.from('job_files').select('storage_path').eq('organization_id', org).eq('job_id', id);
    if (files.error) { failed = true; console.error('Could not check browser test attachments.'); }
    else if (files.data.length) {
      assert.ok(files.data.every(row => row.storage_path.startsWith(`${id}/`)));
      const objects = await db.storage.from('job-files').remove(files.data.map(row => row.storage_path));
      if (objects.error) { failed = true; console.error('Could not remove browser test objects.'); }
    }
    const metadata = await db.from('job_files').delete().eq('organization_id', org).eq('job_id', id);
    const job = await db.from('jobs').delete().eq('organization_id', org).eq('id', id).eq('request', title);
    const remaining = await db.from('jobs').select('id').eq('organization_id', org).eq('id', id);
    if (metadata.error || job.error || remaining.error || remaining.data?.length) { failed = true; console.error('Browser test cleanup could not be confirmed.'); }
    else console.log('Browser test job/photo cleanup passed.');
  }
  if (fixtureEmail) {
    const restore = await db.from('clients').update({ email: originalEmail }).eq('organization_id', org)
      .eq('id', clientId).eq('email', fixtureEmail).select('id').single();
    if (restore.error) { failed = true; console.error('TEST contact restoration could not be confirmed.'); }
    else console.log('Browser test contact restored.');
  }
  if (browser) await browser.close();
  await db.auth.signOut({ scope: 'local' }); if (failed) process.exitCode = 1;
}
})().catch(() => { console.error('Live browser verification stopped. Check labelled TEST fixtures.'); process.exitCode = 1; });
