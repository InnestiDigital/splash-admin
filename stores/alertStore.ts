import { defineStore } from 'pinia'

export interface AlertMessage {
  id: string
  type: 'success' | 'warning' | 'danger'
  title: string
  description?: string
  showClose?: boolean
  context?: string // page-level context key for scoped alerts
}

let _alertId = 0

export const useAlertStore = defineStore('alert', () => {
  const alerts = ref<AlertMessage[]>([])

  function show(alert: Omit<AlertMessage, 'id'>) {
    const id = `alert-${++_alertId}`
    alerts.value.push({ ...alert, id, showClose: alert.showClose ?? true })
    return id
  }

  function success(title: string, description?: string, context?: string) {
    return show({ type: 'success', title, description, context })
  }

  function warning(title: string, description?: string, context?: string) {
    return show({ type: 'warning', title, description, context })
  }

  function danger(title: string, description?: string, context?: string) {
    return show({ type: 'danger', title, description, context })
  }

  function dismiss(id: string) {
    alerts.value = alerts.value.filter(a => a.id !== id)
  }

  function clearContext(context: string) {
    alerts.value = alerts.value.filter(a => a.context !== context)
  }

  function clearAll() {
    alerts.value = []
  }

  function getByContext(context: string) {
    return computed(() => alerts.value.filter(a => a.context === context))
  }

  return {
    alerts,
    show,
    success,
    warning,
    danger,
    dismiss,
    clearContext,
    clearAll,
    getByContext,
  }
})
