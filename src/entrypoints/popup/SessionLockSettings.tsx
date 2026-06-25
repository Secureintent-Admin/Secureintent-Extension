import { useEffect, useState } from 'react';
import { storage } from '#imports';
import { getOrCreateSalt, type KeyValueStore } from '@/lib/fingerprint';
import { hashPin } from '@/lib/lock';
import {
  clearSessionLockPin,
  sessionLockEnabledItem,
  sessionLockPinHashItem,
  sessionLockTimeoutItem,
  setSessionLockPin,
} from '@/settings';

const store: KeyValueStore = {
  get: async (k) => (await storage.getItem<string>(`local:${k}`)) ?? undefined,
  set: (k, v) => storage.setItem(`local:${k}`, v),
};
const MIN = 60_000;
const PIN_LEN = 4;
const onlyDigits = (s: string) => s.replace(/\D/g, '').slice(0, PIN_LEN);

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="15" height="15">
      <rect
        x="4.5"
        y="10.5"
        width="15"
        height="10"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8 10.5V7.5a4 4 0 0 1 8 0v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SessionLockSettings() {
  const [enabled, setEnabled] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [timeoutMin, setTimeoutMin] = useState(5);

  const [changing, setChanging] = useState(false);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sessionLockEnabledItem.getValue().then(setEnabled);
    sessionLockPinHashItem.getValue().then((h) => setHasPin(Boolean(h)));
    sessionLockTimeoutItem.getValue().then((ms) => setTimeoutMin(Math.round(ms / MIN)));
  }, []);

  const showForm = !hasPin || changing;

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    await sessionLockEnabledItem.setValue(next);
  };

  const save = async () => {
    if (pin.length !== PIN_LEN) {
      setError('Enter a 4-digit PIN');
      return;
    }
    if (pin !== confirm) {
      setError("PINs don't match");
      return;
    }
    const salt = await getOrCreateSalt(store);
    await setSessionLockPin(await hashPin(pin, salt)); // also auto-enables
    setHasPin(true);
    setEnabled(true);
    setChanging(false);
    setPin('');
    setConfirm('');
    setError(null);
  };

  const remove = async () => {
    await clearSessionLockPin();
    setHasPin(false);
    setEnabled(false);
    setChanging(false);
    setPin('');
    setConfirm('');
    setError(null);
  };

  const changeTimeout = async (min: number) => {
    setTimeoutMin(min);
    await sessionLockTimeoutItem.setValue(min * MIN);
  };

  return (
    <section className="si-lockcfg">
      <div className="si-lockcfg-head">
        <span className="si-lockcfg-title">
          <LockIcon />
          Session Lock
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          className={`si-toggle ${enabled ? 'is-on' : ''}`}
          onClick={toggle}
          disabled={!hasPin}
          title={hasPin ? 'Enable / disable' : 'Set a PIN first'}
        >
          <span className="si-toggle-dot" />
        </button>
      </div>

      <p className="si-lockcfg-hint">
        PIN-locks cloud consoles (AWS, GCP, Azure, Cloudflare &amp; more) after inactivity.
      </p>

      {showForm ? (
        <>
          <div className="si-lockcfg-row">
            <input
              className="si-lockcfg-pin"
              type="password"
              inputMode="numeric"
              maxLength={PIN_LEN}
              placeholder="4-digit PIN"
              aria-label="New PIN"
              value={pin}
              onChange={(e) => {
                setPin(onlyDigits(e.target.value));
                setError(null);
              }}
            />
            <input
              className="si-lockcfg-pin"
              type="password"
              inputMode="numeric"
              maxLength={PIN_LEN}
              placeholder="Confirm"
              aria-label="Confirm PIN"
              value={confirm}
              onChange={(e) => {
                setConfirm(onlyDigits(e.target.value));
                setError(null);
              }}
            />
          </div>
          <div className="si-lockcfg-row">
            <button
              type="button"
              className="si-lockcfg-save"
              onClick={save}
              disabled={pin.length !== PIN_LEN || confirm.length !== PIN_LEN}
            >
              Save PIN
            </button>
            {changing && (
              <button
                type="button"
                className="si-lockcfg-btn"
                onClick={() => {
                  setChanging(false);
                  setPin('');
                  setConfirm('');
                  setError(null);
                }}
              >
                Cancel
              </button>
            )}
          </div>
          {error && <p className="si-lockcfg-note is-error">{error}</p>}
        </>
      ) : (
        <>
          <p className="si-lockcfg-note is-set">● Protected · locks after {timeoutMin} min idle</p>
          <div className="si-lockcfg-row">
            <button type="button" className="si-lockcfg-btn" onClick={() => setChanging(true)}>
              Change PIN
            </button>
            <button type="button" className="si-lockcfg-btn is-danger" onClick={remove}>
              Remove PIN
            </button>
          </div>
        </>
      )}

      <div className="si-lockcfg-row">
        <span className="si-lockcfg-rowlabel">Lock after</span>
        <select
          className="si-lockcfg-select"
          aria-label="Lock after"
          value={timeoutMin}
          onChange={(e) => changeTimeout(Number(e.target.value))}
        >
          <option value={1}>1 min</option>
          <option value={5}>5 min</option>
          <option value={15}>15 min</option>
        </select>
      </div>
    </section>
  );
}
