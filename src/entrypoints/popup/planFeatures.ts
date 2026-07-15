import type { QuotaStatus } from '@/lib/quota';

/** Visual state of a feature row in the "Your plan" checklist. */
export type FeatureState = 'active' | 'usage' | 'locked' | 'upcoming';

export interface FeatureRow {
  key: string;
  label: string;
  state: FeatureState;
  /** Right-column text: "Active" | "Unlimited" | "9 / 10 left" | "Pro" | "Soon". */
  detail: string;
  /** One-line explanation shown in the "?" tooltip beside the label. */
  note: string;
}

export interface PlanView {
  planLabel: string;
  isPro: boolean;
  rows: FeatureRow[];
}

const PLAN_LABEL: Record<'developer' | 'developer_pro' | 'business_pro', string> = {
  developer: 'Free',
  developer_pro: 'Developer Pro',
  business_pro: 'Business Pro',
};

/** Live Pro toolkit — active on any Pro plan, locked (upgrade) on Free. */
const TOOLKIT: ReadonlyArray<{ key: string; label: string; note: string }> = [
  {
    key: 'rehydrate',
    label: 'Rehydrate vault',
    note: 'Restore the original secrets from masked tokens later in the same session.',
  },
  {
    key: 'ghost',
    label: 'Ghost log sanitiser',
    note: 'Strip secrets, IPs and emails from large logs before you paste them.',
  },
  {
    key: 'session_lock',
    label: 'Session Lock',
    note: 'PIN-lock high-risk cloud consoles after inactivity or tab-away.',
  },
];

/** Business-tier features not shipped yet — only shown to Business Pro users. */
const BUSINESS_UPCOMING: ReadonlyArray<{ key: string; label: string; note: string }> = [
  {
    key: 'team_policy',
    label: 'Team Policy Sync',
    note: 'Push shared detection rules and settings across your whole team.',
  },
  {
    key: 'team_alerts',
    label: 'Security-Team Alerts',
    note: 'Notify your security team when a teammate is caught pasting a secret.',
  },
];

/**
 * Derive the plan checklist shown in the popup (and mirrored on the account
 * page): the two always-on features, the live Pro toolkit (active or locked),
 * then the upcoming business features.
 */
export function buildPlanView(input: {
  plan: 'developer' | 'developer_pro' | 'business_pro';
  pro: boolean;
  quota: QuotaStatus;
}): PlanView {
  const { plan, pro, quota } = input;

  const anonNote = 'Swap detected secrets for masked tokens so you can paste without leaking them.';
  const anon: FeatureRow = quota.unlimited
    ? {
        key: 'anonymise',
        label: 'Anonymise & Paste',
        state: 'active',
        detail: 'Unlimited',
        note: anonNote,
      }
    : {
        key: 'anonymise',
        label: 'Anonymise & Paste',
        state: 'usage',
        detail: `${quota.remaining} / ${quota.limit} left`,
        note: anonNote,
      };

  const rows: FeatureRow[] = [
    {
      key: 'detection',
      label: 'Detection & warnings',
      state: 'active',
      detail: 'Active',
      note: 'Scans every paste on-device and warns before secrets reach the page.',
    },
    anon,
    ...TOOLKIT.map((f) =>
      pro
        ? { ...f, state: 'active' as const, detail: 'Active' }
        : { ...f, state: 'locked' as const, detail: 'Pro' },
    ),
  ];

  // Business-tier roadmap is only relevant to Business Pro users; Free and
  // Developer Pro users never see these rows.
  if (plan === 'business_pro') {
    rows.push(
      ...BUSINESS_UPCOMING.map((f) => ({ ...f, state: 'upcoming' as const, detail: 'Soon' })),
    );
  }

  return { planLabel: PLAN_LABEL[plan], isPro: pro, rows };
}
