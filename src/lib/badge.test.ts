import { describe, expect, test } from 'vitest';
import { nextBadgeText } from './badge';

describe('nextBadgeText', () => {
  test('starts from an empty badge', () => {
    expect(nextBadgeText('', 1)).toBe('1');
    expect(nextBadgeText('', 3)).toBe('3');
  });

  test('accumulates onto an existing count', () => {
    expect(nextBadgeText('4', 2)).toBe('6');
  });

  test('treats non-numeric badge text as zero', () => {
    expect(nextBadgeText('', 0)).toBe('');
    expect(nextBadgeText('x', 2)).toBe('2');
  });

  test('hides the badge when the count is zero', () => {
    expect(nextBadgeText('', 0)).toBe('');
  });
});
