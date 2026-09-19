<template>
  <AdminPageHeader
    :title="t('admin.typography.title', 'Fonts & text styles')"
    :description="t('admin.typography.description', 'Manage the reusable type styles that keep this website consistent.')"
    alert-context="typography"
  />

  <ul class="nav nav-tabs typography-page__tabs" role="tablist">
    <li class="nav-item" role="presentation">
      <button
        type="button"
        role="tab"
        class="nav-link"
        :class="{ active: activeTab === 'presets' }"
        @click="switchTab('presets')"
      >
        Presets
      </button>
    </li>
    <li class="nav-item" role="presentation">
      <button
        type="button"
        role="tab"
        class="nav-link"
        :class="{ active: activeTab === 'roles' }"
        @click="switchTab('roles')"
      >
        Roles
      </button>
    </li>
    <li class="nav-item" role="presentation">
      <button
        type="button"
        role="tab"
        class="nav-link"
        :class="{ active: activeTab === 'diagnostics' }"
        @click="switchTab('diagnostics')"
      >
        Diagnostics
      </button>
    </li>
  </ul>

  <div v-if="isLoading" class="text-center py-5">
    <span class="cms-spinner cms-spinner--lg" />
  </div>

  <div v-else-if="error" class="cms-alert cms-alert--danger">
    <span class="material-icons-outlined cms-alert-icon">error</span>
    <div class="cms-alert-content">
      <div class="cms-alert-title">{{ t('admin.typography.loadFailed', 'Failed to load typography data') }}</div>
      <div class="cms-alert-description">{{ error }}</div>
    </div>
  </div>

  <TypographyPresets
    v-else-if="activeTab === 'presets'"
    :presets="presets"
    :selected-preset-id="selectedPresetId"
    :saving="saving"
    :font-variants="fontVariants"
    :fetch-usage="fetchPresetUsage"
    :unused-keys="unusedPresetKeys"
    @select="handleSelectPreset"
    @create="handleCreatePreset"
    @update="handleUpdatePreset"
    @delete="handleDeletePreset"
    @duplicate="handleDuplicatePreset"
    @reorder="handleReorderPresets"
    @dirty-change="handleDirtyChange"
  />

  <TypographyRoles
    v-else-if="activeTab === 'roles'"
    :presets="presets"
    :roles="roles"
    :role-map="roleMap"
    :saving="saving"
    @save="handleSaveRoles"
    @reset="handleResetRoles"
    @dirty-change="handleDirtyChange"
  />

  <TypographyDiagnostics
    v-else-if="activeTab === 'diagnostics'"
    :refresh-key="diagnosticsRefreshKey"
  />
</template>

<script setup lang="ts">
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import AdminLayout from '~/admin/components/Layout.vue'
import AdminPageHeader from '~/admin/components/AdminPageHeader.vue'
import TypographyPresets from '~/admin/components/typography/TypographyPresets.vue'
import TypographyRoles from '~/admin/components/typography/TypographyRoles.vue'
import TypographyDiagnostics from '~/admin/components/typography/TypographyDiagnostics.vue'
import { useSite } from '~/admin/composables/useSite'
import { useSiteApi } from '~/admin/composables/useSiteApi'
import { useTypographyAdmin } from '~/admin/composables/useTypographyAdmin'
import { useAdminFontFaces } from '~/admin/composables/useAdminFontFaces'
import { useEditorStore } from '~/admin/stores/editorStore'
import { useAlertStore } from '~/admin/stores/alertStore'
import type {
  PresetCategory,
  SystemRole,
  TypographyPreset,
  UpdatePresetDto,
} from '~/server/services/typography/typographyTypes'
import type { ThemeVariant } from '~/shared/typography/axisResolution'

definePageMeta({ layout: 'admin' })
const { t } = useAdminI18n()

const route = useRoute()
const router = useRouter()
const { siteId } = useSite()
const { siteFetch } = useSiteApi()
const alertStore = useAlertStore()

const {
  presets,
  roles,
  roleMap,
  loadingPresets,
  loadingRoles,
  saving,
  error,
  refresh,
  createPreset,
  updatePreset,
  deletePreset,
  duplicatePreset,
  reorderPresets,
  fetchPresetUsage,
  saveRoles,
  resetRoles,
} = useTypographyAdmin()

const selectedPresetId = ref<string | null>(null)
const isDirty = ref(false)
const fontVariants = ref<ThemeVariant[]>([])
const diagnosticsRefreshKey = ref(0)
const isLoading = computed(() => loadingPresets.value || loadingRoles.value)

// Preset keys that render nowhere. The Diagnostics tab already reported these
// as an "info" line, which meant an author could edit a preset that could not
// possibly affect the site and get no hint why. Same endpoint, same refresh
// key — the diagnostics engine stays the one source of truth.
const unusedPresetKeys = ref<string[]>([])

async function loadUnusedPresetKeys() {
  try {
    const data = await siteFetch<{ diagnostics: { code: string, key: string }[] }>(
      '/typography/diagnostics',
    )
    unusedPresetKeys.value = data.diagnostics
      .filter(d => d.code === 'unused-preset')
      .map(d => d.key)
  } catch (e: any) {
    // Non-critical: the badge is an enhancement and the Diagnostics tab still
    // reports the same finding, so this must never block the preset list — but
    // it is logged rather than swallowed, or the badges just silently vanish.
    console.warn('[typography] Failed to load preset diagnostics:', e?.message ?? e)
    unusedPresetKeys.value = []
  }
}

// Driven off the loaded presets, not onMounted: siteFetch needs the resolved
// site, and firing on mount raced that and always failed back to an empty list.
watch(
  [() => presets.value.length, diagnosticsRefreshKey],
  ([count]) => { if (count > 0) loadUnusedPresetKeys() },
  { immediate: true },
)

type TabId = 'presets' | 'roles' | 'diagnostics'
const TAB_IDS: TabId[] = ['presets', 'roles', 'diagnostics']
const activeTab = computed<TabId>(() => {
  const q = route.query.tab as string | undefined
  return TAB_IDS.includes(q as TabId) ? (q as TabId) : 'presets'
})

// Inject @font-face rules for theme variants (incl. variable fonts) so the
// PresetEditor preview pane actually renders Fraunces et al. — without this
// the browser falls back to system serif and silently ignores
// font-variation-settings (Phase C). The composable reads from
// editorStore.themeManifest, which we populate via fetchSchemas() below.
const editorStore = useEditorStore()
useAdminFontFaces()

watch(
  siteId,
  async (nextSiteId) => {
    if (!nextSiteId) return
    selectedPresetId.value = null
    isDirty.value = false
    await Promise.all([refresh(), loadFontVariants(), editorStore.fetchSchemas()])
  },
  { immediate: true },
)

onBeforeRouteLeave(() => {
  if (!isDirty.value) return
  if (!window.confirm('You have unsaved changes. Discard them and leave this page?')) {
    return false
  }
})

function beforeUnloadHandler(event: BeforeUnloadEvent) {
  if (!isDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  window.addEventListener('beforeunload', beforeUnloadHandler)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnloadHandler)
})

async function loadFontVariants() {
  try {
    const data = await siteFetch<{ theme?: { typography?: { variants?: ThemeVariant[] } } }>('/schemas')
    fontVariants.value = data.theme?.typography?.variants ?? []
  } catch {
    fontVariants.value = []
  }
}

function confirmDiscard(message = 'You have unsaved changes. Discard them?'): boolean {
  if (!isDirty.value) return true
  return window.confirm(message)
}

function handleDirtyChange(dirty: boolean) {
  isDirty.value = dirty
}

async function switchTab(tab: TabId) {
  if (tab === activeTab.value) return
  if (!confirmDiscard('You have unsaved changes. Discard them and switch tabs?')) return
  isDirty.value = false
  await router.replace({
    query: {
      ...route.query,
      tab,
    },
  })
}

function buildUntitledName(existingPresets: TypographyPreset[]): string {
  const baseName = 'Untitled Preset'
  const existingNames = new Set(existingPresets.map(preset => preset.name.toLowerCase()))

  if (!existingNames.has(baseName.toLowerCase())) return baseName

  let suffix = 2
  while (existingNames.has(`${baseName} ${suffix}`.toLowerCase())) {
    suffix += 1
  }
  return `${baseName} ${suffix}`
}

async function handleSelectPreset(id: string) {
  if (id === selectedPresetId.value) return
  if (!confirmDiscard('You have unsaved changes. Discard them and switch presets?')) return
  selectedPresetId.value = id
  isDirty.value = false
}

async function handleCreatePreset() {
  if (!confirmDiscard('You have unsaved changes. Discard them and create a new preset?')) return

  alertStore.clearContext('typography')
  try {
    const preset = await createPreset({
      name: buildUntitledName(presets.value),
      category: 'body',
    })
    selectedPresetId.value = preset.id
    isDirty.value = false
    alertStore.success('Preset created.', undefined, 'typography')
  } catch (err: any) {
    alertStore.danger('Create failed.', err?.data?.statusMessage || 'Could not create the preset.', 'typography')
  }
}

async function handleUpdatePreset(id: string, dto: UpdatePresetDto) {
  alertStore.clearContext('typography')
  try {
    await updatePreset(id, dto)
    isDirty.value = false
    diagnosticsRefreshKey.value++
    alertStore.success('Preset saved.', undefined, 'typography')
  } catch (err: any) {
    alertStore.danger('Save failed.', err?.data?.statusMessage || 'Could not save the preset.', 'typography')
  }
}

async function handleDeletePreset(id: string) {
  alertStore.clearContext('typography')
  try {
    await deletePreset(id)
    if (selectedPresetId.value === id) selectedPresetId.value = null
    isDirty.value = false
    diagnosticsRefreshKey.value++
    alertStore.success('Preset deleted.', undefined, 'typography')
  } catch (err: any) {
    alertStore.danger('Delete failed.', err?.data?.statusMessage || 'Could not delete the preset.', 'typography')
  }
}

async function handleDuplicatePreset(id: string) {
  if (!confirmDiscard('You have unsaved changes. Discard them and duplicate this preset?')) return

  alertStore.clearContext('typography')
  try {
    const preset = await duplicatePreset(id)
    selectedPresetId.value = preset.id
    isDirty.value = false
    alertStore.success('Preset duplicated.', undefined, 'typography')
  } catch (err: any) {
    alertStore.danger('Duplicate failed.', err?.data?.statusMessage || 'Could not duplicate the preset.', 'typography')
  }
}

async function handleReorderPresets(category: PresetCategory, orderedIds: string[]) {
  alertStore.clearContext('typography')
  try {
    await reorderPresets(category, orderedIds)
  } catch (err: any) {
    alertStore.danger('Reorder failed.', err?.data?.statusMessage || 'Could not reorder presets.', 'typography')
  }
}

async function handleSaveRoles(mappings: Record<SystemRole, string | null>) {
  alertStore.clearContext('typography')
  try {
    await saveRoles(mappings)
    isDirty.value = false
    diagnosticsRefreshKey.value++
    alertStore.success('Roles saved.', undefined, 'typography')
  } catch (err: any) {
    alertStore.danger('Save failed.', err?.data?.statusMessage || 'Could not save role assignments.', 'typography')
  }
}

async function handleResetRoles() {
  alertStore.clearContext('typography')
  try {
    await resetRoles()
    isDirty.value = false
    diagnosticsRefreshKey.value++
    alertStore.success('Roles reset to defaults.', undefined, 'typography')
  } catch (err: any) {
    alertStore.danger('Reset failed.', err?.data?.statusMessage || 'Could not reset role assignments.', 'typography')
  }
}
</script>

<style scoped lang="scss">
.typography-page__tabs {
  margin-bottom: 2rem;
}

.typography-page__tabs :deep(.nav-link) {
  color: var(--cms-ink-body);
  font-size: 1.3rem;
  font-weight: 600;
}

.typography-page__tabs :deep(.nav-link.active) {
  color: var(--cms-accent);
}

@media (max-width: 767px) {
  .typography-page__tabs {
    overflow-x: auto;
    flex-wrap: nowrap;
  }
}
</style>
