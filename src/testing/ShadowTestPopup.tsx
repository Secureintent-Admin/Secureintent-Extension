import { useEffect, useState } from 'react';
import { browser } from '#imports';
import { Logo } from '@/components/Logo';
import { AI_CATALOG } from '@/lib/shadow/catalog';

type Status = {
  enabled?: boolean;
  seatLabel?: string | null;
  queued?: number;
  dropped?: number;
  error?: string | null;
  readback?: {
    total: number;
    events: { eventId: string; hostname: string; timestamp: number }[];
  } | null;
};
export function ShadowTestPopup() {
  const [status, setStatus] = useState<Status>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  async function action(type: string) {
    setBusy(true);
    try {
      setStatus(
        await browser.runtime.sendMessage({
          type,
          ...(type === 'si-shadow-enable' ? { consent } : {}),
        }),
      );
    } catch {
      setStatus({ error: 'Test extension unavailable. Reload the test build.' });
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let mounted = true;
    void browser.runtime.sendMessage({ type: 'si-shadow-status' }).then(
      (value) => {
        if (mounted) setStatus(value);
      },
      () => {
        if (mounted) setStatus({ error: 'Test extension unavailable. Reload the test build.' });
      },
    );
    return () => {
      mounted = false;
    };
  }, []);
  return (
    <div className="si-pop">
      <header className="si-pop-header">
        <div className="si-brand">
          <Logo />
          <span className="si-wordmark">
            SecureIntent<span className="si-accent">.ai</span>
          </span>
        </div>
        <span className="si-version">LOCAL TEST</span>
      </header>
      <section className="si-hero">
        <h1 className="si-hero-title">Shadow AI Discovery</h1>
        <p className="si-lockcfg-note">Catalog &amp; visit tracking · synthetic Business account</p>
        <div className="si-hero-metric">
          <b>{AI_CATALOG.services.length}</b> recognised AI tools in catalog
        </div>
        <p className="si-lockcfg-note">
          Discovery test harness only. Not a replacement for the production protection extension.
        </p>
      </section>
      <section className="si-lockcfg">
        <div className="si-lockcfg-head">
          <span className="si-lockcfg-title">Visit collection</span>
          <span className="si-version">{status.enabled ? status.seatLabel : 'Off'}</span>
        </div>
        {!status.enabled && (
          <label className="si-lockcfg-note">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />{' '}
            Allow hostname-only visit metadata to the backend on this computer. No URLs, page
            content or pasted text.
          </label>
        )}
        <p className="si-lockcfg-note">
          Only visits after enabling are captured. Reload an already-open AI tab. Private windows
          are excluded.
        </p>
        <button
          type="button"
          className="si-lockcfg-btn"
          disabled={busy || (!status.enabled && !consent)}
          onClick={() => void action(status.enabled ? 'si-shadow-disable' : 'si-shadow-enable')}
        >
          {busy
            ? 'Working…'
            : status.enabled
              ? 'Disable & clear pending metadata'
              : 'Enable local test'}
        </button>
        {status.error && (
          <p className="si-lockcfg-note" role="alert">
            {status.error}
          </p>
        )}
      </section>
      {status.enabled && (
        <section className="si-lockcfg">
          <div className="si-lockcfg-head">
            <span className="si-lockcfg-title">Local visit readback</span>
            <button
              type="button"
              className="si-lockcfg-btn"
              disabled={busy}
              onClick={() => void action('si-shadow-flush')}
            >
              Sync &amp; refresh
            </button>
          </div>
          <p className="si-lockcfg-note">
            {status.readback ? `${status.readback.total} recorded visits` : 'Backend unavailable'} ·{' '}
            {status.queued ?? 0} pending · {status.dropped ?? 0} expired/discarded
          </p>
          <p className="si-lockcfg-note">
            Recognised-domain page loads, not confirmed AI use. Stored metadata remains locally for
            up to 7 days.
          </p>
          <ul className="si-lockcfg-note">
            {status.readback?.events.slice(0, 8).map((event) => (
              <li key={event.eventId}>
                {event.hostname} · {new Date(event.timestamp).toLocaleTimeString()}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="si-lockcfg">
        <button
          type="button"
          className="si-lockcfg-btn"
          aria-expanded={catalogOpen}
          onClick={() => setCatalogOpen(!catalogOpen)}
        >
          View AI catalog
        </button>
        {catalogOpen && (
          <>
            <p className="si-lockcfg-note">
              Tier 2 by default. Sanctioned and review status will be set per organisation, not
              globally.
            </p>
            <ul className="si-lockcfg-note">
              {AI_CATALOG.services.map((service) => (
                <li key={service.id}>
                  <strong>{service.name}</strong>
                  <br />
                  {service.hostnames.join(', ')}
                  {service.id === 'github-copilot' ? ' · standalone Copilot only' : ''}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <footer className="si-lockcfg-note">
        Localhost only · no production account · no store submission
      </footer>
    </div>
  );
}
