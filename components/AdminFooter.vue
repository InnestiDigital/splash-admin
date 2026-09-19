<template>
  <div class="container-xl">
    <div class="footer-inner">
      <div class="footer-brand">
        <span class="material-icons-outlined footer-logo">eco</span>
        <strong>Splash</strong>
      </div>
      <p class="footer-copy">
        &copy; {{ year }} Splash<template v-if="version"> &middot; v{{ version }}</template>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
const year = new Date().getFullYear()
const { public: { appVersion: version } } = useRuntimeConfig()
</script>

<style lang="scss" scoped>
@use '~/admin/assets/scss/variables' as *;

.footer-inner {
  border-top: 1px solid $line;
  padding-top: $sp-5;
}

.footer-brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.5rem;

  .footer-logo {
    font-size: $fs-h3;
    color: $accent;
  }

  strong {
    font-size: $fs-sm;
    color: $ink;
  }
}

.footer-copy {
  font-size: $fs-caption;
  color: $ink-muted;
  margin: 0;
}
</style>
