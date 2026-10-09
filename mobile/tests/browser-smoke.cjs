// Synthetic browser verification only. No live accounts or production writes.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
const orgA = '00000000-0000-4000-8000-000000000001';
const orgB = '00000000-0000-4000-8000-000000000002';
const userId = '00000000-0000-4000-8000-000000000010';
const profileId = '00000000-0000-4000-8000-000000000011';
const clientId = '00000000-0000-4000-8000-000000000020';
const membershipId = '00000000-0000-4000-8000-000000000030';
const claims = { sub: userId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 };
const accessToken = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture`;

async function scenario(browser, role, options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [], tables = [], orgs = [];
  let failJobs = false;
  page.on('pageerror', error => errors.push(error.message));
  const user = { id: userId, email: `${role}@example.test`, aud: 'authenticated', role: 'authenticated', user_metadata: {}, app_metadata: {}, created_at: new Date().toISOString() };
  await page.route('https://fixture.supabase.co/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    const reply = (json, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { ...cors, ...headers }, body: JSON.stringify(json) });
    if (url.pathname.endsWith('/auth/v1/token')) return reply({ access_token: accessToken, refresh_token: 'fixture-refresh', expires_in: 3600, token_type: 'bearer', user });
    if (url.pathname.endsWith('/auth/v1/user')) return reply(user);
    if (url.pathname.endsWith('/auth/v1/logout')) return reply({});
    const table = url.pathname.split('/').pop(); tables.push(table);
    assert.ok(request.headers().authorization?.startsWith('Bearer '));
    assert.ok(!url.searchParams.get('select')?.includes('*'), 'Never request wildcard columns');
    if (table === 'organization_members') {
      assert.equal(url.searchParams.get('user_id'), `eq.${userId}`);
      assert.equal(url.searchParams.get('active'), 'eq.true');
      const membership = { id: membershipId, organization_id: orgA, user_id: userId, role, display_name: 'Jamie', organizations: { name: 'Yavamo Toronto' } };
      return reply(options.multi ? [membership, { ...membership, id: membershipId + 'b', organization_id: orgB, organizations: { name: 'Yavamo East' } }] : [membership]);
    }
    const org = url.searchParams.get('organization_id');
    assert.ok([`eq.${orgA}`, `eq.${orgB}`].includes(org), 'Every operational query must scope its organization');
    orgs.push(org);
    if (table === 'technicians') {
      assert.equal(url.searchParams.get('auth_user_id'), `eq.${userId}`);
      return reply([{ id: profileId }]);
    }
    if (table === 'jobs') {
      if (failJobs) return reply({ message: 'Synthetic outage' }, 503);
      if (request.method() === 'HEAD') {
        assert.equal(url.searchParams.get('status'), 'eq.lead');
        assert.equal(url.searchParams.get('assigned_to'), 'is.null');
        assert.equal(url.searchParams.get('technician_id'), 'is.null');
        return route.fulfill({ status: 200, headers: { ...cors, 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }, body: '' });
      }
      if (role === 'technician') {
        assert.match(url.searchParams.get('or'), new RegExp(userId));
        assert.match(url.searchParams.get('or'), new RegExp(profileId));
      }
      const start = url.searchParams.getAll('scheduled_start').find(value => value.startsWith('gte.')).slice(4);
      assert.ok(url.searchParams.getAll('scheduled_start').some(value => value.startsWith('lt.')));
      assert.ok(!url.searchParams.get('service').includes('windows'));
      if (options.empty) return reply([]);
      return reply([{ id: 'job-a', client_id: clientId, request: 'Rekey front door lock', status: 'active', service: 'locksmith', scheduled_start: new Date(new Date(start).getTime() + 9 * 3600000).toISOString(), scheduled_end: null, assigned_to: userId, technician_id: profileId }]);
    }
    if (table === 'notifications') return route.fulfill({ status: 200, headers: { ...cors, 'content-range': '0-2/3', 'access-control-expose-headers': 'content-range' }, body: '' });
    if (table === 'clients') return reply([{ id: clientId, name: org === `eq.${orgB}` ? 'East Client' : 'Morgan Lee', address: '25 King St, Toronto' }]);
    throw new Error(`Unexpected API request: ${url.pathname}`);
  });
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.getByLabel('Work email').fill(`${role}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  if (options.multi) await page.getByRole('button', { name: 'Open Yavamo Toronto' }).click();
  if (options.empty) await page.getByText('A little room in the day').waitFor();
  else await page.getByText('Morgan Lee', { exact: true }).waitFor();
  assert.equal(await page.getByText('Unassigned requests', { exact: true }).count(), role === 'technician' ? 0 : 1);
  if (role === 'technician') assert.ok(!tables.includes('notifications'), 'Technician must not query the office alert queue');
  assert.ok(!tables.some(table => ['quotes', 'quote_versions', 'quote_line_items', 'supplier_materials', 'part_tracking'].includes(table)));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: `artifacts/${role}${options.empty ? '-empty' : ''}.png`, fullPage: true });
  if (!options.empty) {
    failJobs = true;
    await page.getByRole('button', { name: 'Refresh dashboard' }).click();
    await page.getByText('Showing the last successful update. Counts may have changed.').waitFor();
    failJobs = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.getByText('Showing the last successful update. Counts may have changed.').waitFor({ state: 'hidden' });
  }
  await page.getByRole('button', { name: 'Account and workspace' }).click();
  await page.getByText('Your workspace', { exact: true }).waitFor();
  if (options.multi) {
    await page.getByRole('button', { name: 'Yavamo East', exact: true }).click();
    await page.getByText('East Client', { exact: true }).waitFor();
    assert.equal(await page.getByText('Morgan Lee', { exact: true }).count(), 0);
    assert.ok(orgs.includes(`eq.${orgB}`));
    await page.getByRole('button', { name: 'Account and workspace' }).click();
  }
  await page.getByRole('button', { name: 'Sign out of this device' }).click();
  await page.getByLabel('Work email').waitFor();
  assert.equal(await page.getByLabel('Work email').count(), 1, 'Sign-out must show exactly one sign-in screen');
  assert.equal(await page.getByText('Morgan Lee', { exact: true }).count(), 0, 'Previous job data must be removed after sign-out');
  assert.equal(await page.getByText('East Client', { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
}
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
  try {
    await scenario(browser, 'dispatcher', { multi: true });
    await scenario(browser, 'technician');
    await scenario(browser, 'dispatcher', { empty: true });
    console.log('Synthetic browser checks passed: sign-in, role queries, workspace switching, stale/error recovery, empty state, mobile width, and sign-out. Live RLS and Android device verification remain pending.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
