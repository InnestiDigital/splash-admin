<script setup lang="ts">
import { computed } from 'vue'
import { getSectionTypeSchemaV2 } from '~/shared/features/cms/sectionSchemas'
import type { LayoutSlot, LayoutTierDefinition, SectionType } from '~/shared/types/sectionTypes'
import type { Block } from '~/server/storage/types'

const props = defineProps<{
  sectionType: SectionType
  layoutConfig: Record<string, any>
  layoutSlots: LayoutSlot[]
  blocksByRole: Record<string, Block[]>
  /**
   * Which theme's schema-driven geometry to draw. Optional so the per-type
   * fallbacks below keep working for a caller that has no theme to give —
   * without it, only the hand-drawn diagrams are available.
   */
  themeName?: string
}>()

// Convert role from kebab-case to Title Case
function roleLabel(role: string): string {
  return role
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Compute block counts per role
const roleBlockCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const slot of props.layoutSlots) {
    counts[slot.role] = props.blocksByRole[slot.role]?.length ?? 0
  }
  return counts
})

// Check if a role is filled
function isRoleFilled(role: string): boolean {
  return (props.blocksByRole[role]?.length ?? 0) > 0
}

// Check if a role is required but unfilled (warning state)
function isRoleWarning(role: string): boolean {
  const slot = props.layoutSlots.find(s => s.role === role)
  return slot?.required === true && !isRoleFilled(role)
}

// Editorial-split specific computed properties
const editorialSplitSideClass = computed(() => {
  const side = props.layoutConfig.shellSide ?? 'right'
  return side === 'alternate' ? 'side-alternate' : `side-${side}`
})

const editorialSplitRatioClass = computed(() => {
  const ratio = props.layoutConfig.contentWidthRatio ?? 'wide-left'
  return `ratio-${ratio}`
})

const editorialSplitRatioLabel = computed(() => {
  const ratio = props.layoutConfig.contentWidthRatio ?? 'wide-left'
  const labels: Record<string, string> = {
    'equal': '50% / 50%',
    'wide-left': '67% / 33%',
    'wide-right': '33% / 67%',
    'narrow-left': '26% / 74%',
    'sidebar-left': '25% / 75%',
    'sidebar-right': '80% / 20%',
  }
  return labels[ratio] || 'Wide Left'
})

// Get role zone class (filled, empty, warning)
function getRoleZoneClass(role: string): string[] {
  const classes: string[] = []
  if (isRoleFilled(role)) {
    classes.push('diagram__zone--filled')
  } else {
    classes.push('diagram__zone--empty')
  }
  if (isRoleWarning(role)) {
    classes.push('diagram__zone--warning')
  }
  return classes
}

// Format role label with count
function roleDisplayLabel(role: string): string {
  const count = roleBlockCounts.value[role] ?? 0
  return `${roleLabel(role)} (${count})`
}

// ---------------------------------------------------------------------------
// Schema-driven diagram (L3)
//
// The per-type templates below were written when four section types were the
// whole language. They are now the FALLBACK: when the theme ships a `.v2.json`
// with named `layout.areas`, the diagram is drawn from that data, so a
// theme-defined section type gets a real picture instead of the "no role zones"
// placeholder — and the picture stays correct when the schema's geometry
// changes, which a hand-drawn one never did.
//
// A layout whose slots are all line-placed (`hero`) declares no `areas`; there
// is no grid of named regions to draw, so it keeps its hand-drawn diagram.
// ---------------------------------------------------------------------------

const TIER_ORDER: Record<string, number> = { sm: 1, md: 2, lg: 3, xl: 4 }

function tierRank(tier: LayoutTierDefinition): number {
  return tier.minWidth === null ? 0 : (TIER_ORDER[tier.minWidth] ?? 0)
}

const schemaLayout = computed(() => {
  if (!props.themeName) return null
  try {
    return getSectionTypeSchemaV2(props.themeName, props.sectionType)?.layout ?? null
  } catch {
    return null
  }
})

/** One drawable zone: a named grid area and the roles that flow into it. */
interface DiagramArea {
  name: string
  roles: string[]
}

/**
 * The widest declared tier — the desktop arrangement, which is what an editor
 * is choosing between. The floor tier is a single column for nearly every
 * layout and would draw the same picture for all of them.
 */
const schemaGrid = computed(() => {
  const layout = schemaLayout.value
  if (!layout?.areas) return null

  const tier = [...layout.tiers]
    .filter(candidate => layout.areas![candidate.id])
    .sort((a, b) => tierRank(b) - tierRank(a))[0]
  const rows = tier ? layout.areas[tier.id] : undefined
  if (!tier || !rows?.length) return null

  // `grid-template-areas` rows are space-separated cell names; `.` is empty.
  const cells = rows.map(row => row.trim().split(/\s+/).filter(Boolean))
  const columnCount = Math.max(...cells.map(row => row.length))
  if (!columnCount) return null

  const rolesByZone = new Map<string, string[]>()
  for (const slot of layout.slots) {
    if (!('zone' in slot) || !slot.zone) continue
    const roles = rolesByZone.get(slot.zone) ?? []
    roles.push(slot.role)
    rolesByZone.set(slot.zone, roles)
  }

  const seen = new Set<string>()
  const areas: DiagramArea[] = []
  for (const row of cells) {
    for (const name of row) {
      if (name === '.' || seen.has(name)) continue
      seen.add(name)
      areas.push({ name, roles: rolesByZone.get(name) ?? [] })
    }
  }

  return {
    tierId: tier.id,
    areas,
    // Padded so a ragged `areas` declaration cannot produce an invalid value —
    // `grid-template-areas` requires every row to name the same cell count.
    templateAreas: cells
      .map(row => `"${[...row, ...Array(columnCount - row.length).fill('.')].join(' ')}"`)
      .join(' '),
    templateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
  }
})

/**
 * Slots the grid cannot show: line-placed ones overlap named areas by design
 * (contract §3.4), so they are listed rather than drawn.
 */
const overlaySlotRoles = computed(() => {
  const layout = schemaLayout.value
  if (!layout || !schemaGrid.value) return []
  return layout.slots.filter(slot => 'place' in slot && slot.place).map(slot => slot.role)
})

/** A zone's state follows the busiest role in it. */
function zoneClassForArea(area: DiagramArea): string[] {
  if (!area.roles.length) return ['diagram__zone--empty']
  const filled = area.roles.some(role => isRoleFilled(role))
  const warning = area.roles.some(role => isRoleWarning(role))
  return [
    filled ? 'diagram__zone--filled' : 'diagram__zone--empty',
    ...(warning ? ['diagram__zone--warning'] : []),
  ]
}

function areaLabel(area: DiagramArea): string {
  return area.roles.length ? area.roles.map(roleDisplayLabel).join(' · ') : roleLabel(area.name)
}
</script>

<template>
  <div class="section-layout-diagram">
    <!-- Schema-driven: drawn from the section type's own layout.areas -->
    <template v-if="schemaGrid">
      <div class="diagram-meta">
        <span class="diagram-meta__label">Layout Structure</span>
        <span class="diagram-meta__ratio">{{ schemaGrid.tierId }}</span>
      </div>
      <div
        class="layout-diagram layout-diagram--schema"
        :style="{
          gridTemplateAreas: schemaGrid.templateAreas,
          gridTemplateColumns: schemaGrid.templateColumns,
        }"
        data-testid="schema-layout-diagram"
      >
        <div
          v-for="area in schemaGrid.areas"
          :key="area.name"
          class="diagram__zone"
          :class="zoneClassForArea(area)"
          :style="{ gridArea: area.name }"
        >
          <span class="zone__label">{{ areaLabel(area) }}</span>
        </div>
      </div>
      <div v-if="overlaySlotRoles.length" class="diagram__overlays">
        <span class="diagram__overlays-label">Overlaid</span>
        <span v-for="role in overlaySlotRoles" :key="role" class="diagram__overlay-chip">
          {{ roleDisplayLabel(role) }}
        </span>
      </div>
    </template>

    <!-- Editorial Split Layout -->
    <template v-else-if="sectionType === 'editorial-split'">
      <div class="diagram-meta">
        <span class="diagram-meta__label">Layout Structure</span>
        <span class="diagram-meta__ratio">{{ editorialSplitRatioLabel }}</span>
      </div>
      <div
        class="layout-diagram layout-diagram--editorial-split"
        :class="[editorialSplitRatioClass, editorialSplitSideClass]"
      >
        <div class="diagram__column diagram__column--content">
          <div
            v-if="layoutSlots.some(s => s.role === 'section-heading')"
            class="diagram__zone"
            :class="getRoleZoneClass('section-heading')"
          >
            <span class="zone__label">{{ roleDisplayLabel('section-heading') }}</span>
          </div>
          <div
            v-if="layoutSlots.some(s => s.role === 'editorial-body')"
            class="diagram__zone diagram__zone--expandable"
            :class="getRoleZoneClass('editorial-body')"
          >
            <span class="zone__label">{{ roleDisplayLabel('editorial-body') }}</span>
          </div>
          <div
            v-if="layoutSlots.some(s => s.role === 'media-gallery')"
            class="diagram__zone"
            :class="getRoleZoneClass('media-gallery')"
          >
            <span class="zone__label">{{ roleDisplayLabel('media-gallery') }}</span>
          </div>
        </div>
        <div class="diagram__column diagram__column--chrome">
          <div
            v-if="layoutSlots.some(s => s.role === 'supporting-text')"
            class="diagram__zone diagram__zone--expandable"
            :class="getRoleZoneClass('supporting-text')"
          >
            <span class="zone__label">{{ roleDisplayLabel('supporting-text') }}</span>
          </div>
          <div
            v-if="layoutSlots.some(s => s.role === 'media-chrome')"
            class="diagram__zone"
            :class="getRoleZoneClass('media-chrome')"
          >
            <span class="zone__label">{{ roleDisplayLabel('media-chrome') }}</span>
          </div>
          <div
            v-if="layoutSlots.some(s => s.role === 'section-cta')"
            class="diagram__zone"
            :class="getRoleZoneClass('section-cta')"
          >
            <span class="zone__label">{{ roleDisplayLabel('section-cta') }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- Hero Layout -->
    <template v-else-if="sectionType === 'hero'">
      <div class="diagram-meta">
        <span class="diagram-meta__label">Layout Structure</span>
      </div>
      <div class="layout-diagram layout-diagram--hero">
        <div
          v-if="layoutSlots.some(s => s.role === 'media-gallery')"
          class="diagram__zone diagram__zone--background"
          :class="getRoleZoneClass('media-gallery')"
        >
          <span class="zone__label">{{ roleDisplayLabel('media-gallery') }}</span>
          <span class="zone__sublabel">Background</span>
        </div>
        <div
          v-if="layoutSlots.some(s => s.role === 'section-heading')"
          class="diagram__zone diagram__zone--overlay"
          :class="getRoleZoneClass('section-heading')"
        >
          <span class="zone__label">{{ roleDisplayLabel('section-heading') }}</span>
          <span class="zone__sublabel">Overlay</span>
        </div>
        <div
          v-if="layoutSlots.some(s => s.role === 'section-cta')"
          class="diagram__zone diagram__zone--bottom"
          :class="getRoleZoneClass('section-cta')"
        >
          <span class="zone__label">{{ roleDisplayLabel('section-cta') }}</span>
        </div>
      </div>
    </template>

    <!-- Gallery Layout -->
    <template v-else-if="sectionType === 'gallery'">
      <div class="diagram-meta">
        <span class="diagram-meta__label">Layout Structure</span>
      </div>
      <div class="layout-diagram layout-diagram--gallery">
        <div
          v-if="layoutSlots.some(s => s.role === 'section-heading')"
          class="diagram__zone"
          :class="getRoleZoneClass('section-heading')"
        >
          <span class="zone__label">{{ roleDisplayLabel('section-heading') }}</span>
        </div>
        <div
          v-if="layoutSlots.some(s => s.role === 'editorial-body')"
          class="diagram__zone"
          :class="getRoleZoneClass('editorial-body')"
        >
          <span class="zone__label">{{ roleDisplayLabel('editorial-body') }}</span>
        </div>
        <div
          v-if="layoutSlots.some(s => s.role === 'media-gallery')"
          class="diagram__zone diagram__zone--grid"
          :class="getRoleZoneClass('media-gallery')"
        >
          <span class="zone__label">{{ roleDisplayLabel('media-gallery') }}</span>
          <div class="zone__grid-preview">
            <div class="grid-cell"></div>
            <div class="grid-cell"></div>
            <div class="grid-cell"></div>
          </div>
        </div>
        <div
          v-if="layoutSlots.some(s => s.role === 'section-cta')"
          class="diagram__zone"
          :class="getRoleZoneClass('section-cta')"
        >
          <span class="zone__label">{{ roleDisplayLabel('section-cta') }}</span>
        </div>
      </div>
    </template>

    <!-- Stacked Layout (no roles) -->
    <template v-else>
      <div class="layout-diagram layout-diagram--stacked">
        <div class="diagram__message">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="diagram__message-icon">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1 1 0 110 2 1 1 0 010-2zM6.5 7h3l-.5 5h-2L6.5 7z"/>
          </svg>
          <span>No role zones — blocks render in vertical order</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.section-layout-diagram {
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: var(--cms-surface-subtle);
  border-radius: 6px;
  border: 1px solid var(--cms-line);
}

/* Diagram metadata */
.diagram-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  font-size: 0.75rem;
  color: var(--cms-ink-muted);
}

.diagram-meta__label {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.diagram-meta__ratio {
  font-family: 'SF Mono', Consolas, monospace;
  background: var(--cms-surface);
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid var(--cms-line);
}

/* Base diagram styles */
.layout-diagram {
  position: relative;
  min-height: 80px;
}

/* Zone base styles */
.diagram__zone {
  position: relative;
  padding: 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  line-height: 1.3;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  min-height: 32px;
  transition: background-color var(--cms-motion-normal) var(--cms-ease-out), border-color var(--cms-motion-normal) var(--cms-ease-out), color var(--cms-motion-normal) var(--cms-ease-out), transform var(--cms-motion-normal) var(--cms-ease-out);
}

.zone__label {
  font-weight: 500;
  color: #495057;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.zone__sublabel {
  font-size: 0.65rem;
  color: var(--cms-ink-muted);
  margin-top: 2px;
}

/* Zone states */
.diagram__zone--filled {
  background: var(--cms-surface-sunken);
  border: 1px solid var(--cms-line-hover);
}

.diagram__zone--empty {
  background: var(--cms-surface);
  border: 1px dashed var(--cms-line-hover);
}

.diagram__zone--empty .zone__label {
  color: #adb5bd;
}

.diagram__zone--warning {
  background: var(--cms-warn-soft) !important;
  border: 1px solid #ffc107 !important;
}

.diagram__zone--warning .zone__label {
  color: var(--cms-warn);
}

/* Schema-driven layout (L3) — geometry comes from the inline style */
.layout-diagram--schema {
  display: grid;
  gap: 8px;
}

.diagram__overlays {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 0.7rem;
  color: var(--cms-ink-muted);
}

.diagram__overlays-label {
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.diagram__overlay-chip {
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--cms-surface);
  border: 1px dashed var(--cms-line-hover);
}

/* Editorial Split Layout */
.layout-diagram--editorial-split {
  display: grid;
  gap: 8px;
}

/* Ratio classes */
.layout-diagram--editorial-split.ratio-equal {
  grid-template-columns: 1fr 1fr;
}

.layout-diagram--editorial-split.ratio-wide-left {
  grid-template-columns: 2fr 1fr;
}

.layout-diagram--editorial-split.ratio-wide-right {
  grid-template-columns: 1fr 2fr;
}

.layout-diagram--editorial-split.ratio-narrow-left {
  grid-template-columns: 1fr 2.85fr;
}

.layout-diagram--editorial-split.ratio-sidebar-left {
  grid-template-columns: 1fr 3fr;
}

.layout-diagram--editorial-split.ratio-sidebar-right {
  grid-template-columns: 4fr 1fr;
}

/* Side classes (swap column order) */
.layout-diagram--editorial-split.side-left .diagram__column--chrome {
  order: -1;
}

.layout-diagram--editorial-split.side-alternate::after {
  content: '⇄';
  position: absolute;
  top: -24px;
  right: 0;
  font-size: 14px;
  color: var(--cms-ink-muted);
  opacity: 0.7;
}

.diagram__column {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.diagram__column--content {
  min-height: 60px;
}

.diagram__column--chrome {
  min-height: 60px;
  background: #d5e3f7;
  padding: 6px;
  border-radius: 4px;
  border: 1px solid #90b8e8;
}

.diagram__column--chrome .diagram__zone {
  background: var(--cms-surface);
  border-color: #90b8e8;
}

.diagram__zone--expandable {
  flex-grow: 1;
  min-height: 40px;
}

/* Hero Layout */
.layout-diagram--hero {
  position: relative;
  min-height: 100px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.diagram__zone--background {
  flex-grow: 1;
  background: var(--cms-surface-sunken);
  border: 1px solid var(--cms-line-hover);
  position: relative;
}

.diagram__zone--overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  min-width: 60%;
  background: rgba(255, 255, 255, 0.9);
  border: 2px solid var(--cms-ink-muted);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.diagram__zone--bottom {
  margin-top: -6px;
}

/* Gallery Layout */
.layout-diagram--gallery {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.diagram__zone--grid {
  min-height: 60px;
}

.zone__grid-preview {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}

.grid-cell {
  width: 20px;
  height: 20px;
  background: var(--cms-surface);
  border: 1px solid var(--cms-line-hover);
  border-radius: 2px;
}

/* Stacked Layout */
.layout-diagram--stacked {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60px;
  background: var(--cms-surface);
  border: 1px dashed var(--cms-line-hover);
  border-radius: 4px;
}

.diagram__message {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--cms-ink-muted);
  font-size: 0.8rem;
}

.diagram__message-icon {
  flex-shrink: 0;
  opacity: 0.7;
}
</style>
