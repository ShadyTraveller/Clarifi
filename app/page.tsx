'use client';

import { useEffect, useState } from 'react';
import { supabase } from './lib_supabase';

const statusClass: Record<string,string> = { Lead:'lead', Active:'active', Estimate:'estimate', Completed:'completed' };

export default function Home() {
  const [directory, setDirectory] = useState<'home'|'clients'|'techs'|'office'>('home');
  const [showIntake, setShowIntake] = useState(false);
  const [clientType, setClientType] = useState('Tenant');
  const [session, setSession] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authMode, setAuthMode] = useState<'signin'|'signup'>('signin');

  useEffect(() => {
    supabase.auth.getSession().then(({data}) => { setSession(data.session); if (data.session) loadData(); else setLoading(false); });
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); if (next) loadData(); });
    return () => subscription.unsubscribe();
  }, []);
  async function loadData(){ setLoading(true); const [{data:c},{data:j}] = await Promise.all([supabase.from('clients').select('*').order('created_at',{ascending:false}),supabase.from('jobs').select('*, clients(*)').order('created_at',{ascending:false})]); setClients(c||[]); setJobs(j||[]); setLoading(false); }
  async function authenticate(){ setAuthMessage(''); const r=authMode==='signin'?await supabase.auth.signInWithPassword({email:authEmail,password:authPassword}):await supabase.auth.signUp({email:authEmail,password:authPassword}); if(r.error)setAuthMessage(r.error.message); else if(authMode==='signup')setAuthMessage('Check your email to confirm your account, then sign in.'); }
  async function createLead(){
    const {data:{user}}=await supabase.auth.getUser(); if(!user)return;
    let {data:member}=await supabase.from('organization_members').select('organization_id').eq('user_id',user.id).limit(1).maybeSingle();
    if(!member){await supabase.rpc('create_organization',{org_name:'Clarifi Workspace'}); member=(await supabase.from('organization_members').select('organization_id').eq('user_id',user.id).limit(1).single()).data;}
    if(!member)return alert('Workspace setup failed.');
    const q=(sel:string)=>(document.querySelector(sel) as HTMLInputElement)?.value||'';
    const relationship=clientType.toLowerCase().replaceAll(' ','_');
    const {data:client,error}=await supabase.from('clients').insert({organization_id:member.organization_id,name:q('input[placeholder="Full name or company"]'),email:q('input[type="email"]')||null,phone:q('input[placeholder="(416) 555-0123"]')||null,address:q('input[placeholder="Street, city, postal code"]')||null,relationship}).select().single();
    if(error)return alert(error.message);
    const request=q('input[placeholder="What does the client need?"]')||'General service request'; const details=(document.querySelector('textarea') as HTMLTextAreaElement)?.value||null;
    const {error:je}=await supabase.from('jobs').insert({organization_id:member.organization_id,client_id:client.id,request,details,status:'lead'}); if(je)return alert(je.message);
    setShowIntake(false); loadData();
  }

  if (!session) return <main className="auth-shell"><div className="auth-card"><div className="brand auth-brand"><span className="brand-mark">C</span><span>clarifi</span></div><p className="eyebrow">PRIVATE WORKSPACE</p><h1>{authMode==='signin'?'Welcome back.':'Create your workspace.'}</h1><p className="auth-copy">Secure service operations for clients, technicians and office teams.</p><label>Email<input type="email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="you@company.com"/></label><label>Password<input type="password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} placeholder="••••••••"/></label>{authMessage&&<p className="auth-message">{authMessage}</p>}<button className="primary wide" onClick={authenticate}>{authMode==='signin'?'Sign in':'Create account'}</button><button className="text-button" onClick={()=>setAuthMode(authMode==='signin'?'signup':'signin')}>{authMode==='signin'?'Create a new workspace':'Already have an account? Sign in'}</button></div></main>;

  return (
    <main className="shell">
      <header className="topbar">
        <button className="brand" onClick={() => setDirectory('home')} aria-label="Clarifi home">
          <span className="brand-mark">C</span><span>clarifi</span>
        </button>
        <div className="top-actions">
          <span className="secure"><i /> Private workspace</span>
          <button className="avatar">L</button>
        </div>
      </header>

      {directory === 'home' && (
        <>
          <section className="hero">
            <div className="hero-copy">
              <p className="eyebrow">SERVICE OPERATIONS</p>
              <h1>Clear work.<br/><em>Clear quotes.</em></h1>
              <p className="lede">One workspace for clients, technicians and office teams — from the first request to the approved estimate and completed job.</p>
              <button className="primary" onClick={() => setShowIntake(true)}>+ New client / request</button>
            </div>
            <div className="hero-card">
              <div className="mini-head"><span>Today</span><span>Monday, Sep 28</span></div>
              <div className="metric-row"><div><strong>{clients.length}</strong><span>Clients</span></div><div><strong>{jobs.filter((j:any)=>j.status==='estimate').length}</strong><span>Estimates</span></div></div>
              <div className="progress"><span style={{width:'68%'}} /></div>
              <p className="small-note">{loading ? 'Loading live workspace…' : `${jobs.length} projects connected to Supabase.`}</p>
            </div>
          </section>

          <section className="directory">
            <div className="section-label"><span>WORKSPACE</span><span>Choose your view</span></div>
            <div className="directory-grid">
              <button onClick={() => setDirectory('clients')} className="directory-card">
                <span className="card-number">01</span><div><h2>Clients</h2><p>Requests, projects, files and estimate history.</p></div><span className="arrow">↗</span>
              </button>
              <button onClick={() => setDirectory('techs')} className="directory-card dark">
                <span className="card-number">02</span><div><h2>Techs</h2><p>Jobs, measurements, scope templates and field notes.</p></div><span className="arrow">↗</span>
              </button>
              <button onClick={() => setDirectory('office')} className="directory-card">
                <span className="card-number">03</span><div><h2>Office</h2><p>Dispatch, schedules, estimates, invoices and client communication.</p></div><span className="arrow">↗</span>
              </button>
            </div>
          </section>

          <section className="workspace-preview">
            <div className="section-label"><span>ACTIVE WORK</span><span>Operational overview</span></div>
            <div className="client-table">
              <div className="table-head"><span>Client / request</span><span>Type</span><span>Status</span><span>Location</span></div>
              {jobs.map((j:any) => <div className="table-row" key={j.id}><div><strong>{j.clients?.name||'Client'}</strong><small>{j.request}</small></div><span>{(j.clients?.relationship||'—').replaceAll('_',' ')}</span><span className={`pill ${statusClass[j.status]||'lead'}`}>{j.status}</span><span>{j.clients?.address||'—'}</span></div>)}
            </div>
          </section>
        </>
      )}

      {directory !== 'home' && (
        <section className="view">
          <button className="back" onClick={() => setDirectory('home')}>← Workspace</button>
          <div className="view-heading"><div><p className="eyebrow">{directory.toUpperCase()}</p><h1>{directory === 'clients' ? 'Clients' : directory === 'techs' ? 'Field workspace' : 'Office workspace'}</h1></div><button className="primary" onClick={() => setShowIntake(true)}>+ New client / request</button></div>
          {directory === 'clients' && <div className="client-table"><div className="table-head"><span>Client / request</span><span>Type</span><span>Status</span><span>Location</span></div>{jobs.map((j:any) => <div className="table-row" key={j.id}><div><strong>{j.clients?.name||'Client'}</strong><small>{j.request}</small></div><span>{(j.clients?.relationship||'—').replaceAll('_',' ')}</span><span className={`pill ${statusClass[j.status]||'lead'}`}>{j.status}</span><span>{j.clients?.address||'—'}</span></div>)}</div>}
          {directory === 'techs' && <div className="module-grid"><Module title="Jobs" text="Assigned service calls, site details and field notes." /><Module title="Estimates" text="Template selector and scope / measurement forms." /><Module title="Schedule" text="Today's route and upcoming appointments." /><Module title="Clients" text="Customer history, files and open requests." /></div>}
          {directory === 'office' && <div className="module-grid"><Module title="Clients" text="Active accounts, notes, files and communication." /><Module title="Estimates" text="Standardized scope-first estimates awaiting review." /><Module title="Schedule & Dispatch" text="Assign jobs, coordinate technicians and track progress." /><Module title="Invoices" text="Turn completed jobs into customer-ready invoices." /></div>}
        </section>
      )}

      {showIntake && <div className="modal-backdrop" onMouseDown={(e) => {if(e.target===e.currentTarget)setShowIntake(false)}}><div className="modal">
        <div className="modal-top"><div><p className="eyebrow">NEW REQUEST</p><h2>Start with the client.</h2></div><button className="close" onClick={() => setShowIntake(false)}>×</button></div>
        <p className="modal-intro">Give Clarifi enough context to build a standardized estimate — or create a lead when more information is needed.</p>
        <div className="form-grid">
          <label>Client name<input placeholder="Full name or company" /></label><label>Email<input type="email" placeholder="name@example.com" /></label>
          <label>Phone number<input placeholder="(416) 555-0123" /></label><label>Property address<input placeholder="Street, city, postal code" /></label>
          <label>Client relationship<select value={clientType} onChange={e=>setClientType(e.target.value)}><option>Tenant</option><option>Landlord</option><option>Property Management</option><option>Commercial</option><option>Other</option></select></label>
          <label>Request / service<input placeholder="What does the client need?" /></label>
        </div>
        <label className="full">Details<textarea placeholder="Describe the issue, desired work, measurements or anything already known." /></label>
        <div className="upload"><span>＋</span><div><strong>Add photos or files</strong><small>Site photos, measurements, documents or reference material</small></div><button>Choose files</button></div>
        <div className="modal-actions"><button className="secondary" onClick={()=>setShowIntake(false)}>Cancel</button><button className="primary" onClick={createLead}>Create lead & review</button></div>
      </div></div>}
    </main>
  );
}

function Module({title,text}:{title:string,text:string}) { return <div className="module"><span className="module-icon">+</span><h3>{title}</h3><p>{text}</p><span className="module-arrow">↗</span></div> }
