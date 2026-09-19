import { useHead } from '#imports'
import { computed, watch } from 'vue'
import { useEditorStore } from '~/admin/stores/editorStore'
import { buildTypographyStyles } from '~/shared/typography/buildTypographyStyles'
import { mapPresetForSnapshot } from '~/server/services/typography/snapshotMapper'
import type { ThemeVariant } from '~/shared/typography/axisResolution'

/**
 * Inject typography preset CSS into the admin editor context so that
 * `.rt-preset-{key}` classes and `--rt-preset-*` / `--rt-role-*` CSS vars
 * are available inside TipTap and other admin components.
 *
 * Reads live from editorStore (not published/preview clientConfig) so that
 * preset edits in the Typography admin page reflect immediately in the editor.
 */
export function useAdminTypographyStyles(): void {
  const editorStore = useEditorStore()

  const css = computed(() => {
    // Only active presets generate CSS (matches preview/published behavior).
    const presets = (editorStore.typographyPresets ?? []).filter(p => p.isActive)
    if (presets.length === 0) return ''

    // Map editor store presets via the SAME shared mapper used by publishService
    // and the preview-config endpoint. Hand-rolling this here drops axis fields
    // (variationAxes, fontStyle, fontStretch, fontOpticalSizing, decoration,
    // ligatures, kerning, etc.) and produces drift between admin/preview/live —
    // variable-font axes silently fall back to defaults in the editor.
    const snapshotPresets = presets.map(mapPresetForSnapshot)

    // Forward theme variants so variable-font presets emit
    // `font-variation-settings` + derived legacy properties in the admin
    // editor context (matches preview/published behavior).
    const themeVariants = (editorStore.themeManifest?.typography?.variants ?? []) as ThemeVariant[]

    // Uses default :root scope. Safe in the admin editor context because
    // only one site is being edited at a time. If the admin ever renders
    // multiple sites simultaneously, pass a scope selector here.
    return buildTypographyStyles(
      snapshotPresets,
      editorStore.typographyRoles ?? {},
      ':root',
      themeVariants,
    )
  })

  useHead(computed(() => ({
    style: css.value ? [{ key: 'admin-typography-presets', innerHTML: css.value }] : [],
  })))

  // Dev-mode diagnostic: warn when roles reference missing/inactive presets.
  // De-duped by dangling-set signature so it only logs once per configuration
  // change, not on every reactive recomputation.
  if (import.meta.env.DEV) {
    let lastWarnedSignature: string | null = null
    watch(
      () => ({
        presets: editorStore.typographyPresets ?? [],
        roles: editorStore.typographyRoles ?? {},
      }),
      ({ presets, roles }) => {
        const activeKeys = new Set(presets.filter((p: any) => p.isActive).map((p: any) => p.key))
        const dangling: string[] = []
        for (const [role, presetKey] of Object.entries(roles)) {
          if (typeof presetKey === 'string' && !activeKeys.has(presetKey)) {
            dangling.push(`${role}→${presetKey}`)
          }
        }
        const signature = dangling.sort().join('|')
        if (signature && signature !== lastWarnedSignature) {
          lastWarnedSignature = signature
          console.warn(
            '[useAdminTypographyStyles] Typography roles reference missing or inactive presets: '
            + dangling.join(', ')
            + '. These roles will fall back to browser defaults in the editor and preview.',
          )
        } else if (!signature) {
          lastWarnedSignature = null
        }
      },
      { immediate: true, deep: true },
    )
  }
}
