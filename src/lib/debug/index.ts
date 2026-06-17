const PREFIX = '[SecureIntent]';

// console.info (not console.debug, which Chrome hides under "Verbose"); never log raw secrets
export function siDebug(site: string, event: string, data?: Record<string, unknown>): void {
  if (data === undefined) {
    console.info(`${PREFIX} ${site} · ${event}`);
  } else {
    console.info(`${PREFIX} ${site} · ${event}`, data);
  }
}

export function siError(site: string, event: string, err: unknown): void {
  console.error(`${PREFIX} ${site} · ${event}`, err);
}

export function elapsedMs(since: number): number {
  return Math.round((performance.now() - since) * 10) / 10;
}
