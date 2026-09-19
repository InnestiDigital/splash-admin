import { defineStore } from 'pinia'
import { ref } from 'vue'

type ThemeSettingField = {
  id: string
  default?: any
  [key: string]: any
}

/**
 * Resolve the values the editor should display and preview without turning
 * untouched schema defaults into persisted site overrides.
 */
export function resolveThemeSettingValues(
  schema: ThemeSettingField[],
  instanceSettings: Record<string, any>,
): Record<string, any> {
  const defaults: Record<string, any> = {}
  for (const field of schema) {
    if (field.default !== undefined) {
      defaults[field.id] = field.default
    }
  }

  return {
    ...defaults,
    ...instanceSettings,
  }
}

/**
 * Theme settings, theme settings schema/groups, layout settings per component
 * type, and layout meta (hasHeader / hasFooter). All mutations are synchronous
 * setters; the async fetches live in the proxy coordinator (editorStore.ts).
 */
export const useThemeStore = defineStore('editor-theme', () => {
  const themeSettings = ref<Record<string, any>>({})
  const persistedThemeSettings = ref<Record<string, any>>({})
  const themeSettingsSchema = ref<any[]>([])
  const themeSettingsGroups = ref<any[]>([])
  const layoutSettings = ref<Record<string, Record<string, any>>>({ header: {}, footer: {} })
  const layoutMeta = ref<{ hasHeader: boolean; hasFooter: boolean }>({ hasHeader: true, hasFooter: true })

  /**
   * Called by the proxy coordinator after a successful `/theme-settings` fetch.
   */
  function setThemeSettings(
    settings: Record<string, any>,
    schema: any[],
    groups?: any[],
  ) {
    themeSettingsSchema.value = schema
    persistedThemeSettings.value = { ...settings }
    themeSettings.value = resolveThemeSettingValues(schema, settings)

    if (groups) {
      themeSettingsGroups.value = groups
    } else {
      // Derive groups from schema field metadata
      const groupMap = new Map<string, { id: string; label: any }>()
      for (const field of schema) {
        if (field.group && !groupMap.has(field.group)) {
          groupMap.set(field.group, {
            id: field.group,
            label: { 'en-US': field.group.charAt(0).toUpperCase() + field.group.slice(1) },
          })
        }
      }
      themeSettingsGroups.value = Array.from(groupMap.values())
    }
  }

  /**
   * Apply an effective draft value immediately so the preview reacts without
   * waiting for persistence. This deliberately does not mutate the raw
   * persisted override map.
   */
  function previewThemeSettings(settings: Record<string, any>) {
    themeSettings.value = resolveThemeSettingValues(themeSettingsSchema.value, settings)
  }

  /**
   * Accept the raw override map returned by the API after a successful save.
   * Untouched defaults remain inherited rather than being materialized.
   */
  function confirmThemeSettings(settings: Record<string, any>) {
    persistedThemeSettings.value = { ...settings }
    themeSettings.value = resolveThemeSettingValues(themeSettingsSchema.value, settings)
  }

  /**
   * Overwrite one layout component's settings entry (e.g. after a GET).
   */
  function setLayoutSettings(type: string, settings: Record<string, any>) {
    layoutSettings.value[type] = settings
  }

  /**
   * Replace layout settings for one component type and trigger reactivity on
   * the entire record (used after a PUT that returns a confirmed payload).
   */
  function mergeLayoutSettings(type: string, settings: Record<string, any>) {
    layoutSettings.value = { ...layoutSettings.value, [type]: settings }
  }

  function setLayoutMeta(meta: { hasHeader: boolean; hasFooter: boolean }) {
    layoutMeta.value = meta
  }

  return {
    themeSettings,
    persistedThemeSettings,
    themeSettingsSchema,
    themeSettingsGroups,
    layoutSettings,
    layoutMeta,
    setThemeSettings,
    previewThemeSettings,
    confirmThemeSettings,
    setLayoutSettings,
    previewLayoutSettings: mergeLayoutSettings,
    mergeLayoutSettings,
    setLayoutMeta,
  }
})
