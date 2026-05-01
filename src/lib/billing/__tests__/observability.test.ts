/**
 * Phase H9 — Observability unit tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  addLogSink,
  addMetricSink,
  getBillingCounters,
  getRecentBillingLogs,
  instrumentBillingCall,
  logBillingEvent,
  newCorrelationId,
  recordBillingMetric,
  resetBillingObservability,
} from '../observability';

describe('observability', () => {
  beforeEach(() => resetBillingObservability());

  it('redacts sensitive keys in context', () => {
    logBillingEvent({
      level: 'info',
      domain: 'admin',
      event: 'admin.update',
      correlation_id: 'cid1',
      context: { email: 'a@b.com', card_pan: '4242', safe: 'ok' },
    });
    const [evt] = getRecentBillingLogs();
    expect(evt.context?.email).toBe('[REDACTED]');
    expect(evt.context?.card_pan).toBe('[REDACTED]');
    expect(evt.context?.safe).toBe('ok');
  });

  it('counters increment per metric+tag combination', () => {
    recordBillingMetric('billing.test', 1, { kind: 'a' });
    recordBillingMetric('billing.test', 2, { kind: 'a' });
    recordBillingMetric('billing.test', 1, { kind: 'b' });
    const c = getBillingCounters();
    expect(c['billing.test|kind=a']).toBe(3);
    expect(c['billing.test|kind=b']).toBe(1);
  });

  it('instrumentBillingCall records ok metric on success', async () => {
    const result = await instrumentBillingCall(
      { domain: 'subscription', event: 'create' },
      async () => 42,
    );
    expect(result).toBe(42);
    const c = getBillingCounters();
    expect(
      Object.entries(c).some(([k, v]) => k.includes('billing.call.count') && k.includes('outcome=ok') && v >= 1),
    ).toBe(true);
  });

  it('instrumentBillingCall records error metric and rethrows', async () => {
    await expect(
      instrumentBillingCall({ domain: 'subscription', event: 'create' }, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const c = getBillingCounters();
    expect(
      Object.entries(c).some(([k]) => k.includes('billing.call.count') && k.includes('outcome=error')),
    ).toBe(true);
  });

  it('newCorrelationId returns unique-ish ids', () => {
    const a = newCorrelationId();
    const b = newCorrelationId();
    expect(a).not.toBe(b);
    expect(a.startsWith('bil_')).toBe(true);
  });

  it('log sinks receive sanitized events', () => {
    const seen: unknown[] = [];
    const off = addLogSink((e) => seen.push(e));
    logBillingEvent({
      level: 'info',
      domain: 'dunning',
      event: 'attempt',
      correlation_id: 'cid',
      context: { token: 'sekret' },
    });
    off();
    expect((seen[0] as { context?: { token?: string } }).context?.token).toBe('[REDACTED]');
  });

  it('metric sinks receive raw metric events', () => {
    const seen: unknown[] = [];
    const off = addMetricSink((e) => seen.push(e));
    recordBillingMetric('x', 1);
    off();
    expect(seen).toHaveLength(1);
  });
});
