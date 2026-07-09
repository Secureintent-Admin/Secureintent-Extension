import { useEffect, useState } from 'react';
import { browser } from '#imports';
import { Logo } from '@/components/Logo';
import { getActiveBundle } from '@/lib/config';
import { entitlementItem, getActiveEntitlement } from '@/lib/entitlement';
import { getAnonymizeStatus, type QuotaStatus } from '@/lib/quota';
import { blockedCountItem, isEnabled } from '@/settings';
import './App.css';
import { AccountSection } from './AccountSection';
import { type ProtectionStatus, protectionStatus } from './protection';
import { SessionLockSettings } from './SessionLockSettings';
import { useCountUp } from './useCountUp';

/** Anonymise & Paste allowance: "Unlimited" for Pro, "N / 10 left" for free. */
function UsageMeter() {
  const [status, setStatus] = useState<QuotaStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Reconcile the cached entitlement with the LIVE Clerk session before
      // reading it. Without this a sign-out leaves a stale Pro blob behind and
      // the meter keeps showing "Unlimited"; it also settles `signedIn` so we
      // don't flip between the offline count and the backend count mid-render.
      await browser.runtime.sendMessage({ type: 'si-refresh-entitlement' }).catch(() => {});
      if (cancelled) return;
      const [stored, ent] = await Promise.all([entitlementItem.getValue(), getActiveEntitlement()]);
      const snap = {
        plan: ent.plan,
        source: ent.source,
        pro: ent.pro,
        signedIn: stored !== null,
        businessDomain: ent.businessDomain,
      };
      const s = await getAnonymizeStatus(snap);
      if (!cancelled) setStatus(s);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status) return null;

  if (status.unlimited) {
    return (
      <div className="si-usage">
        <div className="si-usage-top">
          <span className="si-usage-label">Anonymise &amp; Paste</span>
          <span className="si-usage-pro">Unlimited</span>
        </div>
      </div>
    );
  }

  const pct = status.limit > 0 ? (status.remaining / status.limit) * 100 : 0;
  const low = status.remaining <= 2;
  return (
    <div className="si-usage">
      <div className="si-usage-top">
        <span className="si-usage-label">Anonymise &amp; Paste</span>
        <span className="si-usage-count">
          <strong>{status.remaining}</strong>
          <span className="si-usage-of">/ {status.limit} left</span>
        </span>
      </div>
      <div className="si-usage-bar">
        <div className={`si-usage-fill${low ? ' is-low' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="si-usage-note">Resets monthly · unlimited on Pro</span>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 17L17 7M9 7h8v8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldIcon({ checked }: { checked: boolean }) {
  return (
    <svg
      className="si-protect-icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      width="20"
      height="20"
    >
      <path
        d="M12 3l7 3v5.5c0 4.3-2.9 7.4-7 8.8-4.1-1.4-7-4.5-7-8.8V6l7-3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {checked && (
        <path
          d="M8.7 12l2.1 2.1 4-4.2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

function LocalShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="13" height="13">
      <path
        d="M12 3l7 3v5.5c0 4.3-2.9 7.4-7 8.8-4.1-1.4-7-4.5-7-8.8V6l7-3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <rect
        x="9.25"
        y="11"
        width="5.5"
        height="4.5"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M10.5 11v-1a1.5 1.5 0 0 1 3 0v1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 12a9 9 0 1 1-2.64-6.36M21 4v4h-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function App() {
  const [count, setCount] = useState(0);
  const displayCount = useCountUp(count);
  const [patternVersion, setPatternVersion] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<ProtectionStatus>({ kind: 'inactive' });
  const appVersion = browser.runtime.getManifest().version;

  useEffect(() => {
    blockedCountItem.getValue().then(setCount);
    getActiveBundle().then((b) => setPatternVersion(b.version));
    const stop = blockedCountItem.watch((v) => setCount(v ?? 0));

    // Resolve protection status for the current tab.
    Promise.all([browser.tabs.query({ active: true, currentWindow: true }), isEnabled()]).then(
      ([tabs, enabled]) => {
        setStatus(protectionStatus(tabs[0]?.url, enabled));
      },
    );

    return () => stop();
  }, []);

  const refresh = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await browser.runtime.sendMessage({ type: 'si-refresh-config' });
      const b = await getActiveBundle();
      setPatternVersion(b.version);
    } finally {
      setTimeout(() => setSyncing(false), 600);
    }
  };

  return (
    <div className="si-pop">
      <header className="si-pop-header">
        <div className="si-brand">
          <Logo size={22} />
          <span className="si-wordmark">
            SecureIntent<span className="si-accent">.ai</span>
          </span>
        </div>
        <span className="si-version">v{appVersion}</span>
      </header>

      <AccountSection />

      <div className={`si-protect si-protect--${status.kind}`}>
        <ShieldIcon checked={status.kind === 'active'} />
        <div className="si-protect-lines">
          {status.kind === 'active' ? (
            <>
              <span className="si-protect-label">Protected</span>
              <span className="si-protect-host" title={status.host}>
                {status.host}
              </span>
            </>
          ) : (
            <span className="si-protect-label">
              {status.kind === 'inactive' ? 'Not active on this page' : 'Protection paused'}
            </span>
          )}
        </div>
      </div>

      <section className="si-stat">
        <div className="si-stat-num">{displayCount.toLocaleString()}</div>
        <div className="si-stat-label">secrets intercepted</div>
      </section>

      <UsageMeter />

      <SessionLockSettings />

      <div className="si-config">
        <span className="si-config-label">
          Detection patterns <span className="si-config-ver">v{patternVersion ?? '—'}</span>
        </span>
        <button
          type="button"
          className={`si-refresh ${syncing ? 'is-syncing' : ''}`}
          onClick={refresh}
          disabled={syncing}
          title="Check for the latest detection patterns"
        >
          <RefreshIcon />
          {syncing ? 'Checking…' : 'Check for updates'}
        </button>
      </div>

      <footer className="si-pop-footer">
        <span
          className="si-privacy-badge"
          title="Your text is analyzed on-device and never leaves the browser"
        >
          <LocalShieldIcon />
          Evaluated locally
        </span>
        <a
          className="si-link"
          href="https://github.com/Secureintent-Admin/Secureintent-Extension"
          target="_blank"
          rel="noreferrer"
        >
          Auditable code <ArrowIcon />
        </a>
      </footer>
    </div>
  );
}

export default App;
