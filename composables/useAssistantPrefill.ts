import { ref, watch } from 'vue'
import { useAssistantStore } from '~/admin/stores/assistantStore'
import { useAssistantPrefillStore } from '~/admin/stores/assistantPrefillStore'
import { useSiteStore } from '~/admin/stores/siteStore'
import { useProgramStore } from '~/admin/stores/programStore'
import {
  SplashPendingPrefillSchema,
  type SplashPendingPrefill,
} from '~/admin/lib/protocol/types/splash-prefill'

/**
 * Bound on the handled-prefillId membership set. Insertion-order eviction (Set
 * iteration order == insertion order) keeps this a ring rather than an
 * unbounded, session-length leak. Mirrors MAX_HANDLED_NAV_IDS.
 */
export const MAX_HANDLED_PREFILL_IDS = 50

/**
 * admin-users is the only context-free prefill kind (spec §4.3). Enumerating
 * the context-free side keeps unknown/future kinds fail-CLOSED — they require
 * site context unless deliberately added here.
 */
const CONTEXT_FREE_KINDS = new Set(['admin-users'])

/**
 * Record `prefillId` as handled, evicting the oldest entry once the set
 * exceeds `MAX_HANDLED_PREFILL_IDS`. Mutates `handled` in place.
 */
export function recordHandledPrefillId(handled: Set<string>, prefillId: string): void {
  handled.add(prefillId)
  if (handled.size > MAX_HANDLED_PREFILL_IDS) {
    const oldest = handled.values().next().value
    if (oldest !== undefined) handled.delete(oldest)
  }
}

/**
 * Trust boundary for the assistant's prefill directive (spec §4.3), mirroring
 * resolveAssistantNavigation: schema violations ignored, replayed prefillIds
 * ignored (bounded set, id recorded BEFORE acting — ruling 10), site-scoped
 * kinds blocked without site context. Valid directives are STAGED, never
 * applied here — the target form consumes from the staging store.
 */
export function resolveAssistantPrefill(input: {
  payload: unknown
  handledPrefillIds: ReadonlySet<string>
  hasSiteContext: boolean
}): { action: 'ignore' } | { action: 'block', prefillId: string } | { action: 'stage', prefillId: string, pending: SplashPendingPrefill } {
  const parsed = SplashPendingPrefillSchema.safeParse(input.payload)
  if (!parsed.success) {
    if (input.payload !== null && import.meta.dev) {
      console.warn('[assistant] dropped invalid pendingPrefill', parsed.error)
    }
    return { action: 'ignore' }
  }
  const pending = parsed.data
  if (input.handledPrefillIds.has(pending.prefillId)) return { action: 'ignore' }

  if (!CONTEXT_FREE_KINDS.has(pending.prefill.kind) && !input.hasSiteContext) {
    return { action: 'block', prefillId: pending.prefillId }
  }
  return { action: 'stage', prefillId: pending.prefillId, pending }
}

/** Wire the store's widget state to the staging store. Call once from the drawer. */
export function useAssistantPrefill() {
  const store = useAssistantStore()
  const prefillStore = useAssistantPrefillStore()
  const siteStore = useSiteStore()
  const programStore = useProgramStore()
  const notice = ref<string | null>(null)
  const handledPrefillIds = new Set<string>()

  watch(() => store.widgetState.pendingPrefill, (payload) => {
    const result = resolveAssistantPrefill({
      payload,
      handledPrefillIds,
      hasSiteContext: !!(programStore.activeProgramId && siteStore.activeSiteId),
    })
    if (result.action === 'ignore') return
    recordHandledPrefillId(handledPrefillIds, result.prefillId)
    if (result.action === 'block') {
      notice.value = 'Select a site first — that form lives inside a site context.'
      return
    }
    notice.value = null
    prefillStore.stage(result.pending)
  })

  return { notice }
}
