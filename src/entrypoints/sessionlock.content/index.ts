import { defineContentScript } from '#imports';
import '@/overlay/overlay.css';
import { createSessionLock } from '@/content/createSessionLock';

export default defineContentScript({
  matches: [
    // AWS
    '*://console.aws.amazon.com/*',
    '*://*.console.aws.amazon.com/*',
    '*://signin.aws.amazon.com/*',
    // Google Cloud / Firebase
    '*://console.cloud.google.com/*',
    '*://console.firebase.google.com/*',
    // Azure
    '*://portal.azure.com/*',
    // Other cloud / infra consoles (scoped to dashboard subdomains)
    '*://dash.cloudflare.com/*',
    '*://cloud.digitalocean.com/*',
    '*://dashboard.heroku.com/*',
    '*://app.netlify.com/*',
    '*://dashboard.render.com/*',
    '*://cloud.linode.com/*',
    '*://cloud.oracle.com/*',
    '*://cloud.ibm.com/*',
    '*://supabase.com/dashboard/*',
  ],
  cssInjectionMode: 'ui',
  runAt: 'document_idle',
  async main(ctx) {
    await createSessionLock(ctx);
  },
});
