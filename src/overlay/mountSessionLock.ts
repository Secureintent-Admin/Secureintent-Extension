import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { type ContentScriptContext, createShadowRootUi } from '#imports';
import { SessionLock, type SessionLockProps } from './SessionLock';

export interface SessionLockHandle {
  remove(): void;
}

// Closed Shadow DOM in production (open in e2e builds). Thin wrapper, e2e-verified.
export async function mountSessionLock(
  ctx: ContentScriptContext,
  props: SessionLockProps,
): Promise<SessionLockHandle> {
  const ui = await createShadowRootUi<Root>(ctx, {
    name: 'secureintent-session-lock',
    mode:
      (import.meta.env as Record<string, string | undefined>).WXT_E2E === '1' ? 'open' : 'closed',
    position: 'overlay',
    zIndex: 2147483647,
    anchor: 'body',
    isolateEvents: true,
    onMount: (container) => {
      const root = createRoot(container);
      root.render(createElement(SessionLock, props));
      return root;
    },
    onRemove: (root) => root?.unmount(),
  });

  ui.mount();
  return { remove: () => ui.remove() };
}
