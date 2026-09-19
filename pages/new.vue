<template>
  <AdminPageHeader
    :title="t('admin.websites.createTitle', 'Create a website')"
    :description="t('admin.websites.createDescription', 'Choose its workspace, address, design, and starting content.')"
    alert-context="new-site"
  />

  <form @submit.prevent="handleSubmit" style="max-width: 60rem;">
    <!-- Workspace selector -->
    <div class="cms-form-group">
      <label for="program" class="cms-label">
        {{ t('admin.websites.workspace', 'Workspace') }} <span class="required-star">*</span>
      </label>
      <div v-if="programsLoading" class="text-muted" style="font-size: 1.3rem;">
        <span class="cms-spinner cms-spinner--sm" /> {{ t('admin.websites.loadingWorkspaces', 'Loading workspaces…') }}
      </div>
      <select
        v-else
        id="program"
        v-model="selectedProgramId"
        class="cms-form-control"
        required
      >
        <option value="" disabled>{{ t('admin.websites.selectWorkspaceOption', 'Select a workspace') }}</option>
        <option v-for="p in programs" :key="p.id" :value="p.id">
          {{ p.name }}
        </option>
      </select>
    </div>

    <div class="cms-form-group">
      <label for="name" class="cms-label">
        {{ t('admin.websites.websiteName', 'Website name') }} <span class="required-star">*</span>
      </label>
      <input
        id="name"
        v-model="name"
        type="text"
        class="cms-form-control"
        placeholder="My Website"
        required
        @input="autoSlug"
      />
    </div>

    <div class="cms-form-group">
      <label for="slug" class="cms-label">
        {{ t('admin.websites.siteAddress', 'Site address') }} <span class="required-star">*</span>
      </label>
      <input
        id="slug"
        v-model="slug"
        type="text"
        class="cms-form-control"
        placeholder="my-website"
        pattern="[a-z0-9\-]+"
        required
      />
      <div class="cms-helper-text">{{ t('admin.websites.slugHint', 'Lowercase letters, numbers, and hyphens only.') }}</div>
      <div v-if="subdomainPreview" class="subdomain-preview">
        {{ subdomainPreview }}
      </div>
    </div>

    <div class="cms-form-group">
      <label class="cms-label">{{ t('admin.websites.websiteDesign', 'Website design') }} <span class="required-star">*</span></label>

      <div v-if="themesLoading" class="text-muted" style="font-size: 1.3rem;">
        <span class="cms-spinner cms-spinner--sm" /> {{ t('admin.websites.loadingDesigns', 'Loading designs…') }}
      </div>
      <div v-else-if="themesError" class="cms-error-text">{{ themesError }}</div>
      <div v-else-if="themes.length === 0" class="text-muted" style="font-size: 1.3rem;">
        {{ t('admin.websites.noDesigns', 'No website designs are available.') }}
      </div>

      <div v-else class="theme-picker">
        <div
          v-for="theme in themes"
          :key="theme.name"
          class="theme-card"
          :class="{ selected: selectedTheme === theme.name }"
          @click="selectedTheme = theme.name"
        >
          <input
            type="radio"
            name="theme"
            :id="'theme-' + theme.name"
            :value="theme.name"
            v-model="selectedTheme"
            class="visually-hidden"
          />
          <label :for="'theme-' + theme.name" class="theme-card-label">
            <strong>{{ theme.name }}</strong>
            <span class="theme-card-meta">{{ t('admin.websites.blocks', `${theme.blockCount ?? 0} blocks`, { count: theme.blockCount ?? 0 }) }}</span>
          </label>
        </div>
      </div>
    </div>

    <div v-if="selectedTheme" class="cms-form-group">
      <label class="cms-label">{{ t('admin.websites.startingPoint', 'Starting point') }} <span class="required-star">*</span></label>
      <div v-if="blueprintsLoading" class="text-muted" style="font-size: 1.3rem;">
        <span class="cms-spinner cms-spinner--sm" /> {{ t('admin.websites.loadingStarters', 'Loading starters…') }}
      </div>
      <div v-else-if="blueprintsError" class="cms-error-text">{{ blueprintsError }}</div>
      <div v-else class="theme-picker">
        <label
          v-for="blueprint in blueprints"
          :key="blueprint.id"
          class="theme-card"
          :class="{ selected: selectedBlueprint === blueprint.id }"
        >
          <input
            v-model="selectedBlueprint"
            type="radio"
            name="blueprint"
            :value="blueprint.id"
            class="visually-hidden"
          />
          <span class="theme-card-label">
            <strong>{{ blueprint.label }}</strong>
            <span class="theme-card-meta">{{ blueprint.description }}</span>
          </span>
        </label>
      </div>
    </div>

    <!-- Optional parent website -->
    <div v-if="availableParentSites.length > 0" class="cms-form-group">
      <label for="parentSite" class="cms-label">{{ t('admin.websites.publishUnder', 'Publish under another website (optional)') }}</label>
      <select
        id="parentSite"
        v-model="selectedParentSiteId"
        class="cms-form-control"
      >
        <option value="">{{ t('admin.websites.ownAddress', 'No, use its own address') }}</option>
        <option v-for="s in availableParentSites" :key="s.id" :value="s.id">
          {{ s.name }} ({{ s.slug }})
        </option>
      </select>
      <div class="cms-helper-text">{{ t('admin.websites.publishUnderHint', 'Choose another website to publish this one under its address.') }}</div>
    </div>

    <!-- Path on parent website -->
    <div v-if="selectedParentSiteId" class="cms-form-group">
      <label for="mountPath" class="cms-label">
        {{ t('admin.websites.parentPath', 'Path on parent website') }} <span class="required-star">*</span>
      </label>
      <input
        id="mountPath"
        v-model="mountPath"
        type="text"
        class="cms-form-control"
        placeholder="shop"
        pattern="[a-z0-9\-]+"
        required
      />
      <div class="cms-helper-text">{{ t('admin.websites.parentPathHint', 'For example, “shop” publishes this website at parent-address/shop/.') }}</div>
    </div>

    <button
      type="submit"
      class="cms-btn cms-btn--primary"
      :disabled="submitting || !selectedTheme || !selectedBlueprint || !selectedProgramId || (!!selectedParentSiteId && !mountPath)"
    >
      <span v-if="submitting" class="cms-btn-spinner" />
      {{ t('admin.websites.create', 'Create website') }}
    </button>
  </form>
</template>

<script setup lang="ts">
import { useProgramStore } from '~/admin/stores/programStore'
import { useSiteStore } from '~/admin/stores/siteStore'
import { useAdminUrl } from '~/admin/composables/useAdminUrl'
import { useNewSiteFlow } from '~/admin/composables/useNewSiteFlow'
import type { ProgramSummary, SiteSummary } from '~/server/storage/types'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'

definePageMeta({ layout: 'admin' })
const { t } = useAdminI18n()

const runtimeConfig = useRuntimeConfig()
const programStore = useProgramStore()
const siteStore = useSiteStore()
const { adminUrl } = useAdminUrl()
const { finalize } = useNewSiteFlow()

interface ThemeInfo {
  name: string
  blockCount?: number
}

interface BlueprintInfo {
  id: string
  label: string
  description?: string
  theme: string
  default: boolean
}

const name = ref('')
const slug = ref('')
const selectedTheme = ref('')
const selectedBlueprint = ref('')
const selectedProgramId = ref('')
const selectedParentSiteId = ref('')
const mountPath = ref('')
const submitting = ref(false)

const themes = ref<ThemeInfo[]>([])
const themesLoading = ref(true)
const themesError = ref('')
const blueprints = ref<BlueprintInfo[]>([])
const blueprintsLoading = ref(false)
const blueprintsError = ref('')

const programs = ref<ProgramSummary[]>([])
const programsLoading = ref(true)

const programSites = ref<SiteSummary[]>([])

// Sites eligible to be a parent: in the same program, not already a child
const availableParentSites = computed(() =>
  programSites.value.filter(s => !s.parentSiteId),
)

watch(selectedTheme, async (theme) => {
  selectedBlueprint.value = ''
  blueprints.value = []
  blueprintsError.value = ''
  if (!theme) return
  blueprintsLoading.value = true
  try {
    const data = await $fetch<{ blueprints: BlueprintInfo[] }>('/api/admin/blueprints', {
      params: { theme },
    })
    blueprints.value = data.blueprints ?? []
    selectedBlueprint.value = blueprints.value.find(item => item.default)?.id
      ?? (blueprints.value.length === 1 ? blueprints.value[0]!.id : '')
    if (blueprints.value.length === 0) blueprintsError.value = 'This theme has no site starter.'
  } catch (e: any) {
    blueprintsError.value = e?.data?.statusMessage || 'Failed to load site starters'
  } finally {
    blueprintsLoading.value = false
  }
})

let slugManuallyEdited = false

const selectedProgram = computed(() =>
  programs.value.find(p => p.id === selectedProgramId.value) ?? null,
)

const subdomainPreview = computed(() => {
  if (selectedParentSiteId.value) return '' // child sites have no domain
  if (!slug.value || !selectedProgram.value) return ''
  const baseDomain = runtimeConfig.public.cmsBaseDomain
  return `${slug.value}--${selectedProgram.value.slug}.${baseDomain}`
})

// Fetch sites for the selected program (to populate parent site dropdown)
watch(selectedProgramId, async (programId) => {
  selectedParentSiteId.value = ''
  mountPath.value = ''
  if (!programId) {
    programSites.value = []
    return
  }
  try {
    const data = await $fetch<{ sites: SiteSummary[] }>('/api/admin/sites', {
      params: { programId },
    })
    programSites.value = data.sites || []
  } catch {
    programSites.value = []
  }
})

function autoSlug() {
  if (slugManuallyEdited) return
  slug.value = name.value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

watch(slug, (newVal) => {
  const autoGenerated = name.value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  if (newVal !== autoGenerated) {
    slugManuallyEdited = true
  }
})

onMounted(async () => {
  // Fetch themes and programs in parallel
  await Promise.allSettled([
    $fetch<{ themes: ThemeInfo[] }>('/api/admin/themes').then(data => {
      themes.value = data.themes
      if (themes.value.length === 1) {
        selectedTheme.value = themes.value[0]!.name
      }
    }).catch((e: any) => {
      themesError.value = e?.data?.statusMessage || 'Failed to load themes'
    }).finally(() => {
      themesLoading.value = false
    }),
    $fetch<{ programs: ProgramSummary[] }>('/api/admin/programs').then(data => {
      programs.value = data.programs || []
      // Pre-fill from active program in store
      if (programStore.activeProgramId) {
        selectedProgramId.value = programStore.activeProgramId
      } else if (programs.value.length === 1) {
        selectedProgramId.value = programs.value[0]!.id
      }
    }).finally(() => {
      programsLoading.value = false
    }),
  ])
})

async function handleSubmit() {
  submitting.value = true

  try {
    const data = await $fetch<{ site: { id: string; name: string; theme: string } }>('/api/admin/sites', {
      method: 'POST',
      body: {
        name: name.value,
        slug: slug.value,
        theme: selectedTheme.value,
        blueprintId: selectedBlueprint.value,
        programId: selectedProgramId.value,
        ...(selectedParentSiteId.value ? {
          parentSiteId: selectedParentSiteId.value,
          mountPath: mountPath.value,
        } : {}),
      },
    })

    const chosenProgram = programs.value.find(p => p.id === selectedProgramId.value)
    if (!chosenProgram) throw new Error('Selected program not found')
    await finalize(chosenProgram, data.site)
  } catch (e: any) {
    const { useAlertStore } = await import('~/admin/stores/alertStore')
    useAlertStore().danger(
      e?.data?.statusMessage || 'Failed to create site',
      undefined,
      'new-site',
    )
  } finally {
    submitting.value = false
  }
}
</script>

<style lang="scss" scoped>
@use '~/admin/assets/scss/variables' as *;

.theme-picker {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.theme-card {
  border: 2px solid $borders-color;
  border-radius: 0.4rem;
  padding: 1.5rem 2rem;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  min-width: 16rem;

  &:hover {
    border-color: $text-light-color;
  }

  &.selected {
    border-color: $primary-color;
    box-shadow: 0 0 0 2px rgba(46, 125, 50, 0.15);
  }

  .theme-card-label {
    cursor: pointer;
    display: block;

    strong {
      font-size: 1.4rem;
      color: $text-color;
      display: block;
    }

    .theme-card-meta {
      font-size: 1.2rem;
      color: $text-light-color;
    }
  }
}

.subdomain-preview {
  margin-top: 0.5rem;
  font-size: 1.2rem;
  color: $primary-color;
  font-style: italic;
}
</style>
