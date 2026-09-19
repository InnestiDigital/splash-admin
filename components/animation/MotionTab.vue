<template>
  <div class="motion-tab">
    <MotionDetail
      v-if="selectedSceneId"
      :scene-id="selectedSceneId"
      :block-id="blockId"
      :targets-schema="targetsSchema"
      :motion-support="motionSupport"
      @back="selectedSceneId = null"
    />
    <MotionHome
      v-else
      :block-id="blockId"
      :selection-context="selectionContext"
      :targets-schema="targetsSchema"
      :motion-support="motionSupport"
      @select="selectedSceneId = $event"
      @created="selectedSceneId = $event"
      @open-timeline="emit('open-timeline')"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import MotionDetail from '~/admin/components/animation/MotionDetail.vue'
import MotionHome from '~/admin/components/animation/MotionHome.vue'
import type { SelectionContext } from '~/admin/components/animation/selectionContext'

defineProps<{
  blockId: string
  selectionContext?: SelectionContext
  targetsSchema?: Record<string, any>
  motionSupport?: Record<string, any>
}>()

const emit = defineEmits<{
  'open-timeline': []
}>()

const selectedSceneId = ref<string | null>(null)
</script>
