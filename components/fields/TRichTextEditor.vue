<template>
  <BaseField :field="field" type="richtext" :error="error" :disabled="disabled">
    <div class="t-rte__toolbar" role="group" :aria-label="`${fieldLabel} formatting`" @mousedown.prevent>
      <div class="t-rte__group" role="group" aria-label="Text style">
        <button
          type="button"
          class="t-rte__btn"
          :class="{ 't-rte__btn--active': isBoldActive }"
          aria-label="Bold"
          title="Bold"
          :aria-pressed="isBoldActive"
          :disabled="disabled"
          @click="editor?.chain().focus().toggleBold().run()"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          class="t-rte__btn"
          :class="{ 't-rte__btn--active': isItalicActive }"
          aria-label="Italic"
          title="Italic"
          :aria-pressed="isItalicActive"
          :disabled="disabled"
          @click="editor?.chain().focus().toggleItalic().run()"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          class="t-rte__btn"
          :class="{ 't-rte__btn--active': isUnderlineActive }"
          aria-label="Underline"
          title="Underline"
          :aria-pressed="isUnderlineActive"
          :disabled="disabled"
          @click="editor?.chain().focus().toggleUnderline().run()"
        >
          <u>U</u>
        </button>
      </div>

      <div v-if="richtextMode === 'block'" class="t-rte__group" role="group" aria-label="Paragraph formatting">
        <button
          type="button"
          class="t-rte__btn"
          :class="{ 't-rte__btn--active': isBulletListActive }"
          aria-label="Bulleted list"
          title="Bulleted list"
          :aria-pressed="isBulletListActive"
          :disabled="disabled"
          @click="editor?.chain().focus().toggleBulletList().run()"
        >
          <span class="material-icons-outlined" aria-hidden="true">format_list_bulleted</span>
        </button>
        <button
          type="button"
          class="t-rte__btn"
          :class="{ 't-rte__btn--active': isOrderedListActive }"
          aria-label="Numbered list"
          title="Numbered list"
          :aria-pressed="isOrderedListActive"
          :disabled="disabled"
          @click="editor?.chain().focus().toggleOrderedList().run()"
        >
          <span class="material-icons-outlined" aria-hidden="true">format_list_numbered</span>
        </button>
        <button
          type="button"
          class="t-rte__btn"
          :class="{ 't-rte__btn--active': isLinkActive }"
          aria-label="Add link"
          title="Add link"
          :aria-pressed="isLinkActive"
          :disabled="disabled"
          @click="promptLink"
        >
          <span class="material-icons-outlined" aria-hidden="true">link</span>
        </button>
      </div>

      <div v-if="isFullToolbar && typographyPresetsForDropdown.length" class="t-rte__group t-rte__group--preset" role="group" aria-label="Typography preset">
        <select
          class="t-rte__preset-select"
          :value="activeInlinePreset ?? PRESET_PLACEHOLDER"
          aria-label="Typography preset"
          title="Typography preset"
          :disabled="disabled"
          @change="setInlinePreset(parseInlineDropdown(($event.target as HTMLSelectElement).value))"
          @mousedown.stop
        >
          <option :value="PRESET_PLACEHOLDER" disabled>Typography Preset</option>
          <option :value="PRESET_CLEAR" class="t-rte__clear-option">Clear</option>
          <optgroup v-for="group in groupByCategory(typographyPresetsForDropdown)" :key="group.category" :label="group.category">
            <option v-for="p in group.items" :key="p.key" :value="p.key">{{ p.name }}</option>
          </optgroup>
        </select>
      </div>

      <button
        v-if="isFullToolbar"
        type="button"
        class="t-rte__more"
        :class="{ 't-rte__more--active': showAdvanced }"
        :aria-expanded="showAdvanced"
        :aria-controls="advancedId"
        :disabled="disabled"
        title="More typography controls"
        @click="showAdvanced = !showAdvanced"
      >
        <span class="material-icons-outlined" aria-hidden="true">tune</span>
        <span>More</span>
      </button>

      <div v-if="isFullToolbar && showAdvanced" :id="advancedId" class="t-rte__advanced" role="group" aria-label="Typography overrides">
        <button
          type="button"
          class="t-rte__btn"
          :class="{ 't-rte__btn--active': isStrikeActive }"
          title="Strikethrough"
          aria-label="Strikethrough"
          :aria-pressed="isStrikeActive"
          :disabled="disabled"
          @click="editor?.chain().focus().toggleStrike().run()"
        >
          <s>S</s>
        </button>

        <label class="t-rte__color-control" title="Text color">
          <span
            class="t-rte__color-swatch"
            :class="{ 't-rte__color-swatch--empty': !activeColor }"
            :style="{ backgroundColor: activeColor ?? 'transparent' }"
          />
          <input
            type="color"
            class="t-rte__color-input"
            :value="activeColor ?? '#000000'"
            aria-label="Text color"
            :disabled="disabled"
            @input="setColor(($event.target as HTMLInputElement).value)"
            @mousedown.stop
          >
        </label>

        <select
          class="t-rte__override-select"
          :value="activeWeight ?? OVERRIDE_PLACEHOLDER"
          title="Font weight"
          aria-label="Font weight"
          :disabled="disabled"
          @change="setWeight(($event.target as HTMLSelectElement).value)"
          @mousedown.stop
        >
          <option :value="OVERRIDE_PLACEHOLDER" disabled>Weight</option>
          <option v-for="w in WEIGHT_OPTIONS" :key="w.value" :value="w.value">{{ w.label }}</option>
        </select>

        <select
          class="t-rte__override-select"
          :value="activeSize ?? OVERRIDE_PLACEHOLDER"
          title="Font size"
          aria-label="Font size"
          :disabled="disabled"
          @change="setSize(($event.target as HTMLSelectElement).value)"
          @mousedown.stop
        >
          <option :value="OVERRIDE_PLACEHOLDER" disabled>Size</option>
          <option v-for="s in SIZE_OPTIONS" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>

        <button
          type="button"
          class="t-rte__btn"
          title="Clear inline overrides (color, weight, size). Does not affect strike, bold, italic, underline, link, or preset bindings."
          aria-label="Clear inline typography overrides"
          :disabled="disabled"
          @click="clearOverrides"
        >
          <span class="material-icons-outlined" aria-hidden="true">format_clear</span>
        </button>
      </div>
    </div>
    <EditorContent
      class="t-rte__content"
      :data-mode="richtextMode"
      :editor="editor"
      :aria-label="fieldLabel"
    />
  </BaseField>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject, onBeforeUnmount, useId, type ComputedRef } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import BaseField from './BaseField.vue'
import { useTranslatableValue } from '~/admin/composables/useTranslatableValue'
import { createRichTextExtensions } from '~/shared/tiptap/extensions'
import { isSafeUrl } from '~/shared/tiptap/urlPolicy'
import type { TipTapDocument } from '~/shared/tiptap/types'
import type { TypographyPreset } from '~/server/services/typography/typographyTypes'
import { modeFromFieldType, type RichtextMode } from '~/shared/tiptap/richtextModes'
import { seedDefaultDoc } from '~/shared/tiptap/seedDefaultDoc'
import { Extension } from '@tiptap/core'
import { getLocalizedLabel } from '~/admin/utils/labelUtils'

type ModelValue = string | TipTapDocument | Record<string, string | TipTapDocument> | null

const props = defineProps<{
  field: Record<string, any>
  modelValue?: ModelValue
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ModelValue]
  'validation-error': [fieldId: string, error: string | null]
}>()

const editingLocale = inject<ComputedRef<string>>('editingLocale')
const typographyPresets = inject<ComputedRef<TypographyPreset[]>>('typographyPresets', computed(() => []))
const error = ref<string | null>(null)
let isUpdatingFromProp = false

const fieldLabel = computed(() => getLocalizedLabel(props.field.label) || String(props.field.id || 'Rich text'))

const { displayValue, handleInput } = useTranslatableValue(
  () => props.modelValue as any,
  () => props.field.translatable,
  (value) => emit('update:modelValue', value),
  () => editingLocale?.value ?? 'en-US',
)

// Derive the richtext mode from the schema field type. Defaults to 'block'
// so the existing `richtext` field type keeps behaving as Phase 1.
const richtextMode = computed<RichtextMode>(() => {
  return modeFromFieldType(props.field.type ?? 'richtext') ?? 'block'
})

const defaultPresetKey = computed<string | null>(() => props.field.defaultPresetKey ?? null)

// Initial editor content: prefer existing value, else seed from default preset
// for block mode only. Single/inline modes mount empty — typography surfaces
// via the role cascade until the author picks a preset from the dropdown.
const initialContent = computed(() => {
  if (displayValue.value && displayValue.value !== '') return displayValue.value
  if (richtextMode.value !== 'block') return ''
  const seeded = seedDefaultDoc({ mode: richtextMode.value, defaultPresetKey: defaultPresetKey.value })
  return seeded ?? ''
})

// Single mode disables Enter so authors can't accidentally split a one-line
// field. Inline mode binds Enter → hardBreak (StarterKit default already does
// this when hardBreak is enabled and paragraph is disabled). Block mode keeps
// Enter = new paragraph (StarterKit default).
function makeSingleModeKeymap() {
  return Extension.create({
    name: 'singleModeKeymap',
    addKeyboardShortcuts() {
      return {
        'Enter': () => true,           // swallow
        'Mod-Enter': () => true,
        'Shift-Enter': () => true,
      }
    },
  })
}

const editor = useEditor({
  editable: !props.disabled,
  content: initialContent.value,
  extensions: (() => {
    const base = createRichTextExtensions({ mode: richtextMode.value })
    if (richtextMode.value === 'single') base.push(makeSingleModeKeymap())
    return base
  })(),
  onUpdate({ editor: ed }) {
    if (isUpdatingFromProp) return
    handleInput(ed.getJSON() as TipTapDocument)
  },
})

// Sync content on locale switch or external modelValue change.
// Guard: only call setContent when the incoming value is genuinely
// different from what the editor currently holds. Without this guard,
// every parent re-render creates a new object reference, re-triggers
// this watcher, and calls setContent — which resets ProseMirror's
// selection state and causes the cursor to jump to the end on every
// keystroke.
watch(displayValue, (newVal) => {
  if (!editor.value) return
  if (isSameContent(newVal, editor.value)) return
  isUpdatingFromProp = true
  editor.value.commands.setContent(newVal ?? '', { emitUpdate: false })
  isUpdatingFromProp = false
})

/**
 * Compare incoming value against what the editor currently holds.
 * - TipTap JSON doc → deep-equal against editor.getJSON()
 * - String (HTML) → equal against editor.getHTML()
 * - Empty/null → editor is empty
 */
function isSameContent(incoming: string | TipTapDocument | null | undefined, ed: NonNullable<typeof editor.value>): boolean {
  if (incoming === null || incoming === undefined || incoming === '') {
    return ed.isEmpty
  }
  if (typeof incoming === 'string') {
    return ed.getHTML() === incoming
  }
  // TipTap JSON doc
  try {
    return JSON.stringify(ed.getJSON()) === JSON.stringify(incoming)
  } catch {
    return false
  }
}

// Reflect disabled prop reactively.
watch(
  () => props.disabled,
  (val) => editor.value?.setEditable(!val),
)

onBeforeUnmount(() => editor.value?.destroy())

function promptLink() {
  const url = window.prompt('Enter URL')
  if (!url) return
  if (!isSafeUrl(url)) {
    window.alert('Only http, https, mailto, and tel links are allowed.')
    return
  }
  editor.value?.chain().focus().setLink({ href: url }).run()
}

// Toolbar mode. New richtext-{single,inline,block} field types always show
// the full toolbar (typography preset + color/weight/size + strike + clear).
// Legacy `richtext` fields keep the opt-in behavior via options.toolbar
// for back-compat with Phase 1 schemas that explicitly set 'default'.
const toolbarMode = computed(() => props.field.options?.toolbar ?? 'default')
const isFullToolbar = computed(() => {
  if (richtextMode.value !== null && props.field.type !== 'richtext') return true
  return toolbarMode.value === 'full'
})
const showAdvanced = ref(false)
const advancedId = `t-rte-advanced-${useId()}`

// Single Typography Preset dropdown surface — union of presets eligible
// for paragraph OR inline use. Authors think in "apply this typography
// preset to my selection"; the editor implements this via the inline
// mark mechanism (wraps selection in <span class="rt-preset-X">) which
// works regardless of existing inline overrides on the same range.
//
// The split paragraph-vs-inline dropdown was conceptually correct but
// confused authors: paragraph-level changes lost to existing inline
// preset markers via CSS specificity, and the user's mental model is
// just "select text, pick style". Single dropdown removes the fight.
const typographyPresetsForDropdown = computed(() => {
  if (!isFullToolbar.value) return []
  return typographyPresets.value
    .filter(p => p.isActive && (p.isRichTextParagraphEligible || p.isRichTextInlineEligible))
    .sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category)
      if (a.position !== b.position) return a.position - b.position
      return a.name.localeCompare(b.name)
    })
})

// Sentinel values for dropdown options (native selects can't use two value="" options)
const PRESET_PLACEHOLDER = '__placeholder__'
const PRESET_CLEAR = '__clear__'

/**
 * Inspect inline preset marks across the current selection.
 * Returns the common presetKey if uniform, null if mixed or none.
 */
const activeInlinePreset = computed(() => {
  if (!editor.value) return null
  const { state } = editor.value
  const { from, to } = state.selection
  const keys = new Set<string | null>()

  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return
    const mark = node.marks.find(m => m.type.name === 'inlineTypographyPreset')
    keys.add(mark?.attrs.presetKey ?? null)
  })

  if (keys.size !== 1) return null
  return [...keys][0]
})

function setInlinePreset(key: string | null) {
  if (!editor.value) return
  if (key === null) {
    editor.value.chain().focus().unsetMark('inlineTypographyPreset').run()
  } else if (key === activeInlinePreset.value) {
    editor.value.chain().focus().unsetMark('inlineTypographyPreset').run()
  } else {
    editor.value.chain().focus().setMark('inlineTypographyPreset', { presetKey: key }).run()
  }
}

function parseInlineDropdown(value: string): string | null {
  if (value === PRESET_PLACEHOLDER || value === PRESET_CLEAR) return null
  return value
}

// Inline override UI options + sentinels.
const OVERRIDE_PLACEHOLDER = '__placeholder__'

const WEIGHT_OPTIONS = [
  { value: '__clear__', label: 'Default' },
  { value: '300', label: '300 Light' },
  { value: '400', label: '400 Regular' },
  { value: '500', label: '500 Medium' },
  { value: '600', label: '600 Semibold' },
  { value: '700', label: '700 Bold' },
] as const

// Toolbar exposes EVERY size in inlineStyleAllowlist.ALLOWED_FONT_SIZES.
// The two lists must stay in lock-step: a value the toolbar offers but
// the sanitizer rejects (or vice-versa) creates an unfixable confusing
// loop where the picker apparently does nothing.
const SIZE_OPTIONS = [
  { value: '__clear__', label: 'Default' },
  { value: '0.75rem', label: 'XS' },
  { value: '0.875rem', label: 'Small' },
  { value: '1rem', label: 'Base' },
  { value: '1.125rem', label: 'Large' },
  { value: '1.25rem', label: 'XL' },
  { value: '1.5rem', label: '2XL' },
  { value: '2rem', label: 'Display' },
  { value: '3rem', label: 'XL Display' },
] as const

const isBoldActive = computed(() => editor.value?.isActive('bold') ?? false)
const isItalicActive = computed(() => editor.value?.isActive('italic') ?? false)
const isUnderlineActive = computed(() => editor.value?.isActive('underline') ?? false)
const isBulletListActive = computed(() => editor.value?.isActive('bulletList') ?? false)
const isOrderedListActive = computed(() => editor.value?.isActive('orderedList') ?? false)
const isLinkActive = computed(() => editor.value?.isActive('link') ?? false)
const isStrikeActive = computed(() => editor.value?.isActive('strike') ?? false)

function activeMarkAttr(markName: string, attrName: string): string | null {
  if (!editor.value) return null
  const attrs = editor.value.getAttributes(markName) as Record<string, unknown> | null
  const v = attrs?.[attrName]
  return typeof v === 'string' && v.length > 0 ? v : null
}

const activeColor = computed(() => activeMarkAttr('textColor', 'color'))
const activeWeight = computed(() => activeMarkAttr('fontWeight', 'weight'))
const activeSize = computed(() => activeMarkAttr('fontSize', 'size'))

function setColor(value: string) {
  if (!editor.value) return
  if (!value) {
    editor.value.chain().focus().unsetMark('textColor').run()
    return
  }
  editor.value.chain().focus().setMark('textColor', { color: value }).run()
}

function setWeight(value: string) {
  if (!editor.value) return
  if (value === OVERRIDE_PLACEHOLDER) return
  if (value === '__clear__') {
    editor.value.chain().focus().unsetMark('fontWeight').run()
    return
  }
  editor.value.chain().focus().setMark('fontWeight', { weight: value }).run()
}

function setSize(value: string) {
  if (!editor.value) return
  if (value === OVERRIDE_PLACEHOLDER) return
  if (value === '__clear__') {
    editor.value.chain().focus().unsetMark('fontSize').run()
    return
  }
  editor.value.chain().focus().setMark('fontSize', { size: value }).run()
}

/**
 * Targeted unset: removes ONLY the inline override marks (textColor,
 * fontWeight, fontSize). Leaves strike, bold, italic, underline, link,
 * and preset bindings (paragraph + inline) untouched.
 *
 * Strike is structural like bold/italic/underline — authors toggle it
 * via the dedicated strike button. A separate, broader "clear all
 * formatting" action can be added in a future phase if the use case
 * surfaces; Phase 1 keeps the scope narrow to "drop my local visual
 * exceptions, keep every other binding."
 */
function clearOverrides() {
  if (!editor.value) return
  editor.value
    .chain()
    .focus()
    .unsetMark('textColor')
    .unsetMark('fontWeight')
    .unsetMark('fontSize')
    .run()
}

function groupByCategory(presets: TypographyPreset[]): { category: string; items: TypographyPreset[] }[] {
  const groups = new Map<string, TypographyPreset[]>()
  for (const p of presets) {
    const list = groups.get(p.category) ?? []
    list.push(p)
    groups.set(p.category, list)
  }
  return [...groups.entries()].map(([category, items]) => ({ category, items }))
}

defineExpose({
  validate: () => {},
  hasError: computed(() => false),
})
</script>

<style scoped>
.t-rte__toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--cms-sp-1, 4px);
  padding: 5px;
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-bottom: none;
  border-radius: var(--cms-radius-control, 6px) var(--cms-radius-control, 6px) 0 0;
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
}

.t-rte__group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.t-rte__group + .t-rte__group {
  padding-left: var(--cms-sp-1, 4px);
  border-left: 1px solid var(--cms-line, var(--cms-line));
}

.t-rte__group--preset {
  flex: 1 1 128px;
}

.t-rte__toolbar select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='%236e6659' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
}

.t-rte__content {
  /* No base min-height: the per-mode rules below size the ProseMirror surface
     (24/48/120px). A base 120px overrode them, so a one-line eyebrow field
     rendered as an empty ~120px box in every settings panel. */
  padding: var(--cms-sp-2, 8px) var(--cms-sp-3, 12px);
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: 0 0 var(--cms-radius-control, 6px) var(--cms-radius-control, 6px);
  color: var(--cms-ink-body, var(--cms-ink-body));
  background: var(--cms-surface);
  font-size: var(--cms-fs-body, 14px);
  line-height: 1.5;
  transition:
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    box-shadow var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

.t-rte__toolbar:focus-within + .t-rte__content,
.t-rte__content:focus-within {
  border-color: var(--cms-accent, var(--cms-accent));
  box-shadow: 0 0 0 3px var(--cms-accent-ring, rgba(46, 125, 50, 0.2));
}

.t-rte__content :deep(.ProseMirror) {
  outline: none;
  min-height: 100%;
}
.t-rte__content :deep(.ProseMirror[contenteditable="false"]) {
  background: var(--cms-surface-sunken, var(--cms-surface-sunken));
  cursor: not-allowed;
}

/*
 * Cap font-size + line-height inside the editor's contenteditable so display
 * presets (e.g. 96px Fraunces Display) don't blow the settings panel
 * vertically. Display-only — stored TipTap JSON, sanitized HTML, and the
 * live-site renderer keep the original values verbatim.
 *
 * Other typography axes (font-family, weight, color, transform, decoration,
 * letter-spacing) remain visible so authors still get useful preset preview
 * for everything except raw size.
 *
 * !important is required because the preset utility classes
 * (.rt-preset-{key} { font-size: ... }) emit at the same specificity
 * (0,1,0). Without !important they'd win via source-order.
 */
.t-rte__content :deep(.ProseMirror),
.t-rte__content :deep(.ProseMirror *) {
  font-size: 14px !important;
  line-height: 1.5 !important;
}

.t-rte__toolbar .t-rte__preset-select {
  width: 100%;
  min-width: 0;
  height: 30px;
  padding: 0 28px 0 8px;
  border: 1px solid transparent;
  border-radius: 5px;
  color: var(--cms-ink-body, var(--cms-ink-body));
  background-color: var(--cms-surface);
  background-position: right 7px center;
  background-size: 14px;
  font-family: inherit;
  font-size: var(--cms-fs-caption, 12px);
  cursor: pointer;
}

.t-rte__clear-option {
  font-style: italic;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
}

.t-rte__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 5px;
  color: var(--cms-ink-body, var(--cms-ink-body));
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  font-size: var(--cms-fs-sm, 13px);
  line-height: 1;
  transition:
    color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    border-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

.t-rte__btn .material-icons-outlined {
  font-size: 18px;
}

.t-rte__btn--active {
  border-color: rgba(46, 125, 50, 0.2);
  color: var(--cms-accent-pressed, var(--cms-accent-pressed));
  background: var(--cms-accent-soft, var(--cms-accent-soft));
}

@media (hover: hover) and (pointer: fine) {
  .t-rte__btn:not(.t-rte__btn--active):hover,
  .t-rte__more:not(.t-rte__more--active):hover {
    color: var(--cms-ink, var(--cms-ink));
    background: var(--cms-surface-sunken, var(--cms-surface-sunken));
  }
}

.t-rte__btn:active,
.t-rte__more:active {
  transform: scale(0.94);
}

.t-rte__btn:disabled,
.t-rte__more:disabled,
.t-rte__toolbar select:disabled,
.t-rte__color-input:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.t-rte__more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 5px;
  color: var(--cms-ink-muted, var(--cms-ink-muted));
  background: transparent;
  font-family: inherit;
  font-size: var(--cms-fs-caption, 12px);
  cursor: pointer;
  transition:
    color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    background-color var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out),
    transform var(--cms-motion-fast, 120ms) var(--cms-ease-out, ease-out);
}

.t-rte__more .material-icons-outlined {
  font-size: 16px;
}

.t-rte__more--active {
  color: var(--cms-accent-pressed, var(--cms-accent-pressed));
  background: var(--cms-accent-soft, var(--cms-accent-soft));
}

.t-rte__advanced {
  display: flex;
  align-items: center;
  flex: 1 0 100%;
  flex-wrap: wrap;
  gap: 4px;
  padding: 5px 0 0;
  border-top: 1px solid var(--cms-line, var(--cms-line));
}

.t-rte__toolbar .t-rte__color-control {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  margin: 0;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: var(--cms-surface);
  cursor: pointer;
}

.t-rte__color-control {
  font-size: var(--cms-fs-caption, 12px);
}

.t-rte__color-swatch {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 1px solid var(--cms-line-strong, var(--cms-line-strong));
  border-radius: 3px;
}

.t-rte__color-swatch--empty {
  background-image: linear-gradient(45deg, var(--cms-line) 25%, transparent 25%), linear-gradient(-45deg, var(--cms-line) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--cms-line) 75%), linear-gradient(-45deg, transparent 75%, var(--cms-line) 75%);
  background-position: 0 0, 0 5px, 5px -5px, -5px 0;
  background-size: 10px 10px;
}

.t-rte__color-input {
  width: 20px;
  height: 20px;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
}

.t-rte__toolbar .t-rte__override-select {
  min-width: 86px;
  max-width: 126px;
  height: 30px;
  padding: 0 26px 0 8px;
  border: 1px solid transparent;
  border-radius: 5px;
  color: var(--cms-ink-body, var(--cms-ink-body));
  background-color: var(--cms-surface);
  background-position: right 7px center;
  background-size: 14px;
  font-family: inherit;
  font-size: var(--cms-fs-caption, 12px);
  cursor: pointer;
}

.t-rte__toolbar .t-rte__preset-select:focus-visible,
.t-rte__toolbar .t-rte__override-select:focus-visible {
  outline: none;
  border-color: var(--cms-accent, var(--cms-accent));
  box-shadow: 0 0 0 2px var(--cms-accent-ring, rgba(46, 125, 50, 0.2));
}

.t-rte__content[data-mode="single"] :deep(.ProseMirror) {
  min-height: 24px;
  white-space: nowrap;
  overflow-x: auto;
}
.t-rte__content[data-mode="inline"] :deep(.ProseMirror) {
  min-height: 48px;
}
.t-rte__content[data-mode="block"] :deep(.ProseMirror) {
  min-height: 120px;
}
</style>
