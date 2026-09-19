import { watch } from 'vue'
import { useEditorStore } from '~/admin/stores/editorStore'
import { renderThemeVariantFaces, renderUploadedFontFaces } from '~/shared/utils/fontFaceCss'

/**
 * Inject `@font-face` rules into the admin document so:
 *   1. The font-family picker previews uploaded fonts immediately (SPL-115).
 *   2. The PresetEditor preview pane renders theme-declared variants
 *      (including variable fonts like Fraunces) so axis sliders visibly
 *      change rendering — without this the browser falls back to a
 *      generic serif and silently ignores `font-variation-settings`
 *      (Phase C).
 *
 * Unlike the published-site pipeline (which reads from a frozen
 * `typography.fontFaces` array in `client.json`), the admin needs live
 * updates: uploading a font or selecting a different theme should change
 * rendering immediately. This composable watches both sources and
 * rewrites a dedicated `<style data-font-admin>` element in the head.
 *
 * Loading via `<style>` (instead of `<link rel="preload">` + `useHead`)
 * avoids SSR mismatches and lets us update the stylesheet content in
 * place when fonts are added or removed.
 */
const ELEMENT_ID = 'splash-admin-font-faces'

export function useAdminFontFaces(): void {
  if (typeof document === 'undefined') return
  const store = useEditorStore()

  function ensureStyleElement(): HTMLStyleElement {
    const existing = document.getElementById(ELEMENT_ID) as HTMLStyleElement | null
    if (existing) return existing
    const el = document.createElement('style')
    el.id = ELEMENT_ID
    el.setAttribute('data-font-admin', 'true')
    document.head.appendChild(el)
    return el
  }

  function render() {
    const el = ensureStyleElement()
    // Rule generation lives in `shared/utils/fontFaceCss.ts` — the same module
    // the Brand Content Studio render pipeline uses, so the admin, the studio
    // preview and the exported PNG cannot disagree about a face.
    const variants = store.themeManifest?.typography?.variants
    const themeFaces = renderThemeVariantFaces(Array.isArray(variants) ? variants : [])
    const uploadedFaces = renderUploadedFontFaces(store.fonts)
    el.textContent = [themeFaces, uploadedFaces].filter(Boolean).join('\n')
  }

  // Immediate render + reactive updates when fonts or theme manifest changes.
  render()
  watch(() => store.fonts, render, { deep: true })
  watch(() => store.themeManifest?.typography?.variants, render, { deep: true })
}
