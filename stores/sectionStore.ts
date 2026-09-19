import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ChangeSectionTypeResult, Section, SectionBlockRoleUpdate } from '~/server/storage/types'
import type { SectionType, SectionTypeSchema } from '~/shared/types/sectionTypes'
import { getSectionTypeSchema } from '~/shared/features/cms/sectionSchemas'
import { planSectionTypeRoles } from '~/shared/features/cms/sectionTypeRoles'
import { useSiteStore } from '~/admin/stores/siteStore'
import {
  editorChangeKey,
  editorChangeScope,
  useEditorChangeStore,
} from '~/admin/stores/editorChangeStore'
import type { EditorFlushResult } from '~/admin/stores/editorChangeStore'
import { usePageStore } from '~/admin/stores/pageStore'
import { useBlockStore } from '~/admin/stores/blockStore'
import { useSchemaStore } from '~/admin/stores/schemaStore'
import { adminFetch } from '~/admin/utils/adminFetch'

/**
 * What a section type transition did, for the two callers that must explain it:
 * the inspector renders `warning` in its type-change slot, the assistant's op
 * executor puts the same string in the batch report.
 */
export interface SectionTypeChangeResult {
  section: Section
  blockRoles: SectionBlockRoleUpdate[]
  clearedCount: number
  autoAssignedCount: number
  warning: string | null
}

/**
 * A section type schema's own setting defaults, keyed by setting id. Shared by
 * `changeSectionType` (the persisted payload) and `SectionSettings.vue` (the
 * optimistic picker seed) — one source of truth for what a fresh section of a
 * given type starts with.
 */
export function sectionTypeDefaults(schema: SectionTypeSchema): Record<string, any> {
  return Object.fromEntries(schema.settings
    .filter(setting => setting.default !== undefined)
    .map(setting => [setting.id, JSON.parse(JSON.stringify(setting.default))]))
}

export const useSectionStore = defineStore('editor-section', () => {
  const siteStore = useSiteStore()
  const pageStore = usePageStore()
  const changeStore = useEditorChangeStore()
  const blockStore = useBlockStore()
  const schemaStore = useSchemaStore()

  // ── State ──
  const sections = ref<Section[]>([])
  /**
   * Section CONTEXT — which section is expanded and receives new blocks.
   *
   * NOT the same as section selection (`selectionStore`'s 'section' mode). This
   * deliberately outlives block selection: with a block selected, its owning
   * section stays the insertion target so a new block lands where the author is
   * looking rather than orphaned on the page. See I5 in
   * docs/design/admin-architecture-lock.md.
   */
  const activeSectionId = ref<string | null>(null)
  const error = ref<string | null>(null)
  let sectionContextRevision = 0
  let sectionsLoadRevision = 0

  function invalidateSectionLoads(): void {
    sectionsLoadRevision++
  }

  // ── Computed ──

  /** The section in context, resolved to its record. */
  const activeSection = computed(() => {
    if (!activeSectionId.value) return null
    return sections.value.find(s => s.id === activeSectionId.value) ?? null
  })

  const visibleSections = computed(() =>
    sections.value.filter(s => !s.isHidden).sort((a, b) => a.position - b.position)
  )

  // ── State setter (called by proxy coordinator during page hydration) ──

  function setSections(newSections: Section[]) {
    sectionContextRevision++
    invalidateSectionLoads()
    sections.value = newSections
  }

  function patchSectionInState(sectionId: string, patch: Partial<Section>) {
    invalidateSectionLoads()
    const index = sections.value.findIndex(section => section.id === sectionId)
    if (index === -1) return
    const current = sections.value[index]
    if (!current) return
    sections.value[index] = { ...current, ...patch }
  }

  // ── Actions ──

  async function fetchSections(pageId: string) {
    if (!siteStore.activeSiteId || pageStore.currentPage?.id !== pageId) return
    const revision = ++sectionsLoadRevision
    const apiBase = siteStore.apiBase
    try {
      const data = await adminFetch<{ sections: Section[] }>(`${apiBase}/pages/${pageId}/sections`)
      if (revision !== sectionsLoadRevision || pageStore.currentPage?.id !== pageId) return
      setSections(data.sections || [])
    } catch (e: any) {
      if (revision !== sectionsLoadRevision || pageStore.currentPage?.id !== pageId) return
      console.warn('[sectionStore] Failed to fetch sections:', e.message)
      setSections([])
    }
  }

  async function createSection(pageId: string, dto: any): Promise<Section | null> {
    if (!siteStore.activeSiteId || pageStore.currentPage?.id !== pageId) return null
    const apiBase = siteStore.apiBase
    const payload = JSON.parse(JSON.stringify(dto))
    const operationKey = editorChangeKey.structure(pageId)
    if (changeStore.hasOperation(operationKey)) return null
    invalidateSectionLoads()
    error.value = null
    try {
      const section = await changeStore.runOperation({
        key: operationKey,
        label: 'Create section',
        scope: editorChangeScope.page(pageId),
        barrier: true,
        run: async () => {
          const data = await adminFetch<{ section: Section }>(`${apiBase}/pages/${pageId}/sections`, {
            method: 'POST',
            body: payload,
          })
          sections.value.push(data.section)
          return data.section
        },
      })
      error.value = null
      return section
    } catch (e: any) {
      error.value = e.message || 'Failed to create section'
      return null
    }
  }

  async function updateSection(pageId: string, sectionId: string, dto: any): Promise<Section | null> {
    if (!siteStore.activeSiteId || pageStore.currentPage?.id !== pageId) return null
    const apiBase = siteStore.apiBase
    const payload = JSON.parse(JSON.stringify(dto))
    invalidateSectionLoads()
    error.value = null
    try {
      const section = await changeStore.runOperation({
        key: `page:${pageId}:section:${sectionId}:update`,
        label: 'Update section',
        scope: editorChangeScope.page(pageId),
        run: async () => {
          const data = await adminFetch<{ section: Section }>(
            `${apiBase}/pages/${pageId}/sections/${sectionId}`,
            { method: 'PUT', body: payload },
          )
          const authoritativePatch = Object.fromEntries(
            Object.keys(payload).map((key) => {
              const value = (data.section as any)[key]
              return [key, value === undefined ? undefined : JSON.parse(JSON.stringify(value))]
            }),
          ) as Partial<Section>
          patchSectionInState(sectionId, authoritativePatch)
          return data.section
        },
      })
      error.value = null
      return section
    } catch (e: any) {
      error.value = e.message || 'Failed to update section'
      return null
    }
  }

  async function deleteSection(pageId: string, sectionId: string) {
    if (!siteStore.activeSiteId || pageStore.currentPage?.id !== pageId) return
    const apiBase = siteStore.apiBase
    const operationKey = editorChangeKey.structure(pageId)
    if (changeStore.hasOperation(operationKey)) return
    const sectionJobKey = editorChangeKey.section(pageId, sectionId)
    if (changeStore.getJob(sectionJobKey) && !await changeStore.flushJob(sectionJobKey, true)) return
    if (pageStore.currentPage?.id !== pageId || changeStore.hasOperation(operationKey)) return
    invalidateSectionLoads()
    error.value = null
    try {
      await changeStore.runOperation({
        key: operationKey,
        label: 'Delete section',
        scope: editorChangeScope.page(pageId),
        barrier: true,
        run: async () => {
          await adminFetch(`${apiBase}/pages/${pageId}/sections/${sectionId}`, {
            method: 'DELETE',
          })
          sections.value = sections.value.filter(s => s.id !== sectionId)
          if (activeSectionId.value === sectionId) activeSectionId.value = null
          changeStore.discardJob(sectionJobKey)
        },
      })
    } catch (e: any) {
      error.value = e.message || 'Failed to delete section'
    }
  }

  async function reorderSections(pageId: string, orderedIds: string[]) {
    if (!siteStore.activeSiteId || pageStore.currentPage?.id !== pageId) return
    const apiBase = siteStore.apiBase
    const operationKey = editorChangeKey.structure(pageId)
    if (changeStore.hasOperation(operationKey)) return
    invalidateSectionLoads()
    const order = [...orderedIds]
    const contextRevision = sectionContextRevision
    const previousSections = sections.value.map(section => ({ ...section }))
    const previousOrder = previousSections.map(section => section.id)
    sections.value = order.map((id, index) => {
      const section = sections.value.find(candidate => candidate.id === id)!
      return { ...section, position: index }
    })
    error.value = null
    try {
      await changeStore.runOperation({
        key: operationKey,
        label: 'Reorder sections',
        scope: editorChangeScope.page(pageId),
        barrier: true,
        run: async () => {
          await adminFetch(`${apiBase}/pages/${pageId}/sections/reorder`, {
            method: 'PUT',
            body: { order },
          })
        },
      })
    } catch (e: any) {
      if (contextRevision === sectionContextRevision) {
        const currentById = new Map(sections.value.map(section => [section.id, section]))
        const previousById = new Map(previousSections.map(section => [section.id, section]))
        sections.value = previousOrder.map((id, position) => ({
          ...(currentById.get(id) ?? previousById.get(id)!),
          position,
        }))
      }
      error.value = e.message || 'Failed to reorder sections'
    }
  }

  function saveFailureMessage(result: EditorFlushResult): string {
    const key = result.blockedKeys[0] ?? result.failedKeys[0]
    const job = key ? changeStore.getJob(key) : null
    return job?.blockedReason ?? job?.error ?? 'Save pending section changes before changing its type'
  }

  /**
   * Change a section's renderer, reassigning block layout roles in the same
   * transaction.
   *
   * Extracted from `SectionSettings.vue` so a click and an assistant editor op
   * take one path (DECISIONS ruling B). Throws rather than recording into
   * `error`: callers branch on the throw, and `error` is what the assistant's
   * executor samples to judge the void actions beside this one.
   */
  async function changeSectionType(
    pageId: string,
    sectionId: string,
    nextType: SectionType,
  ): Promise<SectionTypeChangeResult> {
    const siteId = siteStore.activeSiteId
    const apiBase = siteStore.apiBase
    if (!siteId || pageStore.currentPage?.id !== pageId || !sections.value.some(s => s.id === sectionId)) {
      throw new Error('That section is no longer open')
    }

    const pageScope = editorChangeScope.page(pageId)
    const operationKey = editorChangeKey.structure(pageId)

    // Drain older page writes before entering the barrier. Flushing from inside
    // the barrier callback would wait on this operation and deadlock.
    const flushed = await changeStore.flushScope(pageScope, true)
    if (!flushed.ok) throw new Error(saveFailureMessage(flushed))
    if (
      siteStore.activeSiteId !== siteId
      || pageStore.currentPage?.id !== pageId
      || !sections.value.some(s => s.id === sectionId)
    ) {
      throw new Error('That section is no longer open')
    }

    // Theme-scoped, deliberately: `SectionType` is the global union, but a
    // theme only ships the section schemas it actually renders. The open
    // theme's vocabulary is the authority (spec §5.4).
    const themeName = siteStore.activeSiteTheme || 'standalone'
    const schema = getSectionTypeSchema(themeName, nextType)
    if (!schema) throw new Error(`Section type "${nextType}" is not available in this theme`)

    const sectionBlocks = blockStore.blocks
      .filter(block => block.sectionId === sectionId)
      .sort((a, b) => a.position - b.position)

    const plan = planSectionTypeRoles(
      schema,
      sectionBlocks,
      blockType => schemaStore.schemas[blockType]?.compatibleSectionRoles ?? [],
    )

    const payload = JSON.parse(JSON.stringify({
      sectionType: nextType,
      layoutConfig: sectionTypeDefaults(schema),
      blockRoles: plan.assignments,
    }))

    invalidateSectionLoads()
    const data = await changeStore.runOperation({
      key: operationKey,
      label: 'Change section type',
      scope: pageScope,
      barrier: true,
      run: () => adminFetch<ChangeSectionTypeResult>(
        `${apiBase}/pages/${pageId}/sections/${sectionId}/type`,
        { method: 'PUT', body: payload },
      ),
    })

    // The section can be deleted while the barrier runs; without the existence
    // check the role patch and the history clear would still fire for it.
    if (
      siteStore.activeSiteId === siteId
      && pageStore.currentPage?.id === pageId
      && sections.value.some(s => s.id === sectionId)
    ) {
      patchSectionInState(sectionId, data.section)
      for (const assignment of data.blockRoles) {
        const index = blockStore.blocks.findIndex(block => block.id === assignment.blockId)
        const current = index >= 0 ? blockStore.blocks[index] : undefined
        if (current) blockStore.blocks[index] = { ...current, layoutRole: assignment.layoutRole }
      }
      // A type transition is always a block-history boundary. Even when the
      // roles stay equal, an older snapshot may carry roles or section
      // membership the new renderer has no slot for.
      blockStore.clearBlockHistory()
    }

    const messages: string[] = []
    if (plan.clearedCount > 0) {
      messages.push(`${plan.clearedCount} incompatible or duplicate block role(s) were cleared.`)
    }
    if (plan.autoAssignedCount > 0) {
      messages.push(`${plan.autoAssignedCount} block(s) were auto-assigned.`)
    }
    // A stacked section renders role-less blocks in its default flow; every
    // other layout drops them (red placeholder in the renderer). Silence here
    // was how a type change blanked a published section without anyone told.
    if (plan.unassignedCount > 0 && nextType !== 'stacked') {
      messages.push(
        `${plan.unassignedCount} block(s) have no compatible role and will NOT render in this layout — assign roles manually.`,
      )
    }

    return {
      section: data.section,
      blockRoles: data.blockRoles,
      clearedCount: plan.clearedCount,
      autoAssignedCount: plan.autoAssignedCount,
      warning: messages.length > 0 ? messages.join(' ') : null,
    }
  }

  /** Set the section context. Selection is the selectionStore's job. */
  function setActiveSection(sectionId: string | null) {
    activeSectionId.value = sectionId
  }

  return {
    sections,
    activeSectionId,
    activeSection,
    visibleSections,
    error,
    setSections,
    patchSectionInState,
    fetchSections,
    createSection,
    updateSection,
    deleteSection,
    reorderSections,
    changeSectionType,
    setActiveSection,
  }
})
