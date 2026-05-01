import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DUNNING_POLICY,
  dunningToneFromAttempt,
  isDunningActive,
} from '@/lib/billing/dunningPolicy';

describe('dunning policy helpers', () => {
  it('defaults match spec (3 retries / 7d grace)', () => {
    expect(DEFAULT_DUNNING_POLICY.max_retries).toBe(3);
    expect(DEFAULT_DUNNING_POLICY.retry_schedule_days).toEqual([1, 3, 5]);
    expect(DEFAULT_DUNNING_POLICY.grace_period_days).toBe(7);
    expect(DEFAULT_DUNNING_POLICY.auto_cancel_after_grace).toBe(true);
  });

  it('isDunningActive recognises open states only', () => {
    expect(isDunningActive('open')).toBe(true);
    expect(isDunningActive('recovering')).toBe(true);
    expect(isDunningActive('exhausted')).toBe(true);
    expect(isDunningActive('recovered')).toBe(false);
    expect(isDunningActive('canceled')).toBe(false);
    expect(isDunningActive(null)).toBe(false);
  });

  it('tone progresses with retries', () => {
    expect(dunningToneFromAttempt(0, 3)).toBe(0);
    expect(dunningToneFromAttempt(1, 3)).toBe(1);
    expect(dunningToneFromAttempt(2, 3)).toBe(1);
    expect(dunningToneFromAttempt(3, 3)).toBe(2);
    expect(dunningToneFromAttempt(5, 3)).toBe(2);
  });
});
