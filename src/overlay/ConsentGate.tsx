import { Logo } from '@/components/Logo';
import { PRIVACY_URL, TOS_URL } from '@/lib/consent';

export interface ConsentGateProps {
  /** Accept the current Terms & Privacy. */
  onAgree: () => void;
  /** Dismiss without accepting — the paste stays blocked. */
  onCancel: () => void;
}

/**
 * Blocking consent gate shown on the first paste that would trigger a warning,
 * before the extension protects anything. Same closed-shadow overlay chrome as
 * the paste warning.
 */
export function ConsentGate({ onAgree, onCancel }: ConsentGateProps) {
  return (
    <div className="si-scrim">
      <div
        className="si-hud si-consent"
        role="alertdialog"
        aria-modal="true"
        aria-label="Accept the Terms of Service and Privacy Policy to enable SecureIntent"
      >
        <div className="si-top">
          <span className="si-brand">
            <Logo size={22} />
            <span className="si-wordmark">
              SecureIntent<span className="si-ai">.ai</span>
            </span>
          </span>
        </div>

        <div className="si-rule" />

        <div className="si-consent-body">
          <h1 className="si-consent-title">One quick step before we protect your pastes</h1>
          <p className="si-consent-text">
            SecureIntent analyzes pasted text <strong>on your device</strong> — your text never
            leaves the browser. To enable protection, please agree to our terms.
          </p>
          <p className="si-consent-links">
            <a href={TOS_URL} target="_blank" rel="noreferrer">
              Terms of Service
            </a>
            <span aria-hidden="true"> · </span>
            <a href={PRIVACY_URL} target="_blank" rel="noreferrer">
              Privacy Policy
            </a>
          </p>
        </div>

        <div className="si-actions">
          <button type="button" className="si-btn si-btn-ghost" onClick={onCancel}>
            Not now
          </button>
          <button type="button" className="si-btn si-btn-mint" onClick={onAgree}>
            I Agree &amp; Enable Protection
          </button>
        </div>
      </div>
    </div>
  );
}
