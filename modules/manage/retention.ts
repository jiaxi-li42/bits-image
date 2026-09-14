export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function trashDaysLeft(deletedAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((deletedAt + TRASH_RETENTION_MS - now) / 86_400_000));
}
