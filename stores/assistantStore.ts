import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getCsrfToken } from '~/admin/utils/csrf'
import { useProgramStore } from '~/admin/stores/programStore'
import { useSiteStore } from '~/admin/stores/siteStore'
import { createChat } from '~/admin/lib/ag-ui-client/client/turn'
import type { ChatClient } from '~/admin/lib/ag-ui-client/client/turn'
import type { AgentMessage } from '~/admin/lib/protocol/types/agent'
import { EMPTY_SPLASH_WIDGET_STATE, type SplashWidgetState } from '~/admin/lib/protocol/widget-protocol/splash-state'
import type { AgentTokenEnvelope } from '~/server/services/auth/agentTokenService'
import type { SplashEditorContext } from '~/admin/lib/protocol/types/splash-editor-context'

const THREAD_KEY = 'splash-assistant-thread'
const TOKEN_EXPIRY_SKEW_MS = 30_000

function csrfHeaders(): Record<string, string> {
  const token = getCsrfToken()
  return token ? { 'X-CSRF-Token': token } : {}
}

/**
 * Best-effort per-tab thread id via sessionStorage — mirrors the
 * `clipboardStore.ts` precedent: `typeof window === 'undefined'` guard for
 * SSR/non-DOM environments, and a try/catch around storage access so a
 * throwing store (private mode, disabled storage, quota) degrades to an
 * unpersisted id instead of crashing store setup.
 */
function tabThreadId(): string {
  if (typeof window === 'undefined') return crypto.randomUUID()
  try {
    const existing = window.sessionStorage.getItem(THREAD_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    window.sessionStorage.setItem(THREAD_KEY, id)
    return id
  } catch {
    return crypto.randomUUID()
  }
}

/**
 * Registered by useAssistantEditorContext when the drawer wires up (R2E §3.3).
 * Injected rather than imported: editorStore transitively pulls the whole
 * editor surface, and this store also lives in the admin shell where none of
 * it is mounted. The dependency must point one way.
 */
let editorDigestProvider: (() => SplashEditorContext | undefined) | null = null

export function setEditorDigestProvider(fn: (() => SplashEditorContext | undefined) | null): void {
  editorDigestProvider = fn
}

/**
 * Unregister `fn` ONLY if it is still the registered provider. The drawer
 * mounts in two layouts, and Vue can mount the incoming instance before the
 * outgoing one's scope is disposed — an unconditional `set(null)` on teardown
 * would then delete the new drawer's provider and silently drop the editor key
 * from every subsequent turn.
 */
export function clearEditorDigestProvider(fn: () => SplashEditorContext | undefined): void {
  if (editorDigestProvider === fn) editorDigestProvider = null
}

/**
 * Advisory per-turn context (spec §3.3). The `editor` key is what flips the
 * model between editor-apply and the API write tools, so a digest that throws
 * must cost us the key, never the whole site context — dropping programId /
 * siteId would make every site-scoped tool answer "No site selected" [R14].
 */
export function buildAssistantSiteContext(
  programId: string | null,
  siteId: string | null,
): { programId: string, siteId: string, editor?: SplashEditorContext } | undefined {
  if (!programId || !siteId) return undefined
  let editor: SplashEditorContext | undefined
  try {
    editor = editorDigestProvider?.()
  } catch (err) {
    // Loud in dev, degraded-but-working in prod: the turn still gets site scope.
    if (import.meta.dev) console.warn('[assistant] editor digest build failed', err)
    editor = undefined
  }
  return { programId, siteId, ...(editor ? { editor } : {}) }
}

/**
 * UI-boundary translation of the vendored client's error strings. THREAD_BUSY
 * means the runtime is still holding this thread's previous turn — usually the
 * operator sent a follow-up while a long turn was still working (or its stream
 * was cut client-side while the server kept going). The raw code reads like an
 * outage; the real instruction is "wait, then resend".
 */
function friendlyAssistantError(message: string | null): string | null {
  if (message && message.includes('THREAD_BUSY')) {
    return 'the assistant is still working on the previous request — give it a moment, then send again'
  }
  return message
}

export const useAssistantStore = defineStore('assistant', () => {
  const config = useRuntimeConfig()
  const agentUrl = config.public.assistantAgentUrl as string

  const open = ref(false)
  // The vendored chat client's message buffer folds assistant messages only
  // (podium renders user turns from its own layer), so user messages are
  // echoed locally and merged with the assistant buffer by timestamp.
  const assistantMessages = ref<readonly AgentMessage[]>([])
  const userMessages = ref<readonly AgentMessage[]>([])
  const messages = computed<readonly AgentMessage[]>(() =>
    [...userMessages.value, ...assistantMessages.value].sort(
      (a, b) => a.timestamp.localeCompare(b.timestamp),
    ),
  )
  const loading = ref(false)
  const error = ref<string | null>(null)
  const widgetState = ref<SplashWidgetState>(EMPTY_SPLASH_WIDGET_STATE)
  const threadId = ref(tabThreadId())

  const enabled = computed(() => !!agentUrl)

  let client: ChatClient | null = null
  let cachedToken: { value: string, expiresAt: number } | null = null
  // Single-flight guard: two concurrent send() calls that both miss the
  // cache must share one in-flight mint, not each fire their own POST.
  let inFlight: Promise<string> | null = null

  async function doMint(): Promise<string> {
    const { auth } = await $fetch<AgentTokenEnvelope>('/api/admin/agent-token', {
      method: 'POST',
      headers: csrfHeaders(),
    })
    cachedToken = { value: auth.access_token, expiresAt: Date.now() + auth.expires_in * 1000 - TOKEN_EXPIRY_SKEW_MS }
    return auth.access_token
  }

  function mintToken(): Promise<string> {
    if (!inFlight) {
      inFlight = doMint().finally(() => { inFlight = null })
    }
    return inFlight
  }

  async function currentToken(): Promise<string> {
    if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value
    return mintToken()
  }

  function ensureClient(): ChatClient {
    if (client) return client
    const chat = createChat({
      agentUrl,
      sessionId: threadId.value,
      // Refresh hook for the client's 401 retry-once failsafe.
      onAuthExpired: async () => {
        cachedToken = null
        try {
          return await mintToken()
        } catch {
          return null
        }
      },
    })
    assistantMessages.value = chat.messages.snapshot()
    loading.value = chat.loading.snapshot()
    error.value = friendlyAssistantError(chat.error.snapshot())
    widgetState.value = chat.widgetState.snapshot()
    chat.messages.subscribe((v) => { assistantMessages.value = v })
    chat.loading.subscribe((v) => { loading.value = v })
    chat.error.subscribe((v) => { error.value = friendlyAssistantError(v) })
    chat.widgetState.subscribe((v) => { widgetState.value = v })
    client = chat
    return chat
  }

  function toggle() {
    open.value = !open.value
  }

  async function send(text: string): Promise<boolean> {
    if (!enabled.value) return true
    const trimmed = text.trim()
    if (!trimmed) return true
    const userMessage: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    }
    try {
      const chat = ensureClient()
      const token = await currentToken()
      userMessages.value = [...userMessages.value, userMessage]
      // Advisory per-turn admin context (spec §3.3): per-turn (not client
      // config) so site switches take effect without rebuilding the client.
      const programStore = useProgramStore()
      const siteStore = useSiteStore()
      const siteContext = buildAssistantSiteContext(
        programStore.activeProgramId,
        siteStore.activeSiteId,
      )
      await chat.sendMessage(
        {
          sessionId: threadId.value,
          clientId: 'splash-admin',
          // Vendored AgentRequest requires memberId; the runtime identifies the
          // actor from the verified JWT sub, so this field is advisory only.
          memberId: 'splash-admin-operator',
          message: userMessage,
        },
        { authToken: token, ...(siteContext ? { siteContext } : {}) },
      )
      return true
    } catch {
      // Token mint (429 rate limit, 503 keys, CSRF reject) or sendMessage
      // itself can reject before the chat client's own error channel is
      // wired up — surface it here so the caller (AssistantDrawer.submit)
      // can restore the user's cleared draft instead of losing it silently.
      // Un-echo the failed user message too: the drawer restores the draft,
      // so keeping the echo would duplicate the text on re-send.
      userMessages.value = userMessages.value.filter((m) => m.id !== userMessage.id)
      error.value = 'assistant unavailable — try again'
      return false
    }
  }

  /**
   * Ack the editor-ops slice after the executor applied it (ruling 8). Without
   * this a re-render re-fires the watcher; the replay guard would catch it, but
   * a slice that stays set also keeps re-entering the reducer on every state
   * patch for the rest of the thread.
   */
  function clearPendingEditorOps() {
    widgetState.value = { ...widgetState.value, pendingEditorOps: null }
  }

  return { enabled, open, messages, loading, error, widgetState, threadId, toggle, send, clearPendingEditorOps }
})
