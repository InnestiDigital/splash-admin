import type { InjectionKey, Ref } from 'vue'

/** Shared UI lock for snapshot/structural mutations that must exclude authoring. */
export const EDITOR_WRITE_LOCK_KEY: InjectionKey<Readonly<Ref<boolean>>> =
  Symbol('editor-write-lock')
