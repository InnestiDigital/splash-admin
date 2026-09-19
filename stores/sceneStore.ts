import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AnimationScene, AnimationEntry } from '~/shared/types/animation'
import { useSiteStore } from '~/admin/stores/siteStore'
import { usePageStore } from '~/admin/stores/pageStore'
import {
  editorChangeKey,
  editorChangeScope,
  useEditorChangeStore,
} from '~/admin/stores/editorChangeStore'
import { adminFetch } from '~/admin/utils/adminFetch'

/**
 * Animation scenes + entries for the current page.
 *
 * Owns:
 * - Scene/entry CRUD (all synchronous in-memory mutations)
 * - Revision-aware autosave through the editor change coordinator
 * - `loadPageScenes` hydration
 * - `resetForPageChange()` for page hydration orchestration
 */
export const useSceneStore = defineStore('editor-scene', () => {
  const siteStore = useSiteStore()
  const pageStore = usePageStore()
  const changeStore = useEditorChangeStore()

  // ── State ──
  const scenes = ref<AnimationScene[]>([])
  const scenesLoaded = ref(false)
  const selectedSceneId = ref<string | null>(null)
  const selectedEntryId = ref<string | null>(null)
  const loadError = ref<string | null>(null)

  // ── Autosave + epoch race guard ──
  const SCENE_AUTOSAVE_DELAY = 800
  let scenesRequestEpoch = 0
  let scenesStateRevision = 0

  const error = computed(() => loadError.value)

  /**
   * Called by the proxy coordinator during authoritative page hydration.
   * The coordinator must be flushed before this reset. It captures page ids in
   * queued jobs, so an old-page request can never write to a newly selected page.
   */
  function resetForPageChange() {
    scenesRequestEpoch++
    scenesStateRevision++
    scenes.value = []
    scenesLoaded.value = false
    loadError.value = null
  }

  function queueSceneSave(delay = SCENE_AUTOSAVE_DELAY) {
    const page = pageStore.currentPage
    if (!siteStore.activeSiteId || !page) return
    const pageId = page.id
    const apiBase = siteStore.apiBase
    const snapshot = JSON.parse(JSON.stringify(scenes.value)) as AnimationScene[]
    changeStore.queue({
      key: editorChangeKey.scenes(pageId),
      surface: 'scenes',
      scope: editorChangeScope.page(pageId),
      label: 'Motion',
      delay,
      run: async () => {
        await adminFetch(`${apiBase}/pages/${pageId}/scenes`, {
          method: 'PUT',
          body: { scenes: snapshot },
        })
      },
    })
  }

  function markScenesDirty() {
    // Invalidate a GET that started before this local edit. Checking only the
    // coordinator job on response is insufficient: the immutable autosave may
    // finish before the older GET does, making the job clean again while the
    // response is still stale.
    scenesStateRevision++
    queueSceneSave()
  }

  // ── Async actions ──

  async function loadPageScenes(): Promise<void> {
    if (!siteStore.activeSiteId || !pageStore.currentPage) return
    const pageId = pageStore.currentPage.id
    const existingJob = changeStore.getJob(editorChangeKey.scenes(pageId))
    if (existingJob?.dirty || existingJob?.saving) return
    const epoch = ++scenesRequestEpoch
    const stateRevision = scenesStateRevision
    loadError.value = null
    try {
      const data = await adminFetch<{ scenes: AnimationScene[] }>(
        `${siteStore.apiBase}/pages/${pageId}/scenes`,
      )
      if (
        epoch !== scenesRequestEpoch
        || stateRevision !== scenesStateRevision
      ) return   // stale — newer hydration or local edit won
      scenes.value = data.scenes
      scenesLoaded.value = true
      const job = changeStore.getJob(editorChangeKey.scenes(pageId))
      if (job && !job.dirty && !job.saving) changeStore.discardJob(job.key)
    } catch (e: any) {
      if (
        epoch !== scenesRequestEpoch
        || stateRevision !== scenesStateRevision
      ) return   // stale error — swallow silently
      loadError.value = e.message || 'Failed to load scenes'
    }
  }

  // ── Scene CRUD (synchronous in-memory, trigger autosave via markScenesDirty) ──

  function addScene(scene: AnimationScene): void {
    scenes.value = [...scenes.value, scene]
    markScenesDirty()
  }

  function updateScene(sceneId: string, updates: Partial<AnimationScene>): void {
    const index = scenes.value.findIndex(s => s.id === sceneId)
    if (index === -1) return
    const current = scenes.value[index]
    if (!current) return
    const updated = { ...current, ...updates } as AnimationScene
    // Preserve entries from original unless explicitly provided
    if (!updates.entries) {
      updated.entries = current.entries
    }
    scenes.value = scenes.value.map((s, i) => (i === index ? updated : s))
    markScenesDirty()
  }

  function removeScene(sceneId: string): void {
    scenes.value = scenes.value.filter(s => s.id !== sceneId)
    markScenesDirty()
  }

  function addEntry(sceneId: string, entry: AnimationEntry): void {
    const index = scenes.value.findIndex(s => s.id === sceneId)
    if (index === -1) return
    const scene = scenes.value[index]
    if (!scene) return
    const updated = { ...scene, entries: [...scene.entries, entry] }
    scenes.value = scenes.value.map((s, i) => (i === index ? updated : s))
    markScenesDirty()
  }

  function updateEntry(sceneId: string, entryId: string, updates: Partial<AnimationEntry>): void {
    const sceneIndex = scenes.value.findIndex(s => s.id === sceneId)
    if (sceneIndex === -1) return
    const scene = scenes.value[sceneIndex]
    if (!scene) return
    const entryIndex = scene.entries.findIndex(e => e.id === entryId)
    if (entryIndex === -1) return
    const updatedEntries = scene.entries.map((e, i) =>
      i === entryIndex ? { ...e, ...updates } : e,
    )
    const updated = { ...scene, entries: updatedEntries }
    scenes.value = scenes.value.map((s, i) => (i === sceneIndex ? updated : s))
    markScenesDirty()
  }

  function removeEntry(sceneId: string, entryId: string): void {
    const sceneIndex = scenes.value.findIndex(s => s.id === sceneId)
    if (sceneIndex === -1) return
    const scene = scenes.value[sceneIndex]
    if (!scene) return
    const remaining = scene.entries.filter(e => e.id !== entryId)
    if (remaining.length === 0) {
      // Remove the entire scene when no entries remain
      scenes.value = scenes.value.filter(s => s.id !== sceneId)
    } else {
      const updated = { ...scene, entries: remaining }
      scenes.value = scenes.value.map((s, i) => (i === sceneIndex ? updated : s))
    }
    markScenesDirty()
  }

  // ── Selection ──

  function selectScene(sceneId: string | null): void {
    selectedSceneId.value = sceneId
    if (!sceneId) selectedEntryId.value = null
  }

  function selectEntry(entryId: string | null): void {
    selectedEntryId.value = entryId
    // Auto-select parent scene
    if (entryId) {
      const parentScene = scenes.value.find(s => s.entries.some(e => e.id === entryId))
      if (parentScene) selectedSceneId.value = parentScene.id
    }
  }

  return {
    // State
    scenes,
    scenesLoaded,
    selectedSceneId,
    selectedEntryId,
    error,
    // Page hydration lifecycle
    resetForPageChange,
    // Async actions
    loadPageScenes,
    // Scene/entry CRUD
    addScene,
    updateScene,
    removeScene,
    addEntry,
    updateEntry,
    removeEntry,
    // Selection
    selectScene,
    selectEntry,
  }
})
