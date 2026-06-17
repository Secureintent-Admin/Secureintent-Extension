import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearFeatures, notifyAction, notifyDetections, registerFeature } from './registry';
import type { DetectionContext } from './types';

const ctx: DetectionContext = {
  site: 'ChatGPT',
  siteKey: 'chatgpt',
  detectionCount: 2,
  types: ['known-key', 'env-credential'],
  labels: ['AWS key', 'DB url'],
};

afterEach(() => clearFeatures());

describe('feature registry', () => {
  it('invokes registered onDetections hooks', async () => {
    const spy = vi.fn();
    registerFeature({ name: 'pro', onDetections: spy });
    await notifyDetections(ctx);
    expect(spy).toHaveBeenCalledWith(ctx);
  });

  it('passes the action to onAction hooks', async () => {
    const spy = vi.fn();
    registerFeature({ name: 'pro', onAction: spy });
    await notifyAction({ ...ctx, action: 'redact' });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ action: 'redact' }));
  });

  it('is a no-op when no features are registered', async () => {
    await expect(notifyDetections(ctx)).resolves.toBeUndefined();
  });

  it('does not let a throwing hook break the guard (fail-open)', async () => {
    const good = vi.fn();
    registerFeature({
      name: 'broken',
      onDetections: () => {
        throw new Error('boom');
      },
    });
    registerFeature({ name: 'good', onDetections: good });
    await expect(notifyDetections(ctx)).resolves.toBeUndefined();
    expect(good).toHaveBeenCalled(); // later hooks still run
  });
});
