<template>
  <div class="cms-login">
    <div class="cms-login-card">
      <div class="cms-login-header">
        <span class="cms-login-mark"><span class="material-icons-outlined" aria-hidden="true">eco</span> Splash</span>
        <h1 class="cms-login-title">{{ t('admin.resetPassword.title', 'Set a new password') }}</h1>
        <p v-if="state !== 'invalidLink'">{{ t('admin.resetPassword.description', 'Choose a new password for your account.') }}</p>
      </div>

      <!--
        No token in the URL: render the explanation in place of the form rather
        than navigating away. A user who mangled or truncated the emailed link
        should be told what went wrong and handed the way to fix it.
      -->
      <template v-if="state === 'invalidLink'">
        <div class="cms-alert cms-alert--danger" role="alert">
          <span class="material-icons-outlined cms-alert-icon" aria-hidden="true">link_off</span>
          <div class="cms-alert-content">
            <div class="cms-alert-title">{{ t('admin.resetPassword.missingToken', 'This reset link is not valid.') }}</div>
            <div class="cms-alert-description">
              {{ t('admin.resetPassword.missingTokenHelp', 'The link may have been truncated by your email client. Request a new one to continue.') }}
            </div>
          </div>
        </div>
        <NuxtLink to="/admin/forgot-password" class="cms-btn cms-btn--primary cms-btn--block">
          {{ t('admin.resetPassword.requestNew', 'Request a new link') }}
        </NuxtLink>
      </template>

      <template v-else>
        <div v-if="error" id="reset-password-error" class="cms-alert cms-alert--danger" role="alert">
          <span class="material-icons-outlined cms-alert-icon" aria-hidden="true">error</span>
          <div class="cms-alert-content">
            <div class="cms-alert-title">{{ error }}</div>
            <div v-if="tokenRejected" class="cms-alert-description">
              <NuxtLink to="/admin/forgot-password">{{ t('admin.resetPassword.requestNew', 'Request a new link') }}</NuxtLink>
            </div>
          </div>
        </div>

        <form @submit.prevent="handleSubmit">
          <div class="cms-form-group">
            <label for="new-password" class="cms-label">{{ t('admin.resetPassword.new', 'New password') }}</label>
            <div class="cms-password-field">
              <input
                id="new-password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                class="cms-form-control"
                required
                minlength="8"
                autocomplete="new-password"
                :aria-invalid="Boolean(error)"
                :aria-describedby="error ? 'reset-password-error' : undefined"
              />
              <button
                type="button"
                :aria-label="showPassword ? t('admin.resetPassword.hidePassword', 'Hide password') : t('admin.resetPassword.showPassword', 'Show password')"
                @click="showPassword = !showPassword"
              >
                <span class="material-icons-outlined" aria-hidden="true">{{ showPassword ? 'visibility_off' : 'visibility' }}</span>
              </button>
            </div>
          </div>

          <div class="cms-form-group">
            <label for="confirm-password" class="cms-label">{{ t('admin.resetPassword.confirm', 'Confirm new password') }}</label>
            <input
              id="confirm-password"
              v-model="confirmPassword"
              :type="showPassword ? 'text' : 'password'"
              class="cms-form-control"
              required
              minlength="8"
              autocomplete="new-password"
              :aria-invalid="Boolean(error)"
              :aria-describedby="error ? 'reset-password-error' : undefined"
            />
          </div>

          <button type="submit" class="cms-btn cms-btn--primary cms-btn--block" :disabled="state === 'submitting'">
            <span v-if="state === 'submitting'" class="cms-btn-spinner" />
            {{ state === 'submitting'
              ? t('admin.resetPassword.saving', 'Saving…')
              : t('admin.resetPassword.submit', 'Set new password') }}
          </button>
        </form>

        <p class="cms-login-help">
          <NuxtLink to="/admin/login">{{ t('admin.resetPassword.backToSignIn', 'Back to sign in') }}</NuxtLink>
        </p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAdminI18n } from '~/admin/composables/useAdminI18n'

definePageMeta({ layout: 'admin-auth' })

/**
 *         ┌── no / empty ?token ──▶ invalidLink (the form never renders)
 * mounted ┤
 *         └── token present ──▶ editing ──submit──▶ submitting ──200──▶ /admin/login
 *                                  ▲                    │
 *                                  └────── 400 ─────────┘
 */
type ResetState = 'invalidLink' | 'editing' | 'submitting'

const { t } = useAdminI18n()
const route = useRoute()

const token = computed(() => {
  const raw = route.query.token
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' ? value.trim() : ''
})

const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const error = ref('')
/**
 * Drives the "request a new link" affordance — only a token rejection can be
 * fixed that way, so offering it for any other failure would be misdirection.
 * A 400 is a safe proxy for "the token was rejected": the endpoint's other two
 * 400s are unreachable from here, because an absent token short-circuits to
 * `invalidLink` before the form renders and a short password is caught by
 * `validationError()` before the request is made.
 */
const tokenRejected = ref(false)
const state = ref<ResetState>(token.value ? 'editing' : 'invalidLink')

/**
 * Client rules mirror `server/api/auth/reset-password.post.ts` exactly: minimum
 * length 8 plus a confirm match, and nothing else. A stricter client would
 * reject passwords the API accepts, which reads to the user as a broken form.
 */
function validationError(): string | null {
  if (password.value !== confirmPassword.value) {
    return t('validation.passwordMismatch', 'Passwords do not match')
  }
  if (password.value.length < 8) {
    return t('validation.passwordMinLength', 'Password must be at least 8 characters')
  }
  return null
}

function messageOf(e: unknown): string | undefined {
  if (typeof e !== 'object' || e === null) return undefined
  const candidate = e as { statusMessage?: unknown, data?: { statusMessage?: unknown } }
  const message = candidate.data?.statusMessage ?? candidate.statusMessage
  return typeof message === 'string' ? message : undefined
}

function statusCodeOf(e: unknown): number | undefined {
  if (typeof e !== 'object' || e === null) return undefined
  const candidate = e as { statusCode?: unknown, data?: { statusCode?: unknown } }
  const code = candidate.statusCode ?? candidate.data?.statusCode
  return typeof code === 'number' ? code : undefined
}

async function handleSubmit() {
  error.value = ''
  tokenRejected.value = false

  const invalid = validationError()
  if (invalid) {
    error.value = invalid
    return
  }

  state.value = 'submitting'
  try {
    await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: { token: token.value, password: password.value },
    })
    // The service invalidates every session for the user, so there is nothing to
    // return to — sign-in with the new password is the only next step.
    await navigateTo('/admin/login')
  } catch (e: unknown) {
    // The server returns one message for both an unknown and an expired token
    // (it cannot tell them apart after the row is consumed), so the copy must
    // cover both without claiming to know which.
    error.value = messageOf(e)
      || t('admin.resetPassword.failed', 'Could not set the new password. Please try again.')
    tokenRejected.value = statusCodeOf(e) === 400
    state.value = 'editing'
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

  a { color: inherit; }
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
