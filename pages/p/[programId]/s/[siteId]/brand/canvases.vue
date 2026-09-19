<template>
  <AdminPageHeader
    :title="t('admin.brand.canvasesTitle', 'Brand canvases')"
    :description="t('admin.brand.canvasesDescription', `Compose reusable brand canvases from the site's blocks, approve them, then generate assets.`)"
    alert-context="brand-templates"
  />
  <BrandCanvasManagerPanel />
</template>

<script setup lang="ts">
import { useBrandTemplateStore } from '~/admin/stores/brandTemplateStore'
import { useSite } from '~/admin/composables/useSite'
import BrandCanvasManagerPanel from '~/admin/components/editor/BrandCanvasManagerPanel.vue'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'

definePageMeta({ layout: 'admin' })
const { t } = useAdminI18n()

const { siteId, hasSite } = useSite()
const store = useBrandTemplateStore()

async function loadCanvasStudio(): Promise<void> {
  await Promise.all([store.load(), store.fetchPresets()])
  const firstTemplate = store.templates[0]
  if (!store.selectedId && firstTemplate) store.select(firstTemplate.id)
}

onMounted(() => {
  if (hasSite.value) void loadCanvasStudio()
})

// Canvases are site-scoped rows, so a site switch is a different list — and
// `load()` clears a selection that is no longer in it. Presets are per-theme,
// so a different site can mean a different (or absent) art-direction list.
watch(siteId, (newId) => {
  if (newId) void loadCanvasStudio()
})
</script>
