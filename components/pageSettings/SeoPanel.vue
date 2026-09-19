<script setup lang="ts">
import { computed, onBeforeUnmount, provide, ref, watch } from 'vue'
import TImagePicker from '~/admin/components/fields/TImagePicker.vue'
import { adminFetch } from '~/admin/utils/adminFetch'
import { isLegacyMediaUrl } from '~/admin/utils/mediaValue'
import {
  TITLE_RULE,
  DESCRIPTION_RULE,
  classifyLength,
  statusHint,
  truncateSnippet,
  formatDisplayUrl,
  type SeoLengthStatus,
} from '~/admin/utils/seoPreview'

export interface SeoFields {
  metaTitle: Record<string, string> | null
  metaDescription: Record<string, string> | null
  ogImageId: string | null
  noIndex: boolean
  canonicalUrl: string | null
}

const props = withDefaults(defineProps<{
  seo: SeoFields
  pageId: string
  locale: string
  /** Page title map — fallback for the preview when no meta title is set. */
  pageTitle?: Record<string, string> | null
  /** Excerpt map — fallback for the preview when no meta description is set. */
  excerpt?: Record<string, string> | null
  /** Public host shown in the search-result crumb (best-effort). */
  host?: string
  /** URL path of the page (e.g. "about/team"). */
  path?: string
  /** Site the media library belongs to — required for the OG image picker. */
  siteId?: string
}>(), {
  pageTitle: null,
  excerpt: null,
  host: '',
  path: '',
  siteId: '',
})

const emit = defineEmits<{
  'update:seo': [patch: Partial<SeoFields>]
}>()

function patch<K extends keyof SeoFields>(key: K, value: SeoFields[K]) {
  emit('update:seo', { [key]: value })
}

// Local echoes of the edited fields so the preview + meters react to every
// keystroke. The parent saves on a debounce, so `props.seo` only reflects the
// typed value after a round-trip — reading props directly would make the
// preview lag (or stay stale if a save fails). We seed from props and update
// locally on input. We re-sync ONLY when the page or locale changes (identity),
// never on every `props.seo` mutation: a debounced save of one field would
// otherwise clobber the other fields' still-unsaved local edits.
const metaTitleVal = ref(props.seo.metaTitle?.[props.locale] ?? '')
const metaDescriptionVal = ref(props.seo.metaDescription?.[props.locale] ?? '')
const ogImageVal = ref(props.seo.ogImageId ?? '')

watch(
  () => [props.pageId, props.locale] as const,
  () => {
    metaTitleVal.value = props.seo.metaTitle?.[props.locale] ?? ''
    metaDescriptionVal.value = props.seo.metaDescription?.[props.locale] ?? ''
    ogImageVal.value = props.seo.ogImageId ?? ''
  },
)

function patchLocalized(key: 'metaTitle' | 'metaDescription', value: string) {
  if (key === 'metaTitle') metaTitleVal.value = value
  else metaDescriptionVal.value = value
  const current = props.seo[key] ?? {}
  const next = { ...current, [props.locale]: value }
  emit('update:seo', { [key]: next })
}

// `og_image_id` is a varchar(36) MEDIA ID: `seoService` resolves it through the
// site's media map, so a pasted URL emits no `og:image` at all. The picker is
// pinned to id-mode PER FIELD rather than surface-wide, because block fields on
// the same editor surface still store URLs.
const OG_IMAGE_FIELD = {
  label: 'OG image',
  options: { valueMode: 'id' as const },
  note: 'Used for social link previews. Picked from this site\'s media library.',
}

function patchOgImage(value: unknown) {
  const next = typeof value === 'string' && value ? value : ''
  ogImageVal.value = next
  patch('ogImageId', next || null)
}

const ogImageIsLegacyUrl = computed(() => isLegacyMediaUrl(ogImageVal.value))

// TImagePicker reaches /api/admin/s/<siteId>/media/* through this injection.
// Provided locally so the panel carries its own context wherever it is mounted,
// rather than depending on an ancestor having provided the same key.
provide('siteId', computed(() => props.siteId))

// ── Live preview -----------------------------------------------------------
// Effective values mirror the resolveSeo precedence: explicit meta wins,
// otherwise fall back to the page title / excerpt the visitor would actually see.
const effectiveTitle = computed(
  () => metaTitleVal.value.trim() || props.pageTitle?.[props.locale]?.trim() || '',
)
const effectiveDescription = computed(
  () => metaDescriptionVal.value.trim() || props.excerpt?.[props.locale]?.trim() || '',
)

const resolvedHost = computed(() => {
  if (props.host) return props.host
  if (typeof window !== 'undefined') return window.location.host
  return 'example.com'
})
const displayUrl = computed(() => formatDisplayUrl(resolvedHost.value, props.path))

const previewTitle = computed(
  () => truncateSnippet(effectiveTitle.value, TITLE_RULE.max) || 'Untitled page',
)
const previewDescription = computed(() =>
  effectiveDescription.value
    ? truncateSnippet(effectiveDescription.value, DESCRIPTION_RULE.max)
    : 'No description yet — add a meta description or excerpt so search engines and social cards have a summary to show.',
)

// A media id is what the field is SUPPOSED to hold, so the preview card resolves
// it to a URL the same way the public read path does — otherwise the card would
// show an image only for the broken (pasted-URL) case and never for the correct
// one. A legacy URL value still renders directly; a failed lookup renders nothing
// rather than a broken <img>.
const resolvedOgImageUrl = ref<string | null>(null)
let resolvedOgImageId: string | null = null

watch(
  [() => ogImageVal.value, () => props.siteId] as const,
  async ([value, siteId]) => {
    const id = value.trim()
    if (!id || !siteId || isLegacyMediaUrl(id)) {
      resolvedOgImageUrl.value = null
      resolvedOgImageId = null
      return
    }
    if (resolvedOgImageId === id) return
    resolvedOgImageId = id
    try {
      const rec = await adminFetch<{ url?: string | null }>(
        `/api/admin/s/${siteId}/media/${id}`,
      )
      // A newer edit may have landed while this was in flight — only the id we
      // were asked about may write the preview.
      if (resolvedOgImageId === id) resolvedOgImageUrl.value = rec?.url ?? null
    } catch {
      if (resolvedOgImageId === id) resolvedOgImageUrl.value = null
    }
  },
  { immediate: true },
)

const ogImageUrl = computed(() => {
  const v = ogImageVal.value.trim()
  if (/^(https?:\/\/|\/)/.test(v)) return v
  return v ? resolvedOgImageUrl.value : null
})

// Length meters — classify against the field the author is editing (meta),
// so the meter reflects what they type, not the fallback.
const titleStatus = computed<SeoLengthStatus>(() => classifyLength(metaTitleVal.value, TITLE_RULE))
const descriptionStatus = computed<SeoLengthStatus>(() =>
  classifyLength(metaDescriptionVal.value, DESCRIPTION_RULE),
)
const titleHint = computed(() => statusHint(titleStatus.value, TITLE_RULE))
const descriptionHint = computed(() => statusHint(descriptionStatus.value, DESCRIPTION_RULE))

const titleLen = computed(() => metaTitleVal.value.trim().length)
const descriptionLen = computed(() => metaDescriptionVal.value.trim().length)

function meterPct(len: number, max: number): number {
  return Math.min(100, Math.round((len / max) * 100))
}

// ── Pixel-accurate title width (the real Google truncation signal) ---------
// Canvas measurement is browser-only; guarded so unit tests (no canvas) skip it.
let measureCtx: CanvasRenderingContext2D | null = null
function measurePixels(text: string): number | null {
  if (typeof document === 'undefined') return null
  if (!measureCtx) {
    const canvas = document.createElement('canvas')
    measureCtx = canvas.getContext('2d')
    if (measureCtx) measureCtx.font = '18px Arial, sans-serif'
  }
  if (!measureCtx) return null
  return Math.round(measureCtx.measureText(text).width)
}
const TITLE_PIXEL_LIMIT = 580
const titlePixels = computed(() => measurePixels(effectiveTitle.value))
const titleTruncatesByPixels = computed(
  () => titlePixels.value !== null && titlePixels.value > TITLE_PIXEL_LIMIT,
)
onBeforeUnmount(() => {
  measureCtx = null
})
</script>

<template>
  <section
    class="cms-card seo-panel"
    data-section="seo"
  >
    <div class="cms-card__header">
      <h3 class="cms-card__title">SEO</h3>
    </div>
    <div class="cms-card__body">
      <!-- Live search-result preview ------------------------------------ -->
      <div class="seo-preview" data-preview="search">
        <span class="seo-preview__label">Search result preview</span>
        <div class="seo-serp">
          <div class="seo-serp__url">{{ displayUrl }}</div>
          <div class="seo-serp__title">{{ previewTitle }}</div>
          <div class="seo-serp__desc">{{ previewDescription }}</div>
        </div>
      </div>

      <!-- Social share card preview -------------------------------------- -->
      <div class="seo-preview" data-preview="social">
        <span class="seo-preview__label">Social share preview</span>
        <div class="seo-social">
          <div class="seo-social__media" :class="{ 'seo-social__media--empty': !ogImageUrl }">
            <img v-if="ogImageUrl" :src="ogImageUrl" alt="" class="seo-social__img" data-role="seo-preview-image">
            <span v-else class="seo-social__placeholder">No OG image</span>
          </div>
          <div class="seo-social__body">
            <div class="seo-social__host">{{ resolvedHost }}</div>
            <div class="seo-social__title">{{ previewTitle }}</div>
            <div class="seo-social__desc">{{ previewDescription }}</div>
          </div>
        </div>
      </div>

      <div class="seo-panel__grid">
        <div class="cms-form-group" data-field="metaTitle">
          <label class="cms-label" :for="`seo-meta-title-${pageId}`">Meta title</label>
          <input
            :id="`seo-meta-title-${pageId}`"
            type="text"
            class="cms-form-control"
            :value="metaTitleVal"
            placeholder="Override page title for search engines"
            @input="patchLocalized('metaTitle', ($event.target as HTMLInputElement).value)"
          >
          <div class="seo-meter" :data-status="titleStatus">
            <div class="seo-meter__track">
              <div class="seo-meter__fill" :style="{ width: `${meterPct(titleLen, TITLE_RULE.max)}%` }" />
            </div>
            <div class="seo-meter__row">
              <span class="seo-meter__count">{{ titleLen }} chars</span>
              <span
                v-if="titlePixels !== null"
                class="seo-meter__pixels"
                :class="{ 'seo-meter__pixels--over': titleTruncatesByPixels }"
              >{{ titlePixels }}px</span>
            </div>
          </div>
          <small v-if="titleHint" class="seo-panel__hint" :data-status="titleStatus">{{ titleHint }}</small>
          <small class="seo-panel__hint">Locale: {{ locale }}</small>
        </div>

        <div class="cms-form-group" data-field="metaDescription">
          <label class="cms-label" :for="`seo-meta-description-${pageId}`">Meta description</label>
          <textarea
            :id="`seo-meta-description-${pageId}`"
            class="cms-form-control"
            rows="3"
            :value="metaDescriptionVal"
            placeholder="Short summary used in search snippets and link previews"
            @input="patchLocalized('metaDescription', ($event.target as HTMLTextAreaElement).value)"
          />
          <div class="seo-meter" :data-status="descriptionStatus">
            <div class="seo-meter__track">
              <div class="seo-meter__fill" :style="{ width: `${meterPct(descriptionLen, DESCRIPTION_RULE.max)}%` }" />
            </div>
            <div class="seo-meter__row">
              <span class="seo-meter__count">{{ descriptionLen }} chars</span>
            </div>
          </div>
          <small v-if="descriptionHint" class="seo-panel__hint" :data-status="descriptionStatus">{{ descriptionHint }}</small>
          <small class="seo-panel__hint">Locale: {{ locale }}</small>
        </div>

        <div class="cms-form-group" data-field="ogImageId">
          <TImagePicker
            :field="OG_IMAGE_FIELD"
            :model-value="ogImageVal || null"
            @update:model-value="patchOgImage"
          />
          <small v-if="ogImageIsLegacyUrl" class="seo-panel__hint" data-status="warn">
            This is a raw URL, not a media item. Social previews resolve media IDs
            server-side, so this one renders no <code>og:image</code> — pick the
            image from the library to fix it.
          </small>
        </div>

        <div class="cms-form-group" data-field="canonicalUrl">
          <label class="cms-label" :for="`seo-canonical-${pageId}`">Canonical URL</label>
          <input
            :id="`seo-canonical-${pageId}`"
            type="text"
            class="cms-form-control"
            :value="seo.canonicalUrl ?? ''"
            placeholder="Override canonical URL (rare)"
            @input="patch('canonicalUrl', (($event.target as HTMLInputElement).value || null))"
          >
        </div>

        <div class="cms-form-group" data-field="noIndex">
          <div class="form-check">
            <input
              :id="`seo-noindex-${pageId}`"
              type="checkbox"
              class="form-check-input"
              :checked="seo.noIndex"
              @change="patch('noIndex', ($event.target as HTMLInputElement).checked)"
            >
            <label class="form-check-label" :for="`seo-noindex-${pageId}`">
              No-index <small>(excludes from sitemap + emits robots noindex)</small>
            </label>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.seo-panel__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.6rem;
}
.seo-panel__hint {
  display: block;
  margin-top: 4px;
  color: var(--cms-ink-subtle);
  font-size: 11px;
}
.seo-panel__hint[data-status='short'],
.seo-panel__hint[data-status='long'] {
  color: #c77800;
}
.seo-panel__hint[data-status='good'] {
  color: var(--cms-accent);
}

/* ── Preview cards ────────────────────────────────────────────────────── */
.seo-preview {
  margin-bottom: 1.4rem;
}
.seo-preview__label {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--cms-ink-subtle);
}

/* Google-style SERP snippet */
.seo-serp {
  padding: 12px 14px;
  border: 1px solid #e3e3e3;
  border-radius: 8px;
  background: var(--cms-surface);
  font-family: Arial, sans-serif;
}
.seo-serp__url {
  font-size: 12px;
  color: #202124;
  line-height: 1.3;
}
.seo-serp__title {
  margin-top: 2px;
  font-size: 18px;
  line-height: 1.3;
  color: #1a0dab;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.seo-serp__desc {
  margin-top: 3px;
  font-size: 13px;
  line-height: 1.5;
  color: #4d5156;
}

/* Social share card (Facebook/LinkedIn style) */
.seo-social {
  border: 1px solid #dadde1;
  border-radius: 8px;
  overflow: hidden;
  background: var(--cms-surface);
  max-width: 420px;
}
.seo-social__media {
  aspect-ratio: 1.91 / 1;
  background: #f0f2f5;
}
.seo-social__media--empty {
  display: flex;
  align-items: center;
  justify-content: center;
}
.seo-social__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.seo-social__placeholder {
  font-size: 12px;
  color: #b0b3b8;
}
.seo-social__body {
  padding: 10px 12px;
  border-top: 1px solid #dadde1;
  background: #f7f8fa;
}
.seo-social__host {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: #606770;
}
.seo-social__title {
  margin-top: 3px;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  color: #1d2129;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.seo-social__desc {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.4;
  color: #606770;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── Length meters ───────────────────────────────────────────────────── */
.seo-meter {
  margin-top: 6px;
}
.seo-meter__track {
  height: 4px;
  border-radius: 2px;
  background: #ececec;
  overflow: hidden;
}
.seo-meter__fill {
  height: 100%;
  background: #bdbdbd;
  transition: width 0.15s ease;
}
.seo-meter[data-status='good'] .seo-meter__fill {
  background: var(--cms-accent);
}
.seo-meter[data-status='short'] .seo-meter__fill,
.seo-meter[data-status='long'] .seo-meter__fill {
  background: #e0a100;
}
.seo-meter__row {
  display: flex;
  justify-content: space-between;
  margin-top: 3px;
  font-size: 11px;
  color: var(--cms-ink-subtle);
}
.seo-meter__pixels--over {
  color: #c77800;
  font-weight: 600;
}
</style>
