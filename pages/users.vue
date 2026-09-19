<template>
  <AdminPageHeader
    :title="t('admin.people.title', 'People & access')"
    :description="t('admin.people.description', 'Add people, choose what they can do, and limit them to the right websites.')"
    alert-context="users"
  >
    <template #actions>
      <button
        v-if="!showCreateForm"
        class="cms-btn cms-btn--primary"
        @click="openCreateForm"
      >
        <span class="material-icons-outlined" aria-hidden="true">person_add</span>
        {{ t('admin.people.add', 'Add person') }}
      </button>
    </template>
  </AdminPageHeader>

  <UiDrawer
    :open="showCreateForm"
    :title="t('admin.people.add', 'Add a person')"
    :description="t('admin.people.addDescription', 'Start with their identity, then choose the access they need.')"
    eyebrow="People & access"
    :dismissible="!creating"
    @close="requestCancelCreate"
  >
    <form
      class="inline-form"
      @submit.prevent="handleCreate"
    >
      <div class="inline-form-fields">
        <div class="cms-form-group mb-0">
          <label for="create-email" class="cms-label">Email <span class="required-star">*</span></label>
          <input
            id="create-email"
            v-model="createEmail"
            type="email"
            class="cms-form-control"
            placeholder="user@example.com"
            required
          />
        </div>
        <div class="cms-form-group mb-0">
          <label for="create-password" class="cms-label">Password <span class="required-star">*</span></label>
          <input
            id="create-password"
            v-model="createPassword"
            type="password"
            class="cms-form-control"
            placeholder="Min 8 characters"
            minlength="8"
            required
          />
        </div>
        <div class="cms-form-group mb-0">
          <label for="create-first-name" class="cms-label">{{ t('admin.people.firstName', 'First name') }}</label>
          <input
            id="create-first-name"
            v-model="createFirstName"
            type="text"
            class="cms-form-control"
            placeholder="First name"
          />
        </div>
        <div class="cms-form-group mb-0">
          <label for="create-last-name" class="cms-label">{{ t('admin.people.lastName', 'Last name') }}</label>
          <input
            id="create-last-name"
            v-model="createLastName"
            type="text"
            class="cms-form-control"
            placeholder="Last name"
          />
        </div>
        <div class="cms-form-group mb-0">
          <label for="create-role" class="cms-label">{{ t('admin.people.role', 'Role') }} <span class="required-star">*</span></label>
          <select
            id="create-role"
            v-model="createRole"
            class="cms-form-control"
            required
            @change="onCreateRoleChange"
          >
            <option value="admin">Super admin</option>
            <option value="editor">Content editor</option>
            <option value="viewer">Read-only viewer</option>
            <option value="client">Brand client</option>
          </select>
          <p class="role-summary">{{ roleDescription(createRole) }}</p>
        </div>
        <div v-if="createRole !== 'admin'" class="cms-form-group mb-0">
          <label for="create-program" class="cms-label">{{ t('admin.people.workspace', 'Workspace') }} <span class="required-star">*</span></label>
          <select
            id="create-program"
            v-model="createProgramId"
            class="cms-form-control"
            required
            @change="onCreateProgramChange"
          >
            <option value="" disabled>{{ t('admin.people.selectWorkspace', 'Select a workspace') }}</option>
            <option v-for="program in programs" :key="program.id" :value="program.id">
              {{ program.name }}
            </option>
          </select>
        </div>
        <fieldset v-if="createRole !== 'admin'" class="cms-form-group mb-0 site-scope-field">
          <legend class="cms-label">{{ t('admin.people.siteAccess', 'Site access') }} <span class="required-star">*</span></legend>
          <select
            v-if="createRole === 'client'"
            id="create-site"
            :value="createSiteIds[0] || ''"
            class="cms-form-control"
            required
            :disabled="!createProgramId"
            @change="onCreateClientSiteChange"
          >
            <option value="" disabled>Select a site</option>
            <option v-for="site in sitesForProgram(createProgramId)" :key="site.id" :value="site.id">
              {{ site.name }}
            </option>
          </select>
          <div v-else class="site-checklist" :aria-disabled="!createProgramId">
            <label
              v-for="site in sitesForProgram(createProgramId)"
              :key="site.id"
              class="site-checklist__item"
            >
              <input
                v-model="createSiteIds"
                type="checkbox"
                :value="site.id"
                :disabled="!createProgramId"
              />
              <span>{{ site.name }}</span>
            </label>
          </div>
          <p v-if="createProgramId && sitesForProgram(createProgramId).length === 0" class="scope-help">
            This workspace has no websites.
          </p>
        </fieldset>
        <div v-if="createRole === 'client'" class="cms-form-group mb-0">
          <label for="create-brand-preset" class="cms-label">Brand preset <span class="required-star">*</span></label>
          <select
            id="create-brand-preset"
            v-model="createBrandPresetId"
            class="cms-form-control"
            required
            :disabled="createSiteIds.length !== 1"
          >
            <option
              v-if="createSiteIds[0] && presetsBySite[createSiteIds[0]] === null"
              value=""
              disabled
            >
              No brand preset on this site
            </option>
            <option v-else value="" disabled>Select a preset</option>
            <option
              v-for="preset in (presetsBySite[createSiteIds[0]] || [])"
              :key="preset.presetId"
              :value="preset.presetId"
            >
              {{ preset.presetName }}
            </option>
          </select>
        </div>
      </div>
      <div class="inline-form-actions">
        <button type="submit" class="cms-btn cms-btn--primary" :disabled="creating">
          <span v-if="creating" class="cms-btn-spinner" />
          Add person
        </button>
        <button type="button" class="cms-btn cms-btn--secondary" @click="requestCancelCreate">
          Cancel
        </button>
      </div>
    </form>
  </UiDrawer>

  <!-- Loading -->
  <UiAsyncState v-if="loading" type="loading" :title="t('admin.people.loading', 'Loading people')" />

  <!-- Error -->
  <UiAsyncState v-else-if="fetchError" type="error" :title="t('admin.people.loadFailed', 'People couldn’t be loaded')" :description="fetchError" @retry="fetchUsers" />

  <!-- Empty -->
  <UiEmptyState v-else-if="users.length === 0" size="page" icon="group" :title="t('admin.people.empty', 'Invite your first teammate')" :description="t('admin.people.emptyDescription', 'Add someone and choose exactly which websites they can access.')" />

  <!-- Users table -->
  <div v-else class="cms-table-wrapper">
    <table class="cms-table">
      <thead>
        <tr>
          <th>{{ t('admin.people.email', 'Email') }}</th>
          <th>{{ t('admin.people.name', 'Name') }}</th>
          <th>{{ t('admin.people.role', 'Role') }}</th>
          <th>{{ t('admin.people.access', 'Access') }}</th>
          <th>{{ t('admin.people.created', 'Created') }}</th>
          <th style="width: 14rem;">{{ t('admin.collections.actions', 'Actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="user in users" :key="user.id">
          <template v-if="editingId === user.id">
            <td>
              <input
                v-model="editEmail"
                type="email"
                class="cms-form-control cms-form-control--inline"
                required
              />
            </td>
            <td>
              <div style="display: flex; gap: 0.4rem;">
                <input
                  v-model="editFirstName"
                  type="text"
                  class="cms-form-control cms-form-control--inline"
                  :placeholder="t('admin.people.firstPlaceholder', 'First')"
                />
                <input
                  v-model="editLastName"
                  type="text"
                  class="cms-form-control cms-form-control--inline"
                  :placeholder="t('admin.people.lastPlaceholder', 'Last')"
                />
              </div>
            </td>
            <td>
              <select
                v-model="editRole"
                class="cms-form-control cms-form-control--inline"
                @change="onEditRoleChange"
              >
                <option value="admin">{{ t('admin.roles.admin', 'Super admin') }}</option>
                <option value="editor">{{ t('admin.roles.editor', 'Content editor') }}</option>
                <option value="viewer">{{ t('admin.roles.viewer', 'Read-only viewer') }}</option>
                <option value="client">{{ t('admin.roles.client', 'Brand client') }}</option>
              </select>
            </td>
            <td>
              <div v-if="editRole === 'admin'" class="scope-summary">
                {{ t('admin.people.allAccess', 'All workspaces and sites') }}
              </div>
              <div v-else class="user-scope-editor">
                <select
                  v-model="editProgramId"
                  class="cms-form-control cms-form-control--inline"
                  :aria-label="t('admin.people.workspace', 'Workspace')"
                  @change="onEditProgramChange"
                >
                  <option value="" disabled>{{ t('admin.people.selectWorkspace', 'Select a workspace') }}</option>
                  <option v-for="program in programs" :key="program.id" :value="program.id">
                    {{ program.name }}
                  </option>
                </select>
                <select
                  v-if="editRole === 'client'"
                  :value="editSiteIds[0] || ''"
                  class="cms-form-control cms-form-control--inline"
                  :aria-label="t('admin.people.siteAccess', 'Site access')"
                  :disabled="!editProgramId"
                  @change="onEditClientSiteChange"
                >
                  <option value="" disabled>{{ t('admin.people.selectSite', 'Select a site') }}</option>
                  <option v-for="site in sitesForProgram(editProgramId)" :key="site.id" :value="site.id">
                    {{ site.name }}
                  </option>
                </select>
                <div v-else class="site-checklist site-checklist--compact">
                  <label
                    v-for="site in sitesForProgram(editProgramId)"
                    :key="site.id"
                    class="site-checklist__item"
                  >
                    <input v-model="editSiteIds" type="checkbox" :value="site.id" />
                    <span>{{ site.name }}</span>
                  </label>
                </div>
                <select
                  v-if="editRole === 'client'"
                  v-model="editBrandPresetId"
                  class="cms-form-control cms-form-control--inline"
                  :aria-label="t('admin.people.brandPreset', 'Brand preset')"
                  :disabled="editSiteIds.length !== 1"
                >
                  <option
                    v-if="editSiteIds[0] && presetsBySite[editSiteIds[0]] === null"
                    value=""
                    disabled
                  >
                    {{ t('admin.people.noBrandPreset', 'No brand preset on this site') }}
                  </option>
                  <option v-else value="" disabled>{{ t('admin.people.selectPreset', 'Select a preset') }}</option>
                  <option v-if="danglingEditPresetId" :value="danglingEditPresetId">
                    {{ t('admin.people.unknownPreset', 'Unknown preset (missing — reassign)') }}
                  </option>
                  <option
                    v-for="preset in (presetsBySite[editSiteIds[0]] || [])"
                    :key="preset.presetId"
                    :value="preset.presetId"
                  >
                    {{ preset.presetName }}
                  </option>
                </select>
              </div>
            </td>
            <td>{{ formatDate(user.createdAt) }}</td>
            <td>
              <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
                <div class="cms-form-group mb-0" style="flex: 1; min-width: 12rem;">
                  <input
                    v-model="editPassword"
                    type="password"
                    class="cms-form-control cms-form-control--inline"
                    :placeholder="t('admin.people.newPassword', 'New password (optional)')"
                  />
                </div>
                <button
                  class="cms-btn cms-btn--sm cms-btn--primary"
                  :disabled="saving"
                  @click="handleUpdate(user.id)"
                >
                  {{ t('common.save', 'Save') }}
                </button>
                <button
                  class="cms-btn cms-btn--sm cms-btn--secondary"
                  @click="cancelEdit"
                >
                  {{ t('admin.shared.cancel', 'Cancel') }}
                </button>
              </div>
            </td>
          </template>
          <template v-else>
            <td>{{ user.email }}</td>
            <td>{{ fullName(user) }}</td>
            <td>
              <span class="role-badge" :class="`role-badge--${user.role}`">{{ roleLabel(user.role) }}</span>
            </td>
            <td>
              <div class="scope-summary">{{ accessProgramLabel(user) }}</div>
              <small v-if="user.role !== 'admin'" class="scope-sites">
                {{ accessSitesLabel(user) }}
              </small>
            </td>
            <td>{{ formatDate(user.createdAt) }}</td>
            <td>
              <button
                class="cms-btn cms-btn--sm cms-btn--secondary"
                @click="startEdit(user)"
              >
                {{ t('common.edit', 'Edit') }}
              </button>
              <button
                v-if="authStore.isAdmin"
                class="cms-btn cms-btn--sm cms-btn--danger-quiet"
                @click="confirmDelete(user)"
              >
                {{ t('common.delete', 'Delete') }}
              </button>
            </td>
          </template>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Pagination controls -->
  <div v-if="total > pageSize" class="cms-pagination">
    <button
      class="cms-btn cms-btn--sm cms-btn--secondary"
      :disabled="page <= 1 || isLoading"
      @click="page--; fetchUsers()"
    >
      {{ t('common.previous', 'Previous') }}
    </button>
    <span class="cms-pagination-info">
      {{ (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, total) }} {{ t('common.of', 'of') }} {{ total }}
    </span>
    <button
      class="cms-btn cms-btn--sm cms-btn--secondary"
      :disabled="page * pageSize >= total || isLoading"
      @click="page++; fetchUsers()"
    >
      {{ t('common.next', 'Next') }}
    </button>
  </div>

  <!-- Delete confirmation modal -->
  <div v-if="deleteTarget" class="cms-modal-overlay" @click.self="deleteTarget = null">
    <div class="cms-modal">
      <div class="cms-modal-header">
        <h3>{{ t('admin.people.delete', 'Delete person') }}</h3>
      </div>
      <div class="cms-modal-body">
        <p>{{ t('admin.people.deleteQuestion', `Are you sure you want to delete ${deleteTarget.email}?`, { email: deleteTarget.email }) }}</p>
        <p
          v-if="isSelfDelete"
          class="cms-alert cms-alert--warning"
          style="margin-top: 1rem;"
        >
          <span class="material-icons-outlined cms-alert-icon">warning</span>
          <span>{{ t('admin.people.cannotDeleteSelf', 'You cannot delete your own account.') }}</span>
        </p>
      </div>
      <div class="cms-modal-footer">
        <button class="cms-btn cms-btn--secondary" @click="deleteTarget = null">
          {{ t('admin.shared.cancel', 'Cancel') }}
        </button>
        <button
          class="cms-btn cms-btn--danger"
          :disabled="deleting || isSelfDelete"
          @click="handleDelete"
        >
          <span v-if="deleting" class="cms-btn-spinner" />
          {{ t('common.delete', 'Delete') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { adminFetch } from '~/admin/utils/adminFetch'
import { formatDate } from '~/admin/utils/formatters'
import { useAuthStore } from '~/admin/stores/authStore'
import type { AdminRole } from '~/admin/types/auth'
import type { ProgramSummary, SiteSummary } from '~/server/storage/types'
import UiAsyncState from '~/admin/components/ui/UiAsyncState.vue'
import UiEmptyState from '~/admin/components/ui/UiEmptyState.vue'
import UiDrawer from '~/admin/components/ui/UiDrawer.vue'
import { useConfirmAction } from '~/admin/composables/useConfirmAction'
import { useAssistantPrefillStore } from '~/admin/stores/assistantPrefillStore'
import { applyUsersCreatePrefill } from '~/admin/utils/prefill/adapters/usersCreate'
import { resolveByLabel } from '~/admin/utils/prefill/labelResolution'

definePageMeta({ layout: 'admin' })
const { t } = useAdminI18n()

interface UserDto {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  role: AdminRole
  programId: string | null
  brandPresetId: string | null
  siteIds: string[]
  createdAt: string
}

interface BrandPresetOption {
  presetId: string
  presetName: string
}

const authStore = useAuthStore()
const confirmAction = useConfirmAction()

const users = ref<UserDto[]>([])
const loading = ref(true)
const isLoading = ref(false)
const fetchError = ref('')

// Pagination state
const page     = ref(1)
const pageSize = ref(25)
const total    = ref(0)

// Create form state
const showCreateForm = ref(false)
const createEmail = ref('')
const createPassword = ref('')
const createFirstName = ref('')
const createLastName = ref('')
const createRole = ref<AdminRole>('editor')
const createProgramId = ref('')
const createBrandPresetId = ref('')
const createSiteIds = ref<string[]>([])
const creating = ref(false)

// Edit state
const editingId = ref<string | null>(null)
const editEmail = ref('')
const editFirstName = ref('')
const editLastName = ref('')
const editRole = ref<AdminRole>('editor')
const editProgramId = ref('')
const editBrandPresetId = ref('')
const editSiteIds = ref<string[]>([])
const editPassword = ref('')
const saving = ref(false)

// Scope options are install-wide because this page is admin-only. Presets stay
// lazy and site-scoped because a client can only be pinned within its site.
const programs = ref<ProgramSummary[]>([])
const sites = ref<SiteSummary[]>([])
const accessOptionsLoaded = ref(false)
const presetsBySite = ref<Record<string, BrandPresetOption[] | null>>({})
let accessOptionsPromise: Promise<void> | null = null

/** The edit row's current pin when it is missing from the loaded preset list. */
const danglingEditPresetId = computed(() => {
  const id = editBrandPresetId.value
  if (!id) return null
  const siteId = editSiteIds.value[0]
  if (!siteId) return id
  const list = presetsBySite.value[siteId]
  if (!list) return null // presets not loaded yet, or no site — nothing to compare against
  return list.some(preset => preset.presetId === id) ? null : id
})

// Delete state
const deleteTarget = ref<UserDto | null>(null)
const deleting = ref(false)

const isSelfDelete = computed(
  () => deleteTarget.value?.email === authStore.user?.email,
)

function fullName(user: UserDto): string {
  const parts = [user.firstName, user.lastName].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : '—'
}

const prefillStore = useAssistantPrefillStore()

async function tryConsumePrefill() {
  const prefill = prefillStore.consume('admin-users')
  if (!prefill || prefill.kind !== 'admin-users') return
  await openCreateForm() // shows the form + awaits ensureAccessOptions()
  const { patch, applied, dropped } = applyUsersCreatePrefill(prefill, {
    programs: programs.value.map(p => ({ id: p.id, name: p.name })),
    sites: sites.value.map(s => ({ id: s.id, name: s.name, programId: s.programId ?? '' })),
  })
  if (patch.role !== undefined) createRole.value = patch.role
  if (patch.email !== undefined) createEmail.value = patch.email
  if (patch.firstName !== undefined) createFirstName.value = patch.firstName
  if (patch.lastName !== undefined) createLastName.value = patch.lastName
  if (patch.programId !== undefined) createProgramId.value = patch.programId
  if (patch.siteIds !== undefined) createSiteIds.value = [...patch.siteIds]
  // createPassword stays empty — the human types it (ruling 7).

  // Second pass: brand preset is per-site lazy-loaded, so it cannot resolve
  // inside the sync adapter.
  if (prefill.brandPresetLabel !== undefined) {
    const siteId = createRole.value === 'client' && createSiteIds.value.length === 1
      ? createSiteIds.value[0]
      : undefined
    if (!siteId) {
      dropped.push(`brand preset "${prefill.brandPresetLabel}" (needs client role with exactly one site)`)
    } else {
      await loadPresetsFor(siteId)
      const preset = resolveByLabel(
        presetsBySite.value[siteId] ?? [],
        prefill.brandPresetLabel,
        p => p.presetName,
      )
      if (preset) { createBrandPresetId.value = preset.presetId; applied.push('brand preset') }
      else dropped.push(`brand preset "${prefill.brandPresetLabel}"`)
    }
  }
  prefillStore.report({ applied, dropped })
}

onMounted(async () => {
  await Promise.all([fetchUsers(), ensureAccessOptions()])
  tryConsumePrefill()
})

watch(() => prefillStore.stagedKind, (kind) => {
  if (kind === 'admin-users') tryConsumePrefill()
})

async function fetchUsers() {
  if (isLoading.value) return
  isLoading.value = true
  loading.value = true
  fetchError.value = ''
  try {
    const offset = (page.value - 1) * pageSize.value
    const data = await $fetch<{ users: UserDto[]; total: number }>(
      `/api/admin/users?limit=${pageSize.value}&offset=${offset}`
    )
    users.value = data.users || []
    total.value = data.total ?? 0
  } catch (e: any) {
    fetchError.value = e?.data?.statusMessage || 'Failed to load users'
  } finally {
    loading.value = false
    isLoading.value = false
  }
}

async function ensureAccessOptions() {
  if (accessOptionsLoaded.value) return
  if (accessOptionsPromise) return accessOptionsPromise

  accessOptionsPromise = (async () => {
    try {
      const [programData, siteData] = await Promise.all([
        $fetch<{ programs: ProgramSummary[] }>('/api/admin/programs'),
        $fetch<{ sites: SiteSummary[] }>('/api/admin/sites'),
      ])
      programs.value = programData.programs || []
      sites.value = siteData.sites || []
      accessOptionsLoaded.value = true
    } catch (e: any) {
      const { useAlertStore } = await import('~/admin/stores/alertStore')
      useAlertStore().danger(
        e?.data?.statusMessage || 'Failed to load access options',
        undefined,
        'users',
      )
    } finally {
      accessOptionsPromise = null
    }
  })()
  return accessOptionsPromise
}

async function loadPresetsFor(siteId: string) {
  if (!siteId || siteId in presetsBySite.value) return
  try {
    const { presets } = await $fetch<{ presets: BrandPresetOption[] }>(
      `/api/admin/s/${siteId}/brand-presets`,
    )
    presetsBySite.value[siteId] = presets.length > 0 ? presets : null
  } catch (e: any) {
    const { useAlertStore } = await import('~/admin/stores/alertStore')
    useAlertStore().danger(
      e?.data?.statusMessage || 'Failed to load brand presets',
      undefined,
      'users',
    )
  }
}

function sitesForProgram(programId: string): SiteSummary[] {
  if (!programId) return []
  return sites.value.filter(site => site.programId === programId)
}

function roleLabel(role: AdminRole): string {
  switch (role) {
    case 'admin': return t('admin.roles.admin', 'Super admin')
    case 'editor': return t('admin.roles.editor', 'Content editor')
    case 'viewer': return t('admin.roles.viewer', 'Read-only viewer')
    case 'client': return t('admin.roles.client', 'Brand client')
  }
}

function roleDescription(role: AdminRole): string {
  switch (role) {
    case 'admin': return t('admin.people.roleAdminDescription', 'Can manage every workspace, website, setting, and person.')
    case 'editor': return t('admin.people.roleEditorDescription', 'Can edit blogs, articles, and media on selected sites.')
    case 'viewer': return t('admin.people.roleViewerDescription', 'Can review selected sites without making changes.')
    case 'client': return t('admin.people.roleClientDescription', 'Can create approved brand assets for one selected site.')
  }
}

function accessProgramLabel(user: UserDto): string {
  if (user.role === 'admin') return t('admin.people.allAccess', 'All workspaces and sites')
  if (!user.programId) return t('admin.people.noWorkspace', 'No workspace')
  return programs.value.find(program => program.id === user.programId)?.name
    ?? 'Workspace no longer available'
}

function accessSitesLabel(user: UserDto): string {
  if (user.siteIds.length === 0) return t('admin.people.noSiteAccess', 'No site access')
  return user.siteIds
    .map(siteId => sites.value.find(site => site.id === siteId)?.name ?? `Unknown site (${siteId})`)
    .join(', ')
}

async function openCreateForm() {
  showCreateForm.value = true
  await ensureAccessOptions()
}

function onCreateRoleChange() {
  if (createRole.value === 'admin') {
    createProgramId.value = ''
    createSiteIds.value = []
    createBrandPresetId.value = ''
  } else if (createRole.value !== 'client') {
    createBrandPresetId.value = ''
  } else if (createSiteIds.value.length > 1) {
    createSiteIds.value = []
  }
}

function onEditRoleChange() {
  if (editRole.value === 'admin') {
    editProgramId.value = ''
    editSiteIds.value = []
    editBrandPresetId.value = ''
  } else if (editRole.value !== 'client') {
    editBrandPresetId.value = ''
  } else if (editSiteIds.value.length > 1) {
    editSiteIds.value = []
  } else if (editSiteIds.value[0]) {
    void loadPresetsFor(editSiteIds.value[0])
  }
}

function onCreateProgramChange() {
  createSiteIds.value = []
  createBrandPresetId.value = ''
}

function onEditProgramChange() {
  editSiteIds.value = []
  editBrandPresetId.value = ''
}

function onCreateClientSiteChange(event: Event) {
  const siteId = (event.target as HTMLSelectElement).value
  createSiteIds.value = siteId ? [siteId] : []
  createBrandPresetId.value = ''
  if (siteId) void loadPresetsFor(siteId)
}

function onEditClientSiteChange(event: Event) {
  const siteId = (event.target as HTMLSelectElement).value
  editSiteIds.value = siteId ? [siteId] : []
  editBrandPresetId.value = ''
  if (siteId) void loadPresetsFor(siteId)
}

async function handleCreate() {
  if (
    createRole.value !== 'admin'
    && (!createProgramId.value || createSiteIds.value.length === 0)
  ) {
    const { useAlertStore } = await import('~/admin/stores/alertStore')
    useAlertStore().danger(
      'Select a workspace and at least one site.',
      undefined,
      'users',
    )
    return
  }
  if (createRole.value === 'client' && !createBrandPresetId.value) {
    const { useAlertStore } = await import('~/admin/stores/alertStore')
    useAlertStore().danger(
      'A brand client needs one site and a brand preset.',
      undefined,
      'users',
    )
    return
  }

  creating.value = true
  try {
    const body: Record<string, any> = {
      email: createEmail.value,
      password: createPassword.value,
      firstName: createFirstName.value || undefined,
      lastName: createLastName.value || undefined,
      role: createRole.value,
    }
    if (createRole.value !== 'admin') {
      body.programId = createProgramId.value
      body.siteIds = createSiteIds.value
    }
    if (createRole.value === 'client') {
      body.brandPresetId = createBrandPresetId.value
    }
    await adminFetch('/api/admin/users', {
      method: 'POST',
      body,
    })
    cancelCreate()
    page.value = 1
    await fetchUsers()
  } catch (e: any) {
    const { useAlertStore } = await import('~/admin/stores/alertStore')
    useAlertStore().danger(
      e?.data?.statusMessage || 'Failed to create user',
      undefined,
      'users',
    )
  } finally {
    creating.value = false
  }
}

function cancelCreate() {
  showCreateForm.value = false
  createEmail.value = ''
  createPassword.value = ''
  createFirstName.value = ''
  createLastName.value = ''
  createRole.value = 'editor'
  createProgramId.value = ''
  createSiteIds.value = []
  createBrandPresetId.value = ''
}

async function requestCancelCreate() {
  const isDirty = Boolean(createEmail.value || createPassword.value || createFirstName.value || createLastName.value || createProgramId.value || createSiteIds.value.length)
  if (isDirty) {
    const accepted = await confirmAction.confirm({
      title: 'Discard this person?',
      description: 'The identity and access details you entered will be lost.',
      confirmLabel: 'Discard draft',
      tone: 'danger',
    })
    if (!accepted) return
  }
  cancelCreate()
}

function startEdit(user: UserDto) {
  editingId.value = user.id
  editEmail.value = user.email
  editFirstName.value = user.firstName || ''
  editLastName.value = user.lastName || ''
  editRole.value = user.role
  editProgramId.value = user.programId || ''
  editSiteIds.value = [...(user.siteIds || [])]
  editBrandPresetId.value = user.brandPresetId || ''
  editPassword.value = ''
  void ensureAccessOptions()
  if (user.role === 'client') {
    if (user.siteIds[0]) void loadPresetsFor(user.siteIds[0])
  }
}

function cancelEdit() {
  editingId.value = null
  editEmail.value = ''
  editFirstName.value = ''
  editLastName.value = ''
  editRole.value = 'editor'
  editProgramId.value = ''
  editSiteIds.value = []
  editBrandPresetId.value = ''
  editPassword.value = ''
}

async function handleUpdate(userId: string) {
  if (
    editRole.value !== 'admin'
    && (!editProgramId.value || editSiteIds.value.length === 0)
  ) {
    const { useAlertStore } = await import('~/admin/stores/alertStore')
    useAlertStore().danger(
      'Select a workspace and at least one site.',
      undefined,
      'users',
    )
    return
  }
  if (editRole.value === 'client' && !editBrandPresetId.value) {
    const { useAlertStore } = await import('~/admin/stores/alertStore')
    useAlertStore().danger(
      'A brand client needs one site and a brand preset.',
      undefined,
      'users',
    )
    return
  }
  saving.value = true
  try {
    const body: Record<string, any> = {
      email: editEmail.value,
      firstName: editFirstName.value || null,
      lastName: editLastName.value || null,
      role: editRole.value,
    }
    if (editRole.value === 'admin') {
      body.programId = null
      body.siteIds = []
      body.brandPresetId = null
    } else {
      body.programId = editProgramId.value
      body.siteIds = editSiteIds.value
      body.brandPresetId = editRole.value === 'client'
        ? editBrandPresetId.value
        : null
    }
    if (editPassword.value) {
      body.password = editPassword.value
    }
    await adminFetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      body,
    })
    cancelEdit()
    await fetchUsers()
  } catch (e: any) {
    const { useAlertStore } = await import('~/admin/stores/alertStore')
    useAlertStore().danger(
      e?.data?.statusMessage || 'Failed to update user',
      undefined,
      'users',
    )
  } finally {
    saving.value = false
  }
}

function confirmDelete(user: UserDto) {
  deleteTarget.value = user
}

async function handleDelete() {
  if (!deleteTarget.value || isSelfDelete.value) return
  deleting.value = true
  try {
    await adminFetch(`/api/admin/users/${deleteTarget.value.id}`, {
      method: 'DELETE',
    })
    deleteTarget.value = null
    page.value = 1
    await fetchUsers()
  } catch (e: any) {
    const { useAlertStore } = await import('~/admin/stores/alertStore')
    useAlertStore().danger(
      e?.data?.statusMessage || 'Failed to delete user',
      undefined,
      'users',
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
  grid-template-columns: 1fr 1fr;
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

@media (max-width: 560px) {
  .inline-form-fields { grid-template-columns: 1fr; }
}

.role-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.3rem 0.8rem;
  border-radius: $radius-pill;
  font-size: 1.2rem;
  font-weight: 600;

  &--admin {
    background: #e3f0ff;
    color: #1a5fa8;
  }

  &--editor {
    background: #e6f9ef;
    color: #1a7a45;
  }

  &--viewer {
    background: #f3f4f6;
    color: var(--cms-ink-body);
  }

  &--client {
    background: #f3e8ff;
    color: #6d28d9;
  }
}

.site-scope-field {
  border: 0;
  padding: 0;
}

.scope-help,
.scope-sites {
  color: $secondary-color;
  font-size: 1.2rem;
  line-height: 1.5;
}

.scope-help {
  margin: 0 0 0.6rem;
}

.scope-summary {
  font-weight: 600;
}

.scope-sites {
  display: block;
  margin-top: 0.2rem;
}

.site-checklist {
  display: grid;
  gap: 0.4rem;
  max-height: 12rem;
  overflow-y: auto;
  padding: 0.8rem;
  border: 1px solid $borders-color;
  border-radius: $radius-control;
  background: $pure-white;

  &--compact {
    max-height: 8rem;
    margin-top: 0.4rem;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    cursor: pointer;
  }
}

.user-scope-editor {
  display: grid;
  gap: 0.4rem;
  min-width: 16rem;
}

.role-summary {
  margin: 0.5rem 0 0;
  color: $secondary-color;
  font-size: 1.2rem;
  line-height: 1.45;
}
</style>
