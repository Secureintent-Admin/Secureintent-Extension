// Clerk publishable key — safe to ship in the client (it is not a secret).
// Provided at build time via WXT env: set WXT_CLERK_PUBLISHABLE_KEY in ext/.env.
export const CLERK_PUBLISHABLE_KEY = import.meta.env.WXT_CLERK_PUBLISHABLE_KEY ?? '';

/** The custom Clerk JWT template that carries email + public_metadata claims. */
export const CLERK_JWT_TEMPLATE = 'secureintent';

// Sync Host: the domain the Clerk **Frontend API** runs on — NOT the app root.
// In production with a custom domain that's `https://clerk.<domain>`; the prod
// session cookie lives there, so the extension must sync from it (per Clerk's
// chrome-extension Sync Host docs). host_permissions must include this origin.
export const CLERK_SYNC_HOST =
  import.meta.env.WXT_CLERK_SYNC_HOST ?? 'https://clerk.secureintent.ai';

// The web app origin (where account.html + the sign-in UI live). Distinct from
// the Frontend API host above, so ACCOUNT_URL points at the app, not the FAPI.
export const WEB_APP_URL = import.meta.env.WXT_WEB_APP_URL ?? 'https://secureintent.ai';

/** The web account page where users sign in / manage their account + plan. */
export const ACCOUNT_URL = `${WEB_APP_URL}/account.html`;

export const isClerkConfigured = () => CLERK_PUBLISHABLE_KEY.length > 0;
