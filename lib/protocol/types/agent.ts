import { z } from 'zod';

import { PageContextSchema } from './page-context.js';

/**
 * Plain interfaces, not zod schemas — nothing in the codebase ever
 * `.parse()`s an `AgentMessage`/`AgentRequest`; every callsite (widget,
 * ag-ui-client, engine) consumes the TS type directly. A hand-authored
 * runtime validator with zero callers is dead weight, so this stays a
 * type-only contract. (`InvokeMessageBodySchema` / `InvokeEnvelopeSchema`
 * below ARE actually parsed at the wire boundary and keep their zod
 * schemas.)
 */
export interface AgentMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'tool';
  readonly content: string;
  readonly timestamp: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AgentRequest {
  readonly sessionId: string;
  readonly message: AgentMessage;
  readonly clientId: string;
  readonly memberId: string;
  readonly programId?: string;
  /** Idempotency key for checkout retry protection. */
  readonly idempotencyKey?: string;
  /**
   * Concierge whisper id that seeded this turn, when the user activated
   * a whisper pill or host-page bubble. The server uses this to mark
   * the whisper consumed. Optional and advisory.
   */
  readonly whisperId?: string;
}

/**
 * Body of the AgentCore invocation envelope for a `message` turn. The single
 * shared definition of the wire body the widget transport posts and the
 * runtime parses — neither side re-declares its own inline shape.
 *
 * `protocol` is pinned to the only wire format (`'ag-ui'`). Identity never
 * rides the body (the runtime derives it from the verified agent token);
 * `turnId` pins the controlled real-submit one-shot and `whisperId` carries
 * the concierge whisper that seeded the turn. Both are optional and advisory.
 *
 * The runtime accepts a SUPERSET of this body (identity / locale / debug
 * fields) by extending this schema — this is the shared core.
 */
export const InvokeMessageBodySchema = z.object({
  sessionId: z.string().min(1),
  userMessage: z.string().min(1),
  contractVersion: z.string().min(1),
  protocol: z.literal('ag-ui'),
  turnId: z.string().min(1).optional(),
  whisperId: z.string().min(1).optional(),
  /**
   * Advisory context for the page the user has open (host-published; labels
   * only). Honored only for the verified admin persona today.
   */
  pageContext: PageContextSchema.optional(),
});

/**
 * AgentCore invocation envelope (the `{ kind, body }` wire shape posted to
 * `${url}/invoke`). Currently models the `message` kind only; the runtime's
 * discriminated union extends this with its server-only kinds.
 */
export const InvokeEnvelopeSchema = z.object({
  kind: z.literal('message'),
  body: InvokeMessageBodySchema,
});
export type InvokeEnvelope = z.infer<typeof InvokeEnvelopeSchema>;
