import { z } from 'zod';

/**
 * Copilot-initiated acting-program switch — the terminal-interrupt contract.
 *
 * An acting-program switch is a host-authorized identity and session ROTATION,
 * never a mutable tenant change inside an existing agent session: the model
 * requests it with a program NAME, a runtime hook interrupts BEFORE any tool in
 * the batch executes (so no old-tenant tool can run alongside the request), and
 * the HOST resolves the label against its own authority hierarchy. On success
 * the host abandons the interrupted session, switches its acting context,
 * mints a new token, and forwards the original message into a fresh thread; on
 * rejection it resumes the interrupt with a structured resolution and the
 * runtime cancels the batch so the model can explain. Podium re-validates the
 * declared program at mint — a label the admin is not authorized for cannot
 * become a token. No ids, no program lists, and no continuation text ride this
 * contract.
 */

/**
 * Always-on host-truth context, delivered per turn via
 * `forwardedProps.actingContext`. Untrusted vocabulary: the runtime frames it
 * as data, never instructions, and the server-verified program claim remains
 * the authoritative acting tenant.
 */
export const ActingContextSchema = z
  .object({
    /** Display label of the acting program as the host shows it. */
    actingProgramLabel: z.string().trim().min(1).max(160),
    /** False for program-bound admins (single-program authority) — the switch tool short-circuits. */
    canSwitchPrograms: z.boolean(),
  })
  .strict();
export type ActingContext = z.infer<typeof ActingContextSchema>;

export const PROGRAM_SWITCH_INTERRUPT_KIND = 'admin_program_switch' as const;

/** Interrupt reason raised by the runtime hook. Label only — the host resolves it. */
export const ProgramSwitchInterruptReasonSchema = z
  .object({
    kind: z.literal(PROGRAM_SWITCH_INTERRUPT_KIND),
    programLabel: z.string().trim().min(1).max(160),
  })
  .strict();
export type ProgramSwitchInterruptReason = z.infer<typeof ProgramSwitchInterruptReasonSchema>;

/**
 * Host resolution delivered on interrupt RESUME. A successful switch never
 * resumes the interrupt (the session is abandoned), so only the non-switch
 * outcomes are representable.
 */
export const ProgramSwitchResolutionSchema = z
  .object({
    status: z.enum(['already_acting', 'rejected']),
    code: z.enum(['unknown_program', 'ambiguous', 'pending_save', 'unavailable']).optional(),
    /** Label-only alternatives the admin may mean; never ids. */
    candidates: z.array(z.string().trim().min(1).max(160)).max(20).optional(),
  })
  .strict();
export type ProgramSwitchResolution = z.infer<typeof ProgramSwitchResolutionSchema>;
