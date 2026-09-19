<template>
  <div class="cms-login">
    <div class="cms-login-card">
      <div class="cms-login-header">
        <span class="cms-login-mark"><span class="material-icons-outlined" aria-hidden="true">eco</span> Splash</span>
        <h1 class="cms-login-title">{{ t('admin.login.title', 'Welcome back') }}</h1>
        <p>{{ t('admin.login.description', 'Sign in to continue managing your websites.') }}</p>
      </div>

      <div v-if="error" id="login-error" class="cms-alert cms-alert--danger" role="alert">
        <span class="material-icons-outlined cms-alert-icon" aria-hidden="true">error</span>
        <div class="cms-alert-content">
          <div class="cms-alert-title">{{ error }}</div>
        </div>
      </div>

      <form @submit.prevent="handleLogin">
        <div class="cms-form-group">
          <label for="email" class="cms-label">{{ t('admin.login.email', 'Email') }}</label>
          <input
            id="email"
            v-model="email"
            type="email"
            class="cms-form-control"
            placeholder="admin@example.com"
            required
            autocomplete="username"
            :aria-invalid="Boolean(error)"
            :aria-describedby="error ? 'login-error' : undefined"
          />
        </div>

        <div class="cms-form-group">
          <label for="password" class="cms-label">{{ t('admin.login.password', 'Password') }}</label>
          <div class="cms-password-field">
            <input
              id="password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              class="cms-form-control"
              required
              autocomplete="current-password"
              :aria-invalid="Boolean(error)"
              :aria-describedby="error ? 'login-error' : undefined"
            />
            <button type="button" :aria-label="showPassword ? t('admin.login.hidePassword', 'Hide password') : t('admin.login.showPassword', 'Show password')" @click="showPassword = !showPassword">
              <span class="material-icons-outlined" aria-hidden="true">{{ showPassword ? 'visibility_off' : 'visibility' }}</span>
            </button>
          </div>
        </div>

        <button type="submit" class="cms-btn cms-btn--primary cms-btn--block" :disabled="loading">
          <span v-if="loading" class="cms-btn-spinner" />
          {{ loading ? t('admin.login.signingIn', 'Signing in…') : t('admin.login.signIn', 'Sign in') }}
        </button>
      </form>
      <p class="cms-login-forgot">
        <NuxtLink to="/admin/forgot-password">{{ t('admin.login.forgotPassword', 'Forgot password?') }}</NuxtLink>
      </p>
      <p class="cms-login-help">{{ t('admin.login.security', 'Your session is protected and will expire when inactive.') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/admin/stores/authStore'
import { useAdminI18n } from '~/admin/composables/useAdminI18n'

definePageMeta({ layout: 'admin-auth' })


const authStore = useAuthStore()
const { t } = useAdminI18n()
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const showPassword = ref(false)

async function handleLogin() {
  error.value = ''
  loading.value = true

  try {
    await authStore.login(email.value, password.value)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || t('admin.login.failed', 'Login failed')
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
  padding: 2rem;
  background:
    radial-gradient(circle at 50% 20%, rgba(46, 125, 50, 0.08), transparent 34rem),
    var(--cms-canvas);
}

.cms-login-card {
  width: 100%;
  max-width: 40rem;
  background: $surface;
  border: 1px solid $line;
  border-radius: $radius-dialog;
  box-shadow: $elev-2;
  padding: 3.2rem;
}

.cms-login-header {
  margin-bottom: 2.8rem;

  .cms-login-mark {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 3.2rem;
    color: $ink;
    font-size: 1.4rem;
    font-weight: 700;

    .material-icons-outlined { color: $accent; font-size: 2rem; }
  }

  .cms-login-title {
    font-size: 2.8rem;
    font-weight: 680;
    letter-spacing: -0.025em;
    color: $text-color;
    margin: 0;
  }

  p { margin: 0.8rem 0 0; color: $ink-muted; font-size: 1.4rem; }
}

.cms-alert {
  margin-bottom: 2rem;
}

.cms-password-field {
  position: relative;

  .cms-form-control { padding-right: 4.4rem; }

  button {
    position: absolute;
    top: 50%;
    right: 0.6rem;
    display: grid;
    width: 3.2rem;
    height: 3.2rem;
    padding: 0;
    place-items: center;
    color: $ink-muted;
    border: 0;
    border-radius: $radius-control;
    background: transparent;
    transform: translateY(-50%);
    cursor: pointer;

    &:hover { color: $ink; background: $surface-subtle; }
  }
}

.cms-login-forgot {
  margin: 1.6rem 0 0;
  font-size: 1.3rem;
  text-align: center;

  a {
    color: $accent;
    text-decoration: none;

    &:hover { text-decoration: underline; }
  }
}

.cms-login-help {
  margin: 2rem 0 0;
  color: $ink-muted;
  font-size: 1.2rem;
  text-align: center;
}

@media (max-width: 480px) {
  .cms-login-card { padding: 2.4rem; }
}
</style>
