/**
 * Blocked icon IDs — these are replaced with a clown emoji and a warning
 * is appended to the username. Icons land here for containing hate symbols
 * or other content unsuitable for display.
 */
const BLOCKED_ICON_IDS: ReadonlySet<number> = new Set([
  27188, // hate symbol
]);

export function isIconBlocked(iconId: number): boolean {
  return BLOCKED_ICON_IDS.has(iconId);
}
