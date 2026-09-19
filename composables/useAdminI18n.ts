import { computed } from 'vue'
import { useNuxtApp } from '#app'

/**
 * Admin UI locale. This is deliberately independent from `editorStore.editingLocale`:
 * changing the language of Splash's controls must never change which localized
 * content field an author is editing.
 */
export const ADMIN_DEFAULT_LOCALE = 'it'
export const ADMIN_SUPPORTED_LOCALES = ['it', 'en-US'] as const

export type AdminLocale = typeof ADMIN_SUPPORTED_LOCALES[number]

const STORAGE_KEY = 'splash.admin.uiLocale'

export function resolveAdminLocale(value: unknown): AdminLocale {
  return ADMIN_SUPPORTED_LOCALES.includes(value as AdminLocale)
    ? value as AdminLocale
    : ADMIN_DEFAULT_LOCALE
}

interface AdminI18nComposer {
  locale?: { value: string }
  t?: (key: string, params?: Record<string, unknown>) => string
  te?: (key: string, locale?: string) => boolean
  loadLocaleMessages?: (locale: string) => Promise<unknown>
}

function readStoredLocale(): AdminLocale {
  if (!import.meta.client) return ADMIN_DEFAULT_LOCALE
  try {
    return resolveAdminLocale(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return ADMIN_DEFAULT_LOCALE
  }
}

export function useAdminI18n() {
  const nuxtApp = useNuxtApp()
  const i18n = (nuxtApp as unknown as { $i18n?: AdminI18nComposer }).$i18n

  const locale = computed<AdminLocale>(() =>
    resolveAdminLocale(i18n?.locale?.value),
  )

  async function setLocale(next: AdminLocale) {
    const resolved = resolveAdminLocale(next)
    if (i18n?.loadLocaleMessages) await i18n.loadLocaleMessages(resolved)
    if (i18n?.locale) i18n.locale.value = resolved
    if (import.meta.client) {
      try { window.localStorage.setItem(STORAGE_KEY, resolved) } catch { /* storage can be blocked */ }
    }
    return resolved
  }

  async function ensureAdminLocale() {
    return setLocale(readStoredLocale())
  }

  /** Safe in unit tests that mount admin components without a vue-i18n plugin. */
  function t(key: string, fallback: string, params?: Record<string, unknown>): string {
    if (!i18n?.t || (i18n.te && !i18n.te(key))) return fallback
    return i18n.t(key, params)
  }

  return { locale, setLocale, ensureAdminLocale, t }
}
