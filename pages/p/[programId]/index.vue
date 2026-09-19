<script setup lang="ts">
/**
 * /admin/p/:programId — redirect to sites list since no site is selected yet.
 */
definePageMeta({ layout: 'admin' })

onMounted(() => {
  navigateTo('/admin/sites', { replace: true })
})
</script>

<template>
  <div />
</template>
