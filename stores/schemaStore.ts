import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { BlockSchema } from '~/server/storage/types'

/**
 * Stores block schemas, the theme manifest, layout component types, and locale config.
 * Populated by the proxy coordinator's `fetchSchemas` action; exposes no async logic of its own.
 */
export const useSchemaStore = defineStore('editor-schema', () => {
  const schemas = ref<Record<string, BlockSchema>>({})
  const themeManifest = ref<any>(null)
  const layoutComponentTypes = ref<string[]>([])
  const locales = ref<string[]>(['en-US'])
  const defaultLocale = ref('en-US')
  const editingLocale = ref('en-US')
  const layoutSchemas = ref<Record<string, any>>({ header: null, footer: null })

  /**
   * Recursively extract inline block definitions from a parent schema and add
   * them to the indexed map (e.g. menu-category inside header, category-link
   * inside menu-category).
   */
  function extractInlineBlocks(schema: any, indexed: Record<string, any>) {
    const inlineBlocks = schema.blocks as any[] | undefined
    if (!inlineBlocks) return
    for (const block of inlineBlocks) {
      if (block.type && !indexed[block.type]) {
        indexed[block.type] = block
      }
      extractInlineBlocks(block, indexed)
    }
  }

  /**
   * Called by the proxy coordinator after a successful `/schemas` fetch.
   * Populates all schema-related state in one shot.
   */
  function populateFromApiResponse(data: {
    theme: any
    schemas: BlockSchema[]
    schemaMigration?: any
  }) {
    const indexed: Record<string, BlockSchema> = {}
    const layoutTypes: string[] = []

    for (const schema of data.schemas) {
      indexed[schema.type] = schema
      if ((schema as any).isLayoutComponent) {
        layoutTypes.push(schema.type)
      }
      // Extract inline block definitions recursively
      extractInlineBlocks(schema, indexed)
    }

    schemas.value = indexed
    themeManifest.value = data.theme
    layoutComponentTypes.value = layoutTypes

    // Populate layout schemas so the settings panel can render them
    for (const lt of layoutTypes) {
      layoutSchemas.value[lt] = indexed[lt]
    }

    // Extract locale config from theme manifest
    if (data.theme?.locales) {
      locales.value = data.theme.locales
    }
    if (data.theme?.defaultLocale) {
      // `editingLocale` starts pinned to the ref's initial 'en-US' and was never
      // synced to the theme's actual default (e.g. "it") — the settings-panel
      // locale switcher then opened on a locale absent from a theme like standalone,
      // silently editing the wrong locale-keyed values. Track "still following the
      // default" by comparing to the OLD default before overwriting it: as long as
      // the editor hasn't diverged (no manual switch away from default), re-sync to
      // the new theme's default. Once a user manually picks a different locale,
      // editingLocale no longer equals defaultLocale and this leaves it alone.
      const followingDefault = editingLocale.value === defaultLocale.value
      defaultLocale.value = data.theme.defaultLocale
      if (followingDefault) {
        editingLocale.value = data.theme.defaultLocale
      }
    }
  }

  /**
   * Register a layout schema entry (called by fetchStaticLayoutComponents in
   * the proxy coordinator when a page uses static layout components).
   */
  function addLayoutSchema(type: string, schema: any) {
    layoutSchemas.value[type] = schema
  }

  return {
    schemas,
    themeManifest,
    layoutComponentTypes,
    locales,
    defaultLocale,
    editingLocale,
    layoutSchemas,
    populateFromApiResponse,
    addLayoutSchema,
    extractInlineBlocks,
  }
})
