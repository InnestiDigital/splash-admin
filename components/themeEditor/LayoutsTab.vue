<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { ThemeLayout } from '~/shared/types/layout'
import { useLayoutEditor, makeDefaultChromeElement } from '~/admin/composables/useLayoutEditor'
import LayoutFramePanel from './layoutPanels/LayoutFramePanel.vue'
import HeaderPanel from './layoutPanels/HeaderPanel.vue'
import FooterPanel from './layoutPanels/FooterPanel.vue'
import BackgroundPanel from './layoutPanels/BackgroundPanel.vue'
import ChromePanel from './layoutPanels/ChromePanel.vue'
import ScrollPanel from './layoutPanels/ScrollPanel.vue'
import OverridePolicyPanel from './layoutPanels/OverridePolicyPanel.vue'

const props = defineProps<{
  siteId: string
  themeName: string
  layouts: ThemeLayout[]
}>()

const AUTOSAVE_DELAY = 800

// JSON round-trip, not structuredClone: nested reactive proxies survive toRaw() and fail to clone.
const cloneLayout = (layout: ThemeLayout): ThemeLayout => JSON.parse(JSON.stringify(layout))
const savedLayouts = ref(props.layouts.map(cloneLayout))
const activeId = ref(props.layouts[0]?.id ?? '')
const activeLayout = computed(
  () => savedLayouts.value.find(l => l.id === activeId.value) ?? savedLayouts.value[0],
)

const editor = useLayoutEditor(activeLayout.value)
const saving = ref(false)
const saveError = ref<string | null>(null)
const lastSavedAt = ref<number | null>(null)

let autosaveTimer: ReturnType<typeof setTimeout> | null = null
let savedFadeTimer: ReturnType<typeof setTimeout> | null = null
const showSavedBadge = ref(false)

watch(activeId, (newId) => {
  // Flush any pending autosave from the prior tab before switching.
  flushAutosave()
  const layout = savedLayouts.value.find(l => l.id === newId)
  if (layout) editor.reset(layout)
})

watch(editor.dirty, (isDirty) => {
  if (!isDirty) return
  if (autosaveTimer) clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => { void save() }, AUTOSAVE_DELAY)
})

function flushAutosave() {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
    autosaveTimer = null
    if (editor.dirty.value) void save()
  }
}

async function save() {
  if (!editor.dirty.value || saving.value) return
  saving.value = true
  saveError.value = null
  try {
    await $fetch(`/api/admin/s/${props.siteId}/theme/layouts/${editor.layout.value.id}`, {
      method: 'PUT',
      body: editor.layout.value,
    })
    const savedIndex = savedLayouts.value.findIndex(layout => layout.id === editor.layout.value.id)
    if (savedIndex !== -1) savedLayouts.value[savedIndex] = cloneLayout(editor.layout.value)
    editor.markClean()
    lastSavedAt.value = Date.now()
    showSavedBadge.value = true
    if (savedFadeTimer) clearTimeout(savedFadeTimer)
    savedFadeTimer = setTimeout(() => { showSavedBadge.value = false }, 2000)
  } catch (err: any) {
    saveError.value = err?.statusMessage ?? err?.message ?? 'Failed to save layout'
  } finally {
    saving.value = false
  }
}

onUnmounted(() => {
  flushAutosave()
  if (savedFadeTimer) clearTimeout(savedFadeTimer)
})
</script>

<template>
  <div class="layouts-tab">
    <ul class="nav nav-tabs layouts-tab__tabs" role="tablist">
      <li v-for="l in savedLayouts" :key="l.id" class="nav-item" role="presentation">
        <button
          data-layout-tab
          :data-id="l.id"
          type="button"
          role="tab"
          class="nav-link"
          :class="{ active: l.id === activeId }"
          @click="activeId = l.id"
        >
          {{ l.label['en-US'] ?? l.id }}
        </button>
      </li>
    </ul>

    <section data-active-layout class="layouts-tab__content">
      <header class="layouts-tab__header">
        <h2 class="layouts-tab__title">{{ activeLayout?.label['en-US'] ?? activeId }}</h2>
        <span
          v-if="saving"
          class="cms-badge cms-badge--warning"
          data-status="saving"
        >Saving…</span>
        <span
          v-else-if="showSavedBadge"
          class="cms-badge cms-badge--success"
          data-status="saved"
        >Saved</span>
        <span
          v-else-if="editor.dirty.value"
          class="cms-badge cms-badge--neutral"
          data-status="dirty"
        >Unsaved changes</span>
      </header>

      <LayoutFramePanel
        :config="editor.layout.value.frame ?? {}"
        @update:config="(p) => editor.updateSection('frame', p)"
      />
      <HeaderPanel
        :config="editor.layout.value.header ?? {}"
        @update:config="(p) => editor.updateSection('header', p)"
      />
      <FooterPanel
        :config="editor.layout.value.footer ?? {}"
        @update:config="(p) => editor.updateSection('footer', p)"
      />
      <BackgroundPanel
        :config="editor.layout.value.background ?? {}"
        @update:config="(p) => editor.updateSection('background', p)"
      />
      <ChromePanel
        :chrome="editor.layout.value.chrome ?? { elements: [] }"
        @add="(type) => editor.addChromeElement(makeDefaultChromeElement(type))"
        @remove="editor.removeChromeElement"
        @update="editor.updateChromeElement"
      />
      <ScrollPanel
        :config="editor.layout.value.scroll ?? {}"
        @update:config="(p) => editor.updateSection('scroll', p)"
      />
      <OverridePolicyPanel
        :config="editor.layout.value.overridePolicy ?? {}"
        @update:config="(p) => editor.updateSection('overridePolicy', p)"
      />

      <div v-if="saveError" class="layouts-tab__error" role="alert">
        {{ saveError }}
      </div>

      <div class="layouts-tab__actions">
        <button
          data-action="save"
          type="button"
          class="cms-btn cms-btn--primary"
          :disabled="!editor.dirty.value || saving"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <button
          data-action="reset"
          type="button"
          class="cms-btn cms-btn--secondary"
          :disabled="!editor.dirty.value || saving"
          @click="editor.revertToSaved()"
        >
          Discard changes
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.layouts-tab {
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
}

.layouts-tab__content {
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
}

.layouts-tab__header {
  display: flex;
  align-items: center;
  gap: 1.2rem;
}

.layouts-tab__title {
  margin: 0;
  font-size: 2rem;
  font-weight: 600;
}

.layouts-tab__error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
  border-radius: 0.4rem;
  padding: 1rem;
  font-size: 1.3rem;
}

.layouts-tab__actions {
  display: flex;
  gap: 0.8rem;
  padding-top: 1.6rem;
  border-top: 1px solid var(--cms-line);
}
</style>
