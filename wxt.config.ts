import { defineConfig } from 'wxt';

// Open-core build target. Free build (default) ships only this repo's
// entrypoints. The private "pro" repo builds with BUILD_TARGET=pro and layers
// premium entrypoints on top of @secureintent/core. Kept here so both repos
// share one config convention.
const BUILD_TARGET = process.env.BUILD_TARGET === 'pro' ? 'pro' : 'free';
const isPro = BUILD_TARGET === 'pro';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  srcDir: 'src',
  publicDir: 'src/public',
  outDir: 'dist',
  // Rasterizes src/assets/icon.svg into all manifest icon sizes at build time.
  autoIcons: {
    baseIconPath: 'assets/icon.svg',
    sizes: [128, 96, 48, 32, 16],
  },
  manifest: {
    name: isPro ? 'SecureIntent Pro' : 'SecureIntent',
    description:
      'Warns you before pasting API keys, tokens, or secrets into AI tools and other sites. On-device — your text never leaves the browser.',
    permissions: ['storage', 'alarms'],
    // Privileged access to our Worker so the background config sync + content-script
    // telemetry fetches bypass page CORS.
    host_permissions: ['https://api.secureintent.ai/*'],
  },
});
