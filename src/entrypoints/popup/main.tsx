import { ClerkProvider } from '@clerk/chrome-extension';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { browser } from '#imports';
import { CLERK_PUBLISHABLE_KEY, CLERK_SYNC_HOST, isClerkConfigured } from '@/lib/clerkConfig';
import App from './App.tsx';
import './style.css';

const POPUP_URL = browser.runtime.getURL('/popup.html');
const root = ReactDOM.createRoot(document.getElementById('root')!);

// Without a publishable key (dev before Clerk is set up) render the app without
// auth so the rest of the popup still works.
if (isClerkConfigured()) {
  root.render(
    <React.StrictMode>
      <ClerkProvider
        publishableKey={CLERK_PUBLISHABLE_KEY}
        syncHost={CLERK_SYNC_HOST}
        afterSignOutUrl={POPUP_URL}
        signInFallbackRedirectUrl={POPUP_URL}
        signUpFallbackRedirectUrl={POPUP_URL}
      >
        <App />
      </ClerkProvider>
    </React.StrictMode>,
  );
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
