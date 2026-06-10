/**
 * Dark mode is now global — the user's explicit theme choice is respected on
 * every page (managed by next-themes + a site-wide toggle in SiteHeader).
 *
 * This hook used to force light mode on public/auth pages, which fought the
 * toggle and made dark mode "snap back to light". It is now intentionally a
 * no-op, kept so existing imports keep working.
 */
export function useForceLightMode() {
  // no-op: theme is controlled globally by next-themes.
}
