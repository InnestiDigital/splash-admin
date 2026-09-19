<template>
  <AdminPageHeader :title="t('admin.recovery.title', 'Recovery')" :description="t('admin.recovery.description', 'Restore settings captured automatically before a schema migration.')" alert-context="migration-backups" />

  <div class="cms-alert cms-alert--info mb-4">
    <span class="material-icons-outlined cms-alert-icon">info</span>
    <div class="cms-alert-content">
      <div class="cms-alert-title">{{ t('admin.recovery.about', 'About migration backups') }}</div>
      <div class="cms-alert-description">
        Backups are automatically created when schema migrations run. Restoring a backup will overwrite the current block settings with the backed-up data.
      </div>
    </div>
  </div>

  <!-- Loading -->
  <div v-if="loading" class="text-center py-5">
    <span class="cms-spinner cms-spinner--lg" />
  </div>

  <!-- Error -->
  <div v-else-if="error" class="cms-alert cms-alert--danger">
    <span class="material-icons-outlined cms-alert-icon">error</span>
    <div class="cms-alert-content">
      <div class="cms-alert-title">{{ t('admin.recovery.loadFailed', 'Failed to load backups') }}</div>
      <div class="cms-alert-description">{{ error }}</div>
    </div>
  </div>

  <!-- Empty -->
  <div v-else-if="backups.length === 0" class="text-center py-5">
    <p class="text-muted" style="font-size: 1.5rem;">{{ t('admin.recovery.empty', 'No migration backups found.') }}</p>
    <p class="text-muted" style="font-size: 1.3rem;">{{ t('admin.recovery.emptyDescription', 'Backups are created automatically when schema migrations run.') }}</p>
  </div>

  <!-- Backups table -->
  <div v-else class="cms-table-wrapper">
    <table class="cms-table">
      <thead>
        <tr>
          <th>{{ t('admin.recovery.label', 'Label') }}</th>
          <th>{{ t('admin.recovery.blockCount', 'Block count') }}</th>
          <th>{{ t('admin.recovery.created', 'Created') }}</th>
          <th class="text-end">{{ t('admin.collections.actions', 'Actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="backup in backups" :key="backup.id">
          <td>
            <strong>{{ backup.label }}</strong>
          </td>
          <td>{{ backup.blockCount }}</td>
          <td>{{ formatDateTime(backup.timestamp) }}</td>
          <td class="text-end">
            <button
              class="cms-btn cms-btn--secondary cms-btn--sm"
              :disabled="restoring === backup.id"
              @click="confirmRestore(backup)"
            >
              <span v-if="restoring === backup.id" class="cms-btn-spinner" />
              {{ restoring === backup.id ? 'Restoring...' : 'Restore' }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { useAlertStore } from '~/admin/stores/alertStore'
import { useSite } from '~/admin/composables/useSite'
import { useSiteApi } from '~/admin/composables/useSiteApi'
import { formatDateTime } from '~/admin/utils/formatters'
import { useConfirmAction } from '~/admin/composables/useConfirmAction'

definePageMeta({ layout: 'admin' })
const { t } = useAdminI18n()

interface MigrationBackup {
  id: string
  label: string
  timestamp: string
  blockCount: number
}

const { siteId, hasSite } = useSite()
const { siteFetch } = useSiteApi()
const alertStore = useAlertStore()
const confirmAction = useConfirmAction()

const backups = ref<MigrationBackup[]>([])
const loading = ref(true)
const error = ref('')
const restoring = ref<string | null>(null)

onMounted(async () => {
  if (hasSite.value) await fetchBackups()
})

watch(siteId, (newId) => {
  if (newId) fetchBackups()
})

async function fetchBackups() {
  if (!hasSite.value) return
  loading.value = true
  error.value = ''
  try {
    const data = await siteFetch<{ backups: MigrationBackup[] }>('/migration-backups')
    backups.value = data.backups || []
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Failed to load backups'
  } finally {
    loading.value = false
  }
}

async function confirmRestore(backup: MigrationBackup) {
  const accepted = await confirmAction.confirm({
    title: `Restore ${backup.label}?`,
    description: `This replaces the current settings for ${backup.blockCount} blocks with the backed-up values.`,
    confirmLabel: 'Restore backup',
    tone: 'danger',
  })
  if (!accepted) return
  doRestore(backup)
}

async function doRestore(backup: MigrationBackup) {
  restoring.value = backup.id
  alertStore.clearContext('migration-backups')
  try {
    const result = await siteFetch<{ success: boolean; restoredCount: number; pageCount: number }>(`/migration-backups/${backup.id}/restore`, {
      method: 'POST',
    })
    alertStore.success(
      'Backup restored.',
      `Restored ${result.restoredCount} blocks across ${result.pageCount} pages.`,
      'migration-backups'
    )
  } catch (e: any) {
    alertStore.danger(
      'Restore failed.',
      e?.data?.statusMessage || 'Could not restore this backup.',
      'migration-backups'
    )
  } finally {
    restoring.value = null
  }
}

</script>
