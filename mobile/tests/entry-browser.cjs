const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8767';
const org = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const memberId = '00000000-0000-4000-8000-000000000003';
const clientId = '00000000-0000-4000-8000-000000000004';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64');
const user = { id: userId, email: 'dispatch@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: {}, app_metadata: {}, created_at: new Date().toISOString() };
const token = `header.${Buffer.from(JSON.stringify({ sub: userId, role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url')}.fixture`;
const client = { id: clientId, name: 'Morgan Lee', email: 'client@example.test', phone: '(416) 555-0100', address: '25 King St, Toronto', relationship: 'tenant' };
async function run(browser, width, noMatch = false) {
 const context = await browser.newContext({viewport:{width,height:900}});
 const page = await context.newPage();
 let job = null, file = null, stored = false, storagePath = null;
 let jobWrites = 0, photoWrites = 0, uploads = 0, signs = 0, rpcCalls = 0, originalPayload = null;
 const savedClient = noMatch ? {...client,id:'00000000-0000-4000-8000-000000000005',name:'Test client',email:'nobody@example.test',relationship:'other'} : client;
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 await page.route('https://fixture.supabase.co/**', async route => {
  const req = route.request(), url = new URL(req.url()), path = url.pathname;
  const cors = { 'access-control-allow-origin':'*', 'access-control-allow-headers':'*', 'access-control-allow-methods':'*', 'access-control-expose-headers':'content-range' };
  const reply = (data, status=200, headers={}) => route.fulfill({status,contentType:'application/json',headers:{...cors,...headers},body:JSON.stringify(data)});
  if(req.method()==='OPTIONS') return route.fulfill({status:204,headers:cors,body:''});
  if(path.endsWith('/auth/v1/token')) return reply({access_token:token,refresh_token:'fixture',expires_in:3600,token_type:'bearer',user});
  if(path.endsWith('/auth/v1/user')) return reply(user);
  if(path.endsWith('/auth/v1/logout')) return reply({});
  if(path.endsWith('/rpc/create_clarifi_request')) {
   rpcCalls++; const payload=req.postDataJSON();
   assert.deepEqual(Object.keys(payload).sort(),['target_org','client_info','job_info','p_source_ref'].sort());
   assert.equal(payload.target_org,org); assert.match(payload.p_source_ref,/^[a-f0-9-]{36}$/);
   assert.equal(payload.client_info.role,noMatch?'other':'tenant');
   assert.equal(payload.job_info.details,'Unit 4B, Gate 1234\n\nBring two keys.');
   assert.equal(payload.job_info.service,width===1280?'security_film':'locksmith');
   for(const key of ['markdown','technician_id','latitude','longitude']) assert.equal(payload.job_info[key],null);
   if(originalPayload) assert.deepEqual(payload,originalPayload); else originalPayload=payload;
   if(!job) {
    jobWrites++;
    job={id:randomUUID(),organization_id:org,client_id:savedClient.id,request:payload.job_info.title,details:payload.job_info.details,service:payload.job_info.service,status:'lead',scheduled_start:null,scheduled_end:null,assigned_to:null,technician_id:null};
    assert.notEqual(job.id,payload.p_source_ref);
    return reply({message:'Uncertain RPC response'},503);
   }
   return reply(job.id);
  }
  if(path.includes('/storage/v1/object/sign/')) {
   if(req.method()==='POST') { assert.equal(req.postDataJSON().expiresIn,3600); signs++; return reply({signedURL:`/object/sign/job-files/${storagePath}?token=fixture`}); }
   return route.fulfill({status:200,headers:cors,contentType:'image/png',body:png});
  }
  if(path.endsWith('/storage/v1/object/list/job-files')) return reply(stored ? [{name:storagePath.split('/').pop()}] : []);
  if(path.includes('/storage/v1/object/job-files/')) {
   uploads++; storagePath = decodeURIComponent(path.split('/job-files/')[1]);
   assert.ok(storagePath.startsWith(job.id+'/')); assert.ok(storagePath.endsWith('-front-door.png'));
   assert.equal(req.headers()['content-type'],'image/png'); stored=true;
   return reply({message:'Uncertain upload response'},503);
  }
  const table = path.split('/').pop();
  assert.ok(['organization_members','clients','jobs','job_files','notifications'].includes(table),'No private catalog/agent calls');
  if(table==='organization_members') {
   const row = {id:memberId,organization_id:org,user_id:userId,role:'dispatcher',display_name:'Jamie',organizations:{name:'Yavamo Toronto'}};
   if(url.searchParams.has('id')) return reply(row);
   return reply([row]);
  }
  assert.equal(url.searchParams.get('organization_id') || req.postDataJSON()?.organization_id, 'eq.'+org === url.searchParams.get('organization_id') ? 'eq.'+org : org);
  if(table==='clients') {
   assert.equal(req.method(),'GET','Never insert a client without atomic dedupe');
   if(url.searchParams.get('id')?.startsWith('eq.')) return reply({id:clientId});
   if(url.searchParams.has('ilike') || url.searchParams.has('email') || url.searchParams.has('phone')) return reply(noMatch ? [] : [client]);
   return reply([savedClient]);
  }
  if(table==='notifications') return route.fulfill({status:200,headers:{...cors,'content-range':'*/0'},body:''});
  if(table==='jobs') {
   if(req.method()==='HEAD') return route.fulfill({status:200,headers:{...cors,'content-range':'*/0'},body:''});
   assert.equal(req.method(),'GET','Never fall back to raw job inserts');
   const id=url.searchParams.get('id');
   if(id && url.searchParams.get('select')==='id,client_id') return reply(job && id==='eq.'+job.id ? {id:job.id,client_id:savedClient.id} : null);
   if(id) return reply(job ? [job] : [],200,{'content-range':job?'0-0/1':'*/0'});
   return reply([],200,{'content-range':'*/0'});
  }
  if(table==='job_files') {
   if(req.method()==='POST') {
    photoWrites++; const payload=req.postDataJSON();
    assert.equal(payload.storage_path,storagePath); assert.equal(payload.file_name,'front-door.png'); assert.equal(payload.mime_type,'image/png');
    assert.equal(payload.job_id,job.id); assert.equal(payload.client_id,savedClient.id);
    assert.ok(!JSON.stringify(payload).includes('http')); assert.ok(!JSON.stringify(payload).includes('token='));
    file=payload; return reply({message:'Uncertain metadata response'},503);
   }
   if(url.searchParams.has('id')) return reply(file ? {id:file.id,storage_path:file.storage_path} : null);
   return reply(file ? [file] : [],200,{'content-range':file?'0-0/1':'*/0'});
  }
 });
 await page.goto(baseURL,{waitUntil:'networkidle'});
 await page.getByLabel('Work email').fill('dispatch@example.test');
 await page.getByLabel('Password',{exact:true}).fill('fixture-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('button',{name:'New request',exact:true}).click();
 if(noMatch) await page.getByLabel('Client name',{exact:true}).fill('Test client');
 await page.getByRole('radio',{name:'Owner',exact:true}).click();
 await page.getByLabel('Phone',{exact:true}).fill('4165550100 ext. 123');
 await page.getByText('This number has an extension — ask for a direct line.').waitFor();
 await page.getByLabel('Phone',{exact:true}).fill('4165550100');
 await page.getByLabel('Email',{exact:true}).fill(noMatch?'nobody@example.test':'CLIENT@example.test');
 await page.getByLabel('Request title',{exact:true}).fill('TEST — Rekey request');
 await page.getByLabel('Job details',{exact:true}).fill('Bring two keys.');
 await page.getByLabel('Unit',{exact:true}).fill('4B');
 await page.getByLabel('Gate code',{exact:true}).fill('1234');
 await page.getByRole('button',{name:'Check existing client',exact:true}).click();
 if(noMatch) {
  await page.getByText(/No matching client found/).waitFor();
  assert.equal(await page.getByRole('button',{name:'Save request',exact:true}).isDisabled(),false);
 } else {
  await page.getByRole('button',{name:'Use client Morgan Lee',exact:true}).click();
  await page.getByRole('radio',{name:'Security film',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Save request',exact:true}).isDisabled(),false);
  if(width !== 1280) await page.getByRole('radio',{name:'Locksmith',exact:true}).click();
 }
 {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Choose photos',exact:true}).click();
  await (await chooser).setFiles({name:'Front Door.PNG',mimeType:'image/png',buffer:png});
  await page.getByText('front-door.png',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByTestId('entry-screen').evaluate(el=>{el.scrollTop=0;});
  await page.screenshot({path:`artifacts/entry-${width}.png`,fullPage:true});
  if(width===320) await page.evaluate(()=>{
   const original=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(value,key){
    if(this.name==='drafts') { window.failedSourceRef=value.snapshot.state.attemptId; IDBObjectStore.prototype.put=original; throw new DOMException('Synthetic full disk','QuotaExceededError'); }
    return original.call(this,value,key);
   };
  });
  await page.getByRole('button',{name:'Save request',exact:true}).click();
  if(width===320) {
   await page.getByText(/Could not keep this save for recovery/).waitFor(); assert.equal(rpcCalls,0);
   await page.getByRole('button',{name:'Retry save',exact:true}).click();
  }
  await page.getByText(/Could not confirm the save/).waitFor();
  if(width===320) assert.equal(originalPayload.p_source_ref,await page.evaluate(()=>window.failedSourceRef));
  if(width!==1280) {
   // Reopen at the static server root; it does not provide SPA deep-link fallback.
   await page.goto(baseURL,{waitUntil:'networkidle'});
   await page.getByLabel('Work email').fill('dispatch@example.test');
   await page.getByLabel('Password',{exact:true}).fill('fixture-password');
   await page.getByRole('button',{name:'Sign in',exact:true}).click();
  } else await page.getByRole('tab',{name:'Home',exact:true}).click();
  await page.getByRole('button',{name:'New request',exact:true}).click();
  assert.equal(await page.getByLabel('Request title',{exact:true}).inputValue(),'TEST — Rekey request');
  await page.getByRole('button',{name:'Retry save',exact:true}).click();
  await page.getByRole('button',{name:'Retry photos',exact:true}).waitFor();
  await page.getByRole('button',{name:'Retry photos',exact:true}).click();
  await page.getByText('Request saved. Some photos could not be attached. Retry photos to finish; this will not create another request.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Retry photos',exact:true}).click();
  await page.getByRole('button',{name:'Create another request',exact:true}).waitFor();
  assert.equal(jobWrites,1); assert.equal(uploads,1); assert.equal(photoWrites,1); assert.equal(rpcCalls,4);
  await page.getByRole('button',{name:'Open request',exact:true}).click();
  try { await page.getByText(/Unit 4B, Gate 1234\s+Bring two keys\./).waitFor(); }
  catch (error) { await page.screenshot({path:'artifacts/entry-failure.png',fullPage:true}); console.error(await page.locator('body').innerText()); throw error; }
  await page.getByLabel('Job photo front-door.png',{exact:true}).waitFor();
  assert.ok(signs>=1);
  await page.getByRole('tab',{name:'Account',exact:true}).click();
  await page.getByRole('button',{name:'Sign out of this device',exact:true}).click();
  await page.getByLabel('Work email').fill('dispatch@example.test');
  await page.getByLabel('Password',{exact:true}).fill('fixture-password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'New request',exact:true}).click();
  assert.equal(await page.getByLabel('Request title',{exact:true}).inputValue(),'');
 }
 assert.deepEqual(errors,[]);
 await context.close();
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});
 try {await run(browser,320);await run(browser,1280);await run(browser,390,true);console.log('Entry checks passed: four-argument RPC, new/existing clients, stable source ref across reload, durable photos, storage failure before RPC, server-returned IDs, lost-response reconciliation, sign-out cleanup, and responsive layout.');}
 finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
