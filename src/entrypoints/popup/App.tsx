import { useEffect, useState } from 'react';
import { browser, storage } from '#imports';
import { Logo } from '@/components/Logo';
import { TIERS_URL } from '@/lib/clerkConfig';
import { getActiveBundle } from '@/lib/config';
import { isConsentAccepted } from '@/lib/consent';
import { entitlementItem, getActiveEntitlement } from '@/lib/entitlement';
import { getAnonymizeStatus } from '@/lib/quota';
import { blockedCountItem, isEnabled } from '@/settings';
import './App.css';
import { AccountSection } from './AccountSection';
import { PopupConsent } from './PopupConsent';
import { buildPlanView, type FeatureState, type PlanView } from './planFeatures';
import { type ProtectionStatus, protectionStatus } from './protection';
import { SessionLockSettings } from './SessionLockSettings';
import { useCountUp } from './useCountUp';

function FeatureStateIcon({ state }: { state: FeatureState }) {
  if (state === 'upcoming') {
    return (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M12 8v4.2l2.6 1.6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (state === 'locked') {
    return (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
        <rect x="5" y="10.5" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8.4 12.2l2.4 2.4 4.8-5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlanChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`si-plan-chev${open ? ' is-open' : ''}`}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9.6 9.4a2.4 2.4 0 0 1 4.6.9c0 1.6-2.2 1.9-2.2 3.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" />
    </svg>
  );
}

/** Remembers whether the plan checklist is expanded (default: shown). */
const planExpandedItem = storage.defineItem<boolean>('local:si_plan_expanded', { fallback: true });

/** "Your plan" card: every feature with its per-plan state (Active / usage / Soon). */
function PlanCard() {
  const [view, setView] = useState<PlanView | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    planExpandedItem.getValue().then(setOpen);
  }, []);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      planExpandedItem.setValue(next).catch(() => {});
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;

    // Build the view from whatever entitlement is cached in local storage.
    const compute = async () => {
      const [stored, ent] = await Promise.all([entitlementItem.getValue(), getActiveEntitlement()]);
      const snap = {
        plan: ent.plan,
        source: ent.source,
        pro: ent.pro,
        signedIn: stored !== null,
        businessDomain: ent.businessDomain,
      };
      const quota = await getAnonymizeStatus(snap);
      if (!cancelled) setView(buildPlanView({ plan: ent.plan, pro: ent.pro, quota }));
    };

    // Paint immediately from the cached entitlement (a local read, instant)...
    compute().catch(() => {});
    // ...then reconcile with the LIVE Clerk session in the background — a
    // sign-out otherwise leaves a stale Pro blob showing "Unlimited" — and
    // repaint. This no longer blocks the first render (that round-trip is slow).
    browser.runtime
      .sendMessage({ type: 'si-refresh-entitlement' })
      .then(() => {
        if (!cancelled) return compute();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  if (!view) {
    // Instant skeleton so the section never pops in from nothing.
    return (
      <section className="si-plan si-plan--skeleton" aria-hidden="true">
        <div className="si-plan-head">
          <span className="si-plan-title">Your plan</span>
          <span className="si-skel si-skel-tag" />
        </div>
        <ul className="si-plan-list">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="si-feat">
              <span className="si-skel si-skel-ic" />
              <span className="si-skel si-skel-label" />
              <span className="si-skel si-skel-state" />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="si-plan si-plan--in">
      <div className="si-plan-head">
        <button
          type="button"
          className="si-plan-toggle"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="si-plan-body"
        >
          <PlanChevron open={open} />
          <span className="si-plan-title">Your plan</span>
        </button>
        <span className={`si-plan-tag${view.isPro ? ' is-pro' : ''}`}>{view.planLabel}</span>
        {!view.isPro && (
          <button
            type="button"
            className="si-plan-upgrade"
            onClick={() => browser.tabs.create({ url: TIERS_URL }).catch(() => {})}
          >
            Upgrade
          </button>
        )}
      </div>
      <div id="si-plan-body" className={`si-plan-body${open ? ' is-open' : ''}`}>
        <ul className="si-plan-list">
          {view.rows.map((r) => (
            <li key={r.key} className={`si-feat si-feat--${r.state}`}>
              <span className="si-feat-ic">
                <FeatureStateIcon state={r.state} />
              </span>
              <span className="si-feat-label">{r.label}</span>
              <button type="button" className="si-feat-help" aria-label={r.note}>
                <HelpIcon />
                <span className="si-feat-tip" role="tooltip">
                  {r.note}
                </span>
              </button>
              <span className="si-feat-state">{r.detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
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

function ShieldIcon({ checked, size = 20 }: { checked: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width={size} height={size}>
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
  const [needsConsent, setNeedsConsent] = useState<boolean | null>(null);
  const appVersion = browser.runtime.getManifest().version;

  useEffect(() => {
    isConsentAccepted().then((ok) => setNeedsConsent(!ok));
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

  if (needsConsent === null) return null; // brief load — avoids flashing the UI
  if (needsConsent) {
    return (
      <PopupConsent
        onAccept={() => {
          setNeedsConsent(false);
          browser.runtime.sendMessage({ type: 'si-consent-accepted' }).catch(() => {});
        }}
      />
    );
  }

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

      <section className={`si-hero si-hero--${status.kind}`}>
        <div className="si-hero-ring">
          <ShieldIcon checked={status.kind === 'active'} size={30} />
        </div>
        <h2 className="si-hero-title">
          {status.kind === 'active'
            ? 'Protected'
            : status.kind === 'paused'
              ? 'Protection paused'
              : 'Not active here'}
        </h2>
        {status.kind === 'active' && (
          <span className="si-hero-host" title={status.host}>
            {status.host}
          </span>
        )}
        <div className="si-hero-metric">
          <b>{displayCount.toLocaleString()}</b> secret{count === 1 ? '' : 's'} intercepted so far
        </div>
      </section>

      <PlanCard />

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
          Zero retention
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
