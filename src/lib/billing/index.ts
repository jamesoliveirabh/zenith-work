import type { BillingProviderAdapter } from './provider';
import { mockBillingProvider } from './mockProvider';

/**
 * Provider factory.
 * Phase H2: always returns the mock provider (homologation only).
 * Future phases will pick by env, e.g. VITE_BILLING_PROVIDER='stripe'.
 */
export const BILLING_PROVIDER: 'mock' | 'stripe' | 'pagarme' = 'mock';

export function getBillingProvider(): BillingProviderAdapter {
  switch (BILLING_PROVIDER) {
    case 'mock':
    default:
      return mockBillingProvider;
  }
}

export type { BillingProviderAdapter } from './provider';
