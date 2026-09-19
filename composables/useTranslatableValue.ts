import { computed, type ComputedRef } from 'vue'
import type { TipTapDocument } from '~/shared/tiptap/types'
import { isTipTapDocument } from '~/shared/tiptap/types'

const DEFAULT_LOCALE = 'en-US'

type FieldValue = string | TipTapDocument
type LocaleMap = { [locale: string]: FieldValue }

interface UseTranslatableValueReturn {
  displayValue: ComputedRef<FieldValue>
  handleInput: (value: FieldValue) => void
}

export function useTranslatableValue(
  modelValue: () => FieldValue | LocaleMap | null | undefined,
  isTranslatable: () => boolean | undefined,
  emit: (value: FieldValue | LocaleMap) => void,
  locale: string | (() => string) = DEFAULT_LOCALE,
): UseTranslatableValueReturn {
  const resolveLocale = typeof locale === 'function' ? locale : () => locale

  const displayValue = computed<FieldValue>(() => {
    const value = modelValue()
    const loc = resolveLocale()
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    // TipTap JSON doc (non-translatable) — must check before locale map
    if (isTipTapDocument(value)) return value
    // Locale map (translatable) — could contain strings or JSON docs
    if (typeof value === 'object' && !Array.isArray(value)) {
      const localeValue = (value as LocaleMap)[loc]
      return localeValue ?? ''
    }
    return ''
  })

  function handleInput(value: FieldValue) {
    const loc = resolveLocale()
    if (isTranslatable()) {
      const currentValue = modelValue()
      let currentMap: LocaleMap
      if (typeof currentValue === 'object' && currentValue !== null && !isTipTapDocument(currentValue)) {
        // Already a locale map
        currentMap = currentValue as LocaleMap
      } else if (isTipTapDocument(currentValue)) {
        // Legacy bare TipTap doc on a translatable field: preserve it under
        // the default locale so it's not lost when the user types in another
        // locale. The displayValue logic always shows the bare doc first, so
        // en-US is the best home for it.
        currentMap = { [DEFAULT_LOCALE]: currentValue as FieldValue }
      } else {
        currentMap = {}
      }
      emit({ ...currentMap, [loc]: value })
    } else {
      emit(value)
    }
  }

  return {
    displayValue,
    handleInput,
  }
}
