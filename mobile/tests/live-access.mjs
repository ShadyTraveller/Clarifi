// Read-only live verification. Provision staging fixtures before running.
// Credentials come only from runtime secrets; never write them into this script.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Configure ${name} through secure runtime settings.`);
  return value;
}
const clients = [];
try {
  const url = required('EXPO_PUBLIC_SUPABASE_URL');
  const key = required('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  if (!url.startsWith('https://') || new URL(url).hostname === 'jgbciyogyratfplofizv.supabase.co') {
    throw new Error('Live verification requires an isolated staging project; production is refused.');
  }
  if (!key.startsWith('sb_publishable_')) throw new Error('Use the staging publishable key.');
  const orgA = required('YAVAMO_TEST_ORG_A'), orgB = required('YAVAMO_TEST_ORG_B');
  const materialId = required('YAVAMO_TEST_MATERIAL_ID');
  assert.notEqual(orgA, orgB, 'Provide two distinct synthetic organizations.');
  async function login(prefix, expectedRole) {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    clients.push(db);
    const login = await db.auth.signInWithPassword({ email: required(`${prefix}_EMAIL`), password: required(`${prefix}_PASSWORD`) });
    if (login.error || !login.data.user) throw new Error(`${expectedRole} staging sign-in failed. Check secure test settings.`);
    const membership = await db.from('organization_members').select('role').eq('organization_id', orgA)
      .eq('user_id', login.data.user.id).eq('active', true).single();
    assert.equal(membership.error, null, `${expectedRole} needs an active staging membership.`);
    assert.equal(membership.data?.role, expectedRole, 'Test account role does not match the handoff.');
    return db;
  }
  const office = await login('YAVAMO_DISPATCH', 'dispatcher');
  const tech = await login('YAVAMO_TECH', 'technician');
  const own = await office.from('jobs').select('id').eq('organization_id', orgA).limit(1);
  assert.equal(own.error, null, 'Office fixture access failed.');
  assert.ok(own.data?.length, 'Org A must have at least one synthetic job.');
  for (const db of [office, tech]) {
    const foreign = await db.from('jobs').select('id').eq('organization_id', orgB).limit(1);
    assert.ok(foreign.error?.code === '42501' || (!foreign.error && foreign.data?.length === 0), 'Cross-organization job access was not denied.');
  }
  const internal = await office.from('supplier_materials').select('id,public_price_cents').eq('organization_id', orgA).eq('id', materialId).single();
  assert.equal(internal.error, null, 'The office must be able to read the synthetic material fixture for this check to be meaningful.');
  const protectedRead = await tech.from('supplier_materials').select('id,public_price_cents').eq('organization_id', orgA).eq('id', materialId);
  assert.ok(protectedRead.error?.code === '42501' || (!protectedRead.error && protectedRead.data?.length === 0), 'Technician can read internal supplier pricing. Muse must fix backend permissions before approval.');
  console.log('Live read checks passed: staging sign-in, active roles, org isolation, and technician supplier-price denial. Android device and write-policy checks still require manual verification.');
} catch (error) {
  // Only our messages are emitted, never raw API errors, user data, or tokens.
  console.error(error instanceof Error ? error.message : 'Live verification failed.');
  process.exitCode = 1;
} finally {
  await Promise.all(clients.map(db => db.auth.signOut({ scope: 'local' }).catch(() => {})));
}
