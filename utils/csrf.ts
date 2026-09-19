/**
 * Read the CSRF token from the `csrf-token` cookie.
 * The cookie is set by the server on login (httpOnly: false so JS can read it).
 * Used for the double-submit cookie CSRF protection pattern.
 */
export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}
