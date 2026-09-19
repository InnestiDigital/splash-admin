import { computed, reactive } from 'vue'
import { defineStore } from 'pinia'

export type EditorChangeSurface =
  | 'theme'
  | 'block'
  | 'layout'
  | 'page'
  | 'placement'
  | 'scenes'
  | 'article'
export type EditorChangeStatus = 'saved' | 'dirty' | 'saving' | 'blocked' | 'error'
export type EditorChangeScope = `site:${string}` | `page:${string}`

/** Canonical identities shared by producers and transition guards. */
export const editorChangeKey = {
  theme: (siteId: string) => `theme:${siteId}`,
  layout: (siteId: string, type: string) => `layout:${siteId}:${type}`,
  block: (blockId: string) => `block:${blockId}`,
  pageDetails: (pageId: string) => `page:${pageId}:details`,
  templateSettings: (pageId: string) => `page:${pageId}:template-settings`,
  structure: (pageId: string) => `page:${pageId}:structure`,
  section: (pageId: string, sectionId: string) => `section:${pageId}:${sectionId}`,
  placement: (pageId: string | null, blockId: string) => `placement:${pageId ?? 'no-page'}:${blockId}`,
  scenes: (pageId: string) => `scenes:${pageId}`,
  /**
   * Structured-article authoring. Keyed by article id so the full-page editor
   * and ArticleSettingsPanel (inside the block editor) share one lane and
   * cannot report different saved states for the same article (I7).
   */
  article: (articleId: string) => `article:${articleId}`,
} as const

export const editorChangeScope = {
  site: (siteId: string): `site:${string}` => `site:${siteId}`,
  page: (pageId: string): `page:${string}` => `page:${pageId}`,
} as const

const SURFACE_LABELS: Record<EditorChangeSurface, string> = {
  theme: 'Theme',
  block: 'Block content',
  layout: 'Layout',
  page: 'Page settings',
  placement: 'Canvas placement',
  scenes: 'Motion',
  article: 'Article',
}

export interface EditorSaveJobContext {
  revision: number
  isCurrent: () => boolean
}

export interface EditorSaveJob {
  key: string
  surface: EditorChangeSurface
  scope: EditorChangeScope
  run: (context: EditorSaveJobContext) => Promise<unknown>
  delay?: number
  valid?: boolean
  blockedReason?: string
  focusInvalid?: () => void
  label?: string
}

export interface EditorSaveJobState {
  key: string
  label: string
  surface: EditorChangeSurface
  scope: string
  dirty: boolean
  saving: boolean
  error: string | null
  blockedReason: string | null
  lastSavedAt: number | null
}

export interface EditorFlushResult {
  ok: boolean
  failedKeys: string[]
  blockedKeys: string[]
}

/**
 * A one-shot editor mutation that starts immediately instead of becoming an
 * autosave job. Operations are tracked only while they are in flight so route
 * guards can wait for them; failures are returned to their caller and are not
 * retained as retryable dirty work.
 */
export interface EditorOperation<T = unknown> {
  readonly key: string
  readonly label: string
  readonly scope: EditorChangeScope
  /**
   * A scope barrier waits for operations already in the scope and prevents
   * later operations/save jobs from starting until it settles.
   */
  readonly barrier?: boolean
  readonly run: () => Promise<T>
}

export interface EditorOperationState {
  readonly id: number
  readonly key: string
  readonly label: string
  readonly scope: EditorChangeScope
  readonly barrier: boolean
}

interface PendingSave {
  revision: number
  run: EditorSaveJob['run']
}

interface JobRuntime {
  revision: number
  generation: number
  delay: number
  pending: PendingSave | null
  timer: ReturnType<typeof setTimeout> | null
  flushPromise: Promise<boolean> | null
  focusInvalid?: () => void
}

interface OperationSettlement {
  ok: boolean
}

interface OperationRuntime {
  state: EditorOperationState
  settled: Promise<OperationSettlement>
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return 'Could not save changes'
}

/**
 * Canonical persistence state for the page editor.
 *
 * Jobs are keyed by their immutable target (for example `block:<id>` or
 * `placement:<pageId>:<blockId>`). This lets the coordinator retain work after
 * an inspector unmounts, serialize edits that arrive during a request, and
 * flush exactly the old page before hydrating the next one.
 */
export const useEditorChangeStore = defineStore('editor-changes', () => {
  const jobs = reactive<Record<string, EditorSaveJobState>>({})
  const runtime = new Map<string, JobRuntime>()
  const operations = reactive<Record<number, EditorOperationState>>({})
  const operationRuntime = new Map<number, OperationRuntime>()
  const operationTails = new Map<string, Promise<void>>()
  let nextOperationId = 0

  const jobList = computed(() => Object.values(jobs))
  const operationList = computed(() => Object.values(operations))
  const dirtyJobs = computed(() => jobList.value.filter(job => job.dirty))
  const savingJobs = computed(() => jobList.value.filter(job => job.saving))
  const errorJobs = computed(() => jobList.value.filter(job => job.error !== null))
  const blockedJobs = computed(() => jobList.value.filter(
    job => job.dirty && job.blockedReason !== null,
  ))

  const isDirty = computed(() => dirtyJobs.value.length > 0)
  const isSaving = computed(
    () => savingJobs.value.length > 0 || operationList.value.length > 0,
  )
  const hasErrors = computed(() => errorJobs.value.length > 0)
  const isBlocked = computed(() => blockedJobs.value.length > 0)
  const needsAttention = computed(
    () => isDirty.value || isSaving.value || hasErrors.value || isBlocked.value,
  )
  const status = computed<EditorChangeStatus>(() => {
    if (hasErrors.value) return 'error'
    if (isBlocked.value) return 'blocked'
    if (isSaving.value) return 'saving'
    if (isDirty.value) return 'dirty'
    return 'saved'
  })
  const statusLabel = computed(() => {
    if (status.value === 'error') {
      const count = errorJobs.value.length
      return count === 1 ? 'Save failed — retry' : `${count} saves failed — retry`
    }
    if (status.value === 'blocked') {
      const count = blockedJobs.value.length
      return count === 1 ? 'Fix 1 unsaved change' : `Fix ${count} unsaved changes`
    }
    if (status.value === 'saving') return 'Saving…'
    if (status.value === 'dirty') {
      const count = dirtyJobs.value.length
      return count === 1 ? '1 unsaved change' : `${count} unsaved changes`
    }
    return 'All changes saved'
  })

  function ensureRuntime(key: string): JobRuntime {
    const existing = runtime.get(key)
    if (existing) return existing
    const created: JobRuntime = {
      revision: 0,
      generation: 0,
      delay: 800,
      pending: null,
      timer: null,
      flushPromise: null,
    }
    runtime.set(key, created)
    return created
  }

  function runOperation<T>(operation: EditorOperation<T>): Promise<T> {
    const id = ++nextOperationId
    const state: EditorOperationState = {
      id,
      key: operation.key,
      label: operation.label,
      scope: operation.scope,
      barrier: operation.barrier === true,
    }
    operations[id] = state

    // Register immediately, then serialize mutations that share an immutable
    // target key. This prevents late responses from older reorder/field writes
    // winning over the user's newer action. A failed predecessor never blocks
    // the next explicit operation in the lane.
    const previous = operationTails.get(operation.key) ?? Promise.resolve()
    const scopePredecessors = [...operationRuntime.values()]
      .filter(candidate => candidate.state.scope === operation.scope)
    const blockingBarriers = scopePredecessors
      .filter(candidate => candidate.state.barrier)
    const scopeGate = state.barrier ? scopePredecessors : blockingBarriers
    const promise = previous.catch(() => undefined).then(async () => {
      if (scopeGate.length > 0) {
        await Promise.all(scopeGate.map(candidate => candidate.settled))
      }
      return operation.run()
    })
    const tail = promise.then(() => undefined, () => undefined)
    operationTails.set(operation.key, tail)
    const settled: Promise<OperationSettlement> = promise.then(
      () => ({ ok: true }),
      () => ({ ok: false }),
    )
    const tracked: OperationRuntime = { state, settled }
    operationRuntime.set(id, tracked)

    const cleanup = () => {
      if (operationRuntime.get(id) !== tracked) return
      operationRuntime.delete(id)
      delete operations[id]
      if (operationTails.get(operation.key) === tail) operationTails.delete(operation.key)
    }

    // Callers observe settlement only after the operation has left the active
    // registry, so a sequential loop can start the next same-key action.
    return promise.then(
      (value) => { cleanup(); return value },
      (error) => { cleanup(); throw error },
    )
  }

  function hasOperation(key: string): boolean {
    return operationList.value.some(operation => operation.key === key)
  }

  async function waitForScopeBarriers(scope: string): Promise<void> {
    // A second barrier can be registered while a job is waiting for the first.
    // Keep checking until the scope is genuinely open.
    const awaited = new Set<number>()
    while (true) {
      const barriers = [...operationRuntime.entries()]
        .filter(([id, operation]) => (
          !awaited.has(id)
          && operation.state.scope === scope
          && operation.state.barrier
        ))
      if (barriers.length === 0) return
      barriers.forEach(([id]) => awaited.add(id))
      await Promise.all(barriers.map(([, operation]) => operation.settled))
    }
  }

  function ensureState(job: EditorSaveJob): EditorSaveJobState {
    const existing = jobs[job.key]
    if (existing) {
      existing.label = job.label ?? SURFACE_LABELS[job.surface]
      existing.surface = job.surface
      existing.scope = job.scope
      return existing
    }
    const created: EditorSaveJobState = {
      key: job.key,
      label: job.label ?? SURFACE_LABELS[job.surface],
      surface: job.surface,
      scope: job.scope,
      dirty: false,
      saving: false,
      error: null,
      blockedReason: null,
      lastSavedAt: null,
    }
    jobs[job.key] = created
    return created
  }

  function clearTimer(key: string): void {
    const jobRuntime = runtime.get(key)
    if (!jobRuntime?.timer) return
    clearTimeout(jobRuntime.timer)
    jobRuntime.timer = null
  }

  function scheduleTimer(key: string): void {
    const jobRuntime = runtime.get(key)
    const state = jobs[key]
    if (!jobRuntime || !state || state.blockedReason || !jobRuntime.pending) return
    clearTimer(key)
    jobRuntime.timer = setTimeout(() => {
      jobRuntime.timer = null
      void flushJob(key)
    }, jobRuntime.delay)
  }

  function queue(job: EditorSaveJob): void {
    const state = ensureState(job)
    const jobRuntime = ensureRuntime(job.key)
    jobRuntime.revision++
    jobRuntime.delay = Math.max(0, job.delay ?? 800)
    jobRuntime.pending = { revision: jobRuntime.revision, run: job.run }
    jobRuntime.focusInvalid = job.focusInvalid

    state.dirty = true
    state.error = null
    state.blockedReason = job.valid === false
      ? (job.blockedReason || 'Fix validation errors before saving')
      : null

    if (state.blockedReason) clearTimer(job.key)
    else scheduleTimer(job.key)
  }

  function setValidity(
    key: string,
    valid: boolean,
    blockedReason = 'Fix validation errors before saving',
    focusInvalid?: () => void,
  ): void {
    const state = jobs[key]
    const jobRuntime = runtime.get(key)
    if (!state || !jobRuntime) return
    jobRuntime.focusInvalid = focusInvalid ?? jobRuntime.focusInvalid
    if (!state.dirty && !jobRuntime.pending) {
      // Revalidating a clean retained form (for example after a locale switch)
      // must not manufacture unsaved work or block leaving the inspector.
      state.blockedReason = null
      return
    }
    state.blockedReason = valid ? null : blockedReason
    if (valid) scheduleTimer(key)
    else clearTimer(key)
  }

  async function drainJob(key: string): Promise<boolean> {
    const jobRuntime = runtime.get(key)
    const state = jobs[key]
    if (!jobRuntime || !state) return true
    const generation = jobRuntime.generation

    while (jobRuntime.pending) {
      if (state.blockedReason) {
        state.saving = false
        return false
      }
      const pending = jobRuntime.pending
      jobRuntime.pending = null
      state.saving = true
      state.error = null

      try {
        await waitForScopeBarriers(state.scope)
        await pending.run({
          revision: pending.revision,
          isCurrent: () => jobRuntime.generation === generation
            && jobRuntime.revision === pending.revision,
        })
      } catch (error) {
        if (jobRuntime.generation !== generation) return true
        if (!jobRuntime.pending) jobRuntime.pending = pending
        state.error = errorMessage(error)
        state.dirty = true
        state.saving = false
        return false
      }

      if (jobRuntime.generation !== generation) return true
      if (pending.revision === jobRuntime.revision && !jobRuntime.pending) {
        state.dirty = false
        state.lastSavedAt = Date.now()
      }
    }

    state.saving = false
    return !state.dirty && !state.error && !state.blockedReason
  }

  async function flushJob(key: string, focusBlocked = false): Promise<boolean> {
    clearTimer(key)
    const jobRuntime = runtime.get(key)
    const state = jobs[key]
    if (!jobRuntime || !state) return true

    if (state.blockedReason) {
      if (focusBlocked) jobRuntime.focusInvalid?.()
      return false
    }

    if (jobRuntime.flushPromise) {
      // Every caller that joins an in-flight revision observes the same result.
      // A failed drain restores pending work for an explicit later retry; one
      // waiter must not secretly start that retry while another returns false.
      return jobRuntime.flushPromise
    }

    if (!jobRuntime.pending) return !state.dirty && !state.error

    const promise = drainJob(key)
    jobRuntime.flushPromise = promise
    try {
      return await promise
    } finally {
      if (jobRuntime.flushPromise === promise) jobRuntime.flushPromise = null
    }
  }

  async function flushKeys(keys: readonly string[], focusBlocked = false): Promise<EditorFlushResult> {
    const failedKeys: string[] = []
    const blockedKeys: string[] = []
    for (const key of keys) {
      const ok = await flushJob(key, focusBlocked)
      if (ok) continue
      if (jobs[key]?.blockedReason) blockedKeys.push(key)
      else failedKeys.push(key)
    }
    return {
      ok: failedKeys.length === 0 && blockedKeys.length === 0,
      failedKeys,
      blockedKeys,
    }
  }

  async function flushOperations(
    matches: (operation: EditorOperationState) => boolean,
  ): Promise<string[]> {
    const failedKeys = new Set<string>()
    const awaitedIds = new Set<number>()

    // An awaited operation may start another operation before settling. Keep
    // draining matching work until the scope is stable.
    while (true) {
      const matching = [...operationRuntime.entries()]
        .filter(([id, operation]) => !awaitedIds.has(id) && matches(operation.state))
      if (matching.length === 0) break

      matching.forEach(([id]) => awaitedIds.add(id))
      const results = await Promise.all(matching.map(async ([, operation]) => ({
        key: operation.state.key,
        result: await operation.settled,
      })))
      for (const { key, result } of results) {
        if (!result.ok) failedKeys.add(key)
      }
    }

    return [...failedKeys]
  }

  async function flushStable(
    matchesJob: (job: EditorSaveJobState) => boolean,
    matchesOperation: (operation: EditorOperationState) => boolean,
    focusBlocked: boolean,
  ): Promise<EditorFlushResult> {
    const failedKeys = new Set<string>()
    const blockedKeys = new Set<string>()
    const attemptedRevisions = new Map<string, number>()

    // A mutation being awaited can enqueue a brand-new save key. Repeat until
    // both lanes are stable, while attempting each failed/blocked revision at
    // most once so a guard can return instead of retrying forever.
    while (true) {
      const keys = jobList.value
        .filter(job => matchesJob(job) && (job.dirty || job.saving))
        .filter(job => attemptedRevisions.get(job.key) !== runtime.get(job.key)?.revision)
        .map(job => job.key)
      const hasOperations = operationList.value.some(matchesOperation)
      if (keys.length === 0 && !hasOperations) break

      const [jobResults, operationFailures] = await Promise.all([
        Promise.all(keys.map(async key => ({ key, ok: await flushJob(key, focusBlocked) }))),
        hasOperations ? flushOperations(matchesOperation) : Promise.resolve([]),
      ])

      for (const key of operationFailures) failedKeys.add(key)
      for (const { key, ok } of jobResults) {
        attemptedRevisions.set(key, runtime.get(key)?.revision ?? -1)
        if (ok) {
          failedKeys.delete(key)
          blockedKeys.delete(key)
        } else if (jobs[key]?.blockedReason) {
          blockedKeys.add(key)
          failedKeys.delete(key)
        } else {
          failedKeys.add(key)
          blockedKeys.delete(key)
        }
      }
    }

    return {
      ok: failedKeys.size === 0 && blockedKeys.size === 0,
      failedKeys: [...failedKeys],
      blockedKeys: [...blockedKeys],
    }
  }

  function flushAll(focusBlocked = false): Promise<EditorFlushResult> {
    return flushStable(() => true, () => true, focusBlocked)
  }

  function flushScope(scope: string, focusBlocked = false): Promise<EditorFlushResult> {
    return flushStable(
      job => job.scope === scope,
      operation => operation.scope === scope,
      focusBlocked,
    )
  }

  function retryFailed(): Promise<EditorFlushResult> {
    return flushKeys(
      jobList.value
        .filter(job => job.error !== null && job.blockedReason === null)
        .map(job => job.key),
    )
  }

  function discardJob(key: string): void {
    const jobRuntime = runtime.get(key)
    if (jobRuntime) {
      clearTimer(key)
      jobRuntime.generation++
      jobRuntime.revision++
      jobRuntime.pending = null
      jobRuntime.flushPromise = null
      runtime.delete(key)
    }
    delete jobs[key]
  }

  function discardScope(scope: string): void {
    for (const job of [...jobList.value]) {
      if (job.scope === scope) discardJob(job.key)
    }
  }

  function discardAll(): void {
    for (const key of Object.keys(jobs)) discardJob(key)
  }

  function getJob(key: string): EditorSaveJobState | null {
    return jobs[key] ?? null
  }

  return {
    jobList,
    operationList,
    errorJobs,
    blockedJobs,
    isDirty,
    isSaving,
    hasErrors,
    isBlocked,
    needsAttention,
    status,
    statusLabel,
    hasOperation,
    runOperation,
    queue,
    setValidity,
    flushJob,
    flushKeys,
    flushAll,
    flushScope,
    retryFailed,
    discardJob,
    discardScope,
    discardAll,
    getJob,
  }
})
