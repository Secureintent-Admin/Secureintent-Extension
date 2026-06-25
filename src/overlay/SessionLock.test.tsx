import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { SessionLock } from './SessionLock';

afterEach(() => document.body.replaceChildren());

const boxes = () => screen.getAllByLabelText(/pin digit/i) as HTMLInputElement[];
const enter = (pin: string) => {
  pin.split('').forEach((d, i) => {
    fireEvent.change(boxes()[i], { target: { value: d } });
  });
};

describe('SessionLock', () => {
  test('renders four PIN digit boxes', () => {
    render(<SessionLock onUnlock={() => true} />);
    expect(boxes()).toHaveLength(4);
  });

  test('auto-submits the joined PIN once four digits are entered', async () => {
    const onUnlock = vi.fn().mockResolvedValue(true);
    render(<SessionLock onUnlock={onUnlock} />);
    enter('1234');
    await vi.waitFor(() => expect(onUnlock).toHaveBeenCalledWith('1234'));
    expect(screen.queryByText(/incorrect/i)).toBeNull();
  });

  test('a wrong PIN shows an error and clears the boxes', async () => {
    const onUnlock = vi.fn().mockResolvedValue(false);
    render(<SessionLock onUnlock={onUnlock} />);
    enter('0000');
    expect(await screen.findByText(/incorrect/i)).toBeTruthy();
    for (const b of boxes()) expect(b.value).toBe('');
  });

  test('digits are masked (not shown as plain text)', () => {
    render(<SessionLock onUnlock={() => true} />);
    expect(boxes()[0].type).toBe('password');
  });
});
