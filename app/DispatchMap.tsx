'use client';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { hasCoordinates, serviceLabel } from './lib/domain';

const INK = '#101311';
const YELLOW = '#FFD60A';
const TORONTO: [number, number] = [43.72, -79.42];

export type PlacedPin = { latitude: number; longitude: number };

type Props = {
  jobs: any[];
  techs?: any[];
  onSelect?: (id: string) => void;
  editable?: boolean;
  onPlacePin?: (coords: PlacedPin) => void;
  selectedJobId?: string;
};

const visuallyHidden: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, margin: -1, padding: 0,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
};

const controlStyle: React.CSSProperties = {
  position: 'absolute', zIndex: 500, top: 12, right: 12,
  background: INK, color: '#fff', border: `2px solid ${YELLOW}`,
  borderRadius: 4, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const hintStyle: React.CSSProperties = {
  position: 'absolute', zIndex: 500, top: 12, left: '50%', transform: 'translateX(-50%)',
  background: INK, color: '#fff', borderRadius: 4, padding: '8px 14px',
  fontSize: 12, pointerEvents: 'none', whiteSpace: 'nowrap', maxWidth: 'calc(100% - 140px)',
  overflow: 'hidden', textOverflow: 'ellipsis',
};

function buildJobPopup(L: typeof Leaflet, j: any, onSelect?: (id: string) => void): HTMLElement {
  const content = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = j.clients?.name || 'Request';
  const request = document.createElement('p');
  request.textContent = j.request || '';
  const service = document.createElement('small');
  service.textContent = serviceLabel(j.service || '');
  content.append(title, request, service);
  if (onSelect) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Open job';
    button.style.cssText = `margin-top:8px;background:${YELLOW};color:${INK};border:none;border-radius:3px;padding:7px 12px;font-weight:600;cursor:pointer;`;
    button.onclick = () => onSelect(j.id);
    content.append(button);
  }
  return content;
}

function buildTechPopup(t: any): HTMLElement {
  const content = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = t.name || 'Technician';
  const detail = document.createElement('p');
  detail.textContent = (t.specialties || []).join(', ');
  const stamp = document.createElement('small');
  stamp.textContent = t.location_updated_at
    ? 'Updated ' + new Date(t.location_updated_at).toLocaleString()
    : 'Location time unavailable';
  content.append(title, detail, stamp);
  return content;
}

export default function DispatchMap({
  jobs, techs = [], onSelect, editable = false, onPlacePin, selectedJobId,
}: Props) {
  const el = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const pinsRef = useRef<Leaflet.LayerGroup | null>(null);
  const draftRef = useRef<Leaflet.Marker | null>(null);
  const [placing, setPlacing] = useState(false);
  const [ready, setReady] = useState(false);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onPlacePinRef = useRef(onPlacePin);
  onPlacePinRef.current = onPlacePin;
  const editableRef = useRef(editable);
  editableRef.current = editable;
  const placingRef = useRef(placing);
  placingRef.current = placing;
  const selectedRef = useRef(selectedJobId);
  selectedRef.current = selectedJobId;

  // Draw / redraw pins. Reads jobs/techs/selectedJobId from refs so the
  // init effect can stay mounted-once and the data effect only redraws.
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const techsRef = useRef(techs);
  techsRef.current = techs;
  const renderPins = () => {
    const L = leafletRef.current, pins = pinsRef.current, map = mapRef.current;
    if (!L || !pins || !map) return;
    const currentJobs = jobsRef.current.filter(hasCoordinates);
    const currentTechs = (techsRef.current || []).filter(hasCoordinates);
    const sel = selectedRef.current;
    pins.clearLayers();
    const at = (p: any): [number, number] => [Number(p.latitude), Number(p.longitude)];
    currentJobs.forEach((j: any) => {
      const isSelected = sel != null && j.id === sel;
      if (isSelected) {
        // white halo ring behind the selected pin
        L.circleMarker(at(j), {
          radius: 17, color: '#FFFFFF', weight: 3,
          fillColor: '#FFFFFF', fillOpacity: 0.3, interactive: false,
        }).addTo(pins);
      }
      L.circleMarker(at(j), {
        radius: isSelected ? 13 : 9,
        color: INK, weight: 2,
        fillColor: YELLOW, fillOpacity: 1,
      }).addTo(pins).bindPopup(() => buildJobPopup(L, j, onSelectRef.current));
    });
    currentTechs.forEach((t: any) => {
      L.circleMarker(at(t), {
        radius: 9, color: '#FFFFFF', weight: 2,
        fillColor: INK, fillOpacity: 1,
      }).addTo(pins).bindPopup(() => buildTechPopup(t));
    });
    // The persisted pin replaced the draft: clear it.
    if (draftRef.current && sel && currentJobs.some((j: any) => j.id === sel)) {
      draftRef.current.remove();
      draftRef.current = null;
    }
    const points = [...currentJobs, ...currentTechs];
    if (points.length && !placingRef.current && !draftRef.current) {
      map.fitBounds(L.latLngBounds(points.map(at)).pad(0.25), { maxZoom: 14 });
    }
  };

  const renderPinsRef = useRef(renderPins);
  renderPinsRef.current = renderPins;

  // --- Map init (mounted once; strict-mode safe via `alive` + map.remove()) ---
  useEffect(() => {
    let alive = true;
    let map: Leaflet.Map | null = null;
    (async () => {
      if (!el.current) return;
      const mod = await import('leaflet');
      const L = (mod.default ?? mod) as unknown as typeof Leaflet;
      if (!alive || !el.current) return;
      leafletRef.current = L;
      map = L.map(el.current).setView(TORONTO, 9);
      mapRef.current = map;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);
      pinsRef.current = L.layerGroup().addTo(map);
      map.on('click', (e: Leaflet.LeafletMouseEvent) => {
        if (!placingRef.current || !editableRef.current) return;
        dropDraft(e.latlng.lat, e.latlng.lng);
      });
      setReady(true);
    })();
    return () => {
      alive = false;
      if (draftRef.current) { draftRef.current.remove(); draftRef.current = null; }
      if (map) { map.remove(); map = null; }
      mapRef.current = null;
      pinsRef.current = null;
      leafletRef.current = null;
      setReady(false);
      setPlacing(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drop (or move) the temporary draggable pin and notify the parent.
  const dropDraft = (lat: number, lng: number) => {
    const L = leafletRef.current, map = mapRef.current;
    if (!L || !map) return;
    if (draftRef.current) draftRef.current.remove();
    const marker = L.marker([lat, lng], {
      draggable: true,
      icon: L.divIcon({
        className: 'yavamo-draft-pin',
        html: `<span style="display:block;width:22px;height:22px;border-radius:50%;background:#fff;border:2px dashed ${INK};box-shadow:0 0 0 4px ${YELLOW}55;"></span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    }).addTo(map);
    marker.bindTooltip('Drag to adjust', { direction: 'top', offset: [0, -12] });
    marker.on('dragend', () => {
      const ll = marker.getLatLng();
      onPlacePinRef.current?.({ latitude: ll.lat, longitude: ll.lng });
    });
    draftRef.current = marker;
    setPlacing(false);
    onPlacePinRef.current?.({ latitude: lat, longitude: lng });
  };

  // --- Redraw pins when data or selection changes (map itself stays mounted) ---
  useEffect(() => {
    if (!ready) return;
    renderPinsRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, jobs, techs, selectedJobId]);

  // --- Placement mode: crosshair cursor + Escape to cancel ---
  useEffect(() => {
    const container = mapRef.current?.getContainer();
    if (container) container.style.cursor = placing ? 'crosshair' : '';
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlacing(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [placing]);

  // Leaving editable mode cancels placement.
  useEffect(() => {
    if (!editable) setPlacing(false);
  }, [editable]);

  const locatedJobs = jobs.filter(hasCoordinates);
  const locatedCount = locatedJobs.length + (techs || []).filter(hasCoordinates).length;

  return (
    <div
      className="map-canvas"
      role="application"
      aria-label="Dispatch map: job and technician locations"
      style={{ position: 'relative' }}
    >
      <div ref={el} className="map-canvas" aria-hidden="true" style={{ position: 'absolute', inset: 0 }} />
      {editable && (
        <button
          type="button"
          onClick={() => setPlacing(v => !v)}
          aria-pressed={placing}
          style={controlStyle}
        >
          {placing ? 'Cancel' : 'Place pin'}
        </button>
      )}
      {placing && (
        <div role="status" style={hintStyle}>Click the map to place the pin · drag to adjust</div>
      )}
      {!placing && locatedCount === 0 && (
        <div role="status" style={{ ...hintStyle, top: 'auto', bottom: 12 }}>
          {editable ? 'No located jobs yet — use Place pin.' : 'No located jobs yet.'}
        </div>
      )}
      <ul style={visuallyHidden} aria-label="Pinned jobs">
        {locatedJobs.map((j: any) => (
          <li key={String(j.id)}>
            {j.clients?.name || 'Request'}{j.request ? ` — ${j.request}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
