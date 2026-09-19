<template>
  <AdminPageHeader
    :title="t('admin.domains.title', 'Domains')"
    :description="t('admin.domains.description', 'Manage the web addresses that open this website.')"
    alert-context="domains"
  />

  <div class="cms-alert cms-alert--info mb-4">
    <span class="material-icons-outlined cms-alert-icon">info</span>
    <div class="cms-alert-content">
      <div class="cms-alert-title">{{ t('admin.domains.connect', 'Connect a custom domain') }}</div>
      <div class="cms-alert-description">
        Add the hostname visitors should use, then configure the DNS record shown below.
        Certificates are provisioned automatically after ownership is verified.
      </div>
    </div>
  </div>

  <div v-if="providerConfigured === false" class="cms-alert cms-alert--warning mb-4" data-testid="provider-warning">
    <span class="material-icons-outlined cms-alert-icon">cloud_off</span>
    <div class="cms-alert-content">
      <div class="cms-alert-title">{{ t('admin.domains.notConfigured', 'Domain infrastructure is not configured yet') }}</div>
      <div class="cms-alert-description">
        You can reserve and verify DNS now. Certificate provisioning will remain pending until the AWS
        domain provider is connected.
      </div>
    </div>
  </div>

  <section class="cms-card domain-add-card mb-4" aria-labelledby="add-domain-title">
    <div class="cms-card__header">
      <h2 id="add-domain-title" class="cms-card__title">{{ t('admin.domains.add', 'Add a domain') }}</h2>
    </div>
    <div class="cms-card__body">
      <form class="domain-form" @submit.prevent="addDomain">
        <div class="cms-form-group domain-form__field mb-0">
          <label for="domain-hostname">{{ t('admin.domains.hostname', 'Hostname') }}</label>
          <input
            id="domain-hostname"
            v-model="newHostname"
            class="cms-form-control"
            :class="{ 'is-invalid': hostnameError }"
            type="text"
            inputmode="url"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            placeholder="www.example.com"
            :disabled="adding"
            aria-describedby="domain-hostname-help domain-hostname-error"
            @input="hostnameError = ''"
          />
          <p id="domain-hostname-help" class="cms-helper-text">
            {{ t('admin.domains.hostnameHint', 'Enter only the hostname, without https:// or a path.') }}
          </p>
          <p v-if="hostnameError" id="domain-hostname-error" class="cms-error-text" role="alert">
            {{ hostnameError }}
          </p>
        </div>
        <button class="cms-btn cms-btn--primary" type="submit" :disabled="adding || !newHostname.trim()">
          <span v-if="adding" class="cms-btn-spinner" />
          <span class="material-icons-outlined" aria-hidden="true">add</span>
          {{ adding ? 'Adding...' : 'Add domain' }}
        </button>
      </form>
    </div>
  </section>

  <div class="domains-heading">
    <div>
      <h2>{{ t('admin.domains.connected', 'Connected domains') }}</h2>
      <p v-if="!loading" class="domains-heading__count">
        {{ domains.length }} {{ domains.length === 1 ? 'domain' : 'domains' }}
      </p>
    </div>
    <button
      class="cms-btn cms-btn--secondary cms-btn--sm"
      type="button"
      :disabled="loading || refreshing"
      @click="fetchDomains(false)"
    >
      <span v-if="refreshing" class="cms-btn-spinner" />
      <span v-else class="material-icons-outlined" aria-hidden="true">refresh</span>
      {{ refreshing ? 'Refreshing...' : 'Refresh' }}
    </button>
  </div>

  <div v-if="loading" class="text-center py-5" aria-live="polite">
    <span class="cms-spinner cms-spinner--lg" />
    <p class="text-muted mt-3">{{ t('admin.domains.loading', 'Loading domains...') }}</p>
  </div>

  <div v-else-if="error" class="cms-alert cms-alert--danger">
    <span class="material-icons-outlined cms-alert-icon">error</span>
    <div class="cms-alert-content">
      <div class="cms-alert-title">{{ t('admin.domains.loadFailed', 'Failed to load domains') }}</div>
      <div class="cms-alert-description">{{ error }}</div>
    </div>
    <button class="cms-btn cms-btn--secondary cms-btn--sm" type="button" @click="fetchDomains()">
      Try again
    </button>
  </div>

  <div v-else-if="domains.length === 0" class="domains-empty cms-card">
    <div class="cms-card__body">
      <span class="material-icons-outlined" aria-hidden="true">language</span>
      <h3>{{ t('admin.domains.empty', 'No domains yet') }}</h3>
      <p>{{ t('admin.domains.emptyDescription', 'Add the first hostname visitors will use to reach this site.') }}</p>
    </div>
  </div>

  <div v-else class="domain-list" aria-live="polite">
    <article v-for="domain in sortedDomains" :key="domain.id" class="cms-card domain-card">
      <header class="cms-card__header domain-card__header">
        <div class="domain-identity">
          <span class="material-icons-outlined domain-identity__icon" aria-hidden="true">
            {{ domain.kind === 'platform' ? 'cloud' : 'language' }}
          </span>
          <div>
            <div class="domain-identity__name">{{ domain.hostname }}</div>
            <div class="domain-identity__badges">
              <span class="cms-badge cms-badge--neutral">
                {{ domain.kind === 'platform' ? 'Platform domain' : 'Custom domain' }}
              </span>
              <span v-if="domain.isPrimary" class="cms-badge cms-badge--success">
                Primary
              </span>
            </div>
          </div>
        </div>
        <span class="cms-badge" :class="statusClass(domain.status)">
          {{ statusLabel(domain.status) }}
        </span>
      </header>

      <div class="cms-card__body domain-card__body">
        <dl class="status-grid">
          <div class="status-grid__item">
            <dt>DNS</dt>
            <dd><span class="cms-badge" :class="statusClass(domain.dnsStatus)">{{ statusLabel(domain.dnsStatus) }}</span></dd>
          </div>
          <div class="status-grid__item">
            <dt>{{ t('admin.domains.provider', 'Provider') }}</dt>
            <dd><span class="cms-badge" :class="statusClass(domain.providerStatus)">{{ statusLabel(domain.providerStatus) }}</span></dd>
          </div>
          <div class="status-grid__item">
            <dt>{{ t('admin.domains.certificate', 'TLS certificate') }}</dt>
            <dd><span class="cms-badge" :class="statusClass(domain.sslStatus)">{{ statusLabel(domain.sslStatus) }}</span></dd>
          </div>
        </dl>

        <div v-if="domain.kind === 'custom'" class="dns-panel">
          <div class="dns-panel__heading">
            <span class="material-icons-outlined" aria-hidden="true">settings_ethernet</span>
            <strong>{{ t('admin.domains.dnsConfiguration', 'DNS configuration') }}</strong>
          </div>
          <template v-if="targetFor(domain)">
            <p>Create this record with your DNS provider:</p>
            <dl class="dns-record">
              <div>
                <dt>Type</dt>
                <dd><code>CNAME</code></dd>
              </div>
              <div>
                <dt>Name</dt>
                <dd><code>{{ domain.hostname }}</code></dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd><code>{{ targetFor(domain) }}</code></dd>
              </div>
            </dl>
            <p class="dns-panel__note">
              For an apex domain, use your provider's ALIAS or ANAME equivalent when CNAME records are not supported.
            </p>
          </template>
          <p v-else class="dns-panel__pending">
            The DNS target will appear here when the domain infrastructure is configured.
          </p>
        </div>

        <div v-if="domain.lastError" class="cms-alert cms-alert--danger domain-error" role="alert">
          <span class="material-icons-outlined cms-alert-icon">error</span>
          <div class="cms-alert-content">
            <div class="cms-alert-title">Domain setup needs attention</div>
            <div class="cms-alert-description">{{ domain.lastError }}</div>
          </div>
        </div>
      </div>

      <footer v-if="domain.kind === 'custom'" class="cms-card__footer domain-actions">
        <button
          v-if="domain.status !== 'active'"
          class="cms-btn cms-btn--secondary cms-btn--sm"
          type="button"
          :disabled="isDomainBusy(domain.id)"
          @click="verifyDomain(domain)"
        >
          <span v-if="isBusy(domain.id, 'verify')" class="cms-btn-spinner" />
          <span v-else class="material-icons-outlined" aria-hidden="true">verified_user</span>
          {{ isBusy(domain.id, 'verify') ? 'Checking...' : 'Verify DNS' }}
        </button>
        <button
          v-if="!domain.isPrimary"
          class="cms-btn cms-btn--secondary cms-btn--sm"
          type="button"
          :disabled="isDomainBusy(domain.id) || domain.status !== 'active'"
          :title="domain.status !== 'active' ? 'The domain must be active before it can be primary' : undefined"
          @click="makePrimary(domain)"
        >
          <span v-if="isBusy(domain.id, 'primary')" class="cms-btn-spinner" />
          <span v-else class="material-icons-outlined" aria-hidden="true">star</span>
          {{ isBusy(domain.id, 'primary') ? 'Updating...' : 'Make primary' }}
        </button>
        <button
          class="cms-btn cms-btn--danger-quiet cms-btn--sm domain-actions__delete"
          type="button"
          :disabled="isDomainBusy(domain.id)"
          @click="removeDomain(domain)"
        >
          <span v-if="isBusy(domain.id, 'delete')" class="cms-btn-spinner" />
          <span v-else class="material-icons-outlined" aria-hidden="true">delete</span>
          {{ isBusy(domain.id, 'delete') ? 'Removing...' : 'Remove' }}
        </button>
      </footer>
    </article>
  </div>
</template>

<script setup lang="ts">
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { useAlertStore } from '~/admin/stores/alertStore'
import { useSite } from '~/admin/composables/useSite'
import { useSiteApi } from '~/admin/composables/useSiteApi'
import { useConfirmAction } from '~/admin/composables/useConfirmAction'

definePageMeta({ layout: 'admin' })
const { t } = useAdminI18n()

interface SiteDomain {
  id: string
  hostname: string
  kind: 'platform' | 'custom' | string
  isPrimary: boolean
  status?: string | null
  dnsStatus?: string | null
  providerStatus?: string | null
  sslStatus?: string | null
  dnsTarget?: string | null
  lastError?: string | null
}

interface DomainsResponse {
  domains: SiteDomain[]
  dnsTarget?: string | null
  providerConfigured: boolean
}

type DomainAction = 'verify' | 'primary' | 'delete'

const { siteId, hasSite } = useSite()
const { siteFetch } = useSiteApi()
const alertStore = useAlertStore()
const confirmAction = useConfirmAction()

const domains = ref<SiteDomain[]>([])
const dnsTarget = ref<string | null>(null)
const providerConfigured = ref<boolean | null>(null)
const loading = ref(true)
const refreshing = ref(false)
const adding = ref(false)
const error = ref('')
const newHostname = ref('')
const hostnameError = ref('')
const busy = ref<{ domainId: string; action: DomainAction } | null>(null)
let fetchSequence = 0

const sortedDomains = computed(() => [...domains.value].sort((a, b) => {
  if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
  if (a.kind !== b.kind) return a.kind === 'platform' ? -1 : 1
  return a.hostname.localeCompare(b.hostname)
}))

onMounted(async () => {
  if (hasSite.value) await fetchDomains()
})

watch(siteId, (newId) => {
  domains.value = []
  newHostname.value = ''
  hostnameError.value = ''
  providerConfigured.value = null
  dnsTarget.value = null
  if (newId) fetchDomains()
})

async function fetchDomains(showLoader = true) {
  if (!hasSite.value) return
  const sequence = ++fetchSequence
  if (showLoader) loading.value = true
  else refreshing.value = true
  error.value = ''

  try {
    const data = await siteFetch<DomainsResponse>('/domains')
    if (sequence !== fetchSequence) return
    domains.value = data.domains || []
    dnsTarget.value = data.dnsTarget || null
    providerConfigured.value = data.providerConfigured
  } catch (e: any) {
    if (sequence !== fetchSequence) return
    error.value = apiError(e, 'Could not load domains.')
  } finally {
    if (sequence === fetchSequence) {
      loading.value = false
      refreshing.value = false
    }
  }
}

async function addDomain() {
  const hostname = newHostname.value.trim().toLowerCase().replace(/\.$/, '')
  hostnameError.value = validateHostname(hostname)
  if (hostnameError.value) return

  adding.value = true
  alertStore.clearContext('domains')
  try {
    await siteFetch('/domains', {
      method: 'POST',
      body: { hostname },
    })
    newHostname.value = ''
    alertStore.success(
      'Domain added.',
      providerConfigured.value === false
        ? 'The hostname is reserved. Configure DNS now; TLS will remain pending until the AWS provider is connected.'
        : 'Configure the DNS record below, then verify the domain.',
      'domains',
    )
    await fetchDomains(false)
  } catch (e: any) {
    const message = apiError(e, 'Could not add this domain.')
    hostnameError.value = message
    alertStore.danger('Domain could not be added.', message, 'domains')
  } finally {
    adding.value = false
  }
}

async function verifyDomain(domain: SiteDomain) {
  await runDomainAction(domain, 'verify', `/domains/${domain.id}/verify`, 'Domain status refreshed.')
}

async function makePrimary(domain: SiteDomain) {
  await runDomainAction(domain, 'primary', `/domains/${domain.id}/primary`, `${domain.hostname} is now the primary domain.`)
}

async function removeDomain(domain: SiteDomain) {
  const primaryWarning = domain.isPrimary
    ? ' The platform domain will become primary.'
    : ''
  const accepted = await confirmAction.confirm({
    title: `Remove ${domain.hostname}?`,
    description: `Visitors will no longer reach this website through the hostname.${primaryWarning}`,
    confirmLabel: 'Remove domain',
    tone: 'danger',
  })
  if (!accepted) return

  await runDomainAction(domain, 'delete', `/domains/${domain.id}`, `${domain.hostname} was removed.`, 'DELETE')
}

async function runDomainAction(
  domain: SiteDomain,
  action: DomainAction,
  path: string,
  successMessage: string,
  method: 'POST' | 'DELETE' = 'POST',
) {
  busy.value = { domainId: domain.id, action }
  alertStore.clearContext('domains')
  try {
    await siteFetch(path, { method })
    alertStore.success(successMessage, undefined, 'domains')
    await fetchDomains(false)
  } catch (e: any) {
    alertStore.danger(
      action === 'verify' ? 'Verification failed.' : 'Domain update failed.',
      apiError(e, 'Could not update this domain.'),
      'domains',
    )
  } finally {
    busy.value = null
  }
}

function validateHostname(hostname: string): string {
  if (!hostname) return 'Enter a hostname.'
  if (hostname.includes('://') || hostname.includes('/') || hostname.includes(':')) {
    return 'Enter only a hostname, for example www.example.com.'
  }
  if (/\s/.test(hostname) || !hostname.includes('.')) {
    return 'Enter a valid fully qualified hostname.'
  }
  return ''
}

function targetFor(domain: SiteDomain): string | null {
  return domain.dnsTarget || dnsTarget.value
}

function isBusy(domainId: string, action: DomainAction): boolean {
  return busy.value?.domainId === domainId && busy.value.action === action
}

function isDomainBusy(domainId: string): boolean {
  return busy.value?.domainId === domainId
}

function statusLabel(status?: string | null): string {
  if (!status) return 'Not started'
  return status
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase())
}

function statusClass(status?: string | null): string {
  const normalized = status?.toLowerCase() || ''
  if (['active', 'verified', 'ready', 'issued', 'deployed', 'success'].includes(normalized)) {
    return 'cms-badge--success'
  }
  if (['error', 'failed', 'blocked', 'invalid', 'expired'].includes(normalized)) {
    return 'cms-badge--danger'
  }
  if (normalized.includes('pending') || ['provisioning', 'initializing', 'validating'].includes(normalized)) {
    return 'cms-badge--warning'
  }
  return 'cms-badge--neutral'
}

function apiError(errorValue: any, fallback: string): string {
  return errorValue?.data?.statusMessage
    || errorValue?.data?.message
    || errorValue?.message
    || fallback
}
</script>

<style lang="scss" scoped>
@use '~/admin/assets/scss/variables' as *;

.domain-add-card {
  max-width: 82rem;
}

.domain-form {
  display: flex;
  align-items: flex-start;
  gap: 1.2rem;
}

.domain-form__field {
  flex: 1;
}

.domains-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  margin: 3rem 0 1.5rem;

  h2 {
    margin: 0;
    font-size: 1.8rem;
    font-weight: 600;
  }
}

.domains-heading__count {
  margin: 0.3rem 0 0;
  color: $text-light-color;
  font-size: 1.2rem;
}

.domain-list {
  display: grid;
  gap: 1.5rem;
}

.domain-card {
  overflow: hidden;
}

.domain-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem;
}

.domain-identity {
  display: flex;
  align-items: flex-start;
  min-width: 0;
  gap: 1.2rem;
}

.domain-identity__icon {
  flex: 0 0 auto;
  margin-top: 0.1rem;
  color: $primary-color;
  font-size: 2.4rem;
}

.domain-identity__name {
  overflow-wrap: anywhere;
  color: $text-color;
  font-size: 1.6rem;
  font-weight: 600;
}

.domain-identity__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.7rem;
}

.domain-card__body {
  display: grid;
  gap: 1.5rem;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  margin: 0;
}

.status-grid__item {
  padding: 1.2rem;
  border: 1px solid $borders-color;
  border-radius: 0.2rem;
  background: $tree-nav-bg;

  dt {
    margin-bottom: 0.7rem;
    color: $text-light-color;
    font-size: 1.1rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  dd {
    margin: 0;
  }
}

.dns-panel {
  padding: 1.4rem;
  border: 1px dashed $dashed-border;
  border-radius: 0.2rem;
  background: $tree-nav-bg;

  p {
    margin: 1rem 0;
  }
}

.dns-panel__heading {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  color: $text-color;

  .material-icons-outlined {
    color: $primary-color;
    font-size: 2rem;
  }
}

.dns-record {
  display: grid;
  grid-template-columns: 9rem 1fr;
  margin: 0;
  border-top: 1px solid $borders-color;

  div {
    display: contents;
  }

  dt,
  dd {
    margin: 0;
    padding: 0.9rem 0;
    border-bottom: 1px solid $borders-color;
  }

  dt {
    color: $text-light-color;
    font-size: 1.2rem;
    font-weight: 600;
  }

  dd {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  code {
    color: $text-color;
    font-size: 1.2rem;
  }
}

.dns-panel__note,
.dns-panel__pending {
  margin-bottom: 0 !important;
  color: $text-light-color;
  font-size: 1.15rem;
}

.domain-error {
  margin: 0;
}

.domain-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
}

.domain-actions__delete {
  margin-left: auto;
}

.domains-empty {
  color: $text-light-color;
  text-align: center;

  .cms-card__body {
    padding: 4rem 2rem;
  }

  .material-icons-outlined {
    font-size: 4rem;
  }

  h3 {
    margin: 1rem 0 0.5rem;
    color: $text-color;
    font-weight: 600;
  }

  p {
    margin: 0;
  }
}

@media (max-width: 767px) {
  .domain-form {
    flex-direction: column;
  }

  .domain-form__field,
  .domain-form .cms-btn {
    width: 100%;
  }

  .status-grid {
    grid-template-columns: 1fr;
  }

  .dns-record {
    grid-template-columns: 7rem 1fr;
  }

  .domain-actions .cms-btn,
  .domain-actions__delete {
    width: 100%;
    margin-left: 0;
  }
}
</style>
