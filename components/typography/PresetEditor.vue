<template>
  <section class="preset-editor cms-card">
    <div class="cms-card__header preset-editor__header">
      <div>
        <h3 class="cms-card__title">{{ draft.name || 'Untitled Preset' }}</h3>
        <div class="preset-editor__meta">
          <span
            class="cms-badge badge"
            :class="draft.isActive ? 'cms-badge--success' : 'cms-badge--neutral'"
          >
            {{ draft.isActive ? 'Active' : 'Inactive' }}
          </span>
          <span class="preset-editor__key">{{ preset.key }}</span>
        </div>
      </div>
      <button
        type="button"
        class="cms-btn cms-btn--secondary cms-btn--sm"
        :disabled="saving || !isDirty"
        @click="resetDraft"
      >
        Revert
      </button>
    </div>

    <div class="cms-card__body preset-editor__body">
      <div data-testid="preset-preview" class="preset-editor__preview">
        <div class="preset-editor__preview-eyebrow">Live preview</div>
        <div class="preset-editor__preview-heading" :style="previewHeadingStyle">
          {{ draft.name || 'Heading Sample' }}
        </div>
        <div class="preset-editor__preview-body" :style="previewBodyStyle">
          The quick brown fox jumps over the lazy dog
        </div>
        <div class="preset-editor__preview-meta" :style="previewMetaStyle">
          ABCDEFG 0123456789
        </div>
      </div>

      <div class="preset-editor__section">
        <div class="preset-editor__section-title">Basic Typography</div>

        <div class="cms-form-group">
          <label class="cms-label" for="preset-name">Name</label>
          <input
            id="preset-name"
            v-model="draft.name"
            data-field="name"
            type="text"
            class="cms-form-control"
          />
        </div>

        <div class="preset-editor__grid">
          <div class="cms-form-group">
            <label class="cms-label" for="preset-category">Category</label>
            <select
              id="preset-category"
              v-model="draft.category"
              data-field="category"
              class="cms-form-control"
            >
              <option
                v-for="category in PRESET_CATEGORIES"
                :key="category"
                :value="category"
              >
                {{ formatCategoryLabel(category) }}
              </option>
            </select>
          </div>

          <div v-if="!exposesAxis('wght')" class="cms-form-group">
            <label class="cms-label" for="preset-weight">Font Weight</label>
            <select
              id="preset-weight"
              :value="draft.fontWeight ?? ''"
              data-field="fontWeight"
              class="cms-form-control"
              @change="updateFontWeight"
            >
              <option value="">Inherit</option>
              <option v-for="weight in FONT_WEIGHTS" :key="weight" :value="weight">
                {{ weight }}
              </option>
            </select>
          </div>
        </div>

        <div class="cms-form-group">
          <label class="cms-label" for="preset-font-family">Font Family</label>
          <select
            v-if="fontFamilies.length > 0"
            id="preset-font-family"
            :value="draft.fontFamily"
            data-field="fontFamily"
            class="cms-form-control"
            @change="commitFontFamilyChange(($event.target as HTMLSelectElement).value)"
          >
            <option value="">Inherit</option>
            <option v-for="fontFamily in fontFamilies" :key="fontFamily" :value="fontFamily">
              {{ fontFamily }}
            </option>
          </select>
          <input
            v-else
            id="preset-font-family"
            v-model="draft.fontFamily"
            data-field="fontFamily"
            type="text"
            class="cms-form-control"
            placeholder="e.g. DM Serif Display"
            @blur="commitFontFamilyChange(draft.fontFamily)"
          />
        </div>

        <div class="cms-form-group">
          <label class="cms-label" for="preset-font-size">Font Size</label>
          <input
            id="preset-font-size"
            v-model="draft.fontSize"
            data-field="fontSize"
            type="text"
            class="cms-form-control"
            placeholder="e.g. 1.25rem or 18px"
          />
        </div>

        <div class="cms-form-group">
          <label class="cms-label">Color</label>
          <div class="preset-editor__color-row">
            <button
              type="button"
              class="cms-btn cms-btn--secondary cms-btn--sm"
              data-action="toggle-color"
              @click="toggleColor"
            >
              {{ colorModeLabel }}
            </button>
            <input
              v-if="usesExplicitColor"
              v-model="draft.color"
              type="color"
              class="preset-editor__color-picker"
            />
          </div>
        </div>
      </div>

      <!-- SPL-008: axis-loss warning + unsupported-axes warning.
           Placed OUTSIDE the variable-font gate so warnings survive a
           variable→static family switch while authored axes are still stored. -->
      <section
        v-if="recentAxisLoss !== null || unsupportedAxisKeys.length > 0"
        class="preset-editor__section preset-editor__axes-warnings"
      >
        <!-- Axis-loss warning: shown after a committed family change drops authored axes. -->
        <div
          v-if="recentAxisLoss !== null"
          class="preset-editor__warning"
          data-testid="axis-loss-warning"
        >
          <p class="preset-editor__warning-title">
            <strong>Optical-size rendering lost</strong>
          </p>
          <p v-if="axisLossHasOpsz">
            This font doesn't support <code>opsz</code> (optical size). The display preset was tuned
            for auto optical sizing — it may appear tighter or heavier at large sizes under the static
            fallback.
          </p>
          <p v-else>
            This font doesn't support the previously used axes
            ({{ recentAxisLoss.lostAuthoredTags.join(', ') }}). Those overrides are preserved but
            won't render until a compatible font is selected.
          </p>
          <p class="preset-editor__warning-metrics">
            Active fallback values:
            weight <strong>{{ forcedLegacyPreview.props.weight }}</strong> ·
            line-height <strong>{{ forcedLegacyPreview.props['line-height'] }}</strong> ·
            letter-spacing <strong>{{ forcedLegacyPreview.props['letter-spacing'] }}</strong>
          </p>
          <div
            v-if="recentAxisLoss.previousAxisWeight !== null && recentAxisLoss.previousAxisWeight !== draft.fontWeight"
            class="preset-editor__warning-actions"
          >
            <button
              type="button"
              class="preset-editor__warning-btn"
              data-action="apply-previous-variable-weight"
              @click="draft.fontWeight = recentAxisLoss!.previousAxisWeight!"
            >
              Copy previous axis weight ({{ recentAxisLoss.previousAxisWeight }}) → font-weight
            </button>
          </div>
        </div>

        <!-- Unsupported-axes warning: extracted here so it persists after switching to a static font. -->
        <div
          v-if="unsupportedAxisKeys.length > 0"
          class="preset-editor__warning"
          data-testid="unsupported-axes-warning"
        >
          <p>
            This preset has {{ unsupportedAxisKeys.length }} axis value(s)
            ({{ unsupportedAxisKeys.join(', ') }}) not supported by the current font.
            They're preserved but won't render.
          </p>
          <button
            type="button"
            class="preset-editor__warning-btn"
            data-action="clear-unsupported-axes"
            @click="clearUnsupportedAxes"
          >
            Clear unsupported axes
          </button>
        </div>
      </section>

      <section
        v-if="isVariableFont && malformedAxisDiagnostics.length > 0"
        class="preset-editor__section preset-editor__axes"
        data-testid="preset-malformed-axes"
      >
        <div
          class="preset-editor__warning"
          data-testid="malformed-axes-warning"
        >
          <p>
            Font "{{ activeVariant?.family || activeVariant?.name }}" has
            {{ malformedAxisDiagnostics.length }} malformed axis definition(s)
            in theme.json. These axes are hidden until theme.json is corrected.
          </p>
          <ul class="preset-editor__warning-list">
            <li v-for="diagnostic in malformedAxisDiagnostics" :key="diagnostic.tag">
              <code>{{ diagnostic.tag }}</code>: {{ diagnostic.message }}
            </li>
          </ul>
          <p v-if="malformedAxesBlockSave" data-testid="malformed-axes-save-blocked">
            Save is disabled because this preset stores a value for one of the
            malformed axes. Fix theme.json or reset the affected axis to
            re-enable saving.
          </p>
        </div>
      </section>

      <section
        v-if="isVariableFont && resolvedAxes.length > 0"
        class="preset-editor__section preset-editor__axes"
        data-testid="preset-axes"
      >
        <div class="preset-editor__section-title">Variable Axes</div>

        <AxisControl
          v-for="axis in axisControlList"
          :key="axis.tag"
          :axis="{
            tag: axis.tag,
            label: activeVariant?.axes?.[axis.tag]?.label,
            min: activeVariant!.axes![axis.tag]!.min,
            max: activeVariant!.axes![axis.tag]!.max,
            default: activeVariant!.axes![axis.tag]!.default,
            step: activeVariant!.axes![axis.tag]!.step,
            experimental: activeVariant!.axes![axis.tag]!.experimental,
          }"
          :model-value="axis.value"
          :stored-value="axis.outOfRange ? axis.storedValue : undefined"
          @update:model-value="setAxis(axis.tag, $event)"
          @reset="resetAxis(axis.tag)"
        />
      </section>

      <div class="preset-editor__section">
        <button
          type="button"
          class="preset-editor__section-toggle"
          @click="advancedOpen = !advancedOpen"
        >
          <span class="material-icons-outlined">{{ advancedOpen ? 'expand_more' : 'chevron_right' }}</span>
          Advanced Typography
        </button>

        <div v-if="advancedOpen" class="preset-editor__advanced">
          <div class="preset-editor__grid">
            <div class="cms-form-group">
              <label class="cms-label" for="preset-line-height">Line Height</label>
              <input
                id="preset-line-height"
                v-model="draft.lineHeight"
                type="text"
                class="cms-form-control"
                placeholder="e.g. 1.5 or 24px"
              />
            </div>

            <div class="cms-form-group">
              <label class="cms-label" for="preset-letter-spacing">Letter Spacing</label>
              <input
                id="preset-letter-spacing"
                v-model="draft.letterSpacing"
                type="text"
                class="cms-form-control"
                placeholder="e.g. 0.05em or 1px"
              />
            </div>
          </div>

          <div class="cms-form-group">
            <label class="cms-label" for="preset-transform">Text Transform</label>
            <select
              id="preset-transform"
              v-model="draft.textTransform"
              class="cms-form-control"
            >
              <option v-for="transform in TEXT_TRANSFORMS" :key="transform" :value="transform">
                {{ formatCategoryLabel(transform) }}
              </option>
            </select>
          </div>

          <!-- Style group: font-style, font-stretch, font-synthesis -->
          <div class="preset-editor__group-title">Style</div>

          <div class="preset-editor__grid">
            <div class="cms-form-group">
              <label class="cms-label" for="preset-font-style">Font Style</label>
              <select
                id="preset-font-style"
                v-model="draft.fontStyle"
                data-field="fontStyle"
                class="cms-form-control"
              >
                <option :value="null">— not set —</option>
                <option v-for="s in FONT_STYLES" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>

            <div class="cms-form-group">
              <label class="cms-label" for="preset-font-stretch">Font Stretch</label>
              <select
                id="preset-font-stretch"
                v-model="draft.fontStretch"
                data-field="fontStretch"
                class="cms-form-control"
              >
                <option :value="null">— not set —</option>
                <option value="ultra-condensed">Ultra Condensed</option>
                <option value="extra-condensed">Extra Condensed</option>
                <option value="condensed">Condensed</option>
                <option value="semi-condensed">Semi Condensed</option>
                <option value="normal">Normal</option>
                <option value="semi-expanded">Semi Expanded</option>
                <option value="expanded">Expanded</option>
                <option value="extra-expanded">Extra Expanded</option>
                <option value="ultra-expanded">Ultra Expanded</option>
              </select>
            </div>
          </div>

          <div class="cms-form-group">
            <label class="cms-label" for="preset-font-synthesis">Font Synthesis</label>
            <select
              id="preset-font-synthesis"
              v-model="draft.fontSynthesis"
              data-field="fontSynthesis"
              class="cms-form-control"
            >
              <option :value="null">— not set —</option>
              <option value="none">None (disable all synthesis)</option>
              <option value="weight">Weight only</option>
              <option value="style">Style only</option>
              <option value="small-caps">Small caps only</option>
              <option value="weight style">Weight + Style</option>
              <option value="weight style small-caps">Weight + Style + Small caps</option>
            </select>
          </div>

          <!-- Spacing group: text-align, word-spacing, text-indent -->
          <div class="preset-editor__group-title">Spacing &amp; Alignment</div>

          <div class="cms-form-group">
            <label class="cms-label" for="preset-text-align">Text Align</label>
            <select
              id="preset-text-align"
              v-model="draft.textAlign"
              data-field="textAlign"
              class="cms-form-control"
            >
              <option :value="null">— not set —</option>
              <option v-for="a in TEXT_ALIGNS" :key="a" :value="a">{{ a }}</option>
            </select>
          </div>

          <div class="preset-editor__grid">
            <div class="cms-form-group">
              <label class="cms-label" for="preset-word-spacing">Word Spacing</label>
              <input
                id="preset-word-spacing"
                v-model="draft.wordSpacing"
                data-field="wordSpacing"
                type="text"
                class="cms-form-control"
                placeholder="e.g. 0.1em or normal"
              />
            </div>

            <div class="cms-form-group">
              <label class="cms-label" for="preset-text-indent">Text Indent</label>
              <input
                id="preset-text-indent"
                v-model="draft.textIndent"
                data-field="textIndent"
                type="text"
                class="cms-form-control"
                placeholder="e.g. 2em or 10%"
              />
            </div>
          </div>

          <!-- Decoration group: text-decoration-line, -style, -thickness -->
          <div class="preset-editor__group-title">Text Decoration</div>

          <div class="preset-editor__grid preset-editor__grid--3">
            <div class="cms-form-group">
              <label class="cms-label" for="preset-decoration-line">Line</label>
              <select
                id="preset-decoration-line"
                v-model="draft.textDecorationLine"
                data-field="textDecorationLine"
                class="cms-form-control"
              >
                <option :value="null">— not set —</option>
                <option v-for="d in TEXT_DECORATION_LINES" :key="d" :value="d">{{ d }}</option>
              </select>
            </div>

            <div class="cms-form-group">
              <label class="cms-label" for="preset-decoration-style">Style</label>
              <select
                id="preset-decoration-style"
                v-model="draft.textDecorationStyle"
                data-field="textDecorationStyle"
                class="cms-form-control"
              >
                <option :value="null">— not set —</option>
                <option v-for="s in TEXT_DECORATION_STYLES" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>

            <div class="cms-form-group">
              <label class="cms-label" for="preset-decoration-thickness">Thickness</label>
              <input
                id="preset-decoration-thickness"
                v-model="draft.textDecorationThickness"
                data-field="textDecorationThickness"
                type="text"
                class="cms-form-control"
                placeholder="auto / from-font / 2px"
              />
            </div>
          </div>

          <!-- OpenType group: font-variant-* + font-feature-settings -->
          <div class="preset-editor__group-title">OpenType Features</div>

          <div class="preset-editor__grid">
            <div class="cms-form-group">
              <label class="cms-label" for="preset-variant-caps">Variant Caps</label>
              <select
                id="preset-variant-caps"
                v-model="draft.fontVariantCaps"
                data-field="fontVariantCaps"
                class="cms-form-control"
              >
                <option :value="null">— not set —</option>
                <option v-for="v in FONT_VARIANT_CAPS_VALUES" :key="v" :value="v">{{ v }}</option>
              </select>
            </div>

            <div class="cms-form-group">
              <label class="cms-label" for="preset-variant-numeric">Variant Numeric</label>
              <select
                id="preset-variant-numeric"
                v-model="draft.fontVariantNumeric"
                data-field="fontVariantNumeric"
                class="cms-form-control"
              >
                <option :value="null">— not set —</option>
                <option v-for="v in FONT_VARIANT_NUMERIC_VALUES" :key="v" :value="v">{{ v }}</option>
              </select>
            </div>
          </div>

          <div class="cms-form-group">
            <label class="cms-label" for="preset-variant-ligatures">Variant Ligatures</label>
            <select
              id="preset-variant-ligatures"
              v-model="draft.fontVariantLigatures"
              data-field="fontVariantLigatures"
              class="cms-form-control"
            >
              <option :value="null">— not set —</option>
              <option value="normal">Normal</option>
              <option value="none">None</option>
              <option value="common-ligatures">Common Ligatures</option>
              <option value="no-common-ligatures">No Common Ligatures</option>
              <option value="discretionary-ligatures">Discretionary Ligatures</option>
              <option value="no-discretionary-ligatures">No Discretionary Ligatures</option>
              <option value="historical-ligatures">Historical Ligatures</option>
              <option value="no-historical-ligatures">No Historical Ligatures</option>
              <option value="contextual">Contextual</option>
              <option value="no-contextual">No Contextual</option>
            </select>
          </div>

          <div class="cms-form-group">
            <label class="cms-label" for="preset-feature-settings">
              Font Feature Settings
              <span
                v-if="draft.fontFeatureSettings"
                class="preset-editor__advanced-override"
                title="Raw font-feature-settings string active"
              >advanced override active</span>
            </label>
            <input
              id="preset-feature-settings"
              v-model="draft.fontFeatureSettings"
              data-field="fontFeatureSettings"
              type="text"
              class="cms-form-control preset-editor__monospace"
              placeholder='e.g. "liga" 1, "smcp" 1, "ss01" 1'
            />
            <div class="preset-editor__field-hint">
              Raw OpenType feature string. Overrides variant controls above when set.
            </div>
          </div>

          <!-- Rendering group: font-kerning, font-optical-sizing, text-rendering -->
          <div class="preset-editor__group-title">Rendering</div>

          <div class="preset-editor__grid preset-editor__grid--3">
            <div class="cms-form-group">
              <label class="cms-label" for="preset-font-kerning">Kerning</label>
              <select
                id="preset-font-kerning"
                v-model="draft.fontKerning"
                data-field="fontKerning"
                class="cms-form-control"
              >
                <option :value="null">— not set —</option>
                <option v-for="v in FONT_KERNING_VALUES" :key="v" :value="v">{{ v }}</option>
              </select>
            </div>

            <div class="cms-form-group">
              <label class="cms-label" for="preset-optical-sizing">
                Optical Sizing
                <span
                  v-if="!isVariableFont && draft.fontFamily"
                  class="preset-editor__capability-note"
                  title="Optical sizing is most effective with variable fonts that have an opsz axis"
                >static font</span>
              </label>
              <select
                id="preset-optical-sizing"
                v-model="draft.fontOpticalSizing"
                data-field="fontOpticalSizing"
                class="cms-form-control"
              >
                <option :value="null">— not set —</option>
                <option v-for="v in FONT_OPTICAL_SIZING_VALUES" :key="v" :value="v">{{ v }}</option>
              </select>
            </div>

            <div class="cms-form-group">
              <label class="cms-label" for="preset-text-rendering">Text Rendering</label>
              <select
                id="preset-text-rendering"
                v-model="draft.textRendering"
                data-field="textRendering"
                class="cms-form-control"
              >
                <option :value="null">— not set —</option>
                <option v-for="v in TEXT_RENDERING_VALUES" :key="v" :value="v">{{ v }}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div class="preset-editor__section">
        <div class="preset-editor__section-title">Eligibility Flags</div>

        <label class="preset-editor__flag">
          <input v-model="draft.isActive" type="checkbox">
          <span>Active</span>
        </label>
        <label class="preset-editor__flag">
          <input v-model="draft.isRoleAssignable" type="checkbox">
          <span>Role assignable</span>
        </label>
        <label class="preset-editor__flag">
          <input v-model="draft.isBlockOverrideEligible" type="checkbox">
          <span>Block slot override</span>
        </label>
        <label class="preset-editor__flag">
          <input v-model="draft.isRichTextParagraphEligible" type="checkbox">
          <span>Paragraph style</span>
        </label>
        <label class="preset-editor__flag">
          <input v-model="draft.isRichTextInlineEligible" type="checkbox">
          <span>Inline style</span>
        </label>
      </div>
    </div>

    <div class="cms-card__footer preset-editor__footer">
      <div class="preset-editor__usage">
        <div>{{ usageSummary }}</div>
        <div>{{ indexedUsageSummary }}</div>
        <div v-if="deleteBlockReason" class="preset-editor__usage-warning">{{ deleteBlockReason }}</div>
      </div>

      <div class="preset-editor__actions">
        <button
          type="button"
          class="cms-btn cms-btn--primary"
          data-action="save"
          :disabled="saving || !isDirty || malformedAxesBlockSave"
          @click="handleSave"
        >
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
        <button
          v-if="canDelete"
          type="button"
          class="cms-btn cms-btn--danger"
          data-action="delete"
          :disabled="saving"
          @click="handleDelete"
        >
          Delete
        </button>
        <button
          v-else-if="draft.isActive"
          type="button"
          class="cms-btn cms-btn--secondary"
          data-action="deactivate"
          :disabled="saving"
          @click="handleDeactivate"
        >
          Deactivate
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  PRESET_CATEGORIES,
  TEXT_TRANSFORMS,
  FONT_STYLES,
  TEXT_ALIGNS,
  TEXT_DECORATION_LINES,
  TEXT_DECORATION_STYLES,
  FONT_VARIANT_CAPS_VALUES,
  FONT_VARIANT_NUMERIC_VALUES,
  FONT_KERNING_VALUES,
  FONT_OPTICAL_SIZING_VALUES,
  TEXT_RENDERING_VALUES,
  type PresetUsage,
  type TypographyPreset,
  type TypographySnapshotPreset,
  type UpdatePresetDto,
  type FontStyle,
  type TextAlign,
  type TextDecorationLine,
  type TextDecorationStyle,
  type FontVariantCaps,
  type FontVariantNumeric,
  type FontKerning,
  type FontOpticalSizing,
  type TextRendering,
} from '~/server/services/typography/typographyTypes'
import AxisControl from '~/admin/components/typography/AxisControl.vue'
import {
  collectAxisDiagnostics,
  diffResolvedAxes,
  findVariant,
  resolveAxes,
  axisToLegacyProperties,
  type AxisDiagnostic,
  type AxisTransitionDiff,
  type ResolvedAxis,
  type ThemeVariant,
} from '~/shared/typography/axisResolution'
import {
  resolveTypographyPresetStyle,
} from '~/shared/typography/buildTypographyStyles'

const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900]

type DraftState = {
  name: string
  category: TypographyPreset['category']
  fontFamily: string
  fontSize: string
  fontWeight: number | null
  lineHeight: string
  letterSpacing: string
  textTransform: string
  color: string
  isActive: boolean
  isRoleAssignable: boolean
  isBlockOverrideEligible: boolean
  isRichTextParagraphEligible: boolean
  isRichTextInlineEligible: boolean
  variationAxes: Record<string, number>
  // Extended typography properties — null means "not set"
  fontStyle: FontStyle | null
  fontStretch: string | null
  fontSynthesis: string | null
  textAlign: TextAlign | null
  wordSpacing: string | null
  textIndent: string | null
  textDecorationLine: TextDecorationLine | null
  textDecorationStyle: TextDecorationStyle | null
  textDecorationThickness: string | null
  fontVariantLigatures: string | null
  fontVariantCaps: FontVariantCaps | null
  fontVariantNumeric: FontVariantNumeric | null
  fontKerning: FontKerning | null
  fontOpticalSizing: FontOpticalSizing | null
  fontFeatureSettings: string | null
  textRendering: TextRendering | null
}

const props = defineProps<{
  preset: TypographyPreset
  fontVariants: ThemeVariant[]
  saving: boolean
  fetchUsage: (presetId: string) => Promise<PresetUsage>
}>()

const emit = defineEmits<{
  save: [id: string, dto: UpdatePresetDto]
  delete: [id: string]
  dirtyChange: [dirty: boolean]
}>()

const draft = reactive<DraftState>(createDraft(props.preset))
const advancedOpen = ref(false)
const usesExplicitColor = ref(props.preset.color !== null)
const usage = ref<PresetUsage | null>(null)

// SPL-008: tracks the last committed font family so we can diff on blur/change.
// Must trail `draft.fontFamily` intentionally — it does not update until the
// user commits (select change or freeform blur), not on every keystroke.
const committedFontFamily = ref<string>(props.preset.fontFamily ?? '')

type AxisLossWarningState = {
  lostAuthoredTags: string[]
  previousAxisWeight: number | null
}

// Transient editor-only state. Never enters buildUpdateDto(), DB, or publish.
const recentAxisLoss = ref<AxisLossWarningState | null>(null)

// Derive family dropdown from variants. Prefer canonical `family` (FEAT-01,
// matches @font-face + token output post SPL-105); fall back to slug `name`
// for legacy variants without a family field.
const fontFamilies = computed(() => {
  const families = props.fontVariants
    .map(v => (v.family ?? v.name)?.trim())
    .filter((family): family is string => Boolean(family))
  return [...new Set(families)]
})

// Variable font axis resolution — uses shared helpers so the admin UI and
// CSS emission pipeline stay in lockstep on family matching (FEAT-01) and
// clamping rules.
const activeVariant = computed(() => findVariant(draft.fontFamily, props.fontVariants))
const isVariableFont = computed(() => activeVariant.value?.variable === true)
const declaredAxisTags = computed(() => Object.keys(activeVariant.value?.axes ?? {}))

const resolvedAxes = computed<ResolvedAxis[]>(() =>
  resolveAxes(draft.fontFamily, draft.variationAxes ?? null, props.fontVariants),
)

const unsupportedAxisKeys = computed(() => {
  const stored = Object.keys(draft.variationAxes ?? {})
  const declared = new Set(declaredAxisTags.value)
  return stored.filter(k => !declared.has(k))
})

// Surface registry-side axis malformation (min>max, default out of range,
// step≤0, non-numeric fields) for the currently selected variant. The server
// already logs these at theme-load time; `resolveAxes` silently drops the
// offending axes so the editor row disappears without warning. Filter to the
// active variant so editors only see diagnostics relevant to the font they're
// configuring — a theme-wide view belongs in TypographyDiagnostics.
const malformedAxisDiagnostics = computed<AxisDiagnostic[]>(() => {
  const variantName = activeVariant.value?.name
  if (!variantName) return []
  return collectAxisDiagnostics(props.fontVariants)
    .filter(d => d.variantName === variantName)
})

// Gate save only when the preset stores a value for one of the malformed
// axes. This blocks the concrete silent-drop path (author saves changes
// against a broken axis they can't see) without stranding editors who
// happened to pick an unrelated preset on the same variant.
const malformedAxesBlockSave = computed(() => {
  if (malformedAxisDiagnostics.value.length === 0) return false
  const stored = draft.variationAxes ?? {}
  return malformedAxisDiagnostics.value.some(d => d.tag in stored)
})

// Hide experimental axes by default; show once the preset has a value for
// them so editors can still adjust/reset experimentation results.
const axisControlList = computed(() => resolvedAxes.value.filter(a => {
  const def = activeVariant.value?.axes?.[a.tag]
  if (!def) return false
  if (def.experimental && draft.variationAxes?.[a.tag] === undefined) return false
  return true
}))

// SPL-008: unified preview/runtime resolver (Step 3).
// Building a snapshot preset from the draft lets both preview and runtime use
// the same shared resolver, so axis-resolution parity is guaranteed by the
// shared code path rather than duplicated logic here.
function draftToSnapshotPreset(): TypographySnapshotPreset {
  return {
    key: props.preset.key,
    name: draft.name,
    category: draft.category,
    fontFamily: normalizeText(draft.fontFamily),
    fontSize: normalizeText(draft.fontSize),
    fontWeight: draft.fontWeight,
    lineHeight: normalizeText(draft.lineHeight),
    letterSpacing: normalizeText(draft.letterSpacing),
    textTransform: draft.textTransform || 'none',
    color: usesExplicitColor.value ? (normalizeText(draft.color) ?? '#111111') : null,
    variationAxes: normalizeVariationAxes(draft.variationAxes) ?? undefined,
    // Extended typography properties — null means "not set" (no CSS emitted)
    fontStyle: draft.fontStyle,
    fontStretch: normalizeText(draft.fontStretch ?? '') ?? null,
    fontSynthesis: normalizeText(draft.fontSynthesis ?? '') ?? null,
    textAlign: draft.textAlign,
    wordSpacing: normalizeText(draft.wordSpacing ?? '') ?? null,
    textIndent: normalizeText(draft.textIndent ?? '') ?? null,
    textDecorationLine: draft.textDecorationLine,
    textDecorationStyle: draft.textDecorationStyle,
    textDecorationThickness: normalizeText(draft.textDecorationThickness ?? '') ?? null,
    fontVariantLigatures: normalizeText(draft.fontVariantLigatures ?? '') ?? null,
    fontVariantCaps: draft.fontVariantCaps,
    fontVariantNumeric: draft.fontVariantNumeric,
    fontKerning: draft.fontKerning,
    fontOpticalSizing: draft.fontOpticalSizing,
    fontFeatureSettings: normalizeText(draft.fontFeatureSettings ?? '') ?? null,
    textRendering: draft.textRendering,
  }
}

const previewPreset = computed(() => draftToSnapshotPreset())
const resolvedPreview = computed(() =>
  resolveTypographyPresetStyle(previewPreset.value, props.fontVariants),
)
// force-legacy mode computes what static fallback values will render after a
// variable→static transition, so the warning banner can surface them.
const forcedLegacyPreview = computed(() =>
  resolveTypographyPresetStyle(previewPreset.value, props.fontVariants, { mode: 'force-legacy' }),
)

// opsz-specific copy when optical-size axis is among the lost authored tags.
const axisLossHasOpsz = computed(() =>
  recentAxisLoss.value?.lostAuthoredTags.includes('opsz') ?? false,
)

// SPL-008: handler for committed font-family changes (Step 4).
// Wired to select @change and freeform input @blur — not to every keystroke —
// so partially-typed strings during editing don't produce warning churn.
function commitFontFamilyChange(nextFamily: string, source: 'user' | 'system' = 'user') {
  const previousFamily = committedFontFamily.value
  draft.fontFamily = nextFamily
  committedFontFamily.value = nextFamily

  if (source !== 'user' || previousFamily === nextFamily) {
    if (source !== 'user') recentAxisLoss.value = null
    return
  }

  const diff: AxisTransitionDiff = diffResolvedAxes(
    previousFamily, nextFamily, draft.variationAxes, props.fontVariants,
  )
  const authoredKeys = new Set(Object.keys(draft.variationAxes ?? {}))
  const lostAuthoredTags = diff.lostTags.filter(tag => authoredKeys.has(tag))

  if (lostAuthoredTags.length === 0) {
    recentAxisLoss.value = null
    return
  }

  const previousLegacy = axisToLegacyProperties(diff.previousAxes)
  recentAxisLoss.value = {
    lostAuthoredTags,
    previousAxisWeight: previousLegacy['font-weight'] ? Number(previousLegacy['font-weight']) : null,
  }
}

function exposesAxis(tag: string): boolean {
  return isVariableFont.value && declaredAxisTags.value.includes(tag)
}

function setAxis(tag: string, value: number) {
  draft.variationAxes = { ...(draft.variationAxes ?? {}), [tag]: value }
}

function resetAxis(tag: string) {
  if (!draft.variationAxes) return
  const next = { ...draft.variationAxes }
  delete next[tag]
  draft.variationAxes = next
}

function clearUnsupportedAxes() {
  if (!draft.variationAxes) return
  const declared = new Set(declaredAxisTags.value)
  const next: Record<string, number> = {}
  for (const [k, v] of Object.entries(draft.variationAxes)) {
    if (declared.has(k)) next[k] = v
  }
  draft.variationAxes = next
}

const presetFingerprint = computed(() => serializeComparableState(createDraft(props.preset), props.preset.color !== null))
const draftFingerprint = computed(() => serializeComparableState(draft, usesExplicitColor.value))
const isDirty = computed(() => draftFingerprint.value !== presetFingerprint.value)

// SPL-008 Step 3: preview driven by the shared resolver so preview and runtime
// stay in lockstep on axis resolution, clamping, and legacy-property fallback.
const previewStyle = computed(() => {
  const r = resolvedPreview.value
  const style: Record<string, string> = {}
  // Only apply non-inherit/non-default values as inline styles.
  if (r.props.family !== 'inherit') style.fontFamily = r.props.family
  if (r.props.weight !== 'inherit') style.fontWeight = r.props.weight
  if (r.props['line-height'] !== 'inherit') style.lineHeight = r.props['line-height']
  if (r.props['letter-spacing'] !== 'normal') style.letterSpacing = r.props['letter-spacing']
  if (r.props['text-transform'] !== 'none') style.textTransform = r.props['text-transform']
  if (r.props.color) style.color = r.props.color
  if (r.mode === 'variable' && r.fontVariationSettings) {
    style.fontVariationSettings = r.fontVariationSettings
    // font-weight already applied via r.props.weight (axes win in resolver).
    if (r.derivedLegacyProps['font-optical-sizing']) style.fontOpticalSizing = r.derivedLegacyProps['font-optical-sizing']
    if (r.derivedLegacyProps['font-stretch']) style.fontStretch = r.derivedLegacyProps['font-stretch']
    if (r.derivedLegacyProps['font-style']) style.fontStyle = r.derivedLegacyProps['font-style']
  }
  // Extended properties from draft — applied directly to preview
  if (draft.fontStyle) style.fontStyle = draft.fontStyle
  if (draft.fontStretch) style.fontStretch = draft.fontStretch
  if (draft.fontSynthesis) style.fontSynthesis = draft.fontSynthesis
  if (draft.textAlign) style.textAlign = draft.textAlign
  if (draft.wordSpacing) style.wordSpacing = draft.wordSpacing
  if (draft.textIndent) style.textIndent = draft.textIndent
  if (draft.textDecorationLine) style.textDecorationLine = draft.textDecorationLine
  if (draft.textDecorationStyle) style.textDecorationStyle = draft.textDecorationStyle
  if (draft.textDecorationThickness) style.textDecorationThickness = draft.textDecorationThickness
  if (draft.fontVariantLigatures) style.fontVariantLigatures = draft.fontVariantLigatures
  if (draft.fontVariantCaps) style.fontVariantCaps = draft.fontVariantCaps
  if (draft.fontVariantNumeric) style.fontVariantNumeric = draft.fontVariantNumeric
  if (draft.fontKerning) style.fontKerning = draft.fontKerning
  if (draft.fontOpticalSizing) style.fontOpticalSizing = draft.fontOpticalSizing
  if (draft.fontFeatureSettings) style.fontFeatureSettings = draft.fontFeatureSettings
  if (draft.textRendering) style.textRendering = draft.textRendering
  return style
})

const previewHeadingStyle = computed(() => ({
  ...previewStyle.value,
  fontSize: scaledPreviewFontSize(draft.fontSize, '4.8rem', 1.15),
}))

const previewBodyStyle = computed(() => ({
  ...previewStyle.value,
  fontSize: scaledPreviewFontSize(draft.fontSize, '2.8rem', 0.75),
}))

const previewMetaStyle = computed(() => ({
  ...previewStyle.value,
  fontSize: scaledPreviewFontSize(draft.fontSize, '2rem', 0.6),
}))

// Normalize the usage payload so downstream computeds never touch undefined
// fields if the server response drifts (e.g. legacy cached shape missing
// `roles`). The type contract says `roles: string[]`, but the editor has
// crashed in the wild when one field was absent — treat this as the
// defensive boundary.
const normalizedUsage = computed(() => {
  const u = usage.value
  if (!u) return null
  return {
    roles: Array.isArray(u.roles) ? u.roles : [],
    blockCount: typeof u.blockCount === 'number' ? u.blockCount : 0,
    richTextCount: typeof u.richTextCount === 'number' ? u.richTextCount : 0,
  }
})

const canDelete = computed(() => {
  const u = normalizedUsage.value
  if (!u) return false
  return u.roles.length === 0 && u.blockCount === 0 && u.richTextCount === 0
})

const usageSummary = computed(() => {
  const u = normalizedUsage.value
  if (!u) return 'Checking usage…'
  return u.roles.length > 0
    ? `Assigned to roles: ${u.roles.join(', ')}`
    : 'Assigned to roles: none'
})

const indexedUsageSummary = computed(() => {
  const u = normalizedUsage.value
  if (!u) return 'Usage counts unavailable.'
  if (u.blockCount === 0 && u.richTextCount === 0) {
    return 'Block and rich-text usage: Available after indexing'
  }
  return `Block overrides: ${u.blockCount} • Rich text: ${u.richTextCount}`
})

const deleteBlockReason = computed(() => {
  const u = normalizedUsage.value
  if (!u || canDelete.value) return ''

  const reasons: string[] = []
  if (u.roles.length > 0) reasons.push(`role assignments (${u.roles.join(', ')})`)
  if (u.blockCount > 0) reasons.push(`${u.blockCount} block override(s)`)
  if (u.richTextCount > 0) reasons.push(`${u.richTextCount} rich-text use(s)`)
  if (reasons.length === 0) reasons.push('existing references')

  return `Delete unavailable while this preset has ${reasons.join(', ')}.`
})

const colorModeLabel = computed(() => usesExplicitColor.value ? 'Use inherited color' : 'Use explicit color')

watch(isDirty, dirty => emit('dirtyChange', dirty), { immediate: true })

watch(
  () => props.preset,
  async (preset) => {
    applyDraft(preset)
    await loadUsage()
  },
  { immediate: true },
)

function createDraft(preset: TypographyPreset): DraftState {
  return {
    name: preset.name,
    category: preset.category,
    fontFamily: preset.fontFamily ?? '',
    fontSize: preset.fontSize ?? '',
    fontWeight: preset.fontWeight ?? null,
    lineHeight: preset.lineHeight ?? '',
    letterSpacing: preset.letterSpacing ?? '',
    textTransform: preset.textTransform ?? 'none',
    color: preset.color ?? '#111111',
    isActive: preset.isActive,
    isRoleAssignable: preset.isRoleAssignable,
    isBlockOverrideEligible: preset.isBlockOverrideEligible,
    isRichTextParagraphEligible: preset.isRichTextParagraphEligible,
    isRichTextInlineEligible: preset.isRichTextInlineEligible,
    variationAxes: { ...(preset.variationAxes ?? {}) },
    // Extended typography properties
    fontStyle: preset.fontStyle ?? null,
    fontStretch: preset.fontStretch ?? null,
    fontSynthesis: preset.fontSynthesis ?? null,
    textAlign: preset.textAlign ?? null,
    wordSpacing: preset.wordSpacing ?? null,
    textIndent: preset.textIndent ?? null,
    textDecorationLine: preset.textDecorationLine ?? null,
    textDecorationStyle: preset.textDecorationStyle ?? null,
    textDecorationThickness: preset.textDecorationThickness ?? null,
    fontVariantLigatures: preset.fontVariantLigatures ?? null,
    fontVariantCaps: preset.fontVariantCaps ?? null,
    fontVariantNumeric: preset.fontVariantNumeric ?? null,
    fontKerning: preset.fontKerning ?? null,
    fontOpticalSizing: preset.fontOpticalSizing ?? null,
    fontFeatureSettings: preset.fontFeatureSettings ?? null,
    textRendering: preset.textRendering ?? null,
  }
}

function applyDraft(preset: TypographyPreset) {
  Object.assign(draft, createDraft(preset))
  usesExplicitColor.value = preset.color !== null
  // SPL-008: sync the committed baseline; never fabricate a warning on reload.
  committedFontFamily.value = preset.fontFamily ?? ''
  recentAxisLoss.value = null
}

function resetDraft() {
  applyDraft(props.preset)
}

function serializeComparableState(state: DraftState, explicitColor: boolean): string {
  return JSON.stringify({
    ...state,
    fontFamily: normalizeText(state.fontFamily),
    fontSize: normalizeText(state.fontSize),
    lineHeight: normalizeText(state.lineHeight),
    letterSpacing: normalizeText(state.letterSpacing),
    textTransform: state.textTransform || 'none',
    color: explicitColor ? normalizeText(state.color) : null,
    variationAxes: normalizeVariationAxes(state.variationAxes),
  })
}

function normalizeVariationAxes(axes: Record<string, number> | null | undefined): Record<string, number> | null {
  if (!axes) return null
  const keys = Object.keys(axes).sort()
  if (keys.length === 0) return null
  const sorted: Record<string, number> = {}
  for (const key of keys) sorted[key] = axes[key]
  return sorted
}

function normalizeText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function formatCategoryLabel(value: string): string {
  if (!value) return ''
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/[-_]/g, ' ')
    .replace(/^./, character => character.toUpperCase())
}

function quoteFontFamily(fontFamily: string): string {
  if (fontFamily.includes(',') || fontFamily.includes('"') || fontFamily.includes("'")) return fontFamily
  return fontFamily.includes(' ') ? `'${fontFamily}'` : fontFamily
}

function scaledPreviewFontSize(raw: string, fallback: string, multiplier: number): string {
  const value = raw.trim()
  if (!value) return fallback

  const match = value.match(/^([0-9]*\.?[0-9]+)(px|rem|em)$/)
  if (!match) return fallback

  const numericValue = Number(match[1])
  const unit = match[2]
  const scaledValue = Math.max(numericValue * multiplier, unit === 'px' ? 16 : 1)
  return `${Number(scaledValue.toFixed(2))}${unit}`
}

function updateFontWeight(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  draft.fontWeight = value ? Number(value) : null
}

function updateNullableField(field: 'fontFamily', event: Event) {
  draft[field] = (event.target as HTMLSelectElement).value
}

function toggleColor() {
  usesExplicitColor.value = !usesExplicitColor.value
  if (!usesExplicitColor.value) {
    draft.color = '#111111'
  }
}

async function loadUsage() {
  try {
    usage.value = await props.fetchUsage(props.preset.id)
  } catch {
    usage.value = null
  }
}

function buildUpdateDto(overrides?: Partial<UpdatePresetDto>): UpdatePresetDto {
  return {
    name: draft.name.trim(),
    category: draft.category,
    // `?? null` (not undefined) so that clearing a field in the editor
    // produces a PUT body with an explicit null, telling the server
    // "unset this". Undefined would be omitted from JSON → server reads
    // "don't touch" → value stays stuck.
    fontFamily: normalizeText(draft.fontFamily) ?? null,
    fontSize: normalizeText(draft.fontSize) ?? null,
    fontWeight: draft.fontWeight ?? null,
    lineHeight: normalizeText(draft.lineHeight) ?? null,
    letterSpacing: normalizeText(draft.letterSpacing) ?? null,
    textTransform: draft.textTransform || 'none',
    color: usesExplicitColor.value ? (normalizeText(draft.color) ?? '#111111') : null,
    isActive: draft.isActive,
    isRoleAssignable: draft.isRoleAssignable,
    isBlockOverrideEligible: draft.isBlockOverrideEligible,
    isRichTextParagraphEligible: draft.isRichTextParagraphEligible,
    isRichTextInlineEligible: draft.isRichTextInlineEligible,
    // Normalize at the DTO boundary so an empty map (e.g. static-font preset
    // that never had axes) maps to NULL in the column rather than `{}`. The
    // editor still preserves `{}` in-memory until the user commits, but the
    // wire/DB representation collapses both to NULL — no write amplification
    // for static presets.
    variationAxes: normalizeVariationAxes(draft.variationAxes),
    // Extended typography properties — null means "unset" (stored as absent in metaJson)
    fontStyle: draft.fontStyle,
    fontStretch: normalizeText(draft.fontStretch ?? '') ?? null,
    fontSynthesis: normalizeText(draft.fontSynthesis ?? '') ?? null,
    textAlign: draft.textAlign,
    wordSpacing: normalizeText(draft.wordSpacing ?? '') ?? null,
    textIndent: normalizeText(draft.textIndent ?? '') ?? null,
    textDecorationLine: draft.textDecorationLine,
    textDecorationStyle: draft.textDecorationStyle,
    textDecorationThickness: normalizeText(draft.textDecorationThickness ?? '') ?? null,
    fontVariantLigatures: normalizeText(draft.fontVariantLigatures ?? '') ?? null,
    fontVariantCaps: draft.fontVariantCaps,
    fontVariantNumeric: draft.fontVariantNumeric,
    fontKerning: draft.fontKerning,
    fontOpticalSizing: draft.fontOpticalSizing,
    fontFeatureSettings: normalizeText(draft.fontFeatureSettings ?? '') ?? null,
    textRendering: draft.textRendering,
    ...overrides,
  }
}

function handleSave() {
  emit('save', props.preset.id, buildUpdateDto())
}

function handleDelete() {
  if (!window.confirm(`Delete preset "${draft.name || props.preset.name}"? This cannot be undone.`)) return
  emit('delete', props.preset.id)
}

function handleDeactivate() {
  emit('save', props.preset.id, buildUpdateDto({ isActive: false }))
}
</script>

<style scoped lang="scss">
.preset-editor {
  min-height: 100%;
}

.preset-editor__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.6rem;
}

.preset-editor__meta {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-top: 0.8rem;
}

.preset-editor__key {
  color: var(--cms-ink-muted);
  font-size: 1.1rem;
}

.preset-editor__body {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.preset-editor__preview {
  padding: 1.6rem;
  border: 1px solid var(--cms-line);
  border-radius: 0.2rem;
  background: var(--cms-canvas);
}

.preset-editor__preview-eyebrow {
  color: var(--cms-ink-muted);
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.preset-editor__preview-heading {
  margin-top: 0.8rem;
  font-size: 4.8rem;
  line-height: 1.05;
}

.preset-editor__preview-body {
  margin-top: 0.8rem;
  font-size: 2.8rem;
  line-height: 1.15;
}

.preset-editor__preview-meta {
  margin-top: 1rem;
  font-size: 2rem;
  opacity: 0.7;
}

.preset-editor__section {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

.preset-editor__section-title,
.preset-editor__section-toggle {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--cms-ink-body);
  font-size: 1.2rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.preset-editor__advanced {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

.preset-editor__group-title {
  padding: 0.8rem 0 0.2rem;
  border-top: 1px solid var(--cms-line);
  color: var(--cms-ink-muted);
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.preset-editor__grid--3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.preset-editor__advanced-override {
  margin-left: 0.6rem;
  padding: 0.1rem 0.5rem;
  border-radius: 0.2rem;
  background: var(--cms-warn-soft);
  color: var(--cms-warn);
  font-size: 1rem;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
}

.preset-editor__capability-note {
  margin-left: 0.6rem;
  padding: 0.1rem 0.5rem;
  border-radius: 0.2rem;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 1rem;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
}

.preset-editor__field-hint {
  margin-top: 0.3rem;
  color: #9ca3af;
  font-size: 1.1rem;
}

.preset-editor__monospace {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 1.2rem;
}

.preset-editor__axes {
  padding-top: 1.2rem;
  border-top: 1px solid var(--cms-line);
}

.preset-editor__warning {
  padding: 0.8rem 1rem;
  border: 1px solid #f5cc6e;
  border-radius: 0.4rem;
  background: var(--cms-warn-soft);
}

.preset-editor__warning p {
  margin: 0 0 0.6rem;
  font-size: 1.2rem;
  color: var(--cms-warn);
}

.preset-editor__warning-list {
  margin: 0 0 0.6rem;
  padding-left: 1.8rem;
  color: var(--cms-warn);
  font-size: 1.2rem;
}

.preset-editor__warning-list code {
  padding: 0 0.3rem;
  border-radius: 0.2rem;
  background: rgba(255, 255, 255, 0.6);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.preset-editor__warning-btn {
  padding: 0.3rem 0.8rem;
  border: 1px solid var(--cms-warn);
  border-radius: 0.2rem;
  background: var(--cms-surface);
  color: var(--cms-warn);
  font-size: 1.1rem;
  cursor: pointer;
}

// SPL-008: axis-loss + unsupported-axes combined warning section.
.preset-editor__axes-warnings {
  padding-top: 1.2rem;
  border-top: 1px solid var(--cms-line);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.preset-editor__warning-title {
  margin: 0 0 0.4rem;
  font-size: 1.2rem;
  color: var(--cms-warn);
}

.preset-editor__warning-metrics {
  margin: 0.4rem 0 0;
  font-size: 1.2rem;
  color: var(--cms-warn);
}

.preset-editor__warning-actions {
  margin-top: 0.6rem;
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.preset-editor__grid {
  display: grid;
  gap: 1.2rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.preset-editor__color-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.preset-editor__color-picker {
  width: 4.8rem;
  height: 4rem;
  border: 1px solid #d0d5dd;
  border-radius: 0.8rem;
  background: var(--cms-surface);
}

.preset-editor__flag {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  color: var(--cms-ink-body);
}

.preset-editor__footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.6rem;
}

.preset-editor__usage {
  color: var(--cms-ink-subtle);
  font-size: 1.2rem;
}

.preset-editor__usage-warning {
  margin-top: 0.6rem;
  color: #b54708;
}

.preset-editor__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
}

@media (min-width: 1200px) {
  .preset-editor__preview {
    position: sticky;
    top: 0;
    z-index: 1;
  }
}

@media (max-width: 900px) {
  .preset-editor__footer {
    flex-direction: column;
  }

  .preset-editor__actions {
    width: 100%;
  }
}

@media (max-width: 767px) {
  .preset-editor__footer {
    flex-direction: column;
  }

  .preset-editor__grid {
    grid-template-columns: 1fr;
  }

  .preset-editor__actions {
    width: 100%;
  }
}
</style>
