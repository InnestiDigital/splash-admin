import { ref, watch } from 'vue'
import { useAssistantStore } from '~/admin/stores/assistantStore'
import { useAdminUrl } from '~/admin/composables/useAdminUrl'
import { useSiteStore } from '~/admin/stores/siteStore'
import { useProgramStore } from '~/admin/stores/programStore'
import { adminRoutes, routeNavAddress } from '~/admin/config/routes'
import { SplashPendingNavigationSchema } from '~/admin/lib/protocol/types/splash-navigation'

/**
 * Bound on the handled-navId membership set. Insertion-order eviction (Set
 * iteration order == insertion order) keeps this a ring rather than an
 * unbounded, session-length leak.
 */
export const MAX_HANDLED_NAV_IDS = 50

/**
 * Record `navId` as handled, evicting the oldest entry once the set exceeds
 * `MAX_HANDLED_NAV_IDS`. Mutates `handled` in place.
 */
export function recordHandledNavId(handled: Set<string>, navId: string): void {
  handled.add(navId)
  if (handled.size > MAX_HANDLED_NAV_IDS) {
    const oldest = handled.values().next().value
    if (oldest !== undefined) handled.delete(oldest)
  }
}

/**
 * Trust boundary for the assistant's navigation directive (spec C4): the model
 * supplies only closed-enum route names; everything else — schema violations,
 * replayed navIds, missing site context — is dropped or blocked here.
 *
 * De-dupe contract: intermediate STATE_DELTAs within one turn may each carry a
 * fresh navId — that multiplicity is expected input, not an anomaly. This is
 * the FINAL guard: the host acts once per NEW navId, tracked by membership in
 * a bounded set — not a last-value scalar, which would let a stale,
 * out-of-order redelivery (navId A replaying after B was already handled)
 * slip past a simple `!==` comparison and re-navigate backward.
 */
export function resolveAssistantNavigation(input: {
  payload: unknown
  handledNavIds: ReadonlySet<string>
  hasSiteContext: boolean
  adminUrl: (suffix: string) => string
}): { action: 'ignore' } | { action: 'block', navId: string } | { action: 'navigate', navId: string, path: string, label?: string } {
  const parsed = SplashPendingNavigationSchema.safeParse(input.payload)
  if (!parsed.success) {
    if (input.payload !== null && import.meta.dev) {
      console.warn('[assistant] dropped invalid pendingNavigation', parsed.error)
    }
    return { action: 'ignore' }
  }
  const { target, navId, label } = parsed.data
  if (input.handledNavIds.has(navId)) return { action: 'ignore' }

  const route = adminRoutes.find(r => r.name === target)
  if (!route) return { action: 'ignore' }

  const { suffix, contextFree } = routeNavAddress(route.path)
  if (contextFree) {
    const path = suffix === '/' ? '/admin' : `/admin${suffix}`
    return { action: 'navigate', navId, path, label }
  }
  if (!input.hasSiteContext) return { action: 'block', navId }
  return { action: 'navigate', navId, path: input.adminUrl(suffix === '/' ? '/' : suffix), label }
}

/** Wire the store's widget state to the router. Call once from the drawer. */
export function useAssistantNavigation() {
  const store = useAssistantStore()
  const { adminUrl } = useAdminUrl()
  const siteStore = useSiteStore()
  const programStore = useProgramStore()
  const router = useRouter()
  const notice = ref<string | null>(null)
  const handledNavIds = new Set<string>()

  watch(() => store.widgetState.pendingNavigation, async (payload) => {
    const result = resolveAssistantNavigation({
      payload,
      handledNavIds,
      hasSiteContext: !!(programStore.activeProgramId && siteStore.activeSiteId),
      adminUrl,
    })
    if (result.action === 'ignore') return
    recordHandledNavId(handledNavIds, result.navId)
    if (result.action === 'block') {
      notice.value = 'Select a site first — that page lives inside a site context.'
      return
    }
    notice.value = null
    await router.push(result.path)
  })

  return { notice }
}
