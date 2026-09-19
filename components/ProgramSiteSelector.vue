<template>
  <div class="program-site-selector">
    <div class="selector-heading">{{ t('admin.context.currentSite', 'Current site') }}</div>
    <!-- Workspace dropdown -->
    <div class="selector-group">
      <label class="selector-label">{{ t('admin.context.workspace', 'Workspace') }}</label>
      <select
        v-model="selectedProgramId"
        class="selector-control"
        @change="onProgramChange"
      >
        <option v-for="p in programStore.programs" :key="p.id" :value="p.id">
          {{ p.name }}
        </option>
      </select>
    </div>

    <!-- Website dropdown -->
    <div class="selector-group">
      <label class="selector-label">{{ t('admin.context.website', 'Website') }}</label>
      <select
        v-model="selectedSiteId"
        class="selector-control"
        :disabled="siteStore.sites.length === 0"
        @change="onSiteChange"
      >
        <option v-if="siteStore.sites.length === 0" value="" disabled>
          {{ t('admin.context.noWebsites', 'No websites') }}
        </option>
        <template v-for="entry in groupedSites" :key="entry.site.id">
          <option :value="entry.site.id">
            {{ entry.label }}
          </option>
        </template>
      </select>
    </div>

    <!-- Current public address -->
    <div v-if="activeDomain" class="domain-preview">
      <span class="material-icons-outlined" aria-hidden="true">language</span>
      <span>{{ activeDomain }}</span>
    </div>
    <div v-else-if="siteStore.activeSite?.parentSiteId" class="domain-preview">
      Child of parent · /{{ siteStore.activeSite.mountPath }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useProgramStore } from '~/admin/stores/programStore'
import { useSiteStore } from '~/admin/stores/siteStore'
import { useAdminUrl } from '~/admin/composables/useAdminUrl'
import { buildPlatformDomain } from '~/admin/utils/publicSiteUrl'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'

const programStore = useProgramStore()
const siteStore = useSiteStore()
const route = useRoute()
const runtimeConfig = useRuntimeConfig()
const { adminUrl, extractSuffix } = useAdminUrl()
const { t } = useAdminI18n()

const selectedProgramId = ref<string>('')
const selectedSiteId = ref<string>('')

const activeDomain = computed(() => {
  const site = siteStore.activeSite
  return buildPlatformDomain({
    storedDomain: site?.domain,
    siteSlug: site?.slug,
    programSlug: programStore.activeProgram?.slug,
    baseDomain: runtimeConfig.public.cmsBaseDomain,
  })
})

const groupedSites = computed(() => {
  const sites = siteStore.sites
  const parentSites = sites.filter(s => !s.parentSiteId)
  const childMap = new Map<string, typeof sites>()
  for (const s of sites) {
    if (s.parentSiteId) {
      const children = childMap.get(s.parentSiteId) ?? []
      children.push(s)
      childMap.set(s.parentSiteId, children)
    }
  }

  const result: Array<{ site: typeof sites[0]; label: string }> = []
  for (const parent of parentSites) {
    result.push({ site: parent, label: parent.name })
    const children = childMap.get(parent.id) ?? []
    for (const child of children) {
      result.push({ site: child, label: `  └ ${child.name} (/${child.mountPath})` })
    }
  }
  // Orphan children (parent not in current list — unlikely but safe)
  const parentIdSet = new Set(parentSites.map(p => p.id))
  for (const s of sites) {
    if (s.parentSiteId && !parentIdSet.has(s.parentSiteId)) {
      result.push({ site: s, label: `⚠ ${s.name} (/${s.mountPath}) (orphan)` })
    }
  }
  return result
})

// Sync local selection with store state
watch(() => programStore.activeProgramId, (id) => {
  if (id) selectedProgramId.value = id
}, { immediate: true })

watch(() => siteStore.activeSiteId, (id) => {
  if (id) selectedSiteId.value = id
}, { immediate: true })

async function onProgramChange() {
  const program = programStore.programs.find(p => p.id === selectedProgramId.value)
  if (!program) return

  programStore.setProgram({ id: program.id, name: program.name })
  await siteStore.onProgramChange(program.id)

  selectedSiteId.value = siteStore.activeSiteId || ''

  // Navigate to the same page under the new program/site context
  const suffix = extractSuffix(route.path)
  await navigateTo(adminUrl(suffix))
}

async function onSiteChange() {
  const site = siteStore.sites.find(s => s.id === selectedSiteId.value)
  if (!site) return

  siteStore.setSite({ id: site.id, name: site.name, theme: site.theme })

  // Navigate to the same page under the new site context
  const suffix = extractSuffix(route.path)
  await navigateTo(adminUrl(suffix))
}
</script>

<style lang="scss" scoped>
@use '~/admin/assets/scss/variables' as *;

.program-site-selector {
  margin: 0;
  padding: 1.6rem 1.2rem 1.2rem;
  border-bottom: 1px solid $borders-color;
  background: $surface;
}

.selector-heading {
  margin: 0 0 1rem 0.4rem;
  color: $ink-muted;
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.selector-group {
  margin-bottom: 0.8rem;

  &:last-of-type {
    margin-bottom: 0;
  }
}

.selector-label {
  display: block;
  font-size: 1.1rem;
  font-weight: 700;
  color: $text-light-color;
  margin: 0 0 0.4rem 0.4rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.selector-control {
  width: 100%;
  height: 3.8rem;
  padding: 0 1rem;
  font-size: 1.3rem;
  font-weight: 600;
  border: 1px solid transparent;
  border-radius: 0.8rem;
  color: $text-color;
  background-color: $surface-subtle;
  cursor: pointer;
  transition: border-color $motion-fast ease, box-shadow $motion-fast ease;

  &:focus {
    border-color: $primary-color;
    outline: none;
    box-shadow: 0 0 0 3px rgba(46, 125, 50, 0.14);
  }

  &:hover:not(:disabled) {
    border-color: $line-strong;
    background-color: $surface;
  }

  &:disabled {
    background-color: $disabled-input-bg;
    cursor: not-allowed;
    color: $text-light-color;
  }
}

.domain-preview {
  margin: 0.8rem 0.4rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.15rem;
  color: $text-light-color;
  word-break: break-all;

  .material-icons-outlined {
    flex: 0 0 auto;
    font-size: 1.4rem;
    color: $primary-color;
  }
}
</style>
