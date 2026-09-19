import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * What the settings panel is showing. Exactly one of these is true at a time.
 *
 * `section` is a first-class variant. It used to be encoded as
 * `selectedSectionId !== null && editorMode.type === 'none'` — a section was
 * "selected" by the *absence* of every other selection — which made the eight
 * manual `selectSection(null)` calls load-bearing and produced the undo bug
 * fixed in I6.
 *
 * Note this is selection, NOT section context. Which section is expanded and
 * receives new blocks is `sectionStore.activeSectionId`, and it deliberately
 * outlives block selection. See docs/design/admin-architecture-lock.md I5.
 */
export type EditorMode =
  | { type: 'none' }
  | { type: 'block'; blockId: string }
  | { type: 'section'; sectionId: string }
  | { type: 'layout'; layoutType: string }
  | { type: 'theme-settings' }
  | { type: 'page-settings' }

export const useSelectionStore = defineStore('editor-selection', () => {
  // ── Single-source-of-truth selection state ──
  const editorMode = ref<EditorMode>({ type: 'none' })

  // ── Backward-compatible computed refs derived from editorMode ──
  const selectedBlockId = computed({
    get: () => editorMode.value.type === 'block' ? editorMode.value.blockId : null,
    set: (id: string | null) => {
      editorMode.value = id ? { type: 'block', blockId: id } : { type: 'none' }
    },
  })

  const showThemeSettings = computed({
    get: () => editorMode.value.type === 'theme-settings',
    set: (v: boolean) => {
      editorMode.value = v ? { type: 'theme-settings' } : { type: 'none' }
    },
  })

  const showPageSettings = computed({
    get: () => editorMode.value.type === 'page-settings',
    set: (v: boolean) => {
      editorMode.value = v ? { type: 'page-settings' } : { type: 'none' }
    },
  })

  const selectedLayoutType = computed({
    get: () => editorMode.value.type === 'layout' ? editorMode.value.layoutType : null,
    set: (type: string | null) => {
      editorMode.value = type ? { type: 'layout', layoutType: type } : { type: 'none' }
    },
  })

  const showLayoutSettings = computed(() => selectedLayoutType.value !== null)

  /** The section the panel is showing — null whenever anything else is selected. */
  const selectedSectionId = computed(() =>
    editorMode.value.type === 'section' ? editorMode.value.sectionId : null,
  )

  const showSectionSettings = computed(() => editorMode.value.type === 'section')

  function selectBlock(blockId: string) {
    editorMode.value = { type: 'block', blockId }
  }

  function selectSection(sectionId: string) {
    editorMode.value = { type: 'section', sectionId }
  }

  function selectThemeSettings() {
    editorMode.value = { type: 'theme-settings' }
  }

  function selectPageSettings() {
    editorMode.value = { type: 'page-settings' }
  }

  function selectLayoutComponent(type: string) {
    editorMode.value = { type: 'layout', layoutType: type }
  }

  function deselectAll() {
    editorMode.value = { type: 'none' }
  }

  return {
    editorMode,
    selectedBlockId,
    showThemeSettings,
    showPageSettings,
    selectedLayoutType,
    showLayoutSettings,
    selectedSectionId,
    showSectionSettings,
    selectBlock,
    selectSection,
    selectThemeSettings,
    selectPageSettings,
    selectLayoutComponent,
    deselectAll,
  }
})
