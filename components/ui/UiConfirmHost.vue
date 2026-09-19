<template>
  <UiModal
    :open="request !== null"
    :title="request?.title || t('admin.shared.confirmAction', 'Confirm action')"
    @close="resolve(false)"
  >
    <template #description>{{ request?.description }}</template>
    <template #footer>
      <button type="button" class="cms-btn cms-btn--secondary" @click="resolve(false)">{{ t('admin.shared.cancel', 'Cancel') }}</button>
      <button type="button" class="cms-btn" :class="request?.tone === 'danger' ? 'cms-btn--danger' : 'cms-btn--primary'" @click="resolve(true)">
        {{ request?.confirmLabel || t('admin.shared.continue', 'Continue') }}
      </button>
    </template>
  </UiModal>
</template>

<script setup lang="ts">
import UiModal from '~/admin/components/ui/UiModal.vue'
import { useConfirmAction } from '~/admin/composables/useConfirmAction'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'

const { request, resolve } = useConfirmAction()
const { t } = useAdminI18n()
</script>
