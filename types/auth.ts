/**
 * UI-visible admin roles. Mirrors the server-side Role type (rbac.ts) but
 * lives in admin so it can be imported without pulling in server code.
 *
 * These are used for navigation visibility only — not for API authorisation.
 */
export type AdminRole = 'admin' | 'editor' | 'viewer' | 'client'
