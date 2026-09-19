<template>
  <AdminPageHeader
    :title="t('admin.site.title', 'Site overview')"
    :description="t('admin.site.description', 'Review the live website, continue editing, and manage published versions.')"
    alert-context="site"
  >
    <template #actions>
      <button
        v-if="hasUnpublishedChanges"
        class="cms-btn cms-btn--secondary"
        :disabled="publishing"
        @click="confirmPublish"
      >
        <span v-if="publishing" class="cms-spinner cms-spinner--sm" />
        <span v-else class="material-icons-outlined btn-icon">publish</span>
        {{ publishing ? t('admin.site.publishing', 'Publishing…') : t('admin.site.publishChanges', 'Publish changes') }}
      </button>
      <a :href="publicSiteUrl" target="_blank" rel="noopener" class="cms-btn cms-btn--secondary">
        <span class="material-icons-outlined btn-icon">open_in_new</span>
        {{ t('admin.site.viewLive', 'View live website') }}
      </a>
      <NuxtLink :to="adminUrl('/editor')" class="cms-btn cms-btn--primary">
        <span class="material-icons-outlined btn-icon">edit</span>
        {{ t('admin.site.editWebsite', 'Edit website') }}
      </NuxtLink>
    </template>
  </AdminPageHeader>

  <!-- Loading -->
  <div v-if="loading" class="text-center py-5">
    <span class="cms-spinner cms-spinner--lg" />
  </div>

  <!-- Error -->
  <div v-else-if="error" class="cms-alert cms-alert--danger">
    <span class="material-icons-outlined cms-alert-icon">error</span>
    <div class="cms-alert-content">
      <div class="cms-alert-title">{{ t('admin.site.loadFailed', 'Failed to load site data') }}</div>
      <div class="cms-alert-description">{{ error }}</div>
    </div>
  </div>

  <template v-else>
    <!-- Unpublished changes banner -->
    <div v-if="hasUnpublishedChanges" class="unpublished-banner">
      <div class="unpublished-banner__row">
        <span class="material-icons-outlined unpublished-banner__icon">info</span>
        <span class="unpublished-banner__text">
          {{ t('admin.site.unpublished', 'You have unpublished changes. Your current editor configuration differs from the live version.') }}
        </span>
        <button
          type="button"
          class="unpublished-banner__toggle"
          :aria-expanded="showChanges"
          @click="toggleChanges"
        >
          {{ showChanges ? t('common.close', 'Hide changes') : t('admin.site.reviewChanges', 'Review changes') }}
          <span class="material-icons-outlined unpublished-banner__chevron">
            {{ showChanges ? 'expand_less' : 'expand_more' }}
          </span>
        </button>
      </div>

      <div v-if="showChanges" class="unpublished-banner__detail">
        <p v-if="changesLoading" class="unpublished-banner__hint">{{ t('admin.site.checkingChanges', 'Checking what changed…') }}</p>
        <p v-else-if="changesError" class="unpublished-banner__hint">{{ t('admin.site.changesFailed', `Couldn't load the change list.`) }}</p>
        <p v-else-if="pendingChanges.length === 0" class="unpublished-banner__hint">
          No area-level changes detected (content may have been edited then reverted).
        </p>
        <ul v-else class="change-list">
          <li v-for="c in pendingChanges" :key="c.area" class="change-list__item">
            <span class="material-icons-outlined change-list__icon">{{ areaMeta(c.area).icon }}</span>
            <span class="change-list__label">{{ areaMeta(c.area).label }}</span>
            <span class="change-list__time">{{ formatRelativeDate(c.changedAt) }}</span>
          </li>
        </ul>
      </div>
    </div>

    <!-- ============================================= -->
    <!-- SPEED STRIP — Compact Shopify-style row       -->
    <!-- ============================================= -->
    <div class="speed-strip">
      <!-- Date range cell -->
      <div class="speed-strip__range">
        <span class="material-icons-outlined speed-strip__range-icon">calendar_today</span>
        <select
          v-model="vitalsRange"
          class="speed-strip__range-select"
          @change="fetchVitals"
        >
          <option value="7d">{{ t('admin.site.days', '7 days', { count: 7 }) }}</option>
          <option value="30d">{{ t('admin.site.days', '30 days', { count: 30 }) }}</option>
          <option value="90d">{{ t('admin.site.days', '90 days', { count: 90 }) }}</option>
        </select>
      </div>

      <!-- Metric cells -->
      <template v-if="vitalsLoading">
        <div class="speed-strip__cell speed-strip__cell--loading">
          <span class="cms-spinner cms-spinner--sm" />
        </div>
      </template>

      <template v-else-if="!vitalsData || vitalsData.metrics.every(m => m.current.sampleCount === 0)">
        <div class="speed-strip__cell speed-strip__cell--empty">
          No performance data yet
        </div>
      </template>

      <template v-else>
        <div
          v-for="metric in vitalsData.metrics"
          :key="metric.metricName"
          class="speed-strip__cell"
        >
          <div class="speed-strip__metric-label">{{ metric.metricName }} P75</div>
          <div class="speed-strip__metric-row">
            <span class="speed-strip__metric-value">
              {{ formatMetricValue(metric.metricName, metric.current.p75) }}
            </span>
            <span
              v-if="metric.current.sampleCount > 0 && metric.previous.sampleCount > 0"
              class="speed-strip__trend"
              :class="trendClass(metric.metricName, metric.changePercent)"
            >
              {{ trendArrow(metric.metricName, metric.changePercent) }}{{ Math.abs(Math.round(metric.changePercent)) }}%
            </span>
            <span v-else class="speed-strip__trend speed-strip__trend--neutral">&mdash;</span>
            <AdminSparklineChart
              v-if="sparklineValues(metric.metricName).length > 1"
              :data="sparklineValues(metric.metricName)"
              :color="metricColor(metric.metricName, metric.current.p75)"
              :width="64"
              :height="22"
            />
            <span
              class="speed-strip__badge"
              :class="metricBadgeClass(metric.metricName, metric.current.p75)"
            >
              {{ metricRating(metric.metricName, metric.current.p75) }}
            </span>
          </div>
        </div>
      </template>
    </div>

    <!-- Dual Preview -->
    <div class="preview-panel">
      <!-- Desktop preview -->
      <div class="preview-device preview-device--desktop">
        <div class="preview-device__label">
          <span class="material-icons-outlined preview-device__label-icon">desktop_windows</span>
          Desktop
        </div>
        <div class="preview-device__shell preview-device__shell--desktop">
          <div class="preview-device__bezel">
            <span class="preview-device__dot" />
            <span class="preview-device__dot" />
            <span class="preview-device__dot" />
          </div>
          <div ref="desktopPreviewRef" class="preview-device__frame">
            <iframe
              :src="previewUrl"
              class="preview-device__iframe preview-device__iframe--desktop"
              :style="{ transform: `scale(${desktopScale})` }"
              tabindex="-1"
              sandbox="allow-scripts allow-same-origin"
              loading="lazy"
              title="Desktop preview"
            />
          </div>
        </div>
      </div>

      <!-- Mobile preview -->
      <div class="preview-device preview-device--mobile">
        <div class="preview-device__label">
          <span class="material-icons-outlined preview-device__label-icon">smartphone</span>
          Mobile
        </div>
        <div class="preview-device__shell preview-device__shell--mobile">
          <div ref="mobilePreviewRef" class="preview-device__frame preview-device__frame--mobile">
            <iframe
              :src="previewUrl"
              class="preview-device__iframe preview-device__iframe--mobile"
              :style="{ transform: `scale(${mobileScale})` }"
              tabindex="-1"
              sandbox="allow-scripts allow-same-origin"
              loading="lazy"
              title="Mobile preview"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================= -->
    <!-- SECTION 1: Current Active Theme               -->
    <!-- ============================================= -->
    <div class="active-theme-card">
      <div class="active-theme-card__thumb">
        <img
          v-if="activeVersion?.hasScreenshot"
          :src="versionScreenshotUrl(activeVersion.id)"
          alt="Current theme"
          class="active-theme-card__thumb-img"
        />
        <span v-else>{{ themeInitial(siteStore.activeSiteTheme) }}</span>
      </div>
      <div class="active-theme-card__info">
        <div class="active-theme-card__header">
          <h2 class="active-theme-card__name">
            {{ siteStore.activeSiteTheme || 'Theme' }}
          </h2>
          <span class="site-badge site-badge--active">Current theme</span>
        </div>

        <div class="active-theme-card__meta">
          <p v-if="activeVersion" class="active-theme-card__detail">
            Last published: {{ formatRelativeDate(activeVersion.timestamp) }}
          </p>
          <p v-else class="active-theme-card__detail">
            No versions published yet.
          </p>
          <p v-if="activeVersion" class="active-theme-card__hash">
            Version: <code>{{ activeVersion.hash?.substring(0, 8) }}</code>
            <span v-if="activeVersion.note" class="active-theme-card__note">
              &mdash; {{ activeVersion.note }}
            </span>
          </p>
        </div>
      </div>
      <div class="active-theme-card__actions">
        <button
          class="version-menu__trigger"
          @click.stop="toggleMenu('active')"
        >
          <span class="material-icons-outlined">more_vert</span>
        </button>
        <NuxtLink :to="adminUrl('/editor?mode=theme')" class="cms-btn cms-btn--secondary cms-btn--sm">
          Edit site styles
        </NuxtLink>
      </div>
    </div>

    <!-- ============================================= -->
    <!-- SECTION 2: Version Library                    -->
    <!-- ============================================= -->
    <div class="version-library">
      <div class="version-library__header">
        <h2 class="version-library__title">Version library</h2>
        <p class="version-library__subtitle">
          Previous versions. Activating a version will make it the live configuration.
        </p>
      </div>

      <!-- Empty state -->
      <div v-if="libraryVersions.length === 0" class="cms-empty">
        <span class="material-icons-outlined cms-empty__icon">inventory_2</span>
        <p class="cms-empty__title">No previous versions yet</p>
        <p class="cms-empty__body">
          Publishing takes a snapshot of the site. Once you have published more
          than once, earlier versions appear here and can be made live again.
        </p>
      </div>

      <!-- Version list -->
      <div v-else class="version-list">
        <div
          v-for="version in visibleLibraryVersions"
          :key="version.id"
          class="version-row"
        >
          <!-- Thumbnail -->
          <div
            class="version-row__thumb"
            :class="`version-row__thumb--${version.status}`"
          >
            <img
              v-if="version.hasScreenshot"
              :src="versionScreenshotUrl(version.id)"
              :alt="version.note || `Version ${version.hash?.substring(0, 8)}`"
              class="version-row__thumb-img"
            />
            <span v-else>{{ themeInitial(siteStore.activeSiteTheme) }}</span>
          </div>

          <!-- Info -->
          <div class="version-row__info">
            <div class="version-row__name">
              {{ version.note || `Version ${version.hash?.substring(0, 8)}` }}
            </div>
            <div class="version-row__meta">
              <code>{{ version.hash?.substring(0, 8) }}</code>
              <span class="version-row__dot">&middot;</span>
              {{ formatDateTime(version.timestamp) }}
            </div>
          </div>

          <!-- Status -->
          <div class="version-row__status">
            <span
              class="site-badge"
              :class="{
                'site-badge--ready': version.status === 'ready',
                'site-badge--building': version.status === 'building',
                'site-badge--failed': version.status === 'failed',
              }"
            >
              {{ version.status.charAt(0).toUpperCase() + version.status.slice(1) }}
            </span>
          </div>

          <!-- Actions -->
          <div class="version-row__actions">
            <button
              v-if="version.status === 'ready'"
              class="cms-btn cms-btn--secondary cms-btn--sm"
              :disabled="activating === version.id"
              @click="confirmActivate(version)"
            >
              {{ activating === version.id ? 'Activating...' : 'Activate' }}
            </button>

            <!-- Three-dot menu -->
            <div class="version-menu">
              <button
                class="version-menu__trigger"
                @click.stop="toggleMenu(version.id)"
              >
                <span class="material-icons-outlined">more_vert</span>
              </button>
              <div
                v-if="openMenuId === version.id"
                class="version-menu__dropdown"
              >
                <button class="version-menu__item" disabled>
                  <span class="material-icons-outlined">download</span>
                  Download
                </button>
                <button class="version-menu__item" disabled>
                  <span class="material-icons-outlined">delete</span>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Show all toggle -->
      <div v-if="hasMoreVersions" class="version-library__footer">
        <button
          class="version-library__toggle"
          @click="showAllVersions = !showAllVersions"
        >
          {{ showAllVersions ? 'Show less' : `Show all (${libraryVersions.length})` }}
          <span class="material-icons-outlined version-library__chevron" :class="{ 'version-library__chevron--up': showAllVersions }">
            expand_more
          </span>
        </button>
      </div>
    </div>

    <!-- Publish confirmation modal -->
    <Teleport to="body">
      <div v-if="showPublishModal" class="publish-modal-overlay" @click.self="cancelPublish">
        <div class="publish-modal">
          <div class="publish-modal__header">
            <h3 class="publish-modal__title">Publish new version</h3>
            <button class="publish-modal__close" @click="cancelPublish">
              <span class="material-icons-outlined">close</span>
            </button>
          </div>
          <div class="publish-modal__body">
            <p class="publish-modal__desc">
              This will snapshot and deploy the current editor configuration.
            </p>
            <div class="cms-form-group mb-0">
              <label class="cms-label">Publish Note (optional)</label>
              <input
                v-model="publishNote"
                type="text"
                class="cms-form-control"
                placeholder="e.g. Updated hero banner"
                @keyup.enter="doPublish"
              />
            </div>
          </div>
          <div class="publish-modal__footer">
            <button class="cms-btn cms-btn--secondary cms-btn--sm" @click="cancelPublish">
              Cancel
            </button>
            <button class="cms-btn cms-btn--primary cms-btn--sm" @click="doPublish">
              Publish
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </template>
</template>

<script setup lang="ts">
import { useAlertStore } from '~/admin/stores/alertStore'
import { useSite } from '~/admin/composables/useSite'
import { useSiteApi } from '~/admin/composables/useSiteApi'
import { useSiteStore } from '~/admin/stores/siteStore'
import { useProgramStore } from '~/admin/stores/programStore'
import { useAdminUrl } from '~/admin/composables/useAdminUrl'
import { buildPublicSiteUrl } from '~/admin/utils/publicSiteUrl'
import type { VersionRecord, WebVitalDashboard, WebVitalMetricName } from '~/server/storage/types'
import { formatDateTime, formatRelativeDate } from '~/admin/utils/formatters'
import { useConfirmAction } from '~/admin/composables/useConfirmAction'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'

definePageMeta({ layout: 'admin' })

const siteStore = useSiteStore()
const programStore = useProgramStore()
const runtimeConfig = useRuntimeConfig()
const { adminUrl } = useAdminUrl()
const { siteId, hasSite } = useSite()
const { apiBase, siteFetch } = useSiteApi()
const alertStore = useAlertStore()
const confirmAction = useConfirmAction()
const { t } = useAdminI18n()

// State
const versions = ref<VersionRecord[]>([])
const loading = ref(true)
const error = ref('')
const publishing = ref(false)
const showPublishModal = ref(false)
const publishNote = ref('')
const activating = ref<string | null>(null)
const hasUnpublishedChanges = ref(false)
const showAllVersions = ref(false)

// "Review changes" — per-area breakdown of what changed since the last publish.
// Lazily fetched (from /pending-changes) the first time the author expands it.
interface PendingChange {
  area: string
  changedAt: string
}
const showChanges = ref(false)
const changesLoading = ref(false)
const changesError = ref(false)
const pendingChanges = ref<PendingChange[]>([])

// Maps a versionable-entity name to an author-facing label + icon. Unknown
// names (e.g. a newly-registered entity) fall back to the raw name.
const AREA_META: Record<string, { label: string; icon: string }> = {
  pages: { label: 'Pages & content', icon: 'description' },
  themeSettings: { label: 'Theme settings', icon: 'palette' },
  brandIdentity: { label: 'Brand settings', icon: 'branding_watermark' },
  navigationLayouts: { label: 'Navigation & layout', icon: 'account_tree' },
  envVariables: { label: 'Environment variables', icon: 'data_object' },
  apiConfigs: { label: 'API configuration', icon: 'api' },
  typographyPresets: { label: 'Typography presets', icon: 'text_fields' },
  typographyRoles: { label: 'Typography roles', icon: 'format_size' },
  colorRoles: { label: 'Color roles', icon: 'colorize' },
  animationScenes: { label: 'Animation scenes', icon: 'movie' },
}
function areaMeta(area: string): { label: string; icon: string } {
  return AREA_META[area] ?? { label: area, icon: 'edit' }
}
const openMenuId = ref<string | null>(null)

// Preview — iframe src. Must stay same-origin so the query-param site
// override resolves inside the admin app without needing an /etc/hosts entry.
const previewKey = ref(0)
const previewUrl = computed(() => {
  const params = new URLSearchParams()
  if (siteStore.activeSiteId) params.set('site', siteStore.activeSiteId)
  params.set('_t', String(previewKey.value))
  return `/home?${params.toString()}`
})

// Public site URL — the "View your site" button. Prefers the tenant's
// configured domain so the tab opens at the canonical hostname instead of
// trapping the user on whatever origin the admin happens to be loaded from
// (e.g. 0.0.0.0:3000, where HMR websockets and browser cache get flaky).
// Falls back to the same-origin `?site=` override when no domain is set.
const publicSiteUrl = computed(() => {
  const url = buildPublicSiteUrl({
    storedDomain: siteStore.activeSite?.domain,
    siteSlug: siteStore.activeSite?.slug,
    programSlug: programStore.activeProgram?.slug,
    baseDomain: runtimeConfig.public.cmsBaseDomain,
    protocol: typeof window !== 'undefined' ? window.location.protocol : 'http:',
  })
  return url || previewUrl.value
})

// Desktop preview scaling
const desktopPreviewRef = ref<HTMLElement | null>(null)
const desktopScale = ref(0.25)
const DESKTOP_WIDTH = 1440

// Mobile preview scaling
const mobilePreviewRef = ref<HTMLElement | null>(null)
const mobileScale = ref(0.25)
const MOBILE_WIDTH = 390

// Core Web Vitals
const vitalsRange = ref('30d')
const vitalsData = ref<WebVitalDashboard | null>(null)
const vitalsLoading = ref(false)

// CWV thresholds (Google's recommended thresholds)
const CWV_THRESHOLDS: Record<string, { good: number; poor: number }> = {
  LCP: { good: 2500, poor: 4000 },   // ms
  INP: { good: 200, poor: 500 },     // ms
  CLS: { good: 0.1, poor: 0.25 },    // unitless
  FCP: { good: 1800, poor: 3000 },   // ms
  TTFB: { good: 800, poor: 1800 },   // ms
}

// Computed
const activeVersion = computed(() =>
  versions.value.find(v => v.isActive) ?? null,
)

const libraryVersions = computed(() =>
  versions.value.filter(v => !v.isActive),
)

const visibleLibraryVersions = computed(() =>
  showAllVersions.value
    ? libraryVersions.value
    : libraryVersions.value.slice(0, 5),
)

const hasMoreVersions = computed(() =>
  libraryVersions.value.length > 5,
)

// Lifecycle
const initialFetchDone = ref(false)

onMounted(async () => {
  if (!siteStore.initialized) {
    await siteStore.fetchSite()
  }
  if (!siteStore.hasSite) {
    await navigateTo('/admin/new')
    return
  }
  await Promise.all([fetchVersions(), fetchVitals(), fetchHasChanges()])
  initialFetchDone.value = true
})

watch(siteId, (newId) => {
  if (newId && initialFetchDone.value) {
    fetchVersions()
    fetchVitals()
    fetchHasChanges()
  }
})

// Dynamically scale preview iframes — use watch instead of onMounted
// because the refs live inside a conditional v-else block that renders
// only after loading finishes (at which point onMounted has already fired).
let desktopObserver: ResizeObserver | null = null
watch(desktopPreviewRef, (el, _, onCleanup) => {
  desktopObserver?.disconnect()
  desktopObserver = null
  if (el) {
    desktopObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) desktopScale.value = width / DESKTOP_WIDTH
    })
    desktopObserver.observe(el)
  }
  onCleanup(() => desktopObserver?.disconnect())
})

let mobileObserver: ResizeObserver | null = null
watch(mobilePreviewRef, (el, _, onCleanup) => {
  mobileObserver?.disconnect()
  mobileObserver = null
  if (el) {
    mobileObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) mobileScale.value = width / MOBILE_WIDTH
    })
    mobileObserver.observe(el)
  }
  onCleanup(() => mobileObserver?.disconnect())
})

// Click outside to close menu
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

function handleClickOutside(e: MouseEvent) {
  if (openMenuId.value) {
    const target = e.target as HTMLElement
    if (!target.closest('.version-menu')) {
      openMenuId.value = null
    }
  }
}

// API functions
async function fetchVersions() {
  if (!hasSite.value) return
  loading.value = true
  error.value = ''
  try {
    const data = await siteFetch<{ versions: VersionRecord[] }>('/versions')
    versions.value = data.versions || []
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'Failed to load versions'
  } finally {
    loading.value = false
  }
}

async function fetchHasChanges() {
  if (!hasSite.value) return
  try {
    const data = await siteFetch<{ hasUnpublishedChanges: boolean }>('/has-changes')
    hasUnpublishedChanges.value = data.hasUnpublishedChanges
  } catch {
    // Silently fail — don't block the page if check fails
    hasUnpublishedChanges.value = false
  }
}

async function fetchPendingChanges() {
  if (!hasSite.value) return
  changesLoading.value = true
  changesError.value = false
  try {
    const data = await siteFetch<{ changes: PendingChange[] }>('/pending-changes')
    pendingChanges.value = data.changes
  } catch {
    changesError.value = true
    pendingChanges.value = []
  } finally {
    changesLoading.value = false
  }
}

function toggleChanges() {
  showChanges.value = !showChanges.value
  // Fetch on every open so the list reflects edits made since it was last viewed.
  if (showChanges.value) fetchPendingChanges()
}

async function fetchVitals() {
  if (!hasSite.value) return
  vitalsLoading.value = true
  try {
    vitalsData.value = await siteFetch<WebVitalDashboard>(`/web-vitals?range=${vitalsRange.value}`)
  } catch {
    // Silently fail — panel will show empty state
    vitalsData.value = null
  } finally {
    vitalsLoading.value = false
  }
}

function confirmPublish() {
  publishNote.value = ''
  showPublishModal.value = true
}

function cancelPublish() {
  showPublishModal.value = false
  publishNote.value = ''
}

async function doPublish() {
  showPublishModal.value = false
  publishing.value = true
  alertStore.clearContext('site')
  try {
    await siteFetch('/publish', {
      method: 'POST',
      body: { note: publishNote.value || undefined },
    })
    publishNote.value = ''
    alertStore.success('Version published successfully.', undefined, 'site')
    previewKey.value++
    showChanges.value = false
    pendingChanges.value = []
    await Promise.all([fetchVersions(), fetchHasChanges()])
  } catch (e: any) {
    if (e?.data?.data?.errors) {
      alertStore.danger(
        'Validation failed.',
        `Page "${e.data.data.pageSlug || 'unknown'}" has ${e.data.data.errors.length} error(s). Use the Publish page for details.`,
        'site',
      )
    } else {
      alertStore.danger(
        'Publish failed.',
        e?.data?.statusMessage || 'An error occurred while publishing.',
        'site',
      )
    }
  } finally {
    publishing.value = false
  }
}

async function confirmActivate(version: VersionRecord) {
  const accepted = await confirmAction.confirm({
    title: 'Make this version live?',
    description: `Version ${version.hash?.substring(0, 8)} will replace both the live website and your editable draft. Any unpublished draft changes will no longer be available in the admin.`,
    confirmLabel: 'Make version live',
  })
  if (!accepted) return
  doActivate(version)
}

async function doActivate(version: VersionRecord) {
  activating.value = version.id
  alertStore.clearContext('site')
  try {
    await siteFetch(`/versions/${version.id}/activate`, { method: 'POST' })
    alertStore.success('Version activated.', undefined, 'site')
    previewKey.value++
    showChanges.value = false
    pendingChanges.value = []
    await Promise.all([fetchVersions(), fetchHasChanges()])
  } catch (e: any) {
    alertStore.danger(
      'Activation failed.',
      e?.data?.statusMessage || 'Could not activate this version.',
      'site',
    )
  } finally {
    activating.value = null
  }
}

// CWV helpers
function formatMetricValue(name: WebVitalMetricName, value: number): string {
  if (!value && value !== 0) return '--'
  if (name === 'CLS') return value.toFixed(2)
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`
  return `${Math.round(value)}ms`
}

function metricColor(name: WebVitalMetricName, value: number): string {
  const t = CWV_THRESHOLDS[name]
  if (!t) return '#6c757d'
  if (value <= t.good) return '#2e7d32'
  if (value <= t.poor) return '#e28010'
  return '#a7000d'
}

function metricRating(name: WebVitalMetricName, value: number): string {
  const t = CWV_THRESHOLDS[name]
  if (!t) return '--'
  if (value <= t.good) return 'Good'
  if (value <= t.poor) return 'Needs work'
  return 'Poor'
}

function metricBadgeClass(name: WebVitalMetricName, value: number): string {
  const t = CWV_THRESHOLDS[name]
  if (!t) return ''
  if (value <= t.good) return 'metric-card__badge--good'
  if (value <= t.poor) return 'metric-card__badge--warning'
  return 'metric-card__badge--poor'
}

function trendClass(_name: WebVitalMetricName, changePercent: number): string {
  if (Math.abs(changePercent) < 1) return 'metric-card__trend--neutral'
  // For all CWV metrics, lower is better, so negative change is good
  return changePercent < 0 ? 'metric-card__trend--good' : 'metric-card__trend--poor'
}

function trendArrow(_name: WebVitalMetricName, changePercent: number): string {
  if (Math.abs(changePercent) < 1) return '\u2014'
  return changePercent < 0 ? '\u2193' : '\u2191'
}

function sparklineValues(name: WebVitalMetricName): number[] {
  if (!vitalsData.value) return []
  const points = vitalsData.value.sparklines[name]
  if (!points) return []
  return points.map(p => p.p75)
}

// General helpers
function toggleMenu(versionId: string) {
  openMenuId.value = openMenuId.value === versionId ? null : versionId
}

function themeInitial(themeName: string): string {
  return (themeName || 'T').charAt(0).toUpperCase()
}

function versionScreenshotUrl(versionId: string): string {
  return `${apiBase()}/versions/${versionId}/screenshot?device=desktop`
}
</script>

<style scoped>
/* === Top Actions === */
.top-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 1.6rem;
}

/* === Unpublished Changes Banner === */
.unpublished-banner {
  padding: 1rem 1.6rem;
  margin-bottom: 1.6rem;
  border: 1px solid #fde68a;
  border-radius: 0.4rem;
  background: #fffbeb;
  color: var(--cms-warn);
  font-size: 1.3rem;
}

.unpublished-banner__row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.unpublished-banner__icon {
  font-size: 2rem;
  color: #d97706;
  flex-shrink: 0;
}

.unpublished-banner__text {
  flex: 1;
}

.unpublished-banner__toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 0;
  padding: 0.4rem 0.9rem;
  border: 1px solid #f0c774;
  border-radius: 999px;
  background: var(--cms-surface);
  color: var(--cms-warn);
  font-size: 1.2rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.unpublished-banner__toggle:hover {
  background: var(--cms-warn-soft);
  border-color: #d97706;
}

.unpublished-banner__chevron {
  font-size: 1.6rem;
}

.unpublished-banner__detail {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px dashed #fde68a;
}

.unpublished-banner__hint {
  margin: 0;
  padding: 0.4rem 0;
  color: #a16207;
  font-size: 1.2rem;
}

.change-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.change-list__item {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.5rem 0.6rem;
  border-radius: 0.3rem;
}

.change-list__item:hover {
  background: var(--cms-warn-soft);
}

.change-list__icon {
  font-size: 1.8rem;
  color: #d97706;
  flex-shrink: 0;
}

.change-list__label {
  flex: 1;
  color: #78350f;
  font-weight: 500;
}

.change-list__time {
  color: #a16207;
  font-size: 1.2rem;
  white-space: nowrap;
}

/* === Speed Strip (Shopify-style compact row) === */
.speed-strip {
  display: flex;
  border: 1px solid var(--cms-line);
  border-radius: 0.4rem;
  background: var(--cms-surface);
  margin-bottom: 2rem;
  overflow: hidden;
}

.speed-strip__range {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 1.2rem 1.6rem;
  border-right: 1px solid var(--cms-line);
  flex-shrink: 0;
}

.speed-strip__range-icon {
  font-size: 1.6rem;
  color: var(--cms-ink-muted);
}

.speed-strip__range-select {
  border: none;
  background: none;
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--cms-ink-body);
  cursor: pointer;
  padding: 0;
}

.speed-strip__range-select:focus {
  outline: none;
}

.speed-strip__cell {
  flex: 1;
  padding: 1rem 1.6rem;
  border-right: 1px solid var(--cms-line);
  min-width: 0;
}

.speed-strip__cell:last-child {
  border-right: none;
}

.speed-strip__cell--loading,
.speed-strip__cell--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  color: var(--cms-ink-subtle);
  font-size: 1.2rem;
  flex: 1;
}

.speed-strip__metric-label {
  font-size: 1.1rem;
  font-weight: 500;
  color: var(--cms-ink-muted);
  margin-bottom: 0.3rem;
}

.speed-strip__metric-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.speed-strip__metric-value {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--cms-ink-body);
  font-variant-numeric: tabular-nums;
}

.speed-strip__trend {
  font-size: 1.1rem;
  font-variant-numeric: tabular-nums;
}

.speed-strip__trend--neutral,
.metric-card__trend--neutral {
  color: var(--cms-ink-subtle);
}

.metric-card__trend--good {
  color: var(--cms-accent);
}

.metric-card__trend--poor {
  color: var(--cms-danger);
}

.speed-strip__badge {
  display: inline-flex;
  align-items: center;
  padding: 0.1rem 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  border-radius: 10rem;
}

.metric-card__badge--good {
  background-color: #e8f5e9;
  color: var(--cms-accent);
}

.metric-card__badge--warning {
  background-color: #fff5e9;
  color: #e28010;
}

.metric-card__badge--poor {
  background-color: var(--cms-danger-soft);
  color: var(--cms-danger);
}

/* Dual preview area */
.preview-panel {
  display: flex;
  gap: 2.4rem;
  margin-bottom: 2rem;
  align-items: flex-start;
  justify-content: center;
}

.preview-device {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.preview-device--desktop {
  flex: 0 1 52rem;
  min-width: 0;
}

.preview-device--mobile {
  flex: 0 0 auto;
}

.preview-device__label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--cms-ink-muted);
}

.preview-device__label-icon {
  font-size: 1.6rem;
}

/* Device shells — clip-path guarantees clipping on scaled iframes */
.preview-device__shell {
  position: relative;
  border-radius: 0.8rem;
  overflow: hidden;
  clip-path: inset(0 round 0.8rem);
  border: 1px solid var(--cms-line-strong);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  background: var(--cms-surface);
}

.preview-device__shell--mobile {
  border-radius: 1.6rem;
  clip-path: inset(0 round 1.6rem);
  width: 14rem;
}

.preview-device__bezel {
  display: flex;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  background: #f0f2f5;
  border-bottom: 1px solid var(--cms-line);
}

.preview-device__dot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  background: var(--cms-line-strong);
}

.preview-device__frame {
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  position: relative;
  isolation: isolate;
  background: var(--cms-surface);
}

.preview-device__frame--mobile {
  aspect-ratio: 9 / 16;
}

.preview-device__iframe {
  display: block;
  border: none;
  pointer-events: none;
  transform-origin: top left;
  position: absolute;
  top: 0;
  left: 0;
}

.preview-device__iframe--desktop {
  width: 1440px;
  height: 810px;
}

.preview-device__iframe--mobile {
  width: 390px;
  height: 694px;
}

/* === Active Theme Card (Shopify-style row) === */
.active-theme-card {
  display: flex;
  align-items: center;
  gap: 1.6rem;
  padding: 1.6rem 2rem;
  border: 1px solid var(--cms-line);
  border-radius: 0.4rem;
  background: var(--cms-surface);
  margin-bottom: 3rem;
}

.active-theme-card__thumb {
  width: 8.8rem;
  aspect-ratio: 16 / 10;
  border-radius: 0.4rem;
  background: var(--cms-accent);
  color: var(--cms-ink-inverse);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.2rem;
  font-weight: 700;
  flex-shrink: 0;
  overflow: hidden;
}

.active-theme-card__info {
  flex: 1;
  min-width: 0;
}

.active-theme-card__header {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-bottom: 0.3rem;
}

.active-theme-card__name {
  font-size: 1.4rem;
  font-weight: 600;
  color: var(--cms-ink-body);
  margin: 0;
  text-transform: capitalize;
}

.active-theme-card__meta {
  margin: 0;
}

.active-theme-card__detail {
  font-size: 1.2rem;
  color: var(--cms-ink-subtle);
  margin: 0;
}

.active-theme-card__hash {
  font-size: 1.1rem;
  color: var(--cms-ink-subtle);
  margin: 0;
}

.active-theme-card__hash code {
  color: var(--cms-ink-body);
}

.active-theme-card__note {
  color: var(--cms-ink-muted);
}

.active-theme-card__actions {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-shrink: 0;
}

.btn-icon {
  font-size: 1.6rem;
  vertical-align: middle;
  margin-right: 0.4rem;
}

/* === Badges === */
.site-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.8rem;
  font-size: 1.1rem;
  font-weight: 600;
  border-radius: 0.2rem;
  white-space: nowrap;
}

.site-badge--active {
  background-color: #e8f5e9;
  color: var(--cms-accent);
}

.site-badge--ready {
  background-color: #e8f5e9;
  color: var(--cms-accent);
}

.site-badge--building {
  background-color: #fff5e9;
  color: #e28010;
}

.site-badge--failed {
  background-color: var(--cms-danger-soft);
  color: var(--cms-danger);
}

/* === Version Library === */
.version-library {
  margin-bottom: 3rem;
}

.version-library__header {
  margin-bottom: 2rem;
}

.version-library__title {
  font-size: 1.6rem;
  font-weight: 600;
  color: var(--cms-ink-body);
  margin: 0 0 0.4rem;
}

.version-library__subtitle {
  font-size: 1.3rem;
  color: var(--cms-ink-subtle);
  margin: 0;
}

.version-library__empty {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--cms-ink-subtle);
  font-size: 1.3rem;
}

.version-library__empty-icon {
  font-size: 4rem;
  display: block;
  margin-bottom: 1rem;
}

.version-library__empty p {
  margin: 0;
}

.version-library__footer {
  text-align: center;
  padding-top: 1.6rem;
}

.version-library__toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: none;
  border: none;
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--cms-accent);
  cursor: pointer;
}

.version-library__toggle:hover {
  text-decoration: underline;
}

.version-library__chevron {
  font-size: 1.8rem;
  transition: transform 0.2s;
}

.version-library__chevron--up {
  transform: rotate(180deg);
}

/* === Version List === */
.version-list {
  border: 1px solid var(--cms-line);
  border-radius: 0.4rem;
  background: var(--cms-surface);
  overflow: hidden;
}

.version-row {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1.2rem 1.5rem;
  border-bottom: 1px solid var(--cms-line);
  transition: background-color 0.1s;
}

.version-row:last-child {
  border-bottom: none;
}

.version-row:hover {
  background-color: var(--cms-canvas);
}

/* Thumbnail */
.version-row__thumb {
  width: 7.2rem;
  aspect-ratio: 16 / 10;
  border-radius: 0.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--cms-ink-inverse);
  flex-shrink: 0;
  background-color: var(--cms-accent);
  overflow: hidden;
}

.version-row__thumb-img,
.active-theme-card__thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}

.version-row__thumb--building {
  background-color: #e28010;
}

.version-row__thumb--failed {
  background-color: var(--cms-danger);
}

/* Info */
.version-row__info {
  flex: 1;
  min-width: 0;
}

.version-row__name {
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--cms-ink-body);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.version-row__meta {
  font-size: 1.1rem;
  color: var(--cms-ink-subtle);
  margin-top: 0.2rem;
}

.version-row__meta code {
  color: var(--cms-ink-body);
}

.version-row__dot {
  margin: 0 0.4rem;
}

/* Status */
.version-row__status {
  flex-shrink: 0;
}

/* Actions */
.version-row__actions {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-shrink: 0;
}

/* Three-dot menu */
.version-menu {
  position: relative;
}

.version-menu__trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.2rem;
  height: 3.2rem;
  background: transparent;
  border: none;
  border-radius: 0.2rem;
  cursor: pointer;
  color: var(--cms-ink-subtle);
  transition: background-color 0.15s, color 0.15s;
}

.version-menu__trigger:hover {
  background-color: var(--cms-surface-subtle);
  color: var(--cms-ink-body);
}

.version-menu__trigger .material-icons-outlined {
  font-size: 2rem;
}

.version-menu__dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 10;
  min-width: 16rem;
  background: var(--cms-surface);
  border: 1px solid var(--cms-line);
  border-radius: 0.4rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  padding: 0.4rem 0;
}

.version-menu__item {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  width: 100%;
  padding: 0.8rem 1.2rem;
  background: none;
  border: none;
  font-size: 1.3rem;
  color: var(--cms-ink-body);
  cursor: pointer;
  transition: background-color 0.1s;
}

.version-menu__item:hover:not(:disabled) {
  background-color: var(--cms-surface-subtle);
}

.version-menu__item:disabled {
  color: var(--cms-ink-subtle);
  cursor: not-allowed;
}

.version-menu__item .material-icons-outlined {
  font-size: 1.8rem;
}

/* === Publish Modal === */
.publish-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.publish-modal {
  background: var(--cms-surface);
  border-radius: 0.8rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16);
  width: 100%;
  max-width: 44rem;
  margin: 1.6rem;
}

.publish-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.6rem 2rem;
  border-bottom: 1px solid var(--cms-line);
}

.publish-modal__title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--cms-ink-body);
  margin: 0;
}

.publish-modal__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.2rem;
  height: 3.2rem;
  background: none;
  border: none;
  border-radius: 0.2rem;
  cursor: pointer;
  color: var(--cms-ink-subtle);
}

.publish-modal__close:hover {
  background: var(--cms-surface-subtle);
  color: var(--cms-ink-body);
}

.publish-modal__body {
  padding: 2rem;
}

.publish-modal__desc {
  font-size: 1.3rem;
  color: var(--cms-ink-muted);
  margin: 0 0 1.6rem;
}

.publish-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.8rem;
  padding: 1.2rem 2rem;
  border-top: 1px solid var(--cms-line);
}

/* === Responsive === */
@media (max-width: 767px) {
  .top-actions {
    flex-direction: column;
    align-items: stretch;
    gap: 0.8rem;
  }

  .top-actions :deep(.cms-btn) { width: 100%; }

  .unpublished-banner__row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
  }

  .unpublished-banner__toggle {
    grid-column: 1 / -1;
    justify-self: start;
    margin-left: 3rem;
  }

  .speed-strip {
    flex-direction: column;
  }

  .speed-strip__range {
    border-right: none;
    border-bottom: 1px solid var(--cms-line);
  }

  .speed-strip__cell {
    border-right: none;
    border-bottom: 1px solid var(--cms-line);
  }

  .speed-strip__cell:last-child {
    border-bottom: none;
  }

  .preview-panel {
    flex-direction: column;
    align-items: center;
  }

  .preview-device--desktop {
    width: 100%;
  }

  .preview-device__shell--mobile {
    width: 12rem;
  }

  .active-theme-card {
    display: grid;
    grid-template-columns: 6.4rem minmax(0, 1fr);
    align-items: start;
    padding: 1.2rem;
  }

  .active-theme-card__thumb { width: 6.4rem; }
  .active-theme-card__header { flex-wrap: wrap; }

  .active-theme-card__actions {
    grid-column: 1 / -1;
    width: 100%;
    justify-content: flex-end;
  }

  .version-row {
    flex-wrap: wrap;
  }

  .version-row__actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
