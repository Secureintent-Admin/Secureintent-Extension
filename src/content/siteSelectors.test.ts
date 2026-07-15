import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { DEFAULT_BUNDLE } from '@/lib/config';

// Deterministic selector check: load each site's captured DOM snapshot (ext/dom/)
// and assert the configured inputSelector still matches the page's composer. This
// runs in CI (unlike the live e2e suite), so selector drift fails fast here.
//
// Newly added sites are covered; the snapshot file lives in ext/dom/<file>.
const CASES: { siteKey: keyof typeof DEFAULT_BUNDLE.sites; fixture: string }[] = [
  { siteKey: 'deepseek', fixture: 'deepseek.html' },
  { siteKey: 'duck', fixture: 'duck.ai.html' },
  { siteKey: 'githubcopilot', fixture: 'github-copilot.html' },
  { siteKey: 'grok', fixture: 'grok.html' },
  { siteKey: 'kimi', fixture: 'kimi.html' },
  { siteKey: 'qwen', fixture: 'qwen.html' },
];

function loadFixture(file: string): Document {
  // vitest runs from the ext/ project root, where the dom/ snapshots live
  const html = readFileSync(resolve('dom', file), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('site composer selectors match their DOM snapshots', () => {
  for (const { siteKey, fixture } of CASES) {
    test(`${siteKey}: inputSelector finds the composer in ${fixture}`, () => {
      const selector = DEFAULT_BUNDLE.sites[siteKey].inputSelector;
      const doc = loadFixture(fixture);
      // comma selectors (e.g. reddit) just need at least one branch to match
      expect(doc.querySelector(selector)).not.toBeNull();
    });
  }
});
