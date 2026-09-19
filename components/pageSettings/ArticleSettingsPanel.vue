<script setup lang="ts">
import { ref, computed, onMounted, provide } from 'vue'
import { adminFetch } from '~/admin/utils/adminFetch'
import { isLegacyMediaUrl } from '~/admin/utils/mediaValue'
import TImagePicker from '~/admin/components/fields/TImagePicker.vue'
import { publishArticle, unpublishArticle } from '~/admin/composables/useArticlePublish'
import { formatDate } from '~/admin/utils/formatters'
import StatusPill from '~/admin/components/pageSettings/StatusPill.vue'
import { editorChangeScope, useEditorChangeStore } from '~/admin/stores/editorChangeStore'
import { useAuthStore } from '~/admin/stores/authStore'

export interface ArticleFields {
  authorUserId: string | null
  authorName: string | null
  featuredImageId: string | null
  excerpt: Record<string, string> | null
}

interface AdminUserSummary {
  id: string
  email: string
  firstName?: string | null
  lastName?: string | null
}

const props = defineProps<{
  article: ArticleFields
  pageId: string
  siteId: string
  status: 'draft' | 'published'
  publishedAt?: string | Date | null
  locale: string
}>()

const emit = defineEmits<{
  'update:article': [patch: Partial<ArticleFields>]
  'status-change': [status: 'draft' | 'published']
  'publishing-change': [busy: boolean]
}>()
const changes = useEditorChangeStore()

// `GET /api/admin/users` is admin-only (rbac ADMIN_ONLY_PATTERNS), so the
// user-link dropdown only exists for admins; editors get the guest-name input.
const authStore = useAuthStore()
const canLinkAuthorUser = computed(() => authStore.isAdmin)

// Publish/unpublish state ---------------------------------------------------
const busy = ref(false)
const publishError = ref<string | null>(null)

async function onTogglePublish() {
  if (busy.value) return
  busy.value = true
  emit('publishing-change', true)
  publishError.value = null
  const previous = props.status
  try {
    const next = previous === 'published' ? 'draft' : 'published'
    const scope = editorChangeScope.page(props.pageId)

    // Publishing snapshots the page for visitors. Finish every page-bound
    // editor lane first so the published version cannot lag behind a pending
    // block, placement, motion, template, or page-details save. Unpublishing
    // does not create a content snapshot and can remain a direct operation.
    if (next === 'published') {
      const flushed = await changes.flushScope(scope, true)
      if (!flushed.ok) {
        publishError.value = 'Publishing is paused because some page changes could not be saved. Fix or retry them, then publish again.'
        return
      }
    }

    await changes.runOperation({
      key: `page:${props.pageId}:article:${next}`,
      label: next === 'published' ? 'Publish article' : 'Unpublish article',
      scope,
      barrier: next === 'published',
      run: () => previous === 'published'
        ? unpublishArticle(props.siteId, props.pageId)
        : publishArticle(props.siteId, props.pageId),
    })
    emit('status-change', next)
  } catch (err: any) {
    // Don't emit — parent keeps the previous status, so the optimistic UI reverts.
    publishError.value = err?.data?.statusMessage || err?.message || 'Could not update status.'
  } finally {
    busy.value = false
    emit('publishing-change', false)
  }
}

const publishedAtIso = computed(() => {
  const at = props.publishedAt
  if (!at) return null
  if (at instanceof Date) return at.toISOString()
  return String(at)
})

const users = ref<AdminUserSummary[]>([])
const usersLoading = ref(false)
const usersError = ref<string | null>(null)

function userLabel(u: AdminUserSummary): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim()
  return name ? `${name} (${u.email})` : u.email
}

const excerptVal = computed(() => props.article.excerpt?.[props.locale] ?? '')

function patch<K extends keyof ArticleFields>(key: K, value: ArticleFields[K]) {
  emit('update:article', { [key]: value })
}

// `featured_image_id` is a varchar(36) MEDIA ID: `articlesService` resolves it
// through the site's media map, so a pasted URL renders nothing in listings or
// social cards. `valueMode: 'id'` is set PER FIELD, not surface-wide — block
// fields on the same editor surface still store URLs.
const FEATURED_IMAGE_FIELD = {
  label: 'Featured image',
  options: { valueMode: 'id' as const },
  note: 'Shown in blog-index listings and social previews.',
}

function patchFeaturedImage(value: unknown) {
  patch('featuredImageId', typeof value === 'string' && value ? value : null)
}

const featuredImageIsLegacyUrl = computed(() => isLegacyMediaUrl(props.article.featuredImageId))

// TImagePicker reaches /api/admin/s/<siteId>/media/* through this injection.
// Provided locally so the panel carries its own site context wherever it is
// mounted rather than relying on an ancestor having provided the same key.
provide('siteId', computed(() => props.siteId))

function patchLocalized(key: 'excerpt', value: string) {
  const current = props.article[key] ?? {}
  const next = { ...current, [props.locale]: value }
  emit('update:article', { [key]: next })
}

/**
 * Picking an existing user clears the freeform `authorName` so the data
 * stays single-source-of-truth (DB FK wins). Selecting "(none)" clears
 * the link without touching `authorName`.
 */
function onAuthorUserSelect(value: string) {
  emit('update:article', {
    authorUserId: value || null,
    ...(value ? { authorName: null } : {}),
  })
}

/**
 * Typing a guest name clears the user FK so the two fields never both win.
 * Empty string -> `null` so the column stays NULL rather than "".
 */
function onAuthorNameInput(value: string) {
  const trimmed = value.trim()
  emit('update:article', {
    authorName: trimmed || null,
    ...(trimmed ? { authorUserId: null } : {}),
  })
}

async function loadUsers() {
  usersLoading.value = true
  usersError.value = null
  try {
    const data = await adminFetch<{ users: AdminUserSummary[] }>('/api/admin/users?limit=200')
    users.value = data.users ?? []
  } catch (e: any) {
    usersError.value = e?.message || 'Failed to load users'
    users.value = []
  } finally {
    usersLoading.value = false
  }
}

onMounted(() => {
  if (canLinkAuthorUser.value) loadUsers()
})
</script>

<template>
  <section
    class="cms-card article-settings-panel"
    data-section="article"
  >
    <div class="cms-card__header article-settings-panel__header">
      <h3 class="cms-card__title">Article</h3>
      <div class="article-settings-panel__publish">
        <StatusPill :status="status" />
        <button
          type="button"
          class="cms-btn cms-btn--primary cms-btn--sm article-settings-panel__publish-btn"
          :disabled="busy"
          data-action="toggle-publish"
          @click="onTogglePublish"
        >
          <span v-if="busy" class="cms-btn-spinner" />
          {{ status === 'published' ? 'Unpublish article' : 'Publish article' }}
        </button>
        <time
          v-if="status === 'published' && publishedAtIso"
          class="article-settings-panel__published-at"
          :datetime="publishedAtIso"
        >
          Published {{ formatDate(publishedAtIso) }}
        </time>
      </div>
      <p v-if="publishError" class="article-settings-panel__error" role="alert">{{ publishError }}</p>
    </div>
    <div class="cms-card__body">
      <div class="article-settings-panel__grid">
        <div v-if="canLinkAuthorUser" class="cms-form-group" data-field="authorUserId">
          <label class="cms-label" :for="`article-author-user-${pageId}`">Author (existing user)</label>
          <select
            :id="`article-author-user-${pageId}`"
            class="cms-form-control"
            :value="article.authorUserId ?? ''"
            :disabled="usersLoading || busy"
            @change="onAuthorUserSelect(($event.target as HTMLSelectElement).value)"
          >
            <option value="">(none)</option>
            <option
              v-for="u in users"
              :key="u.id"
              :value="u.id"
            >{{ userLabel(u) }}</option>
          </select>
          <small v-if="usersError" class="article-settings-panel__error">{{ usersError }}</small>
        </div>

        <div class="cms-form-group" data-field="authorName">
          <label class="cms-label" :for="`article-author-name-${pageId}`">Guest author name</label>
          <input
            :id="`article-author-name-${pageId}`"
            type="text"
            class="cms-form-control"
            :value="article.authorName ?? ''"
            :disabled="busy"
            placeholder="Used when the author isn't an admin user"
            @input="onAuthorNameInput(($event.target as HTMLInputElement).value)"
          >
          <small class="article-settings-panel__hint">
            Picking a user clears this; typing here clears the user link.
          </small>
        </div>

        <div class="cms-form-group" data-field="featuredImageId">
          <TImagePicker
            :field="FEATURED_IMAGE_FIELD"
            :model-value="article.featuredImageId"
            :disabled="busy"
            @update:model-value="patchFeaturedImage"
          />
          <small v-if="featuredImageIsLegacyUrl" class="article-settings-panel__hint">
            This is a raw URL, not a media item. Listings and social previews
            resolve media IDs, so this one renders no image — pick it from the
            library to fix it.
          </small>
        </div>

        <div class="cms-form-group" data-field="excerpt">
          <label class="cms-label" :for="`article-excerpt-${pageId}`">Excerpt</label>
          <textarea
            :id="`article-excerpt-${pageId}`"
            class="cms-form-control"
            rows="4"
            :value="excerptVal"
            :disabled="busy"
            placeholder="Short summary shown in blog index listings"
            @input="patchLocalized('excerpt', ($event.target as HTMLTextAreaElement).value)"
          />
          <small class="article-settings-panel__hint">Locale: {{ locale }}</small>
          <!-- TODO(F.0): swap to TRichTextEditor in block mode for richer authoring -->
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.article-settings-panel__header {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.article-settings-panel__publish {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-wrap: wrap;
}
.article-settings-panel__publish-btn {
  white-space: nowrap;
}
.article-settings-panel__published-at {
  font-size: 1.1rem;
  color: var(--cms-ink-muted);
  white-space: nowrap;
}
.article-settings-panel__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.6rem;
}
.article-settings-panel__hint {
  display: block;
  margin-top: 4px;
  color: var(--cms-ink-subtle);
  font-size: 11px;
}
.article-settings-panel__error {
  display: block;
  margin-top: 4px;
  color: var(--cms-danger);
  font-size: 11px;
}
</style>
