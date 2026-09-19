import { z } from 'zod';
import { RewardsLocaleSchema } from './locale.js';

/** AG-UI CUSTOM event emitted when the runtime stops a runaway tool loop. */
export const TOOL_CALL_LIMIT_EVENT_NAME = 'tool_call_limit_reached' as const;

export const ToolCallLimitReasonSchema = z.enum([
  'max_tool_calls',
  'max_same_tool_calls',
]);
export type ToolCallLimitReason = z.infer<typeof ToolCallLimitReasonSchema>;

/**
 * PII-free terminal payload. The member-facing copy is resolved by the
 * runtime from the verified request locale and mirrored onto normal AG-UI
 * assistant text frames; CUSTOM-event consumers can use the coded fields.
 */
export const ToolCallLimitPayloadSchema = z
  .object({
    code: z.literal('TOOL_CALL_LIMIT_REACHED'),
    reason: ToolCallLimitReasonSchema,
    locale: RewardsLocaleSchema,
    message: z.string().min(1),
    limit: z.number().int().positive(),
    attempted: z.number().int().positive(),
  })
  .strict();
export type ToolCallLimitPayload = z.infer<typeof ToolCallLimitPayloadSchema>;
