import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react", "@wxt-dev/auto-icons"],
  srcDir: "src",
  publicDir: "src/public",
  outDir: "dist",
  // Rasterizes src/assets/icon.svg into all manifest icon sizes at build time.
  autoIcons: {
    baseIconPath: "assets/icon.svg",
    sizes: [128, 96, 48, 32, 16],
  },
  manifest: {
    // Pins the extension ID (ejdhcakapnkbmfihgoamdnajgimhemof) so chrome-extension://
    // origins stay stable for Clerk allowed-origins + CLERK_AUTHORIZED_PARTIES.
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA6OipE3Igc3/YZr0H+I3aWot4xOqHvMyGHWuoyxpfIv6gISMyk2tWNjqAmSeMULt1EBgXvv44xdFPfWP8KUtbcr3tEgADXWFB0L6zI6GbFVdtm4Y3T/iXGLGQ3SN+yZQFPHQppY/NtXhM7d0LkAfXgL/pE6BySJzD1k8O/xlmRBuTjIOG538B5atOQO//YTSVDkKkJH9ZhOPqsbdyq5qc3R01szbD1oa2cBcteNpseI0Xp0X1LJLCq2ESfZKYxvzYJAaE7bQTcof4WUQL87gKN87NR2fQzIlwmYDg6n4BHDfwuUi3fNyuIlOemw9ugf+bSQYlsgqxdIT80GRW+M5eVwIDAQAB",
    name: "SecureIntent",
    description:
      "Warns you before pasting API keys, tokens, or secrets into AI tools and other sites. On-device — your text never leaves the browser.",
    // activeTab: read the current tab's URL (on popup open) to show which site
    // is being protected. No broad tabs permission needed.
    // cookies: required by @clerk/chrome-extension to read/sync the Clerk session
    // from the Sync Host (secureintent.ai) and the Frontend API domain.
    permissions: ["storage", "alarms", "activeTab", "cookies"],
    // Privileged access to our Worker so the background config sync + content-script
    // telemetry fetches bypass page CORS, plus the Clerk Frontend API for auth.
    // NOTE: add your production Clerk domain (e.g. https://clerk.secureintent.ai/*)
    // once the Clerk instance is live; *.clerk.accounts.dev covers development.
    host_permissions: [
      "https://api.secureintent.ai/*",
      // Sync Host — the web app whose Clerk session the extension mirrors.
      "https://secureintent.ai/*",
      "https://*.clerk.accounts.dev/*",
      "https://clerk.secureintent.ai/*",
    ],
  },
});
