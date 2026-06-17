import { siError } from '@/lib/debug';
import type { ActionContext, DetectionContext, Feature } from './types';

const features: Feature[] = [];

/** Register a premium feature. Called by pro entrypoints at content-script start. */
export function registerFeature(feature: Feature): void {
  features.push(feature);
}

/** Test helper — reset the registry between cases. */
export function clearFeatures(): void {
  features.length = 0;
}

// Hooks are fail-open: a throwing premium hook must never break the paste guard.
async function run<T>(
  ctx: T,
  pick: (f: Feature) => ((ctx: T) => void | Promise<void>) | undefined,
) {
  for (const f of features) {
    try {
      await pick(f)?.(ctx);
    } catch (err) {
      siError(f.name, 'feature hook failed', err);
    }
  }
}

export function notifyDetections(ctx: DetectionContext): Promise<void> {
  return run(ctx, (f) => f.onDetections);
}

export function notifyAction(ctx: ActionContext): Promise<void> {
  return run(ctx, (f) => f.onAction);
}
