const assert = require('node:assert/strict');
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
 let jobWrites = 0, photoWrites = 0, uploads = 0, signs = 0;
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 await page.route('https://fixture.supabase.co/**', async route => {
  const req = route.request(), url = new URL(req.url()), path = url.pathname;
  const cors = { 'access-control-allow-origin':'*', 'access-control-allow-headers':'*', 'access-control-allow-methods':'*', 'access-control-expose-headers':'content-range' };
  const reply = (data, status=200, headers={}) => route.fulfill({status,contentType:'application/json',headers:{...cors,...headers},body:JSON.stringify(data)});
  if(req.method()==='OPTIONS') return route.fulfill({status:204,headers:cors,body:''});
  if(path.endsWith('/auth/v1/token')) return reply({access_token:token,refresh_token:'fixture',expires_in:3600,token_type:'bearer',user});
  if(path.endsWith('/auth/v1/user')) return reply(user);
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
   return reply([client]);
  }
  if(table==='notifications') return route.fulfill({status:200,headers:{...cors,'content-range':'*/0'},body:''});
  if(table==='jobs') {
   if(req.method()==='HEAD') return route.fulfill({status:200,headers:{...cors,'content-range':'*/0'},body:''});
   if(req.method()==='POST') {
    jobWrites++; const payload=req.postDataJSON();
    assert.equal(payload.status,'lead'); assert.equal(payload.client_id,clientId); assert.equal(payload.details,'Unit 4B, Gate 1234\n\nBring two keys.');
    assert.equal(payload.service,'locksmith');
    assert.deepEqual(Object.keys(payload).sort(),['id','organization_id','client_id','request','details','status','service'].sort());
    job={...payload,scheduled_start:null,scheduled_end:null,assigned_to:null,technician_id:null};
    return reply({message:'Uncertain save response'},503);
   }
   const id=url.searchParams.get('id');
   if(id && url.searchParams.get('select')==='id,client_id') return reply(job && id==='eq.'+job.id ? {id:job.id,client_id:clientId} : null);
   if(id) return reply(job ? [job] : [],200,{'content-range':job?'0-0/1':'*/0'});
   return reply([],200,{'content-range':'*/0'});
  }
  if(table==='job_files') {
   if(req.method()==='POST') {
    photoWrites++; const payload=req.postDataJSON();
    assert.equal(payload.storage_path,storagePath); assert.equal(payload.file_name,'front-door.png'); assert.equal(payload.mime_type,'image/png');
    assert.equal(payload.job_id,job.id); assert.equal(payload.client_id,clientId);
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
 await page.getByLabel('Client name',{exact:true}).fill('Test client');
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
  assert.equal(await page.getByRole('button',{name:'Save request',exact:true}).isDisabled(),true);
  assert.equal(jobWrites,0);assert.equal(uploads,0);
 } else {
  await page.getByRole('button',{name:'Use client Morgan Lee',exact:true}).click();
  await page.getByRole('radio',{name:'Security film',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Save request',exact:true}).isDisabled(),true);
  await page.getByRole('radio',{name:'Locksmith',exact:true}).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Choose photos',exact:true}).click();
  await (await chooser).setFiles({name:'Front Door.PNG',mimeType:'image/png',buffer:png});
  await page.getByText('front-door.png',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByTestId('entry-screen').evaluate(el=>{el.scrollTop=0;});
  await page.screenshot({path:`artifacts/entry-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Save request',exact:true}).click();
  await page.getByRole('button',{name:'Retry save',exact:true}).waitFor();
  await page.getByRole('tab',{name:'Home',exact:true}).click();
  await page.getByRole('button',{name:'New request',exact:true}).click();
  assert.equal(await page.getByLabel('Request title',{exact:true}).inputValue(),'TEST — Rekey request');
  await page.getByRole('button',{name:'Retry save',exact:true}).click();
  await page.getByRole('button',{name:'Retry photos',exact:true}).waitFor();
  await page.getByRole('button',{name:'Retry photos',exact:true}).click();
  await page.getByText('Request saved. Some photos could not be attached. Retry photos to finish; this will not create another request.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Retry photos',exact:true}).click();
  await page.getByRole('button',{name:'Create another request',exact:true}).waitFor();
  assert.equal(jobWrites,1); assert.equal(uploads,1); assert.equal(photoWrites,1);
  await page.getByRole('button',{name:'Open request',exact:true}).click();
  try { await page.getByText(/Unit 4B, Gate 1234\s+Bring two keys\./).waitFor(); }
  catch (error) { await page.screenshot({path:'artifacts/entry-failure.png',fullPage:true}); console.error(await page.locator('body').innerText()); throw error; }
  await page.getByLabel('Job photo front-door.png',{exact:true}).waitFor();
  assert.ok(signs>=1);
 }
 assert.deepEqual(errors,[]);
 await context.close();
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});
 try {await run(browser,320);await run(browser,1280);await run(browser,390,true);console.log('Entry checks passed: normalized contact reuse, extension warning, new-client/film gates, layout widths, photo picking, uncertain job/upload/metadata reconciliation, draft resume, and signed photo viewing.');}
 finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
