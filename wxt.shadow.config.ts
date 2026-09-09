import { defineConfig } from 'wxt';

// Deliberately separate from wxt.config.ts: no live key, Clerk, API or store identity.
// The discovery harness shares the existing logo/styles and reusable feature code.
export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  srcDir: 'src',
  entrypointsDir: 'testing/entrypoints',
  publicDir: 'src/testing/public',
  outDir: 'dist-shadow',
  outDirTemplate: '{{browser}}-mv{{manifestVersion}}',
  autoIcons: { baseIconPath: 'assets/icon.svg', sizes: [128, 96, 48, 32, 16] },
  vite: () => ({ build: { modulePreload: false } }),
  manifest: ({ browser }) => ({
    name: 'SecureIntent — LOCAL Discovery Test',
    description:
      'Local-only catalog and visit test harness. Synthetic Business seats. Not a production protection build.',
    permissions: ['storage', 'alarms'],
    host_permissions: ['http://127.0.0.1/*'],
    content_security_policy:
      browser === 'firefox'
        ? "script-src 'self'; object-src 'self'; connect-src http://127.0.0.1:8791"
        : {
            extension_pages:
              "script-src 'self'; object-src 'self'; connect-src http://127.0.0.1:8791",
          },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'shadow-local-test@secureintent.ai',
              strict_min_version: '115.0',
              data_collection_permissions: { required: ['none'], optional: ['websiteActivity'] },
            },
          },
        }
      : { minimum_chrome_version: '109' }),
  }),
});
