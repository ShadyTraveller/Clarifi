'use client';
import {useEffect,useRef} from 'react';

export default function DispatchMap({jobs}:{jobs:any[]}){
 const el=useRef<HTMLDivElement>(null);
 useEffect(()=>{let map:any;let alive=true;(async()=>{
  if(!el.current)return;
  const L=(await import('leaflet')).default;
  if(!alive||!el.current)return;
  map=L.map(el.current).setView([43.72,-79.42],9);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
  const located=jobs.filter(j=>j.latitude&&j.longitude);
  located.forEach(j=>L.marker([Number(j.latitude),Number(j.longitude)]).addTo(map).bindPopup(`<strong>${j.clients?.name||'Job'}</strong><br/>${j.request||''}`));
  if(located.length){const b=L.latLngBounds(located.map(j=>[Number(j.latitude),Number(j.longitude)]));map.fitBounds(b.pad(.25))}
 })();return()=>{alive=false;if(map)map.remove()}},[jobs]);
 return <div className="dispatch-map" ref={el}/>;
}
