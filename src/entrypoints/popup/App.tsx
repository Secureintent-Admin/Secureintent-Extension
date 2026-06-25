import { useEffect, useState } from 'react';
import { browser } from '#imports';
import { Logo } from '@/components/Logo';
import { getActiveBundle } from '@/lib/config';
import { blockedCountItem } from '@/settings';
import './App.css';
import { SessionLockSettings } from './SessionLockSettings';

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
  const [patternVersion, setPatternVersion] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const appVersion = browser.runtime.getManifest().version;

  useEffect(() => {
    blockedCountItem.getValue().then(setCount);
    getActiveBundle().then((b) => setPatternVersion(b.version));
    const stop = blockedCountItem.watch((v) => setCount(v ?? 0));
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

      <section className="si-stat">
        <div className="si-stat-num">{count}</div>
        <div className="si-stat-label">secrets intercepted</div>
      </section>

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

      <SessionLockSettings />

      <footer className="si-pop-footer">
        <span>Evaluated locally</span>
        <a className="si-link" href="https://secureintent.ai" target="_blank" rel="noreferrer">
          Source code <ArrowIcon />
        </a>
      </footer>
    </div>
  );
}

export default App;
