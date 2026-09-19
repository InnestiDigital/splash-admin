// SPLASH VENDOR EDIT: WidgetState re-pointed to SplashWidgetState (see admin/lib/README.md)
import { HttpAgent, type AgentSubscriber, type BaseEvent, type Message } from '@ag-ui/client';
import type { ResumeEntry, RunAgentInput } from '@ag-ui/core';
import type {
  ActingContext,
  AgentMessage,
  AgentRequest,
  PageContext,
  RewardsLocale,
  HostActionInvocation,
  SSEEvent,
  SplashSiteContext,
} from '../../protocol/index.js';
import type { SplashWidgetState as WidgetState } from '../../protocol/widget-protocol/splash-state.js';
import { EMPTY_SPLASH_WIDGET_STATE as EMPTY_WIDGET_STATE } from '../../protocol/index.js';
import { createObservable, type Observable } from '../observable.js';
import { HTTPError } from '../transport/http-error.js';
import { AGENTCORE_SESSION_HEADER, type openSSE } from '../transport/sse.js';
import { decodeFrame, type DecodedFrame } from '../decode/frame.js';
import {
  projectInterruptFromRunFinished,
  type InterruptProjectionEvent,
} from '../decode/interrupt-projection.js';
import { createInjectedTransport } from './injected-transport.js';
import {
  appendResultSet,
  decodeSearchCatalogResult,
  rehydrateTimeline,
  toPersistedTimeline,
  type ProductResultSet,
  type TimelineStore,
} from '../state/product-results.js';

const SEARCH_CATALOG_TOOL = 'search_catalog';
const SESSION_EXPIRED_MESSAGE = 'Session expired. Please close and reopen the wallet.';
const EMPTY_RESPONSE_MESSAGE = 'The agent completed without a reply. Please try again.';

export interface SessionWarning {
  readonly message: string;
  readonly type: 'warning' | 'error';
  readonly canExtend: boolean;
}

export const DEFAULT_TURN_TIMEOUT_MS = 180_000;

export interface ChatClientConfig {
  readonly agentUrl: string;
  readonly contractVersion?: string;
  readonly turnTimeoutMs?: number;
  readonly onAuthExpired?: () => Promise<string | null>;
  /** Test seam; production delegates transport to `HttpAgent`. */
  readonly transport?: typeof openSSE;
  readonly devValidateFrame?: (eventName: string, data: string) => void;
  readonly frameTap?: (event: SSEEvent) => void;
  readonly onObserverError?: (error: unknown) => void;
  readonly sessionId?: string;
  /** Visible assistant transcript restored by the browser host for this tab session. */
  readonly initialMessages?: readonly AgentMessage[];
  /**
   * Host-restored authoritative state for a stable session. Native hosts can
   * persist the widgetState observable and supply it here on relaunch; no
   * parallel stream or client-side business-state reducer is required. The
   * cache key must include the verified identity/tenant and must never be
   * reused after an identity or acting-program rotation.
   */
  readonly initialWidgetState?: WidgetState;
  readonly timelineStore?: TimelineStore;
  readonly locale?: RewardsLocale;
  /**
   * Client surface, forwarded to the agent. 'standalone' (mobile/watch) tells
   * the server the client cannot navigate membersite pages, so flows like
   * checkout must stay conversational. Default: membersite behaviour.
   */
  readonly surface?: 'membersite' | 'standalone';
  /** Initial host-route storefront hint; may be overridden per turn. */
  readonly storefrontId?: string;
}

export interface ChatClient {
  readonly messages: Observable<readonly AgentMessage[]>;
  readonly loading: Observable<boolean>;
  readonly error: Observable<string | null>;
  readonly sessionWarning: Observable<SessionWarning | null>;
  readonly widgetState: Observable<WidgetState>;
  readonly productResults: Observable<readonly ProductResultSet[]>;
  /**
   * Latest interrupt disposition of a DELIVERED `RUN_FINISHED` outcome frame
   * (the SDK's typed `onRunFinishedEvent` callback). Never inferred from
   * RUN_ERROR, stream close, or `pendingInterrupts` mutation — the adapter's
   * silent-stop paths must not fabricate (or clear) a durable interrupt.
   */
  readonly pendingInterrupt: Observable<InterruptProjectionEvent>;
  sendMessage(
    request: AgentRequest,
    options?: {
      authToken?: string;
      whisperId?: string;
      pageContext?: PageContext;
      actingContext?: ActingContext;
      storefrontId?: string;
      siteContext?: SplashSiteContext;
    },
  ): Promise<void>;
  consumeResumedStream(
    response: Response,
    onDecodedFrame?: (frame: DecodedFrame) => void,
  ): Promise<void>;
  resumeInterrupt(
    interruptId: string,
    response: Omit<ResumeEntry, 'interruptId'>,
    authToken: string,
  ): Promise<void>;
  /**
   * Deterministic zero-token state refresh via the server's closed
   * `forwardedProps.hostAction` ingress. Absorbs the composed
   * STATE_SNAPSHOT through the normal state pipeline; adds no message, flips
   * no loading/error observables, and — unlike sendMessage — a reply-less run
   * is the EXPECTED outcome, never an EMPTY_RESPONSE error. No-ops when a
   * chat run is in flight (the model turn's own state wins).
   */
  refreshHostAction(
    action: HostActionInvocation,
    sessionId: string,
    authToken: string,
  ): Promise<void>;
  /**
   * Deterministic zero-token first-run bootstrap via the server's
   * `forwardedProps.bootstrap === 'signals'` ingress. Surface-agnostic (carries
   * only the stable per-session context — no membersite assumption). Absorbs
   * the composed STATE_SNAPSHOT (personalized whispers + firstRun greeting)
   * through the normal state pipeline; adds no message and flips no
   * loading/error observable. No-ops when a chat run is in flight.
   */
  refreshBootstrap(sessionId: string, authToken: string): Promise<void>;
  onEvent(callback: (event: SSEEvent) => void): () => void;
  disconnect(): void;
  clearMessages(): void;
  /** Drop client-side interrupt bookkeeping after a terminal, never-resumed handoff. */
  abandonPendingInterrupts(): void;
  setWidgetState(state: WidgetState): void;
  clearError(): void;
  dismissSessionWarning(): void;
}

type PendingRequest =
  | {
      readonly authToken: string;
    }
  | { readonly response: Response };

function requestInput(body: BodyInit | null | undefined): RunAgentInput {
  if (typeof body !== 'string') {
    throw new Error('AG-UI request body is missing');
  }
  return JSON.parse(body) as RunAgentInput;
}

function asAgentMessage(message: Message, timestamp: string): AgentMessage | null {
  // The host already renders the submitted user message. This stream surface
  // remains assistant/tool-only, matching the pre-SDK adapter contract.
  if (message.role !== 'assistant') return null;
  if (message.content === undefined) return null;
  const content =
    typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
  // Strands message snapshots include empty assistant placeholders that carry
  // toolCalls. Tool progress has its own timeline entry; rendering the empty
  // assistant shell creates a visible blank chat bubble before/after cards.
  if (content.trim().length === 0) return null;
  return {
    id: message.id,
    role: message.role,
    content,
    timestamp,
  };
}

function asSseEvent(event: BaseEvent): SSEEvent {
  return { event: event.type, data: JSON.stringify(event) };
}

function sessionWarningOf(expiresInSeconds: number, canExtend: boolean): SessionWarning {
  const minutes = Math.ceil(expiresInSeconds / 60);
  return canExtend
    ? {
        message: `Session expires in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}. Send a message to keep it active.`,
        type: 'warning',
        canExtend: true,
      }
    : {
        message: `Session expires in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}. You'll need to log in again.`,
        type: 'error',
        canExtend: false,
      };
}

export function createChat(config: ChatClientConfig): ChatClient {
  const initialWidgetState = config.initialWidgetState ?? EMPTY_WIDGET_STATE;
  const restoredMessages = (config.initialMessages ?? []).filter(
    (message): message is AgentMessage =>
      message.role === 'assistant' && message.content.trim().length > 0,
  );
  const messages = createObservable<readonly AgentMessage[]>(restoredMessages);
  const loading = createObservable(false);
  const error = createObservable<string | null>(null);
  const sessionWarning = createObservable<SessionWarning | null>(null);
  const widgetState = createObservable<WidgetState>(initialWidgetState);
  const initialTimeline =
    config.timelineStore && config.sessionId
      ? rehydrateTimeline(config.timelineStore.load(config.sessionId))
      : [];
  const productResults = createObservable<readonly ProductResultSet[]>(initialTimeline);
  const pendingInterrupt = createObservable<InterruptProjectionEvent>({ kind: 'none' });
  const callbacks = new Set<(event: SSEEvent) => void>();
  const toolNames = new Map<string, string>();
  const injected = config.transport
    ? createInjectedTransport(config.transport, config.agentUrl, config.turnTimeoutMs)
    : null;
  const messageTimestamps = new Map<string, string>();
  for (const message of restoredMessages) {
    messageTimestamps.set(message.id, message.timestamp);
  }
  let pending: PendingRequest | null = null;
  let currentMessageAnchor: string | null = null;
  // Originating per-turn storefront journaled per pending interrupt id. A
  // resume must replay the interrupt's OWN storefront context — a host route
  // or selector change between interrupt and resume must not flip an Apple
  // checkout resume onto the regular store (or vice versa).
  const interruptStorefronts = new Map<string, string | undefined>();
  // Host reads share the same HttpAgent, thread id, and pending auth slot as
  // model turns. Reserve them synchronously and make later user turns wait,
  // otherwise a mount-time overview can race the first message and a late
  // snapshot can overwrite newer state.
  let hostRefreshTail: Promise<void> = Promise.resolve();
  // Set by onStateChanged; deterministicRefresh clears it at attempt start to
  // detect a run that finished without delivering a state snapshot.
  let stateFrameSeen = false;

  function recordProducts(toolCallId: string, content: string): void {
    if (toolNames.get(toolCallId) !== SEARCH_CATALOG_TOOL) return;
    const next = appendResultSet(
      productResults.get(),
      decodeSearchCatalogResult(toolCallId, content, currentMessageAnchor),
    );
    productResults.set(next);
    if (config.timelineStore && config.sessionId) {
      config.timelineStore.save(config.sessionId, toPersistedTimeline(next));
    }
  }

  const agent = new HttpAgent({
    url: `${config.agentUrl}/invoke`,
    threadId: config.sessionId,
    initialState: initialWidgetState,
    fetch: async (url, init) => {
      const active = pending;
      pending = null;
      if (!active) throw new Error('AG-UI request context is missing');
      if ('response' in active) return active.response;
      const input = requestInput(init.body);
      if (injected) return injected.response(active.authToken, input);
      if (!active.authToken) throw new Error('AG-UI transport requires an agent token');

      const headers = new Headers(init.headers);
      headers.set('Content-Type', 'application/json');
      headers.set('Accept', 'text/event-stream');
      headers.set('Authorization', `Bearer ${active.authToken}`);
      headers.set(AGENTCORE_SESSION_HEADER, input.threadId);
      // Wall-clock default aligned with the watch (URLSession 180s) and the
      // admin copilot harness. Must exceed real multi-tool turns: a client
      // disconnect aborts the SERVER run, not just the read.
      const timeout = AbortSignal.timeout(config.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS);
      const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      const response = await fetch(url, {
        ...init,
        headers,
        signal,
      });
      if (!response.ok) {
        const text = await response.text();
        let body: unknown;
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          body = undefined;
        }
        throw new HTTPError(`HTTP ${response.status}`, response.status, body);
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/event-stream')) {
        throw new HTTPError(
          `expected text/event-stream, received '${contentType}'`,
          response.status,
        );
      }
      return response;
    },
  });

  // RUN_ERROR is a terminal stream outcome, but HttpAgent resolves the
  // Promise after dispatching it. Capture the event so callers can turn that
  // resolved stream into a rejected operation. This state is reset before
  // every network attempt; otherwise a prior failed refresh can poison a
  // later successful one (and, worse, leave an old read model looking fresh).
  let lastRunError: {
    readonly code: string | null;
    readonly message: string;
  } | null = null;

  function capturedRunError(): Error | null {
    if (!lastRunError) return null;
    const prefix = lastRunError.code ?? 'RUN_ERROR';
    return new Error(`${prefix}: ${lastRunError.message}`);
  }

  function capturedRunErrorCode(): string | null {
    return lastRunError?.code ?? null;
  }

  function subscriber(onDecodedFrame?: (frame: DecodedFrame) => void): AgentSubscriber {
    function forwardEvent(event: BaseEvent): void {
      const raw = asSseEvent(event);
      if (injected?.consumeHidden(event)) return;
      config.devValidateFrame?.(raw.event, raw.data);
      config.frameTap?.(raw);
      const decoded = decodeFrame(raw);
      if (onDecodedFrame) {
        try {
          onDecodedFrame(decoded);
        } catch (cause) {
          (config.onObserverError ?? console.error)(cause);
        }
      }
      if (decoded.kind === 'session-warning') {
        sessionWarning.set(sessionWarningOf(decoded.expiresInSeconds, decoded.canExtend));
      }
      callbacks.forEach((callback) => callback(raw));
    }

    return {
      onMessagesChanged: ({ messages: current }) => {
        // AgentCore's request bridge sends only the current user turn. The
        // Strands adapter consequently emits a per-turn MESSAGES_SNAPSHOT,
        // not the whole browser transcript. Replacing our observable with
        // that snapshot made every earlier assistant bubble disappear and
        // orphaned cards anchored to those message ids. Merge by id instead:
        // streaming updates replace their in-flight bubble while completed
        // bubbles from earlier turns remain in chronological first-seen order.
        const next = [...messages.get()];
        const indexById = new Map(next.map((message, index) => [message.id, index]));
        for (const message of current) {
          let timestamp = messageTimestamps.get(message.id);
          if (!timestamp) {
            timestamp = new Date().toISOString();
            messageTimestamps.set(message.id, timestamp);
          }
          const agentMessage = asAgentMessage(message, timestamp);
          if (!agentMessage) continue;
          const index = indexById.get(agentMessage.id);
          if (index === undefined) {
            indexById.set(agentMessage.id, next.length);
            next.push(agentMessage);
          } else {
            next[index] = agentMessage;
          }
        }
        messages.set(next);
      },
      onStateChanged: ({ state }) => {
        stateFrameSeen = true;
        widgetState.set(state as WidgetState);
      },
      onToolCallStartEvent: ({ event }) => {
        toolNames.set(event.toolCallId, event.toolCallName);
      },
      onToolCallResultEvent: ({ event }) => {
        recordProducts(event.toolCallId, event.content);
      },
      onEvent: ({ event }) => {
        // RUN_FINISHED is forwarded by the SDK's typed callback below. That
        // callback exposes the normalized outcome explicitly, so native
        // Strands interrupts cannot be lost at the generic BaseEvent boundary.
        if (event.type === 'RUN_FINISHED') return;
        forwardEvent(event);
      },
      onRunFinishedEvent: (params) => {
        const outcome =
          params.outcome === 'interrupt'
            ? { type: 'interrupt' as const, interrupts: params.interrupts }
            : { type: 'success' as const };
        // The ONLY writer of the pendingInterrupt observable: a delivered
        // RUN_FINISHED outcome frame. A success outcome clears it; RUN_ERROR
        // and silent stream stops deliberately leave it untouched.
        pendingInterrupt.set(
          params.outcome === 'interrupt'
            ? projectInterruptFromRunFinished(params.interrupts)
            : { kind: 'none' },
        );
        forwardEvent({ ...params.event, outcome });
      },
      onRunErrorEvent: ({ event }) => {
        // The adapter emits a TYPED code on RUN_ERROR (THREAD_BUSY,
        // UNKNOWN_INTERRUPT, …). Capture it so retry logic branches on the
        // contract instead of sniffing the human-readable message.
        lastRunError = {
          code: typeof event.code === 'string' ? event.code : null,
          message: event.message,
        };
      },
    };
  }

  agent.subscribe(subscriber());

  /**
   * Stable per-session context resent on EVERY run, including interrupt
   * resumes. A resume without these regressed to server defaults — a phone
   * checkout resumed as a membersite checkout (surface lost) in the wrong
   * language (locale lost) under the wrong storefront.
   */
  function stableForwardedProps(storefrontId?: string): Record<string, unknown> {
    const effectiveStorefrontId = storefrontId ?? config.storefrontId;
    return {
      ...(config.contractVersion ? { contractVersion: config.contractVersion } : {}),
      ...(config.locale ? { locale: config.locale } : {}),
      ...(config.surface ? { surface: config.surface } : {}),
      ...(effectiveStorefrontId ? { storefrontId: effectiveStorefrontId } : {}),
    };
  }

  /** Journal the effective storefront for interrupts raised by the run that just ended. */
  function journalPendingInterrupts(storefrontId?: string): void {
    for (const interrupt of agent.pendingInterrupts) {
      // First writer wins: an interrupt's originating turn sets its storefront;
      // later runs (or a rotated host route) must not relabel it.
      if (!interruptStorefronts.has(interrupt.id)) {
        interruptStorefronts.set(interrupt.id, storefrontId ?? config.storefrontId);
      }
    }
  }

  async function run(
    request: AgentRequest,
    authToken: string,
    whisperId?: string,
    pageContext?: PageContext,
    actingContext?: ActingContext,
    storefrontId?: string,
    siteContext?: SplashSiteContext,
  ): Promise<{ readonly hasAssistantReply: boolean; readonly interrupted: boolean }> {
    agent.threadId = request.sessionId;
    currentMessageAnchor = request.message.id;
    pending = { authToken };
    const result = await agent.runAgent({
      forwardedProps: {
        ...stableForwardedProps(storefrontId),
        ...(whisperId ? { whisperId } : {}),
        ...(pageContext ? { pageContext } : {}),
        ...(actingContext ? { actingContext } : {}),
        ...(siteContext ? { siteContext } : {}),
      },
    });
    // A THREAD_BUSY run lock arrives two ways: an HTTP-level error (throws
    // above) or an in-stream RUN_ERROR event, after which runAgent RESOLVES.
    // Normalize the stream form into a throw so runWithThreadBusyRetry
    // handles both identically.
    if (capturedRunErrorCode() === 'THREAD_BUSY') {
      throw new Error('THREAD_BUSY: a run is already in progress for this thread');
    }
    journalPendingInterrupts(storefrontId);
    return {
      // Use the official client's per-run delta instead of inferring a reply
      // from the accumulated transcript. This remains correct for restored
      // sessions and avoids treating an old assistant bubble as this turn's.
      hasAssistantReply: result.newMessages.some(
        (message) => asAgentMessage(message, '') !== null,
      ),
      interrupted: agent.pendingInterrupts.length > 0,
    };
  }

  /**
   * Shared engine for every zero-token deterministic read (host-action
   * refresh, signals bootstrap): posts one run carrying only the supplied
   * `forwardedProps`, absorbs its STATE_SNAPSHOT through the normal fold, adds
   * no message, and flips no loading/error observable. Retries a typed
   * THREAD_BUSY and re-mints once on a 401; a run that finishes without a
   * snapshot rejects with the caller's `noStateError`.
   */
  async function deterministicRefresh(
    sessionId: string,
    authToken: string,
    forwardedProps: Record<string, unknown>,
    noStateError: string,
  ): Promise<void> {
    agent.threadId = sessionId;
    let token = authToken;
    for (let attempt = 0; attempt < THREAD_BUSY_ATTEMPTS; attempt += 1) {
      lastRunError = null;
      try {
        stateFrameSeen = false;
        pending = { authToken: token };
        await agent.runAgent({ forwardedProps });
        const runError = capturedRunError();
        if (runError) throw runError;
        if (!stateFrameSeen) {
          throw new Error(noStateError);
        }
        return;
      } catch (cause) {
        if (cause instanceof HTTPError && cause.status === 401 && config.onAuthExpired) {
          const freshToken = await config.onAuthExpired();
          if (freshToken) {
            token = freshToken;
            continue;
          }
          throw cause;
        }
        if (!isThreadBusy(cause) || attempt >= THREAD_BUSY_ATTEMPTS - 1) throw cause;
        await threadBusyBackoff(attempt);
      }
    }
  }

  async function performHostActionRefresh(
    action: HostActionInvocation,
    sessionId: string,
    authToken: string,
  ): Promise<void> {
    if (!authToken) throw new Error('a host-action refresh requires an agent token');
    // Opportunistic: never contend with an in-flight chat run (the server's
    // per-thread run lock would THREAD_BUSY it anyway, and aborting a model
    // turn for a background refresh would be backwards).
    if (loading.get()) return;
    const actionStorefrontId =
      typeof action === 'object' && 'storefrontId' in action
        ? action.storefrontId
        : undefined;
    await deterministicRefresh(
      sessionId,
      authToken,
      { ...stableForwardedProps(actionStorefrontId), hostAction: action },
      'HOST_ACTION_NO_STATE: deterministic read returned no state snapshot',
    );
  }

  async function performBootstrapRefresh(sessionId: string, authToken: string): Promise<void> {
    if (!authToken) throw new Error('a signals bootstrap requires an agent token');
    // Same opportunistic rule as the host-action refresh: when a model turn
    // already owns the thread its own state wins and the bootstrap is skipped.
    if (loading.get()) return;
    await deterministicRefresh(
      sessionId,
      authToken,
      { ...stableForwardedProps(), bootstrap: 'signals' },
      'SIGNALS_BOOTSTRAP_NO_STATE: bootstrap returned no state snapshot',
    );
  }

  // Opportunistic-refresh queue: skip when a model turn already owns the
  // client, otherwise serialize behind any in-flight deterministic refresh so
  // a user send queues after it. The queued callback re-checks `loading` at
  // start time because a user turn may have claimed the client meanwhile.
  function enqueueRefresh(operation: () => Promise<void>): Promise<void> {
    if (loading.get()) return Promise.resolve();
    const queued = hostRefreshTail.then(() => (loading.get() ? undefined : operation()));
    hostRefreshTail = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  const refreshHostAction: ChatClient['refreshHostAction'] = (action, sessionId, authToken) =>
    enqueueRefresh(() => performHostActionRefresh(action, sessionId, authToken));

  const refreshBootstrap: ChatClient['refreshBootstrap'] = (sessionId, authToken) =>
    enqueueRefresh(() => performBootstrapRefresh(sessionId, authToken));

  /**
   * Shared 401 re-mint-and-retry shape for sendMessage/resumeInterrupt
   * (deterministicRefresh keeps its own loop — different retry semantics).
   * Failure is RETURNED, not thrown, so each call site keeps its exact
   * fail()/rethrow policy: 'first' = the original failure stands (no re-auth
   * hook, or the host declined to mint), 'retry' = the single re-minted retry
   * itself failed. A rejecting onAuthExpired still propagates as a throw.
   */
  type AuthRetryOutcome =
    | { readonly ok: true }
    | { readonly ok: false; readonly phase: 'first' | 'retry'; readonly cause: unknown };

  async function withAuthRetry(
    authToken: string,
    attempt: (authToken: string) => Promise<void>,
  ): Promise<AuthRetryOutcome> {
    try {
      await attempt(authToken);
      return { ok: true };
    } catch (cause) {
      if (cause instanceof HTTPError && cause.status === 401 && config.onAuthExpired) {
        const freshToken = await config.onAuthExpired();
        if (freshToken) {
          try {
            await attempt(freshToken);
            return { ok: true };
          } catch (retryCause) {
            return { ok: false, phase: 'retry', cause: retryCause };
          }
        }
      }
      return { ok: false, phase: 'first', cause };
    }
  }

  async function resumeInterrupt(
    interruptId: string,
    response: Omit<ResumeEntry, 'interruptId'>,
    authToken: string,
  ): Promise<void> {
    await hostRefreshTail;
    if (!interruptId) throw new Error('interrupt id is required');
    if (!authToken) throw new Error('AG-UI interrupt resume requires an agent token');
    error.set(null);
    loading.set(true);
    // Resume under the interrupt's ORIGINATING storefront (journaled at run
    // end), never the current host route — plus the stable session context
    // (surface / locale / contractVersion). Without these a standalone Apple
    // checkout resumed as a membersite regular-store checkout.
    const resumeInput = {
      resume: [{ interruptId, ...response }],
      forwardedProps: stableForwardedProps(interruptStorefronts.get(interruptId)),
    };
    try {
      const outcome = await withAuthRetry(authToken, async (token) => {
        pending = { authToken: token };
        await agent.runAgent(resumeInput);
        interruptStorefronts.delete(interruptId);
      });
      if (!outcome.ok) {
        // Pre-helper behavior, preserved exactly: only a standing FIRST
        // failure surfaces through fail(); a failed re-minted retry rethrows
        // without touching the error observable.
        if (outcome.phase === 'first') fail(outcome.cause);
        throw outcome.cause;
      }
    } finally {
      loading.set(false);
    }
  }

  function fail(cause: unknown): void {
    if (cause instanceof Error && cause.name === 'AbortError') return;
    if (cause instanceof HTTPError && cause.status === 409) {
      const body = cause.body as { code?: string; message?: string } | undefined;
      if (body?.code === 'PENDING_CONFIRMATION') {
        error.set(body.message ?? 'Resolve the pending confirmation before sending a new message.');
        return;
      }
    }
    error.set(
      cause instanceof HTTPError && cause.status === 401
        ? SESSION_EXPIRED_MESSAGE
        : cause instanceof Error
          ? `Agent connection error: ${cause.message}`
          : 'Unknown error occurred',
    );
  }

  // The server holds a per-thread run lock (AG-UI THREAD_BUSY): after a
  // client-side abort the runtime releases the lock only once it notices the
  // disconnect, so an immediate follow-up send can race it. Bounded backoff —
  // a lock still held after every attempt surfaces as the real error.
  //
  // Primary signal is the TYPED RUN_ERROR code captured by the subscriber;
  // the message regex remains only as a fallback for servers that predate the
  // typed code (additive dual-read, removed with the legacy-removal release).
  const THREAD_BUSY_PATTERN = /THREAD_BUSY|already in progress/;
  const THREAD_BUSY_ATTEMPTS = 4;

  function isThreadBusy(cause: unknown): boolean {
    return (
      capturedRunErrorCode() === 'THREAD_BUSY' ||
      (cause instanceof Error && THREAD_BUSY_PATTERN.test(cause.message))
    );
  }

  function threadBusyBackoff(attempt: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }

  async function runWithThreadBusyRetry(
    ...runArgs: Parameters<typeof run>
  ): ReturnType<typeof run> {
    for (let attempt = 0; ; attempt += 1) {
      lastRunError = null;
      try {
        return await run(...runArgs);
      } catch (cause) {
        if (!isThreadBusy(cause) || attempt >= THREAD_BUSY_ATTEMPTS - 1) throw cause;
        await threadBusyBackoff(attempt);
      }
    }
  }

  const sendMessage: ChatClient['sendMessage'] = async (request, options) => {
    // Claim the client for the user turn IMMEDIATELY — before yielding to the
    // opportunistic-refresh tail. This (a) shows the typing indicator and user
    // bubble at once, and (b) makes every not-yet-started bootstrap/overview
    // refresh see `loading` and skip itself (their queued callback re-checks
    // `loading.get()`), so a user send never waits behind opportunistic work.
    // An already-streaming refresh still holds the server thread until its
    // stream closes; the `await hostRefreshTail` below yields only for that,
    // and every further queued refresh is dropped.
    if (loading.get()) agent.abortRun();
    error.set(null);
    loading.set(true);
    agent.addMessage({ id: request.message.id, role: 'user', content: request.message.content });
    await hostRefreshTail;
    try {
      const outcome = await withAuthRetry(options?.authToken ?? '', async (token) => {
        const completion = await runWithThreadBusyRetry(
          request,
          token,
          options?.whisperId,
          options?.pageContext,
          options?.actingContext,
          options?.storefrontId,
          options?.siteContext,
        );
        if (!completion.interrupted && !completion.hasAssistantReply) {
          error.set(EMPTY_RESPONSE_MESSAGE);
        }
      });
      // Unlike resumeInterrupt, a send surfaces EVERY standing failure —
      // first or retry — through fail(), and never rethrows.
      if (!outcome.ok) fail(outcome.cause);
    } finally {
      loading.set(false);
    }
  };

  return {
    messages: messages.observable,
    loading: loading.observable,
    error: error.observable,
    sessionWarning: sessionWarning.observable,
    widgetState: widgetState.observable,
    productResults: productResults.observable,
    pendingInterrupt: pendingInterrupt.observable,
    sendMessage,
    resumeInterrupt,
    refreshHostAction,
    refreshBootstrap,
    async consumeResumedStream(response, onDecodedFrame) {
      await hostRefreshTail;
      if (!response.body) throw new Error('Confirmation response body is not readable');
      pending = { response };
      const observer: AgentSubscriber = onDecodedFrame
        ? {
            onEvent: ({ event }) => {
              try {
                onDecodedFrame(decodeFrame(asSseEvent(event)));
              } catch (cause) {
                (config.onObserverError ?? console.error)(cause);
              }
            },
          }
        : {};
      await agent.runAgent({}, observer);
    },
    onEvent(callback) {
      callbacks.add(callback);
      return () => callbacks.delete(callback);
    },
    disconnect() {
      agent.abortRun();
      loading.set(false);
      callbacks.clear();
    },
    clearMessages() {
      agent.setMessages([]);
      messageTimestamps.clear();
      messages.set([]);
    },
    abandonPendingInterrupts() {
      // Terminal handoffs (e.g. an acting-program switch) abandon their session
      // WITHOUT resuming the interrupt; the agent instance survives the host's
      // rotation, so its client-side interrupt bookkeeping must be dropped or
      // every later run on this client throws "pending interrupt(s) not
      // addressed by resume".
      agent.pendingInterrupts = [];
      interruptStorefronts.clear();
    },
    setWidgetState(state) {
      agent.setState(state);
      widgetState.set(state);
    },
    clearError() {
      error.set(null);
    },
    dismissSessionWarning() {
      sessionWarning.set(null);
    },
  };
}
