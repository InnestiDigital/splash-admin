import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { SplashPendingPrefill, SplashPrefill } from '~/admin/lib/protocol/types/splash-prefill'

/**
 * Podium pitfall 2: a short TTL silently dropped prefills behind slow page
 * loads. One-shot consume is the real at-most-once guarantee; the TTL only
 * guards a much-later manual visit to the target form. 3 min is safe.
 */
export const PREFILL_TTL_MS = 180_000

export interface PrefillReport { applied: string[]; dropped: string[] }

/**
 * Staging cell between the assistant trust boundary (useAssistantPrefill) and
 * the consuming form pages. Navigation itself is the untouched
 * useAssistantNavigation acting on the sibling pendingNavigation slice.
 */
export const useAssistantPrefillStore = defineStore('assistantPrefill', () => {
  const staged = ref<{ pending: SplashPendingPrefill, stagedAt: number } | null>(null)
  const lastReport = ref<PrefillReport | null>(null)

  /** Kind of the currently staged prefill — the pages' reactive watch key. */
  const stagedKind = computed(() => staged.value?.pending.prefill.kind ?? null)

  function stage(pending: SplashPendingPrefill): void {
    staged.value = { pending, stagedAt: Date.now() }
    // A previous prefill's "Not applied" notice must not linger over a new one.
    lastReport.value = null
  }

  /**
   * Returns the payload AT MOST ONCE, only if `kind` matches, only within the
   * TTL. A kind mismatch leaves the entry staged — the matching page may still
   * mount; expiry clears it.
   */
  function consume(kind: string): SplashPrefill | null {
    const entry = staged.value
    if (!entry || entry.pending.prefill.kind !== kind) return null
    staged.value = null
    if (Date.now() - entry.stagedAt > PREFILL_TTL_MS) return null
    return entry.pending.prefill
  }

  /** Consuming pages report once per consume; the drawer surfaces dropped fields. */
  function report(outcome: PrefillReport): void {
    lastReport.value = outcome
  }

  return { staged, stagedKind, lastReport, stage, consume, report }
})
