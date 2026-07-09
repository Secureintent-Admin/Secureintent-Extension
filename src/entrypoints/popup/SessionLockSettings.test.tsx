import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { storage } from '#imports';
import { getOrCreateSalt, type KeyValueStore } from '@/lib/fingerprint';
import { hashPin } from '@/lib/lock';
import { sessionLockEnabledItem, sessionLockPinHashItem } from '@/settings';
import { SessionLockSettings } from './SessionLockSettings';

// Must match the component's store exactly so getOrCreateSalt yields the same salt.
const store: KeyValueStore = {
  get: async (k) => (await storage.getItem<string>(`local:${k}`)) ?? undefined,
  set: (k, v) => storage.setItem(`local:${k}`, v),
};

// Seed a protected, enabled lock with PIN "1234".
async function seedPin(pin = '1234') {
  const salt = await getOrCreateSalt(store);
  await sessionLockPinHashItem.setValue(await hashPin(pin, salt));
  await sessionLockEnabledItem.setValue(true);
}

// Type a PIN digit-by-digit into a segmented PinBoxes group.
function enterPin(prefix: string, pin: string) {
  for (let i = 0; i < pin.length; i++) {
    fireEvent.change(screen.getByLabelText(`${prefix} ${i + 1}`), { target: { value: pin[i] } });
  }
}

beforeEach(() => fakeBrowser.reset());
afterEach(() => cleanup());

describe('SessionLockSettings — PIN-gated disable', () => {
  test('turning the lock off requires the PIN; stays enabled until verified', async () => {
    await seedPin();
    render(<SessionLockSettings />);
    const toggle = await screen.findByRole('switch');
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));

    fireEvent.click(toggle); // request disable
    await screen.findByLabelText('Current PIN digit 1');

    // wrong PIN → still enabled, error shown
    enterPin('Current PIN digit', '9999');
    await screen.findByText(/Incorrect PIN/);
    expect(await sessionLockEnabledItem.getValue()).toBe(true);

    // correct PIN → auto-submits and disables
    enterPin('Current PIN digit', '1234');
    await waitFor(async () => expect(await sessionLockEnabledItem.getValue()).toBe(false));
  });

  test('Remove PIN requires the PIN before clearing', async () => {
    await seedPin();
    render(<SessionLockSettings />);
    fireEvent.click(await screen.findByText('Remove PIN'));
    await screen.findByLabelText('Current PIN digit 1');

    enterPin('Current PIN digit', '0000');
    await screen.findByText(/Incorrect PIN/);
    expect(await sessionLockPinHashItem.getValue()).not.toBeNull();

    enterPin('Current PIN digit', '1234');
    await waitFor(async () => expect(await sessionLockPinHashItem.getValue()).toBeNull());
  });

  test('Change PIN requires the current PIN before showing the new-PIN form', async () => {
    await seedPin();
    render(<SessionLockSettings />);
    fireEvent.click(await screen.findByText('Change PIN'));

    enterPin('Current PIN digit', '1234');
    await screen.findByLabelText('New PIN digit 1'); // gate passed → set-new-PIN form
  });

  test('collapses the body when disabled with a PIN saved', async () => {
    const salt = await getOrCreateSalt(store);
    await sessionLockPinHashItem.setValue(await hashPin('1234', salt));
    await sessionLockEnabledItem.setValue(false);

    const { container } = render(<SessionLockSettings />);
    await screen.findByText('Session Lock');
    // Body is collapsed (no is-open) when the lock is off.
    await waitFor(() => {
      const body = container.querySelector('.si-lockcfg-body');
      expect(body?.classList.contains('is-open')).toBe(false);
    });
  });

  test('expands the body when enabled with a PIN saved', async () => {
    await seedPin(); // enabled + PIN
    const { container } = render(<SessionLockSettings />);
    await waitFor(() => {
      const body = container.querySelector('.si-lockcfg-body');
      expect(body?.classList.contains('is-open')).toBe(true);
    });
  });

  test('enabling (off → on) does not require the PIN', async () => {
    const salt = await getOrCreateSalt(store);
    await sessionLockPinHashItem.setValue(await hashPin('1234', salt));
    await sessionLockEnabledItem.setValue(false); // has PIN but currently off

    render(<SessionLockSettings />);
    const toggle = await screen.findByRole('switch');
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'));

    fireEvent.click(toggle); // enable — no gate
    await waitFor(async () => expect(await sessionLockEnabledItem.getValue()).toBe(true));
    expect(screen.queryByLabelText('Current PIN digit 1')).toBeNull();
  });
});
