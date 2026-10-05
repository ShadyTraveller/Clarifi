import 'server-only';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Send an email via the configured provider.
 *
 * - Resend when RESEND_API_KEY is set (from QUOTE_SENDER_EMAIL, fallback
 *   noreply@yavamo.ca; reply-to from QUOTE_REPLY_TO_EMAIL).
 * - Otherwise returns { ok:false, error:'EMAIL_NOT_CONFIGURED' }.
 * Never throws and never fakes success.
 */
export async function sendEmail(msg: EmailMessage): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!msg || !EMAIL_RE.test(msg.to || '') || typeof msg.subject !== 'string' || typeof msg.html !== 'string') {
    return { ok: false, error: 'INVALID_EMAIL' };
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'EMAIL_NOT_CONFIGURED' };
  const from = process.env.QUOTE_SENDER_EMAIL || 'noreply@yavamo.ca';
  const replyTo = process.env.QUOTE_REPLY_TO_EMAIL || undefined;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        ...(msg.text ? { text: msg.text } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const err = (data && typeof data.message === 'string' && data.message) || 'EMAIL_SEND_FAILED';
      return { ok: false, error: err };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'EMAIL_SEND_FAILED' };
  }
}
