<template>
  <AdminPageHeader
    :title="t('admin.brand.assetsTitle', 'Create brand assets')"
    :description="t('admin.brand.assetsDescription', `Generate ready-to-use images from this site's approved brand canvases.`)"
    alert-context="brand-formats"
  />
  <BrandFormatStudioPanel />
</template>

<script setup lang="ts">
import { useBrandFormatStore } from '~/admin/stores/brandFormatStore'
import { useTypographyStore } from '~/admin/stores/typographyStore'
import { useSite } from '~/admin/composables/useSite'
import { useAdminTypographyStyles } from '~/admin/composables/useAdminTypographyStyles'
import BrandFormatStudioPanel from '~/admin/components/editor/BrandFormatStudioPanel.vue'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'

definePageMeta({ layout: 'admin' })
const { t } = useAdminI18n()

const { siteId, hasSite } = useSite()
const store = useBrandFormatStore()
const typographyStore = useTypographyStore()

// TipTap stores preset bindings as classes; install the same generated CSS as
// the page editor so choosing a preset visibly updates the authoring surface.
useAdminTypographyStyles()

/**
 * Studio data loads are cheap and independent:
 *
 *  - the site's APPROVED canvases — the same `brand_format_templates` rows the
 *    Brand canvases page authors, listed here once approved, one source of truth;
 *  - the named brand presets, which stamp the recipe (and will be the context
 *    the AI author composes against). They style nothing: a canvas renders with
 *    the site's live theme.
 *  - typography presets and roles, so rich-text controls expose and render the
 *    same preset vocabulary as the main page editor.
 *
 * The route path is `/brand-formats` for history — the compiled-format tier is
 * gone, but the route and its API namespace kept their names rather than take a
 * rename's churn.
 */
async function loadStudio(): Promise<void> {
  await Promise.all([
    store.loadTemplates(),
    store.loadPresets(),
    typographyStore.fetchTypographyPresets(),
    typographyStore.fetchTypographyRoles(),
  ])
}

onMounted(() => {
  if (hasSite.value) void loadStudio()
})

watch(siteId, (newId) => {
  if (newId) void loadStudio()
})
</script>
