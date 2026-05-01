import { describe, it, expect } from 'vitest';
import {
  classifyUsage,
  calculateUsagePct,
  buildUsageItem,
  formatUsageValue,
} from '@/lib/billing/usage';

describe('billing/usage', () => {
  describe('calculateUsagePct', () => {
    it('returns null for unlimited (limit null)', () => {
      expect(calculateUsagePct(50, null)).toBeNull();
    });
    it('returns 100 when limit is zero', () => {
      expect(calculateUsagePct(0, 0)).toBe(100);
    });
    it('caps at 100 when over limit', () => {
      expect(calculateUsagePct(120, 100)).toBe(100);
    });
    it('clamps below 0', () => {
      expect(calculateUsagePct(-5, 100)).toBe(0);
    });
    it('returns proper percentage', () => {
      expect(calculateUsagePct(40, 100)).toBe(40);
      expect(calculateUsagePct(80, 100)).toBe(80);
    });
  });

  describe('classifyUsage', () => {
    it('returns unlimited when limit is null/undefined', () => {
      expect(classifyUsage(999, null)).toBe('unlimited');
    });
    it('returns critical when limit is 0', () => {
      expect(classifyUsage(0, 0)).toBe('critical');
    });
    it('returns ok below 80%', () => {
      expect(classifyUsage(79, 100)).toBe('ok');
      expect(classifyUsage(0, 100)).toBe('ok');
    });
    it('returns warning between 80% and <100%', () => {
      expect(classifyUsage(80, 100)).toBe('warning');
      expect(classifyUsage(99, 100)).toBe('warning');
    });
    it('returns critical at 100%+', () => {
      expect(classifyUsage(100, 100)).toBe('critical');
      expect(classifyUsage(150, 100)).toBe('critical');
    });
  });

  describe('buildUsageItem', () => {
    it('builds item with known feature label', () => {
      const item = buildUsageItem('members', 5, 10);
      expect(item.label).toBe('Membros');
      expect(item.usagePct).toBe(50);
      expect(item.status).toBe('ok');
    });
    it('falls back to feature key when unknown', () => {
      const item = buildUsageItem('unknown_feature', 1, 2);
      expect(item.label).toBe('unknown_feature');
    });
    it('marks unlimited correctly', () => {
      const item = buildUsageItem('automations', 100, null);
      expect(item.status).toBe('unlimited');
      expect(item.usagePct).toBeNull();
    });
  });

  describe('formatUsageValue', () => {
    it('formats with unit when limit is set', () => {
      const item = buildUsageItem('storage_gb', 1.5, 10);
      expect(formatUsageValue(item)).toBe('1.5 GB / 10 GB');
    });
    it('formats unlimited', () => {
      const item = buildUsageItem('members', 3, null);
      expect(formatUsageValue(item)).toBe('3 / Ilimitado');
    });
    it('formats integer cleanly', () => {
      const item = buildUsageItem('members', 5, 10);
      expect(formatUsageValue(item)).toBe('5 / 10');
    });
  });
});
