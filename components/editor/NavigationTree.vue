<template>
  <div class="nav-tree">
    <!-- Site-wide styles -->
    <button
      class="nav-tree__theme-btn"
      :class="{ 'nav-tree__theme-btn--active': store.showThemeSettings }"
      @click="store.selectThemeSettings()"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
      <span>{{ t('admin.editor.siteStyles', 'Site styles') }}</span>
    </button>

    <!-- Page Selector -->
    <div class="nav-tree__page-select">
      <select
        class="nav-tree__select"
        :value="selectedDropdownValue"
        :disabled="pageTransitionPending"
        @change="onPageChange"
      >
        <option v-for="entry in orderedPages" :key="entry.page.id" :value="entry.page.id">
          {{ pageIndentPrefix(entry.depth) }}{{ getPageTitle(entry.page) }}{{ isCanvasPage(entry.page) ? ' · canvas' : '' }}
        </option>
        <option v-if="store.childSitePages.length > 0" disabled>── Child Sites ──</option>
        <option
          v-for="child in store.childSitePages"
          :key="'child:' + child.mountPath"
          :value="'child:' + child.mountPath"
        >
          ↳ {{ child.label }}
        </option>
      </select>
    </div>

    <!-- Page Settings Button -->
    <button
      v-if="store.currentPage"
      class="nav-tree__page-settings-btn"
      :class="{ 'nav-tree__page-settings-btn--active': store.showPageSettings }"
      data-action="page-settings"
      type="button"
      @click="store.selectPageSettings()"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
      <span>{{ t('admin.editor.pageDetails', 'Page details') }}</span>
    </button>

    <!-- Dynamic slug params (shown only for pages with [param] segments in slug) -->
    <div v-if="store.dynamicSlugParams.length > 0" class="nav-tree__route-params">
      <div class="nav-tree__section-label">{{ t('admin.editor.previewData', 'Preview data') }}</div>
      <div
        v-for="param in store.dynamicSlugParams"
        :key="param"
        class="nav-tree__param-row"
      >
        <label class="nav-tree__param-label">{{ param }}</label>
        <input
          class="nav-tree__param-input"
          type="text"
          :value="store.previewRouteParams[param] || ''"
          :placeholder="`Enter ${param}…`"
          @input="store.setPreviewRouteParam(param, ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <!-- Undo/Redo Buttons -->
    <div v-if="store.blocks.length > 0" class="nav-tree__history-controls">
      <button
        class="nav-tree__history-btn"
        :disabled="!store.canUndoBlocks"
        @click="store.undoBlockChange()"
        title="Undo block change (Ctrl+Z)"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 3a5 5 0 1 1-4.546 2.914.5.5 0 0 0-.908-.417A6 6 0 1 0 8 2v1z"/>
          <path d="M8 4.466V.534a.25.25 0 0 0-.41-.192L5.23 2.308a.25.25 0 0 0 0 .384l2.36 1.966A.25.25 0 0 0 8 4.466z"/>
        </svg>
      </button>
      <button
        class="nav-tree__history-btn"
        :disabled="!store.canRedoBlocks"
        @click="store.redoBlockChange()"
        title="Redo block change (Ctrl+Shift+Z)"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
          <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
        </svg>
      </button>
    </div>

    <!-- Header (Layout Component — site-level, reachable from every page) -->
    <div
      class="nav-tree__item nav-tree__item--layout"
      :class="{ 'nav-tree__item--selected': store.selectedLayoutType === 'header' }"
      @click="store.selectLayoutComponent('header')"
    >
      <span class="nav-tree__icon">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
          <rect x="1" y="1" width="14" height="4" rx="2" fill="currentColor"/>
        </svg>
      </span>
      <span class="nav-tree__label">Header</span>
    </div>

    <!-- Static layout components (e.g. FilterPanel, SearchBar in shop layout) -->
    <div
      v-for="type in layoutStaticComponents"
      :key="type"
      class="nav-tree__item nav-tree__item--layout"
      :class="{ 'nav-tree__item--selected': store.selectedLayoutType === type }"
      @click="store.selectLayoutComponent(type)"
    >
      <span class="nav-tree__icon">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
          <rect x="3" y="5" width="10" height="1.5" rx="0.5" fill="currentColor"/>
          <rect x="3" y="8" width="7" height="1.5" rx="0.5" fill="currentColor"/>
          <rect x="3" y="11" width="5" height="1.5" rx="0.5" fill="currentColor"/>
        </svg>
      </span>
      <span class="nav-tree__label">{{ getLayoutComponentLabel(type) }}</span>
      <span class="nav-tree__badge">Layout</span>
    </div>

    <div class="nav-tree__divider"></div>

    <!-- Templated-page short-circuit (Blog-2 § 2.F.1).
         When the current page resolves to a structured template (component +
         non-empty contentSchema), the page-builder block list is suppressed —
         content lives in `pages.contentData` and is edited via the article/blog
         editor. Sections + blocks + Add-block button are intentionally hidden. -->
    <div v-if="isTemplatedPage" class="nav-tree__templated-notice">
      <span class="nav-tree__section-label">Template</span>
      <p class="nav-tree__templated-text">
        {{ t('admin.editor.templatedNotice', 'This page is built from a template, so it has no block list. Its text and images are edited in the content manager — but the template\'s own options are right here.') }}
      </p>
      <!--
        The note used to end at "edit it somewhere else", which read as a dead
        end: an admin standing in front of the one screen that CAN change this
        page's template settings was told to leave. The settings live behind
        Page details, so point at it — and select it directly rather than
        describing where to click.
      -->
      <button
        class="nav-tree__templated-action"
        data-action="templated-page-settings"
        type="button"
        @click="store.selectPageSettings()"
      >
        {{ t('admin.editor.templatedNoticeAction', 'Open template settings') }}
      </button>
    </div>
    <template v-else>
      <!-- Section List (when page has sections). It nests each section's
           components (blocks) under the selected section row, so the flat block
           list below is only for pages WITHOUT sections. -->
      <SectionList v-if="hasSections" @add-block="showAddModal = true" />

      <!-- Blocks Section — flat pages only (no sections). Section pages edit
           their blocks via the nested component rows inside SectionList. -->
      <template v-if="!hasSections">
      <div class="nav-tree__section-label">
        Page content
      </div>

      <div v-if="blocksForDisplay.length === 0" class="nav-tree__empty">
        {{ hasSections && store.activeSectionId ? 'No blocks in this section.' : 'No blocks on this page.' }}
      </div>

      <div
        v-for="(block, index) in blocksForDisplay"
        :key="block.id"
        class="nav-tree__item nav-tree__item--block"
        :class="{
          'nav-tree__item--selected': store.selectedBlockId === block.id,
          'nav-tree__item--drag-over': dragOverIndex === index,
        }"
        :draggable="true"
        @click="store.selectBlock(block.id)"
        @dragstart="onDragStart($event, index)"
        @dragover.prevent="onDragOver($event, index)"
        @dragleave="onDragLeave"
        @drop="onDrop($event, index)"
        @dragend="onDragEnd"
      >
        <span class="nav-tree__drag">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M7 2a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-3 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-3 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
          </svg>
        </span>
        <span class="nav-tree__label">{{ getBlockLabel(block) }}</span>
        <span class="nav-tree__block-actions">
          <button
            class="nav-tree__block-action"
            type="button"
            title="Copy block (Ctrl+C)"
            @click.stop="copyBlockRow(block)"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
              <rect x="5.5" y="5.5" width="8" height="9" rx="1.5" />
              <path d="M10.5 5.5V3.5a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3.5V10a1.5 1.5 0 0 0 1.5 1.5h1.5" />
            </svg>
          </button>
          <button
            class="nav-tree__block-action"
            type="button"
            title="Duplicate block (Ctrl+D)"
            @click.stop="store.duplicateBlock(block.id)"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
              <rect x="2.5" y="2.5" width="8" height="8" rx="1.5" />
              <path d="M5.5 10.5V12A1.5 1.5 0 0 0 7 13.5h5A1.5 1.5 0 0 0 13.5 12V7A1.5 1.5 0 0 0 12 5.5h-1.5" />
            </svg>
          </button>
        </span>
      </div>

      <!-- Add Block Button -->
      <button
        v-if="store.currentPage"
        class="nav-tree__add-btn"
        @click="showAddModal = true"
      >
        + Add block
      </button>

      <!-- Paste Block Button (shown when a block is on the clipboard) -->
      <button
        v-if="store.currentPage && clipboard.hasCopiedBlock"
        class="nav-tree__paste-btn"
        :title="`Paste block (Ctrl+V)`"
        @click="store.pasteBlock()"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
          <rect x="3" y="3.5" width="10" height="11" rx="1.5" />
          <path d="M6 3.5V2.75A.75.75 0 0 1 6.75 2h2.5a.75.75 0 0 1 .75.75V3.5" />
        </svg>
        Paste “{{ clipboard.copiedBlock?.label }}”
      </button>
      </template>
    </template>

    <div class="nav-tree__divider"></div>

    <!-- Footer (Layout Component — site-level, reachable from every page) -->
    <div
      class="nav-tree__item nav-tree__item--layout"
      :class="{ 'nav-tree__item--selected': store.selectedLayoutType === 'footer' }"
      @click="store.selectLayoutComponent('footer')"
    >
      <span class="nav-tree__icon">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
          <rect x="1" y="11" width="14" height="4" rx="2" fill="currentColor"/>
        </svg>
      </span>
      <span class="nav-tree__label">Footer</span>
    </div>

    <!-- Add Block Modal -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="closeAddModal">
      <div class="block-picker" :aria-busy="blockAddPending || undefined">
        <div class="block-picker__header">
          <h3>{{ showPresetStep ? 'Choose Preset' : 'Add Block' }}</h3>
          <button class="block-picker__close" :disabled="blockAddPending" @click="closeAddModal">&times;</button>
        </div>
        <div class="block-picker__body">
          <div v-if="blockAddError" class="block-picker__error" role="alert">
            {{ blockAddError }}
          </div>
          <div v-else-if="blockAddPending" class="block-picker__pending" role="status">
            Adding component…
          </div>
          <!-- Block type selection -->
          <div v-if="!showPresetStep">
            <div class="block-picker__search">
              <span class="material-icons-outlined block-picker__search-icon">search</span>
              <input
                ref="blockSearchEl"
                v-model="blockQuery"
                type="text"
                class="block-picker__search-input"
                placeholder="Search all components…"
                aria-label="Search all components"
                :disabled="blockAddPending"
                @keydown.enter.prevent="onBlockSearchEnter"
              />
            </div>

            <div class="block-picker__surface-note">
              <span class="block-picker__surface-badge">{{ isCanvasBlockPicker ? 'Canvas' : 'Site' }}</span>
              <span v-if="isCanvasBlockPicker">Canvas essentials are shown first. Every site component remains available.</span>
              <span v-else>Site components are shown first. Canvas essentials remain available.</span>
            </div>

            <div v-if="groupedBlockTypes.length === 0" class="block-picker__empty">
              {{ emptyBlockPickerMessage }}
            </div>

            <div
              v-for="group in groupedBlockTypes"
              :key="group.key"
              class="block-picker__group"
            >
              <div class="block-picker__category">{{ group.label }}</div>
              <div class="block-types">
                <button
                  v-for="[type, schema] in group.blocks"
                  :key="type"
                  class="block-type"
                  :data-block-type="type"
                  :disabled="blockAddPending"
                  @click="onBlockTypeSelect(String(type))"
                >
                  <span class="block-type__heading">
                    <span class="block-type__name">{{ getSchemaLabel(schema) }}</span>
                    <span v-if="getBlockCatalogBadges(schema).length" class="block-type__badges">
                      <span
                        v-for="badge in getBlockCatalogBadges(schema)"
                        :key="badge.key"
                        class="block-type__badge"
                        :class="`block-type__badge--${badge.tone}`"
                      >
                        {{ badge.label }}
                      </span>
                    </span>
                  </span>
                  <span v-if="getSchemaDescription(schema)" class="block-type__description">
                    {{ getSchemaDescription(schema) }}
                  </span>
                  <span class="block-type__id">{{ type }}</span>
                </button>
              </div>
            </div>
          </div>
          <!-- Preset selection -->
          <div v-else class="block-types">
            <button class="block-type block-type--back" :disabled="blockAddPending" @click="backToBlockTypes">
              <span class="block-type__name">&larr; Back to block types</span>
            </button>
            <BlockPresetPicker
              :presets="selectedBlockPresets"
              @select="onPresetSelect"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Keyboard shortcut cheat-sheet (toggled with `?`; Teleports to body) -->
    <KeyboardShortcutsOverlay :open="showShortcuts" @close="showShortcuts = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useEditorStore } from '~/admin/stores/editorStore'
import { useClipboardStore } from '~/admin/stores/clipboardStore'
import { getLocalizedLabel, getSchemaLabel } from '~/admin/utils/labelUtils'
import { BRAND_CANVAS_PAGE_META_KEY, BRAND_CANVAS_PAGE_TYPE } from '~/shared/types/brandCanvas'
import { readCanvasPreset } from '~/shared/features/layout/canvasPresets'
import {
  explicitlySupportsBlockSurface,
  isBlockSchemaInsertable,
  isBlockSchemaPreferredOnSurface,
} from '~/shared/features/cms/blockCatalog'
import { isRecord } from '~/shared/types/guards'
import { isModalDialogOpen } from '~/admin/composables/useModalDialog'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import SectionList from '~/admin/components/sections/SectionList.vue'
import BlockPresetPicker from '~/admin/components/editor/BlockPresetPicker.vue'
import KeyboardShortcutsOverlay from './KeyboardShortcutsOverlay.vue'
import type { BlockPreset } from '~/shared/types/blocks'
import type { BlockSchema, BlockSchemaSurface } from '~/shared/types/theme'
import { EDITOR_WRITE_LOCK_KEY } from '~/admin/components/editor/editorWriteLock'

const store = useEditorStore()
const clipboard = useClipboardStore()
const { t } = useAdminI18n()
const showAddModal = ref(false)
const selectedBlockType = ref<string | null>(null)
const showPresetStep = ref(false)
const showShortcuts = ref(false)
const pageTransitionPending = ref(false)
const blockAddPending = ref(false)
const blockAddError = ref<string | null>(null)
const editorWriteLocked = inject(EDITOR_WRITE_LOCK_KEY, computed(() => false))

// Add-Block picker: type-to-filter + category grouping.
const blockQuery = ref('')
const blockSearchEl = ref<HTMLInputElement | null>(null)

// Autofocus the search box whenever the Add-Block modal opens.
watch(showAddModal, (open) => {
  if (open) {
    blockAddError.value = null
    nextTick(() => {
      blockSearchEl.value?.focus()
    })
  }
})

const hasSections = computed(() => (store.sections?.length ?? 0) > 0)

/**
 * "Templated page" gate (Blog-2 § 2.F.1): the current page resolves to a
 * structured template with a renderer `component` + non-empty `contentSchema`.
 * Block list authoring is suppressed for these — content lives in
 * `pages.contentData` and is edited via the Article/Blog manager.
 */
const isTemplatedPage = computed(() => {
  const tplId = store.currentPage?.templateId
  if (!tplId) return false
  const manifest = store.themeManifest as { templates?: any[] } | null
  const templates = Array.isArray(manifest?.templates) ? manifest.templates : []
  const tpl = templates.find((t: any) => t?.id === tplId)
  if (!tpl) return false
  return !!(tpl.component && Array.isArray(tpl.contentSchema) && tpl.contentSchema.length > 0)
})

// When sections exist, show only blocks for the selected section (or orphaned blocks)
const blocksForDisplay = computed(() => {
  if (!hasSections.value) return store.blocks
  if (store.activeSectionId) {
    return store.sectionBlocks?.(store.activeSectionId) ?? []
  }
  return store.blocks
})

// Static layout components for the current page's layout (e.g. filter-panel, search-bar in shop layout)
const layoutStaticComponents = computed(() => {
  const currentLayout = store.currentPage?.layout || 'default'
  const layouts = store.themeManifest?.layout?.layouts as Array<{ id: string; staticComponents?: string[] }> | undefined
  const layoutDef = layouts?.find(l => l.id === currentLayout)
  return layoutDef?.staticComponents ?? []
})

// Current dropdown value: either a page ID or "child:<mountPath>"
const selectedDropdownValue = computed(() => {
  if (store.activeChildPageSlug) return 'child:' + store.activeChildPageSlug
  return store.currentPage?.id ?? ''
})

// Ordered page list: top-level pages with their children interleaved
/**
 * Brand canvases are ordinary pages to the editor, but an author scanning the
 * dropdown should not mistake one for site content. The list rows carry
 * `pageType`; the meta mirror is a fallback for the currently-open page,
 * whose full record has meta but whose list row may predate the type.
 */
function isCanvasPage(page: { pageType?: unknown; meta?: unknown }): boolean {
  if (page.pageType === BRAND_CANVAS_PAGE_TYPE) return true
  return isRecord(page.meta) && BRAND_CANVAS_PAGE_META_KEY in page.meta
}

type PageListItem = (typeof store.pages)[number]

interface OrderedPageEntry {
  page: PageListItem
  /** 0 = top level; one step per ancestor actually present in the list. */
  depth: number
}

/**
 * `<option>` cannot carry markup, so nesting is spelled with characters:
 * three non-breaking spaces per ancestor level, then an em dash.
 */
const PAGE_INDENT_UNIT = '\u00A0\u00A0\u00A0'

function pageIndentPrefix(depth: number): string {
  if (depth <= 0) return ''
  return PAGE_INDENT_UNIT.repeat(depth - 1) + '— '
}

/** Authored sibling order lives in `position` — never in array or key order. */
function byPosition(pages: PageListItem[]): PageListItem[] {
  return [...pages].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
}

/**
 * Flattens the page tree to arbitrary depth, depth-first, siblings in authored
 * `position` order. Three properties this list must hold on a real site:
 *
 * - **No page disappears.** A page whose `parentId` points at something absent
 *   from the list (unpublished parent, partial fetch) is an orphan and renders
 *   at top level, after the real roots. Same for any page trapped in a
 *   `parentId` cycle — it is emitted at top level once the tree walk is done.
 * - **No hang.** `visited` makes a cycle terminate instead of recursing forever.
 * - **Linear.** The children index is built once; filtering `store.pages` per
 *   node would be O(n²) on a 140-page site that rebuilds on every mutation.
 */
const orderedPages = computed<OrderedPageEntry[]>(() => {
  const pages = store.pages
  const ids = new Set(pages.map(p => p.id))

  const childrenOf = new Map<string, PageListItem[]>()
  const roots: PageListItem[] = []
  const orphans: PageListItem[] = []

  for (const page of pages) {
    const parentId = page.parentId
    if (!parentId) {
      roots.push(page)
    } else if (!ids.has(parentId)) {
      orphans.push(page)
    } else {
      const bucket = childrenOf.get(parentId)
      if (bucket) bucket.push(page)
      else childrenOf.set(parentId, [page])
    }
  }

  const result: OrderedPageEntry[] = []
  const visited = new Set<string>()
  const stack: OrderedPageEntry[] = []

  function pushLevel(level: PageListItem[], depth: number) {
    const ordered = byPosition(level)
    for (let i = ordered.length - 1; i >= 0; i--) {
      stack.push({ page: ordered[i], depth })
    }
  }

  function drain() {
    while (stack.length > 0) {
      const entry = stack.pop()
      if (!entry) break
      if (visited.has(entry.page.id)) continue
      visited.add(entry.page.id)
      result.push(entry)
      const children = childrenOf.get(entry.page.id)
      if (children) pushLevel(children, entry.depth + 1)
    }
  }

  // Stack is LIFO: orphans go under the roots, so they trail the real tree.
  pushLevel(orphans, 0)
  pushLevel(roots, 0)
  drain()

  // Anything still unvisited is inside a parentId cycle: surface it rather than
  // let it vanish from the picker.
  const stranded = pages.filter(p => !visited.has(p.id))
  if (stranded.length > 0) {
    pushLevel(stranded, 0)
    drain()
  }

  return result
})

// Drag-and-drop state
const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
let dragBlockId: string | null = null

// True when the keyboard event originates from a text-editing surface, so we
// leave native copy/paste/duplicate untouched while the author types.
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
}

// Keyboard shortcuts
function handleKeyDown(event: KeyboardEvent) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const isCtrlOrCmd = isMac ? event.metaKey : event.ctrlKey

  // Toggle the keyboard-shortcut cheat-sheet: `?` (Shift+/). Guarded so it never
  // hijacks a literal "?" typed into a settings field.
  if (event.key === '?' && !isCtrlOrCmd && !event.altKey && !isEditableTarget(event.target)) {
    event.preventDefault()
    showShortcuts.value = !showShortcuts.value
    return
  }

  // A modal dialog is open somewhere in the admin (media picker, either command
  // palette, the keyboard-shortcut cheat-sheet, a nested-blocks Add modal):
  // everything below this line mutates the block behind its backdrop, invisible
  // to the author. This subsumes the cheat-sheet's own `showShortcuts` guard,
  // because KeyboardShortcutsOverlay registers with `useModalDialog`. Deliberately
  // placed AFTER the `?` branch so an overlay that toggles on `?` can still close on it.
  if (isModalDialogOpen()) return
  if (editorWriteLocked.value) return

  // Undo/redo arbitrate by focus (I6). There are two histories — structural
  // block changes here, and settings-field history owned by SettingsPanel's
  // toolbar. Without this guard, typing in a settings field and pressing Cmd+Z
  // reverted a whole BLOCK instead of the author's last keystroke: one
  // keystroke, two stacks, no arbitration.
  //
  // Inside an editable target the browser's native text undo is correct, so we
  // neither handle nor preventDefault. Matches the clipboard shortcuts below,
  // which already defer to the field.
  const structuralHistoryKeys = !isEditableTarget(event.target)

  // Undo: Ctrl+Z or Cmd+Z
  if (structuralHistoryKeys && isCtrlOrCmd && event.key === 'z' && !event.shiftKey) {
    if (store.canUndoBlocks) {
      event.preventDefault()
      store.undoBlockChange()
    }
  }

  // Redo: Ctrl+Shift+Z or Cmd+Shift+Z
  if (structuralHistoryKeys && isCtrlOrCmd && event.key === 'z' && event.shiftKey) {
    if (store.canRedoBlocks) {
      event.preventDefault()
      store.redoBlockChange()
    }
  }

  // Alternative Redo: Ctrl+Y or Cmd+Y
  if (structuralHistoryKeys && isCtrlOrCmd && event.key === 'y') {
    if (store.canRedoBlocks) {
      event.preventDefault()
      store.redoBlockChange()
    }
  }

  // Block clipboard shortcuts — suppressed while editing text in a field so
  // the OS clipboard keeps working in the settings panel.
  if (isCtrlOrCmd && !event.shiftKey && !isEditableTarget(event.target)) {
    // Duplicate selected block: Ctrl+D
    if (event.key === 'd' && store.selectedBlockId) {
      event.preventDefault()
      store.duplicateBlock(store.selectedBlockId)
      return
    }

    // Copy selected block: Ctrl+C (unless the author has a live text selection)
    if (event.key === 'c' && store.selectedBlockId) {
      const hasTextSelection = (window.getSelection()?.toString().length ?? 0) > 0
      if (!hasTextSelection) {
        const block = store.blocks.find(b => b.id === store.selectedBlockId)
        if (block) {
          event.preventDefault()
          store.copyBlock(block.id, getBlockLabel(block))
        }
      }
      return
    }

    // Paste clipboard block onto the current page: Ctrl+V
    if (event.key === 'v' && clipboard.hasCopiedBlock && store.currentPage) {
      event.preventDefault()
      store.pasteBlock()
      return
    }
  }

  // Non-modifier block shortcuts — suppressed while editing text so Delete /
  // Backspace / Escape keep their native meaning inside settings-panel fields.
  if (!isCtrlOrCmd && !event.altKey && !isEditableTarget(event.target)) {
    // Delete the selected block: Delete or Backspace. Undoable via Ctrl+Z
    // (deleteBlock pushes block history), so no confirm dialog is needed.
    if ((event.key === 'Delete' || event.key === 'Backspace') && store.selectedBlockId) {
      event.preventDefault()
      store.deleteBlock(store.selectedBlockId)
      return
    }

    // Deselect the current block: Escape (leave native Escape intact for other
    // listeners — no preventDefault).
    if (event.key === 'Escape' && store.selectedBlockId) {
      store.deselectAll()
      return
    }
  }
}

function copyBlockRow(block: any) {
  store.copyBlock(block.id, getBlockLabel(block))
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

function onDragStart(event: DragEvent, index: number) {
  dragBlockId = store.blocks[index]?.id ?? null
  dragIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function onDragOver(event: DragEvent, index: number) {
  if (dragIndex.value === null || dragIndex.value === index) return
  dragOverIndex.value = index
}

function onDragLeave() {
  dragOverIndex.value = null
}

function onDrop(event: DragEvent, toIndex: number) {
  dragOverIndex.value = null
  if (!dragBlockId) return
  const currentFrom = store.blocks.findIndex(b => b.id === dragBlockId)
  if (currentFrom === -1 || currentFrom === toIndex) {
    dragBlockId = null
    return
  }
  const newOrder = store.blocks.map(b => b.id)
  const [moved] = newOrder.splice(currentFrom, 1)
  newOrder.splice(toIndex, 0, moved)
  store.reorderBlocks(newOrder)
  dragBlockId = null
}

function onDragEnd() {
  dragBlockId = null
  dragIndex.value = null
  dragOverIndex.value = null
}

interface PickerLayoutDefinition {
  id: string
  allowedBlocks?: string[]
  canvasPreset?: unknown
}

const activePickerLayout = computed<PickerLayoutDefinition | null>(() => {
  const currentLayout = store.currentPage?.layout || 'default'
  const layouts = store.themeManifest?.layout?.layouts as PickerLayoutDefinition[] | undefined
  return layouts?.find(layout => layout.id === currentLayout) ?? null
})

/**
 * A brand-canvas page is authoritative. The layout marker is also accepted so
 * canvas-specific authoring works while a new page is being initialized or in
 * integrations that only provide the active theme layout.
 */
const blockPickerSurface = computed<BlockSchemaSurface>(() => {
  const page = store.currentPage
  if (page && isCanvasPage(page)) return 'canvas'
  return readCanvasPreset(activePickerLayout.value) ? 'canvas' : 'site'
})

const isCanvasBlockPicker = computed(() => blockPickerSurface.value === 'canvas')

const availableBlockTypes = computed(() => {
  const result: Record<string, BlockSchema> = {}
  const layoutAllowedBlocks = activePickerLayout.value?.allowedBlocks

  for (const [type, schema] of Object.entries(store.schemas)) {
    if (schema.isLayoutComponent || (schema as BlockSchema & { isNestedComponent?: boolean }).isNestedComponent) continue

    // Lifecycle controls insertion. Surface metadata only changes discovery
    // order; it never takes a component away from the other authoring surface.
    if (!isBlockSchemaInsertable(schema)) continue

    // If the current layout defines allowed blocks, filter to only those
    if (layoutAllowedBlocks && layoutAllowedBlocks.length > 0) {
      if (!layoutAllowedBlocks.includes(type)) continue
    }

    result[type] = schema
  }
  return result
})

// Fixed display order for known block categories; unknown categories sort
// alphabetically after these, and the "Other" bucket always renders last.
const CATEGORY_ORDER = ['hero', 'content', 'editorial', 'media', 'marketing', 'cta', 'navigation', 'utility', 'info', 'decorative']
const CATEGORY_LABELS: Record<string, string> = {
  cta: 'Call to Action',
}
const OTHER_CATEGORY_KEY = '__other__'

function humanizeCategory(cat: string): string {
  if (CATEGORY_LABELS[cat]) return CATEGORY_LABELS[cat]
  return cat.replace(/[-_]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
}

function getSchemaDescription(schema: Pick<BlockSchema, 'description'>): string {
  return getLocalizedLabel(schema.description)
}

interface BlockCatalogBadge {
  key: string
  label: string
  tone: 'canvas' | 'basic' | 'standard' | 'advanced'
}

function getBlockCatalogBadges(schema: BlockSchema): BlockCatalogBadge[] {
  const badges: BlockCatalogBadge[] = []
  if (explicitlySupportsBlockSurface(schema, 'canvas')) {
    badges.push({ key: 'canvas', label: 'Canvas ready', tone: 'canvas' })
  }
  if (schema.tier) {
    badges.push({
      key: `tier-${schema.tier}`,
      label: schema.tier.charAt(0).toUpperCase() + schema.tier.slice(1),
      tone: schema.tier,
    })
  }
  return badges
}

// Case-insensitive substring match across names, ids, descriptions and the
// author vocabulary supplied as schema keywords.
const filteredBlockTypes = computed<Array<[string, BlockSchema]>>(() => {
  const entries = Object.entries(availableBlockTypes.value)
  const q = blockQuery.value.trim().toLowerCase()
  if (!q) return entries
  return entries.filter(([type, schema]) => {
    const searchable = [
      getSchemaLabel(schema),
      type,
      getSchemaDescription(schema),
      ...(Array.isArray(schema.keywords) ? schema.keywords : []),
    ]
    return searchable.some(value => value.toLowerCase().includes(q))
  })
})

const emptyBlockPickerMessage = computed(() => {
  if (blockQuery.value.trim()) return `No components match “${blockQuery.value.trim()}”.`
  return isCanvasBlockPicker.value
    ? 'No components are available for this canvas layout.'
    : 'No components are available for this layout.'
})

interface BlockCategoryGroup {
  key: string
  label: string
  blocks: Array<[string, BlockSchema]>
}

function categoryGroups(entries: Array<[string, BlockSchema]>): BlockCategoryGroup[] {
  const groups = new Map<string, Array<[string, BlockSchema]>>()
  for (const [type, schema] of entries) {
    const raw = typeof schema?.category === 'string' && schema.category.trim()
      ? schema.category.trim()
      : OTHER_CATEGORY_KEY
    const bucket = groups.get(raw)
    if (bucket) {
      bucket.push([type, schema])
    } else {
      groups.set(raw, [[type, schema]])
    }
  }

  const orderIndex = (key: string): number => {
    const i = CATEGORY_ORDER.indexOf(key)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }

  const keys = [...groups.keys()].sort((a, b) => {
    if (a === OTHER_CATEGORY_KEY) return 1
    if (b === OTHER_CATEGORY_KEY) return -1
    const ia = orderIndex(a)
    const ib = orderIndex(b)
    if (ia !== ib) return ia - ib
    return a.localeCompare(b)
  })

  return keys.map((key) => ({
    key,
    label: key === OTHER_CATEGORY_KEY ? 'Other' : humanizeCategory(key),
    blocks: groups.get(key) ?? [],
  }))
}

// Surface metadata promotes the most useful starting set without hiding the
// rest. Canvas primitives form one concise essentials group; ordinary site
// components retain their familiar category structure.
const groupedBlockTypes = computed<BlockCategoryGroup[]>(() => {
  const preferred: Array<[string, BlockSchema]> = []
  const complementary: Array<[string, BlockSchema]> = []

  for (const entry of filteredBlockTypes.value) {
    if (isBlockSchemaPreferredOnSurface(entry[1], blockPickerSurface.value)) preferred.push(entry)
    else complementary.push(entry)
  }

  const canvasEntries = isCanvasBlockPicker.value ? preferred : complementary
  const siteEntries = isCanvasBlockPicker.value ? complementary : preferred
  const canvasGroup: BlockCategoryGroup[] = canvasEntries.length > 0
    ? [{ key: '__canvas_essentials', label: 'Canvas essentials', blocks: canvasEntries }]
    : []

  return isCanvasBlockPicker.value
    ? [...canvasGroup, ...categoryGroups(siteEntries)]
    : [...categoryGroups(siteEntries), ...canvasGroup]
})

// First block in display order — the target for Enter-to-select.
const firstMatchType = computed<string | null>(() => {
  for (const group of groupedBlockTypes.value) {
    if (group.blocks.length > 0) return group.blocks[0][0]
  }
  return null
})

function onBlockSearchEnter() {
  const first = firstMatchType.value
  if (first) onBlockTypeSelect(first)
}

// Block presets
const selectedBlockPresets = computed<BlockPreset[]>(() => {
  if (!selectedBlockType.value) return []
  const schema = store.schemas[selectedBlockType.value]
  return schema.presets || []
})

function getPageTitle(page: any): string {
  return getLocalizedLabel(page.title) || page.slug
}

function getBlockLabel(block: any): string {
  const schema = store.schemas[block.type]
  const label = getSchemaLabel(schema || null)
  if (label) return label

  if (block.type) {
    return block.type
      .replace(/[-_]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, (c: string) => c.toUpperCase())
  }
  return 'Unknown Block'
}

function getLayoutComponentLabel(type: string): string {
  const schema = store.schemas[type]
  const label = getSchemaLabel(schema || null)
  if (label) return label
  return type.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
}

async function onPageChange(event: Event) {
  const select = event.currentTarget as HTMLSelectElement
  if (pageTransitionPending.value) {
    select.value = selectedDropdownValue.value
    return
  }

  const value = select.value
  if (!value) return

  pageTransitionPending.value = true
  let transitioned = false
  try {
    if (value.startsWith('child:')) {
      const mountPath = value.slice(6)
      transitioned = await store.navigateToChildPage(mountPath)
    } else {
      transitioned = await store.switchPage(value)
    }
  } finally {
    if (!transitioned) select.value = selectedDropdownValue.value
    pageTransitionPending.value = false
  }
}

function onBlockTypeSelect(type: string) {
  const schema = store.schemas[type]
  const presets = schema.presets
  if (presets && presets.length > 0) {
    selectedBlockType.value = type
    showPresetStep.value = true
  } else {
    addBlockWithSettings(type)
  }
}

// Close + fully reset the Add-Block modal (including the search query) so the
// next open starts clean.
function closeAddModal() {
  if (blockAddPending.value) return
  showAddModal.value = false
  showPresetStep.value = false
  selectedBlockType.value = null
  blockQuery.value = ''
  blockAddError.value = null
}

async function addBlockWithSettings(type: string, presetSettings?: Record<string, any>) {
  if (blockAddPending.value) return
  blockAddPending.value = true
  blockAddError.value = null
  let created = null
  try {
    created = await store.addBlock(type, null, presetSettings, store.activeSectionId || undefined)
  } catch (error) {
    blockAddError.value = error instanceof Error ? error.message : 'Could not add this component'
  } finally {
    blockAddPending.value = false
  }

  if (created) closeAddModal()
  else if (!blockAddError.value) {
    blockAddError.value = store.error || 'Finish or retry the current change, then add the component again.'
  }
}

function addBlockFromPreset(preset: any) {
  if (selectedBlockType.value) {
    addBlockWithSettings(selectedBlockType.value, preset.settings || {})
  }
}

function onPresetSelect(preset: BlockPreset | null) {
  if (preset === null) {
    // "Default (no preset)" chosen — apply no settings
    if (selectedBlockType.value) addBlockWithSettings(selectedBlockType.value)
  } else {
    addBlockFromPreset(preset)
  }
}

function backToBlockTypes() {
  showPresetStep.value = false
  selectedBlockType.value = null
  blockQuery.value = ''
}
</script>

<style scoped>
.nav-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--cms-surface);
}

.nav-tree__theme-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  background: none;
  border: none;
  border-bottom: 1px solid var(--cms-border, var(--cms-line));
  font-size: 14px;
  font-weight: 500;
  color: var(--cms-ink, var(--cms-ink-body));
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.nav-tree__theme-btn:hover {
  background: var(--cms-brand-soft, var(--cms-accent-soft));
  color: var(--cms-brand, var(--cms-accent));
}

.nav-tree__theme-btn--active {
  background: var(--cms-brand-soft, var(--cms-accent-soft));
  color: var(--cms-brand, var(--cms-accent));
}

.nav-tree__theme-btn svg {
  flex-shrink: 0;
}

.nav-tree__page-settings-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  border-bottom: 1px solid var(--cms-border, var(--cms-line));
  font-size: 13px;
  color: var(--cms-muted, var(--cms-ink-muted));
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.nav-tree__page-settings-btn:hover {
  background: var(--cms-brand-soft, var(--cms-accent-soft));
  color: var(--cms-brand, var(--cms-accent));
}

.nav-tree__page-settings-btn--active {
  background: var(--cms-brand-soft, var(--cms-accent-soft));
  color: var(--cms-brand, var(--cms-accent));
}

.nav-tree__page-settings-btn svg {
  flex-shrink: 0;
}

.nav-tree__page-select {
  padding: 12px;
  border-bottom: 1px solid var(--cms-border, var(--cms-line));
}

.nav-tree__select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--cms-border-strong, var(--cms-line));
  border-radius: 6px;
  font-size: 14px;
  background: white;
}

.nav-tree__route-params {
  border-bottom: 1px solid var(--cms-border, var(--cms-line));
  padding-bottom: 8px;
}

.nav-tree__param-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
}

.nav-tree__param-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--cms-muted, var(--cms-ink-muted));
  width: 60px;
  flex-shrink: 0;
  font-family: monospace;
}

.nav-tree__param-input {
  flex: 1;
  padding: 5px 8px;
  border: 1px solid var(--cms-border-strong, var(--cms-line));
  border-radius: 6px;
  font-size: 13px;
  background: white;
  transition: border-color 0.15s;
}

.nav-tree__param-input:focus {
  outline: none;
  border-color: var(--cms-brand, var(--cms-accent));
}

.nav-tree__history-controls {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--cms-border, var(--cms-line));
}

.nav-tree__history-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: white;
  border: 1px solid var(--cms-border, var(--cms-line));
  border-radius: 6px;
  cursor: pointer;
  color: var(--cms-ink, var(--cms-ink-body));
  transition: background-color var(--cms-motion-fast) var(--cms-ease-out), border-color var(--cms-motion-fast) var(--cms-ease-out), color var(--cms-motion-fast) var(--cms-ease-out), transform var(--cms-motion-fast) var(--cms-ease-out);
}

.nav-tree__history-btn:hover:not(:disabled) {
  background: var(--cms-brand-soft, var(--cms-accent-soft));
  border-color: var(--cms-brand, var(--cms-accent));
  color: var(--cms-brand, var(--cms-accent));
}

.nav-tree__history-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.nav-tree__divider {
  height: 1px;
  background: var(--cms-border, var(--cms-line));
  margin: 8px 12px;
}

.nav-tree__section-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--cms-muted, var(--cms-ink-muted));
  padding: 8px 12px 4px;
}

.nav-tree__empty {
  padding: 12px;
  font-size: 13px;
  color: var(--cms-ink-subtle);
  font-style: italic;
}

.nav-tree__templated-notice {
  padding: 0 12px 8px;
}

.nav-tree__templated-text {
  margin: 4px 0 0;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--cms-ink-muted);
  background: var(--cms-surface-subtle);
  border: 1px dashed var(--cms-line);
  border-radius: 6px;
  line-height: 1.4;
}

/* Sits under the note it belongs to, full width so it reads as the note's
   action rather than a stray control in the sidebar. */
.nav-tree__templated-action {
  margin: 6px 0 0;
  padding: 6px 10px;
  width: 100%;
  font-size: 12px;
  font-weight: 500;
  color: var(--cms-ink);
  background: var(--cms-surface);
  border: 1px solid var(--cms-line);
  border-radius: 6px;
  cursor: pointer;
}

.nav-tree__templated-action:hover {
  background: var(--cms-surface-subtle);
}

.nav-tree__templated-action:focus-visible {
  outline: 2px solid var(--cms-accent, currentColor);
  outline-offset: 2px;
}

.nav-tree__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.nav-tree__item:hover {
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
}

.nav-tree__item--selected {
  background: var(--cms-brand, var(--cms-accent)) !important;
  color: white;
}

.nav-tree__item--selected .nav-tree__drag {
  color: rgba(255, 255, 255, 0.7);
}

.nav-tree__item--drag-over {
  border-top: 2px solid var(--cms-brand, var(--cms-accent));
}

.block-type--back {
  opacity: 0.7;
  font-style: italic;
}

.nav-tree__item--layout {
  padding-left: 12px;
}

.nav-tree__item--block {
  padding-left: 8px;
}

.nav-tree__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: currentColor;
}

.nav-tree__drag {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  cursor: grab;
  color: var(--cms-ink-subtle);
}

.nav-tree__drag:active {
  cursor: grabbing;
}

.nav-tree__label {
  flex: 1;
  font-size: 14px;
}

.nav-tree__badge {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--cms-ink-subtle);
  background: rgba(0, 0, 0, 0.06);
  padding: 2px 5px;
  border-radius: 3px;
  flex-shrink: 0;
}

.nav-tree__item--selected .nav-tree__badge {
  color: rgba(255, 255, 255, 0.75);
  background: rgba(255, 255, 255, 0.15);
}

.nav-tree__add-btn {
  margin: 8px 12px;
  padding: 10px;
  background: white;
  border: 1px dashed var(--cms-border-strong, var(--cms-line));
  border-radius: 6px;
  font-size: 13px;
  color: var(--cms-muted, var(--cms-ink-muted));
  cursor: pointer;
  text-align: center;
}

.nav-tree__add-btn:hover {
  border-color: var(--cms-brand, var(--cms-accent));
  color: var(--cms-brand, var(--cms-accent));
}

/* Per-block row actions (copy / duplicate) — revealed on hover or selection */
.nav-tree__block-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.12s;
  flex-shrink: 0;
}

.nav-tree__item--block:hover .nav-tree__block-actions,
.nav-tree__item--selected .nav-tree__block-actions {
  opacity: 1;
}

.nav-tree__block-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 4px;
  color: inherit;
  cursor: pointer;
  opacity: 0.75;
  transition: background 0.12s, opacity 0.12s;
}

.nav-tree__block-action:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.1);
}

.nav-tree__item--selected .nav-tree__block-action:hover {
  background: rgba(255, 255, 255, 0.22);
}

.nav-tree__paste-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0 12px 8px;
  padding: 9px 10px;
  background: var(--cms-brand-soft, var(--cms-accent-soft));
  border: 1px dashed rgba(46, 125, 50, 0.35);
  border-radius: 6px;
  font-size: 13px;
  color: var(--cms-brand, var(--cms-accent));
  cursor: pointer;
  text-align: center;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.nav-tree__paste-btn:hover {
  background: var(--cms-accent-soft);
  border-color: var(--cms-brand, var(--cms-accent));
}

.nav-tree__paste-btn svg {
  flex-shrink: 0;
}

/* Modal */
.modal-overlay {
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

.block-picker {
  background: white;
  border-radius: 8px;
  width: 400px;
  max-height: 80vh;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.block-picker__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--cms-line);
}

.block-picker__header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.block-picker__close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--cms-ink-muted);
  line-height: 1;
}

.block-picker__body {
  padding: 16px 20px;
  max-height: 60vh;
  overflow-y: auto;
}

.block-picker__error,
.block-picker__pending {
  margin: 0 0 12px;
  padding: 9px 10px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
}

.block-picker__error {
  color: var(--cms-danger, var(--cms-danger));
  background: color-mix(in srgb, var(--cms-danger, #9e2b25) 9%, white);
}

.block-picker__pending {
  color: var(--cms-ink-muted);
  background: var(--cms-surface-subtle, var(--cms-surface-subtle));
}

.block-picker button:disabled,
.block-picker input:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

/* Type-to-filter search header — sticks to the top of the scrollable body.
   Negative margins cancel the body padding so it spans full width; the
   negative sticky top offset cancels the body's 16px top padding. */
.block-picker__search {
  position: sticky;
  top: -16px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: -16px -20px 12px;
  padding: 12px 20px;
  background: white;
  border-bottom: 1px solid var(--cms-line);
}

.block-picker__search-icon {
  font-size: 20px;
  color: var(--cms-ink-subtle);
  flex-shrink: 0;
}

.block-picker__search-input {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--cms-line);
  border-radius: 4px;
  font-size: 14px;
  background: white;
}

.block-picker__search-input:focus {
  outline: none;
  border-color: var(--cms-accent);
}

.block-picker__surface-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 14px;
  color: var(--cms-ink-muted);
  font-size: 12px;
  line-height: 1.4;
}

.block-picker__surface-badge {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--cms-brand-soft, var(--cms-accent-soft));
  color: var(--cms-brand, var(--cms-accent));
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

.block-picker__group + .block-picker__group {
  margin-top: 14px;
}

.block-picker__category {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--cms-ink-muted);
  padding: 2px 0 6px;
}

.block-picker__empty {
  padding: 12px 2px;
  font-size: 13px;
  color: var(--cms-ink-subtle);
  font-style: italic;
}

.block-types {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.block-type {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  padding: 12px;
  background: var(--cms-surface-subtle);
  border: 1px solid var(--cms-line);
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
  transition: transform 120ms ease-out, background 120ms ease, border-color 120ms ease;
}

.block-type:hover {
  background: var(--cms-line);
  border-color: var(--cms-accent);
}

.block-type:active {
  transform: scale(0.985);
}

.block-type:focus-visible {
  outline: 2px solid var(--cms-accent);
  outline-offset: 2px;
}

.block-type__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}

.block-type__name {
  font-size: 14px;
  font-weight: 500;
}

.block-type__badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
}

.block-type__badge {
  padding: 2px 5px;
  border-radius: 999px;
  background: var(--cms-surface);
  color: var(--cms-ink-muted);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.25px;
  line-height: 1.3;
  text-transform: uppercase;
}

.block-type__badge--canvas,
.block-type__badge--basic {
  background: var(--cms-brand-soft, var(--cms-accent-soft));
  color: var(--cms-brand, var(--cms-accent));
}

.block-type__badge--advanced {
  background: rgba(0, 0, 0, 0.07);
  color: var(--cms-ink-muted);
}

.block-type__description {
  display: -webkit-box;
  overflow: hidden;
  color: var(--cms-ink-muted);
  font-size: 12px;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.block-type__id {
  visibility: hidden;
  font-size: 12px;
  color: var(--cms-ink-muted);
  font-family: monospace;
}

.block-type:hover .block-type__id,
.block-type:focus-visible .block-type__id {
  visibility: visible;
}
</style>
