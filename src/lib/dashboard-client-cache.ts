const LAST_RELOAD_RUN_KEY = "blackturtle:last-dashboard-reload-run";

let reloadTimer: number | null = null;

/**
 * Clear Next.js' in-memory route cache after a stored snapshot changes.
 * A short delay lets the completion feedback remain visible before reloading.
 */
export function reloadDashboardAfterRefresh(runId: string): void {
  if (typeof window === "undefined") return;

  try {
    if (window.sessionStorage.getItem(LAST_RELOAD_RUN_KEY) === runId) return;
    window.sessionStorage.setItem(LAST_RELOAD_RUN_KEY, runId);
  } catch {
    // Storage can be unavailable in restrictive browser modes. The module-level
    // timer still prevents duplicate reloads in the usual single-bundle case.
    if (reloadTimer !== null) return;
  }

  if (reloadTimer !== null) return;
  reloadTimer = window.setTimeout(() => window.location.reload(), 700);
}
