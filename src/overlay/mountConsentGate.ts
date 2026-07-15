import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { type ContentScriptContext, createShadowRootUi } from '#imports';
import { ConsentGate, type ConsentGateProps } from './ConsentGate';

export interface ConsentGateHandle {
  remove(): void;
}

// Closed Shadow DOM consent gate (open in e2e builds). Thin wrapper, verified via build.
export async function mountConsentGate(
  ctx: ContentScriptContext,
  props: ConsentGateProps,
): Promise<ConsentGateHandle> {
  const ui = await createShadowRootUi<Root>(ctx, {
    name: 'secureintent-consent',
    mode:
      (import.meta.env as Record<string, string | undefined>).WXT_E2E === '1' ? 'open' : 'closed',
    position: 'overlay',
    zIndex: 2147483647,
    anchor: 'body',
    isolateEvents: true,
    onMount: (container) => {
      const root = createRoot(container);
      root.render(createElement(ConsentGate, props));
      return root;
    },
    onRemove: (root) => root?.unmount(),
  });

  ui.mount();
  return { remove: () => ui.remove() };
}
