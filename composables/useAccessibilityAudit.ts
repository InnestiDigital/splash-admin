import { computed, ref, readonly, type ComputedRef } from 'vue'
import { useEditorStore } from '~/admin/stores/editorStore'
import {
  auditBlocks,
  summarize,
  type A11yFinding,
  type BlockSchema,
} from '~/shared/features/cms/a11y/auditBlocks'

/**
 * Editor Accessibility Audit — a live, schema-driven lint of the current page.
 *
 * Open-state is a module-level singleton (mirroring `useCommandPalette`): the
 * icon-strip trigger and the panel share one flag while a single
 * <AccessibilityPanel> instance, mounted once in Layout.vue, owns rendering.
 * SSR is disabled in this app, so a module singleton is safe.
 *
 * Findings are a pure `computed` over `editorStore.blocks` + `.schemas`, so the
 * badge count and panel update reactively as the author edits — no manual
 * re-scan, no persistence, nothing to invalidate.
 */
const isOpen = ref(false)

export interface UseAccessibilityAudit {
  isOpen: Readonly<typeof isOpen>
  open: () => void
  close: () => void
  toggle: () => void
  findings: ComputedRef<A11yFinding[]>
  errorCount: ComputedRef<number>
  warningCount: ComputedRef<number>
}

export function useAccessibilityAudit(): UseAccessibilityAudit {
  const editorStore = useEditorStore()

  const findings = computed<A11yFinding[]>(() => {
    const blocks = editorStore.blocks
    if (!blocks || blocks.length === 0) return []
    // editorStore.schemas is Record<type, schema>; audit only reads .settings/.label.
    const schemas = editorStore.schemas as Record<string, BlockSchema | undefined>
    return auditBlocks(
      blocks.map((b) => ({ id: b.id, type: b.type, settings: b.settings })),
      schemas,
      {
        locale: editorStore.editingLocale,
        fallbackLocale: editorStore.defaultLocale,
      },
    )
  })

  const counts = computed(() => summarize(findings.value))
  const errorCount = computed(() => counts.value.errors)
  const warningCount = computed(() => counts.value.warnings)

  return {
    isOpen: readonly(isOpen),
    open: () => {
      isOpen.value = true
    },
    close: () => {
      isOpen.value = false
    },
    toggle: () => {
      isOpen.value = !isOpen.value
    },
    findings,
    errorCount,
    warningCount,
  }
}
