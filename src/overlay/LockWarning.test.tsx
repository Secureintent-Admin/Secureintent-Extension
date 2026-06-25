import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { LockWarning } from './LockWarning';

afterEach(() => document.body.replaceChildren());

describe('LockWarning', () => {
  test('shows the initial countdown and the stay-active hint', () => {
    render(<LockWarning seconds={10} />);
    expect(screen.getByText(/10s/)).toBeTruthy();
    expect(screen.getByText(/move/i)).toBeTruthy();
  });
});
