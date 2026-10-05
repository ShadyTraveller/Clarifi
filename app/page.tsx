'use client';

import { useEffect, useState } from 'react';
import {Icon,Brand,Badge,Empty,Panel,AsyncButton,Modal,money,dateKey,localDateTime} from './ui';
import { supabase } from './lib_supabase';
import dynamic from 'next/dynamic';
import {RequestComposer,EstimateComposer} from './Composers';
import PhotosPanel from './PhotosPanel';
import Markdown from './Markdown';
import Measurements from './Measurements';
import JobThread from './components/JobThread';
import IntakeWizard from './components/intake/IntakeWizard';
import EstimateBuilder from './components/estimate/EstimateBuilder';
import { serviceLabel as displayService, PHOTO_CHECKLISTS as tradePhotos, hasCoordinates } from './lib/domain';
const DispatchMap = dynamic(() => import('./DispatchMap'), { ssr: false, loading: () => <p role="status">Loading map…</p> });

/* ---------------------------------- data ---------------------------------- */

const SERVICES=[
 {key:'security_film',label:'Security Film',detail:'High-impact shatter film per square foot, installation solution'},
 {key:'locksmith',label:'Locksmith',detail:'Rekey, lock change'},
 {key:'windows',label:'Windows',detail:'Replacement'},
 {key:'doors',label:'Doors',detail:'Repair or replacement'},
 {key:'skincare',label:'Skincare',detail:'Skincare service call'},
];
const serviceLabel=(key:string)=>displayService(key);

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
type View='pipeline'|'dispatch'|'estimates'|'job'|'clients'|'team'|'invoices'|'today'|'collect';
function savedPreference(name:string){try{return localStorage.getItem(`yavamo-${name}`)||localStorage.getItem(`clarifi-${name}`)}catch{return null}}

export default function Home(){
 const [session,setSession]=useState<any>(null),[authReady,setAuthReady]=useState(false);
 const [authEmail,setAuthEmail]=useState(''),[authPassword,setAuthPassword]=useState(''),[authMessage,setAuthMessage]=useState(''),[authBusy,setAuthBusy]=useState(false);
 const [showPassword,setShowPassword]=useState(false);
 const [role,setRole]=useState<string|null>(()=>savedPreference('role'));
 const [mode,setMode]=useState<'field'|'office'>(()=>savedPreference('mode')==='field'?'field':'office');
 const [view,setView]=useState<View>('pipeline');
 const [search,setSearch]=useState('');
 const [loading,setLoading]=useState(true),[notice,setNotice]=useState('');
 const [clients,setClients]=useState<any[]>([]),[jobs,setJobs]=useState<any[]>([]),[quotes,setQuotes]=useState<any[]>([]),[invoices,setInvoices]=useState<any[]>([]),[templates,setTemplates]=useState<any[]>([]);
 const [measurements,setMeasurements]=useState<any[]>([]),[members,setMembers]=useState<any[]>([]),[techs,setTechs]=useState<any[]>([]),[requirements,setRequirements]=useState<any[]>([]),[files,setFiles]=useState<any[]>([]);
 const [profiles,setProfiles]=useState<any[]>([]),[suppliers,setSuppliers]=useState<any[]>([]);
 const [orgId,setOrgId]=useState(''),[memberRole,setMemberRole]=useState('');
 const [selectedJob,setSelectedJob]=useState(''),[stage,setStage]=useState<StageKey>('intake');
 const [showIntake,setShowIntake]=useState(false);
 const [depositPct,setDepositPct]=useState(''),[expiryDays,setExpiryDays]=useState('14');
 const [collectNote,setCollectNote]=useState('');
 const [showEstimate,setShowEstimate]=useState(false),[estimateJob,setEstimateJob]=useState(''),[showHelp,setShowHelp]=useState(false),[showTech,setShowTech]=useState(false);
 const [quoteLinks,setQuoteLinks]=useState<Record<string,string>>({});
 const [reviewLines,setReviewLines]=useState<any[]>([]);
 const [reviewEmail,setReviewEmail]=useState('');
 const [sendingEmail,setSendingEmail]=useState(false);

 function chooseRole(r:'tech'|'dispatch'){try{localStorage.setItem('yavamo-role',r);localStorage.setItem('yavamo-mode',r==='tech'?'field':'office')}catch(e){}setRole(r);const m=r==='tech'?'field':'office';setMode(m);setView(r==='tech'?'today':'pipeline');window.scrollTo({top:0,behavior:'instant'})}
 function go(v:View){setView(v);window.scrollTo({top:0,behavior:'instant'})}
 function openJob(id:string){setSelectedJob(id);const j=jobs.find(x=>x.id===id);setStage(j?stageOf(j):'intake');setDepositPct('');setNotice('');if(j)ensurePhotoRequirements(j);go('job')}
 function openCollect(id:string){setSelectedJob(id);setCollectNote('');const j=jobs.find(x=>x.id===id);if(j)ensurePhotoRequirements(j);go('collect')}

 /* ------------------------------- auth/data ------------------------------ */
 useEffect(()=>{let alive=true;supabase.auth.getSession().then(({data,error})=>{if(!alive)return;setSession(data.session);setAuthReady(true);if(error)setAuthMessage(error.message)});const {data:sub}=supabase.auth.onAuthStateChange((_e,s)=>{if(alive)setSession(s)});return()=>{alive=false;sub.subscription.unsubscribe()}},[]);
 useEffect(()=>{if(session)loadData();else{setLoading(false);setClients([]);setJobs([]);setQuotes([]);setInvoices([])}},[session?session.user?.id:null]);
 async function membership(){const {data:{user}}=await supabase.auth.getUser();if(!user)return null;const {data}=await supabase.from('organization_members').select('*').eq('user_id',user.id).eq('active',true).limit(1).single();return data}
 async function loadData(){setLoading(true);setNotice('');try{const m=await membership();if(!m){setNotice('No workspace membership found. Contact your administrator.');setLoading(false);return}setMemberRole(m.role);setOrgId(m.organization_id);
  if(m.role==='technician'){setRole('tech');setMode('field');setView(v=>['today','collect','job'].includes(v)?v:'today')}else if(mode==='office'){setView(v=>v==='today'?'pipeline':v)}
  const [c,j,q,i,t,me,mb,te,rq,fi,mp,su,lo]=await Promise.all([
   supabase.from('clients').select('*').order('created_at',{ascending:false}),
   supabase.from('jobs').select('*,clients(*)').order('created_at',{ascending:false}),
   supabase.from('quotes').select('*,quote_versions(*)').order('created_at',{ascending:false}),
   supabase.from('invoices').select('*').order('created_at',{ascending:false}),
   supabase.from('scope_templates').select('*').order('name'),
   supabase.from('job_measurements').select('*').order('created_at',{ascending:false}),
   supabase.from('organization_members').select('*').order('created_at'),
   supabase.from('technicians').select('*').eq('active',true).order('name'),
   supabase.from('job_requirements').select('*').order('created_at'),
   supabase.from('job_files').select('*').order('created_at',{ascending:false}),
   supabase.from('markup_profiles').select('*').eq('active',true).order('name'),
   supabase.from('suppliers').select('*').eq('active',true).order('name'),
   supabase.from('technician_locations').select('*')]);
  const failed=[c,j,q,i,t,me,mb,te,rq,fi,mp,su].find(r=>r.error);if(failed?.error)setNotice('Some workspace data could not load: '+failed.error.message);
  setClients(c.data||[]);setJobs(j.data||[]);setQuotes((q.data||[]).map(quote=>{const v=[...(quote.quote_versions||[])].sort((a,b)=>b.version_number-a.version_number)[0];return {...quote,total:v?.total||0,subtotal:v?.subtotal||0,tax:v?.tax||0,scope:v?.scope_markdown||quote.client_message}}));setInvoices(i.data||[]);setTemplates(t.data||[]);setMeasurements(me.data||[]);setMembers(mb.data||[]);setTechs((te.data||[]).map(tech=>{const loc=lo.data?.find(l=>l.technician_id===tech.id);return {...tech,latitude:loc?.latitude,longitude:loc?.longitude,location_updated_at:loc?.updated_at}}));setRequirements(rq.data||[]);setFiles(fi.data||[]);setProfiles(mp.data||[]);setSuppliers(su.data||[]);ensureDefaultTemplates(m.organization_id,t.data||[]);
 }catch(e){setNotice('Unable to refresh the workspace. Check your connection and try again.')}finally{setLoading(false)}}
 async function ensureDefaultTemplates(org:string,existing:any[]){if(DEFAULT_TEMPLATES.every(t=>existing.some(e=>e.name===t.name)))return;const {error}=await supabase.rpc('seed_clarifi_templates',{target_org:org});if(error){setNotice(error.message);return}const {data}=await supabase.from('scope_templates').select('*').eq('organization_id',org).order('name');if(data)setTemplates(data)}
 async function authenticate(){setAuthBusy(true);setAuthMessage('');try{const email=authEmail.trim().toLowerCase();setAuthEmail(email);const {error}=await supabase.auth.signInWithPassword({email,password:authPassword});if(error)setAuthMessage(error.code==='invalid_credentials'?'The email or password does not match. Check the email address and password, including capitalization.':error.message);else{setAuthPassword('');setShowPassword(false)}}catch{setAuthMessage('Unable to reach the sign-in service. Check your connection and try again.')}finally{setAuthBusy(false)}}
 async function signOut(){await supabase.auth.signOut();setSession(null)}

 /* --------------------------------- actions -------------------------------- */
 async function ensurePhotoRequirements(job:any){try{const list=tradePhotos[displayService(job.service||'')]||[];if(!list.length)return;const {data:have}=await supabase.from('job_requirements').select('label').eq('job_id',job.id);const haveSet=new Set((have||[]).map((r:any)=>r.label));const missing=list.filter(l=>!haveSet.has(l));
  if(missing.length)await supabase.from('job_requirements').insert(missing.map((label,i)=>({organization_id:orgId,job_id:job.id,label,required:true,completed:false,sort_order:i})));
  const {data}=await supabase.from('job_requirements').select('*').eq('job_id',job.id).order('created_at');if(data)setRequirements(prev=>[...prev.filter(r=>r.job_id!==job.id),...data])}catch(e){}}
 async function toggleRequirement(id:string,completed:boolean){const {error}=await supabase.from('job_requirements').update({completed}).eq('id',id);if(!error)setRequirements(prev=>prev.map(r=>r.id===id?{...r,completed}:r))}
 async function issueLink(quote:any){const {data,error}=await supabase.rpc('issue_clarifi_quote_token',{target_quote:quote.id});if(error){setNotice(error.message);return}const link=window.location.origin+'/quote/'+data;setQuoteLinks(prev=>({...prev,[quote.id]:link}));setNotice('Approval link ready. Copy it to share with the client.');return link}
 async function setTermsAndSend(){const q=latestQuote(selectedJob);if(!q)return setNotice('Build the estimate first.');if(!['reviewed','sent','approved'].includes(q.status))return setNotice('Office review is required before an approval link can be created.');const {error}=await supabase.rpc('set_quote_commercial_terms',{target_quote:q.id,expiry:Number(expiryDays)||14,deposit_pct:depositPct===''?null:Number(depositPct)});if(error)return setNotice(error.message);await issueLink(q);await loadData()}
 /* Office review gate: an estimate cannot be sent until the office marks it reviewed. */
 async function markReviewed(){const q=latestQuote(selectedJob);if(!q)return setNotice('Build the estimate first.');const {error}=await supabase.from('quotes').update({status:'reviewed'}).eq('id',q.id);if(error)return setNotice(error.message);await loadData();setNotice('Estimate reviewed — the approval link can now be created.')}
 async function loadReviewLines(quoteId:string){const {data:v}=await supabase.from('quote_versions').select('id').eq('quote_id',quoteId).order('version_number',{ascending:false}).limit(1).maybeSingle();if(!v)return setReviewLines([]);const {data:lines}=await supabase.from('quote_line_items').select('*').eq('quote_version_id',v.id).order('sort_order');setReviewLines(lines||[])}
 async function emailApprovalLink(){const q=latestQuote(selectedJob);const link=q&&quoteLink(q);const token=link?.split('/quote/')[1];if(!q||!token)return setNotice('Create the approval link first.');if(!/.+@.+\..+/.test(reviewEmail))return setNotice('Enter a valid client email address.');setSendingEmail(true);try{const {data:{session}}=await supabase.auth.getSession();const res=await fetch(`/api/quote/${encodeURIComponent(token)}/send`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${session?.access_token||''}`},body:JSON.stringify({email:reviewEmail})});const data=await res.json();if(data?.sent)setNotice(`Approval link emailed to ${reviewEmail}.`);else setNotice(data?.message||'Email not sent — copy the link manually.')}catch{setNotice('Email not sent — copy the link manually.')}finally{setSendingEmail(false)}}
 async function recordApproval(){const job=currentJob,q=latestQuote(job?.id);if(!job||!q)return;const name=job.clients?.name||'Customer';const {error}=await supabase.rpc('record_quote_approval',{target_quote:q.id,approver_name:name,approver_email:job.clients?.email||null});if(error)return setNotice(error.message);await loadData()}
 async function assignTech(jobId:string,technician_id:string){const {error}=await supabase.from('jobs').update({technician_id:technician_id||null}).eq('id',jobId);if(error)return setNotice(error.message);await loadData()}
 async function scheduleJob(jobId:string,when:string){if(!when)return;const {error}=await supabase.from('jobs').update({scheduled_start:new Date(when).toISOString(),status:'active'}).eq('id',jobId);if(error)return setNotice(error.message);await loadData()}
 async function completeJob(jobId:string){const {error}=await supabase.rpc('mark_service_call_complete',{target_job:jobId});if(error)return setNotice(error.message);await loadData()}
 async function invoiceJob(jobId:string){const q=latestQuote(jobId);if(!q)return setNotice('No approved quote to invoice.');const {error}=await supabase.rpc('create_invoice_from_approved_quote',{target_quote:q.id});if(error)return setNotice(error.message);await loadData()}
 /* Load internal line items when the office opens the review stage. */
 useEffect(()=>{const q=selectedJob?latestQuote(selectedJob):null;if(view==='job'&&stage==='review'&&q)loadReviewLines(q.id);else setReviewLines([])},[view,stage,selectedJob]);
 /* Net-margin guardrails mirror the confirmed per-service defaults (office can override per estimate). */
 const NET_GUARDRAILS:Record<string,number>={'Locksmith':24,'Security Film':15,'Windows':10,'Doors':8,'Skincare':20};
 async function saveCollectNote(){if(!selectedJob||!collectNote.trim())return;const job=currentJob;const stamp=new Date().toLocaleString();const next=`${job?.details||''}\n[Field notes ${stamp}] ${collectNote.trim()}`.trim();const {error}=await supabase.from('jobs').update({details:next}).eq('id',selectedJob);if(error)return setNotice(error.message);setCollectNote('');await loadData();setNotice('Field notes saved.')}

 /* --------------------------------- derived -------------------------------- */
 const currentJob=jobs.find(j=>j.id===selectedJob);
 const latestQuote=(jobId?:string)=>{if(!jobId)return null;const list=quotes.filter(q=>q.job_id===jobId).sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime());return list[0]||null};
 const quoteLink=(q:any)=>q?quoteLinks[q.id]||'':'';
 const jobPhotos=(id:string)=>files.filter(f=>f.job_id===id);
 const jobMeasures=(id:string)=>measurements.filter(m=>m.job_id===id);
 function stageOf(j:any):StageKey{if(!j)return 'intake';if(j.status==='completed')return 'done';const q=latestQuote(j.id);if(q?.status==='approved')return (j.technician_id||j.scheduled_start)?'dispatch':'approve';if(q?.status==='sent'||q?.status==='changes_requested')return 'approve';if(q)return 'price';if(j.scope_template_id)return 'scope';return 'intake'}
 const stageIndex=(s:StageKey)=>STAGES.findIndex(x=>x.key===s);
 const openJobs=jobs.filter(j=>j.status!=='completed');
 const todayJobs=jobs.filter(j=>j.scheduled_start&&dateKey(new Date(j.scheduled_start))===dateKey(new Date())&&j.status!=='completed');
 const myJobs=todayJobs.filter(j=>j.assigned_to===session?.user?.id||techs.some(t=>t.auth_user_id===session?.user?.id&&t.id===j.technician_id));
 const filteredJobs=openJobs.filter(j=>(`${j.clients?.name||''} ${j.request||''} ${j.clients?.address||''} ${serviceLabel(j.service||'')}`).toLowerCase().includes(search.toLowerCase()));
 const newRequest=<button className="primary" onClick={()=>{setNotice('');setShowIntake(true)}}><Icon name="plus"/>New request</button>;
 const stageBadge=(j:any)=>{const s=stageOf(j);const meta=STAGES.find(x=>x.key===s)!;return <span className={`badge ${s}`}>{meta.label}</span>};

 /* ------------------------------ workspace views --------------------------- */
 /* Dashboard board columns map to the job lifecycle Lavie confirmed. */
 const BOARD_COLS:{key:string;label:string}[]=[{key:'lead',label:'Lead / Client'},{key:'estimate',label:'Estimate'},{key:'active',label:'Job'},{key:'completed',label:'Completed'}];
 function boardColOf(j:any):string{
  if(j.status==='completed')return 'completed';
  if(j.status==='active')return 'active';
  if(j.status==='estimate')return 'estimate';
  const q=latestQuote(j.id);
  if(q)return 'estimate';
  return 'lead';
 }
 function nextAction(j:any):string{
  const col=boardColOf(j),q=latestQuote(j.id);
  if(col==='completed')return 'View invoice';
  if(col==='lead')return q?'Review estimate':'Build estimate';
  if(col==='estimate'){
   if(!q)return 'Build estimate';
   if(q.status==='approved')return 'Schedule job';
   if(q.status==='sent')return 'Waiting on client';
   if(q.status==='changes_requested')return 'Revise estimate';
   if(q.status==='reviewed')return 'Send to client';
   return 'Review & send';
  }
  if(j.status==='completed')return 'View invoice';
  if(!j.technician_id)return 'Assign tech';
  if(!j.scheduled_start)return 'Schedule visit';
  return 'Mark complete';
 }
 const pipelineHome=<><div className="view-heading"><div><p className="eyebrow">PIPELINE</p><h1>Jobs</h1><p className="view-description">Lead → estimate → job → completed. Tap a card to open the job thread.</p></div><div className="button-wrap">{newRequest}</div></div>
 {notice&&<p className="notice" role="status">{notice}</p>}
 {loading?<p role="status">Loading jobs…</p>:filteredJobs.length?<><div className="filter-bar"><label className="search-input"><Icon name="search"/><input aria-label="Search jobs" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search client, address, service…"/></label><span className="result-count">{filteredJobs.length} jobs</span></div><div className="pipeline-board">{BOARD_COLS.map(col=>{const cards=filteredJobs.filter(j=>boardColOf(j)===col.key);return <section className="pipeline-column" key={col.key} aria-label={col.label}><header><h2>{col.label}</h2><span className="pipeline-count">{cards.length}</span></header>{cards.map(j=>{const q=latestQuote(j.id);return <article className="job-card" key={j.id}><button className="job-card-main" onClick={()=>openJob(j.id)} aria-label={`Open ${j.clients?.name||'client'} job`}><div className="job-card-top">{stageBadge(j)}<small>{serviceLabel(j.service||'')}</small></div><h2>{j.clients?.name||'Client'}</h2><p>{j.request}</p><small>{j.clients?.address||'Address needed'}</small><div className="job-card-footer"><span>{techs.find(t=>t.id===j.technician_id)?.name||'Unassigned'}</span>{q&&<strong>{money(q.total)}</strong>}</div><span className="next-action">{nextAction(j)} →</span></button></article>})}{!cards.length&&<p className="helper">Nothing here.</p>}</section>})}</div></>:<section className="first-step"><div><span className="step-number">01</span><h2>Start with the call.</h2><p>Name, contact, property role, address, and the problem. The request comes back structured with an assignment or a clear unassigned state.</p><button className="text-button" onClick={()=>setShowIntake(true)}>Create first request ↗</button></div><div className="call-example"><p className="eyebrow">CLIENT SAYS…</p><blockquote>“Residential lock change. Existing gripset is loose. Wants matte black.”</blockquote><footer><span>● Yavamo request</span><span>↵</span></footer></div></section>}
 </>;
 const dispatchHome=<><div className="view-heading"><div><p className="eyebrow">DISPATCH BOARD</p><h1>Who is where.</h1></div><button className="text-button" onClick={()=>setShowTech(true)}>Add technician</button></div>{notice&&<p className="notice" role="status">{notice}</p>}<div className="dispatch-board"><div className="live-map"><DispatchMap jobs={openJobs} techs={techs} onSelect={openJob}/><div className="map-legend"><span>● Technician</span><span>● Request</span></div>{![...openJobs,...techs].some(hasCoordinates)&&<div className="map-empty"><b>＋</b><h2>No located work yet</h2><p>Add a technician location or request coordinates to place the first pin.</p></div>}</div><aside className="field-roster"><p className="eyebrow">FIELD ROSTER</p><h2>Technicians</h2>{!techs.length&&<p>Add the team, specialties, and an optional live location.</p>}{techs.map(t=><article key={t.id}><strong>{t.name}</strong><small>{(t.specialties||[]).join(', ')}</small><small>{hasCoordinates(t)?'Location updated '+new Date(t.location_updated_at).toLocaleTimeString():'Location not shared'}</small><span>{openJobs.filter(j=>j.technician_id===t.id).length} open assignments</span></article>)}</aside></div></>;
 const estimatesHome=<><div className="view-heading"><div><p className="eyebrow">SCOPE & PRICING</p><h1>Ready to go, not locked in.</h1><p className="view-description">Source Canadian products, compare three real options, edit the scope, then preview exactly what the client sees.</p></div><button className="text-button" onClick={()=>{setEstimateJob('');setShowEstimate(true)}}>New estimate</button></div>{notice&&<p className="notice" role="status">{notice}</p>}{quotes.length?<div className="job-list">{quotes.map(q=>{const j=jobs.find(j=>j.id===q.job_id);return <article className="job-card" key={q.id}><button className="job-card-main" onClick={()=>{openJob(q.job_id);setStage('review')}}><Badge status={q.status}/><h2>{j?.clients?.name||'Client'}</h2><p>{j?.request}</p><div className="job-card-footer"><small>{q.quote_number}</small><strong>{money(q.total)}</strong></div></button></article>})}</div>:<section className="first-step"><div><span className="step-number">02</span><h2>Diagnosis in. Estimate out.</h2><p>Try the locksmith example: type “residential lock change” and “gripset.” The estimate searches Amazon Canada and Home Depot Canada for three priced product choices.</p><button className="text-button" onClick={()=>{setEstimateJob('');setShowEstimate(true)}}>Build first estimate ↗</button></div><div className="estimate-example" aria-hidden="true"><div/><div/><div/></div></section>}</>;

 /* -------------------------------- job detail ------------------------------ */
 const jobDetail=()=>{const j=currentJob;if(!j)return <Empty icon="jobs" title="No job selected" action={<button className="secondary" onClick={()=>go('pipeline')}>Back to pipeline</button>}/>;
  const q=latestQuote(j.id);const cur=stageOf(j);const activeStage=stage;
  const rel=(j.clients?.relationship||'other').toLowerCase();
  const defaultDep=DEPOSIT_PCT[rel]??50;
  const photos=jobPhotos(j.id),measures=jobMeasures(j.id),reqs=requirements.filter(r=>r.job_id===j.id);
  const total=q?.total??0;
  return <><div className="breadcrumb"><button className="text-button" onClick={()=>go('pipeline')}>← Pipeline</button></div>
  <div className="view-heading"><div><p className="eyebrow">{serviceLabel(j.service||'').toUpperCase()}</p><h1>{j.clients?.name||'Client'}</h1><p className="view-description">{j.request}</p></div>{stageBadge(j)}</div>
  {notice&&<p className="notice" role="status">{notice}</p>}
  <ol className="stepper" aria-label="Job stages">{STAGES.map(s=>{const idx=stageIndex(s.key),curIdx=stageIndex(cur);const done=idx<curIdx;return <li key={s.key} className={s.key===activeStage?'current':done?'done':''}><button onClick={()=>setStage(s.key)} aria-current={s.key===activeStage?'step':undefined}><span>{done?'✓':idx+1}</span>{s.label}</button></li>})}</ol>

  {activeStage==='intake'&&<Panel title="Client intake" subtitle="Captured at first call"><div className="record-list">
   {[['Name',j.clients?.name],['Email',j.clients?.email],['Phone',j.clients?.phone],['Address',j.clients?.address],['Relationship',(j.clients?.relationship||'').replaceAll('_',' ')],['Service',serviceLabel(j.service||'')],['Request',j.request]].map(([k,v])=>v&&<div className="record-card" key={k}><div className="record-heading"><strong>{k}</strong></div><p>{v}</p></div>)}
   {j.request_markdown&&<Markdown>{j.request_markdown}</Markdown>}
   {j.details&&<div className="record-card"><div className="record-heading"><strong>Details & field notes</strong></div><p style={{whiteSpace:'pre-wrap'}}>{j.details}</p></div>}</div></Panel>}

  {activeStage==='scope'&&<><Panel title="Scope template" subtitle="Choose the standard starting point"><div className="template-picks">{templates.filter(t=>displayService(t.trade)===displayService(j.service)).map(t=><button key={t.id} className="template-pick" onClick={()=>{setEstimateJob(j.id);setShowEstimate(true)}}><span className="template-copy"><small>{t.trade}</small><strong>{t.name}</strong><span>{t.description}</span></span></button>)}</div></Panel><PhotosPanel job={j} orgId={orgId} files={photos} requirements={reqs} onRefresh={loadData}/><Measurements jobId={j.id} orgId={orgId} measurements={measures} onRefresh={loadData}/></>}

  {activeStage==='price'&&<Panel title="Scope & pricing" subtitle="Source products, edit pricing, and preview the client estimate."><button className="primary" onClick={()=>{setEstimateJob(j.id);setShowEstimate(true)}}>New estimate ↗</button>{q?<><Markdown>{q.scope||''}</Markdown><dl className="totals"><div><dt>Subtotal</dt><dd>{money(q.subtotal)}</dd></div><div><dt>Tax</dt><dd>{money(q.tax)}</dd></div><div className="grand"><dt>Total CAD</dt><dd>{money(q.total)}</dd></div></dl></>:<p className="helper">Create an editable draft from diagnosis, photos, and dimensions.</p>}</Panel>}

  {activeStage==='review'&&(()=>{const guardrail=NET_GUARDRAILS[serviceLabel(j.service||'')]??10;const lineCost=reviewLines.reduce((s,l)=>s+Number(l.quantity||0)*Number(l.unit_cost||0),0);const sub=q?.subtotal??0;const net=sub>0?((sub-lineCost)/sub*100):null;const reviewed=!!(q&&['reviewed','sent','approved'].includes(q.status));
  const lineMargin=(l:any)=>Number(l.unit_price)>0?(((Number(l.unit_price)-Number(l.unit_cost||0))/Number(l.unit_price))*100):null;
  return (<>
  <Panel title="Margin check" subtitle="Internal only \u2014 never shown to the client">
  {reviewLines.length?<>
    <div className="estimate-lines">{reviewLines.map((l:any)=>{const m=lineMargin(l);return <div key={l.id}><div><strong>{l.item_name}</strong><small>{l.quantity} {l.unit||'each'} \u00b7 cost {money(Number(l.quantity)*Number(l.unit_cost||0))} \u00b7 price {money(Number(l.total)||0)}</small></div><strong>{m==null?'\u2014':m.toFixed(0)+'% margin'}</strong></div>})}</div>
    <dl className="totals"><div><dt>Net margin</dt><dd>{net==null?'\u2014':net.toFixed(1)+'%'}</dd></div><div><dt>Guardrail ({serviceLabel(j.service||'')})</dt><dd>{guardrail}%</dd></div></dl>
    {net!=null&&net<guardrail&&<p className="notice warning" role="alert">Net margin {net.toFixed(1)}% is below the {guardrail}% guardrail. Adjust pricing before sending.</p>}
  </>:<p className="helper">Line-item costs load here for office review.</p>}
  </Panel>
  <Panel title="Office review & send" subtitle="Review is mandatory before the client sees anything">
  <dl className="totals"><div><dt>Estimate total</dt><dd>{money(total)}</dd></div></dl>
  <div className="form-grid"><label>Deposit %<input value={depositPct} onChange={e=>setDepositPct(e.target.value)} placeholder={String(defaultDep)} inputMode="numeric"/></label><label>Valid for (days)<input value={expiryDays} onChange={e=>setExpiryDays(e.target.value)} inputMode="numeric"/></label></div>
  <p className="helper">Default deposit for {(j.clients?.relationship||'').replaceAll('_',' ')||'this client type'}: {defaultDep}%{depositPct&&Number(depositPct)!==defaultDep?' (overridden)':''}.</p>
  <div className="button-wrap">{!reviewed&&<AsyncButton className="secondary" onClick={markReviewed}><Icon name="check"/>Mark as reviewed</AsyncButton>}<AsyncButton className="primary" disabled={!reviewed} onClick={setTermsAndSend}><Icon name="check"/>Create approval link</AsyncButton></div>
  {!reviewed&&<p className="helper">The approval link unlocks after office review.</p>}
  {q&&quoteLink(q)&&<>
    <p className="helper">Client link:</p>
    <p className="quote-link">{quoteLink(q)}</p>
    <div className="button-wrap"><button className="secondary" onClick={()=>navigator.clipboard?.writeText(quoteLink(q)).then(()=>setNotice('Link copied.'))}>Copy link</button>{j.clients?.phone&&<a className="secondary" href={`sms:${j.clients.phone}?&body=${encodeURIComponent('Your Yavamo estimate: '+quoteLink(q))}`}>Text link</a>}</div>
    <div className="form-grid" style={{marginTop:12}}><label>Email approval link to client<input type="email" value={reviewEmail} onChange={e=>setReviewEmail(e.target.value)} placeholder={j.clients?.email||'client@example.com'}/></label></div>
    <div className="button-wrap"><AsyncButton className="secondary" disabled={sendingEmail||!/.+@.+\..+/.test(reviewEmail)} onClick={emailApprovalLink}>{sendingEmail?'Sending\u2026':'Send email'}</AsyncButton></div>
    <p className="helper">Email sending needs a configured provider \u2014 otherwise copy the link.</p>
  </>}
  </Panel>
  </>)})()}

  {activeStage==='approve'&&<Panel title="Client approval" subtitle="Approved → deposit → job activates"><div className="record-list"><div className="record-card"><div className="record-heading"><strong>Status</strong></div><p>{q?({draft:'Draft — not sent yet',sent:'Sent — waiting on client',approved:'Approved ✓',changes_requested:'Changes requested'} as any)[q.status]||q.status:'No quote yet'}</p></div>
   {q&&<div className="record-card"><div className="record-heading"><strong>Deposit due</strong></div><p>{money(total*(Number(q.deposit_percent??defaultDep)/100))} ({q.deposit_percent??defaultDep}%)</p></div>}</div>
   <div className="button-wrap"><AsyncButton className="secondary" onClick={recordApproval}>Record phone approval</AsyncButton>{q&&q.status!=='approved'&&<AsyncButton className="primary" onClick={async()=>{await recordApproval();setStage('dispatch')}}>Mark approved & continue</AsyncButton>}</div></Panel>}

  {activeStage==='dispatch'&&<><Panel title="Assign & schedule" subtitle="Closest tech first — see the live map"><div className="assignment-list">{techs.map(t=><label className="checklist-row" key={t.id}><input type="radio" name="tech" checked={j.technician_id===t.id} onChange={()=>assignTech(j.id,t.id)}/><span>{t.name}{t.trade?` · ${t.trade}`:''}</span></label>)}{!techs.length&&<p className="helper">No technicians on the team yet — add them under Team.</p>}</div>
   <label>Schedule visit<input type="datetime-local" defaultValue={j.scheduled_start?localDateTime(j.scheduled_start):''} onChange={e=>scheduleJob(j.id,e.target.value)}/></label></Panel>
   <Panel title="Route" subtitle="Job location & supplier pickups"><div className="dispatch-map"><DispatchMap jobs={[j]} techs={techs}/></div><p className="helper">Plan supplier pickups (Home Depot Canada / Amazon) around this stop.</p></Panel></>}

  {activeStage==='done'&&<Panel title="Completion & invoice" subtitle="Finish the work, bill it"><div className="button-wrap">{j.status!=='completed'&&<AsyncButton className="primary" onClick={async()=>{await completeJob(j.id);await loadData()}}><Icon name="check"/>Mark complete</AsyncButton>}<AsyncButton className="secondary" onClick={async()=>{await invoiceJob(j.id);await loadData()}}><Icon name="invoice"/>Create invoice</AsyncButton></div>
   {invoices.filter(i=>i.job_id===j.id).map(i=><div className="invoice-card" key={i.id}><div><strong>{i.invoice_number}</strong><small>{i.status}</small></div><strong>{money(i.total)}</strong></div>)}</Panel>}
   <JobThread job={j} files={photos} orgId={orgId} onRefresh={loadData} onNotice={setNotice}/>
  </>};

 /* ------------------------------ tech: today -------------------------------- */
 const todayHome=<><div className="view-heading"><div><p className="eyebrow">TECHNICIAN</p><h1>Today’s jobs</h1><p className="view-description">{myJobs.length} assigned today · collect field info, Yavamo prices it</p></div><button className="secondary" onClick={shareLocation}>Share my location</button></div>
  {notice&&<p className="notice" role="status">{notice}</p>}
  {loading?<p role="status"><span className="spinner"/>Loading…</p>:myJobs.length?<div className="visit-list">{myJobs.map(j=><article className="visit" key={j.id}><div><strong>{j.clients?.name||'Client'}</strong><small>{j.request} · {serviceLabel(j.service||'')}</small><small>{j.clients?.address||''}{j.scheduled_start?` · ${localDateTime(j.scheduled_start)}`:''}</small></div><AsyncButton className="primary" onClick={()=>openCollect(j.id)}>Open</AsyncButton></article>)}</div>:<Empty icon="calendar" title="Nothing scheduled" detail="New assignments from dispatch will appear here."/>}</>;

 /* ------------------------------ tech: collect ------------------------------ */
 const collectView=()=>{const j=currentJob;if(!j)return <Empty icon="jobs" title="No job selected"/>;const reqs=requirements.filter(r=>r.job_id===j.id);const photos=jobPhotos(j.id),measures=jobMeasures(j.id);
  return <><div className="breadcrumb"><button className="text-button" onClick={()=>go('today')}>← Today’s jobs</button></div>
  <div className="view-heading"><div><p className="eyebrow">{serviceLabel(j.service||'').toUpperCase()}</p><h1>{j.clients?.name||'Client'}</h1><p className="view-description">{j.request} · {j.clients?.address||''}</p></div></div>
  {notice&&<p className="notice" role="status">{notice}</p>}
  <PhotosPanel job={j} orgId={orgId} files={photos} requirements={reqs} onRefresh={loadData}/>
  <Measurements jobId={j.id} orgId={orgId} measurements={measures} onRefresh={loadData}/>
  <Panel title="Field notes" subtitle="What did you find? Yavamo handles pricing — just collect the facts."><textarea value={collectNote} onChange={e=>setCollectNote(e.target.value)} placeholder="Condition, access issues, customer requests…" rows={3}/><div className="button-wrap"><AsyncButton className="primary" onClick={saveCollectNote}>Save notes</AsyncButton><AsyncButton className="secondary" onClick={()=>go('today')}>Done — back to jobs</AsyncButton></div></Panel>
  <JobThread job={j} files={photos} orgId={orgId} onRefresh={loadData} onNotice={setNotice}/></>};

 /* ------------------------------- simple lists ------------------------------ */
 const clientsView=<><div className="view-heading"><div><p className="eyebrow">DISPATCH</p><h1>Clients</h1></div>{newRequest}</div><div className="client-grid">{clients.filter(c=>`${c.name} ${c.address||''}`.toLowerCase().includes(search.toLowerCase())).map(c=><article className="client-card" key={c.id}><div className="client-card-head"><span className="client-avatar">{(c.name||'?')[0]}</span><div><strong>{c.name}</strong><small>{(c.relationship||'').replaceAll('_',' ')}</small></div></div><small>{c.address||''}</small><small>{c.phone||''} {c.email||''}</small></article>)}</div>{!clients.length&&<Empty icon="clients" title="No clients yet" detail="Clients appear when you create requests."/>}</>;
 const teamView=<><div className="view-heading"><div><p className="eyebrow">DISPATCH</p><h1>Team</h1><p className="view-description">{techs.length} technicians</p></div></div><div className="scope-layout">{techs.map(t=><div className="team-member" key={t.id}><span className="client-avatar">{(t.name||'?')[0]}</span><div><strong>{t.name}</strong><small>{t.trade||'Technician'} · {t.phone||''}</small></div></div>)}{!techs.length&&<Empty icon="clients" title="No technicians" detail="Add technicians in Supabase to assign work."/>}</div></>;
 const invoicesView=<><div className="view-heading"><div><p className="eyebrow">DISPATCH</p><h1>Invoices</h1></div></div>{invoices.map(i=>{const j=jobs.find(x=>x.id===i.job_id);return <div className="invoice-card" key={i.id}><div><strong>{i.invoice_number}</strong><small>{j?.clients?.name||''} · {i.status}</small></div><strong>{money(i.total)}</strong></div>})}{!invoices.length&&<Empty icon="invoice" title="No invoices" detail="Invoices are created from approved quotes."/>}</>;

 useEffect(()=>{function keydown(e:KeyboardEvent){if(!e.altKey||e.ctrlKey||e.metaKey||e.repeat)return;const key=e.key.toLowerCase();if(key==='n'){e.preventDefault();setShowIntake(true)}else if(key==='e'&&mode==='office'){e.preventDefault();setEstimateJob(selectedJob);setShowEstimate(true)}else if(mode==='office'&&['1','2','3'].includes(key)){e.preventDefault();go(({1:'pipeline',2:'dispatch',3:'estimates'} as Record<string,View>)[key])}}if(session)window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown)},[session,mode,selectedJob]);
 useEffect(()=>{if(!session)return;const timer=setInterval(()=>{if(document.visibilityState==='visible')refreshLocations()},30000);return()=>clearInterval(timer)},[session?.user?.id]);
 async function refreshLocations(){const {data}=await supabase.from('technician_locations').select('*');if(data)setTechs(prev=>prev.map(t=>{const loc=data.find(l=>l.technician_id===t.id);return {...t,latitude:loc?.latitude,longitude:loc?.longitude,location_updated_at:loc?.updated_at}}))}
 async function shareLocation(){const tech=techs.find(t=>t.auth_user_id===session.user.id);if(!tech)return setNotice('Ask dispatch to link your staff account to your technician record.');if(!navigator.geolocation)return setNotice('Location is unavailable on this device.');navigator.geolocation.getCurrentPosition(async pos=>{const {error}=await supabase.from('technician_locations').upsert({organization_id:orgId,technician_id:tech.id,latitude:pos.coords.latitude,longitude:pos.coords.longitude,updated_at:new Date().toISOString()});if(error)setNotice(error.message);else{await refreshLocations();setNotice('Location shared with dispatch.')}},()=>setNotice('Location permission was declined or unavailable.'))}

 /* --------------------------------- chrome ---------------------------------- */
 /* Flattened navigation: 4 primary destinations. Invoices + Team live under More. */
 const navItems:View[]=mode==='office'?['pipeline','dispatch','estimates','clients']:['today','dispatch'];
 const navLabels:Record<View,string>={pipeline:'Jobs',dispatch:'Map',estimates:'Estimates',job:'Job',clients:'Clients',team:'Team',invoices:'Invoices',today:'Today',collect:'Collect'};
 const [showMore,setShowMore]=useState(false);

 if(!authReady)return <main className="boot-screen"><Brand/><p role="status"><span className="spinner"/>Opening your workspace…</p></main>;
 if(!session)return <main className="auth-shell"><section className="auth-story"><Brand/><div className="auth-story-main"><p className="eyebrow">THE SERVICE WORKSPACE</p><h1>Clear scope.<br/>Confident work.</h1><p>Call → intake → estimate → approval → dispatch → invoice. One pipeline.</p></div><footer>Built for the work ahead.</footer></section><section className="auth-form-side"><div className="auth-mobile-brand"><Brand/></div><form className="auth-card" onSubmit={e=>{e.preventDefault();authenticate()}}><span className="auth-lock"><Icon name="lock"/></span><p className="eyebrow">YOUR WORKSPACE</p><h2>Welcome back</h2><p className="auth-copy">Sign in to plan, price, and manage your work.</p>
  <div className="role-pick"><span className="eyebrow">I AM A</span><div className="form-grid"><button type="button" className={role==='tech'?'primary':'secondary'} aria-pressed={role==='tech'} onClick={()=>chooseRole('tech')}>Technician</button><button type="button" className={role==='dispatch'?'primary':'secondary'} aria-pressed={role==='dispatch'} onClick={()=>chooseRole('dispatch')}>Dispatch</button></div></div>
  <label>Email address<input autoComplete="username" type="email" required value={authEmail} placeholder="you@company.com" onChange={e=>setAuthEmail(e.target.value)}/></label><label>Password<input autoComplete="current-password" type={showPassword?'text':'password'} required value={authPassword} placeholder="Enter your password" onChange={e=>setAuthPassword(e.target.value)}/></label><button type="button" className="text-button" aria-pressed={showPassword} onClick={()=>setShowPassword(v=>!v)}>{showPassword?'Hide password':'Show password'}</button>{authMessage&&<p className="notice error" role="alert">{authMessage}</p>}<button type="submit" className="primary wide" disabled={authBusy}>{authBusy?'Signing in…':'Sign in'}</button><p className="auth-help">Need access? Ask your workspace administrator.</p></form><p className="auth-foot"><Icon name="lock"/>Private workspace · Staff access only</p></section></main>;
 if(session&&!role)return <main className="auth-shell"><section className="auth-form-side"><div className="auth-mobile-brand"><Brand/></div><div className="auth-card"><span className="auth-lock"><Icon name="lock"/></span><p className="eyebrow">CHOOSE YOUR VIEW</p><h2>How will you use Yavamo today?</h2><div className="form-grid"><button className="primary" onClick={()=>chooseRole('tech')}>I’m a technician</button><button className="secondary" onClick={()=>chooseRole('dispatch')}>I’m dispatch</button></div><p className="auth-help">Technicians collect field info. Dispatch runs the pipeline: clients, estimates, invoices, team.</p></div></section></main>;

 return <div className={`shell ${mode}-mode`}><a className="skip-link" href="#main-content">Skip to content</a>
  <div className="app-title"><span>▣</span> Yavamo <button className="text-button" onClick={()=>setShowHelp(true)}>Help</button></div>
  <header className="topbar"><div className="queue-signal"><span className="pulse-dot"/><div><strong>{mode==='office'?`${openJobs.length} open`:`${myJobs.length} today`}</strong><small>{mode==='office'?`${techs.length} technicians available`:'Technician'}</small></div></div><nav className="topnav" aria-label="Primary">{navItems.map(v=><button key={v} className={view===v||(v==='pipeline'&&view==='job')?'nav-active':''} aria-current={view===v||(v==='pipeline'&&view==='job')?'page':undefined} onClick={()=>go(v)}>{navLabels[v]}{['pipeline','dispatch','estimates'].includes(v)&&<kbd>{['pipeline','dispatch','estimates'].indexOf(v)+1}</kbd>}</button>)}</nav><span className="top-actions">{mode==='office'&&<span style={{position:'relative'}}><button className="icon-button" aria-label="More" aria-expanded={showMore} onClick={()=>setShowMore(v=>!v)}>···</button>{showMore&&<span style={{position:'absolute',right:0,top:'calc(100% + 8px)',background:'#fff',border:'1px solid var(--line)',borderRadius:12,boxShadow:'0 8px 30px #10131118',zIndex:50,display:'grid',minWidth:180,padding:6}} role="menu">{(['invoices','team'] as View[]).map(v=><button key={v} role="menuitem" className="secondary" style={{justifyContent:'flex-start',border:0}} onClick={()=>{setShowMore(false);go(v)}}>{navLabels[v]}</button>)}</span>}</span>}<button className="icon-button" aria-label="Keyboard shortcuts and help" onClick={()=>setShowHelp(true)}>?</button>{mode==='office'&&<button className="cta" onClick={()=>{setNotice('');setShowIntake(true)}}><Icon name="plus"/>New request</button>}<button className="icon-button" aria-label="Sign out" onClick={signOut}><Icon name="logout"/></button></span></header>
  <main id="main-content" className="main-shell">
   {view==='pipeline'&&pipelineHome}
   {view==='dispatch'&&dispatchHome}
   {view==='estimates'&&estimatesHome}
   {view==='job'&&jobDetail()}
   {view==='today'&&todayHome}
   {view==='collect'&&collectView()}
   {view==='clients'&&clientsView}
   {view==='team'&&teamView}
   {view==='invoices'&&invoicesView}
  </main><footer className="workspace-footer"><span>yavamo. <span>Clear scope. Connected work.</span></span></footer>
  <nav className="bottom-nav" aria-label="Primary">{navItems.map(v=><button key={v} className={view===v||(v==='pipeline'&&view==='job')?'nav-active':''} aria-current={view===v?'page':undefined} onClick={()=>go(v)}><Icon name={v==='pipeline'?'jobs':v==='dispatch'?'map':v==='estimates'?'quote':v==='clients'?'clients':v==='today'?'calendar':'jobs'}/>{navLabels[v]}</button>)}</nav>
  {showIntake&&<IntakeWizard orgId={orgId} onClose={()=>setShowIntake(false)} onSaved={async id=>{await loadData();setSelectedJob(id);setStage('intake');go('job')}}/>}
  {showEstimate&&mode==='office'&&<EstimateBuilder jobs={jobs} initialJobId={estimateJob} onClose={()=>setShowEstimate(false)} onSaved={async()=>{await loadData();go('estimates');setNotice('Estimate saved as draft. Office review is required before an approval link can be created.')}}/>}
  {showHelp&&<Modal title="Work, with fewer clicks." onClose={()=>setShowHelp(false)}><p>Write the call or diagnosis, review the draft, then save. Photos show visible evidence; measurement and price confirmation stay editable.</p><dl className="help-shortcuts"><div><dt>Requests</dt><dd>Alt + 1</dd></div><div><dt>Dispatch map</dt><dd>Alt + 2</dd></div><div><dt>Estimates</dt><dd>Alt + 3</dd></div><div><dt>New request</dt><dd>Alt + N</dd></div><div><dt>New estimate</dt><dd>Alt + E</dd></div></dl><p className="helper">Spanish translation changes the answer only. The workspace remains in English.</p></Modal>}
  {showTech&&<Modal title="Add technician" onClose={()=>setShowTech(false)}><form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const specialties=f.getAll('specialties').map(String);if(!specialties.length)return setNotice('Choose at least one specialty.');const {error}=await supabase.from('technicians').insert({organization_id:orgId,name:String(f.get('name')),email:String(f.get('email'))||null,phone:String(f.get('phone'))||null,specialties,auth_user_id:String(f.get('auth_user_id'))||null});if(error)return setNotice(error.message);setShowTech(false);await loadData()}}><label>Name<input name="name" required/></label><div className="form-grid"><label>Email<input name="email" type="email"/></label><label>Phone<input name="phone" type="tel"/></label></div><fieldset><legend>Specialties</legend>{SERVICES.map(s=><label className="checklist-row" key={s.key}><input type="checkbox" name="specialties" value={s.label}/>{s.label}</label>)}</fieldset><label>Existing staff account ID (optional)<input name="auth_user_id" placeholder="Supabase user UUID" pattern="[0-9a-fA-F-]{36}"/></label><p className="helper">Link an existing technician login so daily assignments appear in their view.</p>{notice&&<p className="notice" role="alert">{notice}</p>}<button className="primary" type="submit">Add technician</button></form></Modal>}
 </div>;
}
