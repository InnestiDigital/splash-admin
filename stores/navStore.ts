import { defineStore } from 'pinia'

export const useNavStore = defineStore('nav', () => {
  const menuCollapsed = ref(false)

  function toggleMenu() {
    menuCollapsed.value = !menuCollapsed.value
  }

  function collapseMenu() {
    menuCollapsed.value = true
  }

  function expandMenu() {
    menuCollapsed.value = false
  }

  return {
    menuCollapsed,
    toggleMenu,
    collapseMenu,
    expandMenu,
  }
})
