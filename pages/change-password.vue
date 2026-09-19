<template>
  <div class="cms-login">
    <div class="cms-login-card">
      <div class="cms-login-header">
        <span class="material-icons-outlined cms-login-logo">lock_reset</span>
        <h1 class="cms-login-title">{{ t('admin.password.title', 'Change password') }}</h1>
        <p class="cms-login-subtitle">{{ t('admin.password.description', 'You must set a new password before continuing.') }}</p>
      </div>

      <div v-if="error" class="cms-alert cms-alert--danger">
        <span class="material-icons-outlined cms-alert-icon">error</span>
        <div class="cms-alert-content">
          <div class="cms-alert-title">{{ error }}</div>
        </div>
      </div>

      <form @submit.prevent="handleSubmit">
        <div class="cms-form-group">
          <label for="current-password" class="cms-label">{{ t('admin.password.current', 'Current password') }}</label>
          <input
            id="current-password"
            v-model="currentPassword"
            type="password"
            class="cms-form-control"
            required
            autocomplete="current-password"
          />
        </div>

        <div class="cms-form-group">
          <label for="new-password" class="cms-label">{{ t('admin.password.new', 'New password') }}</label>
          <input
            id="new-password"
            v-model="newPassword"
            type="password"
            class="cms-form-control"
            required
            autocomplete="new-password"
            minlength="8"
          />
        </div>

        <div class="cms-form-group">
          <label for="confirm-password" class="cms-label">{{ t('admin.password.confirm', 'Confirm password') }}</label>
          <input
            id="confirm-password"
            v-model="confirmPassword"
            type="password"
            class="cms-form-control"
            required
            autocomplete="new-password"
            minlength="8"
          />
        </div>

        <button type="submit" class="cms-btn cms-btn--primary cms-btn--block" :disabled="loading">
          <span v-if="loading" class="cms-btn-spinner" />
          {{ loading ? t('admin.password.updating', 'Updating…') : t('admin.password.update', 'Set new password') }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/admin/stores/authStore'
import { adminFetch } from '~/admin/utils/adminFetch'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'

definePageMeta({ layout: 'admin-auth' })


const authStore = useAuthStore()
const { t } = useAdminI18n()
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')
const loading = ref(false)

// Redirect to admin if password change is not required
onMounted(() => {
  if (!authStore.mustChangePassword) {
    navigateTo('/admin')
  }
})

async function handleSubmit() {
  error.value = ''

  if (newPassword.value !== confirmPassword.value) {
    error.value = t('validation.passwordMismatch', 'Passwords do not match')
    return
  }

  if (newPassword.value.length < 8) {
    error.value = t('validation.passwordMinLength', 'Password must be at least 8 characters')
    return
  }

  loading.value = true
  try {
    await adminFetch('/api/admin/me/change-password', {
      method: 'PUT',
      body: { currentPassword: currentPassword.value, newPassword: newPassword.value },
    })
    // Session is destroyed server-side — redirect to login
    await navigateTo('/admin/login')
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || t('admin.password.failed', 'Failed to update password')
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss">
@use '~/admin/assets/scss/admin';
</style>

<style lang="scss" scoped>
@use '~/admin/assets/scss/variables' as *;

.cms-login {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, var(--cms-accent-pressed) 0%, var(--cms-accent) 50%, #43a047 100%);
}

.cms-login-card {
  width: 100%;
  max-width: 40rem;
  background: $pure-white;
  border-radius: 0.6rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  padding: 4rem;
}

.cms-login-header {
  text-align: center;
  margin-bottom: 3rem;

  .cms-login-logo {
    font-size: 4.8rem;
    color: $primary-color;
    display: block;
    margin-bottom: 1rem;
  }

  .cms-login-title {
    font-size: 2.4rem;
    font-weight: 700;
    color: $text-color;
    margin: 0 0 0.8rem;
  }

  .cms-login-subtitle {
    font-size: 1.4rem;
    color: $secondary-color;
    margin: 0;
  }
}

.cms-alert {
  margin-bottom: 2rem;
}
</style>
