'use client';
import { use, useEffect, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import Markdown from '../../Markdown';
import { getPaymentProvider } from '../../lib/payments/provider';

type QuoteLine = { name?: string; description?: string; total?: number; allowance?: boolean };
type Quote = {
  valid: boolean; quote_number?: string; organization_name?: string; request?: string; address?: string;
  scope?: string; client_message?: string; lines?: QuoteLine[]; subtotal?: number; tax?: number; total?: number;
  deposit_percent?: number; terms?: string; status?: string; reply_to?: string; customer_name?: string;
};

const money = (n: unknown) => '$' + Number(n || 0).toFixed(2);

/* Drawn signature pad: pointer events work with mouse + touch. */
function SignaturePad({ onChange, padRef }: { onChange: (signed: boolean) => void; padRef: React.RefObject<HTMLCanvasElement | null> }) {
  const drawing = useRef(false);
  const touched = useRef(false);

  useEffect(() => {
    const canvas = padRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#101311';
  }, [padRef]);

  function down(e: RPointerEvent<HTMLCanvasElement>) {
    const canvas = padRef.current;
    if (!canvas) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const r = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
  }
  function move(e: RPointerEvent<HTMLCanvasElement>) {
    const canvas = padRef.current;
    if (!drawing.current || !canvas) return;
    const r = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(e.clientX - r.left, e.clientY - r.top);
    ctx.stroke();
    if (!touched.current) {
      touched.current = true;
      onChange(true);
    }
  }
  function up() { drawing.current = false; }
  function clear() {
    const canvas = padRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    touched.current = false;
    onChange(false);
  }

  return (
    <div>
      <span id="sig-label" className="block text-[14px] font-medium mb-2 text-[#101311]">Sign here</span>
      <canvas
        ref={padRef}
        aria-labelledby="sig-label"
        role="img"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="w-full h-44 rounded-md border bg-white cursor-crosshair"
        style={{ touchAction: 'none', borderColor: '#d5d8d0' }}
      />
      <div className="flex justify-between items-start gap-3 mt-2">
        <p className="text-[13px] leading-relaxed text-[#6b7280]">
          If you can't draw, type your full name above — it serves as your signature.
        </p>
        <button type="button" className="secondary compact shrink-0" onClick={clear}>Clear</button>
      </div>
    </div>
  );
}

export default function CustomerQuote({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [q, setQ] = useState<Quote | null>(null);
  const [name, setName] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [signed, setSigned] = useState(false);
  const [sigWarned, setSigWarned] = useState(false);
  const [change, setChange] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [depositDue, setDepositDue] = useState<number | null>(null);
  const padRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/quote/' + encodeURIComponent(token), { cache: 'no-store' });
      const data = await res.json();
      setQ(!res.ok ? { valid: false } : data);
      if (data?.customer_name) setName(data.customer_name);
    })();
  }, [token]);

  const nameOk = name.trim().length >= 2;
  const canApprove = nameOk && accepted && !busy;

  async function approve() {
    setMessage('');
    // Gentle nudge, not a hard block: keyboard-only users may skip drawing.
    if (!signed && !sigWarned) {
      setSigWarned(true);
      return;
    }
    setBusy(true);
    try {
      const signature = signed && padRef.current ? padRef.current.toDataURL('image/png') : null;
      const res = await fetch('/api/quote/' + encodeURIComponent(token) + '/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ typed_name: name.trim(), accepted: true, signature }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMessage('Unable to approve this estimate. Check the required fields or link expiry.');
        return;
      }
      const dep = Number(data.deposit_amount || 0);
      setDepositDue(dep > 0 ? dep : null);
      setMessage('Estimate approved. Thank you.');
      setQ((prev) => (prev ? { ...prev, status: 'approved' } : prev));
    } finally {
      setBusy(false);
    }
  }

  async function requestChange() {
    if (!change.trim()) return setMessage('Please describe the requested change.');
    const res = await fetch('/api/quote/' + encodeURIComponent(token) + '/changes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ request_text: change }),
    });
    const data = await res.json().catch(() => ({}));
    const ok = res.ok && data?.ok;
    setMessage(ok ? 'Your change request has been sent.' : 'Unable to submit this request.');
    if (ok) setQ((prev) => (prev ? { ...prev, status: 'changes_requested' } : prev));
  }

  if (!q)
    return (
      <main className="min-h-screen bg-[#FAFAF7] px-4 py-8">
        <p className="text-center text-[#101311]">Loading estimate…</p>
      </main>
    );
  if (!q.valid)
    return (
      <main className="min-h-screen bg-[#FAFAF7] px-4 py-8">
        <section className="max-w-[720px] mx-auto bg-white border border-[#e5e2d8] rounded-2xl p-8 sm:p-12">
          <h1 className="text-2xl text-[#101311]">This estimate link is unavailable.</h1>
          <p className="mt-3 text-[#4b5563]">It may have expired or been replaced. Contact the company for a new link.</p>
        </section>
      </main>
    );

  const depositPercent = Number(q.deposit_percent || 0);
  const depositAmount = depositDue ?? (depositPercent > 0 ? (Number(q.total || 0) * depositPercent) / 100 : 0);
  const provider = getPaymentProvider();

  return (
    <main className="min-h-screen bg-[#FAFAF7] text-[#101311] px-4 py-6 sm:py-8">
      <section className="max-w-[720px] mx-auto bg-white border border-[#e5e2d8] rounded-2xl p-6 sm:p-12">
        <header className="pb-6 border-b border-[#e5e2d8]">
          <span className="block text-[11px] font-bold tracking-[0.12em] uppercase text-[#6b7280]">{q.organization_name}</span>
          <h1 className="mt-2 text-[#101311]">Estimate {q.quote_number}</h1>
          {q.request && <p className="mt-2 text-[#374151]">{q.request}</p>}
          {q.address && <p className="mt-1 text-[13px] text-[#6b7280]">{q.address}</p>}
        </header>

        {q.scope && (
          <div className="mt-6">
            <Markdown>{q.scope}</Markdown>
          </div>
        )}
        {q.client_message && (
          <div className="mt-6 rounded-lg bg-[#FAFAF7] border border-[#e5e2d8] p-4 text-[14px] text-[#374151]">{q.client_message}</div>
        )}

        <div className="mt-6">
          {q.lines?.map((l, i) => (
            <div key={i} className="flex justify-between gap-6 py-3 border-b border-[#e5e2d8]">
              <div className="grid gap-1">
                <strong className="text-[14px]">{l.name}</strong>
                {l.description && <span className="text-[13px] text-[#6b7280]">{l.description}</span>}
                {l.allowance && <span className="text-[13px] text-[#6b7280]">Allowance</span>}
              </div>
              <span className="font-semibold text-[15px] whitespace-nowrap">{money(l.total)}</span>
            </div>
          ))}
        </div>

        <div className="mt-2 ml-auto max-w-[360px]">
          <div className="flex justify-between gap-6 py-2 border-b border-[#e5e2d8] text-[14px] text-[#6b7280]">
            <span>Subtotal</span><b className="text-[#101311]">{money(q.subtotal)}</b>
          </div>
          <div className="flex justify-between gap-6 py-2 border-b border-[#e5e2d8] text-[14px] text-[#6b7280]">
            <span>Tax</span><b className="text-[#101311]">{money(q.tax)}</b>
          </div>
          <div className="flex justify-between gap-6 py-3 text-[20px] font-bold">
            <span>Total</span><span>{money(q.total)}</span>
          </div>
          {depositPercent > 0 && (
            <div className="flex justify-between gap-6 py-2 text-[14px] border-t border-[#e5e2d8]">
              <span>Deposit due on approval: {depositPercent}%</span>
              <b>{money(depositAmount)}</b>
            </div>
          )}
        </div>

        {q.terms && (
          <details className="mt-6 rounded-lg border border-[#e5e2d8] p-4">
            <summary className="cursor-pointer font-semibold text-[14px]">Terms</summary>
            <p className="mt-3 text-[14px] text-[#374151] whitespace-pre-wrap">{q.terms}</p>
          </details>
        )}

        {q.status === 'approved' ? (
          <>
            <div className="mt-6 rounded-lg border border-[#bfe3c0] bg-[#f2f9f1] p-4">
              <h2 className="text-[16px] text-[#101311]">Estimate approved</h2>
              <p className="mt-1 text-[14px] text-[#374151]">
                {depositAmount > 0
                  ? `A deposit of ${money(depositAmount)} is due. Dispatch will arrange the deposit separately.`
                  : 'Thank you. We will be in touch to schedule the work.'}
              </p>
            </div>
            {depositAmount > 0 && (
              <section aria-labelledby="deposit-heading" className="mt-4 rounded-xl border border-[#f3e08a] bg-[#FFFBEB] p-5">
                <h2 id="deposit-heading" className="text-[16px] text-[#101311]">Deposit due</h2>
                <p className="mt-2 text-[26px] font-bold text-[#101311]">{money(depositAmount)}</p>
                <button
                  type="button"
                  className="primary wide mt-4"
                  disabled
                  aria-disabled="true"
                  title="Online payment coming soon — we'll send a payment link."
                >
                  Pay deposit
                </button>
                <p className="helper mt-3">Online payment coming soon — we'll send a payment link.</p>
                <p className="helper mt-1">Prefer to pay now? Contact the office.</p>
                <p className="helper mt-1">Payments via {provider.name} (not connected yet).</p>
              </section>
            )}
          </>
        ) : q.status === 'changes_requested' ? (
          <div className="mt-6 rounded-lg bg-[#FAFAF7] border border-[#e5e2d8] p-4 text-[14px] text-[#374151]">
            Changes requested. The office will send an updated estimate.
          </div>
        ) : (
          <>
            <div className="mt-7 pt-6 border-t border-[#e5e2d8] grid gap-4">
              <h2 className="text-[16px] text-[#101311]">Approve this estimate</h2>
              <label className="block">
                <span className="block text-[14px] font-medium mb-2">Full name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  autoComplete="name"
                />
              </label>
              <SignaturePad padRef={padRef} onChange={setSigned} />
              <label className="flex items-start gap-2 text-[14px]">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                />
                <span>I approve this estimate and accept the terms.</span>
              </label>
              {sigWarned && !signed && (
                <p className="rounded-lg border border-[#f3e08a] bg-[#FFFBEB] p-3 text-[13px] text-[#6b4e00]">
                  You didn't draw a signature — that's OK. Your typed name above will serve as your signature.
                  Tap Approve again to continue, or draw your signature first if you prefer.
                </p>
              )}
              <button
                type="button"
                className="primary wide"
                disabled={!canApprove}
                onClick={approve}
              >
                {busy ? 'Approving…' : 'Approve estimate'}
              </button>
            </div>
            <details className="mt-4 rounded-lg border border-[#e5e2d8] p-4">
              <summary className="cursor-pointer font-semibold text-[14px]">Request changes</summary>
              <textarea
                className="mt-3"
                value={change}
                onChange={(e) => setChange(e.target.value)}
                placeholder="Tell us what you would like changed."
              />
              <button type="button" className="secondary mt-3" onClick={requestChange}>
                Send request
              </button>
            </details>
          </>
        )}

        {message && <p className="notice mt-6" role="status">{message}</p>}

        <footer className="mt-8 pt-5 border-t border-[#e5e2d8] text-[12px] text-[#6b7280]">
          Questions? {q.reply_to}
        </footer>
      </section>
    </main>
  );
}
