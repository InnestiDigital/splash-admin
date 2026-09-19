<template>
  <div v-if="forbidden" class="cms-loading cms-loading--forbidden">
    <p class="cms-loading-message">{{ t('admin.shell.accessDenied', 'Access denied. Contact your administrator for permissions.') }}</p>
  </div>
  <div v-else-if="error" class="cms-loading cms-loading--error">
    <p class="cms-loading-message">{{ error }}</p>
    <button class="btn btn-primary" @click="retry">{{ t('admin.shell.retry', 'Retry') }}</button>
  </div>
  <div v-else-if="!ready" class="cms-loading">
    <div class="cms-loading-spinner" />
  </div>
  <div v-else class="cms-wrapper">
    <a class="skip-navigation" href="#main-content">{{ t('admin.shell.skipToContent', 'Skip to content') }}</a>

    <!-- Global product plane: identity, search and utilities span the viewport. -->
    <header class="cms-topbar">
      <AdminIconStrip />
    </header>

    <!-- Context and destinations sit beneath the global product plane. -->
    <nav id="cms-navbar" class="cms-navbar">
      <div id="cms-context-navigation" class="context-nav">
        <AdminProgramSiteSelector />
        <AdminNavTree />
      </div>
    </nav>

    <button
      v-if="!navStore.menuCollapsed"
      type="button"
      class="cms-nav-scrim"
      :aria-label="t('admin.shell.closeNavigation', 'Close navigation')"
      @click="navStore.collapseMenu()"
    />

    <!-- Main content area -->
    <div
      id="main-panel"
      class="cms-main-panel"
      :class="{ 'nav-collapsed': navStore.menuCollapsed }"
    >
      <main id="main-content">
        <AdminBreadcrumb />
        <slot />
      </main>
    </div>

    <!-- Footer -->
    <footer
      class="cms-footer"
      :class="{ 'nav-collapsed': navStore.menuCollapsed }"
    >
      <AdminFooter />
    </footer>

    <!-- Global command palette (⌘K / Ctrl-K) — mounted once for the whole admin -->
    <AdminCommandPalette />
  </div>
</template>

<script setup lang="ts">
// Bootstrap is admin-only (CSS-01): the admin markup uses Bootstrap's grid,
// buttons and forms, while the public themes are BEM-only. Importing it here
// loads it with the admin chunk and keeps it out of the public site and the
// editor preview iframe.
import 'bootstrap/dist/css/bootstrap.min.css'
import { useAuthStore } from '~/admin/stores/authStore'
import { useNavStore } from '~/admin/stores/navStore'
import { useProgramStore } from '~/admin/stores/programStore'
import { useSiteStore } from '~/admin/stores/siteStore'
import { useAlertStore } from '~/admin/stores/alertStore'
import { useAdminContext, type SyncResult } from '~/admin/composables/useAdminContext'
import { useAdminUrl } from '~/admin/composables/useAdminUrl'
import { navigationItems } from '~/admin/config/navigation'
import { isNavRouteAllowed } from '~/admin/utils/isNavRouteAllowed'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'

useHead({
  htmlAttrs: { class: 'cms-admin' },
})

const authStore = useAuthStore()
const navStore = useNavStore()
const programStore = useProgramStore()
const siteStore = useSiteStore()
const alertStore = useAlertStore()
const { syncFromRoute, bootstrapOwnContext, isSelfScopedRole } = useAdminContext()
const { adminUrl, extractSuffix } = useAdminUrl()
const route = useRoute()
const { t } = useAdminI18n()
const ready = ref(false)
const error = ref<string | null>(null)
const forbidden = ref(false)

function closeNavigationOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && !navStore.menuCollapsed) navStore.collapseMenu()
}

onMounted(() => window.addEventListener('keydown', closeNavigationOnEscape))
onUnmounted(() => window.removeEventListener('keydown', closeNavigationOnEscape))

let abortController: AbortController | null = null

/**
 * Author-facing text for a failed context resolution. Exhaustive over the
 * SyncResult reasons — a new reason is a compile error here, not a silent
 * fall-through to the wrong sentence.
 */
function syncFailureMessage(result: Extract<SyncResult, { ok: false }>): string {
  switch (result.reason) {
    case 'no-programs': return 'No programs available.'
    case 'program-not-found': return `Program not found: ${result.missingId}`
    case 'no-sites': return 'No sites available for this program.'
    case 'site-not-found': return `Site not found: ${result.missingId}`
    case 'context-unscoped': return 'Your account is not scoped to a single workspace. Contact your administrator.'
    default: {
      const exhaustive: never = result.reason
      return exhaustive
    }
  }
}

async function init() {
  // Abort any in-flight init (e.g. previous retry still running)
  abortController?.abort()
  abortController = new AbortController()
  const signal = abortController.signal

  error.value = null
  forbidden.value = false
  ready.value = false

  try {
    if (!authStore.initialized) {
      await authStore.fetchSession()
    }
    if (signal.aborted) return

    if (!authStore.isAuthenticated) {
      await navigateTo('/admin/login')
      return
    }

    // If the URL carries program/site context, sync stores from route params
    const hasProgramParam = !!route.params.programId
    if (hasProgramParam) {
      const syncResult = await syncFromRoute()
      if (signal.aborted) return
      if (!syncResult.ok) {
        // A self-scoped role has no other location to be redirected TO — the
        // site it just failed to reach is the only one it has, and /admin/new
        // is the admin's site-creation form. Report instead of bouncing it.
        if (isSelfScopedRole()) {
          error.value = syncFailureMessage(syncResult)
          return
        }
        alertStore.warning(syncFailureMessage(syncResult), 'You have been redirected to a known location.')
        const firstProgram = programStore.programs[0]
        await navigateTo(firstProgram ? `/admin/p/${firstProgram.id}/` : '/admin/new')
        return
      }
    } else if (isSelfScopedRole()) {
      // A self-scoped role (any non-admin) is denied /api/admin/programs and
      // /api/admin/sites, so the localStorage-then-collections bootstrap below
      // would 403 on its first call and strand the shell on "Access denied".
      // Resolve the caller's own context instead; once the stores hold it, the
      // context-free /admin page upgrades the URL to the explicit form.
      const bootstrap = await bootstrapOwnContext()
      if (signal.aborted) return
      if (!bootstrap.ok) {
        error.value = syncFailureMessage(bootstrap)
        return
      }
    } else {
      // No route context — restore from localStorage (legacy / first visit)
      programStore.restoreFromStorage()
      await programStore.fetchPrograms()
      if (signal.aborted) return

      // Auto-select first program if none saved
      if (!programStore.hasProgram && programStore.programs.length > 0) {
        programStore.setProgram(programStore.programs[0])
      }

      // Restore site from localStorage and fetch sites for active program
      siteStore.restoreFromStorage()
      if (programStore.activeProgramId) {
        await siteStore.fetchSites(programStore.activeProgramId)
      } else {
        await siteStore.fetchSite()
      }
      if (signal.aborted) return

      // Auto-select first site if none selected
      if (!siteStore.hasSite && siteStore.sites.length > 0) {
        siteStore.setSite(siteStore.sites[0])
      }
    }

    if (!siteStore.hasSite && route.path !== '/admin/new') {
      // Same reason as above: /admin/new asks for admin-only endpoints, so a
      // self-scoped role that ended up here is stuck, not one step from a fix.
      if (isSelfScopedRole()) {
        error.value = 'No site is available for your account. Contact your administrator.'
        return
      }
      await navigateTo('/admin/new')
      return
    }

    // The nav tree's `roles` are also the destination's access grant, not
    // just link visibility — a role that types the URL directly never runs
    // `filterNavByRole`, so without this check it would reach the full page
    // component (forms, approve/rename/delete buttons) even though every
    // write it could attempt is refused server-side. `undefined` means no
    // nav item names this path at all, which is left ungated exactly as it
    // was before this check existed (see `isNavRouteAllowed`'s docstring).
    if (isNavRouteAllowed(navigationItems, extractSuffix(route.path), route.query, authStore.user?.role) === false) {
      forbidden.value = true
      return
    }

    ready.value = true
  } catch (e: any) {
    if (signal.aborted) return
    console.error('[Layout init]', e)
    if (e?.statusCode === 403 || e?.data?.statusCode === 403) {
      forbidden.value = true
      return
    }
    const detail = e?.data?.statusMessage || e?.message
    error.value = detail
      ? `Failed to load admin shell: ${detail}`
      : 'Failed to load admin shell. Please try again.'
  }
}

function resetForRetry() {
  authStore.clearSession()
  authStore.initialized = false
  programStore.clearProgram()
  programStore.clearPrograms()
  programStore.initialized = false
  programStore.error = null
  siteStore.clearSite()
  siteStore.initialized = false
  siteStore.error = null
}

function retry() {
  resetForRetry()
  init()
}

function isCompactShell() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 1199px)').matches
}

onMounted(() => {
  // Compact screens use the task navigation as an overlay, so begin closed and
  // let the persistent utility-rail button reveal it without shrinking content.
  if (isCompactShell()) navStore.collapseMenu()
  init()
})
onUnmounted(() => abortController?.abort())

// Close the compact overlay after navigation so the destination owns the canvas.
watch(() => route.fullPath, () => {
  if (isCompactShell()) navStore.collapseMenu()
})

// Watch for auth changes
watch(() => authStore.isAuthenticated, (isAuth) => {
  if (!isAuth && authStore.initialized) {
    navigateTo('/admin/login')
  }
})
</script>

<style lang="scss">
@use '~/admin/assets/scss/admin';

.cms-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: var(--cms-surface-subtle);
}

.cms-loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--cms-line);
  border-top-color: var(--cms-ink-body);
  border-radius: 50%;
  animation: cms-spin 0.8s linear infinite;
}

@keyframes cms-spin {
  to { transform: rotate(360deg); }
}

.cms-loading--error,
.cms-loading--forbidden {
  flex-direction: column;
  gap: 1rem;
  text-align: center;
  color: var(--cms-ink-body);
}
</style>
