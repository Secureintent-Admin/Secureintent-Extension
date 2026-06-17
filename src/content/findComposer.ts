export function findComposer(path: EventTarget[], selector: string): HTMLElement | null {
  for (const node of path) {
    if (node instanceof Element && node.matches(selector)) return node as HTMLElement;
  }
  return null;
}
