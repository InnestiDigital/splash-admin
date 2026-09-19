<template>
  <div ref="rootEl" class="block-picker" data-testid="block-picker">
    <div class="block-picker__dropdown">
      <button
        type="button"
        class="btn btn-outline-primary btn-sm block-picker__trigger"
        data-testid="block-picker-trigger"
        :disabled="availableBlocks.length === 0"
        :aria-expanded="open"
        aria-haspopup="listbox"
        @click="open = !open"
      >
        + Add Block
      </button>

      <ul
        v-if="open"
        class="block-picker__menu"
        data-testid="block-picker-menu"
        role="listbox"
      >
        <li
          v-for="block in availableBlocks"
          :key="block.id"
          role="option"
        >
          <button
            type="button"
            class="block-picker__item"
            :data-testid="`block-picker-item-${block.id}`"
            @click="selectBlock(block.id)"
          >
            <span class="block-picker__item-label">{{ block.label || block.type }}</span>
            <span class="block-picker__item-type text-muted">{{ block.type }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useClickOutside } from '~/admin/composables/useClickOutside'

const props = defineProps<{
  sectionBlocks: Array<{ id: string; type: string; label?: string }>
  existingBlockIds: string[]
}>()

const emit = defineEmits<{
  select: [blockId: string]
}>()

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)
useClickOutside(rootEl, () => { open.value = false })

const existingSet = computed(() => new Set(props.existingBlockIds))

const availableBlocks = computed(() =>
  props.sectionBlocks.filter((b) => !existingSet.value.has(b.id)),
)

function selectBlock(blockId: string) {
  open.value = false
  emit('select', blockId)
}
</script>

<style scoped>
.block-picker__dropdown {
  position: relative;
  display: inline-block;
}

.block-picker__trigger {
  white-space: nowrap;
}

.block-picker__menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 20;
  min-width: 200px;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  background: var(--cms-surface);
  border: 1px solid var(--cms-line-strong);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  max-height: 240px;
  overflow-y: auto;
}

.block-picker__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 12px;
  background: transparent;
  border: none;
  text-align: left;
  font-size: 13px;
  color: var(--cms-ink-body);
  cursor: pointer;
  gap: 8px;
}

.block-picker__item:hover,
.block-picker__item:focus {
  background: #f2f4f7;
  outline: none;
}

.block-picker__item-type {
  font-size: 11px;
  font-family: monospace;
}
</style>
