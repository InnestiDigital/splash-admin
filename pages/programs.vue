<template>
  <AdminPageHeader
    :title="t('admin.workspaces.title', 'Workspaces')"
    :description="t('admin.workspaces.description', 'Group related websites and control which people can access them.')"
    alert-context="programs"
  >
    <template #actions>
      <button
        v-if="!showCreateForm"
        class="cms-btn cms-btn--primary"
        @click="showCreateForm = true"
      >
        <span class="material-icons-outlined" aria-hidden="true">add</span>
        {{ t('admin.workspaces.add', 'Add workspace') }}
      </button>
    </template>
  </AdminPageHeader>

  <UiDrawer
    :open="showCreateForm"
    :title="t('admin.workspaces.create', 'Create a workspace')"
    :description="t('admin.workspaces.createDescription', 'Workspaces group websites and define the boundary for access.')"
    eyebrow="Workspaces"
    :dismissible="!creating"
    @close="requestCancelCreate"
  >
    <form
      class="inline-form"
      @submit.prevent="handleCreate"
    >
      <div class="inline-form-fields">
        <div class="cms-form-group mb-0">
          <label for="create-name" class="cms-label">{{ t('admin.workspaces.name', 'Name') }} <span class="required-star">*</span></label>
          <input
            id="create-name"
            v-model="createName"
            type="text"
            class="cms-form-control"
            placeholder="Program name"
            required
            @input="autoCreateSlug"
          />
        </div>
        <div class="cms-form-group mb-0">
          <label for="create-slug" class="cms-label">{{ t('admin.workspaces.urlKey', 'URL key') }} <span class="required-star">*</span></label>
          <input
            id="create-slug"
            v-model="createSlug"
            type="text"
            class="cms-form-control"
            placeholder="workspace-name"
            pattern="[a-z0-9\-]+"
            required
          />
        </div>
      </div>
      <div class="inline-form-actions">
        <button type="submit" class="cms-btn cms-btn--primary" :disabled="creating">
          <span v-if="creating" class="cms-btn-spinner" />
          Add workspace
        </button>
        <button type="button" class="cms-btn cms-btn--secondary" @click="requestCancelCreate">
          Cancel
        </button>
      </div>
    </form>
  </UiDrawer>

  <!-- Loading -->
  <UiAsyncState v-if="loading" type="loading" :title="t('admin.workspaces.loading', 'Loading workspaces')" />

  <!-- Error -->
  <UiAsyncState v-else-if="error" type="error" :title="t('admin.workspaces.loadFailed', 'Workspaces couldn’t be loaded')" :description="error" @retry="fetchPrograms" />

  <!-- Empty -->
  <UiEmptyState v-else-if="programs.length === 0" size="page" icon="business" :title="t('admin.workspaces.empty', 'Create your first workspace')" description="Workspaces group related websites and their access.">
    <template #action><button type="button" class="cms-btn cms-btn--primary" @click="showCreateForm = true">{{ t('admin.workspaces.add', 'Add workspace') }}</button></template>
  </UiEmptyState>

  <!-- Programs table -->
  <div v-else class="cms-table-wrapper">
    <table class="cms-table">
      <thead>
        <tr>
          <th>{{ t('admin.workspaces.name', 'Name') }}</th>
          <th>{{ t('admin.workspaces.urlKey', 'URL key') }}</th>
          <th>{{ t('admin.workspaces.websites', 'Websites') }}</th>
          <th>{{ t('admin.workspaces.created', 'Created') }}</th>
          <th style="width: 12rem;">{{ t('admin.collections.actions', 'Actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="program in programs" :key="program.id">
          <template v-if="editingId === program.id">
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
            <td>{{ program.siteCount }}</td>
            <td>{{ formatDate(program.createdAt) }}</td>
            <td>
              <button
                class="cms-btn cms-btn--sm cms-btn--primary"
                :disabled="saving"
                @click="handleUpdate(program.id)"
              >
                Save
              </button>
              <button
                class="cms-btn cms-btn--sm cms-btn--secondary"
                @click="cancelEdit"
              >
                Cancel
              </button>
            </td>
          </template>
          <template v-else>
            <td>{{ program.name }}</td>
            <td><code>{{ program.slug }}</code></td>
            <td>{{ program.siteCount }}</td>
            <td>{{ formatDate(program.createdAt) }}</td>
            <td>
              <button
                class="cms-btn cms-btn--sm cms-btn--secondary"
                @click="startEdit(program)"
              >
                Edit
              </button>
              <button
                class="cms-btn cms-btn--sm cms-btn--danger-quiet"
                @click="confirmDelete(program)"
              >
                Delete
              </button>
            </td>
          </template>
        </tr>
      </tbody>
    </table>
  </div>

  <UiModal
    :open="deleteTarget !== null"
    :title="t('admin.workspaces.delete', `Delete ${deleteTarget?.name ?? 'workspace'}?`, { name: deleteTarget?.name ?? 'workspace' })"
    :dismissible="!deleting"
    @close="closeDeleteDialog"
  >
    <template #description>
      <template v-if="deleteTarget?.siteCount">
        {{ t('admin.workspaces.deleteContained', `This permanently deletes the workspace and all ${deleteTarget.siteCount} contained website(s), including their content, versions, and media. This cannot be undone.`, { count: deleteTarget.siteCount }) }}
      </template>
      <template v-else>{{ t('admin.workspaces.deleteDescription', 'This permanently removes the workspace. This action cannot be undone.') }}</template>
    </template>
    <div v-if="deleteTarget?.siteCount" class="cms-form-group mb-0">
      <label for="confirm-workspace-name" class="cms-label">{{ t('admin.workspaces.confirmName', `Type ${deleteTarget.name} to confirm`, { name: deleteTarget.name }) }}</label>
      <input id="confirm-workspace-name" v-model="deleteConfirmation" type="text" class="cms-form-control" autocomplete="off" />
    </div>
    <template #footer>
      <button type="button" class="cms-btn cms-btn--secondary" :disabled="deleting" @click="closeDeleteDialog">{{ t('admin.shared.cancel', 'Cancel') }}</button>
      <button type="button" class="cms-btn cms-btn--danger" :disabled="deleting || (Boolean(deleteTarget?.siteCount) && deleteConfirmation !== deleteTarget?.name)" @click="handleDelete">
        <span v-if="deleting" class="cms-btn-spinner" />
        {{ deleting ? t('common.deleting', 'Deleting…') : t('admin.workspaces.deleteWorkspace', 'Delete workspace') }}
      </button>
    </template>
  </UiModal>
</template>

<script setup lang="ts">
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import type { ProgramSummary } from '~/server/storage/types'
import { adminFetch } from '~/admin/utils/adminFetch'
import { formatDate } from '~/admin/utils/formatters'
import UiModal from '~/admin/components/ui/UiModal.vue'
import UiAsyncState from '~/admin/components/ui/UiAsyncState.vue'
import UiEmptyState from '~/admin/components/ui/UiEmptyState.vue'
import UiDrawer from '~/admin/components/ui/UiDrawer.vue'
import { useConfirmAction } from '~/admin/composables/useConfirmAction'

definePageMeta({ layout: 'admin' })
const { t } = useAdminI18n()

const programs = ref<ProgramSummary[]>([])
const loading = ref(true)
const error = ref('')
const confirmAction = useConfirmAction()

// Create form state
const showCreateForm = ref(false)
const createName = ref('')
const createSlug = ref('')
const creating = ref(false)
let createSlugManuallyEdited = false

// Edit state
const editingId = ref<string | null>(null)
const editName = ref('')
const editSlug = ref('')
const saving = ref(false)

// Delete state
const deleteTarget = ref<ProgramSummary | null>(null)
const deleteConfirmation = ref('')
const deleting = ref(false)

onMounted(async () => {
  await fetchPrograms()
})

async function fetchPrograms() {
  loading.value = true
  error.value = ''
  try {
    const data = await $fetch<{ programs: ProgramSummary[] }>('/api/admin/programs')
    programs.value = data.programs || []
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Failed to load programs'
  } finally {
    loading.value = false
  }
}

function autoCreateSlug() {
  if (createSlugManuallyEdited) return
  createSlug.value = createName.value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

watch(createSlug, (newVal) => {
  const autoGenerated = createName.value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  if (newVal !== autoGenerated) {
    createSlugManuallyEdited = true
  }
})

async function handleCreate() {
  creating.value = true
  try {
    await adminFetch('/api/admin/programs', {
      method: 'POST',
      body: { name: createName.value, slug: createSlug.value },
    })
    cancelCreate()
    await fetchPrograms()
  } catch (e: any) {
    const { useAlertStore } = await import('~/admin/stores/alertStore')
    useAlertStore().danger(
      e?.data?.statusMessage || 'Failed to create program',
      undefined,
      'programs',
    )
  } finally {
    creating.value = false
  }
}

function cancelCreate() {
  showCreateForm.value = false
  createName.value = ''
  createSlug.value = ''
  createSlugManuallyEdited = false
}

async function requestCancelCreate() {
  if (createName.value || createSlug.value) {
    const accepted = await confirmAction.confirm({
      title: 'Discard this workspace?',
      description: 'The name and URL key you entered will be lost.',
      confirmLabel: 'Discard draft',
      tone: 'danger',
    })
    if (!accepted) return
  }
  cancelCreate()
}

function startEdit(program: ProgramSummary) {
  editingId.value = program.id
  editName.value = program.name
  editSlug.value = program.slug
}

function cancelEdit() {
  editingId.value = null
  editName.value = ''
  editSlug.value = ''
}

async function handleUpdate(programId: string) {
  saving.value = true
  try {
    await adminFetch(`/api/admin/programs/${programId}`, {
      method: 'PUT',
      body: { name: editName.value, slug: editSlug.value },
    })
    cancelEdit()
    await fetchPrograms()
  } catch (e: any) {
    const { useAlertStore } = await import('~/admin/stores/alertStore')
    useAlertStore().danger(
      e?.data?.statusMessage || 'Failed to update program',
      undefined,
      'programs',
    )
  } finally {
    saving.value = false
  }
}

function confirmDelete(program: ProgramSummary) {
  deleteTarget.value = program
  deleteConfirmation.value = ''
}

function closeDeleteDialog() {
  if (deleting.value) return
  deleteTarget.value = null
  deleteConfirmation.value = ''
}

async function handleDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    const force = deleteTarget.value.siteCount > 0
    await adminFetch(`/api/admin/programs/${deleteTarget.value.id}`, {
      method: 'DELETE',
      params: force ? { force: 'true' } : {},
    })
    deleteTarget.value = null
    deleteConfirmation.value = ''
    await fetchPrograms()
  } catch (e: any) {
    const { useAlertStore } = await import('~/admin/stores/alertStore')
    useAlertStore().danger(
      e?.data?.statusMessage || 'Failed to delete program',
      undefined,
      'programs',
    )
  } finally {
    deleting.value = false
  }
}

</script>

<style lang="scss" scoped>
@use '~/admin/assets/scss/variables' as *;

.inline-form {
  background: transparent;
}

.inline-form-fields {
  display: grid;
  gap: 1.6rem;
  margin-bottom: 2.4rem;

  .cms-form-group {
    min-width: 0;
  }
}

.inline-form-actions {
  display: flex;
  position: sticky;
  bottom: -2.4rem;
  justify-content: flex-end;
  gap: 0.8rem;
  margin: 2.4rem 0 -2.4rem;
  padding: 1.6rem 0 0;
  border-top: 1px solid $line;
  background: rgba(255, 255, 255, 0.96);
}
</style>
