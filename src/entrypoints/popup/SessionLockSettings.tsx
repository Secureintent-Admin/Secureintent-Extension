import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { storage } from '#imports';
import { PinBoxes } from '@/components/PinBoxes';
import { getOrCreateSalt, type KeyValueStore } from '@/lib/fingerprint';
import { hashPin, verifyPin } from '@/lib/lock';
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

/** A protected action that requires the current PIN before it runs. */
type GatedAction = 'disable' | 'remove' | 'change';

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

  // Current-PIN verification gate for the protected actions.
  const [gate, setGate] = useState<GatedAction | null>(null);
  const [gatePin, setGatePin] = useState('');
  const [gateAttempt, setGateAttempt] = useState(0); // bump to reset + refocus the boxes

  const [loaded, setLoaded] = useState(false); // storage values resolved
  const [animate, setAnimate] = useState(false); // enable collapse transition (after settle)

  useEffect(() => {
    // Load all values at once so the body opens/collapses in a single paint
    // (no tall-then-short flash on popup open).
    Promise.all([
      sessionLockEnabledItem.getValue(),
      sessionLockPinHashItem.getValue(),
      sessionLockTimeoutItem.getValue(),
    ]).then(([e, h, ms]) => {
      setEnabled(e);
      setHasPin(Boolean(h));
      setTimeoutMin(Math.round(ms / MIN));
      setLoaded(true);
      // Turn the open/close animation on a couple of frames later, so the
      // initial state lands instantly without animating.
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)));
    });
  }, []);

  const showForm = !hasPin || changing;
  // Collapse the body when the lock is dormant (a PIN exists but it's switched
  // off). Setup, the verify gate, and the enabled state all keep it open.
  // Stay collapsed until loaded so we never flash the expanded setup form.
  const open = loaded && (enabled || !hasPin || changing || gate !== null);

  // Animate via measured max-height (reliable in both directions, unlike the
  // grid 0fr→1fr trick which can stall on expand). Re-measured on every content
  // change so growth (errors, form swaps) stays smooth.
  const bodyRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure on any content change
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el) el.style.maxHeight = open ? `${el.scrollHeight}px` : '0px';
  }, [open, gate, showForm, hasPin, enabled, error, changing, timeoutMin]);

  const resetForm = () => {
    setPin('');
    setConfirm('');
    setError(null);
  };
  const closeGate = () => {
    setGate(null);
    setGatePin('');
    setError(null);
  };

  // Verify the entered PIN, then run the pending protected action.
  const confirmGate = async (entered: string) => {
    const hash = await sessionLockPinHashItem.getValue();
    const salt = await getOrCreateSalt(store);
    if (!hash || !(await verifyPin(entered, salt, hash))) {
      setError('Incorrect PIN');
      setGatePin('');
      setGateAttempt((n) => n + 1); // reset + refocus the boxes
      return;
    }
    const action = gate;
    closeGate();
    if (action === 'disable') {
      setEnabled(false);
      toggleRef.current?.focus(); // body collapses (inert) — return focus to the toggle
      await sessionLockEnabledItem.setValue(false);
    } else if (action === 'remove') {
      await clearSessionLockPin();
      setHasPin(false);
      setEnabled(false);
      resetForm();
    } else if (action === 'change') {
      setChanging(true); // open the set-new-PIN form
    }
  };

  // Enabling is free; turning OFF must be authorized with the PIN.
  const toggle = async () => {
    if (enabled) {
      setGate('disable');
      return;
    }
    setEnabled(true);
    await sessionLockEnabledItem.setValue(true);
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
    resetForm();
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
          ref={toggleRef}
          type="button"
          role="switch"
          aria-checked={enabled}
          className={`si-toggle ${enabled ? 'is-on' : ''}`}
          onClick={toggle}
          disabled={!hasPin || gate !== null}
          title={hasPin ? 'Enable / disable' : 'Set a PIN first'}
        >
          <span className="si-toggle-dot" />
        </button>
      </div>

      <div
        ref={bodyRef}
        className={`si-lockcfg-body ${animate ? 'is-anim' : ''} ${open ? 'is-open' : ''}`}
      >
        <div className="si-lockcfg-body-inner" inert={!open}>
          {!gate && <p className="si-lockcfg-hint">Locks cloud consoles after inactivity.</p>}

          {gate ? (
            <>
              <div className="si-lockcfg-row">
                <PinBoxes
                  key={gateAttempt}
                  value={gatePin}
                  onChange={(p) => {
                    setGatePin(p);
                    setError(null);
                  }}
                  onComplete={confirmGate}
                  error={Boolean(error)}
                  autoFocus
                  ariaLabel="Current PIN digit"
                />
                <button type="button" className="si-lockcfg-link" onClick={closeGate}>
                  Cancel
                </button>
              </div>
              {error && (
                <p className="si-lockcfg-note is-error">{error} · forgot it? Reinstall to reset.</p>
              )}
            </>
          ) : showForm ? (
            <>
              <div className="si-lockcfg-field">
                <span className="si-lockcfg-fieldlabel">New PIN</span>
                <PinBoxes
                  value={pin}
                  onChange={(p) => {
                    setPin(p);
                    setError(null);
                  }}
                  autoFocus
                  ariaLabel="New PIN digit"
                />
              </div>
              <div className="si-lockcfg-field">
                <span className="si-lockcfg-fieldlabel">Confirm</span>
                <PinBoxes
                  value={confirm}
                  onChange={(p) => {
                    setConfirm(p);
                    setError(null);
                  }}
                  ariaLabel="Confirm PIN digit"
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
                      resetForm();
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
              <p className="si-lockcfg-note is-set">
                ● Protected · locks after {timeoutMin} min idle
              </p>
              <div className="si-lockcfg-row">
                <button type="button" className="si-lockcfg-btn" onClick={() => setGate('change')}>
                  Change PIN
                </button>
                <button
                  type="button"
                  className="si-lockcfg-btn is-danger"
                  onClick={() => setGate('remove')}
                >
                  Remove PIN
                </button>
              </div>
            </>
          )}

          <div className="si-lockcfg-row">
            <span className="si-lockcfg-rowlabel">Lock after</span>
            <fieldset className="si-seg" aria-label="Lock after">
              {[1, 5, 15].map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`si-seg-btn ${timeoutMin === m ? 'is-on' : ''}`}
                  aria-pressed={timeoutMin === m}
                  onClick={() => changeTimeout(m)}
                >
                  {m}m
                </button>
              ))}
            </fieldset>
          </div>
        </div>
      </div>
    </section>
  );
}
