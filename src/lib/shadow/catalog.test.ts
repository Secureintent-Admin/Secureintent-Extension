import { describe, expect, it } from 'vitest';
import {
  AI_CATALOG,
  catalogMatchPatterns,
  classifyService,
  findAiService,
  normalizeHostname,
  recognizeAiPage,
} from './catalog';

describe('AI domain catalog', () => {
  it('contains 18 unique services and explicit, unique hostnames', () => {
    expect(AI_CATALOG.services).toHaveLength(18);
    expect(new Set(AI_CATALOG.services.map((s) => s.id)).size).toBe(18);
    const hosts = AI_CATALOG.services.flatMap((s) => s.hostnames);
    expect(new Set(hosts).size).toBe(hosts.length);
    for (const host of hosts) expect(normalizeHostname(host)).toBe(host);
  });
  it.each(AI_CATALOG.services)('recognises $name', (service) => {
    for (const hostname of service.hostnames) {
      expect(findAiService(hostname.toUpperCase() + '.')).toEqual(service);
    }
  });
  it.each([
    'chatgpt.com.evil.test',
    'evilchatgpt.com',
    'docs.claude.ai',
    'github.io',
    'https://chatgpt.com/chat?id=secret',
    'chatgpt.com:443',
    ' chatgpt.com',
    'user@chatgpt.com',
    'chatgpt..com',
    '-chatgpt.com',
  ])('rejects %s', (host) => {
    expect(findAiService(host)).toBeUndefined();
  });
  it('recognises GitHub Copilot locally without counting ordinary GitHub', () => {
    for (const path of ['/', '/openai/project', '/features/copilot', '/copilot-fake']) {
      expect(recognizeAiPage('github.com', path)).toBeUndefined();
    }
    for (const path of ['/copilot', '/copilot/c/private-chat']) {
      expect(recognizeAiPage('github.com', path)?.id).toBe('github-copilot');
    }
  });
  it('uses per-organisation sanction and review decisions, not provider stereotypes', () => {
    const policy = { sanctionedServiceIds: ['claude'], reviewServiceIds: ['chatgpt'] };
    expect(classifyService('claude', policy)).toBe(1);
    expect(classifyService('chatgpt', policy)).toBe(3);
    expect(classifyService('deepseek', policy)).toBe(2);
    expect(classifyService('claude', { sanctionedServiceIds: [], reviewServiceIds: [] })).toBe(2);
  });
  it('does not request all-sites, wildcard subdomains, or ordinary GitHub access', () => {
    const patterns = catalogMatchPatterns();
    expect(
      patterns.every(
        (p) => !p.includes('<all_urls>') && !p.includes('://*.') && !p.includes('://*'),
      ),
    ).toBe(true);
    expect(patterns).not.toContain('https://github.com/*');
  });
});
