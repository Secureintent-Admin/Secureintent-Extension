// One-time warm-up for the live e2e suite (pnpm e2e:login).
//
// Opens every supported site in a HEADED persistent profile (./.auth/profile) with
// the extension loaded. Clear each site's wall once — log in where required, and
// pass any "verify you're human" / Cloudflare challenge. Both the login cookies AND
// the anti-bot clearance persist in the profile, so the headless `pnpm e2e:live` run
// reuses them. Press Enter here when done to save and exit.
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const dir = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(dir, '../dist/chrome-mv3');
const PROFILE = path.resolve(dir, '../.auth/profile');

const SITES = [
  'https://chatgpt.com/',
  'https://claude.ai/',
  'https://gemini.google.com/',
  'https://www.perplexity.ai/',
  'https://copilot.microsoft.com/',
  'https://grok.com/',
  'https://chat.mistral.ai/',
  'https://meta.ai/',
  'https://poe.com/',
  'https://v0.app/',
  'https://bolt.new/',
  'https://lovable.dev/',
  'https://replit.com/',
  'https://www.reddit.com/submit',
  'https://chat.deepseek.com/',
  'https://duck.ai/',
  'https://github.com/copilot',
  'https://kimi.com/',
  'https://chat.qwen.ai/',
];

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  channel: 'chromium',
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--disable-blink-features=AutomationControlled',
  ],
});

for (const url of SITES) {
  const page = await ctx.newPage();
  await page.goto(url).catch(() => {});
}

console.log(`\nProfile: ${PROFILE}`);
console.log('\n>>> Log in / clear each tab, then press Enter here to save and close.\n');

await new Promise((res) => {
  const rl = readline.createInterface({ input: process.stdin });
  rl.question('', () => {
    rl.close();
    res();
  });
});

await ctx.close();
