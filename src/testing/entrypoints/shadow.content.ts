import { browser, defineContentScript } from '#imports';
import { findComposer } from '@/content/findComposer';
import { DEFAULT_BUNDLE } from '@/lib/config';
import { compilePatterns } from '@/lib/detection';
import { createPasteProcessor } from '@/lib/paste/client';
import { MAX_PASTE_CHARS } from '@/lib/paste/protocol';
import { catalogMatchPatterns, recognizeAiPage } from '@/lib/shadow/catalog';
import type { DlpAction } from '@/lib/shadow/visits';

type LocalPolicy = {
  enabled: boolean;
  version: number;
  service: {
    serviceId: string;
    classification: 'sanctioned' | 'recognized' | 'review';
    pasteBlocked: boolean;
  } | null;
};

const COMPOSER =
  'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="url"], input[type="email"], input[type="tel"], input[type="password"], [contenteditable]:not([contenteditable="false"]), [role="textbox"]';

function insertText(target: HTMLElement, text: string) {
  target.focus();
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    target.setRangeText(text, start, end, 'end');
    target.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: text }),
    );
    return;
  }
  document.execCommand('insertText', false, text);
}

function mountNotice(message: string) {
  const host = document.createElement('div');
  host.dataset.siShadowTest = 'notice';
  host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647';
  const root = host.attachShadow({ mode: 'closed' });
  const box = document.createElement('div');
  box.textContent = message;
  box.style.cssText =
    'max-width:340px;padding:14px 16px;border:1px solid #334155;border-radius:12px;background:#0f172a;color:#f8fafc;font:600 13px/1.45 system-ui;box-shadow:0 16px 40px #02061766';
  root.append(box);
  document.documentElement.append(host);
  window.setTimeout(() => host.remove(), 3500);
}

function askSensitiveAction(site: string, reason: string, count: number): Promise<DlpAction> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.dataset.siShadowTest = 'warning';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647';
    const root = host.attachShadow({ mode: 'closed' });
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <style>
        .backdrop{position:fixed;inset:0;background:#020617aa;display:grid;place-items:center;padding:20px;font-family:Inter,system-ui,sans-serif}
        .card{width:min(460px,100%);background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:18px;box-shadow:0 24px 80px #020617;padding:24px}
        .brand{font-weight:800;color:#fff}.brand span{color:#38bdf8}.tag{float:right;font-size:10px;letter-spacing:.08em;color:#94a3b8}
        h2{margin:22px 0 8px;font-size:21px;color:#fff}p{margin:7px 0;color:#cbd5e1;font-size:14px;line-height:1.5}.reason{padding:10px 12px;border-radius:9px;background:#1e293b;color:#f8fafc}
        .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}button{cursor:pointer;border-radius:9px;padding:10px 13px;border:1px solid #475569;background:#1e293b;color:#fff;font-weight:700}button.primary{border-color:#0284c7;background:#0284c7}button.danger{color:#fecaca}
      </style>
      <div class="backdrop" role="dialog" aria-modal="true" aria-label="Sensitive information detected">
        <div class="card"><div class="brand">SecureIntent<span>.ai</span><span class="tag">LOCAL TEST</span></div>
          <h2>Sensitive information detected</h2>
          <p>SecureIntent found ${count} sensitive finding${count === 1 ? '' : 's'} before pasting into ${site}.</p>
          <p class="reason"></p>
          <p>No pasted content or secret value is included in telemetry.</p>
          <div class="actions">
            <button data-action="cancelled" class="danger">Cancel paste</button>
            <button data-action="sanitised" class="primary">Sanitise &amp; paste</button>
            <button data-action="warning_bypassed">Paste anyway</button>
          </div>
        </div>
      </div>`;
    (wrap.querySelector('.reason') as HTMLElement).textContent = `Reason: ${reason}`;
    const finish = (action: DlpAction) => {
      document.removeEventListener('keydown', onKeyDown, true);
      host.remove();
      resolve(action);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finish('cancelled');
    };
    wrap.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((button) => {
      button.addEventListener('click', () => finish(button.dataset.action as DlpAction), {
        once: true,
      });
    });
    root.append(wrap);
    document.documentElement.append(host);
    document.addEventListener('keydown', onKeyDown, true);
    wrap.querySelector<HTMLButtonElement>('button[data-action="cancelled"]')?.focus();
  });
}

export default defineContentScript({
  matches: catalogMatchPatterns(),
  allFrames: false,
  runAt: 'document_idle',
  async main(ctx) {
    if (window.top !== window || !recognizeAiPage(location.hostname, location.pathname)) return;
    void browser.runtime
      .sendMessage({ type: 'si-shadow-visit', eventId: crypto.randomUUID() })
      .catch(() => undefined);

    let policy: LocalPolicy = { enabled: false, service: null, version: 0 };
    const refreshPolicy = async () => {
      try {
        const value = await browser.runtime.sendMessage({ type: 'si-shadow-policy' });
        if (value && typeof value === 'object') policy = value as LocalPolicy;
      } catch {
        // Offline policy remains cached in memory; no production fallback exists.
      }
    };
    await refreshPolicy();
    const storageChanged = () => void refreshPolicy();
    browser.storage.onChanged.addListener(storageChanged);
    ctx.onInvalidated?.(() => browser.storage.onChanged.removeListener(storageChanged));

    const patterns = compilePatterns(DEFAULT_BUNDLE.patterns).map(({ regex, ...pattern }) => ({
      ...pattern,
      source: regex.source,
      flags: regex.flags,
    }));
    let active = false;
    ctx.addEventListener(
      document,
      'paste',
      async (event) => {
        const paste = event as ClipboardEvent;
        if (!paste.isTrusted || !policy.enabled || active) return;
        const target = findComposer(paste.composedPath(), COMPOSER);
        const text = paste.clipboardData?.getData('text/plain') ?? '';
        if (!target || !text) return;

        paste.preventDefault();
        paste.stopImmediatePropagation();
        active = true;
        const pasteEventId = crypto.randomUUID();
        const byteSize = new TextEncoder().encode(text).byteLength;
        void browser.runtime
          .sendMessage({ type: 'si-shadow-paste-volume', eventId: pasteEventId, byteSize })
          .catch(() => undefined);
        if (text.length > MAX_PASTE_CHARS) {
          mountNotice('Paste stopped: it is too large to scan safely.');
          active = false;
          return;
        }
        const controller = new AbortController();
        try {
          const processor = await createPasteProcessor(controller.signal);
          const scan = await processor.request('scan', { text, patterns, summary: false });
          if (scan.total === 0) {
            if (policy.service?.pasteBlocked)
              mountNotice('Pasting is blocked by your organisation for this AI tool.');
            else insertText(target, text);
            return;
          }
          const reason = scan.labels[0] ?? 'Sensitive information';
          const detectionType = scan.types[0] ?? 'known-key';
          let action: DlpAction;
          if (policy.service?.pasteBlocked) {
            action = 'blocked';
            mountNotice(`Paste blocked by organisation policy · ${reason}`);
          } else {
            action = await askSensitiveAction(location.hostname, reason, scan.total);
            if (action === 'sanitised')
              insertText(target, await processor.request('sanitize', null));
            else if (action === 'warning_bypassed') insertText(target, text);
          }
          void browser.runtime
            .sendMessage({
              type: 'si-shadow-dlp',
              eventId: crypto.randomUUID(),
              pasteEventId,
              detectionType,
              reason,
              action,
              findingCount: scan.total,
            })
            .catch(() => undefined);
        } catch {
          mountNotice('Paste stopped: local secret scanning was unavailable.');
        } finally {
          controller.abort();
          active = false;
        }
      },
      { capture: true },
    );
  },
});
