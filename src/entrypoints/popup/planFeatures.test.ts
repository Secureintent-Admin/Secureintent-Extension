import { describe, expect, it } from 'vitest';
import type { QuotaStatus } from '@/lib/quota';
import { buildPlanView } from './planFeatures';

const usage = (remaining: number, limit = 10): QuotaStatus => ({
  used: limit - remaining,
  remaining,
  limit,
  unlimited: false,
});
const unlimited: QuotaStatus = { used: 0, remaining: -1, limit: 10, unlimited: true };

const TOOLKIT = ['rehydrate', 'ghost', 'session_lock'];
const UPCOMING = ['team_policy', 'team_alerts'];

describe('buildPlanView', () => {
  it('free plan: detection active, anonymise shows the monthly count', () => {
    const v = buildPlanView({ plan: 'developer', pro: false, quota: usage(9) });
    expect(v.planLabel).toBe('Free');
    expect(v.isPro).toBe(false);
    expect(v.rows[0]).toMatchObject({ key: 'detection', state: 'active', detail: 'Active' });
    expect(v.rows[1]).toMatchObject({ key: 'anonymise', state: 'usage', detail: '9 / 10 left' });
  });

  it('free plan: toolkit is locked (Pro), not active', () => {
    const v = buildPlanView({ plan: 'developer', pro: false, quota: usage(9) });
    const toolkit = v.rows.filter((r) => TOOLKIT.includes(r.key));
    expect(toolkit).toHaveLength(3);
    expect(toolkit.every((r) => r.state === 'locked' && r.detail === 'Pro')).toBe(true);
  });

  it('pro plan: anonymise unlimited and toolkit active', () => {
    const v = buildPlanView({ plan: 'developer_pro', pro: true, quota: unlimited });
    expect(v.planLabel).toBe('Developer Pro');
    expect(v.isPro).toBe(true);
    expect(v.rows[1]).toMatchObject({ key: 'anonymise', state: 'active', detail: 'Unlimited' });
    const toolkit = v.rows.filter((r) => TOOLKIT.includes(r.key));
    expect(toolkit.every((r) => r.state === 'active' && r.detail === 'Active')).toBe(true);
  });

  it('business features are hidden from Free and Developer Pro', () => {
    for (const plan of ['developer', 'developer_pro'] as const) {
      const v = buildPlanView({ plan, pro: plan !== 'developer', quota: unlimited });
      expect(v.rows.some((r) => UPCOMING.includes(r.key))).toBe(false);
    }
  });

  it('business_pro sees the upcoming business features', () => {
    const v = buildPlanView({ plan: 'business_pro', pro: true, quota: unlimited });
    expect(v.planLabel).toBe('Business Pro');
    const upcoming = v.rows.filter((r) => UPCOMING.includes(r.key));
    expect(upcoming).toHaveLength(2);
    expect(upcoming.every((r) => r.state === 'upcoming' && r.detail === 'Soon')).toBe(true);
  });
});
