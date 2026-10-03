'use client';

import { useEffect, useState, useRef } from 'react';
import {Icon,Brand,Badge,Empty,Panel,AsyncButton,Modal,money,dateKey,localDateTime} from './ui';
import { supabase } from './lib_supabase';
import dynamic from 'next/dynamic';
const DispatchMap = dynamic(() => import('./DispatchMap'), { ssr: false, loading: () => <p role="status">Loading map…</p> });

/* ---------------------------------- data ---------------------------------- */

const SERVICES=[
 {key:'security_film',label:'Security Film',detail:'High-impact shatter film per square foot, installation solution'},
 {key:'locksmith',label:'Locksmith',detail:'Rekey, lock change'},
 {key:'windows',label:'Windows',detail:'Replacement'},
 {key:'doors',label:'Doors',detail:'Repair or replacement'},
 {key:'skincare',label:'Skincare',detail:'Skincare service call'},
];
const serviceLabel=(key:string)=>SERVICES.find(s=>s.key===key)?.label||'General';

const DOOR_WINDOW_PHOTOS=['Threshold / sill','Existing lock / handle close-up','Manufacturer label / sticker if present','Exterior cladding / flashing','Access path / work area','Verify rough opening width and height','Confirm configuration / handing','Confirm frame, glazing and lock specification','Confirm trim, flashing, disposal and access','Full patio door — exterior','Full patio door — interior','Frame / jamb close-ups'];
const PHOTO_CHECKLISTS:Record<string,string[]>={
 doors:DOOR_WINDOW_PHOTOS,
 windows:DOOR_WINDOW_PHOTOS,
 security_film:DOOR_WINDOW_PHOTOS,
 locksmith:['Existing damage close-up — document scratch marks, splintered wood, or warped frames before touching the door','Lock faceplate / edge of door — latch, deadbolt, manufacturer branding (e.g. Schlage, Kwikset, Yale)','Existing cylinder / keyway close-up — keyway profile','Handle / lever / trim close-up — interior and exterior design and finish','Strike plate & door jamb — condition where the bolt engages'],
 skincare:['Forehead / glabella close-up — expression lines, texture, dehydration','T-zone / nose pores — congestion, blackheads, sebaceous filaments','Periorbital area (crow’s feet) — fine lines, hyperpigmentation, volume loss','Primary lesion / concern close-up — melasma, active acne, scarring'],
};

const DEFAULT_TEMPLATES=[
 {name:'Doors - Standard Replacement',trade:'Doors',description:'Pre-hung/slab entry door with shim/fastener kit, weather stripping and entry lockset (if needed).',variables:[{key:'opening_width_in',label:'Rough opening width',input_type:'number',unit:'in',required:true},{key:'opening_height_in',label:'Rough opening height',input_type:'number',unit:'in',required:true},{key:'door_type',label:'Door type (pre-hung / slab)',input_type:'text',required:true}]},
 {name:'Security Film - High Impact',trade:'Security Film',description:'High-impact shatter film per square foot, installation solution and window/door-prep labour.',variables:[{key:'width_in',label:'Width',input_type:'number',unit:'in',required:true},{key:'height_in',label:'Height',input_type:'number',unit:'in',required:true},{key:'panes',label:'Number of panes',input_type:'number',required:false}]},
 {name:'Windows - Glass Replacement',trade:'Windows',description:'Per-square-foot glass replacement with glazing/film vinyl and labour.',variables:[{key:'width_in',label:'Width',input_type:'number',unit:'in',required:true},{key:'height_in',label:'Height',input_type:'number',unit:'in',required:true},{key:'glazing',label:'Glazing type',input_type:'text',required:false}]},
 {name:'Standard Patio Door Replacement + Lock',trade:'Doors',description:'Replace standard residential patio/sliding door assembly and install/configure new lock. Verify opening, frame/substrate, glass/door specification, access, disposal, waterproofing/air sealing, trim and hardware.',variables:[{key:'opening_width_in',label:'Opening width',input_type:'number',unit:'in',required:true},{key:'opening_height_in',label:'Opening height',input_type:'number',unit:'in',required:true},{key:'lock_included',label:'Include new lock',input_type:'text',required:false}]},
 {name:'Locksmith - Emergency Re-key & Deadbolt',trade:'Locksmith',description:'Service call, re-key consumables, replacement deadbolt/hardware and field-adjustable labour.',variables:[{key:'locks_count',label:'Number of locks',input_type:'number',required:true},{key:'deadbolt_needed',label:'Replacement deadbolt needed',input_type:'text',required:false}]},
];

/* Deposit % defaults by client relationship. Office can override per quote. */
const DEPOSIT_PCT:Record<string,number>={property_management:25,commercial:25,owner:50,landlord:50,tenant:100,other:50};

type StageKey='intake'|'scope'|'price'|'review'|'approve'|'dispatch'|'done';
const STAGES:{key:StageKey,label:string,icon:string}[]=[
 {key:'intake',label:'Intake',icon:'request'},
 {key:'scope',label:'Scope',icon:'scope'},
 {key:'price',label:'Price',icon:'quote'},
 {key:'review',label:'Review',icon:'check'},
 {key:'approve',label:'Approve',icon:'check'},
 {key:'dispatch',label:'Dispatch',icon:'map'},
 {key:'done',label:'Done',icon:'check'},
];
type View='pipeline'|'job'|'clients'|'team'|'invoices'|'today'|'collect';

export default function Home(){
 const fieldRequest=useRef(0);
 const [session,setSession]=useState<any>(null),[authReady,setAuthReady]=useState(false);
 const [authEmail,setAuthEmail]=useState(''),[authPassword,setAuthPassword]=useState(''),[authMessage,setAuthMessage]=useState(''),[authBusy,setAuthBusy]=useState(false);
 const [role,setRole]=useState<string|null>(()=>{try{return localStorage.getItem('clarifi-role')}catch(e){return null}});
 const [mode,setMode]=useState<'field'|'office'>(()=>{try{return (localStorage.getItem('clarifi-mode') as any)||'office'}catch(e){return 'office'}});
 const [view,setView]=useState<View>('pipeline');
 const [search,setSearch]=useState('');
 const [loading,setLoading]=useState(true),[notice,setNotice]=useState('');
 const [clients,setClients]=useState<any[]>([]),[jobs,setJobs]=useState<any[]>([]),[quotes,setQuotes]=useState<any[]>([]),[invoices,setInvoices]=useState<any[]>([]),[templates,setTemplates]=useState<any[]>([]);
 const [measurements,setMeasurements]=useState<any[]>([]),[members,setMembers]=useState<any[]>([]),[techs,setTechs]=useState<any[]>([]),[requirements,setRequirements]=useState<any[]>([]),[files,setFiles]=useState<any[]>([]);
 const [profiles,setProfiles]=useState<any[]>([]),[suppliers,setSuppliers]=useState<any[]>([]);
 const [orgId,setOrgId]=useState(''),[memberRole,setMemberRole]=useState('');
 const [selectedJob,setSelectedJob]=useState(''),[stage,setStage]=useState<StageKey>('intake');
 const [showIntake,setShowIntake]=useState(false),[clientType,setClientType]=useState('Owner');
 const [fieldQuote,setFieldQuote]=useState<any>(null),[fieldCatalog,setFieldCatalog]=useState<any[]>([]),[fieldSearch,setFieldSearch]=useState('');
 const [depositPct,setDepositPct]=useState(''),[expiryDays,setExpiryDays]=useState('14');
 const [collectNote,setCollectNote]=useState('');

 function chooseRole(r:'tech'|'dispatch'){try{localStorage.setItem('clarifi-role',r);localStorage.setItem('clarifi-mode',r==='tech'?'field':'office')}catch(e){}setRole(r);const m=r==='tech'?'field':'office';setMode(m);setView(r==='tech'?'today':'pipeline');window.scrollTo({top:0,behavior:'instant'})}
 function go(v:View){setView(v);window.scrollTo({top:0,behavior:'instant'})}
 function openJob(id:string){setSelectedJob(id);const j=jobs.find(x=>x.id===id);setStage(j?stageOf(j):'intake');setFieldQuote(null);setFieldCatalog([]);setDepositPct('');setNotice('');if(j)ensurePhotoRequirements(j);go('job')}
 function openCollect(id:string){setSelectedJob(id);setCollectNote('');const j=jobs.find(x=>x.id===id);if(j)ensurePhotoRequirements(j);go('collect')}

 /* ------------------------------- auth/data ------------------------------ */
 useEffect(()=>{let alive=true;supabase.auth.getSession().then(({data,error})=>{if(!alive)return;setSession(data.session);setAuthReady(true);if(error)setAuthMessage(error.message)});const {data:sub}=supabase.auth.onAuthStateChange((_e,s)=>{if(alive)setSession(s)});return()=>{alive=false;sub.subscription.unsubscribe()}},[]);
 useEffect(()=>{if(session)loadData();else{setLoading(false);setClients([]);setJobs([]);setQuotes([]);setInvoices([]);setFieldQuote(null)}},[session?session.user?.id:null]);
 async function membership(){const {data:{user}}=await supabase.auth.getUser();if(!user)return null;const {data}=await supabase.from('organization_members').select('*').eq('user_id',user.id).limit(1).single();return data}
 async function loadData(){setLoading(true);setNotice('');try{const m=await membership();if(!m){setNotice('No workspace membership found. Contact your administrator.');setLoading(false);return}setMemberRole(m.role);setOrgId(m.organization_id);
  const [c,j,q,i,t,me,mb,te,rq,fi,mp,su]=await Promise.all([
   supabase.from('clients').select('*').order('created_at',{ascending:false}),
   supabase.from('jobs').select('*,clients(*)').order('created_at',{ascending:false}),
   supabase.from('quotes').select('*').order('created_at',{ascending:false}),
   supabase.from('invoices').select('*').order('created_at',{ascending:false}),
   supabase.from('scope_templates').select('*').order('name'),
   supabase.from('job_measurements').select('*').order('created_at',{ascending:false}),
   supabase.from('organization_members').select('*').order('created_at'),
   supabase.from('technicians').select('*').eq('active',true).order('name'),
   supabase.from('job_requirements').select('*').order('created_at'),
   supabase.from('job_files').select('*').order('created_at',{ascending:false}),
   supabase.from('markup_profiles').select('*').eq('active',true).order('name'),
   supabase.from('suppliers').select('*').eq('active',true).order('name')]);
  const failed=[c,j,q,i,t,me,mb,te,rq,fi,mp,su].find(r=>r.error);if(failed?.error)setNotice('Some workspace data could not load: '+failed.error.message);
  setClients(c.data||[]);setJobs(j.data||[]);setQuotes(q.data||[]);setInvoices(i.data||[]);setTemplates(t.data||[]);setMeasurements(me.data||[]);setMembers(mb.data||[]);setTechs(te.data||[]);setRequirements(rq.data||[]);setFiles(fi.data||[]);setProfiles(mp.data||[]);setSuppliers(su.data||[]);ensureDefaultTemplates(m.organization_id,t.data||[]);
 }catch(e){setNotice('Unable to refresh the workspace. Check your connection and try again.')}finally{setLoading(false)}}
 async function ensureDefaultTemplates(org:string,existing:any[]){try{if(existing.length)return;for(const tpl of DEFAULT_TEMPLATES){const {data:ins,error}=await supabase.from('scope_templates').insert({organization_id:org,name:tpl.name,trade:tpl.trade,description:tpl.description}).select().single();if(error||!ins)continue;const vars=(tpl.variables||[]).map((v:any,idx:number)=>({template_id:ins.id,key:v.key,label:v.label,input_type:v.input_type||'text',unit:v.unit||null,required:!!v.required,sort_order:idx}));if(vars.length)await supabase.from('template_variables').insert(vars)}const {data}=await supabase.from('scope_templates').select('*').eq('organization_id',org).order('name');if(data)setTemplates(data)}catch(e){}}
 async function authenticate(){setAuthBusy(true);setAuthMessage('');try{const {error}=await supabase.auth.signInWithPassword({email:authEmail,password:authPassword});if(error)setAuthMessage(error.message)}finally{setAuthBusy(false)}}
 async function signOut(){await supabase.auth.signOut();setSession(null)}

 /* --------------------------------- actions -------------------------------- */
 async function createLead(){const m=await membership();if(!m)return setNotice('No Clarifi workspace assigned.');const q=(s:string)=>(document.querySelector(s) as HTMLInputElement)?.value||'';const rel=clientType.toLowerCase().replaceAll(' ','_');
  const {data:client,error}=await supabase.from('clients').insert({organization_id:m.organization_id,name:q('#client-name'),email:q('#client-email')||null,phone:q('#client-phone')||null,address:q('#client-address')||null,relationship:rel}).select().single();if(error)return setNotice(error.message);
  const {data:job,error:je}=await supabase.from('jobs').insert({organization_id:m.organization_id,client_id:client.id,request:q('#client-request')||'General service request',details:q('#client-details')||null,status:'lead',service:q('#client-service')||null}).select().single();if(je)return setNotice(je.message);
  setShowIntake(false);await loadData();if(job)openJob(job.id)}
 async function ensurePhotoRequirements(job:any){try{const list=PHOTO_CHECKLISTS[job.service||'']||[];if(!list.length)return;const {data:have}=await supabase.from('job_requirements').select('label').eq('job_id',job.id);const haveSet=new Set((have||[]).map((r:any)=>r.label));const missing=list.filter(l=>!haveSet.has(l));
  if(missing.length)await supabase.from('job_requirements').insert(missing.map((label,i)=>({organization_id:orgId,job_id:job.id,label,required:true,completed:false,sort_order:i})));
  const {data}=await supabase.from('job_requirements').select('*').eq('job_id',job.id).order('created_at');if(data)setRequirements(prev=>[...prev.filter(r=>r.job_id!==job.id),...data])}catch(e){}}
 async function toggleRequirement(id:string,completed:boolean){const {error}=await supabase.from('job_requirements').update({completed}).eq('id',id);if(!error)setRequirements(prev=>prev.map(r=>r.id===id?{...r,completed}:r))}
 async function startEstimate(templateId:string){if(!selectedJob)return setNotice('Select a job first.');const {error}=await supabase.rpc('start_field_quote',{target_job:selectedJob,target_template:templateId});if(error)return setNotice(error.message);await supabase.from('jobs').update({scope_template_id:templateId}).eq('id',selectedJob);await loadData();refreshQuote(selectedJob)}
 async function refreshQuote(jobId:string){if(!jobId)return;const request=++fieldRequest.current;const {data,error}=await supabase.rpc('calculate_field_quote',{target_job:jobId,selected_profile:null});if(request!==fieldRequest.current)return;if(error)return setNotice(error.message);setFieldQuote(data)}
 async function changeQty(item:any,delta:number){const next=Math.max(0,Number(item.quantity||0)+delta);const {error}=await supabase.rpc('update_field_quote_quantity',{target_item:item.id,new_quantity:next});if(error)return setNotice(error.message);refreshQuote(selectedJob)}
 async function searchCatalog(){if(!selectedJob)return;const {data,error}=await supabase.rpc('field_quote_catalog',{target_job:selectedJob,search_text:fieldSearch});if(error)return setNotice(error.message);setFieldCatalog(data||[])}
 async function addMaterial(productId:string){const {error}=await supabase.rpc('add_field_quote_material',{target_job:selectedJob,target_product:productId,qty:1});if(error)return setNotice(error.message);setFieldCatalog([]);setFieldSearch('');refreshQuote(selectedJob)}
 async function setTermsAndSend(){const job=currentJob,q=latestQuote(job?.id);if(!job||!q)return setNotice('Build the estimate first.');const dep=depositPct===''?null:Number(depositPct);
  const {error}=await supabase.rpc('set_quote_commercial_terms',{target_quote:q.id,expiry:Number(expiryDays)||14,deposit_pct:dep});if(error)return setNotice(error.message);
  const email=job.clients?.email,phone=job.clients?.phone;const channel=email?'email':'link';
  if(email){const {error:e2}=await supabase.rpc('mark_quote_sent',{target_quote:q.id,channel:'email',recipient:email});if(e2)return setNotice(e2.message)}
  await loadData();setNotice(email?`Estimate sent to ${email}.`:'Estimate ready — share the client link below.')}
 async function recordApproval(){const job=currentJob,q=latestQuote(job?.id);if(!job||!q)return;const name=job.clients?.name||'Customer';const {error}=await supabase.rpc('record_quote_approval',{target_quote:q.id,approver_name:name,approver_email:job.clients?.email||null});if(error)return setNotice(error.message);await loadData()}
 async function assignTech(jobId:string,technician_id:string){const {error}=await supabase.from('jobs').update({technician_id:technician_id||null}).eq('id',jobId);if(error)return setNotice(error.message);await loadData()}
 async function scheduleJob(jobId:string,when:string){if(!when)return;const {error}=await supabase.from('jobs').update({scheduled_start:new Date(when).toISOString(),status:'active'}).eq('id',jobId);if(error)return setNotice(error.message);await loadData()}
 async function completeJob(jobId:string){const {error}=await supabase.rpc('mark_service_call_complete',{target_job:jobId});if(error)return setNotice(error.message);await loadData()}
 async function invoiceJob(jobId:string){const q=latestQuote(jobId);if(!q)return setNotice('No approved quote to invoice.');const {error}=await supabase.rpc('create_invoice_from_approved_quote',{target_quote:q.id});if(error)return setNotice(error.message);await loadData()}
 async function uploadJobPhoto(jobId:string,file:File){const path=`${jobId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'-')}`;const up=await supabase.storage.from('job-files').upload(path,file);if(up.error)return setNotice(up.error.message);
  const {error}=await supabase.from('job_files').insert({organization_id:orgId,job_id:jobId,storage_path:path,file_name:file.name,mime_type:file.type});if(error)return setNotice(error.message);await loadData()}
 async function addMeasurement(){if(!selectedJob)return setNotice('Select a job first.');const label=(document.querySelector('#measure-label') as HTMLInputElement)?.value||'Measurement';const value=Number((document.querySelector('#measure-value') as HTMLInputElement)?.value);const unit=(document.querySelector('#measure-unit') as HTMLInputElement)?.value||'in';
  if(!Number.isFinite(value))return setNotice('Enter a numeric value.');const {error}=await supabase.from('job_measurements').insert({organization_id:orgId,job_id:selectedJob,label,value,unit});if(error)return setNotice(error.message);await loadData()}
 async function saveCollectNote(){if(!selectedJob||!collectNote.trim())return;const job=currentJob;const stamp=new Date().toLocaleString();const next=`${job?.details||''}\n[Field notes ${stamp}] ${collectNote.trim()}`.trim();const {error}=await supabase.from('jobs').update({details:next}).eq('id',selectedJob);if(error)return setNotice(error.message);setCollectNote('');await loadData();setNotice('Field notes saved.')}

 /* --------------------------------- derived -------------------------------- */
 const currentJob=jobs.find(j=>j.id===selectedJob);
 const latestQuote=(jobId?:string)=>{if(!jobId)return null;const list=quotes.filter(q=>q.job_id===jobId).sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime());return list[0]||null};
 const quoteLink=(q:any)=>q?`${window.location.origin}/quote/${q.public_token}`:'';
 const jobPhotos=(id:string)=>files.filter(f=>f.job_id===id);
 const jobMeasures=(id:string)=>measurements.filter(m=>m.job_id===id);
 const sqft=(id:string)=>{let total=0;for(const m of jobMeasures(id)){const u=(m.unit||'').toLowerCase();const v=Number(m.value)||0;if(u==='in'||u==='inch'||u==='inches')total+=v/144;else if(u==='ft'||u==='feet'||u==='sqft'||u==='sq ft')total+=v}return total};
 function stageOf(j:any):StageKey{if(!j)return 'intake';if(j.status==='completed')return 'done';const q=latestQuote(j.id);if(q?.status==='approved')return (j.technician_id||j.scheduled_start)?'dispatch':'approve';if(q?.status==='sent'||q?.status==='changes_requested')return 'approve';if(q)return 'price';if(j.scope_template_id)return 'scope';return 'intake'}
 const stageIndex=(s:StageKey)=>STAGES.findIndex(x=>x.key===s);
 const marginOf=(lines:any[])=>{let cost=0,sell=0,hasCost=false;for(const x of lines||[]){const c=Number(x.cost_total||0);if(x.cost_total!=null)hasCost=true;cost+=c;sell+=Number(x.sell_total||0)}return hasCost&&sell>0?Math.round((1-cost/sell)*100):null};
 const openJobs=jobs.filter(j=>j.status!=='completed');
 const todayJobs=jobs.filter(j=>j.scheduled_start&&dateKey(new Date(j.scheduled_start))===dateKey(new Date())&&j.status!=='completed');
 const myJobs=techs.length?jobs.filter(j=>techs.some(t=>t.id===j.technician_id)&&j.status!=='completed'):openJobs;
 const filteredJobs=openJobs.filter(j=>(`${j.clients?.name||''} ${j.request||''} ${j.clients?.address||''} ${serviceLabel(j.service||'')}`).toLowerCase().includes(search.toLowerCase()));
 const newRequest=<button className="primary" onClick={()=>{setNotice('');setShowIntake(true)}}><Icon name="plus"/>New request</button>;
 const stageBadge=(j:any)=>{const s=stageOf(j);const meta=STAGES.find(x=>x.key===s)!;return <span className={`badge ${s}`}>{meta.label}</span>};

 /* ------------------------------ pipeline home ----------------------------- */
 const pipelineHome=<><div className="view-heading"><div><p className="eyebrow">DISPATCH</p><h1>Pipeline</h1><p className="view-description">{openJobs.length} open jobs · {todayJobs.length} scheduled today</p></div>{newRequest}</div>
  {notice&&<p className="notice" role="status">{notice}</p>}
  <div className="filter-bar"><label className="search-input"><Icon name="search"/><input aria-label="Search jobs" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search client, address, service…"/></label></div>
  {loading?<p role="status"><span className="spinner"/>Loading…</p>:filteredJobs.length?<div className="job-list">{filteredJobs.map(j=>{const q=latestQuote(j.id);return <article className="job-card" key={j.id}><button className="job-card-main" onClick={()=>openJob(j.id)}><div className="job-card-top">{stageBadge(j)}<small>{serviceLabel(j.service||'')}</small></div><div className="job-card-title">{j.clients?.name||'Client'}</div><div className="job-card-info">{j.request}</div><div className="job-card-info">{j.clients?.address||'No address'}{j.scheduled_start?` · ${localDateTime(j.scheduled_start)}`:''}</div>{q&&<div className="job-card-footer"><span>Quote {q.quote_number}</span><strong>{money(q.total||q.subtotal||0)}</strong></div>}</button></article>})}</div>:<Empty icon="jobs" title="No jobs yet" detail="Create the first request to start the pipeline." action={newRequest}/>}</>;

 /* -------------------------------- job detail ------------------------------ */
 const jobDetail=()=>{const j=currentJob;if(!j)return <Empty icon="jobs" title="No job selected" action={<button className="secondary" onClick={()=>go('pipeline')}>Back to pipeline</button>}/>;
  const q=latestQuote(j.id);const cur=stageOf(j);const activeStage=stage;
  const rel=(j.clients?.relationship||'other').toLowerCase();
  const defaultDep=DEPOSIT_PCT[rel]??50;
  const photos=jobPhotos(j.id),measures=jobMeasures(j.id),reqs=requirements.filter(r=>r.job_id===j.id);
  const total=fieldQuote?.total??q?.total??0;const margin=marginOf(fieldQuote?.lines||[]);
  return <><div className="breadcrumb"><button className="text-button" onClick={()=>go('pipeline')}>← Pipeline</button></div>
  <div className="view-heading"><div><p className="eyebrow">{serviceLabel(j.service||'').toUpperCase()}</p><h1>{j.clients?.name||'Client'}</h1><p className="view-description">{j.request}</p></div>{stageBadge(j)}</div>
  {notice&&<p className="notice" role="status">{notice}</p>}
  <ol className="stepper" aria-label="Job stages">{STAGES.map(s=>{const idx=stageIndex(s.key),curIdx=stageIndex(cur);const done=idx<curIdx;return <li key={s.key} className={s.key===activeStage?'current':done?'done':''}><button onClick={()=>setStage(s.key)} aria-current={s.key===activeStage?'step':undefined}><span>{done?'✓':idx+1}</span>{s.label}</button></li>})}</ol>

  {activeStage==='intake'&&<Panel title="Client intake" subtitle="Captured at first call"><div className="record-list">
   {[['Name',j.clients?.name],['Email',j.clients?.email],['Phone',j.clients?.phone],['Address',j.clients?.address],['Relationship',(j.clients?.relationship||'').replaceAll('_',' ')],['Service',serviceLabel(j.service||'')],['Request',j.request]].map(([k,v])=>v&&<div className="record-card" key={k}><div className="record-heading"><strong>{k}</strong></div><p>{v}</p></div>)}
   {j.details&&<div className="record-card"><div className="record-heading"><strong>Details & field notes</strong></div><p style={{whiteSpace:'pre-wrap'}}>{j.details}</p></div>}</div></Panel>}

  {activeStage==='scope'&&<><Panel title="1 · Choose the scope template" subtitle="One standard starting point per job"><div className="template-picks">{templates.map(t=><AsyncButton key={t.id} className={`template-pick${j.scope_template_id===t.id?' selected':''}`} onClick={async()=>{await startEstimate(t.id);setStage('price')}}><span className="template-icon"><Icon name="template"/></span><span className="template-copy"><small>{t.trade}</small><strong>{t.name}</strong><span>{t.description}</span></span><Icon name="chevron"/></AsyncButton>)}</div>{!templates.length&&<Empty icon="template" title="No templates yet" detail="Templates seed automatically on first load."/>}</Panel>
   <Panel title="2 · Collect photos & measurements" subtitle="Dispatch, tech, or client — check off each required shot"><div className="checklist">{reqs.length?reqs.map(r=><label className="checklist-row" key={r.id}><input type="checkbox" checked={r.completed} onChange={e=>toggleRequirement(r.id,e.target.checked)}/><span>{r.label}{r.completed&&' ✓'}</span></label>):<p className="helper">Photo checklist loads from the job’s service.</p>}</div>
   <div className="button-wrap"><label className="secondary upload-button"><Icon name="photo"/>Add photo<input hidden type="file" accept="image/*" capture="environment" onChange={e=>e.target.files?.[0]&&uploadJobPhoto(j.id,e.target.files[0])}/></label></div>
   <div className="file-list">{photos.map(f=><div className="file-record" key={f.id}><span className="record-icon"><Icon name="photo"/></span><div><strong>{f.file_name}</strong><small>Uploaded {new Date(f.created_at).toLocaleDateString()}</small></div></div>)}{!photos.length&&<p className="helper">No photos yet.</p>}</div></Panel>
   <Panel title="Measurements" subtitle="Enter inches — square footage calculates automatically"><form className="measurement-form" onSubmit={e=>{e.preventDefault();addMeasurement()}}><div className="form-grid"><label>Label<input id="measure-label" placeholder="e.g. Living room window"/></label><label>Value<input id="measure-value" type="number" step="any" placeholder="72"/></label><label>Unit<input id="measure-unit" placeholder="in" defaultValue="in"/></label></div><button className="secondary" type="submit"><Icon name="plus"/>Save measurement</button></form>
   <div className="measurement-list">{measures.map(m=><article key={m.id}><div><strong>{m.label}</strong><small>{m.value} {m.unit}</small></div></article>)}</div>{sqft(j.id)>0&&<p className="helper"><strong>Total: {sqft(j.id).toFixed(2)} sq ft</strong> (from inch measurements ÷ 144)</p>}</Panel></>}

  {activeStage==='price'&&<Panel title="Calculated estimate" subtitle="Clarifi prices it — nobody calculates by hand"><div className="button-wrap"><AsyncButton className="primary" onClick={async()=>{refreshQuote(j.id)}}><Icon name="quote"/>Calculate estimate</AsyncButton></div>
   {!fieldQuote&&!q&&<Empty icon="quote" title="No estimate yet" detail="Pick a scope template first, then calculate."/>}
   {fieldQuote?.lines&&<><div className="line-head"><span>Item</span><span>Qty</span><span>Amount</span></div><div className="field-items">{fieldQuote.lines.map((x:any)=><div className="field-item" key={x.id}><div><strong>{x.name}</strong><small>{x.type==='labour'?'Labour':'Material'}{x.supplier_name?` · ${x.supplier_name}`:''}</small></div><div className="qty-control"><AsyncButton className="icon-button" onClick={()=>changeQty(x,-1)}><span aria-label="decrease">−</span></AsyncButton><span>{x.quantity}</span><AsyncButton className="icon-button" onClick={()=>changeQty(x,1)}><span aria-label="increase">+</span></AsyncButton></div><strong>{money(x.sell_total)}</strong></div>)}</div>
   <dl className="totals"><div><dt>Subtotal</dt><dd>{money(fieldQuote.subtotal)}</dd></div><div><dt>Tax</dt><dd>{money(fieldQuote.tax)}</dd></div><div className="grand"><dt>Total</dt><dd>{money(fieldQuote.total)}</dd></div></dl>
   {margin!=null&&<p className={`margin-note${margin<20?' warning':''}`}>Margin: {margin}%{margin<20?' — below 20% target, review before sending.':''}</p>}</>}
   <Panel title="Add materials" subtitle="Sourced from Home Depot Canada & Amazon Canada"><div className="catalog-search"><label className="search-input"><Icon name="search"/><input value={fieldSearch} onChange={e=>setFieldSearch(e.target.value)} placeholder="Search gripset, deadbolt, film…"/></label><AsyncButton className="secondary" onClick={searchCatalog}>Search</AsyncButton></div>
   <div className="catalog-results">{fieldCatalog.map((p:any)=><div className="catalog-result" key={p.id}><div><strong>{p.name}</strong><small>{p.supplier_name} · internal {money(p.unit_cost||p.price||0)}</small></div><AsyncButton className="secondary compact" onClick={()=>addMaterial(p.id)}>Add</AsyncButton></div>)}</div><p className="helper">Supplier pricing stays internal — clients never see it.</p></Panel></Panel>}

  {activeStage==='review'&&<Panel title="Office review & send" subtitle="Check the price, set the deposit, send the link"><dl className="totals"><div><dt>Estimate total</dt><dd>{money(total)}</dd></div></dl>
   <div className="form-grid"><label>Deposit %<input value={depositPct} onChange={e=>setDepositPct(e.target.value)} placeholder={String(defaultDep)} inputMode="numeric"/></label><label>Valid for (days)<input value={expiryDays} onChange={e=>setExpiryDays(e.target.value)} inputMode="numeric"/></label></div>
   <p className="helper">Default deposit for {(j.clients?.relationship||'').replaceAll('_',' ')||'this client type'}: {defaultDep}%{depositPct&&Number(depositPct)!==defaultDep?' (overridden)':''}.</p>
   <div className="button-wrap"><AsyncButton className="primary" onClick={setTermsAndSend}><Icon name="check"/>Set terms & send</AsyncButton></div>
   {q&&<><p className="helper">Client link:</p><p className="quote-link">{quoteLink(q)}</p><div className="button-wrap"><button className="secondary" onClick={()=>navigator.clipboard?.writeText(quoteLink(q)).then(()=>setNotice('Link copied.'))}>Copy link</button>{j.clients?.phone&&<a className="secondary" href={`sms:${j.clients.phone}?&body=${encodeURIComponent('Your Clarifi estimate: '+quoteLink(q))}`}>Text link</a>}</div></>}</Panel>}

  {activeStage==='approve'&&<Panel title="Client approval" subtitle="Approved → deposit → job activates"><div className="record-list"><div className="record-card"><div className="record-heading"><strong>Status</strong></div><p>{q?({draft:'Draft — not sent yet',sent:'Sent — waiting on client',approved:'Approved ✓',changes_requested:'Changes requested'} as any)[q.status]||q.status:'No quote yet'}</p></div>
   {q&&<div className="record-card"><div className="record-heading"><strong>Deposit due</strong></div><p>{money(total*(Number(q.deposit_pct??defaultDep)/100))} ({q.deposit_pct??defaultDep}%)</p></div>}</div>
   <div className="button-wrap"><AsyncButton className="secondary" onClick={recordApproval}>Record phone approval</AsyncButton>{q&&q.status!=='approved'&&<AsyncButton className="primary" onClick={async()=>{await recordApproval();setStage('dispatch')}}>Mark approved & continue</AsyncButton>}</div></Panel>}

  {activeStage==='dispatch'&&<><Panel title="Assign & schedule" subtitle="Closest tech first — see the live map"><div className="assignment-list">{techs.map(t=><label className="checklist-row" key={t.id}><input type="radio" name="tech" checked={j.technician_id===t.id} onChange={()=>assignTech(j.id,t.id)}/><span>{t.name}{t.trade?` · ${t.trade}`:''}</span></label>)}{!techs.length&&<p className="helper">No technicians on the team yet — add them under Team.</p>}</div>
   <label>Schedule visit<input type="datetime-local" defaultValue={j.scheduled_start?localDateTime(j.scheduled_start):''} onChange={e=>scheduleJob(j.id,e.target.value)}/></label></Panel>
   <Panel title="Route" subtitle="Job location & supplier pickups"><div className="dispatch-map"><DispatchMap jobs={[j]} techs={techs}/></div><p className="helper">Plan supplier pickups (Home Depot Canada / Amazon) around this stop.</p></Panel></>}

  {activeStage==='done'&&<Panel title="Completion & invoice" subtitle="Finish the work, bill it"><div className="button-wrap">{j.status!=='completed'&&<AsyncButton className="primary" onClick={async()=>{await completeJob(j.id);await loadData()}}><Icon name="check"/>Mark complete</AsyncButton>}<AsyncButton className="secondary" onClick={async()=>{await invoiceJob(j.id);await loadData()}}><Icon name="invoice"/>Create invoice</AsyncButton></div>
   {invoices.filter(i=>i.job_id===j.id).map(i=><div className="invoice-card" key={i.id}><div><strong>{i.invoice_number}</strong><small>{i.status}</small></div><strong>{money(i.total)}</strong></div>)}</Panel>}
  </>};

 /* ------------------------------ tech: today -------------------------------- */
 const todayHome=<><div className="view-heading"><div><p className="eyebrow">TECHNICIAN</p><h1>Today’s jobs</h1><p className="view-description">{myJobs.length} open · collect field info, Clarifi prices it</p></div></div>
  {notice&&<p className="notice" role="status">{notice}</p>}
  {loading?<p role="status"><span className="spinner"/>Loading…</p>:myJobs.length?<div className="visit-list">{myJobs.map(j=><article className="visit" key={j.id}><div><strong>{j.clients?.name||'Client'}</strong><small>{j.request} · {serviceLabel(j.service||'')}</small><small>{j.clients?.address||''}{j.scheduled_start?` · ${localDateTime(j.scheduled_start)}`:''}</small></div><AsyncButton className="primary" onClick={()=>openCollect(j.id)}>Open</AsyncButton></article>)}</div>:<Empty icon="calendar" title="Nothing scheduled" detail="New assignments from dispatch will appear here."/>}</>;

 /* ------------------------------ tech: collect ------------------------------ */
 const collectView=()=>{const j=currentJob;if(!j)return <Empty icon="jobs" title="No job selected"/>;const reqs=requirements.filter(r=>r.job_id===j.id);const photos=jobPhotos(j.id),measures=jobMeasures(j.id);
  return <><div className="breadcrumb"><button className="text-button" onClick={()=>go('today')}>← Today’s jobs</button></div>
  <div className="view-heading"><div><p className="eyebrow">{serviceLabel(j.service||'').toUpperCase()}</p><h1>{j.clients?.name||'Client'}</h1><p className="view-description">{j.request} · {j.clients?.address||''}</p></div></div>
  {notice&&<p className="notice" role="status">{notice}</p>}
  <Panel title="Photo checklist" subtitle="Capture each item — the office builds the estimate from this"><div className="checklist">{reqs.length?reqs.map(r=><label className="checklist-row" key={r.id}><input type="checkbox" checked={r.completed} onChange={e=>toggleRequirement(r.id,e.target.checked)}/><span>{r.label}</span></label>):<p className="helper">Checklist loading…</p>}</div>
  <div className="button-wrap"><label className="primary upload-button"><Icon name="photo"/>Take photo<input hidden type="file" accept="image/*" capture="environment" onChange={e=>e.target.files?.[0]&&uploadJobPhoto(j.id,e.target.files[0])}/></label></div>
  <div className="file-list">{photos.map(f=><div className="file-record" key={f.id}><span className="record-icon"><Icon name="photo"/></span><div><strong>{f.file_name}</strong></div></div>)}</div></Panel>
  <Panel title="Measurements" subtitle="Inches in, square feet out"><form className="measurement-form" onSubmit={e=>{e.preventDefault();addMeasurement()}}><div className="form-grid"><label>Label<input id="measure-label" placeholder="e.g. Window"/></label><label>Value (in)<input id="measure-value" type="number" step="any" placeholder="72"/></label><label>Unit<input id="measure-unit" defaultValue="in"/></label></div><button className="secondary" type="submit"><Icon name="plus"/>Save</button></form>
  {measures.map(m=><div className="file-record" key={m.id}><span className="record-icon"><Icon name="scope"/></span><div><strong>{m.label}</strong><small>{m.value} {m.unit}</small></div></div>)}{sqft(j.id)>0&&<p className="helper"><strong>{sqft(j.id).toFixed(2)} sq ft total</strong></p>}</Panel>
  <Panel title="Field notes" subtitle="What did you find?"><textarea value={collectNote} onChange={e=>setCollectNote(e.target.value)} placeholder="Condition, access issues, customer requests…" rows={3}/><div className="button-wrap"><AsyncButton className="primary" onClick={saveCollectNote}>Save notes</AsyncButton><AsyncButton className="secondary" onClick={()=>go('today')}>Done — back to jobs</AsyncButton></div></Panel>
  {j.details&&<Panel title="Earlier notes"><p style={{whiteSpace:'pre-wrap'}}>{j.details}</p></Panel>}</>};

 /* ------------------------------- simple lists ------------------------------ */
 const clientsView=<><div className="view-heading"><div><p className="eyebrow">DISPATCH</p><h1>Clients</h1></div>{newRequest}</div><div className="client-grid">{clients.filter(c=>`${c.name} ${c.address||''}`.toLowerCase().includes(search.toLowerCase())).map(c=><article className="client-card" key={c.id}><div className="client-card-head"><span className="client-avatar">{(c.name||'?')[0]}</span><div><strong>{c.name}</strong><small>{(c.relationship||'').replaceAll('_',' ')}</small></div></div><small>{c.address||''}</small><small>{c.phone||''} {c.email||''}</small></article>)}</div>{!clients.length&&<Empty icon="clients" title="No clients yet" detail="Clients appear when you create requests."/>}</>;
 const teamView=<><div className="view-heading"><div><p className="eyebrow">DISPATCH</p><h1>Team</h1><p className="view-description">{techs.length} technicians</p></div></div><div className="scope-layout">{techs.map(t=><div className="team-member" key={t.id}><span className="client-avatar">{(t.name||'?')[0]}</span><div><strong>{t.name}</strong><small>{t.trade||'Technician'} · {t.phone||''}</small></div></div>)}{!techs.length&&<Empty icon="clients" title="No technicians" detail="Add technicians in Supabase to assign work."/>}</div></>;
 const invoicesView=<><div className="view-heading"><div><p className="eyebrow">DISPATCH</p><h1>Invoices</h1></div></div>{invoices.map(i=>{const j=jobs.find(x=>x.id===i.job_id);return <div className="invoice-card" key={i.id}><div><strong>{i.invoice_number}</strong><small>{j?.clients?.name||''} · {i.status}</small></div><strong>{money(i.total)}</strong></div>})}{!invoices.length&&<Empty icon="invoice" title="No invoices" detail="Invoices are created from approved quotes."/>}</>;

 /* --------------------------------- chrome ---------------------------------- */
 const navItems:View[]=mode==='office'?['pipeline','clients','team','invoices']:['today'];
 const navLabels:Record<View,string>={pipeline:'Pipeline',job:'Job',clients:'Clients',team:'Team',invoices:'Invoices',today:'Today',collect:'Collect'};

 if(!authReady)return <main className="boot-screen"><Brand/><p role="status"><span className="spinner"/>Opening your workspace…</p></main>;
 if(!session)return <main className="auth-shell"><section className="auth-story"><Brand/><div className="auth-story-main"><p className="eyebrow">THE SERVICE WORKSPACE</p><h1>Clear scope.<br/>Confident work.</h1><p>Call → intake → estimate → approval → dispatch → invoice. One pipeline.</p></div><footer>Built for the work ahead.</footer></section><section className="auth-form-side"><div className="auth-mobile-brand"><Brand/></div><form className="auth-card" onSubmit={e=>{e.preventDefault();authenticate()}}><span className="auth-lock"><Icon name="lock"/></span><p className="eyebrow">YOUR WORKSPACE</p><h2>Welcome back</h2><p className="auth-copy">Sign in to plan, price, and manage your work.</p>
  <div className="role-pick"><span className="eyebrow">I AM A</span><div className="form-grid"><button type="button" className={role==='tech'?'primary':'secondary'} aria-pressed={role==='tech'} onClick={()=>chooseRole('tech')}>Technician</button><button type="button" className={role==='dispatch'?'primary':'secondary'} aria-pressed={role==='dispatch'} onClick={()=>chooseRole('dispatch')}>Dispatch</button></div></div>
  <label>Email address<input autoComplete="username" type="email" required value={authEmail} placeholder="you@company.com" onChange={e=>setAuthEmail(e.target.value)}/></label><label>Password<input autoComplete="current-password" type="password" required value={authPassword} placeholder="Enter your password" onChange={e=>setAuthPassword(e.target.value)}/></label>{authMessage&&<p className="notice error" role="alert">{authMessage}</p>}<button type="submit" className="primary wide" disabled={authBusy}>{authBusy?'Signing in…':'Sign in'}</button><p className="auth-help">Need access? Ask your workspace administrator.</p></form><p className="auth-foot"><Icon name="lock"/>Private workspace · Staff access only</p></section></main>;
 if(session&&!role)return <main className="auth-shell"><section className="auth-form-side"><div className="auth-mobile-brand"><Brand/></div><div className="auth-card"><span className="auth-lock"><Icon name="lock"/></span><p className="eyebrow">CHOOSE YOUR VIEW</p><h2>How will you use Clarifi today?</h2><div className="form-grid"><button className="primary" onClick={()=>chooseRole('tech')}>I’m a technician</button><button className="secondary" onClick={()=>chooseRole('dispatch')}>I’m dispatch</button></div><p className="auth-help">Technicians collect field info. Dispatch runs the pipeline: clients, estimates, invoices, team.</p></div></section></main>;

 return <div className={`shell ${mode}-mode`}><a className="skip-link" href="#main-content">Skip to content</a>
  <header className="topbar"><span className="brand-button" onClick={()=>go(mode==='office'?'pipeline':'today')}><Brand/></span><nav className="topnav" aria-label="Primary">{navItems.map(v=><button key={v} className={view===v||(v==='pipeline'&&view==='job')?'nav-active':''} onClick={()=>go(v)}><Icon name={v==='pipeline'?'overview':v==='today'?'calendar':v}/>{navLabels[v]}</button>)}</nav><span className="top-actions"><span className="workspace-label">{role==='tech'?'Technician':'Dispatch'}</span><button className="icon-button" aria-label="Sign out" onClick={signOut}><Icon name="logout"/></button></span></header>
  <main id="main-content" className="main-shell">
   {view==='pipeline'&&pipelineHome}
   {view==='job'&&jobDetail()}
   {view==='today'&&todayHome}
   {view==='collect'&&collectView()}
   {view==='clients'&&clientsView}
   {view==='team'&&teamView}
   {view==='invoices'&&invoicesView}
  </main><footer className="workspace-footer"><span>clarifi. <span>Clear scope. Connected work.</span></span></footer>
  {showIntake&&<Modal title="Start with the client" onClose={()=>setShowIntake(false)}><p className="helper">Capture the request now. Scope and photos come next.</p>{notice&&<p className="notice error" role="alert">{notice}</p>}<form onSubmit={e=>{e.preventDefault();createLead()}}><div className="form-grid"><label>Client name<input id="client-name" required placeholder="Full name or company"/></label><label>Email<input id="client-email" type="email" autoComplete="email"/></label><label>Phone<input id="client-phone" type="tel" autoComplete="tel"/></label><label>Property address<input id="client-address" autoComplete="street-address"/></label><label>Relationship<select value={clientType} onChange={e=>setClientType(e.target.value)}><option>Owner</option><option>Tenant</option><option>Property Management</option><option>Commercial</option><option>Other</option></select></label><label>Service<select id="client-service">{SERVICES.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select></label></div><label>Service request<input id="client-request" required placeholder="e.g. Patio door replacement"/></label><label>Request details<textarea id="client-details" placeholder="What needs to be done? Include known conditions and access details."/></label><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setShowIntake(false)}>Cancel</button><button type="submit" className="primary">Create request</button></div></form></Modal>}
 </div>;
}
