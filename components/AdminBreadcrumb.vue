<template>
  <nav aria-label="Breadcrumb" class="cms-breadcrumb sticky-breadcrumb">
    <ul class="breadcrumb-wrapper">
      <li
        v-for="(crumb, idx) in crumbs"
        :key="crumb.path"
        :class="{ active: idx === crumbs.length - 1 }"
      >
        <NuxtLink v-if="idx < crumbs.length - 1 && crumb.path" :to="crumb.path">{{ crumb.label }}</NuxtLink>
        <span v-else>{{ crumb.label }}</span>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
import { useAdminUrl } from '~/admin/composables/useAdminUrl'
import { adminNavLabel, findNavMatch, type NavItem } from '~/admin/config/navigation'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'

const route = useRoute()
const { adminUrl, extractSuffix } = useAdminUrl()
const { t, locale } = useAdminI18n()

interface Crumb {
  label: string
  path?: string
}

/** Context-free admin pages live directly under /admin, outside a site context. */
const isContextFree = computed(() => !route.path.startsWith('/admin/p/'))

const suffix = computed(() =>
  isContextFree.value
    ? (route.path.slice('/admin'.length) || '/')
    : extractSuffix(route.path),
)

function hrefFor(item: NavItem): string | undefined {
  if (!item.to) return undefined
  if (!item.contextFree) return adminUrl(item.to!)
  return item.to === '/' ? '/admin' : `/admin${item.to}`
}

/**
 * Crumbs are derived from the nav tree (I1) — the ancestor trail plus the
 * matched item. A parameterised leaf (/articles/:articleId) links to the
 * concrete path currently open rather than to its own pattern.
 */
const crumbs = computed<Crumb[]>(() => {
  void locale.value
  const match = findNavMatch(suffix.value, isContextFree.value)
  if (!match) return []

  const trail: Crumb[] = match.trail
    .map(item => ({ label: adminNavLabel(item, t), path: hrefFor(item) }))

  return [...trail, { label: adminNavLabel(match.item, t), path: route.path }]
})
</script>

<style lang="scss" scoped>
@use '~/admin/assets/scss/variables' as *;

.cms-breadcrumb {
  margin-bottom: 1.2rem;
}

.breadcrumb-wrapper {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;

  li {
    font-size: 1.3rem;
    font-weight: 550;
    color: $breadcrumb-color;

    &:not(:last-child)::after {
      content: '/';
      margin: 0 0.8rem;
      color: $text-light-color;
    }

    a {
      color: $text-light-color;
      text-decoration: none;

      &:hover {
        color: $primary-color;
      }
    }

    &.active span {
      color: $breadcrumb-active-color;
    }
  }
}

.sticky-breadcrumb {
  position: static;
  padding: 0;
}
</style>
