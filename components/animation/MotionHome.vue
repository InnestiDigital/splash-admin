<template>
  <div ref="rootEl" class="motion-home" data-testid="motion-home">
    <!-- ═══ SECTION CONTEXT ═══ -->
    <template v-if="isSectionContext">
      <div class="motion-home__header">
        <h4 class="motion-home__title">Section Choreography</h4>
      </div>

      <div class="motion-home__actions">
        <!-- Add Choreography dropdown -->
        <div class="motion-home__dropdown">
          <button
            type="button"
            class="btn btn-primary btn-sm motion-home__trigger"
            data-testid="add-choreography-trigger"
            :disabled="hasExistingChoreography"
            :aria-expanded="showAddMenu"
            aria-haspopup="menu"
            @click="toggleAddMenu"
          >
            + Add Choreography
          </button>
          <ul
            v-if="showAddMenu"
            class="motion-home__menu"
            data-testid="add-choreography-menu"
            role="menu"
          >
            <li role="none">
              <button
                type="button"
                class="motion-home__menu-item"
                data-testid="add-choreography-blank"
                role="menuitem"
                @click="addChoreography()"
              >
                Blank
              </button>
            </li>
            <li
              v-for="tmpl in CHOREOGRAPHY_TEMPLATES"
              :key="tmpl.id"
              role="none"
            >
              <button
                type="button"
                class="motion-home__menu-item"
                :data-testid="`add-choreography-${tmpl.id}`"
                role="menuitem"
                @click="addChoreography(tmpl)"
              >
                {{ tmpl.name }}
              </button>
            </li>
          </ul>
        </div>
      </div>

      <!-- Choreography card list -->
      <div v-if="sectionScenes.length > 0" class="motion-home__list">
        <div v-for="scene in sectionScenes" :key="scene.id" class="motion-home__card-row">
          <MotionCard
            :scene="scene"
            :validation-issues="getIssuesForScene(scene.id)"
            @click="emit('select', scene.id)"
          />
          <button
            type="button"
            class="btn btn-sm btn-outline-danger motion-home__delete-btn"
            data-testid="delete-choreography"
            title="Delete choreography"
            @click.stop="deleteChoreography(scene.id)"
          >
            ✕
          </button>
        </div>
      </div>

      <div v-else class="motion-home__empty" data-testid="empty-state">
        <p class="text-muted mb-2">No choreography applied</p>
      </div>

      <MotionBudgetIndicator
        v-if="sectionScenes.length > 0"
        :scenes="sectionScenes"
        :budget-limit="budgetLimit"
      />
    </template>

    <!-- ═══ BLOCK CONTEXT ═══ -->
    <template v-else>
      <div class="motion-home__header">
        <h4 class="motion-home__title">Motion</h4>
      </div>

      <!-- Choreography participation notice -->
      <div
        v-if="choreographyParticipation"
        class="motion-home__participation-notice"
        data-testid="choreography-notice"
      >
        <span class="motion-home__notice-icon">&#x2139;</span>
        Part of section choreography:
        <button
          type="button"
          class="btn btn-link btn-sm motion-home__notice-link"
          @click="emit('select', choreographyParticipation.sceneId)"
        >
          {{ choreographyParticipation.name }}
        </button>
      </div>

      <div class="motion-home__actions">
        <!-- Add Motion dropdown -->
        <div class="motion-home__dropdown">
          <button
            type="button"
            class="btn btn-primary btn-sm motion-home__trigger"
            data-testid="add-motion-trigger"
            :aria-expanded="showAddMenu"
            aria-haspopup="menu"
            @click="toggleAddMenu"
          >
            + Add Motion
          </button>
          <ul
            v-if="showAddMenu"
            class="motion-home__menu"
            data-testid="add-motion-menu"
            role="menu"
          >
            <li
              v-for="opt in addMotionOptions"
              :key="opt.value"
              role="none"
            >
              <button
                type="button"
                class="motion-home__menu-item"
                :data-testid="`add-motion-option-${opt.value}`"
                role="menuitem"
                @click="selectAddMotion(opt.value)"
              >
                {{ opt.label }}
              </button>
            </li>
          </ul>
        </div>

        <!-- Target picker dropdown -->
        <div class="motion-home__dropdown">
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm motion-home__trigger"
            data-testid="target-trigger"
            :aria-expanded="showTargetMenu"
            aria-haspopup="menu"
            @click="toggleTargetMenu"
          >
            Target: {{ selectedTargetLabel }}
          </button>
          <ul
            v-if="showTargetMenu"
            class="motion-home__menu"
            data-testid="target-menu"
            role="menu"
          >
            <li
              v-for="target in targetOptions"
              :key="target"
              role="none"
            >
              <button
                type="button"
                class="motion-home__menu-item"
                :class="{ 'is-active': target === selectedTarget }"
                :data-testid="`target-option-${target}`"
                role="menuitem"
                @click="selectTarget(target)"
              >
                {{ target }}
              </button>
            </li>
          </ul>
        </div>
      </div>

      <!-- Card list -->
      <div v-if="blockScenes.length > 0" class="motion-home__list">
        <MotionCard
          v-for="scene in blockScenes"
          :key="scene.id"
          :scene="scene"
          :validation-issues="getIssuesForScene(scene.id)"
          @click="emit('select', scene.id)"
        />
      </div>

      <!-- Empty state -->
      <div v-else class="motion-home__empty" data-testid="empty-state">
        <p class="text-muted mb-2">No motion applied</p>
      </div>

      <!-- Motion budget indicator -->
      <MotionBudgetIndicator
        v-if="blockScenes.length > 0"
        :scenes="blockScenes"
        :budget-limit="budgetLimit"
      />

      <!-- Advanced timeline link -->
      <div v-if="blockScenes.length > 0" class="motion-home__footer">
        <button
          type="button"
          class="btn btn-link btn-sm motion-home__timeline-link"
          data-testid="timeline-link"
          @click="emit('open-timeline')"
        >
          Advanced timeline
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import MotionCard from '~/admin/components/animation/MotionCard.vue'
import MotionBudgetIndicator from '~/admin/components/animation/MotionBudgetIndicator.vue'
import { useClickOutside } from '~/admin/composables/useClickOutside'
import { useMotionValidation } from '~/admin/composables/useMotionValidation'
import { useEditorStore } from '~/admin/stores/editorStore'
import {
  CHOREOGRAPHY_TEMPLATES,
  generateTemplateEntries,
  getEligibleBlocks,
} from '~/admin/composables/useChoreographyState'
import type { ChoreographyTemplate } from '~/admin/composables/useChoreographyState'
import type { AnimationScene } from '~/shared/types/animation'
import type { SelectionContext } from '~/admin/components/animation/selectionContext'

type MotionKind = 'entrance' | 'hover' | 'scroll' | 'loop'

const props = defineProps<{
  /** Block ID — used in block context for legacy compatibility */
  blockId?: string
  selectionContext?: SelectionContext
  scenes?: AnimationScene[]
  targetKeys?: string[]
  initialTarget?: string
  budgetLimit?: number
  targetsSchema?: Record<string, any>
  motionSupport?: Record<string, any>
}>()

const emit = defineEmits<{
  (e: 'add-motion', kind: MotionKind, target: string): void
  (e: 'target-change', target: string): void
  (e: 'select', sceneId: string): void
  (e: 'created', sceneId: string): void
  (e: 'open-timeline'): void
}>()

const store = useEditorStore()

const rootEl = ref<HTMLElement | null>(null)
const showAddMenu = ref(false)
const showTargetMenu = ref(false)
const selectedTarget = ref(props.initialTarget ?? 'root')

// Determine context mode
const isSectionContext = computed(() => props.selectionContext?.type === 'section')

const effectiveSectionId = computed<string | undefined>(() => {
  const context = props.selectionContext
  if (!context) return undefined
  switch (context.type) {
    case 'section':
      return context.sectionId
    case 'block':
      return context.sectionId
    case 'layout':
      return undefined
    default: {
      const unhandled: never = context
      return unhandled
    }
  }
})

const effectiveBlockId = computed<string | undefined>(() => {
  const context = props.selectionContext
  if (!context) return props.blockId
  switch (context.type) {
    case 'block':
      return context.blockId
    case 'layout':
      return context.layoutType
    case 'section':
      return props.blockId
    default: {
      const unhandled: never = context
      return unhandled
    }
  }
})

// All scenes from store (fallback to prop for backward compat)
const allScenes = computed(() => props.scenes ?? store.scenes)

const { getIssuesForScene } = useMotionValidation(toRef(() => allScenes.value))

// ── Block context: filter scenes for this block (exclude choreography scenes) ──
const blockScenes = computed(() => {
  const bid = effectiveBlockId.value
  if (!bid) return []
  return allScenes.value.filter((s) => {
    if (s.sectionId) return false // choreography scenes shown in section context
    return s.entries.some((e) => e.target.entityId === bid)
  })
})

// ── Section context: filter scenes by sectionId ──
const sectionScenes = computed(() => {
  const sid = effectiveSectionId.value
  if (!sid) return []
  return allScenes.value.filter((s) => s.sectionId === sid)
})

// ── Choreography participation check (block context) ──
const choreographyParticipation = computed<{ sceneId: string; name: string } | null>(() => {
  const bid = effectiveBlockId.value
  if (!bid || isSectionContext.value) return null
  for (const scene of allScenes.value) {
    if (!scene.sectionId) continue
    if (scene.entries.some((e) => e.target.entityId === bid)) {
      return {
        sceneId: scene.id,
        name: scene.choreographyMeta?.name || 'Untitled Choreography',
      }
    }
  }
  return null
})

// ── Section context: check if choreography already exists ──
const hasExistingChoreography = computed(() => sectionScenes.value.length > 0)

// ── Block context menus ──
const addMotionOptions: { value: MotionKind; label: string }[] = [
  { value: 'entrance', label: 'Entrance' },
  { value: 'hover', label: 'Hover' },
  { value: 'scroll', label: 'Scroll' },
  { value: 'loop', label: 'Loop' },
]

const targetOptions = computed(() => {
  const keys = props.targetKeys ?? []
  return ['root', ...keys.filter((k) => k !== 'root')]
})

const selectedTargetLabel = computed(() => selectedTarget.value || 'root')

function closeMenus() {
  showAddMenu.value = false
  showTargetMenu.value = false
}

function toggleAddMenu() {
  showTargetMenu.value = false
  showAddMenu.value = !showAddMenu.value
}

function toggleTargetMenu() {
  showAddMenu.value = false
  showTargetMenu.value = !showTargetMenu.value
}

function selectAddMotion(kind: MotionKind) {
  emit('add-motion', kind, selectedTarget.value)
  closeMenus()
}

function selectTarget(target: string) {
  selectedTarget.value = target
  emit('target-change', target)
  closeMenus()
}

// ── Section context: add choreography ──
function deleteChoreography(sceneId: string) {
  store.removeScene(sceneId)
}

function addChoreography(template?: ChoreographyTemplate) {
  const sid = effectiveSectionId.value
  if (!sid) return

  closeMenus()

  const sceneId = crypto.randomUUID()

  // Get section blocks
  const sectionBlockList = store.sectionBlocks(sid)
  const blockCandidates = sectionBlockList.map((b: any) => ({
    id: b.id,
    type: b.type,
    motionSupport: store.schemas[b.type]?.motionSupport,
  }))

  let entries: AnimationScene['entries'] = []

  if (template) {
    const eligible = getEligibleBlocks(blockCandidates, allScenes.value, template.presetId)
    const eligibleIds = eligible.filter((r) => r.eligible).map((r) => r.id)
    entries = generateTemplateEntries(template.id, eligibleIds, sceneId)
  }

  const scene: AnimationScene = {
    id: sceneId,
    pageId: store.currentPage?.id ?? '',
    versionId: '_draft',
    sectionId: sid,
    choreographyMeta: {
      name: template?.name ?? '',
      templateId: template?.id,
    },
    trigger: {
      type: 'scroll',
      anchor: {
        entityType: 'section',
        entityId: sid,
        part: 'root',
      },
      start: { edge: 'top', viewport: 0.85 },
      end: { edge: 'bottom', viewport: 0.15 },
      scrub: true,
    },
    entries,
  }

  store.addScene(scene)
  emit('created', sceneId)
}

// Close both dropdowns when the user clicks anywhere outside the component
useClickOutside(rootEl, closeMenus)
</script>

<style scoped>
.motion-home {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 0;
}

.motion-home__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.motion-home__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--cms-ink-body);
}

.motion-home__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.motion-home__dropdown {
  position: relative;
}

.motion-home__trigger {
  white-space: nowrap;
}

.motion-home__menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 20;
  min-width: 160px;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  background: var(--cms-surface);
  border: 1px solid var(--cms-line-strong);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.motion-home__menu-item {
  display: block;
  width: 100%;
  padding: 6px 12px;
  background: transparent;
  border: none;
  text-align: left;
  font-size: 13px;
  color: var(--cms-ink-body);
  cursor: pointer;
}

.motion-home__menu-item:hover,
.motion-home__menu-item:focus {
  background: #f2f4f7;
  outline: none;
}

.motion-home__menu-item.is-active {
  font-weight: 600;
  color: var(--cms-accent);
}

.motion-home__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.motion-home__card-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.motion-home__card-row > :first-child {
  flex: 1;
}

.motion-home__delete-btn {
  flex-shrink: 0;
  padding: 2px 6px;
  font-size: 12px;
  line-height: 1;
}

.motion-home__empty {
  padding: 24px 0;
  text-align: center;
}

.motion-home__footer {
  margin-top: 8px;
}

.motion-home__timeline-link {
  padding: 0;
  font-size: 12px;
  text-decoration: none;
}

.motion-home__participation-notice {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: #e8f4fd;
  border: 1px solid #b6d4fe;
  border-radius: 6px;
  font-size: 12px;
  color: #084298;
}

.motion-home__notice-icon {
  flex-shrink: 0;
}

.motion-home__notice-link {
  padding: 0;
  font-size: 12px;
  text-decoration: underline;
  color: inherit;
}
</style>
