<script setup lang="ts">
import { watch, computed, provide } from 'vue'
import type {
  ThemeLayout,
  PageLayoutOverrides,
  LayoutChromeElement,
  LayoutFooterConfig,
  LayoutHeaderMorphOverride,
} from '~/shared/types/layout'
import { useLayoutOverridesEditor } from '~/admin/composables/useLayoutOverridesEditor'
import { resolveLayoutConfig } from '~/shared/features/layout/resolveLayoutConfig'
import InheritField from '~/admin/components/pageSettings/InheritField.vue'
import TImagePicker from '~/admin/components/fields/TImagePicker.vue'
import type { MediaUploadOperation } from '~/admin/components/fields/mediaUpload'
import { editorChangeScope } from '~/admin/stores/editorChangeStore'

const props = defineProps<{
  themeLayout: ThemeLayout
  overrides?: PageLayoutOverrides
  siteId?: string
  pageId?: string
  pending?: boolean
}>()

const emit = defineEmits<{
  'update:overrides': [overrides: PageLayoutOverrides]
}>()

const editor = useLayoutOverridesEditor(props.overrides)

const BACKGROUND_IMAGE_FIELD = {
  label: 'Background image',
  options: { valueMode: 'url' as const },
  note: 'Choose from this site\'s media library, upload a new image, or enter an external URL below.',
}

// Keep the media-library context local to this reusable panel. The picker
// stores URL values here because layout background config renders `image.src`.
provide('siteId', computed(() => props.siteId ?? ''))

const backgroundUploadOperation = computed<MediaUploadOperation | undefined>(() => {
  if (!props.pageId) return undefined
  return {
    key: `page:${props.pageId}:background-image:upload`,
    surface: 'page',
    scope: editorChangeScope.page(props.pageId),
    label: 'Background image upload',
  }
})

function updateBackgroundImage(value: unknown): void {
  const src = typeof value === 'string' ? value : ''
  if (!src) {
    // An empty image object is still rendered as url("") and can retain
    // opacity from the previous image. Remove the image override entirely so
    // the background color and other layers keep their own appearance.
    editor.updateBackground({ image: undefined })
    return
  }
  editor.updateBackground({
    image: { ...(editor.overrides.value.background?.image ?? {}), src } as any,
  })
}

// Mirror user edits to the parent. External confirmations use the same local
// ref, so suppress their synchronous reset instead of echoing them back as a
// brand-new save.
let applyingExternalValue = false
watch(
  () => editor.overrides.value,
  (next) => {
    if (applyingExternalValue) return
    emit('update:overrides', JSON.parse(JSON.stringify(next)))
  },
  { deep: true, flush: 'sync' },
)

// Server confirmations arrive through the page prop. Accept an external value
// only when it cannot overwrite a newer local draft; an equal confirmation
// simply advances the composable's clean baseline.
watch(
  [() => props.overrides, () => props.pending] as const,
  ([next, pending]) => {
    const normalized = next ?? {}
    if (pending) return
    if (JSON.stringify(normalized) === JSON.stringify(editor.overrides.value)) {
      editor.markClean()
    } else {
      applyingExternalValue = true
      editor.reset(normalized)
      applyingExternalValue = false
    }
  },
  { deep: true },
)

// Override policy gates — default to allowed when unspecified.
const policy = computed(() => props.themeLayout.overridePolicy ?? {})
const allowHeader = computed(() => policy.value.allowPageHeaderOverride !== false)
const allowFooter = computed(() => policy.value.allowPageFooterOverride !== false)
const allowBackground = computed(() => policy.value.allowPageBackgroundOverride !== false)
const allowChrome = computed(() => policy.value.allowPageChromeOverride !== false)
const allowScroll = computed(() => policy.value.allowPageScrollOverride !== false)

const chromeElements = computed<LayoutChromeElement[]>(
  () => props.themeLayout.chrome?.elements ?? [],
)

// What this page renders with no overrides at all — the value every
// tri-state control shows as its inherited state.
const inherited = computed(() => resolveLayoutConfig(props.themeLayout, undefined))

const headerOverride = computed(() => editor.overrides.value.header ?? {})
const footerOverride = computed(() => editor.overrides.value.footer ?? {})

const NO_MORPH_LABEL = 'None — static header'

const MORPH_OPTIONS: { value: LayoutHeaderMorphOverride, label: string }[] = [
  { value: 'none', label: NO_MORPH_LABEL },
  { value: 'glass-pill', label: 'Glass pill' },
  { value: 'editorial-slide', label: 'Editorial slide' },
]

const FOOTER_POSITIONS: { value: LayoutFooterConfig['position'], label: string }[] = [
  { value: 'normal', label: 'Static — after the content' },
  { value: 'sticky-bottom', label: 'Stuck to the bottom' },
]

const CHROME_TYPE_LABELS: Record<LayoutChromeElement['type'], string> = {
  line: 'Line',
  shape: 'Shape',
  image: 'Image',
  text: 'Text',
  progress: 'Reading progress',
}

/** Tri-state select value: empty string = inherit. */
function booleanSelectValue(value: boolean | undefined): string {
  if (value === undefined) return ''
  return value ? 'true' : 'false'
}

function parseBooleanSelect(raw: string): boolean | undefined {
  if (raw === 'true') return true
  if (raw === 'false') return false
  return undefined
}

function parseMorphStyle(raw: string): LayoutHeaderMorphOverride | undefined {
  return MORPH_OPTIONS.find(option => option.value === raw)?.value
}

function parseFooterPosition(raw: string): LayoutFooterConfig['position'] | undefined {
  return FOOTER_POSITIONS.find(option => option.value === raw)?.value
}

function selectValue(event: Event): string {
  const target = event.target
  return target instanceof HTMLSelectElement ? target.value : ''
}

const inheritedHeaderEnabled = computed(() => (inherited.value.header.enabled ? 'shown' : 'hidden'))
const inheritedMorphStyle = computed(() => {
  const value = inherited.value.header.morphStyle
  return MORPH_OPTIONS.find(option => option.value === value)?.label ?? NO_MORPH_LABEL
})
const inheritedWordmark = computed(() => (inherited.value.header.hideWordmark ? 'hidden' : 'shown'))
const inheritedFooterEnabled = computed(() => (inherited.value.footer.enabled ? 'shown' : 'hidden'))
const inheritedFooterPosition = computed(
  () => FOOTER_POSITIONS.find(option => option.value === inherited.value.footer.position)?.label
    ?? inherited.value.footer.position,
)

function chromeLabel(elem: LayoutChromeElement): string {
  if (elem.type === 'text' && elem.text.trim()) return elem.text.trim()
  if (elem.type === 'image' && elem.alt?.trim()) return elem.alt.trim()
  return CHROME_TYPE_LABELS[elem.type] ?? elem.id
}

function chromeOverrideValue<K extends keyof LayoutChromeElement>(
  id: string,
  key: K,
  fallback: LayoutChromeElement[K] | string | undefined,
): any {
  const ov = editor.overrides.value.chrome?.[id] as any
  return ov && key in ov ? ov[key] : fallback
}
</script>

<template>
  <div class="layout-overrides-panel">
    <section
      class="cms-card layout-overrides-panel__section"
      data-section="header"
      :data-disabled="!allowHeader ? 'true' : undefined"
    >
      <div class="cms-card__header">
        <h3 class="cms-card__title">Header</h3>
      </div>
      <div class="cms-card__body">
        <p v-if="!allowHeader" class="layout-overrides-panel__locked">
          Header overrides are disabled by the theme.
        </p>
        <div class="layout-overrides-panel__grid">
          <InheritField
            field="enabled"
            label="Header"
            :inherited="inheritedHeaderEnabled"
            :inheriting="headerOverride.enabled === undefined"
            :disabled="!allowHeader"
            @inherit="editor.setHeaderField('enabled', undefined)"
          >
            <select
              id="overrides-header-enabled"
              class="cms-form-control"
              :disabled="!allowHeader"
              :value="booleanSelectValue(headerOverride.enabled)"
              @change="editor.setHeaderField('enabled', parseBooleanSelect(selectValue($event)))"
            >
              <option value="">Inherit</option>
              <option value="true">Show</option>
              <option value="false">Hide</option>
            </select>
          </InheritField>
          <InheritField
            field="morphStyle"
            label="Scroll animation"
            :inherited="inheritedMorphStyle"
            :inheriting="headerOverride.morphStyle === undefined"
            :disabled="!allowHeader"
            @inherit="editor.setHeaderField('morphStyle', undefined)"
          >
            <select
              id="overrides-header-morph-style"
              class="cms-form-control"
              :disabled="!allowHeader"
              :value="headerOverride.morphStyle ?? ''"
              @change="editor.setHeaderField('morphStyle', parseMorphStyle(selectValue($event)))"
            >
              <option value="">Inherit</option>
              <option v-for="option in MORPH_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </InheritField>
          <InheritField
            field="hideWordmark"
            label="Header wordmark"
            :inherited="inheritedWordmark"
            :inheriting="headerOverride.hideWordmark === undefined"
            :disabled="!allowHeader"
            @inherit="editor.setHeaderField('hideWordmark', undefined)"
          >
            <select
              id="overrides-header-hide-wordmark"
              class="cms-form-control"
              :disabled="!allowHeader"
              :value="booleanSelectValue(headerOverride.hideWordmark)"
              @change="editor.setHeaderField('hideWordmark', parseBooleanSelect(selectValue($event)))"
            >
              <option value="">Inherit</option>
              <option value="false">Show</option>
              <option value="true">Hide</option>
            </select>
          </InheritField>
          <div class="cms-form-group" data-field="palette.bgColor">
            <label class="cms-label" for="overrides-header-bg-color">Bg color</label>
            <input
              id="overrides-header-bg-color"
              type="text"
              class="cms-form-control"
              :disabled="!allowHeader"
              :value="editor.overrides.value.header?.palette?.bgColor ?? ''"
              placeholder="#ffffff"
              @input="editor.updateHeaderPalette({ bgColor: ($event.target as HTMLInputElement).value })"
            >
          </div>
          <div class="cms-form-group" data-field="palette.textColor">
            <label class="cms-label" for="overrides-header-text-color">Text color</label>
            <input
              id="overrides-header-text-color"
              type="text"
              class="cms-form-control"
              :disabled="!allowHeader"
              :value="editor.overrides.value.header?.palette?.textColor ?? ''"
              @input="editor.updateHeaderPalette({ textColor: ($event.target as HTMLInputElement).value })"
            >
          </div>
          <div class="cms-form-group" data-field="palette.navLinkColor">
            <label class="cms-label" for="overrides-header-nav-link-color">Nav link color</label>
            <input
              id="overrides-header-nav-link-color"
              type="text"
              class="cms-form-control"
              :disabled="!allowHeader"
              :value="editor.overrides.value.header?.palette?.navLinkColor ?? ''"
              @input="editor.updateHeaderPalette({ navLinkColor: ($event.target as HTMLInputElement).value })"
            >
          </div>
        </div>
      </div>
    </section>

    <section
      class="cms-card layout-overrides-panel__section"
      data-section="footer"
      :data-disabled="!allowFooter ? 'true' : undefined"
    >
      <div class="cms-card__header">
        <h3 class="cms-card__title">Footer</h3>
      </div>
      <div class="cms-card__body">
        <p v-if="!allowFooter" class="layout-overrides-panel__locked">
          Footer overrides are disabled by the theme.
        </p>
        <div class="layout-overrides-panel__grid">
          <InheritField
            field="enabled"
            label="Footer"
            :inherited="inheritedFooterEnabled"
            :inheriting="footerOverride.enabled === undefined"
            :disabled="!allowFooter"
            @inherit="editor.setFooterField('enabled', undefined)"
          >
            <select
              id="overrides-footer-enabled"
              class="cms-form-control"
              :disabled="!allowFooter"
              :value="booleanSelectValue(footerOverride.enabled)"
              @change="editor.setFooterField('enabled', parseBooleanSelect(selectValue($event)))"
            >
              <option value="">Inherit</option>
              <option value="true">Show</option>
              <option value="false">Hide</option>
            </select>
          </InheritField>
          <InheritField
            field="position"
            label="Position"
            :inherited="inheritedFooterPosition"
            :inheriting="footerOverride.position === undefined"
            :disabled="!allowFooter"
            @inherit="editor.setFooterField('position', undefined)"
          >
            <select
              id="overrides-footer-position"
              class="cms-form-control"
              :disabled="!allowFooter"
              :value="footerOverride.position ?? ''"
              @change="editor.setFooterField('position', parseFooterPosition(selectValue($event)))"
            >
              <option value="">Inherit</option>
              <option v-for="option in FOOTER_POSITIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </InheritField>
          <div class="cms-form-group" data-field="palette.bgColor">
            <label class="cms-label" for="overrides-footer-bg-color">Bg color</label>
            <input
              id="overrides-footer-bg-color"
              type="text"
              class="cms-form-control"
              :disabled="!allowFooter"
              :value="editor.overrides.value.footer?.palette?.bgColor ?? ''"
              @input="editor.updateFooterPalette({ bgColor: ($event.target as HTMLInputElement).value })"
            >
          </div>
          <div class="cms-form-group" data-field="palette.textColor">
            <label class="cms-label" for="overrides-footer-text-color">Text color</label>
            <input
              id="overrides-footer-text-color"
              type="text"
              class="cms-form-control"
              :disabled="!allowFooter"
              :value="editor.overrides.value.footer?.palette?.textColor ?? ''"
              @input="editor.updateFooterPalette({ textColor: ($event.target as HTMLInputElement).value })"
            >
          </div>
          <div class="cms-form-group" data-field="palette.linkColor">
            <label class="cms-label" for="overrides-footer-link-color">Link color</label>
            <input
              id="overrides-footer-link-color"
              type="text"
              class="cms-form-control"
              :disabled="!allowFooter"
              :value="editor.overrides.value.footer?.palette?.linkColor ?? ''"
              @input="editor.updateFooterPalette({ linkColor: ($event.target as HTMLInputElement).value })"
            >
          </div>
        </div>
      </div>
    </section>

    <section
      class="cms-card layout-overrides-panel__section"
      data-section="background"
      :data-disabled="!allowBackground ? 'true' : undefined"
    >
      <div class="cms-card__header">
        <h3 class="cms-card__title">Background</h3>
      </div>
      <div class="cms-card__body">
        <p v-if="!allowBackground" class="layout-overrides-panel__locked">
          Background overrides are disabled by the theme.
        </p>
        <div class="layout-overrides-panel__grid">
          <div class="cms-form-group" data-field="color">
            <label class="cms-label" for="overrides-background-color">Color</label>
            <input
              id="overrides-background-color"
              type="text"
              class="cms-form-control"
              :disabled="!allowBackground"
              :value="editor.overrides.value.background?.color ?? ''"
              placeholder="#ffffff"
              @input="editor.updateBackground({ color: ($event.target as HTMLInputElement).value })"
            >
          </div>
          <div class="cms-form-group layout-overrides-panel__image-field" data-field="image.src">
            <TImagePicker
              :field="BACKGROUND_IMAGE_FIELD"
              :model-value="editor.overrides.value.background?.image?.src ?? null"
              :disabled="!allowBackground"
              :upload-operation="backgroundUploadOperation"
              @update:model-value="updateBackgroundImage"
            />
            <label class="cms-label" for="overrides-background-image-src">External image URL</label>
            <input
              id="overrides-background-image-src"
              type="url"
              class="cms-form-control"
              :disabled="!allowBackground"
              :value="editor.overrides.value.background?.image?.src ?? ''"
              placeholder="https://example.com/background.jpg"
              @input="updateBackgroundImage(($event.target as HTMLInputElement).value)"
            >
          </div>
        </div>
      </div>
    </section>

    <section
      class="cms-card layout-overrides-panel__section"
      data-section="scroll"
      :data-disabled="!allowScroll ? 'true' : undefined"
    >
      <div class="cms-card__header">
        <h3 class="cms-card__title">Scroll</h3>
      </div>
      <div class="cms-card__body">
        <p v-if="!allowScroll" class="layout-overrides-panel__locked">
          Scroll overrides are disabled by the theme.
        </p>
        <div class="layout-overrides-panel__grid">
          <div class="cms-form-group" data-field="mode">
            <label class="cms-label" for="overrides-scroll-mode">Mode</label>
            <select
              id="overrides-scroll-mode"
              class="cms-form-control"
              :disabled="!allowScroll"
              :value="editor.overrides.value.scroll?.mode ?? ''"
              @change="editor.updateScroll({ mode: (($event.target as HTMLSelectElement).value || undefined) as any })"
            >
              <option value="">(inherit)</option>
              <option value="normal">normal</option>
              <option value="snap-y">snap-y</option>
            </select>
          </div>
        </div>
      </div>
    </section>

    <section
      class="cms-card layout-overrides-panel__section"
      data-section="chrome"
      :data-disabled="!allowChrome ? 'true' : undefined"
    >
      <div class="cms-card__header">
        <h3 class="cms-card__title">Chrome elements</h3>
      </div>
      <div class="cms-card__body">
        <p class="layout-overrides-panel__note">
          Chrome elements are decorative lines, shapes, images and text the layout paints over
          this page — they are not the site Header or Footer, which you edit from their own
          entries in the navigation tree.
        </p>
        <p v-if="chromeElements.length === 0" class="layout-overrides-panel__empty">
          No chrome elements defined by the theme.
        </p>
        <p v-else-if="!allowChrome" class="layout-overrides-panel__locked">
          Chrome overrides are disabled by the theme.
        </p>
        <ul v-if="chromeElements.length > 0" class="layout-overrides-panel__chrome-list">
          <li
            v-for="elem in chromeElements"
            :key="elem.id"
            class="layout-overrides-panel__chrome-row"
            :data-chrome-override="elem.id"
            :data-disabled="!allowChrome ? 'true' : undefined"
          >
            <header class="layout-overrides-panel__chrome-head">
              <strong>{{ chromeLabel(elem) }}</strong>
              <code>{{ elem.id }}</code>
            </header>
            <div class="layout-overrides-panel__grid">
              <div class="cms-form-group" data-field="enabled">
                <div class="form-check">
                  <input
                    :id="`overrides-chrome-${elem.id}-enabled`"
                    class="form-check-input"
                    type="checkbox"
                    :disabled="!allowChrome"
                    :checked="chromeOverrideValue(elem.id, 'enabled', elem.enabled) as boolean"
                    @change="editor.updateChromeElement(elem.id, { enabled: ($event.target as HTMLInputElement).checked })"
                  >
                  <label class="form-check-label" :for="`overrides-chrome-${elem.id}-enabled`">Enabled</label>
                </div>
              </div>
              <div
                v-if="'color' in elem"
                class="cms-form-group"
                data-field="color"
              >
                <label class="cms-label" :for="`overrides-chrome-${elem.id}-color`">Color</label>
                <input
                  :id="`overrides-chrome-${elem.id}-color`"
                  type="text"
                  class="cms-form-control"
                  :disabled="!allowChrome"
                  :value="chromeOverrideValue(elem.id, 'color' as any, (elem as any).color) ?? ''"
                  @input="editor.updateChromeElement(elem.id, { color: ($event.target as HTMLInputElement).value } as any)"
                >
              </div>
              <div class="cms-form-group" data-field="opacity">
                <label class="cms-label" :for="`overrides-chrome-${elem.id}-opacity`">Opacity</label>
                <input
                  :id="`overrides-chrome-${elem.id}-opacity`"
                  type="number"
                  class="cms-form-control"
                  step="0.05"
                  min="0"
                  max="1"
                  :disabled="!allowChrome"
                  :value="chromeOverrideValue(elem.id, 'opacity', elem.opacity ?? 1)"
                  @input="editor.updateChromeElement(elem.id, { opacity: Number(($event.target as HTMLInputElement).value) })"
                >
              </div>
            </div>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped>
.layout-overrides-panel {
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
}
.layout-overrides-panel__section[data-disabled="true"] {
  opacity: 0.55;
}
.layout-overrides-panel__locked,
.layout-overrides-panel__note,
.layout-overrides-panel__empty {
  font-size: 1.2rem;
  color: var(--cms-ink-muted);
  margin: 0 0 1rem;
}
.layout-overrides-panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.6rem;
}
.layout-overrides-panel__image-field {
  grid-column: 1 / -1;
}
.layout-overrides-panel__image-field > .cms-label {
  margin-top: var(--cms-sp-3, 12px);
}
.layout-overrides-panel__chrome-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}
.layout-overrides-panel__chrome-row {
  background: var(--cms-canvas);
  border: 1px solid var(--cms-line);
  border-radius: 0.5rem;
  padding: 1.2rem;
}
.layout-overrides-panel__chrome-head {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  margin-bottom: 1rem;
}
.layout-overrides-panel__chrome-head strong {
  font-size: 1.3rem;
  color: var(--cms-ink);
}
.layout-overrides-panel__chrome-head code {
  font-size: 1.2rem;
  color: var(--cms-ink-subtle);
}
</style>
