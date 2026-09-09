import data from './catalog.json';

/** No provider is globally "sanctioned"; classification belongs to a team. */
export const AI_CATALOG = data;
export type AiService = (typeof data.services)[number];
export type TeamClassification = {
  sanctionedServiceIds: readonly string[];
  reviewServiceIds: readonly string[];
};
export type AiTier = 1 | 2 | 3;

export function normalizeHostname(value: string): string | null {
  // Accept hostnames, never URLs, ports, credentials, whitespace or arbitrary subdomains.
  if (value.length > 254 || !/^[a-z0-9.-]+$/i.test(value)) return null;
  const host = value.toLowerCase().replace(/\.$/, '');
  if (
    !host.includes('.') ||
    host.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  )
    return null;
  return host;
}

export function findAiService(hostname: string): AiService | undefined {
  const host = normalizeHostname(hostname);
  return host ? data.services.find((service) => service.hostnames.includes(host)) : undefined;
}

/** pathname is inspected transiently on-device, never included in the return value. */
export function recognizeAiPage(hostname: string, pathname: string): AiService | undefined {
  const service = findAiService(hostname);
  if (
    service?.recognition === 'copilot-route' &&
    pathname !== '/copilot' &&
    !pathname.startsWith('/copilot/')
  )
    return undefined;
  return service;
}

export function classifyService(serviceId: string, policy: TeamClassification): AiTier {
  if (policy.sanctionedServiceIds.includes(serviceId)) return 1;
  return policy.reviewServiceIds.includes(serviceId) ? 3 : 2;
}

/** Explicit destinations only. GitHub paths limit injection to the standalone AI surface. */
export function catalogMatchPatterns(): string[] {
  return data.services.flatMap((service) =>
    service.hostnames.flatMap((host) =>
      service.recognition === 'copilot-route'
        ? [`https://${host}/copilot`, `https://${host}/copilot/*`]
        : [`https://${host}/*`],
    ),
  );
}
