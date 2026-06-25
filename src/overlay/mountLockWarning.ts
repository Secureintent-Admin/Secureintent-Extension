import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { type ContentScriptContext, createShadowRootUi } from '#imports';
import { LockWarning, type LockWarningProps } from './LockWarning';

export interface LockWarningHandle {
  remove(): void;
}

// Closed Shadow DOM toast (open in e2e builds). Thin wrapper, e2e-verified.
export async function mountLockWarning(
  ctx: ContentScriptContext,
  props: LockWarningProps,
): Promise<LockWarningHandle> {
  const ui = await createShadowRootUi<Root>(ctx, {
    name: 'secureintent-lock-warning',
    mode:
      (import.meta.env as Record<string, string | undefined>).WXT_E2E === '1' ? 'open' : 'closed',
    position: 'overlay',
    zIndex: 2147483646,
    anchor: 'body',
    isolateEvents: true,
    onMount: (container) => {
      const root = createRoot(container);
      root.render(createElement(LockWarning, props));
      return root;
    },
    onRemove: (root) => root?.unmount(),
  });

  ui.mount();
  return { remove: () => ui.remove() };
}
