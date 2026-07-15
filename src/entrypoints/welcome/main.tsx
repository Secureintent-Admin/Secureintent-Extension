import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Logo } from '@/components/Logo';
import { acceptTerms, isConsentAccepted, PRIVACY_URL, TOS_URL } from '@/lib/consent';
import './style.css';

function HeroShield() {
  return (
    <svg viewBox="0 0 48 48" width="46" height="46" fill="none" aria-hidden="true">
      <path
        d="M24 5l14 6v11c0 8.7-5.9 14.9-14 17.6C15.9 36.9 10 30.7 10 22V11l14-6z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M17.5 24l4.5 4.5 9-9.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
      <path
        d="M5 12h13M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Welcome() {
  const [accepted, setAccepted] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    isConsentAccepted().then(setAccepted);
  }, []);

  const agree = async () => {
    await acceptTerms();
    setAccepted(true);
  };

  return (
    <main className="w-shell">
      <div className="w-ambient" aria-hidden="true" />
      <header className="w-brand">
        <Logo size={26} />
        <span className="w-word">
          SecureIntent<span className="w-accent">.ai</span>
        </span>
      </header>

      {accepted ? (
        <section className="w-card w-enter">
          <div className="w-hero w-hero--ok">
            <HeroShield />
          </div>
          <h1 className="w-title">You're protected</h1>
          <p className="w-sub">Paste as usual — we step in only when a secret is detected.</p>
          <button type="button" className="w-cta w-cta--ghost" onClick={() => window.close()}>
            Close tab
          </button>
        </section>
      ) : (
        <section className="w-card w-enter">
          <div className="w-hero">
            <HeroShield />
          </div>

          <h1 className="w-title">Catch secrets before you paste</h1>
          <p className="w-sub">On-device protection for API keys, tokens, and passwords.</p>

          <label className="w-consent">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <span className="w-consent-box" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
                <path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="w-consent-text">
              I agree to the{' '}
              <a href={TOS_URL} target="_blank" rel="noreferrer">
                Terms
              </a>{' '}
              and{' '}
              <a href={PRIVACY_URL} target="_blank" rel="noreferrer">
                Privacy Policy
              </a>
            </span>
          </label>

          <button type="button" className="w-cta" onClick={agree} disabled={!checked}>
            Activate protection
            <ArrowIcon />
          </button>

          <div className="w-trust">
            <span>On-device</span>
            <i />
            <span>Zero retention</span>
          </div>
        </section>
      )}
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Welcome />);
