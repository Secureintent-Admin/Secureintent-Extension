import { describe, expect, test } from 'vitest';
import { card, entropy, luhn, validateMatch } from './validators';

describe('luhn', () => {
  test('accepts a valid checksum', () => {
    expect(luhn('4111111111111111')).toBe(true);
  });
  test('rejects an invalid checksum', () => {
    expect(luhn('4111111111111112')).toBe(false);
  });
});

describe('card', () => {
  test('accepts real card numbers across networks', () => {
    expect(card('4111 1111 1111 1111')).toBe(true); // Visa
    expect(card('5555-5555-5555-4444')).toBe(true); // Mastercard
    expect(card('378282246310005')).toBe(true); // Amex (15)
    expect(card('6011111111111117')).toBe(true); // Discover
  });
  test('rejects a number that fails Luhn', () => {
    expect(card('4111 1111 1111 1112')).toBe(false);
  });
  test('rejects an unknown network prefix', () => {
    expect(card('1234567812345670')).toBe(false);
  });
  test('rejects a 13-digit epoch-ms timestamp', () => {
    expect(card('1700000000000')).toBe(false);
  });
  test('rejects digit runs outside 13–19 length', () => {
    expect(card('41111111111')).toBe(false); // 11
    expect(card('4111111111111111111111')).toBe(false); // 22
  });
});

describe('entropy', () => {
  test('accepts a high-entropy hash / random string', () => {
    expect(entropy('d41d8cd98f00b204e9800998ecf8427e3bbce4dbca09a9e3aeb5c55a40a5a51a')).toBe(true);
    expect(entropy('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')).toBe(true);
  });
  test('rejects a low-entropy repetitive run', () => {
    expect(entropy('a'.repeat(40))).toBe(false);
    expect(entropy('12121212121212121212121212121212')).toBe(false);
  });
});

describe('validateMatch', () => {
  test('passes through when no validator is named', () => {
    expect(validateMatch(undefined, 'anything')).toBe(true);
  });
  test('fails open on an unknown validator name', () => {
    expect(validateMatch('nope', 'anything')).toBe(true);
  });
  test('applies the named validator', () => {
    expect(validateMatch('card', '4111111111111111')).toBe(true);
    expect(validateMatch('card', '1700000000000')).toBe(false);
  });
});
