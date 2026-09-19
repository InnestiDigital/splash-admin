<template>
  <AdminPageHeader
    :title="t('admin.publish.title', 'Publishing & versions')"
    :description="t('admin.publish.description', 'Make draft changes live and return to an earlier published version when needed.')"
    alert-context="publish"
  />

  <section class="publish-readiness">
    <div class="publish-readiness__copy">
      <span class="cms-overline">{{ t('admin.publish.currentDraft', 'Current draft') }}</span>
      <h2>{{ t('admin.publish.ready', 'Ready to publish?') }}</h2>
      <p>{{ t('admin.publish.readyDescription', 'Splash validates the draft and creates a version you can safely return to.') }}</p>
    </div>
    <div class="publish-readiness__action">
    <div class="cms-form-group mb-0">
      <label class="cms-label">{{ t('admin.publish.changed', 'What changed? (optional)') }}</label>
      <input
        v-model="publishNote"
        type="text"
        class="cms-form-control"
        placeholder="e.g. Updated hero banner"
        :disabled="publishing"
      />
    </div>
    <button
      class="cms-btn cms-btn--primary"
      :disabled="publishing"
      @click="confirmPublish"
    >
      <span v-if="publishing" class="cms-btn-spinner" />
      {{ publishing ? 'Publishing…' : 'Publish changes' }}
    </button>
    </div>
  </section>

  <!-- Validation Errors -->
  <div v-if="validationErrors.length > 0" class="cms-alert cms-alert--warning mb-4">
    <span class="material-icons-outlined cms-alert-icon">warning</span>
    <div class="cms-alert-content">
      <div class="cms-alert-title">{{ t('admin.publish.validationErrors', 'Content validation errors') }}</div>
      <ul class="mt-2 mb-0" style="padding-left: 1.2rem;">
        <li v-for="(err, i) in validationErrors" :key="i" style="font-size: 1.2rem;">
          <strong>{{ err.blockType }}</strong> &mdash; {{ err.message }}
        </li>
      </ul>
    </div>
  </div>

  <!-- Loading -->
  <UiAsyncState v-if="loading" type="loading" :title="t('admin.publish.loading', 'Loading publish history')" />

  <!-- Error -->
  <UiAsyncState v-else-if="error" type="error" :title="t('admin.publish.loadFailed', 'Publish history couldn’t be loaded')" :description="error" @retry="fetchVersions" />

  <!-- Empty -->
  <UiEmptyState v-else-if="versions.length === 0" size="page" icon="publish" :title="t('admin.publish.empty', 'Nothing has been published yet')" :description="t('admin.publish.emptyDescription', 'Publish the current draft to create the first recoverable version.')" />

  <!-- Version history table -->
  <div v-else class="cms-table-wrapper">
    <table class="cms-table">
      <thead>
        <tr>
          <th>{{ t('admin.publish.version', 'Version') }}</th>
          <th>{{ t('admin.publish.status', 'Status') }}</th>
          <th>{{ t('admin.publish.note', 'Note') }}</th>
          <th>{{ t('admin.publish.published', 'Published') }}</th>
          <th>{{ t('admin.publish.screenshots', 'Screenshots') }}</th>
          <th class="text-end">{{ t('admin.collections.actions', 'Actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="version in versions" :key="version.id">
          <td>
            <code>{{ version.hash?.substring(0, 8) || '—' }}</code>
          </td>
          <td>
            <span
              class="cms-badge"
              :class="statusBadgeClass(version)"
            >
              {{ statusLabel(version) }}
            </span>
          </td>
          <td>{{ version.note || '—' }}</td>
          <td>{{ formatDateTime(version.timestamp) }}</td>
          <td>
            <button
              v-if="version.hasMultipleScreenshots"
              class="cms-btn cms-btn--ghost cms-btn--xs"
              @click="showScreenshots(version)"
            >
              View ({{ screenshotCounts[version.id] || '...' }})
            </button>
            <button
              v-else-if="version.hasScreenshot"
              class="cms-btn cms-btn--ghost cms-btn--xs"
              @click="showScreenshots(version)"
            >
              View (1)
            </button>
            <span v-else class="text-muted">—</span>
          </td>
          <td class="text-end">
            <button
              v-if="!version.isActive && version.status === 'ready'"
              class="cms-btn cms-btn--secondary cms-btn--sm"
              :disabled="activating === version.id"
              @click="confirmActivate(version)"
            >
              {{ activating === version.id ? 'Making live…' : 'Make live' }}
            </button>
            <span
              v-else-if="version.isActive"
              class="cms-badge cms-badge--success"
            >
              Active
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <UiModal
    :open="confirmAction !== null"
    :title="confirmAction?.kind === 'publish' ? t('admin.publish.confirmPublish', 'Publish these changes?') : t('admin.publish.confirmActivate', 'Make this version live?')"
    :dismissible="!publishing && !activating"
    @close="confirmAction = null"
  >
    <template #description>
      <template v-if="confirmAction?.kind === 'publish'">{{ t('admin.publish.publishConsequence', 'Splash will validate the current draft, create a recoverable version, and update the live website.') }}</template>
      <template v-else>{{ t('admin.publish.activateConsequence', 'The selected version will replace both the live website and your editable draft. Any unpublished draft changes will no longer be available in the admin.') }}</template>
    </template>
    <template #footer>
      <button type="button" class="cms-btn cms-btn--secondary" :disabled="publishing || Boolean(activating)" @click="confirmAction = null">{{ t('admin.shared.cancel', 'Cancel') }}</button>
      <button type="button" class="cms-btn cms-btn--primary" :disabled="publishing || Boolean(activating)" @click="runConfirmedAction">
        <span v-if="publishing || activating" class="cms-btn-spinner" />
        {{ confirmAction?.kind === 'publish' ? 'Publish changes' : 'Make version live' }}
      </button>
    </template>
  </UiModal>

  <UiModal :open="screenshotModal.show" :title="t('admin.publish.screenshotsTitle', 'Version screenshots')" width="96rem" @close="closeScreenshotModal">
        <div v-if="screenshotModal.loading" class="text-center py-4">
          <span class="cms-spinner" />
        </div>
        <div v-else-if="screenshotModal.error" class="cms-alert cms-alert--danger">
          {{ screenshotModal.error }}
        </div>
        <div v-else-if="screenshotModal.screenshots.length > 0" class="screenshot-grid">
          <div v-for="(screenshot, idx) in screenshotModal.screenshots" :key="idx" class="screenshot-card">
            <div class="screenshot-card-header">
              <strong>{{ screenshot.pageSlug }}</strong>
            </div>
            <div class="screenshot-tabs">
              <button
                :class="['screenshot-tab', { active: screenshot.activeDevice === 'desktop' }]"
                @click="screenshot.activeDevice = 'desktop'"
              >
                Desktop
              </button>
              <button
                :class="['screenshot-tab', { active: screenshot.activeDevice === 'mobile' }]"
                @click="screenshot.activeDevice = 'mobile'"
              >
                Mobile
              </button>
            </div>
            <div class="screenshot-preview">
              <img
                v-if="screenshot.activeDevice === 'desktop'"
                :src="screenshot.desktopSrc"
                alt="Desktop screenshot"
              />
              <img
                v-else
                :src="screenshot.mobileSrc"
                alt="Mobile screenshot"
                class="screenshot-mobile"
              />
            </div>
          </div>
        </div>
        <div v-else class="text-center py-4 text-muted">
          No screenshots available
        </div>
  </UiModal>
</template>

<script setup lang="ts">
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { useAlertStore } from '~/admin/stores/alertStore'
import { useSite } from '~/admin/composables/useSite'
import { useSiteApi } from '~/admin/composables/useSiteApi'
import type { VersionRecord } from '~/server/storage/types'
import { formatDateTime } from '~/admin/utils/formatters'
import UiAsyncState from '~/admin/components/ui/UiAsyncState.vue'
import UiEmptyState from '~/admin/components/ui/UiEmptyState.vue'
import UiModal from '~/admin/components/ui/UiModal.vue'

definePageMeta({ layout: 'admin' })
const { t } = useAdminI18n()

const { siteId, hasSite, siteStore } = useSite()
const { siteFetch } = useSiteApi()
const alertStore = useAlertStore()

const versions = ref<VersionRecord[]>([])
const loading = ref(true)
const error = ref('')
const publishing = ref(false)
const publishNote = ref('')
const activating = ref<string | null>(null)
const confirmAction = ref<{ kind: 'publish' } | { kind: 'activate'; version: VersionRecord } | null>(null)
const validationErrors = ref<any[]>([])
const screenshotCounts = ref<Record<string, number>>({})
const screenshotModal = ref({
  show: false,
  loading: false,
  error: '',
  screenshots: [] as Array<{ pageSlug: string; desktopSrc: string; mobileSrc: string; activeDevice: 'desktop' | 'mobile' }>,
})

onMounted(async () => {
  if (hasSite.value) await fetchVersions()
})

watch(siteId, (newId) => {
  if (newId) fetchVersions()
})

async function fetchVersions() {
  if (!hasSite.value) return
  loading.value = true
  error.value = ''
  try {
    const data = await siteFetch<{ versions: VersionRecord[] }>('/versions')
    versions.value = data.versions || []

    // Fetch screenshot counts for versions with multiple screenshots
    for (const version of versions.value) {
      if (version.hasMultipleScreenshots) {
        fetchScreenshotCount(version.id)
      }
    }
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Failed to load versions'
  } finally {
    loading.value = false
  }
}

async function fetchScreenshotCount(versionId: string) {
  try {
    const data = await siteFetch<{ screenshots: any[] }>(`/versions/${versionId}/screenshots`)
    screenshotCounts.value[versionId] = data.screenshots?.length || 0
  } catch {
    screenshotCounts.value[versionId] = 0
  }
}

async function showScreenshots(version: VersionRecord) {
  screenshotModal.value.show = true
  screenshotModal.value.loading = true
  screenshotModal.value.error = ''
  screenshotModal.value.screenshots = []

  try {
    if (version.hasMultipleScreenshots) {
      const data = await siteFetch<{ screenshots: Array<{ pageSlug: string; desktopKey: string; mobileKey: string }> }>(
        `/versions/${version.id}/screenshots`
      )
      screenshotModal.value.screenshots = (data.screenshots || []).map(s => ({
        pageSlug: s.pageSlug,
        desktopSrc: buildScreenshotUrl(version.id, s.pageSlug, 'desktop'),
        mobileSrc: buildScreenshotUrl(version.id, s.pageSlug, 'mobile'),
        activeDevice: 'desktop' as const,
      }))
    } else if (version.hasScreenshot) {
      try {
        const desktopData = await siteFetch<{ screenshot: string }>(`/versions/${version.id}/screenshot?device=desktop`)
        const mobileData = await siteFetch<{ screenshot: string }>(`/versions/${version.id}/screenshot?device=mobile`)
        screenshotModal.value.screenshots = [{
          pageSlug: 'Full Page',
          desktopSrc: desktopData.screenshot
            ? `data:image/jpeg;base64,${desktopData.screenshot}`
            : '',
          mobileSrc: mobileData.screenshot
            ? `data:image/jpeg;base64,${mobileData.screenshot}`
            : '',
          activeDevice: 'desktop' as const,
        }]
      } catch {
        screenshotModal.value.error = 'Failed to load legacy screenshots'
      }
    }
  } catch (e: any) {
    screenshotModal.value.error = e?.data?.statusMessage || 'Failed to load screenshots'
  } finally {
    screenshotModal.value.loading = false
  }
}

function buildScreenshotUrl(versionId: string, pageSlug: string, device: 'desktop' | 'mobile'): string {
  return `/api/admin/s/${siteId.value}/versions/${versionId}/screenshot-page?pageSlug=${encodeURIComponent(pageSlug)}&device=${device}`
}

function closeScreenshotModal() {
  screenshotModal.value.show = false
  screenshotModal.value.screenshots = []
}

function confirmPublish() {
  confirmAction.value = { kind: 'publish' }
}

async function runConfirmedAction() {
  const action = confirmAction.value
  if (!action) return
  if (action.kind === 'publish') await doPublish()
  else await doActivate(action.version)
  confirmAction.value = null
}

async function doPublish() {
  publishing.value = true
  validationErrors.value = []
  alertStore.clearContext('publish')
  try {
    await siteFetch('/publish', {
      method: 'POST',
      body: { note: publishNote.value || undefined },
    })
    publishNote.value = ''
    alertStore.success('Version published.', undefined, 'publish')
    await fetchVersions()
  } catch (e: any) {
    if (e?.data?.data?.errors) {
      validationErrors.value = e.data.data.errors
      alertStore.danger(
        'Validation failed.',
        `Page "${e.data.data.pageSlug || 'unknown'}" has ${e.data.data.errors.length} error(s).`,
        'publish'
      )
    } else {
      alertStore.danger(
        'Publish failed.',
        e?.data?.statusMessage || 'An error occurred while publishing.',
        'publish'
      )
    }
  } finally {
    publishing.value = false
  }
}

function confirmActivate(version: VersionRecord) {
  confirmAction.value = { kind: 'activate', version }
}

async function doActivate(version: VersionRecord) {
  activating.value = version.id
  alertStore.clearContext('publish')
  try {
    await siteFetch(`/versions/${version.id}/activate`, {
      method: 'POST',
    })
    alertStore.success('Version activated.', undefined, 'publish')
    await fetchVersions()
  } catch (e: any) {
    alertStore.danger(
      'Activation failed.',
      e?.data?.statusMessage || 'Could not activate this version.',
      'publish'
    )
  } finally {
    activating.value = null
  }
}

function statusBadgeClass(version: VersionRecord) {
  if (version.isActive) return 'cms-badge--success'
  switch (version.status) {
    case 'ready': return 'cms-badge--success'
    case 'building': return 'cms-badge--warning'
    case 'failed': return 'cms-badge--danger'
    default: return ''
  }
}

function statusLabel(version: VersionRecord) {
  if (version.isActive) return 'Active'
  return version.status.charAt(0).toUpperCase() + version.status.slice(1)
}

</script>

<style scoped>
.publish-readiness {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(32rem, 44rem);
  gap: 3.2rem;
  align-items: end;
  margin-bottom: 2.4rem;
  padding: 2.4rem;
  border: 1px solid var(--cms-line);
  border-radius: var(--cms-radius-card);
  background: var(--cms-surface);
  box-shadow: var(--cms-elev-1);
}

.publish-readiness h2 { margin: 0.4rem 0 0; }
.publish-readiness p { max-width: 52ch; margin: 0.6rem 0 0; color: var(--cms-ink-muted); }
.publish-readiness__action { display: flex; align-items: end; gap: 1.2rem; }
.publish-readiness__action .cms-form-group { flex: 1; }

@media (max-width: 900px) {
  .publish-readiness { grid-template-columns: 1fr; }
  .publish-readiness__action { align-items: stretch; flex-direction: column; }
}
.cms-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.8rem;
  font-size: 1.1rem;
  font-weight: 600;
  border-radius: 0.2rem;
}
.cms-badge--success {
  background-color: #e8f5e9;
  color: var(--cms-accent);
}
.cms-badge--warning {
  background-color: #fff5e9;
  color: #e28010;
}
.cms-badge--danger {
  background-color: var(--cms-danger-soft);
  color: var(--cms-danger);
}

.cms-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.cms-modal {
  background: white;
  border-radius: 8px;
  max-width: 90vw;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.cms-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--cms-line);
}

.cms-modal-header h3 {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 600;
}

.cms-modal-close {
  background: none;
  border: none;
  font-size: 2.4rem;
  cursor: pointer;
  color: var(--cms-ink-muted);
  line-height: 1;
  padding: 0;
  width: 30px;
  height: 30px;
}

.cms-modal-close:hover {
  color: var(--cms-ink-body);
}

.cms-modal-body {
  padding: 20px;
  overflow-y: auto;
}

.screenshot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.screenshot-card {
  border: 1px solid var(--cms-line);
  border-radius: 6px;
  overflow: hidden;
}

.screenshot-card-header {
  padding: 12px;
  background: var(--cms-surface-subtle);
  font-size: 1.3rem;
}

.screenshot-tabs {
  display: flex;
  border-bottom: 1px solid var(--cms-line);
}

.screenshot-tab {
  flex: 1;
  padding: 8px;
  background: white;
  border: none;
  cursor: pointer;
  font-size: 1.2rem;
  transition: background 0.2s;
}

.screenshot-tab:hover {
  background: var(--cms-canvas);
}

.screenshot-tab.active {
  background: #007bff;
  color: white;
}

.screenshot-preview {
  padding: 12px;
  background: var(--cms-canvas);
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.screenshot-preview img {
  max-width: 100%;
  height: auto;
  border: 1px solid var(--cms-line);
  border-radius: 4px;
}

.screenshot-preview img.screenshot-mobile {
  max-width: 200px;
}
</style>
