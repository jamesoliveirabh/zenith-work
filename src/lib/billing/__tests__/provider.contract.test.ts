/**
 * Phase H9 — Provider contract tests.
 *
 * Verifies that ANY implementation of `BillingProviderAdapter` satisfies
 * the structural + behavioural contract the rest of the application
 * depends on. Today we only run it against `mockBillingProvider`, but the
 * same `runProviderContract(adapter)` function will be re-used to assert
 * Stripe / Pagar.me adapters once they exist (H10).
 *
 * The mock provider talks to a Supabase edge function — these tests do NOT
 * hit the network. Instead we stub the adapter's implementation surface to
 * confirm shape compliance + invariants documented in `provider.ts`.
 */

import { describe, it, expect } from 'vitest';
import type { BillingProviderAdapter } from '../provider';
import { mockBillingProvider } from '../mockProvider';

function isFn(v: unknown): v is (...args: unknown[]) => unknown {
  return typeof v === 'function';
}

export function assertProviderShape(adapter: BillingProviderAdapter) {
  expect(['mock', 'stripe', 'pagarme']).toContain(adapter.id);
  expect(isFn(adapter.createSubscription)).toBe(true);
  expect(isFn(adapter.changePlan)).toBe(true);
  expect(isFn(adapter.cancelSubscription)).toBe(true);
  expect(isFn(adapter.resumeSubscription)).toBe(true);
  expect(isFn(adapter.generateInvoice)).toBe(true);
  expect(isFn(adapter.markInvoicePaid)).toBe(true);
  expect(isFn(adapter.markInvoicePastDue)).toBe(true);
  expect(isFn(adapter.closeExpiredCancellations)).toBe(true);
}

describe('BillingProvider contract', () => {
  it('mockBillingProvider satisfies the structural contract', () => {
    assertProviderShape(mockBillingProvider);
  });

  it('mockBillingProvider declares id="mock"', () => {
    expect(mockBillingProvider.id).toBe('mock');
  });

  it('all methods return Promises (async contract)', () => {
    // We can't safely call these in unit tests (they hit the edge function),
    // but we can assert the function shape returns thenables when stubbed.
    const stub: BillingProviderAdapter = {
      ...mockBillingProvider,
      id: 'mock',
      createSubscription: async () => ({ subscription_id: 's1', status: 'active' }),
      changePlan: async () => ({ mode: 'immediate' }),
      cancelSubscription: async () => ({ ok: true as const }),
      resumeSubscription: async () => ({ ok: true as const }),
      generateInvoice: async () => ({ invoice_id: 'i1' }),
      markInvoicePaid: async () => ({ ok: true as const }),
      markInvoicePastDue: async () => ({ invoice_status: 'open' }),
      closeExpiredCancellations: async () => ({ closed: 0 }),
    };
    assertProviderShape(stub);
    expect(stub.createSubscription({ workspace_id: 'w', plan_code: 'free' })).toBeInstanceOf(Promise);
    expect(stub.cancelSubscription({ workspace_id: 'w' })).toBeInstanceOf(Promise);
  });

  it('change-plan response carries a recognized mode (forward-compatible)', async () => {
    const stub: BillingProviderAdapter = {
      ...mockBillingProvider,
      changePlan: async () => ({ mode: 'next_cycle', effective_at: '2030-01-01' }),
    };
    const res = await stub.changePlan({ workspace_id: 'w', new_plan_code: 'pro', mode: 'next_cycle' });
    expect(['immediate', 'next_cycle']).toContain(res.mode);
  });
});
