<template>
  <div class="composition-editor">
    <TemplatePicker
      :model-value="settings.templateId || 'asymmetric-hero'"
      @update:model-value="onTemplateChange"
    />

    <div class="composition-editor__roles">
      <h3 class="composition-editor__section-title">Content</h3>
      <RoleCard
        v-for="item in activeItems"
        :key="item.id"
        :item="item"
        :label="roleLabel(item.role)"
        :content-type="roleContentType(item.role)"
        :required="isRequired(item.role)"
        @update:item="onItemUpdate(item.id, $event)"
        @toggle-visible="onToggleVisible(item.id, $event)"
      />

      <div v-if="availableOptionalRoles.length" class="composition-editor__add-optional">
        <select
          class="composition-editor__add-select"
          @change="onAddRole(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''"
        >
          <option value="">+ Add optional element</option>
          <option v-for="role in availableOptionalRoles" :key="role" :value="role">
            {{ roleLabel(role) }}
          </option>
        </select>
      </div>
    </div>

    <CompositionKnobsPanel
      :model-value="settings.knobs || defaultKnobs"
      @update:model-value="onKnobsChange"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import TemplatePicker from './TemplatePicker.vue'
import RoleCard from './RoleCard.vue'
import CompositionKnobsPanel from './CompositionKnobs.vue'
import { getTemplate } from '~/shared/features/cms/composition/templates'
import { mapItemsToTemplate } from '~/shared/features/cms/composition/templateMapping'
import { DEFAULT_KNOBS } from '~/shared/features/cms/composition/types'
import type { CompositionItem, CompositionKnobs, CompositionRole } from '~/shared/features/cms/composition/types'

interface Settings {
  templateId?: string
  items?: CompositionItem[]
  knobs?: CompositionKnobs
  [key: string]: any
}

const props = defineProps<{ settings: Settings }>()
const emit = defineEmits<{ 'update:settings': [value: Settings] }>()

const defaultKnobs = DEFAULT_KNOBS
const template = computed(() => getTemplate(props.settings.templateId || 'asymmetric-hero'))
const items = computed(() => props.settings.items || [])

const ROLE_LABELS: Record<string, string> = {
  'primary-media': 'Primary Image',
  'secondary-media': 'Secondary Image',
  'headline': 'Headline',
  'body': 'Body Text',
  'caption': 'Caption',
  'eyebrow': 'Eyebrow',
  'ornament': 'Ornament',
  'meta': 'Meta',
}

function roleLabel(role: string): string { return ROLE_LABELS[role] || role }
function roleContentType(role: string): 'media' | 'text' | 'either' {
  return template.value?.roles[role]?.contentType || 'text'
}
function isRequired(role: string): boolean {
  return template.value?.roles[role]?.required || false
}

const activeItems = computed(() => items.value.filter(i => i.visible))

const availableOptionalRoles = computed(() => {
  if (!template.value) return []
  const existingRoles = new Set(items.value.map(i => i.role))
  return Object.entries(template.value.roles)
    .filter(([role, def]) => !def.required && !existingRoles.has(role as CompositionRole))
    .map(([role]) => role)
})

function onTemplateChange(templateId: string) {
  const toTemplate = getTemplate(templateId)
  const fromTemplate = template.value
  if (!toTemplate || !fromTemplate) return

  if (items.value.length === 0 || !items.value.some(i => i.media?.src || i.textContent)) {
    // Fresh: create required roles
    const newItems: CompositionItem[] = Object.entries(toTemplate.roles)
      .filter(([, def]) => def.required)
      .map(([role, def]) => ({
        id: crypto.randomUUID(),
        role: role as CompositionRole,
        visible: true,
        emphasis: def.defaultEmphasis,
      }))
    emit('update:settings', {
      ...props.settings,
      templateId,
      items: newItems,
      knobs: toTemplate.defaultKnobs,
      height: toTemplate.defaultHeight,
    })
    return
  }

  // Map existing content
  const { items: mapped, warnings } = mapItemsToTemplate(items.value, fromTemplate, toTemplate)
  if (warnings.length) {
    if (!confirm(`Switching templates will lose:\n${warnings.join('\n')}\n\nContinue?`)) return
  }
  emit('update:settings', {
    ...props.settings,
    templateId,
    items: mapped,
    knobs: toTemplate.defaultKnobs,
    height: toTemplate.defaultHeight,
  })
}

function onItemUpdate(itemId: string, updated: CompositionItem) {
  const newItems = items.value.map(i => (i.id === itemId ? updated : i))
  emit('update:settings', { ...props.settings, items: newItems })
}

function onToggleVisible(itemId: string, visible: boolean) {
  const newItems = items.value.map(i => i.id === itemId ? { ...i, visible } : i)
  emit('update:settings', { ...props.settings, items: newItems })
}

function onAddRole(role: string) {
  if (!role || !template.value) return
  const def = template.value.roles[role]
  if (!def) return
  const newItem: CompositionItem = {
    id: crypto.randomUUID(),
    role: role as CompositionRole,
    visible: true,
    emphasis: def.defaultEmphasis,
  }
  emit('update:settings', { ...props.settings, items: [...items.value, newItem] })
}

function onKnobsChange(knobs: CompositionKnobs) {
  emit('update:settings', { ...props.settings, knobs })
}
</script>

<style lang="scss" scoped>
.composition-editor {
  padding: 0.5rem;

  &__section-title {
    font-size: 0.8125rem;
    font-weight: 600;
    margin: 1rem 0 0.5rem;
    color: var(--cms-ink-subtle);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  &__add-select {
    width: 100%;
    padding: 0.375rem 0.5rem;
    border: 1px dashed var(--cms-line);
    border-radius: 6px;
    font-size: 0.8125rem;
    background: transparent;
    color: var(--cms-ink-subtle);
    cursor: pointer;
    margin-top: 0.5rem;
    font-family: inherit;
  }
}
</style>
