<template>
  <AdminPageHeader
    :title="siteStore.activeSiteName || t('admin.home.websiteFallback', 'Your website')"
    :description="roleDescription"
    alert-context="dashboard"
  >
    <template #actions>
      <NuxtLink
        v-if="authStore.user?.role === 'admin'"
        :to="adminUrl('/site')"
        class="cms-btn cms-btn--secondary"
      >
        {{ t('admin.home.siteHealth', 'Site health') }}
      </NuxtLink>
      <a
        v-if="publicSiteUrl"
        :href="publicSiteUrl"
        target="_blank"
        rel="noopener"
        class="cms-btn cms-btn--secondary"
      >
        {{ t('admin.home.viewLive', 'View live website') }}
        <span class="material-icons-outlined" aria-hidden="true">open_in_new</span>
      </a>
      <NuxtLink
        v-if="canEdit"
        :to="adminUrl('/editor')"
        class="cms-btn cms-btn--primary"
      >
        <span class="material-icons-outlined" aria-hidden="true">edit</span>
        {{ t('admin.home.editWebsite', 'Edit website') }}
      </NuxtLink>
    </template>
  </AdminPageHeader>

  <div class="home-section-heading">
    <span>{{ roleLabel }}</span>
    <h2>{{ t('admin.home.quickAccess', 'Quick access') }}</h2>
  </div>

  <div class="home-task-grid">
    <NuxtLink
      v-for="task in tasks"
      :key="task.id"
      :to="adminUrl(task.to!)"
      class="home-task"
    >
      <span class="material-icons-outlined home-task__icon" aria-hidden="true">{{ task.icon }}</span>
      <span class="home-task__copy">
        <strong>{{ adminNavLabel(task, t) }}</strong>
        <span>{{ task.description }}</span>
      </span>
      <span class="material-icons-outlined home-task__arrow" aria-hidden="true">arrow_forward</span>
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/admin/stores/authStore'
import { useSiteStore } from '~/admin/stores/siteStore'
import { useProgramStore } from '~/admin/stores/programStore'
import { useAdminUrl } from '~/admin/composables/useAdminUrl'
import { buildPublicSiteUrl } from '~/admin/utils/publicSiteUrl'
import { adminNavLabel, flattenNavForRole } from '~/admin/config/navigation'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'

definePageMeta({ layout: 'admin' })

const authStore = useAuthStore()
const siteStore = useSiteStore()
const programStore = useProgramStore()
const runtimeConfig = useRuntimeConfig()
const { adminUrl } = useAdminUrl()
const { t } = useAdminI18n()

const roleLabel = computed(() => {
  switch (authStore.user?.role) {
    case 'admin': return t('admin.roles.admin', 'Super admin')
    case 'editor': return t('admin.roles.editor', 'Content editor')
    case 'viewer': return t('admin.roles.viewer', 'Read-only access')
    case 'client': return t('admin.roles.client', 'Brand client')
    default: return 'Your access'
  }
})

const roleDescription = computed(() => {
  switch (authStore.user?.role) {
    case 'admin': return t('admin.home.adminDescription', 'Manage the website, its content, design, access, and publishing.')
    case 'editor': return t('admin.home.editorDescription', 'Create and maintain the content available to you.')
    case 'viewer': return t('admin.home.viewerDescription', 'You can review this website without changing it.')
    case 'client': return t('admin.home.clientDescription', 'Create approved brand assets for this website.')
    default: return t('admin.home.defaultDescription', 'Open one of the available areas below.')
  }
})

const canEdit = computed(() => ['admin', 'editor'].includes(authStore.user?.role || ''))

/**
 * Derived from the nav model (I1): every site-scoped destination this role may
 * see that opts in with a `description`. Role filtering already decides which
 * ones those are, so there is no second per-role list to keep in step.
 */
const tasks = computed(() =>
  flattenNavForRole(authStore.user?.role)
    .filter(item => item.description && !item.contextFree && item.id !== 'editor')
    .sort((a, b) => TASK_PRIORITY.indexOf(a.id) - TASK_PRIORITY.indexOf(b.id))
    .slice(0, 6),
)

const TASK_PRIORITY = ['pages', 'articles', 'blogs', 'media', 'brand-formats', 'publish']

const publicSiteUrl = computed(() => {
  return buildPublicSiteUrl({
    storedDomain: siteStore.activeSite?.domain,
    siteSlug: siteStore.activeSite?.slug,
    programSlug: programStore.activeProgram?.slug,
    baseDomain: runtimeConfig.public.cmsBaseDomain,
    protocol: import.meta.dev ? 'http:' : 'https:',
  })
})
</script>

<style scoped>
.home-section-heading {
  margin: 3.2rem 0 1.6rem;
}

.home-section-heading span {
  display: block;
  margin-bottom: 0.4rem;
  color: var(--cms-brand);
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.home-section-heading h2 {
  margin: 0;
  font-size: 1.8rem;
}

.home-task-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.2rem;
}

.home-task {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 1.4rem;
  min-height: 9rem;
  padding: 1.6rem;
  color: var(--cms-ink);
  border: 1px solid var(--cms-border);
  border-radius: var(--cms-radius-card);
  background: var(--cms-surface);
  box-shadow: var(--cms-shadow-sm);
  transition:
    border-color 120ms ease,
    box-shadow 120ms ease,
    transform 120ms ease;
}

.home-task:hover {
  color: var(--cms-ink);
  border-color: var(--cms-border-strong);
  box-shadow: 0 8px 24px rgba(23, 35, 27, 0.08);
  transform: translateY(-1px);
}

.home-task:active {
  transform: scale(0.992);
}

.home-task__icon {
  display: grid;
  width: 4.2rem;
  height: 4.2rem;
  place-items: center;
  color: var(--cms-brand);
  border-radius: 1rem;
  background: var(--cms-brand-soft);
}

.home-task__copy {
  display: grid;
  gap: 0.3rem;
}

.home-task__copy strong {
  font-size: 1.5rem;
}

.home-task__copy span {
  color: var(--cms-muted);
  font-size: 1.3rem;
}

.home-task__arrow {
  color: var(--cms-muted);
  font-size: 1.8rem;
}

@media (max-width: 767px) {
  .home-task-grid {
    grid-template-columns: 1fr;
  }
}
</style>
