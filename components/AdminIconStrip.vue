<template>
  <ul class="global-nav" :aria-label="t('admin.shell.navigation', 'Workspace utilities')">
    <li class="global-nav__brand">
      <NuxtLink :to="adminUrl('/')" aria-label="Dashboard">
        <span class="material-icons-outlined">eco</span>
        <span class="global-nav__wordmark">Splash</span>
      </NuxtLink>
    </li>

    <li class="global-nav__nav-toggle">
      <button
        type="button"
        :aria-label="navStore.menuCollapsed ? t('admin.shell.openNavigation', 'Open navigation') : t('admin.shell.closeNavigation', 'Close navigation')"
        aria-controls="cms-context-navigation"
        :aria-expanded="!navStore.menuCollapsed"
        @click="navStore.toggleMenu()"
      >
        <span class="material-icons-outlined" aria-hidden="true">
          {{ navStore.menuCollapsed ? 'menu' : 'menu_open' }}
        </span>
      </button>
    </li>

    <li class="nav-spacer" />

    <!-- Command palette is the fastest route to every destination. -->
    <li class="global-nav__search">
      <button type="button" :aria-label="t('admin.shell.openSearch', 'Open command palette (Ctrl/Cmd + K)')" class="global-nav__command" @click="commandPalette.open()">
        <span class="material-icons-outlined" aria-hidden="true">search</span>
        <span class="global-nav__command-label">{{ t('admin.shell.search', 'Search pages, settings, and actions') }}</span>
        <span class="global-nav__shortcut" aria-hidden="true"><kbd>⌘</kbd><kbd>K</kbd></span>
      </button>
    </li>

    <li class="nav-spacer" />

    <li v-if="assistantStore.enabled">
      <button type="button" :aria-label="t('admin.shell.openAssistant', 'Open assistant')" @click="assistantStore.toggle()">
        <span class="material-icons-outlined" aria-hidden="true">smart_toy</span>
      </button>
    </li>

    <li>
      <button type="button" :aria-label="t('admin.shell.language', 'Interface language')" @click="cycleLang">
        <span class="lang-label">{{ displayLabel }}</span>
      </button>
    </li>

    <li class="global-nav__profile position-relative">
      <button
        ref="userTriggerRef"
        type="button"
        :aria-label="`User: ${authStore.displayName}`"
        :aria-expanded="showUserMenu"
        @click="showUserMenu = !showUserMenu"
      >
        <span class="global-nav__avatar" aria-hidden="true">{{ userInitial }}</span>
      </button>

      <!-- Dropdown -->
      <div v-if="showUserMenu" ref="dropdownRef" class="icon-strip-dropdown">
        <div class="dropdown-header">{{ authStore.displayName }}</div>
        <div class="dropdown-item-role">{{ roleLabel }}</div>
        <hr />
        <button class="dropdown-action" @click="handleLogout">
          <span class="material-icons-outlined">logout</span>
          {{ t('admin.shell.signOut', 'Sign out') }}
        </button>
      </div>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuthStore } from '~/admin/stores/authStore'
import { useNavStore } from '~/admin/stores/navStore'
import { useAdminUrl } from '~/admin/composables/useAdminUrl'
import { useClickOutside } from '~/admin/composables/useClickOutside'
import { useCommandPalette } from '~/admin/composables/useCommandPalette'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'
import { useAssistantStore } from '~/admin/stores/assistantStore'

const authStore = useAuthStore()
const navStore = useNavStore()
const assistantStore = useAssistantStore()
const { adminUrl } = useAdminUrl()
const commandPalette = useCommandPalette()
const { locale: uiLocale, setLocale: setUiLocale, t } = useAdminI18n()
const showUserMenu = ref(false)

const roleLabel = computed(() => {
  switch (authStore.user?.role) {
    case 'admin': return t('admin.roles.admin', 'Super admin')
    case 'editor': return t('admin.roles.editor', 'Content editor')
    case 'viewer': return t('admin.roles.viewer', 'Read-only viewer')
    case 'client': return t('admin.roles.client', 'Brand client')
    default: return ''
  }
})

const userTriggerRef = ref<HTMLButtonElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)

useClickOutside([userTriggerRef, dropdownRef], () => {
  showUserMenu.value = false
}, { active: showUserMenu })

const displayLabel = computed(() => uiLocale.value.split('-')[0].toUpperCase())

const userInitial = computed(() =>
  (authStore.displayName || 'U').trim().charAt(0).toUpperCase(),
)

async function cycleLang() {
  await setUiLocale(uiLocale.value === 'it' ? 'en-US' : 'it')
}

async function handleLogout() {
  showUserMenu.value = false
  await authStore.logout()
  await navigateTo('/admin/login')
}

</script>

<style lang="scss" scoped>
@use '~/admin/assets/scss/variables' as *;

.icon-strip-dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 0.8rem);
  min-width: 20rem;
  background: $pure-white;
  border: 1px solid $borders-color;
  border-radius: $radius-card;
  box-shadow: $shadow-md;
  z-index: 300;
  padding: 1.2rem;

  .dropdown-header {
    font-size: 1.3rem;
    font-weight: 600;
    color: $text-color;
  }

  .dropdown-item-role {
    font-size: 1.1rem;
    color: $text-light-color;
    text-transform: capitalize;
  }

  hr {
    margin: 0.8rem 0;
  }

  .dropdown-action {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.6rem 0;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1.3rem;
    color: $text-color;

    &:hover {
      color: $primary-color;
    }

    .material-icons-outlined {
      font-size: 1.8rem;
    }
  }
}

@media (max-width: 767px) {
  .icon-strip-dropdown {
    position: fixed;
    top: 5rem;
    right: 0.8rem;
  }
}

.global-nav__brand {
  a {
    color: #9bd0a4 !important;
  }
}

.global-nav__wordmark {
  color: $pure-white;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.global-nav__command {
  gap: 0.6rem;
}

.global-nav__shortcut {
  display: inline-flex;
  gap: 0.3rem;
  padding: 0.2rem 0.5rem;
  color: rgba(255, 255, 255, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 0.4rem;
  font-size: 1.05rem;
  line-height: 1.3;

  kbd {
    padding: 0;
    color: inherit;
    font: inherit;
    background: transparent;
    box-shadow: none;
  }
}

.global-nav__avatar {
  display: grid;
  width: 2.6rem;
  height: 2.6rem;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 50%;
  color: $pure-white;
  background: rgba(255, 255, 255, 0.1);
  font-size: 1.15rem;
  font-weight: 700;
}

.lang-label {
  font-size: 1.2rem;
  font-weight: 600;
}
</style>
