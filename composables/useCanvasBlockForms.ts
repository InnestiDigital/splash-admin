import { computed } from 'vue'
import { useSiteStore } from '~/admin/stores/siteStore'
import { getSchemaLabel } from '~/admin/utils/labelUtils'
import { AVAILABLE_THEMES, getThemeConfig } from '~/shared/features/cms/themeData'
import { getBlockSchemas } from '~/shared/features/cms/blockSchemasAuthoring'
import type { ComputedRef, Ref } from 'vue'
import type { BrandCanvasBlockSnapshot } from '~/shared/types/brandCanvas'
import type { BrandTemplateRecord } from '~/shared/types/brandTemplate'
import type { BlockSchema, ThemeManifest } from '~/shared/types/theme'

/**
 * Brand Content Studio — the ONE walk from an approved canvas snapshot to a
 * list of editable block forms.
 *
 * Two surfaces consume it and they must not be able to disagree:
 *
 *  - `BrandTemplateAssetWorkspace` renders a settings form per block, which is
 *    what a customer actually fills in.
 *  - `BrandTemplateCurationEditor` renders a checkbox per setting, which is
 *    what an admin ticks to decide what that customer sees.
 *
 * If the checkbox list were built from a second walk, an admin could curate a
 * field the workspace never renders (a block whose schema this theme dropped),
 * and the client would be promised a control that does not exist. Sharing the
 * walk makes the two lists the same list by construction.
 */
export interface CanvasBlockForm {
  block: BrandCanvasBlockSnapshot
  schema: BlockSchema
  /** Section name plus the block's own label — the author's map of the canvas. */
  label: string
}

export interface CanvasBlockForms {
  blocks: ComputedRef<CanvasBlockForm[]>
  /** Block types with no schema (or no settings) in this theme, named once each. */
  skippedTypes: ComputedRef<string[]>
  /** `''` when the site points at a theme this build does not bundle. */
  themeName: ComputedRef<string>
  schemas: ComputedRef<Record<string, BlockSchema>>
  themeManifest: ComputedRef<ThemeManifest | null>
}

export function useCanvasBlockForms(template: Ref<BrandTemplateRecord>): CanvasBlockForms {
  const siteStore = useSiteStore()

  /** `''` when the site points at a theme this build does not bundle. */
  const themeName = computed(() => {
    const theme = siteStore.activeSiteTheme
    return theme && AVAILABLE_THEMES.includes(theme) ? theme : ''
  })

  /**
   * `getBlockSchemas` throws on an unknown theme, and the site's theme is a
   * stored string — a site pointing at a theme this build does not bundle must
   * degrade to "no editable fields" rather than blank the whole studio.
   */
  const schemas = computed<Record<string, BlockSchema>>(
    () => themeName.value === '' ? {} : getBlockSchemas(themeName.value),
  )

  const themeManifest = computed<ThemeManifest | null>(
    () => themeName.value === '' ? null : getThemeConfig(themeName.value),
  )

  /** Snapshot order: sections top to bottom, blocks within a section by position. */
  const orderedBlocks = computed<BrandCanvasBlockSnapshot[]>(() => {
    const snapshot = template.value.snapshot
    if (!snapshot) return []
    const sectionOrder = new Map(snapshot.sections.map(section => [section.id, section.position]))
    // A section-less block sorts after every section rather than at the top: the
    // renderer paints it last, and a form that disagrees with the canvas order
    // sends the author hunting.
    const rank = (block: BrandCanvasBlockSnapshot): number =>
      block.sectionId === null ? Number.MAX_SAFE_INTEGER : sectionOrder.get(block.sectionId) ?? Number.MAX_SAFE_INTEGER
    return [...snapshot.blocks].sort((a, b) => rank(a) - rank(b) || a.position - b.position)
  })

  const sectionNames = computed<Map<string, string>>(
    () => new Map((template.value.snapshot?.sections ?? []).map(section => [section.id, section.name])),
  )

  const blocks = computed<CanvasBlockForm[]>(() => {
    const forms: CanvasBlockForm[] = []
    for (const block of orderedBlocks.value) {
      const schema = schemas.value[block.type]
      if (!schema || schema.settings.length === 0) continue
      const blockLabel = getSchemaLabel(schema) || block.type
      const sectionName = block.sectionId === null ? '' : sectionNames.value.get(block.sectionId) ?? ''
      forms.push({ block, schema, label: sectionName ? `${sectionName} · ${blockLabel}` : blockLabel })
    }
    return forms
  })

  /** Named once each, so a canvas with eight cards does not print eight notes. */
  const skippedTypes = computed<string[]>(() => {
    const skipped = new Set<string>()
    for (const block of orderedBlocks.value) {
      const schema = schemas.value[block.type]
      if (!schema || schema.settings.length === 0) skipped.add(block.type)
    }
    return [...skipped].sort()
  })

  return { blocks, skippedTypes, themeName, schemas, themeManifest }
}
