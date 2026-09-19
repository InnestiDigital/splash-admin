<template>
  <section class="typography-roles cms-card">
    <div class="cms-card__header">
      <div>
        <h3 class="cms-card__title">Semantic Roles</h3>
        <p class="typography-roles__subtitle">
          Unassigned roles inherit from parent styles or browser defaults.
        </p>
      </div>
    </div>

    <div class="cms-card__body typography-roles__body">
      <section
        v-for="(groupRoles, groupName) in ROLE_GROUPS"
        :key="groupName"
        class="typography-roles__group"
      >
        <header class="typography-roles__group-header">{{ groupName }}</header>

        <div class="typography-roles__group-card">
          <div
            v-for="role in groupRoles"
            :key="role"
            class="typography-roles__row"
          >
            <div class="typography-roles__copy">
              <label class="cms-label typography-roles__label" :for="`role-${role}`">{{ formatRoleLabel(role) }}</label>
              <div class="typography-roles__description">{{ ROLE_DESCRIPTIONS[role] }}</div>
            </div>

            <div class="typography-roles__field">
              <select
                :id="`role-${role}`"
                :value="form[role] ?? ''"
                :data-role="role"
                class="cms-form-control typography-roles__select"
                @change="updateRole(role, $event)"
              >
                <option value="">None</option>
                <optgroup
                  v-for="category in PRESET_CATEGORIES"
                  :key="category"
                  :label="formatCategoryLabel(category)"
                >
                  <option
                    v-for="preset in eligiblePresetsByCategory[category]"
                    :key="preset.id"
                    :value="preset.id"
                  >
                    {{ preset.name }}
                  </option>
                </optgroup>
              </select>
              <div class="typography-roles__field-hint">Choose an active preset or leave unassigned.</div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div class="cms-card__footer typography-roles__footer">
      <button
        type="button"
        class="cms-btn cms-btn--primary"
        data-action="save"
        :disabled="saving || !isDirty"
        @click="emit('save', { ...form })"
      >
        {{ saving ? 'Saving...' : 'Save' }}
      </button>
      <button
        type="button"
        class="cms-btn cms-btn--secondary"
        data-action="reset"
        :disabled="saving"
        @click="handleReset"
      >
        Reset to defaults
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import {
  PRESET_CATEGORIES,
  ROLE_DESCRIPTIONS,
  ROLE_GROUPS,
  SYSTEM_ROLES,
  type PresetCategory,
  type SystemRole,
  type TypographyPreset,
  type TypographyRoleMapping,
} from '~/server/services/typography/typographyTypes'

const props = defineProps<{
  presets: TypographyPreset[]
  roles: TypographyRoleMapping[]
  roleMap: Record<SystemRole, string | null>
  saving: boolean
}>()

const emit = defineEmits<{
  save: [mappings: Record<SystemRole, string | null>]
  reset: []
  dirtyChange: [dirty: boolean]
}>()

const form = reactive<Record<SystemRole, string | null>>(buildRoleMap(props.roleMap))
const isDirty = computed(() => JSON.stringify(form) !== JSON.stringify(buildRoleMap(props.roleMap)))

const eligiblePresetsByCategory = computed(() => {
  const grouped = {} as Record<PresetCategory, TypographyPreset[]>
  for (const category of PRESET_CATEGORIES) {
    grouped[category] = props.presets
      .filter(preset => preset.category === category && preset.isActive && preset.isRoleAssignable)
      .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name))
  }
  return grouped
})

watch(
  () => props.roleMap,
  (nextRoleMap) => {
    Object.assign(form, buildRoleMap(nextRoleMap))
  },
  { immediate: true, deep: true },
)

watch(isDirty, dirty => emit('dirtyChange', dirty), { immediate: true })

function buildRoleMap(source: Record<SystemRole, string | null>): Record<SystemRole, string | null> {
  return SYSTEM_ROLES.reduce((accumulator, role) => {
    accumulator[role] = source[role] ?? null
    return accumulator
  }, {} as Record<SystemRole, string | null>)
}

function updateRole(role: SystemRole, event: Event) {
  const value = (event.target as HTMLSelectElement).value
  form[role] = value || null
}

function formatCategoryLabel(value: string): string {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, character => character.toUpperCase())
}

function formatRoleLabel(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, character => character.toUpperCase())
}

function handleReset() {
  if (!window.confirm('Reset all role assignments to theme defaults? Unsaved changes will be lost.')) return
  emit('reset')
}
</script>

<style scoped lang="scss">
.typography-roles__subtitle {
  margin: 0.4rem 0 0;
  color: var(--cms-ink-subtle);
  font-size: 1.2rem;
}

.typography-roles__body {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.typography-roles__group {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

.typography-roles__group-card {
  border: 1px solid var(--cms-line);
  border-radius: 0.2rem;
  background: var(--cms-surface);
}

.typography-roles__group-header {
  color: var(--cms-ink-body);
  font-size: 1.2rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.typography-roles__row {
  display: grid;
  gap: 1.6rem;
  grid-template-columns: minmax(20rem, 28rem) minmax(0, 1fr);
  align-items: start;
  padding: 1.4rem 1.6rem;
}

.typography-roles__row + .typography-roles__row {
  border-top: 1px solid var(--cms-line);
}

.typography-roles__label {
  display: block;
  margin-bottom: 0.4rem;
}

.typography-roles__description {
  color: var(--cms-ink-subtle);
  font-size: 1.2rem;
  line-height: 1.45;
}

.typography-roles__field {
  min-width: 0;
}

.typography-roles__field-hint {
  margin-top: 0.5rem;
  color: var(--cms-ink-subtle);
  font-size: 1.1rem;
}

.typography-roles__footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.8rem;
}

@media (max-width: 960px) {
  .typography-roles__row {
    grid-template-columns: 1fr;
    gap: 0.8rem;
  }
}
</style>
