import { useAuthStore } from '~/admin/stores/authStore'
import { useProgramStore } from '~/admin/stores/programStore'
import { useSiteStore } from '~/admin/stores/siteStore'
import type { AdminContextResponse } from '~/shared/types/adminContext'

/**
 * Discriminated result returned by syncFromRoute / bootstrapOwnContext.
 * ok: true  — stores are in sync with the route.
 * ok: false — the requested context is not reachable; stores have been cleared.
 *
 * `context-unscoped` is specific to the caller-scoped bootstrap: the server
 * reported that this session is not tied to a single program, so the shell
 * cannot resolve a context without the admin-only collections.
 */
export type SyncResult =
  | { ok: true }
  | {
      ok: false
      reason: 'no-programs' | 'program-not-found' | 'no-sites' | 'site-not-found' | 'context-unscoped'
      missingId?: string
    }

/**
 * Composable that syncs route params → Pinia stores.
 *
 * When the user navigates to `/admin/p/:programId/s/:siteId/…`, this
 * composable ensures the programStore and siteStore reflect the IDs
 * from the URL rather than from (potentially stale) localStorage.
 *
 * Called once from Layout.vue (or editor.vue) during mount.
 *
 * Two bootstrap routes, picked by role:
 *  - 'admin' may enumerate tenants, so it reads `/api/admin/programs` +
 *    `/api/admin/sites`, as it always has;
 *  - every other role ('client', 'editor', 'viewer') is denied both
 *    (`ADMIN_ONLY_PATTERNS`) and instead reads `GET /api/admin/me/context`,
 *    which reports only its own scope. Without it such a session never got an
 *    `activeSiteId`, so `siteStore.apiBase` stayed null and the shell stranded
 *    on "Access denied" (403 on the very first collection fetch).
 */
export function useAdminContext() {
  const route = useRoute()
  const authStore = useAuthStore()
  const programStore = useProgramStore()
  const siteStore = useSiteStore()

  /**
   * True when this session must NOT touch the program/site collections. Driven
   * by the role rather than by trial-and-error on a 403 so the shell never
   * fires a request it knows will be refused.
   */
  function isSelfScopedRole(): boolean {
    const role = authStore.user?.role
    return role === 'client' || role === 'editor' || role === 'viewer'
  }

  function fetchOwnContext(): Promise<AdminContextResponse> {
    return $fetch<AdminContextResponse>('/api/admin/me/context')
  }

  /**
   * Populate the stores from a caller-scoped context and validate the route's
   * ids against it.
   *
   * `pid`/`sid` are the route params, or `undefined` when the URL carries no
   * context yet (the post-login landing on `/admin`). A PRESENT id is always
   * validated against the payload — a client that hand-types another tenant's
   * program or site id gets a clean failure here, never a context assembled
   * from ids the server did not confirm.
   */
  async function adoptOwnContext(pid: string | undefined, sid: string | undefined): Promise<SyncResult> {
    const context = await fetchOwnContext()

    if (context.scope !== 'program') {
      // 'install' means "your context is every program — use the collections",
      // which is only ever the answer for an admin, and an admin does not take
      // this path. Reaching here means the role check and the server disagree,
      // so fail loudly instead of falling back to requests that would 403.
      programStore.clearProgram()
      siteStore.clearSite()
      return { ok: false, reason: 'context-unscoped' }
    }

    if (pid !== undefined && pid !== context.program.id) {
      programStore.clearProgram()
      siteStore.clearSite()
      return { ok: false, reason: 'program-not-found', missingId: pid }
    }

    programStore.setPrograms([context.program])
    programStore.setProgram(context.program)

    if (context.sites.length === 0) {
      siteStore.clearSite()
      return { ok: false, reason: 'no-sites' }
    }

    // No site in the URL yet: adopt the first of the caller's own sites, the
    // same auto-select the collection bootstrap in Layout.vue applies.
    const site = sid === undefined
      ? context.sites[0]
      : context.sites.find(s => s.id === sid)

    if (!site) {
      siteStore.clearSite()
      return { ok: false, reason: 'site-not-found', missingId: sid }
    }

    siteStore.setSites(context.sites)
    siteStore.setSite(site)

    return { ok: true }
  }

  /**
   * Resolve the caller's context with no route params to go by — the shell's
   * entry point for a self-scoped role landing on `/admin`. Populates the
   * stores (and therefore localStorage), so the context-free `/admin` page can
   * upgrade the URL to the explicit `/admin/p/:programId/s/:siteId/…` form.
   *
   * Only meaningful for a self-scoped role; `isSelfScopedRole()` is exposed so
   * the caller decides which bootstrap to run.
   */
  function bootstrapOwnContext(): Promise<SyncResult> {
    return adoptOwnContext(undefined, undefined)
  }

  /**
   * Read programId / siteId from the current route params and update stores
   * if they differ from the currently active values.
   *
   * Fetches the full program/site lists so that the dropdowns are populated
   * and the selected item matches the route.
   *
   * Returns a SyncResult. Callers must inspect `ok` and redirect / toast on
   * failure — the composable deliberately does not navigate or show alerts.
   */
  async function syncFromRoute(): Promise<SyncResult> {
    const pid = route.params.programId as string | undefined
    const sid = route.params.siteId as string | undefined

    // If route carries no context, nothing to sync
    if (!pid) return { ok: true }

    if (isSelfScopedRole()) return adoptOwnContext(pid, sid)

    // Ensure programs are loaded
    if (!programStore.initialized || programStore.programs.length === 0) {
      await programStore.fetchPrograms()
    }

    // No programs at all
    if (programStore.programs.length === 0) {
      programStore.clearProgram()
      siteStore.clearSite()
      return { ok: false, reason: 'no-programs' }
    }

    // Sync program if it differs
    if (pid !== programStore.activeProgramId) {
      const prog = programStore.programs.find(p => p.id === pid)
      if (!prog) {
        programStore.clearProgram()
        siteStore.clearSite()
        return { ok: false, reason: 'program-not-found', missingId: pid }
      }
      programStore.setProgram(prog)
    }

    if (!sid) return { ok: true }

    // Ensure sites are loaded for this program
    if (!siteStore.initialized || siteStore.sites.length === 0) {
      await siteStore.fetchSites(pid)
    }

    // No sites for this program
    if (siteStore.sites.length === 0) {
      siteStore.clearSite()
      return { ok: false, reason: 'no-sites' }
    }

    // Sync site if it differs
    if (sid !== siteStore.activeSiteId) {
      const site = siteStore.sites.find(s => s.id === sid)
      if (!site) {
        siteStore.clearSite()
        return { ok: false, reason: 'site-not-found', missingId: sid }
      }
      siteStore.setSite(site)
    }

    return { ok: true }
  }

  return { syncFromRoute, bootstrapOwnContext, isSelfScopedRole }
}
