<template>
  <div class="cms-login">
    <div class="cms-login-card">
      <div class="cms-login-header">
        <span class="cms-login-mark"><span class="material-icons-outlined" aria-hidden="true">eco</span> Splash</span>
        <h1 class="cms-login-title">{{ t('admin.forgotPassword.title', 'Reset your password') }}</h1>
        <p>{{ t('admin.forgotPassword.description', 'Enter your email address and we will send you a link to set a new password.') }}</p>
      </div>

      <!--
        Terminal acknowledgement. Rendered for every outcome the server can produce
        except a 400, and it deliberately does not read the response body: a known
        address, an unknown address, a delivery failure and a rate-limited request
        must all be indistinguishable here or the endpoint's enumeration safety is
        undone in the UI. The form is replaced rather than left in place — a
        resubmit affordance would leak the same information through timing.
      -->
      <div v-if="state === 'acknowledged'" class="cms-alert cms-alert--success" role="status">
        <span class="material-icons-outlined cms-alert-icon" aria-hidden="true">mark_email_read</span>
        <div class="cms-alert-content">
          <div class="cms-alert-title">{{ t('admin.forgotPassword.sentTitle', 'Check your inbox') }}</div>
          <div class="cms-alert-description">
            {{ t('admin.forgotPassword.sentBody', 'If that email exists, a reset link has been sent — check your inbox. The link is valid for 1 hour. Requesting another link invalidates the previous one.') }}
          </div>
        </div>
      </div>

      <template v-else>
        <div v-if="error" id="forgot-password-error" class="cms-alert cms-alert--danger" role="alert">
          <span class="material-icons-outlined cms-alert-icon" aria-hidden="true">error</span>
          <div class="cms-alert-content">
            <div class="cms-alert-title">{{ error }}</div>
          </div>
        </div>

        <form @submit.prevent="handleSubmit">
          <div class="cms-form-group">
            <label for="email" class="cms-label">{{ t('admin.forgotPassword.email', 'Email') }}</label>
            <input
              id="email"
              v-model="email"
              type="email"
              class="cms-form-control"
              placeholder="admin@example.com"
              required
              autocomplete="username"
              :aria-invalid="Boolean(error)"
              :aria-describedby="error ? 'forgot-password-error' : undefined"
            />
          </div>

          <button type="submit" class="cms-btn cms-btn--primary cms-btn--block" :disabled="state === 'submitting'">
            <span v-if="state === 'submitting'" class="cms-btn-spinner" />
            {{ state === 'submitting'
              ? t('admin.forgotPassword.sending', 'Sending…')
              : t('admin.forgotPassword.submit', 'Send reset link') }}
          </button>
        </form>
      </template>

      <p class="cms-login-help">
        <NuxtLink to="/admin/login">{{ t('admin.forgotPassword.backToSignIn', 'Back to sign in') }}</NuxtLink>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAdminI18n } from '~/admin/composables/useAdminI18n'

definePageMeta({ layout: 'admin-auth' })

/**
 * idle ──submit──▶ submitting ──any non-400 outcome──▶ acknowledged (terminal)
 *                       └───────────400──────────────▶ idle + error
 *
 * `acknowledged` is terminal by design; see the template comment.
 */
type FormState = 'idle' | 'submitting' | 'acknowledged'

const { t } = useAdminI18n()
const email = ref('')
const error = ref('')
const state = ref<FormState>('idle')

function statusCodeOf(e: unknown): number | undefined {
  if (typeof e !== 'object' || e === null) return undefined
  const candidate = e as { statusCode?: unknown, data?: { statusCode?: unknown } }
  const code = candidate.statusCode ?? candidate.data?.statusCode
  return typeof code === 'number' ? code : undefined
}

async function handleSubmit() {
  error.value = ''
  state.value = 'submitting'

  try {
    await $fetch('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: email.value },
    })
    state.value = 'acknowledged'
  } catch (e: unknown) {
    // A 400 is the only email-independent rejection the endpoint makes
    // ("Email is required", already prevented by the `required` attribute), so
    // it is safe to surface. Anything else — a 500, a proxy error, a dropped
    // connection — could correlate with whether the address resolved to a user,
    // so it must land in the same terminal acknowledgement as success.
    if (statusCodeOf(e) === 400) {
      error.value = t('admin.forgotPassword.failed', 'Could not send the reset link. Please try again.')
      state.value = 'idle'
      return
    }
    state.value = 'acknowledged'
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

.cms-alert-description {
  margin-top: 0.4rem;
  font-size: 1.3rem;
  line-height: 1.5;
}

.cms-login-help {
  margin: 2rem 0 0;
  color: $ink-muted;
  font-size: 1.2rem;
  text-align: center;

  a {
    color: $accent;
    text-decoration: none;

    &:hover { text-decoration: underline; }
  }
}

@media (max-width: 480px) {
  .cms-login-card { padding: 2.4rem; }
}
</style>
