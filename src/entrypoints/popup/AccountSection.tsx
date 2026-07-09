import { Show, useUser } from '@clerk/chrome-extension';
import { useEffect, useState } from 'react';
import { browser } from '#imports';
import { ACCOUNT_URL, isClerkConfigured } from '@/lib/clerkConfig';
import { type ActiveEntitlement, FREE_ENTITLEMENT, getActiveEntitlement } from '@/lib/entitlement';

const PLAN_LABEL: Record<ActiveEntitlement['plan'], string> = {
  developer: 'Free',
  developer_pro: 'Developer Pro',
  business_pro: 'Business Pro',
};

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Opens the web account page where all sign-in / profile / billing lives. Signing
 * in there syncs the Clerk session back into the extension (ClerkProvider syncHost).
 */
function openAccountTab() {
  browser.tabs.create({ url: ACCOUNT_URL }).catch(() => {});
}

/**
 * Reads + keeps the active entitlement fresh (refreshing from the Worker on
 * sign-in). `loading` stays true until the first read resolves, so the UI can
 * show a neutral placeholder instead of flashing "Free" before Pro loads.
 */
function useEntitlement(signedIn: boolean): { ent: ActiveEntitlement; loading: boolean } {
  const [ent, setEnt] = useState<ActiveEntitlement>(FREE_ENTITLEMENT);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getActiveEntitlement().then((e) => {
        if (!cancelled) {
          setEnt(e);
          setLoading(false);
        }
      });
    if (signedIn) {
      browser.runtime.sendMessage({ type: 'si-refresh-entitlement' }).then(load).catch(load);
    } else {
      load();
    }
    return () => {
      cancelled = true;
    };
  }, [signedIn]);
  return { ent, loading };
}

function SignedInBar() {
  const { user } = useUser();
  const { ent, loading } = useEntitlement(true);
  const isFree = ent.plan === 'developer';

  const email = user?.primaryEmailAddress?.emailAddress ?? user?.fullName ?? 'Signed in';
  const initial = (email[0] ?? '?').toUpperCase();

  return (
    <button
      type="button"
      className="si-profile"
      onClick={openAccountTab}
      title="Manage your account"
    >
      {user?.imageUrl ? (
        <img className="si-profile-avatar" src={user.imageUrl} alt={email} />
      ) : (
        <span className="si-profile-avatar si-profile-avatar--fallback">{initial}</span>
      )}
      <span className="si-profile-lines">
        <span className="si-profile-email" title={email}>
          {email}
        </span>
        {loading ? (
          <span className="si-profile-plan si-profile-plan--loading" aria-hidden="true" />
        ) : (
          <span className={`si-profile-plan${isFree ? '' : ' is-pro'}`}>
            {PLAN_LABEL[ent.plan]}
          </span>
        )}
      </span>
      <span className="si-profile-go" aria-hidden="true">
        <ChevronIcon />
      </span>
    </button>
  );
}

function SignedOutBar() {
  return (
    <button
      type="button"
      className="si-profile si-profile--out"
      onClick={openAccountTab}
      title="Sign in"
    >
      <span className="si-profile-avatar si-profile-avatar--empty" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
          <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M5 19.5a7 7 0 0 1 14 0"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="si-profile-lines">
        <span className="si-profile-email">Not signed in</span>
        <span className="si-profile-plan">Sign in to unlock Pro</span>
      </span>
      <span className="si-profile-go" aria-hidden="true">
        <ChevronIcon />
      </span>
    </button>
  );
}

export function AccountSection() {
  if (!isClerkConfigured()) return null; // auth not set up yet
  return (
    <div className="si-profile-wrap">
      <Show when="signed-in">
        <SignedInBar />
      </Show>
      <Show when="signed-out">
        <SignedOutBar />
      </Show>
    </div>
  );
}
