<template>
  <div class="api-panel">
    <!-- Loading -->
    <div v-if="store.loading" class="api-panel__loading">{{ t('admin.data.loading', 'Loading API configuration…') }}</div>

    <template v-else>
      <!-- ═══════════ API Sources ═══════════ -->
      <div class="api-panel__section">
        <h3 class="api-panel__section-title">{{ t('admin.data.sources', 'API sources') }}</h3>
        <p class="api-panel__section-desc">
          Define backend APIs that requests can target. Each source has a name and base URL.
        </p>

        <div v-if="store.sources.length === 0 && !store.editingSource" class="api-panel__empty">
          <p>{{ t('admin.data.noSources', 'No API sources configured. Requests will use relative URLs.') }}</p>
        </div>

        <div v-else class="api-panel__sources">
          <div
            v-for="source in store.sources"
            :key="source.id"
            class="api-panel__source-card"
          >
            <span
              v-if="source.color"
              class="api-panel__source-dot"
              :style="{ background: source.color }"
            ></span>
            <span v-else class="api-panel__source-dot api-panel__source-dot--default"></span>
            <div class="api-panel__source-info">
              <span class="api-panel__source-name">{{ source.name }}</span>
              <span class="api-panel__source-url">{{ source.baseUrl }}</span>
            </div>
            <span class="api-panel__source-count">
              {{ requestCountForSource(source.id) }} requests
            </span>
            <button
              class="api-panel__icon-btn"
              title="Edit source"
              @click="store.startEditingSource(source)"
            >
              Edit
            </button>
            <button
              class="api-panel__icon-btn api-panel__icon-btn--danger"
              title="Delete source"
              @click="confirmDeleteSource(source)"
            >
              &times;
            </button>
          </div>
        </div>

        <!-- Add/Edit Source Form -->
        <div v-if="store.editingSource" class="api-panel__source-form">
          <div class="api-panel__source-form-row">
            <input
              v-model="store.editingSource.name"
              type="text"
              placeholder="Source name (e.g. Shop API)"
              class="api-panel__input"
            />
            <input
              v-model="store.editingSource.color"
              type="color"
              class="api-panel__color-input"
              title="Color"
            />
          </div>
          <input
            v-model="store.editingSource.baseUrl"
            type="text"
            placeholder="Base URL (e.g. https://api.example.com/v1)"
            class="api-panel__input"
          />
          <div class="api-panel__source-form-actions">
            <button class="api-panel__btn api-panel__btn--primary" @click="store.saveEditingSource()">
              {{ store.editingSource.id ? 'Update' : 'Add' }} Source
            </button>
            <button class="api-panel__btn" @click="store.cancelEditingSource()">{{ t('admin.shared.cancel', 'Cancel') }}</button>
          </div>
        </div>

        <button
          v-if="!store.editingSource"
          class="api-panel__add-btn"
          @click="store.startEditingSource()"
        >
          + Add Source
        </button>
      </div>

      <div class="api-panel__divider"></div>

      <!-- ═══════════ Headers ═══════════ -->
      <div class="api-panel__section">
        <h3 class="api-panel__section-title">{{ t('admin.data.headers', 'Headers') }}</h3>

        <div v-if="store.headers.length === 0 && !store.editingHeader" class="api-panel__empty">
          <p>{{ t('admin.data.noHeaders', 'No headers configured.') }}</p>
        </div>

        <div v-else class="api-panel__headers">
          <div
            v-for="(header, index) in store.headers"
            :key="index"
            class="api-panel__header-row"
          >
            <span class="api-panel__header-key">{{ header.key }}</span>
            <span class="api-panel__header-value">{{ header.value }}</span>
            <button
              class="api-panel__icon-btn"
              title="Edit header"
              @click="store.startEditingHeader(index)"
            >
              Edit
            </button>
            <button
              class="api-panel__icon-btn api-panel__icon-btn--danger"
              title="Delete header"
              @click="deleteHeader(index)"
            >
              &times;
            </button>
          </div>
        </div>

        <!-- Add/Edit Header Form -->
        <div v-if="store.editingHeader" class="api-panel__header-form">
          <input
            v-model="headerKey"
            type="text"
            placeholder="Header name (e.g. authorization)"
            class="api-panel__input"
          />
          <input
            v-model="headerValue"
            type="text"
            placeholder="Header value (e.g. Bearer )"
            class="api-panel__input"
          />
          <button class="api-panel__btn api-panel__btn--primary" @click="saveHeader">
            {{ store.editingHeader.index === -1 ? 'Add' : 'Update' }}
          </button>
          <button class="api-panel__btn" @click="store.cancelEditingHeader()">{{ t('admin.shared.cancel', 'Cancel') }}</button>
        </div>

        <button
          v-if="!store.editingHeader"
          class="api-panel__add-btn"
          @click="startAddHeader"
        >
          + Add Header
        </button>
      </div>

      <div class="api-panel__divider"></div>

      <!-- ═══════════ Requests by Source ═══════════ -->
      <div class="api-panel__section">
        <h3 class="api-panel__section-title">{{ t('admin.data.requests', 'Requests') }}</h3>

        <!-- Default / unassigned group -->
        <TGroup
          v-if="store.requestsBySource['__default__']?.length > 0"
          :label="`Default (${store.requestsBySource['__default__'].length})`"
          collapsible
        >
          <div class="api-panel__requests">
            <div
              v-for="request in store.requestsBySource['__default__']"
              :key="request.id"
              class="api-panel__request-item"
              :class="{ 'api-panel__request-item--selected': store.selectedRequestId === request.id }"
              @click="store.selectRequest(request.id)"
            >
              <span class="api-panel__request-method" :class="methodClass(request.method)">{{ request.method }}</span>
              <span class="api-panel__request-name">{{ request.name }}</span>
              <span class="api-panel__request-endpoint">{{ request.endpoint }}</span>
            </div>
          </div>
        </TGroup>

        <!-- Source groups -->
        <TGroup
          v-for="source in store.sources"
          :key="source.id"
          :label="`${source.name} (${(store.requestsBySource[source.id] || []).length})`"
          collapsible
        >
          <template #default>
            <div class="api-panel__source-group-header">
              <span
                v-if="source.color"
                class="api-panel__source-dot"
                :style="{ background: source.color }"
              ></span>
              <code class="api-panel__source-group-url">{{ source.baseUrl }}</code>
            </div>
            <div class="api-panel__requests">
              <div
                v-for="request in (store.requestsBySource[source.id] || [])"
                :key="request.id"
                class="api-panel__request-item"
                :class="{ 'api-panel__request-item--selected': store.selectedRequestId === request.id }"
                @click="store.selectRequest(request.id)"
              >
                <span class="api-panel__request-method" :class="methodClass(request.method)">{{ request.method }}</span>
                <span class="api-panel__request-name">{{ request.name }}</span>
                <span class="api-panel__request-endpoint">{{ request.endpoint }}</span>
              </div>
            </div>
            <button class="api-panel__add-btn api-panel__add-btn--small" @click="addNewRequest(source.id)">
              + Add Request
            </button>
          </template>
        </TGroup>

        <button class="api-panel__add-btn" @click="addNewRequest(undefined)">
          + Add Request (Default)
        </button>
      </div>

      <!-- ═══════════ Selected Request Detail ═══════════ -->
      <div v-if="store.selectedRequest" class="api-panel__request-detail">
        <div class="api-panel__divider"></div>
        <h3 class="api-panel__section-title">{{ store.selectedRequest.name || 'Request Details' }}</h3>

        <div class="api-panel__form-row">
          <div class="api-panel__form-group api-panel__form-group--grow">
            <label>{{ t('admin.data.name', 'Name') }}</label>
            <input
              :value="store.selectedRequest.name"
              type="text"
              class="api-panel__input"
              @input="updateRequestField('name', ($event.target as HTMLInputElement).value)"
            />
          </div>

          <div class="api-panel__form-group">
            <label>{{ t('admin.data.method', 'Method') }}</label>
            <select
              :value="store.selectedRequest.method"
              class="api-panel__select"
              @change="updateRequestField('method', ($event.target as HTMLSelectElement).value)"
            >
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
              <option>DELETE</option>
              <option>PATCH</option>
            </select>
          </div>

          <div class="api-panel__form-group">
            <label>{{ t('admin.data.source', 'Source') }}</label>
            <select
              :value="store.selectedRequest.sourceId || ''"
              class="api-panel__select"
              @change="updateRequestField('sourceId', ($event.target as HTMLSelectElement).value || null)"
            >
              <option value="">{{ t('admin.data.default', 'Default') }}</option>
              <option
                v-for="source in store.sources"
                :key="source.id"
                :value="source.id"
              >
                {{ source.name }}
              </option>
            </select>
          </div>
        </div>

        <div class="api-panel__form-group">
          <label>{{ t('admin.data.endpoint', 'Endpoint') }}</label>
          <input
            ref="endpointRef"
            :value="store.selectedRequest.endpoint"
            type="text"
            class="api-panel__input"
            placeholder="/api/endpoint"
            @input="updateRequestField('endpoint', ($event.target as HTMLInputElement).value)"
          />
          <VarTagPicker
            :env-keys="envKeys"
            :header-keys="headerKeys"
            @insert="insertTag(endpointRef, $event)"
          />
        </div>

        <div class="api-panel__form-group">
          <label>{{ t('admin.data.parameters', 'Parameters') }}</label>
          <TParamMapEditor
            :model-value="parametersValue"
            @update:model-value="parametersValue = $event"
          />
        </div>

        <div class="api-panel__form-group">
          <label>{{ t('admin.data.extraParams', 'Extra parameters') }}</label>
          <div class="api-panel__kv-editor">
            <div
              v-for="(pair, i) in extraParamsPairs"
              :key="i"
              class="api-panel__kv-row"
            >
              <input
                v-model="pair.key"
                placeholder="key"
                class="api-panel__input api-panel__input--kv"
              />
              <span class="api-panel__kv-sep">:</span>
              <input
                v-model="pair.value"
                placeholder="value"
                class="api-panel__input api-panel__input--kv"
                @focus="lastEpFocus = i"
              />
              <button class="api-panel__kv-del" @click="extraParamsPairs.splice(i, 1)">&times;</button>
            </div>
            <div class="api-panel__kv-footer">
              <button class="api-panel__add-kv" @click="extraParamsPairs.push({ key: '', value: '' })">+ {{ t('admin.data.addParam', 'Add parameter') }}</button>
              <VarTagPicker
                :env-keys="envKeys"
                :header-keys="[]"
                @insert="insertIntoLastEp($event)"
              />
            </div>
          </div>
        </div>

        <div class="api-panel__form-group">
          <label>{{ t('admin.data.requestHeaders', 'Request headers') }} <span class="api-panel__field-hint">({{ t('admin.data.onePerLine', 'one per line') }})</span></label>
          <textarea
            v-model="requestHeadersText"
            class="api-panel__textarea"
            rows="2"
            placeholder="authorization"
          />
          <VarTagPicker
            :env-keys="[]"
            :header-keys="headerKeys"
            @insert="appendLine(requestHeadersText, v => requestHeadersText = v, $event)"
          />
        </div>

        <div class="api-panel__form-group">
          <label>{{ t('admin.data.responseContract', 'Response contract') }}</label>
          <div class="api-panel__kv-editor">
            <div
              v-for="(pair, i) in contractPairs"
              :key="i"
              class="api-panel__kv-row"
            >
              <input
                v-model="pair.key"
                placeholder="response path (e.g. auth.token)"
                class="api-panel__input api-panel__input--kv"
              />
              <span class="api-panel__kv-sep">&rarr;</span>
              <input
                v-model="pair.value"
                placeholder="localStorage key"
                class="api-panel__input api-panel__input--kv"
              />
              <button class="api-panel__kv-del" @click="contractPairs.splice(i, 1)">&times;</button>
            </div>
            <button class="api-panel__add-kv" @click="contractPairs.push({ key: '', value: '' })">+ {{ t('admin.data.addMapping', 'Add mapping') }}</button>
          </div>
        </div>

        <div class="api-panel__form-group">
          <label>{{ t('admin.data.tags', 'Tags') }}</label>
          <div class="api-panel__tags">
            <span
              v-for="(tag, i) in tagsValue"
              :key="tag"
              class="api-panel__tag"
            >
              {{ tag }}
              <button class="api-panel__tag-remove" @click="removeTag(i)">&times;</button>
            </span>
            <select
              v-if="availableTags.length"
              class="api-panel__select api-panel__select--tag"
              @change="addTagFromSelect($event)"
            >
              <option value="">+ {{ t('admin.data.addTag', 'Add tag…') }}</option>
              <optgroup v-if="componentTagOptions.length" label="Component">
                <option v-for="t in componentTagOptions" :key="'c-'+t.tag" :value="t.tag">
                  {{ t.tag }} — {{ t.usedBy }}
                </option>
              </optgroup>
              <optgroup v-if="pageTagOptions.length" label="Page">
                <option v-for="t in pageTagOptions" :key="'p-'+t" :value="t">{{ t }}</option>
              </optgroup>
            </select>
          </div>
        </div>

        <div class="api-panel__request-actions">
          <button
            class="api-panel__btn api-panel__btn--danger"
            @click="deleteRequest"
          >
            Delete Request
          </button>
        </div>
      </div>

      <!-- ═══════════ Save ═══════════ -->
      <div class="api-panel__footer">
        <button
          class="api-panel__save"
          :disabled="store.saving"
          @click="saveConfig"
        >
          {{ store.saving ? 'Saving...' : 'Save API Config' }}
        </button>
      </div>
    </template>

    <!-- Error -->
    <div v-if="store.error" class="api-panel__error">
      {{ store.error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { ref, computed, watch, nextTick } from 'vue'
import { useApiConfigStore } from '~/admin/stores/apiConfigStore'
import { useEditorStore } from '~/admin/stores/editorStore'
import { useEnvVariablesStore } from '~/admin/stores/envVariablesStore'
import type { ApiHeader, ApiRequest, ApiSource } from '~/server/storage/types'
import VarTagPicker from '~/admin/components/editor/VarTagPicker.vue'
import TGroup from '~/admin/components/fields/TGroup.vue'
import TParamMapEditor from '~/admin/components/fields/TParamMapEditor.vue'

const store = useApiConfigStore()
const { t } = useAdminI18n()
const editorStore = useEditorStore()
const envStore = useEnvVariablesStore()

if (!envStore.loading && Object.keys(envStore.variables).length === 0) {
  envStore.fetchVariables()
}

// Ref for endpoint input (supports tag insertion)
const endpointRef = ref<HTMLInputElement | null>(null)

// Local state for request body fields
const parametersValue = ref<Record<string, string>>({})
const extraParamsPairs = ref<{ key: string; value: string }[]>([])
const requestHeadersText = ref('')
const contractPairs = ref<{ key: string; value: string }[]>([])
const tagsValue = ref<string[]>([])

/**
 * Derive the tag vocabulary from the theme's block schemas.
 * Scans every field of type "api-method" for `allowedTags` and groups them
 * into component tags (from block schemas) and page tags (from page meta schemas).
 *
 * Returns { component: Map<tag, componentNames[]>, page: Set<tag> }
 */
const tagVocabulary = computed(() => {
  const componentTags = new Map<string, string[]>()
  const pageTags = new Set<string>()

  for (const [blockType, schema] of Object.entries(editorStore.schemas)) {
    if (!schema.settings) continue
    for (const field of schema.settings) {
      const f = field as any
      if (f.type === 'api-method' && Array.isArray(f.allowedTags)) {
        for (const tag of f.allowedTags) {
          const label = typeof schema.label === 'string'
            ? schema.label
            : schema.label?.['en-US'] ?? blockType
          const existing = componentTags.get(tag)
          if (existing) {
            if (!existing.includes(label)) existing.push(label)
          } else {
            componentTags.set(tag, [label])
          }
        }
      }
      // Page-level tags: fields with id containing 'prefetch' or 'page'
      if (f.type === 'api-method' && f.id?.startsWith('prefetch') && Array.isArray(f.allowedTags)) {
        for (const tag of f.allowedTags) pageTags.add(tag)
      }
    }
  }

  return { componentTags, pageTags }
})

// Split tags into component and page groups, excluding already-assigned ones
const componentTagOptions = computed(() => {
  const result: { tag: string; usedBy: string }[] = []
  for (const [tag, components] of tagVocabulary.value.componentTags.entries()) {
    if (!tagsValue.value.includes(tag)) {
      result.push({ tag, usedBy: components.join(', ') })
    }
  }
  return result
})

const pageTagOptions = computed(() => {
  return [...tagVocabulary.value.pageTags].filter(t =>
    !tagsValue.value.includes(t) && !tagVocabulary.value.componentTags.has(t),
  )
})

// All available tags (used for v-if on the select)
const availableTags = computed(() => [
  ...componentTagOptions.value.map(t => t.tag),
  ...pageTagOptions.value,
])

// Track which extraParams value input was last focused (for VarTagPicker insertion)
let lastEpFocus = -1

watch(() => store.selectedRequestId, () => {
  const req = store.selectedRequest
  const body = (req?.body || {}) as Record<string, any>
  // Normalize parameters to Record<string, string> (convert legacy string[] on load)
  if (body.parameters) {
    if (Array.isArray(body.parameters)) {
      // Legacy string[] → convert to Record where key=value (identical mapping)
      const map: Record<string, string> = {}
      for (const key of body.parameters) map[key] = key
      parametersValue.value = map
    } else {
      parametersValue.value = body.parameters
    }
  } else {
    parametersValue.value = {}
  }
  extraParamsPairs.value = body.extraParams
    ? Object.entries(body.extraParams as Record<string, any>).map(([k, v]) => ({ key: k, value: String(v) }))
    : []
  requestHeadersText.value = Array.isArray(body.requestHeaders) ? body.requestHeaders.join('\n') : ''
  contractPairs.value = req?.contract
    ? Object.entries(req.contract).map(([k, v]) => ({ key: k, value: v }))
    : []
  tagsValue.value = Array.isArray(body.tags) ? [...body.tags] : []
}, { immediate: true })

function addTagFromSelect(event: Event) {
  const select = event.target as HTMLSelectElement
  const tag = select.value
  if (tag && !tagsValue.value.includes(tag)) {
    tagsValue.value.push(tag)
  }
  select.value = '' // Reset to placeholder
}

function removeTag(index: number) {
  tagsValue.value.splice(index, 1)
}

// Available variable keys
const envKeys = computed(() => Object.keys(envStore.variables))
const headerKeys = computed(() => store.headerOptions)

// Header editing state
const headerKey = ref('')
const headerValue = ref('')

watch(() => store.editingHeader, (editing) => {
  if (editing) {
    headerKey.value = editing.key
    headerValue.value = editing.value
  }
})

// ─── Source helpers ───

function requestCountForSource(sourceId: string): number {
  return store.requests.filter(r => r.sourceId === sourceId).length
}

function confirmDeleteSource(source: ApiSource) {
  const count = requestCountForSource(source.id)
  const msg = count > 0
    ? `Delete source "${source.name}"? ${count} request(s) will be moved to Default.`
    : `Delete source "${source.name}"?`
  if (confirm(msg)) {
    store.deleteSource(source.id)
  }
}

// ─── Method badge color helper ───

function methodClass(method: string): string {
  switch (method) {
    case 'GET': return 'api-panel__request-method--get'
    case 'POST': return 'api-panel__request-method--post'
    case 'PUT': return 'api-panel__request-method--put'
    case 'DELETE': return 'api-panel__request-method--delete'
    case 'PATCH': return 'api-panel__request-method--patch'
    default: return ''
  }
}

// ─── Header helpers ───

function startAddHeader() {
  store.startAddingHeader()
  headerKey.value = ''
  headerValue.value = ''
}

function saveHeader() {
  if (!headerKey.value.trim()) return

  const header: ApiHeader = {
    key: headerKey.value.trim(),
    value: headerValue.value,
  }

  if (store.editingHeader!.index === -1) {
    store.addHeader(header)
  } else {
    store.updateHeader(store.editingHeader!.index, header)
  }
  store.cancelEditingHeader()
}

function deleteHeader(index: number) {
  if (confirm('Delete this header?')) {
    store.deleteHeader(index)
  }
}

// ─── Request helpers ───

function addNewRequest(sourceId?: string) {
  const id = `req-${Date.now()}`
  const request: ApiRequest = {
    id,
    name: 'New Request',
    method: 'POST',
    endpoint: '',
    sourceId: sourceId ?? undefined,
    body: {},
    contract: {},
  }
  store.addRequest(request)
  store.selectRequest(id)
}

function updateRequestField(field: string, value: any) {
  if (!store.selectedRequest) return
  store.updateRequest(store.selectedRequest.id, {
    ...store.selectedRequest,
    [field]: value,
  })
}

function deleteRequest() {
  if (!store.selectedRequest) return
  if (confirm(`Delete request "${store.selectedRequest.name}"?`)) {
    store.deleteRequest(store.selectedRequest.id)
  }
}

function insertIntoLastEp(tag: string) {
  if (lastEpFocus < 0 || lastEpFocus >= extraParamsPairs.value.length) return
  const el = document.activeElement as HTMLInputElement | null
  const pair = extraParamsPairs.value[lastEpFocus]
  const current = pair.value
  const start = el?.selectionStart ?? current.length
  const end = el?.selectionEnd ?? start
  pair.value = current.slice(0, start) + tag + current.slice(end)
  nextTick(() => {
    el?.focus()
    el?.setSelectionRange(start + tag.length, start + tag.length)
  })
}

function insertTag(inputRef: HTMLInputElement | null, tag: string) {
  if (!inputRef || !store.selectedRequest) return
  const start = inputRef.selectionStart ?? store.selectedRequest.endpoint.length
  const end = inputRef.selectionEnd ?? start
  const current = store.selectedRequest.endpoint
  updateRequestField('endpoint', current.slice(0, start) + tag + current.slice(end))
  nextTick(() => {
    inputRef.focus()
    inputRef.setSelectionRange(start + tag.length, start + tag.length)
  })
}

function parseLines(text: string): string[] {
  return text.split(/[\n,]/).map(s => s.trim()).filter(Boolean)
}

function appendLine(current: string, setter: (v: string) => void, tag: string) {
  const key = tag.replace(/^\{\{/, '').replace(/\}\}$/, '')
  const trimmed = current.trimEnd()
  setter(trimmed ? `${trimmed}\n${key}` : key)
}

function coerceValue(v: string): any {
  if (v === 'true') return true
  if (v === 'false') return false
  if (v.trim() !== '' && !v.includes('{{') && !isNaN(Number(v))) return Number(v)
  return v
}

function saveConfig() {
  const selectedId = store.selectedRequest?.id
  const requestsToSave = store.requests.map(r => {
    if (r.id !== selectedId) return r

    const parameters = parametersValue.value
    const requestHeaders = parseLines(requestHeadersText.value)

    const extraParams: Record<string, any> = {}
    for (const { key, value } of extraParamsPairs.value) {
      if (key.trim()) extraParams[key.trim()] = coerceValue(value)
    }

    const contract: Record<string, string> = {}
    for (const { key, value } of contractPairs.value) {
      if (key.trim()) contract[key.trim()] = value.trim()
    }

    const body: Record<string, any> = {}
    if (Object.keys(parameters).length) body.parameters = parameters
    if (Object.keys(extraParams).length) body.extraParams = extraParams
    if (requestHeaders.length) body.requestHeaders = requestHeaders
    if (tagsValue.value.length) body.tags = [...tagsValue.value]

    return { ...r, body, contract }
  })
  store.updateConfig({
    headers: store.headers,
    sources: store.sources,
    requests: requestsToSave,
  })
}
</script>

<style scoped>
.api-panel {
  padding: 16px;
}

.api-panel__section {
  margin-bottom: 16px;
}

.api-panel__section-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 4px;
  color: var(--cms-ink-body);
}

.api-panel__section-desc {
  font-size: 12px;
  color: var(--cms-ink-subtle);
  margin: 0 0 12px;
}

.api-panel__divider {
  height: 1px;
  background: var(--cms-line);
  margin: 16px 0;
}

.api-panel__loading {
  padding: 32px;
  text-align: center;
  color: var(--cms-ink-subtle);
}

.api-panel__error {
  padding: 12px;
  background: var(--cms-danger-soft);
  color: var(--cms-danger);
  border-radius: 4px;
  font-size: 13px;
  margin-top: 12px;
}

.api-panel__empty {
  padding: 16px;
  text-align: center;
  color: var(--cms-ink-subtle);
  font-size: 13px;
  background: var(--cms-canvas);
  border-radius: 4px;
  margin-bottom: 8px;
}

.api-panel__empty p {
  margin: 0;
}

/* ═══════════ Sources ═══════════ */

.api-panel__sources {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.api-panel__source-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--cms-surface-subtle);
  border: 1px solid var(--cms-line);
  border-radius: 6px;
  font-size: 13px;
}

.api-panel__source-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.api-panel__source-dot--default {
  background: var(--cms-line-strong);
}

.api-panel__source-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.api-panel__source-name {
  font-weight: 600;
  color: var(--cms-ink-body);
}

.api-panel__source-url {
  font-family: monospace;
  font-size: 11px;
  color: var(--cms-ink-subtle);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.api-panel__source-count {
  font-size: 11px;
  color: var(--cms-ink-subtle);
  flex-shrink: 0;
}

.api-panel__source-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--cms-accent-softest);
  border: 1px solid #d0e3ff;
  border-radius: 6px;
  margin-bottom: 8px;
}

.api-panel__source-form-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.api-panel__source-form-row .api-panel__input {
  flex: 1;
}

.api-panel__color-input {
  width: 36px;
  height: 36px;
  padding: 2px;
  border: 1px solid var(--cms-line);
  border-radius: 4px;
  cursor: pointer;
  background: white;
}

.api-panel__source-form-actions {
  display: flex;
  gap: 8px;
}

/* ═══════════ Headers ═══════════ */

.api-panel__headers {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.api-panel__header-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--cms-surface-subtle);
  border-radius: 4px;
  font-size: 13px;
}

.api-panel__header-key {
  font-weight: 600;
  color: var(--cms-ink-body);
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.api-panel__header-value {
  color: var(--cms-ink-muted);
  font-family: monospace;
  font-size: 12px;
  flex: 2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.api-panel__header-form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  background: var(--cms-accent-softest);
  border-radius: 4px;
  margin-bottom: 8px;
}

/* ═══════════ Shared Controls ═══════════ */

.api-panel__input {
  flex: 1;
  min-width: 120px;
  padding: 8px 10px;
  border: 1px solid var(--cms-line);
  border-radius: 4px;
  font-size: 13px;
}

.api-panel__input:focus {
  outline: none;
  border-color: var(--cms-accent);
}

.api-panel__select {
  padding: 8px 10px;
  border: 1px solid var(--cms-line);
  border-radius: 4px;
  font-size: 13px;
  background: white;
}

.api-panel__textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--cms-line);
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
  resize: vertical;
}

.api-panel__textarea:focus {
  outline: none;
  border-color: var(--cms-accent);
}

.api-panel__btn {
  padding: 6px 14px;
  border: 1px solid var(--cms-line);
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  background: white;
}

.api-panel__btn--primary {
  background: var(--cms-accent);
  border-color: var(--cms-accent);
  color: white;
}

.api-panel__btn--danger {
  color: var(--cms-danger);
  border-color: var(--cms-danger);
}

.api-panel__btn--danger:hover {
  background: var(--cms-danger);
  color: white;
}

.api-panel__icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--cms-ink-subtle);
  padding: 2px 6px;
}

.api-panel__icon-btn:hover {
  color: var(--cms-accent);
}

.api-panel__icon-btn--danger:hover {
  color: var(--cms-danger);
}

.api-panel__add-btn {
  display: block;
  width: 100%;
  padding: 10px;
  background: white;
  border: 1px dashed var(--cms-line-strong);
  border-radius: 4px;
  font-size: 13px;
  color: var(--cms-ink-muted);
  cursor: pointer;
  text-align: center;
  margin-top: 8px;
}

.api-panel__add-btn:hover {
  border-color: var(--cms-accent);
  color: var(--cms-accent);
}

.api-panel__add-btn--small {
  padding: 6px 10px;
  font-size: 12px;
}

/* ═══════════ Request Groups ═══════════ */

.api-panel__section > .t-group {
  margin-bottom: 8px;
}

.api-panel__source-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.api-panel__source-group-url {
  font-size: 11px;
  color: var(--cms-ink-subtle);
  background: var(--cms-surface-subtle);
  padding: 2px 6px;
  border-radius: 3px;
}

/* ═══════════ Request List Items ═══════════ */

.api-panel__requests {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.api-panel__request-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--cms-surface-subtle);
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.api-panel__request-item:hover {
  background: #f0f2f5;
}

.api-panel__request-item--selected {
  background: var(--cms-accent-softest);
  border-color: var(--cms-accent);
}

.api-panel__request-method {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 3px;
  min-width: 46px;
  text-align: center;
}

.api-panel__request-method--get {
  color: var(--cms-accent);
  background: rgba(46, 125, 50, 0.1);
}

.api-panel__request-method--post {
  color: var(--cms-accent);
  background: rgba(0, 102, 255, 0.1);
}

.api-panel__request-method--put {
  color: #e65100;
  background: rgba(230, 81, 0, 0.1);
}

.api-panel__request-method--delete {
  color: var(--cms-danger);
  background: rgba(220, 53, 69, 0.1);
}

.api-panel__request-method--patch {
  color: #7b1fa2;
  background: rgba(123, 31, 162, 0.1);
}

.api-panel__request-name {
  font-weight: 500;
  color: var(--cms-ink-body);
  flex: 1;
}

.api-panel__request-endpoint {
  font-family: monospace;
  font-size: 11px;
  color: var(--cms-ink-subtle);
}

/* ═══════════ Request Detail ═══════════ */

.api-panel__request-detail {
  margin-bottom: 16px;
}

.api-panel__form-row {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.api-panel__form-group {
  margin-bottom: 12px;
}

.api-panel__form-group--grow {
  flex: 1;
}

.api-panel__form-group label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--cms-ink-muted);
  margin-bottom: 4px;
}

.api-panel__field-hint {
  font-weight: 400;
  color: var(--cms-ink-subtle);
}

.api-panel__kv-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.api-panel__kv-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.api-panel__input--kv {
  flex: 1;
  min-width: 0;
}

.api-panel__kv-sep {
  font-size: 12px;
  color: var(--cms-ink-subtle);
  flex-shrink: 0;
}

.api-panel__kv-del {
  background: none;
  border: none;
  color: var(--cms-ink-subtle);
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
  line-height: 1;
  flex-shrink: 0;
}

.api-panel__kv-del:hover {
  color: var(--cms-danger);
}

.api-panel__kv-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.api-panel__add-kv {
  background: none;
  border: 1px dashed var(--cms-line-strong);
  border-radius: 4px;
  color: var(--cms-ink-muted);
  cursor: pointer;
  font-size: 12px;
  padding: 4px 10px;
}

.api-panel__add-kv:hover {
  border-color: var(--cms-accent);
  color: var(--cms-accent);
}

.api-panel__form-group .api-panel__input,
.api-panel__form-group .api-panel__select,
.api-panel__form-group .api-panel__textarea {
  width: 100%;
}

.api-panel__request-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

/* ═══════════ Footer ═══════════ */

.api-panel__footer {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--cms-line);
}

.api-panel__save {
  width: 100%;
  padding: 12px;
  background: var(--cms-accent);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.api-panel__save:hover:not(:disabled) {
  background: #0052cc;
}

.api-panel__save:disabled {
  background: var(--cms-line-strong);
  cursor: not-allowed;
}

/* ═══════════ Tags ═══════════ */

.api-panel__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.api-panel__tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 4px;
  background: var(--cms-accent-soft);
  color: var(--cms-accent);
}

.api-panel__tag-remove {
  border: none;
  background: none;
  color: var(--cms-accent);
  font-size: 14px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  opacity: 0.6;
}

.api-panel__tag-remove:hover {
  opacity: 1;
}

.api-panel__select--tag {
  padding: 4px 8px;
  font-size: 12px;
  border: 1px dashed var(--cms-line-strong);
  border-radius: 4px;
  background: white;
  color: var(--cms-ink-muted);
  cursor: pointer;
}

.api-panel__select--tag:hover {
  border-color: var(--cms-accent);
  color: var(--cms-accent);
}
</style>
