'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';

const icons:Record<string,ReactNode>={
 overview:<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
 clients:<><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/></>,
 request:<><path d="M5 4h14v16H5zM8 8h8M8 12h5M8 16h7"/></>,
 jobs:<><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12h18M10 12v3h4v-3"/></>,
 calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18M7 15h2M13 15h2"/></>,
 map:<><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/></>,
 quote:<><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"/></>,
 template:<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/></>,
 invoice:<><path d="M5 3h14v18l-3-2-4 2-4-2-3 2zM8 7h8M8 11h8M8 15h4"/></>,
 scope:<><path d="m4 16 12-12 4 4L8 20zM13 7l2 2M10 10l2 2M7 13l2 2"/></>,
 photo:<><rect x="3" y="5" width="18" height="15" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m3 17 5-4 4 4 4-6 5 6"/></>,
 check:<path d="m5 12 4 4L19 6"/>,plus:<path d="M12 5v14M5 12h14"/>,search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,pin:<><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0z"/><circle cx="12" cy="10" r="2"/></>,menu:<path d="M4 6h16M4 12h16M4 18h16"/>,close:<path d="m6 6 12 12M6 18 18 6"/>,logout:<><path d="M9 3H4v18h5M10 12h11m-4-4 4 4-4 4"/></>,chevron:<path d="m9 5 7 7-7 7"/>,lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,refresh:<><path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 14-3l1 2M4 17l1 2a8 8 0 0 0 14-3"/></>,minus:<path d="M5 12h14"/>
};
export function Icon({name,className=''}:{name:string,className?:string}){return <svg className={`icon ${className}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]||icons.jobs}</svg>}
export function Brand(){return <span className="brand"><span className="brand-mark">c<span/></span>clarifi<span className="brand-period">.</span></span>}
export function Badge({status}:{status:string}){return <span className={`badge ${status.replaceAll(' ','_')}`}>{status.replaceAll('_',' ')}</span>}
export function Empty({icon='jobs',title,detail,action}:{icon?:string,title:string,detail?:string,action?:ReactNode}){return <div className="empty"><span className="empty-icon"><Icon name={icon}/></span><h3>{title}</h3>{detail&&<p>{detail}</p>}{action}</div>}
export function Panel({title,subtitle,action,children,className=''}:{title:string,subtitle?:string,action?:ReactNode,children:ReactNode,className?:string}){return <section className={`panel ${className}`}><header className="panel-head"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action}</header>{children}</section>}
export function AsyncButton({children,onClick,className='primary',disabled=false}:{children:ReactNode,onClick:()=>unknown,className?:string,disabled?:boolean}){const [busy,setBusy]=useState(false);return <button type="button" className={className} disabled={busy||disabled} aria-busy={busy} onClick={async()=>{setBusy(true);try{await onClick()}finally{setBusy(false)}}}>{busy?<><span className="spinner"/>Working…</>:children}</button>}
export function Modal({title,children,onClose}:{title:string,children:ReactNode,onClose:()=>void}){const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{const el=ref.current;el?.showModal();return()=>el?.close()},[]);return <dialog ref={ref} className="modal" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget){const r=ref.current!.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose()}}} aria-labelledby="dialog-title"><header className="modal-top"><div><p className="eyebrow">NEW REQUEST</p><h2 id="dialog-title">{title}</h2></div><button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close"/></button></header>{children}</dialog>}
export const money=(value:any)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'}).format(Number(value)||0);
export const dateKey=(value:Date)=>`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
export const localDateTime=(value:string)=>{if(!value)return '';const d=new Date(value);return `${dateKey(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`};
