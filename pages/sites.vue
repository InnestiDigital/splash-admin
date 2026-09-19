<template>
  <AdminPageHeader
    :title="t('admin.websites.title', 'Websites')"
    :description="t('admin.websites.description', 'Create and manage the websites in the current workspace.')"
    alert-context="sites"
  >
    <template #actions>
      <button
        v-if="programStore.activeProgramId"
        class="cms-btn cms-btn--primary"
        @click="navigateTo('/admin/new')"
      >
        <span class="material-icons-outlined" aria-hidden="true">add</span>
        {{ t('admin.websites.add', 'Add website') }}
      </button>
    </template>
  </AdminPageHeader>

  <!-- No program selected -->
  <div v-if="!programStore.activeProgramId" class="text-center py-5">
    <p class="text-muted" style="font-size: 1.5rem;">{{ t('admin.websites.selectWorkspace', 'Select a workspace from the sidebar to manage its websites.') }}</p>
  </div>

  <template v-else>
    <!-- Loading -->
    <div v-if="loading" class="text-center py-5">
      <span class="cms-spinner cms-spinner--lg" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="cms-alert cms-alert--danger">
      <span class="material-icons-outlined cms-alert-icon">error</span>
      <div class="cms-alert-content">
        <div class="cms-alert-title">{{ t('admin.websites.loadFailed', 'Failed to load websites') }}</div>
        <div class="cms-alert-description">{{ error }}</div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else-if="sitesList.length === 0" class="text-center py-5">
      <p class="text-muted" style="font-size: 1.5rem;">{{ t('admin.websites.empty', 'No websites in this workspace yet.') }}</p>
    </div>

    <!-- Sites table -->
    <div v-else class="cms-table-wrapper">
      <table class="cms-table">
        <thead>
          <tr>
            <th>{{ t('admin.websites.name', 'Name') }}</th><th>{{ t('admin.websites.urlKey', 'URL key') }}</th><th>{{ t('admin.websites.design', 'Design') }}</th>
            <th>{{ t('admin.websites.publishedUnder', 'Published under') }}</th><th>{{ t('admin.websites.address', 'Address') }}</th><th>{{ t('admin.websites.created', 'Created') }}</th>
            <th style="width: 12rem;">{{ t('admin.collections.actions', 'Actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="site in sitesList" :key="site.id">
            <template v-if="editingId === site.id">
              <td>
                <input
                  v-model="editName"
                  type="text"
                  class="cms-form-control cms-form-control--inline"
                  required
                />
              </td>
              <td>
                <input
                  v-model="editSlug"
                  type="text"
                  class="cms-form-control cms-form-control--inline"
                  pattern="[a-z0-9\-]+"
                  required
                />
              </td>
              <td>{{ site.theme }}</td>
              <td>
                <select
                  v-model="editParentSiteId"
                  class="cms-form-control cms-form-control--inline"
                >
                  <option value="">{{ t('admin.websites.standalone', 'None (standalone)') }}</option>
                  <option
                    v-for="s in availableParentSites(site.id)"
                    :key="s.id"
                    :value="s.id"
                  >
                    {{ s.name }} ({{ s.slug }})
                  </option>
                </select>
                <input
                  v-if="editParentSiteId"
                  v-model="editMountPath"
                  type="text"
                  class="cms-form-control cms-form-control--inline"
                  placeholder="mount-path"
                  pattern="[a-z0-9\-]+"
                  style="margin-top: 0.4rem;"
                  required
                />
              </td>
              <td><code>{{ displayDomain(site) || '--' }}</code></td>
              <td>{{ formatDate(site.createdAt) }}</td>
              <td>
                <button
                  class="cms-btn cms-btn--sm cms-btn--primary"
                  :disabled="saving"
                  @click="handleUpdate(site.id)"
                >
                  {{ t('common.save', 'Save') }}
                </button>
                <button
                  class="cms-btn cms-btn--sm cms-btn--secondary"
                  @click="cancelEdit"
                >
                  {{ t('admin.shared.cancel', 'Cancel') }}
                </button>
              </td>
            </template>
            <template v-else>
              <td>{{ site.name }}</td>
              <td><code>{{ site.slug }}</code></td>
              <td>{{ site.theme }}</td>
              <td>
                <template v-if="site.parentSiteId">
                  <span class="child-badge">{{ t('admin.websites.child', 'child') }}</span>
                  <code>{{ site.mountPath }}</code>
                </template>
                <template v-else>--</template>
              </td>
              <td><code>{{ displayDomain(site) || '--' }}</code></td>
              <td>{{ formatDate(site.createdAt) }}</td>
              <td>
                <button
                  class="cms-btn cms-btn--sm cms-btn--secondary"
                  @click="startEdit(site)"
                >
                  {{ t('common.edit', 'Edit') }}
                </button>
                <button
                  class="cms-btn cms-btn--sm cms-btn--danger-quiet"
                  @click="confirmDelete(site)"
                >
                  {{ t('common.delete', 'Delete') }}
                </button>
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
  </template>

  <UiModal
    :open="deleteTarget !== null"
    :title="t('admin.websites.deleteTitle', `Delete ${deleteTarget?.name ?? 'website'}?`, { name: deleteTarget?.name ?? 'website' })"
    :dismissible="!deleting"
    @close="deleteTarget = null"
  >
    <template #description>
      {{ t('admin.websites.deleteDescription', 'This permanently deletes the website, its pages, published versions, and media. It cannot be undone.') }}
    </template>

    <template #footer>
      <button class="cms-btn cms-btn--secondary" :disabled="deleting" @click="deleteTarget = null">
        {{ t('admin.shared.cancel', 'Cancel') }}
      </button>
      <button class="cms-btn cms-btn--danger" :disabled="deleting" @click="handleDelete">
        <span v-if="deleting" class="cms-btn-spinner" />
        {{ deleting ? t('common.deleting', 'Deleting…') : t('admin.websites.delete', 'Delete website') }}
      </button>
    </template>
  </UiModal>
</template>

<script setup lang="ts">
import type { SiteSummary } from '~/server/storage/types'
import { adminFetch } from '~/admin/utils/adminFetch'
import { useProgramStore } from '~/admin/stores/programStore'
import { useSiteStore } from '~/admin/stores/siteStore'
import { formatDate } from '~/admin/utils/formatters'
import { buildPlatformDomain } from '~/admin/utils/publicSiteUrl'
import UiModal from '~/admin/components/ui/UiModal.vue'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'

definePageMeta({ layout: 'admin' })
const { t } = useAdminI18n()

const programStore = useProgramStore()
const siteStore = useSiteStore()
const runtimeConfig = useRuntimeConfig()

const sitesList = ref<SiteSummary[]>([])
const loading = ref(false)
const error = ref('')

// Edit state
const editingId = ref<string | null>(null)
const editName = ref('')
const editSlug = ref('')
const editParentSiteId = ref('')
const editMountPath = ref('')
const saving = ref(false)

// Sites eligible to be a parent: not already a child, not the site being edited
function availableParentSites(currentSiteId: string) {
  return sitesList.value.filter(s => !s.parentSiteId && s.id !== currentSiteId)
}

function displayDomain(site: SiteSummary): string {
  if (site.parentSiteId) return ''
  return buildPlatformDomain({
    storedDomain: site.domain,
    siteSlug: site.slug,
    programSlug: programStore.activeProgram?.slug,
    baseDomain: runtimeConfig.public.cmsBaseDomain,
  })
}

// Delete state
const deleteTarget = ref<SiteSummary | null>(null)
const deleting = ref(false)

onMounted(async () => {
  if (programStore.activeProgramId) {
    await fetchSites()
  }
})

watch(() => programStore.activeProgramId, async (newId) => {
  if (newId) {
    await fetchSites()
  } else {
    sitesList.value = []
  }
})

async function fetchSites() {
  if (!programStore.activeProgramId) return
  loading.value = true
  error.value = ''
  try {
    const data = await $fetch<{ sites: SiteSummary[] }>('/api/admin/sites', {
      params: { programId: programStore.activeProgramId },
    })
    sitesList.value = data.sites || []
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Failed to load sites'
  } finally {
    loading.value = false
  }
}

function startEdit(site: SiteSummary) {
  editingId.value = site.id
  editName.value = site.name
  editSlug.value = site.slug
  editParentSiteId.value = site.parentSiteId || ''
  editMountPath.value = site.mountPath || ''
}

function cancelEdit() {
  editingId.value = null
  editName.value = ''
  editSlug.value = ''
  editParentSiteId.value = ''
  editMountPath.value = ''
}

async function handleUpdate(siteId: string) {
  saving.value = true
  try {
    const body: Record<string, string | null> = { name: editName.value, slug: editSlug.value }
    if (editParentSiteId.value) {
      body.parentSiteId = editParentSiteId.value
      body.mountPath = editMountPath.value
    } else {
      // Clear parent — make standalone again
      body.parentSiteId = null
      body.mountPath = null
    }
    await adminFetch(`/api/admin/sites/${siteId}`, {
      method: 'PUT',
      body,
    })
    cancelEdit()
    await fetchSites()
    // Refresh siteStore in case the active site was edited
    if (programStore.activeProgramId) {
      await siteStore.fetchSites(programStore.activeProgramId)
    }
  } catch (e: any) {
    const { useAlertStore } = await import('~/admin/stores/alertStore')
    useAlertStore().danger(
      e?.data?.statusMessage || 'Failed to update site',
      undefined,
      'sites',
    )
  } finally {
    saving.value = false
  }
}

function confirmDelete(site: SiteSummary) {
  deleteTarget.value = site
}

async function handleDelete() {
  if (!deleteTarget.value) return
  const deletedId = deleteTarget.value.id
  deleting.value = true
  try {
    await adminFetch(`/api/admin/sites/${deletedId}`, {
      method: 'DELETE',
    })
    deleteTarget.value = null
    await fetchSites()

    // If the deleted site was the active site, clear and auto-select
    if (siteStore.activeSiteId === deletedId) {
      if (sitesList.value.length > 0) {
        siteStore.setSite(sitesList.value[0])
      } else {
        siteStore.clearSite()
      }
    }

    // Refresh siteStore dropdown
    if (programStore.activeProgramId) {
      await siteStore.fetchSites(programStore.activeProgramId)
    }
  } catch (e: any) {
    const { useAlertStore } = await import('~/admin/stores/alertStore')
    useAlertStore().danger(
      e?.data?.statusMessage || 'Failed to delete site',
      undefined,
      'sites',
    )
  } finally {
    deleting.value = false
  }
}

</script>

<style lang="scss" scoped>
@use '~/admin/assets/scss/variables' as *;

.child-badge {
  display: inline-block;
  background: $primary-color;
  color: $pure-white;
  font-size: 1rem;
  padding: 0.1rem 0.5rem;
  border-radius: 0.3rem;
  margin-right: 0.4rem;
  vertical-align: middle;
}
</style>
