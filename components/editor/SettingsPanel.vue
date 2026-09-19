<template>
  <div class="settings-panel">
    <!-- Templated-page banner (Blog-2 § 2.F.1).
         Shown whenever the current page resolves to a structured template with a
         renderer `component` + non-empty `contentSchema`. Edit content via the
         dedicated article/blog editor; the page-builder block list is intentionally
         suppressed (see NavigationTree). Visible to all roles — editors / viewers
         get the link to the content editor; only admins see the settings panel below. -->
    <div v-if="isTemplatedPage && store.currentPage" class="settings-panel__templated-banner" role="status">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM7.5 4.5h1v5h-1v-5zm.5 7a.75.75 0 110 1.5.75.75 0 010-1.5z"/>
      </svg>
      <span class="settings-panel__templated-banner-text">
        This content is managed outside the page builder.
        <template v-if="templatedEditorHref">
          Open the
          <a :href="templatedEditorHref" class="settings-panel__templated-banner-link">article editor</a>
          to make changes.
        </template>
        <template v-else>
          Open Blogs or Articles to make changes.
        </template>
      </span>
    </div>

    <!-- Toolbar: locale switcher + undo/redo -->
    <div
      v-if="store.selectedBlock || store.showLayoutSettings || store.showSectionSettings"
      class="settings-panel__toolbar"
    >
      <div class="settings-panel__locale-switcher">
      <label for="locale-select">{{ t('admin.editor.language', 'Content language') }}</label>
      <select
        v-if="store.locales.length > 1"
        id="locale-select"
        :value="store.editingLocale"
        @change="switchEditingLocale"
      >
        <option v-for="locale in store.locales" :key="locale" :value="locale">{{ locale }}</option>
      </select>
      <span v-else class="settings-panel__locale-badge">{{ store.editingLocale }}</span>
      </div>
      <div v-if="historyTarget" class="settings-panel__history">
        <button
          type="button"
          class="settings-panel__history-btn"
          :disabled="!history.canUndo.value"
          :title="t('admin.editor.undo', 'Undo')"
          @click="handleUndo"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 3L1 6.5 4.5 10V7.5h5a3.5 3.5 0 110 7H6v-1h3.5a2.5 2.5 0 000-5h-5V12L1 8.5z" transform="translate(1,0)"/></svg>
        </button>
        <button
          type="button"
          class="settings-panel__history-btn"
          :disabled="!history.canRedo.value"
          :title="t('admin.editor.redo', 'Redo')"
          @click="handleRedo"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 3L1 6.5 4.5 10V7.5h5a3.5 3.5 0 110 7H6v-1h3.5a2.5 2.5 0 000-5h-5V12L1 8.5z" transform="translate(15,0) scale(-1,1)"/></svg>
        </button>
      </div>
    </div>

    <!-- Breadcrumb context indicator -->
    <div v-if="breadcrumb.length > 0" class="settings-panel__breadcrumb">
      <span
        v-for="(crumb, i) in breadcrumb"
        :key="i"
        class="settings-panel__breadcrumb-item"
        :class="{ 'settings-panel__breadcrumb-item--current': i === breadcrumb.length - 1 }"
      >
        <span v-if="i > 0" class="settings-panel__breadcrumb-sep">/</span>
        {{ crumb }}
      </span>
    </div>

    <!-- Validation error banner -->
    <div
      v-if="hasValidationErrors && (blockDirty || layoutDirty)"
      ref="validationBanner"
      class="settings-panel__validation-banner"
      role="alert"
      tabindex="-1"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1 1 0 110 2 1 1 0 010-2zM6.5 7h3l-.5 5h-2L6.5 7z"/>
      </svg>
      Fix errors below to save
    </div>

    <!-- Layout Component Settings (Header or Footer) — site-level, always editable -->
    <div v-if="store.showLayoutSettings" class="settings-panel__content">
      <div class="settings-panel__header">
        <h2>{{ layoutTitle }}</h2>
        <span class="settings-panel__type">{{ store.selectedLayoutType }}</span>
        <UiSaveStatus :status="saveStatus" :dirty="layoutDirty" @retry="retryLastSave" />
      </div>
      <!-- The previewed page may not render this component; its settings stay site-wide. -->
      <p v-if="!layoutTypeAvailable" class="settings-panel__layout-hidden-notice">
        Hidden on the page you are previewing ({{ previewedLayoutId }} layout).
      </p>
      <!-- Auth state toggle — visible only for auth-aware layout components when authStorageKey is configured -->
      <div v-if="isLayoutAuthAware" class="settings-panel__auth-toggle">
        <button
          v-for="tab in (['default', 'auth', 'guest'] as const)"
          :key="tab"
          type="button"
          class="settings-panel__auth-tab"
          :class="{ 'settings-panel__auth-tab--active': layoutAuthState === tab }"
          @click="switchLayoutAuthTab(tab)"
        >
          {{ tab === 'default' ? 'All visitors' : tab === 'auth' ? 'Signed-in content' : 'Signed-out content' }}
        </button>
      </div>
      <!-- No Motion tab here on purpose. A scene authored against the header /
           footer would be stored with entityId 'header' | 'footer', and nothing
           on the render side can play it: the chrome is mounted by the theme
           LAYOUT, outside DynamicPage's AnimationEngineProvider, so it never
           registers targets with the engine — and publish preflight
           (sceneValidationService, autoStrip) drops entries whose target block
           is absent from the page. Bringing this back needs the engine hoisted
           to the layout plus site-scoped chrome scenes, not just the UI. -->
      <TGroup v-if="layoutPresets.length" label="Presets" :default-open="true">
        <BlockPresetPicker
          :presets="layoutPresets"
          :allow-default="false"
          @select="applyLayoutPreset"
        />
      </TGroup>
      <FormRenderer
        v-if="store.selectedLayoutSchema"
        :schema="store.selectedLayoutSchema.settings"
        :groups="store.selectedLayoutSchema.groups"
        :model-value="localLayoutSettings"
        @update:model-value="onLayoutSettingsChange"
        @validity-change="onFormValidityChange"
      />
      <div v-else class="settings-panel__no-schema">
        This item has no editable settings.
      </div>
    </div>

    <!-- Section Settings (section selected, no block selected) -->
    <div v-else-if="store.showSectionSettings" class="settings-panel__content">
      <div class="settings-panel__header">
        <h2>{{ store.selectedSection?.name || 'Untitled Section' }}</h2>
        <span v-if="store.selectedSection?.sectionType" class="settings-panel__type">{{ store.selectedSection.sectionType }}</span>
      </div>
      <!-- Section sub-tabs: Content / Motion -->
      <EditorTabs
        v-model="sectionTab"
        :tabs="sectionTabs"
      />
      <SectionSettings v-show="sectionTab === 'content'" />
      <MotionTab
        v-if="sectionTab === 'motion'"
        :block-id="''"
        :selection-context="sectionSelectionContext"
        @open-timeline="$emit('open-timeline')"
      />
      <div class="settings-panel__actions settings-panel__actions--section">
        <button
          class="settings-panel__action-btn"
          :disabled="pendingSectionAction"
          title="Duplicate section"
          @click="duplicateSection"
        >
          Duplicate
        </button>
        <button
          class="settings-panel__action-btn"
          :disabled="pendingSectionAction || sectionIndex <= 0"
          title="Move section up"
          @click="moveSectionUp"
        >
          Move up
        </button>
        <button
          class="settings-panel__action-btn"
          :disabled="pendingSectionAction || sectionIndex >= sectionCount - 1"
          title="Move section down"
          @click="moveSectionDown"
        >
          Move down
        </button>
        <button
          class="settings-panel__delete"
          :disabled="pendingSectionAction"
          @click="deleteSection"
        >
          Delete
        </button>
      </div>
    </div>

    <!-- Block Settings -->
    <div v-else-if="store.selectedBlock" class="settings-panel__content">
      <div class="settings-panel__header">
        <h2>{{ blockTitle }}</h2>
        <span class="settings-panel__type">{{ store.selectedBlock.type }}</span>
        <UiSaveStatus :status="saveStatus" :dirty="blockDirty" @retry="retryLastSave" />
      </div>
      <!-- Auth state toggle — visible only for auth-aware blocks when authStorageKey is configured -->
      <div v-if="isAuthAware" class="settings-panel__auth-toggle">
        <button
          v-for="tab in (['default', 'auth', 'guest'] as const)"
          :key="tab"
          type="button"
          class="settings-panel__auth-tab"
          :class="{ 'settings-panel__auth-tab--active': authState === tab }"
          @click="switchAuthTab(tab)"
        >
          {{ tab === 'default' ? 'All visitors' : tab === 'auth' ? 'Signed-in content' : 'Signed-out content' }}
        </button>
      </div>
      <p v-if="isAuthAware" class="settings-panel__auth-hint">
        Editing the content shown to this group. To control whether the block appears
        at all, use <strong>Who sees this</strong> under Visibility.
      </p>
      <!-- Role compatibility warning -->
      <div v-if="blockRoleNote" class="settings-panel__role-warning">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="settings-panel__role-warning-icon">
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1 1 0 110 2 1 1 0 010-2zM6.5 7h3l-.5 5h-2L6.5 7z"/>
        </svg>
        <span>{{ blockRoleNote }}</span>
      </div>
      <EditorTabs
        v-if="useTabs"
        v-model="activeTab"
        :tabs="blockTabs"
      />

      <!-- Content tab (or flat view when no tabs) -->
      <div v-show="!useTabs || activeTab === 'content'" data-tab-panel="content">
        <CompositionEditor
          v-if="store.selectedBlock?.type === 'editorial-composition'"
          :settings="localBlockSettings"
          @update:settings="onBlockSettingsChange"
        />
        <FormRenderer
          v-else-if="store.selectedBlockSchema"
          :schema="blockContentFields"
          :groups="store.selectedBlockSchema.groups"
          :model-value="localBlockSettings"
          @update:model-value="onBlockSettingsChange"
          @validity-change="onContentValidityChange"
        />
        <TypographySlotEditor
          v-if="selectedTypographySlots.length"
          :slots="selectedTypographySlots"
          :settings="localBlockSettings"
          :presets="store.typographyPresets"
          :roles="store.typographyRoles"
          @update:settings="onBlockSettingsChange"
        />
        <div v-else class="settings-panel__no-schema">
          This item has no editable settings.
        </div>
      </div>

      <!-- Layout tab -->
      <div v-show="useTabs && activeTab === 'layout'" class="settings-panel__tab-content" data-tab-panel="layout">
        <FormRenderer
          v-if="blockLayoutFields.length"
          :schema="blockLayoutFields"
          :groups="store.selectedBlockSchema?.groups"
          :model-value="localBlockSettings"
          @update:model-value="onBlockSettingsChange"
          @validity-change="onLayoutValidityChange"
        />
        <TGroup label="Placement" :default-open="true">
          <PlacementPanel
            :placement="currentPlacement"
            :canvas-mode="isCanvasPage"
            :section-container-mode="selectedBlockContainerMode"
            :disabled="{ alignSelf: currentPlacement.widthMode === 'full' }"
            @update:placement="currentPlacement = $event"
          />
        </TGroup>
        <TGroup label="Frame" :default-open="true">
          <BlockFramePanel
            :placement="currentPlacement"
            @update:placement="currentPlacement = $event"
          />
        </TGroup>
        <TGroup label="Visibility" :default-open="true">
          <VisibilityPanel
            :placement="currentPlacement"
            @update:placement="currentPlacement = $event"
          />
        </TGroup>
      </div>

      <!-- Motion tab -->
      <AnimationPanel
        v-if="useTabs && activeTab === 'motion'"
        :block-id="store.selectedBlock.id"
        :block-type="store.selectedBlock.type"
        :targets-schema="motionTargets"
        :motion-support="store.selectedBlockSchema?.motionSupport"
        @open-timeline="$emit('open-timeline')"
      />
      <div v-if="store.selectedBlockSchema" class="settings-panel__actions">
        <button
          class="settings-panel__delete"
          :disabled="store.saving"
          @click="deleteBlock"
        >
          Delete
        </button>
      </div>
    </div>

    <!-- Page Settings (layout overrides) -->
    <div v-else-if="store.showPageSettings && store.currentPage" class="settings-panel__content">
      <div class="settings-panel__header">
        <h2>Page settings</h2>
        <span class="settings-panel__type">{{ store.currentPage.slug }}</span>
        <UiSaveStatus :status="pageMetaSaveStatus" :dirty="pageDirty" @retry="retryPageSaves" />
      </div>
      <!-- The page's layout — previously only editable on the Pages screen.
           On a brand canvas this decides which theme chrome exports with the
           asset, so it belongs where the rest of the page is managed. -->
      <div class="settings-panel__layout-pick">
        <div class="settings-panel__layout-label">
          <label for="page-layout-select">Layout</label>
          <span
            v-if="layoutRelation.isOverridden"
            class="settings-panel__layout-badge"
            data-layout-overridden
          >Overridden</span>
        </div>
        <select
          id="page-layout-select"
          :value="store.currentPage.layout || 'default'"
          :disabled="pageMetaSaving"
          @change="onPageLayoutChange(($event.target as HTMLSelectElement).value)"
        >
          <option
            v-if="legacyCurrentLayoutOption"
            :value="legacyCurrentLayoutOption.id"
            disabled
            data-legacy-current-layout
          >
            {{ legacyCurrentLayoutOption.label }} (current legacy layout — choose another)
          </option>
          <option v-for="themeLayout in themeLayoutOptions" :key="themeLayout.id" :value="themeLayout.id">
            {{ pageLayoutOptionLabel(themeLayout) }}
          </option>
        </select>
        <p v-if="layoutRelation.isOverridden" class="settings-panel__layout-hint" data-layout-override-hint>
          This page no longer uses the layout its template declares
          (<strong>{{ layoutRelation.templateLayoutId }}</strong>).
          <button
            type="button"
            class="settings-panel__layout-reset"
            :disabled="pageMetaSaving"
            data-reset-template-layout
            @click="resetToTemplateLayout"
          >Use the template layout</button>
        </p>
        <p v-if="isCanvasPage" class="settings-panel__layout-hint">
          <strong>Canvas frame.</strong> This layout decides the frame and brand chrome an export
          carries — "Blank" carries none, and no canvas ever renders the site header or footer. It
          does <strong>not</strong> change sections or blocks you already made: a section's own Full
          Width + Horizontal Inset still decide whether blocks touch the edges. Approve the canvas
          again to bake a change into renders.
        </p>
      </div>

      <LayoutOverridesPanel
        v-if="activeThemeLayout"
        :key="store.currentPage.id"
        :theme-layout="activeThemeLayout"
        :overrides="(store.currentPage.meta?.layoutOverrides ?? {})"
        :site-id="store.siteId ?? ''"
        :page-id="store.currentPage.id"
        :pending="pageDirty || pageMetaSaving"
        @update:overrides="onLayoutOverridesChange"
      />
      <div v-else class="settings-panel__no-schema">
        Layout definition not found for "{{ store.currentPage.layout || 'default' }}".
      </div>

      <!-- Admin-only template settings (Blog-2 § 2.F.1).
           Surfaces the active template's `settingsSchema` over `pages.template_settings`.
           Editor + viewer roles never see this panel. -->
      <TemplateSettingsPanel
        v-if="canShowTemplateSettings && activeTemplate && store.siteId"
        :page-id="store.currentPage.id"
        :site-id="store.siteId"
        :template="activeTemplate"
        :template-settings="(store.currentPage.templateSettings ?? null)"
        :locale="store.editingLocale"
        @update:draft="onTemplateSettingsDraft"
        @saved="onTemplateSettingsSaved"
      />

      <ArticleSettingsPanel
        v-if="(store.currentPage.pageType ?? 'static') === 'article'"
        :article="{
          authorUserId: store.currentPage.authorUserId ?? null,
          authorName: store.currentPage.authorName ?? null,
          featuredImageId: store.currentPage.featuredImageId ?? null,
          excerpt: store.currentPage.excerpt ?? null,
        }"
        :page-id="store.currentPage.id"
        :site-id="store.siteId ?? ''"
        :status="(store.currentPage.status ?? (store.currentPage.published ? 'published' : 'draft'))"
        :published-at="store.currentPage.publishedAt ?? null"
        :locale="store.editingLocale"
        @update:article="onArticleSettingsChange"
        @status-change="onArticleStatusChange"
        @publishing-change="emit('page-mutation-busy', $event)"
      />

      <SeoPanel
        v-if="['static','blog-index','article'].includes(store.currentPage.pageType ?? 'static')"
        :seo="{
          metaTitle: store.currentPage.metaTitle ?? null,
          metaDescription: store.currentPage.metaDescription ?? null,
          ogImageId: store.currentPage.ogImageId ?? null,
          noIndex: !!store.currentPage.noIndex,
          canonicalUrl: store.currentPage.canonicalUrl ?? null,
        }"
        :page-id="store.currentPage.id"
        :site-id="store.siteId ?? ''"
        :locale="store.editingLocale"
        :page-title="store.currentPage.title ?? null"
        :excerpt="store.currentPage.excerpt ?? null"
        :path="seoPreviewPath"
        @update:seo="onSeoChange"
      />
    </div>

    <!-- Empty State -->
    <div v-else class="settings-panel__empty">
      <div class="settings-panel__empty-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 3v18M3 12h18"/>
        </svg>
      </div>
      <p>Select something on the page or in the left panel to edit it.</p>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, provide, nextTick } from 'vue'
import { useEditorStore } from '~/admin/stores/editorStore'
import {
  editorChangeKey,
  editorChangeScope,
  useEditorChangeStore,
  type EditorSaveJobState,
} from '~/admin/stores/editorChangeStore'
import FormRenderer from '~/admin/components/fields/FormRenderer.vue'
import AnimationPanel from '~/admin/components/animation/AnimationPanel.vue'
import MotionTab from '~/admin/components/animation/MotionTab.vue'
import SectionSettings from '~/admin/components/sections/SectionSettings.vue'
import type { SelectionContext } from '~/admin/components/animation/selectionContext'
import EditorTabs from './EditorTabs.vue'
import BlockPresetPicker from './BlockPresetPicker.vue'
import PlacementPanel from './PlacementPanel.vue'
import BlockFramePanel from './BlockFramePanel.vue'
import VisibilityPanel from './VisibilityPanel.vue'
import TGroup from '~/admin/components/fields/TGroup.vue'
import TypographySlotEditor from './TypographySlotEditor.vue'
import CompositionEditor from '~/admin/components/blocks/composition/CompositionEditor.vue'
import LayoutOverridesPanel from '~/admin/components/pageSettings/LayoutOverridesPanel.vue'
import ArticleSettingsPanel from '~/admin/components/pageSettings/ArticleSettingsPanel.vue'
import SeoPanel from '~/admin/components/pageSettings/SeoPanel.vue'
import TemplateSettingsPanel from '~/admin/components/pageSettings/TemplateSettingsPanel.vue'
import type { ArticleFields } from '~/admin/components/pageSettings/ArticleSettingsPanel.vue'
import type { SeoFields } from '~/admin/components/pageSettings/SeoPanel.vue'
import type { BlockPreset } from '~/shared/types/blocks'
import type { ThemeLayout, PageLayoutOverrides } from '~/shared/types/layout'
import { readCanvasPreset } from '~/shared/features/layout/canvasPresets'
import type { PageTemplate } from '~/shared/types/templates'
import type { TypographySlotSchema } from '~/shared/typography/typographySlots'
import { useAuthStore } from '~/admin/stores/authStore'
import { useSettingsHistory } from '~/admin/composables/useSettingsHistory'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { useAdminUrl } from '~/admin/composables/useAdminUrl'
import UiSaveStatus from '~/admin/components/ui/UiSaveStatus.vue'
import { previewBlockSettingsInState } from '~/admin/utils/blockState'
import {
  layoutOptionLabelWithTemplateDefault,
  resolveLayoutRelation,
} from '~/admin/utils/templateRelation'
import {
  MEDIA_UPLOAD_OPERATION_KEY,
  type MediaUploadOperation,
} from '~/admin/components/fields/mediaUpload'

type AuthTab = 'default' | 'auth' | 'guest'

const emit = defineEmits<{
  'open-timeline': []
  'page-mutation-busy': [busy: boolean]
}>()

const store = useEditorStore()
const changes = useEditorChangeStore()
const history = useSettingsHistory()
const { t } = useAdminI18n()

// Which surface the undo stack currently belongs to, or null when the selected
// surface has no history (section, page, empty). Null hides the undo/redo
// controls and short-circuits their handlers.
const historyTarget = computed<'block' | 'layout' | null>(() => {
  if (store.selectedBlock) return 'block'
  if (store.showLayoutSettings) return 'layout'
  return null
})
const authStore = useAuthStore()
const { adminUrl } = useAdminUrl()

const mediaUploadOperation = computed<MediaUploadOperation | undefined>(() => {
  const siteId = store.siteId
  if (store.showLayoutSettings && siteId && store.selectedLayoutType) {
    return {
      key: `layout:${siteId}:${store.selectedLayoutType}:media`,
      surface: 'layout',
      scope: editorChangeScope.site(siteId),
      label: `${store.selectedLayoutType} image upload`,
    }
  }

  const pageId = store.currentPage?.id
  if (!pageId) return undefined
  if (store.selectedBlockId) {
    return {
      key: `block:${store.selectedBlockId}:media`,
      surface: 'block',
      scope: editorChangeScope.page(pageId),
      label: 'Block image upload',
    }
  }
  if (store.showPageSettings) {
    return {
      key: `page:${pageId}:details:media`,
      surface: 'page',
      scope: editorChangeScope.page(pageId),
      label: 'Page image upload',
    }
  }
  return undefined
})

/**
 * Active template resolved from theme manifest by `currentPage.templateId`.
 * Returns null when:
 *   - currentPage has no templateId (legacy / static)
 *   - manifest.templates is missing or doesn't contain this id (drift)
 *
 * Note: we don't run the full server-side `parseTemplates` validator here
 * (no layout id / allowedBlocks lookup) — the editor is read-only against
 * the manifest the server already validated. We just look up the entry.
 * Field types remain whatever the manifest emits.
 */
/**
 * URL path of the current page for the SEO preview crumb — ancestor slugs
 * plus the page slug, with the conventional "home" root collapsed to "".
 */
const seoPreviewPath = computed(() => {
  const page = store.currentPage
  if (!page) return ''
  const ancestors = store.getAncestorSlugs(page)
  const leaf = page.slug === 'home' ? '' : page.slug
  return [...ancestors, leaf].filter(Boolean).join('/')
})

const activeTemplate = computed<PageTemplate | null>(() => {
  const tplId = store.currentPage?.templateId
  if (!tplId) return null
  const manifest = store.themeManifest as { templates?: any[] } | null
  const templates = Array.isArray(manifest?.templates) ? manifest.templates : []
  return (templates.find((t: any) => t?.id === tplId) ?? null) as PageTemplate | null
})

/**
 * "Templated page" gate (Blog-2 § 7): the page resolves to a template with a
 * renderer `component` + non-empty `contentSchema`. Block-list authoring is
 * suppressed for these — content lives in `pages.contentData` and is edited
 * via the Article/Blog manager. Static pages and legacy block-authored pages
 * stay on the existing block-list flow.
 */
const isTemplatedPage = computed(() => {
  const t = activeTemplate.value
  return !!(t && t.component && Array.isArray(t.contentSchema) && t.contentSchema.length > 0)
})

/**
 * Show the admin TemplateSettingsPanel when:
 *  - viewer is admin (RBAC defense in depth — endpoint is also admin-only)
 *  - active template has a non-empty `settingsSchema`
 *
 * Editor + viewer roles never see this panel.
 */
const canShowTemplateSettings = computed(() => {
  if (!authStore.isAdmin) return false
  const t = activeTemplate.value
  return !!(t && Array.isArray(t.settingsSchema) && t.settingsSchema.length > 0)
})

/** Where to send the "Edit content" banner link for templated pages. */
const templatedEditorHref = computed(() => {
  const page = store.currentPage
  if (!page || !store.siteId) return null
  // Articles → article editor; blog-index → pages list (blog editor lands in 2.E).
  if ((page.pageType ?? 'static') === 'article') {
    // MUST be absolute. A relative `../articles/<id>` resolves against
    // `/admin/p/<pid>/s/<sid>/editor` → `/admin/p/<pid>/s/articles/<id>`, which
    // eats the site segment and 404s. `adminUrl()` is the sanctioned builder and
    // sources both ids from the program/site stores.
    return adminUrl(`/articles/${page.id}`)
  }
  return null
})

/**
 * Mirror every unsaved template-settings keystroke onto the page the preview
 * config is built from. `previewConfig` tracks `currentPage`, and
 * `buildPreviewConfig` copies `templateSettings` onto the page node, so this is
 * what makes the iframe reflect a draft edit BEFORE the debounced PUT lands.
 * Without it the preview lags by the debounce plus a server round-trip.
 */
function onTemplateSettingsDraft(draft: {
  pageId: string
  templateSettings: Record<string, any>
}) {
  store.previewPageDetails(draft.pageId, { templateSettings: draft.templateSettings })
}

/** Reconcile the authoritative field without rehydrating unrelated page work. */
function onTemplateSettingsSaved(result: {
  pageId: string
  templateSettings: Record<string, any>
}) {
  store.confirmTemplateSettings(result.pageId, result.templateSettings)
}

// --- Placement tabs ---
const activeTab = ref('content')

const hasAdvancedControls = computed(() => false) // Future: anchors, custom IDs

const blockTabs = computed(() => [
  { id: 'content', label: 'Content' },
  { id: 'layout', label: 'Layout' },
  { id: 'motion', label: 'Motion', hidden: !store.selectedBlockSchema?.motionSupport },
  { id: 'advanced', label: 'Advanced', hidden: !hasAdvancedControls.value },
])

// Reset tab when block changes
watch(() => store.selectedBlockId, () => {
  activeTab.value = 'content'
  resetFormValidity()
})

// --- Section tabs ---
const sectionTab = ref('content')
const sectionTabs = computed(() => [
  { id: 'content', label: 'Content' },
  { id: 'motion', label: 'Motion' },
])

// Reset section tab when section changes
watch(() => store.selectedSectionId, () => { sectionTab.value = 'content' })

// --- Layout component settings ---
// Content only: see the template for why the chrome has no Motion tab.
const layoutPresets = computed<BlockPreset[]>(() => store.selectedLayoutSchema?.presets ?? [])

// --- Selection context for animation ---
const sectionSelectionContext = computed<SelectionContext | undefined>(() => {
  if (!store.selectedSectionId) return undefined
  return { type: 'section', sectionId: store.selectedSectionId }
})

const blockSelectionContext = computed<SelectionContext | undefined>(() => {
  if (!store.selectedBlockId) return undefined
  const block = store.selectedBlock
  if (!block) return undefined
  return {
    type: 'block',
    blockId: block.id,
    sectionId: block.sectionId ?? '',
  }
})

// Show tabs only for blocks with ≥8 settings fields
const useTabs = computed(() => {
  return !!store.selectedBlockSchema 
})

/**
 * Positioning has one home: schema settings declared in the `layout` group are
 * rendered in the Layout tab beside PlacementPanel, never in Content.
 */
const LAYOUT_GROUP_ID = 'layout'

const blockSchemaFields = computed<any[]>(() => store.selectedBlockSchema?.settings ?? [])

const blockLayoutFields = computed<any[]>(
  () => blockSchemaFields.value.filter((field: any) => field.group === LAYOUT_GROUP_ID),
)

const blockContentFields = computed<any[]>(
  () => blockSchemaFields.value.filter((field: any) => field.group !== LAYOUT_GROUP_ID),
)

const selectedTypographySlots = computed<TypographySlotSchema[]>(() => {
  const schema = store.selectedBlockSchema as ({ typographySlots?: TypographySlotSchema[] }) | null
  return schema?.typographySlots ?? []
})

// Reactive placement for current block
const currentPlacement = computed({
  get: () => store.selectedBlockId ? store.getBlockPlacement(store.selectedBlockId) : {},
  set: (val) => { if (store.selectedBlockId) store.updateBlockPlacement(store.selectedBlockId, val) },
})

// Save jobs are owned by editorChangeStore rather than this inspector. A job
// therefore keeps debouncing, saving, and exposing failures after selection
// changes or this component unmounts.
const pendingPageDetailsPatches = new Map<string, Record<string, any>>()
const LOCALIZED_PAGE_DETAIL_FIELDS = new Set(['excerpt', 'metaTitle', 'metaDescription'])

const blockSaveKey = editorChangeKey.block
const layoutSaveKey = (type: string) => editorChangeKey.layout(store.siteId || 'unknown', type)
const pageDetailsSaveKey = editorChangeKey.pageDetails
const pageScope = editorChangeScope.page

function activeJobStatus(job: EditorSaveJobState | null): 'idle' | 'saving' | 'saved' | 'error' {
  if (!job) return 'idle'
  if (job.error) return 'error'
  if (job.saving) return 'saving'
  if (!job.dirty && job.lastSavedAt !== null) return 'saved'
  return 'idle'
}

const activeBlockJob = computed(() => {
  const id = store.selectedBlockId
  return id ? changes.getJob(blockSaveKey(id)) : null
})
const activeLayoutJob = computed(() => {
  const type = store.selectedLayoutType
  return type ? changes.getJob(layoutSaveKey(type)) : null
})
const activeSettingsJob = computed(() => (
  store.showLayoutSettings ? activeLayoutJob.value : activeBlockJob.value
))
// Per-surface status, rendered through one shared <UiSaveStatus> rather than
// three hand-copied blocks with three different wordings (I7). This answers a
// different question from the topbar aggregate, so both legitimately exist.
const saveStatus = computed(() => activeJobStatus(activeSettingsJob.value))
const blockDirty = computed(() => activeBlockJob.value?.dirty ?? false)
const layoutDirty = computed(() => activeLayoutJob.value?.dirty ?? false)

const activePageJobs = computed(() => {
  const pageId = store.currentPage?.id
  if (!pageId) return []
  const job = changes.getJob(pageDetailsSaveKey(pageId))
  return job ? [job] : []
})
const pageMetaSaving = computed(() => activePageJobs.value.some(job => job.saving))
const pageDirty = computed(() => activePageJobs.value.some(job => job.dirty))
const pageMetaSaveStatus = computed<'idle' | 'saving' | 'saved' | 'error'>(() => {
  if (activePageJobs.value.some(job => job.error)) return 'error'
  if (pageMetaSaving.value) return 'saving'
  if (
    activePageJobs.value.length > 0
    && activePageJobs.value.every(job => !job.dirty && !job.saving)
    && activePageJobs.value.some(job => job.lastSavedAt !== null)
  ) return 'saved'
  return 'idle'
})

const themeLayouts = computed<ThemeLayout[]>(
  () => ((store.themeManifest as any)?.layout?.layouts as ThemeLayout[] | undefined) ?? [],
)

// Resolve the active ThemeLayout (from theme manifest) for the current page
const activeThemeLayout = computed<ThemeLayout | null>(() => {
  const layouts = themeLayouts.value
  if (!layouts?.length) return null
  const id = store.currentPage?.layout || 'default'
  return layouts.find(l => l.id === id) ?? layouts[0] ?? null
})

const isCanvasPage = computed(() => (store.currentPage as any)?.pageType === 'brand-canvas')

// The other half of the block's final width: PlacementPanel needs the owning
// section's container mode to explain what the block's own setting will do.
const selectedBlockContainerMode = computed<string | null>(() => {
  const sectionId = store.selectedBlock?.sectionId
  if (!sectionId) return null
  return store.sections.find(s => s.id === sectionId)?.containerMode ?? null
})

/**
 * Every layout the theme manifest declares, for the picker — filtered on a
 * canvas page to the ones declaring `canvasPreset` (the SAME marker that
 * builds the New-canvas radio and the server's create-time allow-list, so
 * this filter cannot drift from either). `default` and `editorial` are
 * dropped there: neither declares `frame.responsiveMode: 'scale'`, both
 * misrender at arbitrary canvas pixel sizes, and `default` is the chrome-
 * bearing layout the whole preset design exists to keep out of exports.
 *
 * A theme that marks no layout at all falls back to the full list — a canvas
 * page on such a theme behaves exactly as it did before presets existed.
 */
const themeLayoutOptions = computed<ThemeLayout[]>(() => {
  const layouts = themeLayouts.value
  if (!isCanvasPage.value) return layouts
  const marked = layouts.filter(layout => readCanvasPreset(layout) !== null)
  return marked.length > 0 ? marked : layouts
})

/**
 * Older canvases can still reference a normal site layout that the canvas
 * picker intentionally excludes. Keep that persisted value visible as a
 * disabled option instead of rendering a blank select or silently pretending
 * the first canvas preset is active.
 */
const legacyCurrentLayoutOption = computed<{ id: string; label: string } | null>(() => {
  if (!isCanvasPage.value) return null
  const id = store.currentPage?.layout || 'default'
  if (themeLayoutOptions.value.some(layout => layout.id === id)) return null
  const declared = themeLayouts.value.find(layout => layout.id === id)
  return {
    id,
    label: declared ? layoutOptionLabel(declared) : id,
  }
})

/**
 * The template a page carries declares a layout; the page may sit on another
 * one. Both facts are made visible instead of enforced (D7) — the select stays
 * unconstrained, the divergence stops being invisible.
 */
const layoutRelation = computed(() => resolveLayoutRelation(
  store.currentPage?.layout,
  activeTemplate.value?.layoutId,
))

function pageLayoutOptionLabel(themeLayout: ThemeLayout): string {
  return layoutOptionLabelWithTemplateDefault(
    layoutOptionLabel(themeLayout),
    themeLayout.id,
    layoutRelation.value.templateLayoutId,
  )
}

function resetToTemplateLayout() {
  const templateLayoutId = layoutRelation.value.templateLayoutId
  if (!templateLayoutId) return
  onPageLayoutChange(templateLayoutId)
}

function layoutOptionLabel(themeLayout: ThemeLayout): string {
  const label = themeLayout.label as unknown
  if (typeof label === 'string') return label
  if (label && typeof label === 'object') {
    const map = label as Record<string, string>
    return map['en-US'] ?? Object.values(map)[0] ?? themeLayout.id
  }
  return themeLayout.id
}

function immutableSavePayload<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function saveValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (
    left && right
    && typeof left === 'object'
    && typeof right === 'object'
  ) return JSON.stringify(left) === JSON.stringify(right)
  return false
}

function assertSavePageStillActive(pageId: string): void {
  if (store.currentPage?.id !== pageId) {
    throw new Error('The page changed before its pending settings could be saved')
  }
}

/** Selects are one-shot, but share the details lane so they serialize with typing. */
function onPageLayoutChange(layout: string) {
  queuePageDetailsSave({ layout }, 0)
}

function onLayoutOverridesChange(overrides: PageLayoutOverrides) {
  queuePageDetailsSave({
    meta: {
      ...immutableSavePayload(store.currentPage?.meta ?? {}),
      layoutOverrides: immutableSavePayload(overrides),
    },
  })
}

/**
 * Layout/meta, article, SEO, and one-shot page-column changes share one job.
 * Each event merges into the unsaved patch before replacing the coordinator
 * callback, so independent page-detail controls cannot race full-page server
 * responses or erase one another.
 */
function queuePageDetailsSave(patch: Record<string, any>, delay?: number) {
  const pageId = store.currentPage?.id
  if (!pageId) return
  const key = pageDetailsSaveKey(pageId)
  const previousPatch = pendingPageDetailsPatches.get(pageId) ?? {}
  const incomingPatch = immutableSavePayload(patch)
  const mergedPatch = { ...previousPatch, ...incomingPatch }
  // Localized controls can emit a second locale before the first revision has
  // reached the server. Merge those maps by locale so switching languages
  // during the debounce cannot erase the first locale's draft.
  for (const field of LOCALIZED_PAGE_DETAIL_FIELDS) {
    const previous = previousPatch[field]
    const incoming = incomingPatch[field]
    if (
      previous && incoming
      && typeof previous === 'object' && !Array.isArray(previous)
      && typeof incoming === 'object' && !Array.isArray(incoming)
    ) {
      mergedPatch[field] = { ...previous, ...incoming }
    }
  }
  pendingPageDetailsPatches.set(pageId, mergedPatch)
  const submittedPatch = immutableSavePayload(mergedPatch)
  store.previewPageDetails(pageId, submittedPatch)

  changes.queue({
    key,
    surface: 'page',
    scope: pageScope(pageId),
    label: 'Page details',
    delay,
    run: async ({ isCurrent }) => {
      await store.updatePageDetails(pageId, submittedPatch, { shouldApplyResponse: isCurrent })

      const remainingPatch = pendingPageDetailsPatches.get(pageId)
      if (!remainingPatch) return
      for (const [field, value] of Object.entries(submittedPatch)) {
        if (saveValuesEqual(remainingPatch[field], value)) delete remainingPatch[field]
      }
      if (Object.keys(remainingPatch).length === 0) pendingPageDetailsPatches.delete(pageId)
      else pendingPageDetailsPatches.set(pageId, remainingPatch)
    },
  })
}

function onArticleSettingsChange(article: Partial<ArticleFields>) {
  queuePageDetailsSave(article)
}

/**
 * Article publish/unpublish was just persisted via the dedicated per-article
 * endpoint (Chunk P.2). The DB row is authoritative, so we refetch the page
 * to mirror the new `status` + `publishedAt` (and any cache-purge side effects)
 * back into the editor store. We mirror the emitted status synchronously so
 * the pill/button cannot issue the same transition twice while this reload
 * waits; the fetch then supplies canonical timestamps.
 */
async function onArticleStatusChange(_next: 'draft' | 'published') {
  const pageId = store.currentPage?.id
  if (!pageId) return
  store.previewPageDetails(pageId, {
    status: _next,
    published: _next === 'published',
  })
  try {
    const flushed = await changes.flushJob(pageDetailsSaveKey(pageId))
    if (!flushed) return
    await store.reloadCurrentPage()
  } catch {
    // Non-critical — the per-article endpoint already succeeded; the next
    // navigation/refresh will pick up the canonical row.
  }
}

function onSeoChange(seo: Partial<SeoFields>) {
  queuePageDetailsSave(seo)
}

// Provide schemas, siteId, themeManifest, and editing locale to child components
provide('blockSchemas', computed(() => store.schemas))
provide('parentComponentSchema', computed(() => store.selectedBlockSchema || store.selectedLayoutSchema || null))
provide('siteId', computed(() => store.siteId))
provide('themeManifest', computed(() => store.themeManifest))
provide('editingLocale', computed(() => store.editingLocale))
provide('typographyPresets', computed(() => store.typographyPresets))
provide(MEDIA_UPLOAD_OPERATION_KEY, mediaUploadOperation)

// Provide drag context for cross-container block dragging
const blockDragContext = ref<any>(null)
provide('blockDragContext', blockDragContext)

// Auth-aware block settings
const authState = ref<AuthTab>('default')

const isAuthAware = computed(() =>
  !!(store.selectedBlockSchema?.authAware && (store.themeSettings as any)?.authStorageKey)
)

// Auth-aware layout component settings
const layoutAuthState = ref<AuthTab>('default')

const isLayoutAuthAware = computed(() =>
  !!(store.selectedLayoutSchema?.authAware && (store.themeSettings as any)?.authStorageKey)
)

/** Strip internal _auth/_guest keys to get base settings */
function getBaseSettings(settings: Record<string, any>): Record<string, any> {
  const { _auth: _a, _guest: _g, ...base } = settings
  return base
}

/** Merge base + override for the given tab (what the form shows) */
function getEffectiveSettings(settings: Record<string, any>, tab: AuthTab): Record<string, any> {
  const base = getBaseSettings(settings)
  if (tab === 'default') return base
  const overrides = tab === 'auth' ? (settings._auth || {}) : (settings._guest || {})
  return { ...base, ...overrides }
}

/**
 * Reconstruct the full settings object to persist:
 * - default tab: saves base, preserves existing _auth/_guest
 * - auth/guest tab: saves only delta (fields differing from base) into _auth/_guest
 */
function buildFullSettings(
  effectiveSettings: Record<string, any>,
  existingSettings: Record<string, any>,
  authAware: boolean,
  tab: AuthTab,
): Record<string, any> {
  const base = getBaseSettings(existingSettings)
  const existingAuth = existingSettings._auth
  const existingGuest = existingSettings._guest

  if (!authAware || tab === 'default') {
    const result: Record<string, any> = { ...effectiveSettings }
    if (existingAuth !== undefined) result._auth = existingAuth
    if (existingGuest !== undefined) result._guest = existingGuest
    return result
  }

  // Compute delta: only fields that differ from base go into the override
  const delta: Record<string, any> = {}
  for (const [key, value] of Object.entries(effectiveSettings)) {
    if (JSON.stringify(value) !== JSON.stringify(base[key])) {
      delta[key] = value
    }
  }

  const overrideKey = tab === 'auth' ? '_auth' : '_guest'
  const otherKey = tab === 'auth' ? '_guest' : '_auth'
  const otherValue = tab === 'auth' ? existingGuest : existingAuth

  const result: Record<string, any> = { ...base, [overrideKey]: delta }
  if (otherValue !== undefined) result[otherKey] = otherValue
  return result
}

/** Same as buildFullSettings but for layout component settings */
function buildFullLayoutSettings(
  effectiveSettings: Record<string, any>,
  existingSettings: Record<string, any>,
  authAware: boolean,
  tab: AuthTab,
): Record<string, any> {
  const base = getBaseSettings(existingSettings)
  const existingAuth = existingSettings._auth
  const existingGuest = existingSettings._guest

  if (!authAware || tab === 'default') {
    const result: Record<string, any> = { ...effectiveSettings }
    if (existingAuth !== undefined) result._auth = existingAuth
    if (existingGuest !== undefined) result._guest = existingGuest
    return result
  }

  const delta: Record<string, any> = {}
  for (const [key, value] of Object.entries(effectiveSettings)) {
    if (JSON.stringify(value) !== JSON.stringify(base[key])) {
      delta[key] = value
    }
  }

  const overrideKey = tab === 'auth' ? '_auth' : '_guest'
  const otherKey = tab === 'auth' ? '_guest' : '_auth'
  const otherValue = tab === 'auth' ? existingGuest : existingAuth

  const result: Record<string, any> = { ...base, [overrideKey]: delta }
  if (otherValue !== undefined) result[otherKey] = otherValue
  return result
}

// Local state for editing
const localBlockSettings = ref<Record<string, any>>({})
const localLayoutSettings = ref<Record<string, any>>({})

// Validation state
const activeFormValid = ref(true)
const validationErrors = ref<Record<string, string>>({})
const validationBanner = ref<HTMLElement | null>(null)
const hasValidationErrors = computed(
  () => !activeFormValid.value || Object.keys(validationErrors.value).length > 0,
)

function focusValidationErrors(): void {
  void nextTick(() => validationBanner.value?.focus())
}

function resetFormValidation() {
  activeFormValid.value = true
  validationErrors.value = {}
}

// Public editor selection actions flush before changing this id. This watcher
// only reinitializes the inspector after that guarded transition succeeds.
watch(() => store.selectedBlockId, (newId, oldId) => {
  resetFormValidation()
  if (newId && (oldId === undefined || newId !== oldId)) {
    const block = store.selectedBlock
    if (block) {
      authState.value = 'default'
      const initial = getBaseSettings(block.settings)
      localBlockSettings.value = initial
      history.clear()
      history.push({ ...initial })
    }
  }
}, { immediate: true })

// Canvas gestures and other editor surfaces can update the selected block
// through the same save lane. Once that lane is clean, mirror its confirmed
// settings into the mounted form without disturbing a local draft in flight.
watch(
  () => [
    store.selectedBlock?.settings,
    activeBlockJob.value?.dirty,
    activeBlockJob.value?.saving,
  ] as const,
  () => {
    const block = store.selectedBlock
    if (!block || activeBlockJob.value?.dirty || activeBlockJob.value?.saving) return
    const effective = getEffectiveSettings(block.settings || {}, authState.value)
    if (!saveValuesEqual(localBlockSettings.value, effective)) {
      localBlockSettings.value = immutableSavePayload(effective)
    }
  },
  { deep: true },
)

// When switching auth tabs, reinitialize form to the effective settings for that tab
async function switchAuthTab(tab: AuthTab) {
  if (tab === authState.value) return
  if (!await flushCurrentInspectorScope()) return
  resetFormValidation()
  authState.value = tab
  const block = store.selectedBlock
  if (!block) return
  const effective = getEffectiveSettings(block.settings, tab)
  localBlockSettings.value = effective
  history.clear()
  history.push({ ...effective })
}

async function switchLayoutAuthTab(tab: AuthTab) {
  if (tab === layoutAuthState.value) return
  if (!await flushCurrentInspectorScope()) return
  resetFormValidation()
  layoutAuthState.value = tab
  const settings = store.layoutSettings[store.selectedLayoutType!] || {}
  const effective = getEffectiveSettings(settings, tab)
  localLayoutSettings.value = effective
  history.clear()
  history.push({ ...effective })
}

function currentInspectorScope(): string | null {
  if (store.showLayoutSettings && store.siteId) {
    return editorChangeScope.site(store.siteId)
  }
  if (store.currentPage) return editorChangeScope.page(store.currentPage.id)
  return null
}

async function flushCurrentInspectorScope(): Promise<boolean> {
  const scope = currentInspectorScope()
  if (!scope) return true
  return (await changes.flushScope(scope, true)).ok
}

async function switchEditingLocale(event: Event): Promise<void> {
  const select = event.currentTarget as HTMLSelectElement
  const previous = store.editingLocale
  const next = select.value
  if (!next || next === previous) return
  if (!await flushCurrentInspectorScope()) {
    select.value = previous
    return
  }
  store.editingLocale = next
}

// Reinitialize after the guarded editor selection transition succeeds.
watch(() => store.selectedLayoutType, (newType, oldType) => {
  resetFormValidation()
  if (newType && (oldType === undefined || newType !== oldType)) {
    layoutAuthState.value = 'default'
    const settings = store.layoutSettings[newType] || {}
    const initial = getBaseSettings(settings)
    localLayoutSettings.value = initial
    history.clear()
    history.push({ ...initial })
  }
}, { immediate: true })

// Selecting a section or page settings leaves no surface owning the stack. Drop
// it, so the controls cannot re-enable against the previously selected block's
// history. Order-independent: this only fires once neither watcher above holds
// a selection.
watch(historyTarget, (target) => {
  if (!target) history.clear()
})

const motionTargets = computed(() => {
  const schema = store.selectedBlockSchema
  if (!schema?.motionSupport) return undefined
  return schema.targets
})

/** Compatibility note for the selected block based on its role + parent section */
const blockRoleNote = computed<string | null>(() => {
  const block = store.selectedBlock
  const schema = store.selectedBlockSchema
  if (!block || !schema) return null

  const roleNotes = schema.roleNotes
  if (!roleNotes) return null

  const role = (block as any).layoutRole as string | null
  if (!role || !roleNotes[role]) return null

  return roleNotes[role]
})

/** Breadcrumb showing context path: e.g. ["Layout", "Header"] or ["Section Name", "Block Name"] */
const breadcrumb = computed<string[]>(() => {
  if (store.showLayoutSettings) {
    return ['Layout', layoutTitle.value]
  }
  if (store.showSectionSettings && store.selectedSection) {
    return ['Section', store.selectedSection.name || 'Untitled']
  }
  if (store.selectedBlock) {
    const sectionId = store.selectedBlock.sectionId
    const section = sectionId
      ? store.sections.find((s: any) => s.id === sectionId)
      : null
    const crumbs = ['Page']
    if (section) crumbs.push(section.name || 'Untitled Section')
    crumbs.push(blockTitle.value)
    return crumbs
  }
  return []
})

const blockTitle = computed(() => {
  if (!store.selectedBlockSchema) return 'Block Settings'
  const label = store.selectedBlockSchema.label
  if (typeof label === 'object' && label !== null) {
    return (label as any)['en-US'] || Object.values(label)[0]
  }
  return label || 'Block Settings'
})

const layoutTitle = computed(() => {
  const type = store.selectedLayoutType
  if (!type) return 'Layout Component'
  // Use label from schema if available
  const schema = store.layoutSchemas[type]
  if (schema?.label) {
    const label = schema.label as string | Record<string, string>
    return typeof label === 'string' ? label : (label['en-US'] || Object.values(label)[0] || type)
  }
  if (type === 'header') return 'Header'
  if (type === 'footer') return 'Footer'
  return 'Layout Component'
})

const layoutTypeAvailable = computed(() => {
  if (store.selectedLayoutType === 'header') return store.layoutMeta.hasHeader
  if (store.selectedLayoutType === 'footer') return store.layoutMeta.hasFooter
  return true
})

const previewedLayoutId = computed(() => store.currentPage?.layout || 'default')

/**
 * A preset is a coherent combination of the schema's own fields, applied on top
 * of the settings already authored — it goes through the layout save lane so it
 * autosaves and lands on the undo stack like any other edit.
 */
function applyLayoutPreset(preset: BlockPreset | null) {
  if (!preset) return
  onLayoutSettingsChange({ ...localLayoutSettings.value, ...preset.settings })
}

function queueBlockSave(newSettings: Record<string, any>) {
  const block = store.selectedBlock
  const pageId = store.currentPage?.id
  if (!block || !pageId) return

  const blockId = block.id
  const key = blockSaveKey(blockId)
  const payload = immutableSavePayload(buildFullSettings(
    newSettings,
    immutableSavePayload(block.settings || {}),
    isAuthAware.value,
    authState.value,
  ))

  previewBlockSettingsInState(store.blocks, blockId, payload)
  changes.queue({
    key,
    surface: 'block',
    scope: pageScope(pageId),
    label: `Block ${block.type}`,
    valid: activeFormValid.value,
    blockedReason: 'Fix block validation errors before saving',
    focusInvalid: focusValidationErrors,
    run: async ({ isCurrent }) => {
      assertSavePageStillActive(pageId)
      await store.updateBlock(blockId, payload, { shouldApplyResponse: isCurrent })
    },
  })
}

function queueLayoutSave(newSettings: Record<string, any>) {
  const type = store.selectedLayoutType
  const siteId = store.siteId
  if (!type || !siteId) return

  const key = layoutSaveKey(type)
  const existingSettings = immutableSavePayload(store.layoutSettings[type] || {})
  const payload = immutableSavePayload(buildFullLayoutSettings(
    newSettings,
    existingSettings,
    isLayoutAuthAware.value,
    layoutAuthState.value,
  ))

  store.previewLayoutSettings(type, payload)
  changes.queue({
    key,
    surface: 'layout',
    scope: editorChangeScope.site(siteId),
    label: `${type} layout`,
    valid: activeFormValid.value,
    blockedReason: 'Fix layout validation errors before saving',
    focusInvalid: focusValidationErrors,
    run: async ({ isCurrent }) => {
      await store.updateLayoutSettings(type, payload, { shouldApplyResponse: isCurrent })
    },
  })
}

function onBlockSettingsChange(newSettings: Record<string, any>) {
  localBlockSettings.value = newSettings
  history.push({ ...newSettings })
  queueBlockSave(newSettings)
}

function onLayoutSettingsChange(newSettings: Record<string, any>) {
  localLayoutSettings.value = newSettings
  history.push({ ...newSettings })
  queueLayoutSave(newSettings)
}

/**
 * A block schema is now split across two forms (Content tab and Layout tab), so
 * validity is tracked per form and combined — otherwise the last form to emit
 * would erase the other's errors and let an invalid setting save.
 */
type FormSource = 'content' | 'layout'

const formValidity = ref<Record<FormSource, { valid: boolean; errors: Record<string, string> }>>({
  content: { valid: true, errors: {} },
  layout: { valid: true, errors: {} },
})

function resetFormValidity() {
  formValidity.value = {
    content: { valid: true, errors: {} },
    layout: { valid: true, errors: {} },
  }
}

function onContentValidityChange(valid: boolean, errors: Record<string, string>) {
  formValidity.value = { ...formValidity.value, content: { valid, errors } }
  applyFormValidity()
}

function onLayoutValidityChange(valid: boolean, errors: Record<string, string>) {
  formValidity.value = { ...formValidity.value, layout: { valid, errors } }
  applyFormValidity()
}

function applyFormValidity() {
  const sources = Object.values(formValidity.value)
  onFormValidityChange(
    sources.every(source => source.valid),
    sources.reduce<Record<string, string>>((acc, source) => ({ ...acc, ...source.errors }), {}),
  )
}

function onFormValidityChange(valid: boolean, errors: Record<string, string>) {
  activeFormValid.value = valid
  validationErrors.value = { ...errors }

  if (store.showLayoutSettings) {
    const type = store.selectedLayoutType
    if (type) changes.setValidity(
      layoutSaveKey(type),
      valid,
      'Fix layout validation errors before saving',
      focusValidationErrors,
    )
  } else {
    const blockId = store.selectedBlockId
    if (blockId) changes.setValidity(
      blockSaveKey(blockId),
      valid,
      'Fix block validation errors before saving',
      focusValidationErrors,
    )
  }
}

// Undo/redo handlers. Only block and layout settings are tracked; section and
// page settings have no history. `historyTarget` gates both the toolbar and
// these handlers so a stack is never popped for a surface that cannot apply it.
function applyHistoryState(state: Record<string, any>) {
  if (historyTarget.value === 'block') {
    localBlockSettings.value = state
    queueBlockSave(state)
  } else if (historyTarget.value === 'layout') {
    localLayoutSettings.value = state
    queueLayoutSave(state)
  }
}

function handleUndo() {
  if (!historyTarget.value) return
  const state = history.undo()
  if (!state) return
  applyHistoryState(state)
}

function handleRedo() {
  if (!historyTarget.value) return
  const state = history.redo()
  if (!state) return
  applyHistoryState(state)
}

function retryLastSave() {
  const key = activeSettingsJob.value?.key
  if (key) void changes.flushJob(key, true)
}

function retryPageSaves() {
  void changes.flushKeys(activePageJobs.value.map(job => job.key), true)
}

async function deleteBlock() {
  if (store.selectedBlockId && confirm('Are you sure you want to delete this block?')) {
    await store.deleteBlock(store.selectedBlockId)
  }
}

// --- Section action bar ---

const sectionIndex = computed(() => {
  if (!store.selectedSectionId) return -1
  const sorted = (store.sections as any[]).slice().sort((a: any, b: any) => a.position - b.position)
  return sorted.findIndex((s: any) => s.id === store.selectedSectionId)
})

const sectionCount = computed(() => (store.sections as any[]).length)

/** True while any section mutation (delete/duplicate/move) is in-flight. Disables the entire action bar to prevent double-fire races. */
const pendingSectionAction = ref(false)

async function deleteSection() {
  if (!store.selectedSectionId || !store.currentPage) return
  if (!confirm('Delete this section? Its blocks will become orphaned.')) return
  if (pendingSectionAction.value) return
  pendingSectionAction.value = true
  try {
    await store.deleteSection(store.currentPage.id, store.selectedSectionId)
  } finally {
    pendingSectionAction.value = false
  }
}

async function duplicateSection() {
  if (!store.selectedSectionId || !store.currentPage) return
  if (pendingSectionAction.value) return
  pendingSectionAction.value = true
  try {
    await store.duplicateSection(store.currentPage.id, store.selectedSectionId)
  } finally {
    pendingSectionAction.value = false
  }
}

async function moveSectionUp() {
  if (!store.currentPage || sectionIndex.value <= 0) return
  if (pendingSectionAction.value) return
  pendingSectionAction.value = true
  try {
    const sorted = (store.sections as any[]).slice().sort((a: any, b: any) => a.position - b.position)
    const ids = sorted.map((s: any) => s.id)
    const idx = sectionIndex.value
    ;[ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]]
    await store.reorderSections(store.currentPage.id, ids)
  } finally {
    pendingSectionAction.value = false
  }
}

async function moveSectionDown() {
  if (!store.currentPage || sectionIndex.value >= sectionCount.value - 1) return
  if (pendingSectionAction.value) return
  pendingSectionAction.value = true
  try {
    const sorted = (store.sections as any[]).slice().sort((a: any, b: any) => a.position - b.position)
    const ids = sorted.map((s: any) => s.id)
    const idx = sectionIndex.value
    ;[ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]]
    await store.reorderSections(store.currentPage.id, ids)
  } finally {
    pendingSectionAction.value = false
  }
}

</script>

<style scoped>
.settings-panel {
  height: 100%;
}

.settings-panel__breadcrumb {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 8px 12px;
  font-size: 11px;
  color: var(--cms-ink-subtle);
  border-bottom: 1px solid var(--cms-line);
  background: var(--cms-surface-subtle);
  border-radius: 6px 6px 0 0;
  margin-bottom: 0;
}

.settings-panel__templated-banner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: var(--cms-accent-soft);
  border: 1px solid var(--cms-accent-soft);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--cms-accent-pressed);
}

.settings-panel__templated-banner-text {
  flex: 1;
}

.settings-panel__templated-banner-link {
  color: var(--cms-accent);
  text-decoration: underline;
}

.settings-panel__breadcrumb-sep {
  margin: 0 4px;
  color: var(--cms-line);
}

.settings-panel__breadcrumb-item--current {
  color: var(--cms-ink-body);
  font-weight: 600;
}

.settings-panel__validation-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  margin-bottom: 8px;
  background: var(--cms-danger-soft);
  border: 1px solid var(--cms-danger-soft);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--cms-danger);
}

.settings-panel__content {
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  padding: 24px;
}

.settings-panel__header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--cms-line);
}

.settings-panel__header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  /* Let a long title truncate rather than push the type chip and save status
     past the panel edge. `min-width: 0` is required for a flex child to shrink
     below its content width. */
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-panel__type {
  font-size: 12px;
  color: var(--cms-ink-muted);
  font-family: monospace;
  background: var(--cms-surface-subtle);
  padding: 2px 8px;
  border-radius: 4px;
}

.settings-panel__layout-pick {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0 0 1rem;
}
.settings-panel__layout-pick label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--cms-ink-muted);
}
.settings-panel__layout-pick select {
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--cms-border);
  border-radius: 4px;
  font-size: 0.85rem;
  background: var(--cms-surface);
}
.settings-panel__layout-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.settings-panel__layout-badge {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  background: var(--cms-warn-soft);
  color: var(--cms-ink-muted);
}
.settings-panel__layout-reset {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--cms-accent, currentColor);
  text-decoration: underline;
  cursor: pointer;
}
.settings-panel__layout-reset:disabled {
  cursor: default;
  opacity: 0.6;
}
.settings-panel__layout-hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--cms-ink-muted);
}

.settings-panel__no-schema {
  color: var(--cms-ink-subtle);
  font-size: 14px;
  text-align: center;
  padding: 40px 20px;
}

.settings-panel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--cms-ink-subtle);
  text-align: center;
  padding: 40px;
}

.settings-panel__empty-icon {
  margin-bottom: 16px;
  opacity: 0.3;
}

.settings-panel__empty p {
  max-width: 300px;
  line-height: 1.5;
}

.settings-panel__actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--cms-line);
}

.settings-panel__save {
  padding: 10px 20px;
  background: var(--cms-accent);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.settings-panel__save:hover:not(:disabled) {
  background: var(--cms-accent);
}

.settings-panel__save:disabled {
  background: var(--cms-line);
  cursor: not-allowed;
}

.settings-panel__delete {
  padding: 10px 20px;
  background: white;
  color: var(--cms-danger);
  border: 1px solid var(--cms-danger);
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.settings-panel__delete:hover:not(:disabled) {
  background: var(--cms-danger);
  color: white;
}

.settings-panel__delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.settings-panel__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: var(--cms-accent-soft);
  border-radius: 6px;
  margin-bottom: 12px;
}

.settings-panel__locale-switcher {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.settings-panel__history {
  display: flex;
  gap: 4px;
}

.settings-panel__history-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: white;
  border: 1px solid var(--cms-line);
  border-radius: 4px;
  cursor: pointer;
  color: var(--cms-ink-body);
  padding: 0;
}

.settings-panel__history-btn:hover:not(:disabled) {
  background: var(--cms-line);
}

.settings-panel__history-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.settings-panel__locale-switcher label {
  color: var(--cms-ink-muted);
  white-space: nowrap;
}

.settings-panel__locale-switcher select {
  padding: 4px 8px;
  border: 1px solid var(--cms-line);
  border-radius: 4px;
  font-size: 13px;
  background: white;
  cursor: pointer;
}

.settings-panel__locale-badge {
  font-size: 12px;
  color: var(--cms-ink-muted);
  background: var(--cms-surface-subtle);
  padding: 2px 8px;
  border-radius: 4px;
}

.settings-panel__layout-hidden-notice {
  margin: 0 0 14px;
  padding: 8px 10px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--cms-ink-subtle);
  background: var(--cms-surface-subtle);
  border-radius: 6px;
}
.settings-panel__auth-hint {
  margin: -10px 0 14px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--cms-ink-subtle);
}
.settings-panel__auth-toggle {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  background: var(--cms-surface-subtle);
  border-radius: 6px;
  padding: 3px;
}

.settings-panel__auth-tab {
  flex: 1;
  padding: 5px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: var(--cms-ink-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.settings-panel__auth-tab:hover:not(.settings-panel__auth-tab--active) {
  background: var(--cms-line);
  color: var(--cms-ink-body);
}

.settings-panel__auth-tab--active {
  background: white;
  color: var(--cms-accent);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.settings-panel__role-warning {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 10px 12px;
  margin-bottom: 16px;
  border-radius: 6px;
  background-color: var(--cms-warn-soft);
  border: 1px solid var(--cms-warn-soft);
  font-size: 12px;
  line-height: 1.5;
  color: var(--cms-warn);
}

.settings-panel__role-warning-icon {
  flex-shrink: 0;
  margin-top: 2px;
  opacity: 0.8;
}

.settings-panel__tab-content {
  padding-top: 12px;
}

.settings-panel__actions--section {
  justify-content: flex-start;
}

.settings-panel__action-btn {
  padding: 10px 16px;
  background: white;
  color: var(--cms-ink-body);
  border: 1px solid var(--cms-line);
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.settings-panel__action-btn:hover:not(:disabled) {
  background: var(--cms-surface-subtle);
  border-color: var(--cms-ink-subtle);
}

.settings-panel__action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

</style>
