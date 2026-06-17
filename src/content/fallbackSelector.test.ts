import { describe, expect, test } from 'vitest';
import { DEFAULT_BUNDLE } from '@/lib/config';
import { findComposer } from './findComposer';

const SELECTOR = DEFAULT_BUNDLE.sites.fallback.inputSelector;

// Build an element from an HTML string and check whether the fallback selector
// (matched via findComposer, the same path-walk the guard uses) treats it as a
// text-entry target.
function matches(html: string): boolean {
  const host = document.createElement('div');
  host.innerHTML = html;
  const el = host.firstElementChild as HTMLElement;
  return findComposer([el, document], SELECTOR) !== null;
}

describe('fallback selector', () => {
  test.each([
    ['<textarea></textarea>'],
    ['<input>'], // no type → defaults to text
    ['<input type="text">'],
    ['<input type="search">'],
    ['<input type="url">'],
    ['<input type="email">'],
    ['<input type="tel">'],
    ['<input type="password">'],
    ['<div contenteditable="true"></div>'],
    ['<div contenteditable=""></div>'], // empty value is editable per spec
    ['<div role="textbox"></div>'],
  ])('matches common text-entry element: %s', (html) => {
    expect(matches(html)).toBe(true);
  });

  test.each([
    ['<div></div>'],
    ['<button>click</button>'],
    ['<input type="checkbox">'],
    ['<input type="radio">'],
    ['<input type="hidden">'],
    ['<input type="number">'],
    ['<div contenteditable="false"></div>'],
    ['<span>text</span>'],
  ])('ignores non-text element: %s', (html) => {
    expect(matches(html)).toBe(false);
  });
});
