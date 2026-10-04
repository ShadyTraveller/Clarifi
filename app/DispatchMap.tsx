'use client';
import {useEffect,useRef} from 'react';
import { hasCoordinates } from './lib/domain';

export default function DispatchMap({jobs,techs=[],onSelect}:{jobs:any[],techs?:any[],onSelect?:(id:string)=>void}){
 const el=useRef<HTMLDivElement>(null);
 useEffect(()=>{let map:any;let alive=true;(async()=>{
  if(!el.current)return;
  const L=(await import('leaflet')).default;
  if(!alive||!el.current)return;
  map=L.map(el.current).setView([43.72,-79.42],9);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
  const located=jobs.filter(hasCoordinates),locatedTechs=techs.filter(hasCoordinates);
  located.forEach(j=>L.circleMarker([Number(j.latitude),Number(j.longitude)],{radius:9,color:'#15150f',weight:2,fillColor:'#eabd24',fillOpacity:1}).addTo(map).bindPopup((()=>{const content=document.createElement('div');const title=document.createElement('strong');title.textContent=j.clients?.name||'Request';const detail=document.createElement('p');detail.textContent=j.request||'';content.append(title,detail);if(onSelect){const button=document.createElement('button');button.textContent='Open request';button.onclick=()=>onSelect(j.id);content.append(button)}return content})()));
  locatedTechs.forEach(t=>L.circleMarker([Number(t.latitude),Number(t.longitude)],{radius:9,color:'#15150f',weight:2,fillColor:'#8bbc80',fillOpacity:1}).addTo(map).bindPopup((()=>{const content=document.createElement('div');const title=document.createElement('strong');title.textContent=t.name;const detail=document.createElement('p');detail.textContent=(t.specialties||[]).join(', ');const stamp=document.createElement('small');stamp.textContent=t.location_updated_at?'Updated '+new Date(t.location_updated_at).toLocaleString():'Location time unavailable';content.append(title,detail,stamp);return content})()));
  const points=[...located,...locatedTechs];if(points.length){const b=L.latLngBounds(points.map(j=>[Number(j.latitude),Number(j.longitude)] as [number,number]));map.fitBounds(b.pad(.25),{maxZoom:14})}
 })();return()=>{alive=false;if(map)map.remove()}},[jobs,techs,onSelect]);
 return <div className="map-canvas" aria-label="Interactive request and technician map" ref={el}/>;
}
