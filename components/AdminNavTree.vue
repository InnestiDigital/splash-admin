<template>
  <nav class="cms-nav-tree-container" :aria-label="t('admin.shell.navigation', 'Admin navigation')">
    <ul class="cms-nav-tree">
      <template v-for="item in visibleItems" :key="item.id">
        <NavTreeItem :item="item" />
      </template>
    </ul>
  </nav>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/admin/stores/authStore'
import { visibleNavForRole } from '~/admin/config/navigation'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'

const authStore = useAuthStore()
const { t } = useAdminI18n()

const visibleItems = computed(() => visibleNavForRole(authStore.user?.role))
</script>

<!-- NavTreeItem: recursive child component defined inline -->
<script lang="ts">
import { defineComponent, h, ref as vRef, computed as vComputed, watch as vWatch } from 'vue'
import type { PropType } from 'vue'
import { useAdminUrl } from '~/admin/composables/useAdminUrl'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { adminNavLabel } from '~/admin/config/navigation'

const NavTreeItem = defineComponent({
  name: 'NavTreeItem',
  props: {
    item: { type: Object as PropType<NavItem>, required: true },
  },
  setup(props) {
    const route = useRoute()
    const { adminUrl } = useAdminUrl()
    const { t } = useAdminI18n()

    function resolveItemPath(item: NavItem): string {
      if (!item.to) return ''
      if (item.contextFree) return `/admin${item.to}`
      return adminUrl(item.to)
    }

    function pathIsActive(resolvedPath: string): boolean {
      if (!resolvedPath) return false
      const [path, queryStr] = resolvedPath.split('?')
      if (route.path !== path) return false
      if (queryStr) {
        // Filtered entry (e.g. /pages?filter=blog-index) — every declared
        // query param must match the current route's query.
        const params = new URLSearchParams(queryStr)
        for (const [k, v] of params.entries()) {
          if (route.query[k] !== v) return false
        }
        return true
      }
      // Unfiltered entry — only active when no filter is in the URL, so the
      // more-specific filtered entries (Blogs / Articles) win when present.
      return !route.query.filter
    }

    function itemOrDescendantIsActive(item: NavItem): boolean {
      if (pathIsActive(resolveItemPath(item))) return true
      return item.children?.some(itemOrDescendantIsActive) ?? false
    }

    /** Resolve the full path from the nav item's suffix. */
    const resolvedPath = vComputed(() => resolveItemPath(props.item))
    const isActive = vComputed(() => pathIsActive(resolvedPath.value))
    const isSectionActive = vComputed(() =>
      props.item.children?.some(itemOrDescendantIsActive) ?? false,
    )
    const expanded = vRef(isSectionActive.value)

    // A direct link or reload must reveal the current destination. Preserve a
    // user's manual expansion for inactive groups, but never hide active context.
    vWatch(
      () => route.fullPath,
      () => {
        if (isSectionActive.value) expanded.value = true
      },
      { immediate: true },
    )

    function toggle() {
      expanded.value = !expanded.value
    }

    return () => {
      const hasChildren = props.item.children && props.item.children.length > 0

      const linkContent = [
        h('span', { class: 'material-icons-outlined nav-icon', 'aria-hidden': 'true' }, props.item.icon),
        h('span', { class: 'nav-label' }, adminNavLabel(props.item, t)),
      ]

      if (hasChildren) {
        linkContent.push(
          h('span', {
            class: ['material-icons-outlined', 'chevron', expanded.value ? 'expanded' : ''],
            'aria-hidden': 'true',
          }, 'expand_more'),
        )
      }

      const linkEl = hasChildren
        ? h('button', {
            type: 'button',
            class: 'cms-nav-tree__group',
            'aria-expanded': expanded.value,
            onClick: toggle,
          }, linkContent)
        : h(resolveComponent('NuxtLink'), {
            to: resolvedPath.value,
          }, () => linkContent)

      const children: any[] = [linkEl]

      if (hasChildren && expanded.value) {
        children.push(
          h('ul',
            props.item.children!.map(child =>
              h(NavTreeItem, { item: child, key: child.id }),
            ),
          ),
        )
      }

      return h('li', {
        class: {
          'active-link': isActive.value,
          'active-section': isSectionActive.value,
        },
      }, children)
    }
  },
})

export { NavTreeItem }
</script>
