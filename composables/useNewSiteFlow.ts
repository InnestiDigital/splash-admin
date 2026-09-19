import { useProgramStore } from '~/admin/stores/programStore'
import { useSiteStore } from '~/admin/stores/siteStore'
import { useAdminUrl } from '~/admin/composables/useAdminUrl'

/**
 * Orchestrates the post-create state sync for new site creation.
 *
 * Ensures programStore and siteStore are updated to reflect the chosen
 * program and newly created site before navigating to the editor.
 *
 * Extracted from admin/pages/new.vue so the flow is unit-testable
 * (page components are excluded from coverage per vitest.config.ts).
 */
export function useNewSiteFlow() {
  const programStore = useProgramStore()
  const siteStore = useSiteStore()
  const { adminUrl } = useAdminUrl()

  /**
   * Sync stores and navigate to the new site's editor.
   *
   * Call this after POST /api/admin/sites succeeds.
   *
   * Order: setProgram (if needed) → setSite → fetchSites → navigateTo.
   * setSite runs before fetchSites so the auto-reselect-first branch in
   * siteStore.fetchSites is skipped (the new site is already in the list).
   *
   * @param program - The program the site was created in (from the form dropdown).
   * @param site    - The newly created site returned by the API.
   */
  async function finalize(
    program: { id: string; name: string },
    site: { id: string; name: string; theme?: string },
  ) {
    // Sync program store to the chosen program (may differ from activeProgramId
    // when user created the site in a different program than the current context).
    if (programStore.activeProgramId !== program.id) {
      programStore.setProgram({ id: program.id, name: program.name })
    }

    // Set the new site as active before fetchSites so the auto-reselect
    // branch (siteStore.ts:51-57) does not override it.
    siteStore.setSite({ id: site.id, name: site.name, theme: site.theme })

    // Refresh the site list scoped to the chosen program.
    await siteStore.fetchSites(program.id)

    // Stores are now coherent — adminUrl() will build the correct path.
    await navigateTo(adminUrl('/editor'))
  }

  return { finalize }
}
