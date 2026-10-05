/**
 * Payment provider interface for Yavamo deposit links.
 *
 * This module is intentionally NOT marked 'server-only': the public quote page
 * reads provider status (name / connected) to display honest "coming soon"
 * copy, and the stub holds no secrets. Keep it that way — any live
 * implementation (Stripe keys, API clients) must live in a server-only module
 * that implements this interface, never in this file.
 *
 * To connect Stripe later:
 *   1. Implement the PaymentProvider interface in a server-only module.
 *   2. Set PAYMENT_PROVIDER=stripe in the environment.
 *   3. Switch `getPaymentProvider()` to return the live implementation.
 */
export interface DepositRequest {
  quoteId: string;
  amountCents: number;
  currency: 'CAD';
  customerEmail?: string;
  description: string;
}

export interface PaymentProvider {
  name: string;
  connected: boolean;
  createDepositLink(req: DepositRequest): Promise<{ url: string } | { error: string }>;
}

class StubProvider implements PaymentProvider {
  name = 'Not connected';
  connected = false;
  async createDepositLink(_req: DepositRequest): Promise<{ error: string }> {
    return { error: 'PAYMENT_PROVIDER_NOT_CONFIGURED' };
  }
}

export function getPaymentProvider(): PaymentProvider {
  // Later: switch on process.env.PAYMENT_PROVIDER (e.g. 'stripe').
  return new StubProvider();
}
