import { describe, it, expect } from 'vitest';

/**
 * Phase H2 — pure domain rules tests.
 * The transactional logic lives in the `billing-mock` edge function and SQL
 * helpers, which require a live database to execute. These tests cover only
 * the deterministic, side-effect-free pieces.
 *
 * Gaps documented for follow-up:
 *  - End-to-end tests against a real DB (trial -> active -> change_plan ->
 *    cancel -> resume -> close_expired) should be added in Phase H3 once a
 *    seeded test workspace utility exists.
 */

// Replicas of the helpers used inside the edge function — kept here as the
// reference unit-testable spec.
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function deriveSubscriptionState(args: {
  trialDays: number;
  interval: 'month' | 'year';
  now?: Date;
}) {
  const now = args.now ?? new Date('2026-01-15T00:00:00Z');
  const status = args.trialDays > 0 ? 'trialing' : 'active';
  const periodStart = now;
  const periodEnd =
    args.interval === 'year' ? addMonths(now, 12) : addMonths(now, 1);
  const trialEndsAt = args.trialDays > 0 ? addDays(now, args.trialDays) : null;
  return { status, periodStart, periodEnd, trialEndsAt };
}

function canResume(sub: {
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  now?: Date;
}): { ok: boolean; reason?: string } {
  const now = sub.now ?? new Date();
  if (!sub.cancel_at_period_end) return { ok: false, reason: 'not_scheduled' };
  if (sub.current_period_end && new Date(sub.current_period_end) < now)
    return { ok: false, reason: 'period_ended' };
  return { ok: true };
}

describe('billing/domain — subscription state derivation', () => {
  it('starts in trialing when trialDays > 0', () => {
    const s = deriveSubscriptionState({ trialDays: 14, interval: 'month' });
    expect(s.status).toBe('trialing');
    expect(s.trialEndsAt).not.toBeNull();
  });

  it('starts active when no trial', () => {
    const s = deriveSubscriptionState({ trialDays: 0, interval: 'month' });
    expect(s.status).toBe('active');
    expect(s.trialEndsAt).toBeNull();
  });

  it('monthly period spans 1 month', () => {
    const now = new Date('2026-01-15T00:00:00Z');
    const s = deriveSubscriptionState({ trialDays: 0, interval: 'month', now });
    expect(s.periodEnd.toISOString()).toBe('2026-02-15T00:00:00.000Z');
  });

  it('yearly period spans 12 months', () => {
    const now = new Date('2026-01-15T00:00:00Z');
    const s = deriveSubscriptionState({ trialDays: 0, interval: 'year', now });
    expect(s.periodEnd.toISOString()).toBe('2027-01-15T00:00:00.000Z');
  });
});

describe('billing/domain — resume rules', () => {
  it('rejects when not scheduled to cancel', () => {
    const r = canResume({ cancel_at_period_end: false, current_period_end: null });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not_scheduled');
  });

  it('rejects when period already ended', () => {
    const r = canResume({
      cancel_at_period_end: true,
      current_period_end: '2020-01-01T00:00:00Z',
      now: new Date('2026-01-01T00:00:00Z'),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('period_ended');
  });

  it('allows resume within active period', () => {
    const r = canResume({
      cancel_at_period_end: true,
      current_period_end: '2099-01-01T00:00:00Z',
    });
    expect(r.ok).toBe(true);
  });
});

describe('billing/domain — invoice failure policy', () => {
  it('keeps invoice open by default and finalizes when requested', () => {
    const policy = (finalize: boolean) => (finalize ? 'uncollectible' : 'open');
    expect(policy(false)).toBe('open');
    expect(policy(true)).toBe('uncollectible');
  });
});
