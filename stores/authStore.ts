import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getCsrfToken } from '~/admin/utils/csrf'
import type { AdminRole } from '~/admin/types/auth'

interface AuthUser {
  userId: string
  email: string
  role: AdminRole
  mustChangePassword: boolean
}

function csrfHeaders(): Record<string, string> {
  const token = getCsrfToken()
  return token ? { 'X-CSRF-Token': token } : {}
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const loading = ref(false)
  const initialized = ref(false)

  const isAuthenticated = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const isEditor = computed(() => user.value?.role === 'editor' || user.value?.role === 'admin')
  const displayName = computed(() => user.value?.email ?? '')
  const mustChangePassword = computed(() => user.value?.mustChangePassword ?? false)

  async function fetchSession() {
    loading.value = true
    try {
      const data = await $fetch<AuthUser>('/api/auth/session')
      user.value = data
    } catch {
      user.value = null
    } finally {
      loading.value = false
      initialized.value = true
    }
  }

  async function login(email: string, password: string) {
    loading.value = true
    try {
      await $fetch('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      })
      await fetchSession()
      if (user.value?.mustChangePassword) {
        await navigateTo('/admin/change-password')
      } else {
        await navigateTo('/admin')
      }
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    try {
      await $fetch('/api/auth/logout', {
        method: 'POST',
        headers: csrfHeaders(),
      })
    } catch {
      // Ignore errors on logout
    }
    user.value = null
  }

  function clearSession() {
    user.value = null
  }

  return {
    user,
    loading,
    initialized,
    isAuthenticated,
    isAdmin,
    isEditor,
    displayName,
    mustChangePassword,
    fetchSession,
    login,
    logout,
    clearSession,
  }
})
