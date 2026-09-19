import { readonly, ref } from 'vue'

export interface ConfirmActionOptions {
  title: string
  description: string
  confirmLabel?: string
  tone?: 'primary' | 'danger'
}

const request = ref<(ConfirmActionOptions & { resolve: (accepted: boolean) => void }) | null>(null)

export function useConfirmAction() {
  function confirm(options: ConfirmActionOptions): Promise<boolean> {
    if (request.value) request.value.resolve(false)
    return new Promise(resolve => {
      request.value = { confirmLabel: 'Continue', tone: 'primary', ...options, resolve }
    })
  }

  function resolve(accepted: boolean) {
    const current = request.value
    request.value = null
    current?.resolve(accepted)
  }

  return { request: readonly(request), confirm, resolve }
}
