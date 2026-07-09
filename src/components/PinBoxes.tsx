import { useRef } from 'react';

export interface PinBoxesProps {
  value: string;
  onChange: (pin: string) => void;
  /** Fired once all boxes are filled (e.g. to auto-submit). */
  onComplete?: (pin: string) => void;
  length?: number;
  error?: boolean;
  autoFocus?: boolean;
  /** Accessible label prefix; boxes become "<prefix> 1", "<prefix> 2", … */
  ariaLabel?: string;
}

/**
 * Segmented numeric PIN input: one box per digit, with auto-advance, backspace
 * to the previous box, and paste-to-fill. Controlled via `value` (the joined
 * digits). Mirrors the lock overlay's PIN entry for a consistent look.
 */
export function PinBoxes({
  value,
  onChange,
  onComplete,
  length = 4,
  error = false,
  autoFocus = false,
  ariaLabel = 'PIN digit',
}: PinBoxesProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  const emit = (next: string[]) => {
    const pin = next.join('');
    onChange(pin);
    if (next.every(Boolean)) onComplete?.(pin);
  };

  const setAt = (i: number, raw: string) => {
    const d = raw.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = d;
    emit(next);
    if (d && i < length - 1) refs.current[i + 1]?.focus();
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!text) return;
    e.preventDefault();
    emit(Array.from({ length }, (_, k) => text[k] ?? ''));
    refs.current[Math.min(text.length, length - 1)]?.focus();
  };

  return (
    <div className={`si-pinrow ${error ? 'is-error' : ''}`}>
      {digits.map((d, i) => (
        <input
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length positional inputs
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="si-pinbox"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={1}
          aria-label={`${ariaLabel} ${i + 1}`}
          // biome-ignore lint/a11y/noAutofocus: focus the first box for fast entry
          autoFocus={autoFocus && i === 0}
          value={d}
          onChange={(e) => setAt(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
        />
      ))}
    </div>
  );
}
