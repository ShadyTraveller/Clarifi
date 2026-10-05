import { staffClient, readBody, errorResponse, HttpError } from '../../../../lib/server';
import { sendEmail } from '../../../../lib/email';

export const dynamic = 'force-dynamic';

// Light in-memory rate limit: 10 sends per user per minute.
const recent = new Map<string, number[]>();

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { user } = await staffClient(request);
    const calls = (recent.get(user.id) || []).filter((n) => n > Date.now() - 60000);
    if (calls.length >= 10) throw new HttpError(429, 'Too many emails. Try again in a minute.');
    recent.set(user.id, [...calls, Date.now()]);

    const { token } = await params;
    if (!/^[0-9a-f]{64}$/.test(token)) throw new HttpError(400, 'That estimate link is invalid.');

    const body = await readBody(request);
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');

    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const link = `${origin}/quote/${token}`;

    const result = await sendEmail({
      to: email,
      subject: 'Your Yavamo estimate is ready',
      html:
        `<p>Your estimate is ready to review.</p>` +
        `<p><a href="${link}">View and approve your estimate</a></p>` +
        `<p>This link expires per the terms on the estimate.</p>`,
      text:
        `Your estimate is ready to review.\n\n` +
        `View and approve your estimate: ${link}\n\n` +
        `This link expires per the terms on the estimate.`,
    });

    // Email provider not configured: not a failure for the office UI —
    // it falls back to copying the approval link manually.
    if (!result.ok && result.error === 'EMAIL_NOT_CONFIGURED') {
      return Response.json({
        sent: false,
        reason: 'EMAIL_NOT_CONFIGURED',
        message: 'Email provider not set up — copy the link manually.',
        link,
      });
    }
    if (!result.ok) throw new HttpError(502, 'The email could not be sent. Try again shortly.');
    return Response.json({ ok: true, sent: true, link });
  } catch (error) {
    return errorResponse(error);
  }
}
