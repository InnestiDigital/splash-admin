# Vendored AG-UI client + protocol

Source: WALLE `agentcore-platform`, worktree `splash-runtime-wt`
(`/Users/mottaviani/Workspace/engagepeople/WALLE/splash-runtime-wt`), branch
`feat/splash-runtime` — `packages/ag-ui-client/src` and `packages/protocol/src`.

Vendored at commit: `bbd8e95ad17772ec6109a8ce935e37006fccc371` (`bbd8e95`) on 2026-08-23.
This worktree (not the main `agentcore-platform` checkout, which was still on
`main`) carries the Splash-specific protocol modules — `types/splash-navigation.ts`,
`types/splash-prefill.ts`, `types/splash-editor-context.ts`,
`types/splash-editor-ops.ts` and `widget-protocol/splash-state.ts` — and is the
CONTROLLER-RULED source for this vendoring pass.

Vendored checksum: `sha256:28502ec22d101b7ee11e96de92a452ccc65faea90ec2c2fcc49b6c17fcfdfdfc`

## New production dependencies

Four packages the vendored source imports directly, pinned to the exact
versions the source `package.json`s in the worktree declare (matches the
`podium_admin_v2` precedent for vendoring the same client):

- `@ag-ui/client@0.0.57` — `HttpAgent`/`AgentSubscriber`/`BaseEvent`/`Message`, used at runtime by `client/turn.ts`.
- `@ag-ui/core@0.0.57` — `RunAgentInput`/`ResumeEntry` types used by `client/turn.ts`, `client/injected-transport.ts`, `transport/sse.ts`.
- `fast-json-patch@3.1.1` — RFC 6902 patch application in `state/reduce.ts`.
- `zod@^4.1.12` — every schema in `protocol/**` (splash-cms had no zod dependency before this).

These are the only new dependencies; nothing else in `admin/lib/**` requires
an npm package Splash didn't already have.

## Local adaptations (re-apply after any refresh)

1. `@agentcore-platform/protocol` imports rewritten to relative `../protocol`
   (or `../../protocol` from two levels deep) paths throughout
   `admin/lib/ag-ui-client/**`.
2. `WidgetState` re-pointed to `SplashWidgetState` (and its default seed to
   `EMPTY_SPLASH_WIDGET_STATE`) in `ag-ui-client/state/reduce.ts` and
   `ag-ui-client/client/turn.ts` — both marked
   `// SPLASH VENDOR EDIT: WidgetState re-pointed to SplashWidgetState (see admin/lib/README.md)`.
   Every other vendored file, including rewards-only modules
   (`state/product-results.ts`, the rewards `EMPTY_WIDGET_STATE` re-export in
   `ag-ui-client/index.ts`, `protocol/widget-protocol/widget-state.ts`, etc.),
   is left in place verbatim and simply unimported by Splash code.
3. Splash protocol modules (`protocol/types/splash-navigation.ts`,
   `protocol/types/splash-prefill.ts`, `protocol/types/splash-editor-context.ts`,
   `protocol/types/splash-editor-ops.ts`, `protocol/types/splash-site-context.ts`,
   `protocol/widget-protocol/splash-state.ts`)
   are vendored VERBATIM from the worktree — canonical names, do not rename:
   - `SPLASH_NAV_TARGETS`, `SplashNavTarget`, `SplashNavTargetSchema`
   - `SplashPendingNavigationSchema`, `SplashPendingNavigationState`
   - `SPLASH_PREFILL_KINDS`, `SplashPrefillKind`, `SplashPrefillSchema`, `SplashPrefill`
   - `SplashPendingPrefillSchema`, `SplashPendingPrefill`
   - `SplashWidgetStateSchema`, `SplashWidgetState`, `EMPTY_SPLASH_WIDGET_STATE`
     (now includes the `pendingEditorOps` slice alongside `pendingNavigation`
     and `pendingPrefill`)
   - R2E editor context (`splash-editor-context.ts`): `MAX_EDITOR_DIGEST_BYTES`,
     `SplashEditorSelectionSchema`/`SplashEditorSelection`,
     `SplashEditorOutlineBlockSchema`/`SplashEditorOutlineBlock`,
     `SplashEditorOutlineSectionSchema`/`SplashEditorOutlineSection`,
     `SplashEditorVocabularySchema`/`SplashEditorVocabulary`,
     `SplashEditorOpsReportSchema`/`SplashEditorOpsReport`,
     `SplashEditorContextSchema`/`SplashEditorContext`,
     and (M2) `MAX_EDITOR_MEDIA_ITEMS`,
     `SplashEditorMediaItemSchema`/`SplashEditorMediaItem`,
     `SplashEditorMediaSchema`/`SplashEditorMedia` — plus the optional `media`
     key on `SplashEditorContextSchema`
   - R2E editor ops (`splash-editor-ops.ts`): `SPLASH_EDITOR_SECTION_TYPES`,
     `SplashEditorSectionType`, `SplashEditorSectionTypeSchema` (L3),
     `SPLASH_EDITOR_LAYOUT_TYPES`,
     `SPLASH_SECTION_PRESENTATION_FIELDS`, `SplashSectionPresentationField`,
     `MAX_EDITOR_OPS_PER_BATCH`, `SPLASH_EDITOR_OP_KINDS` (21 members —
     20 write ops + `select`; M2 added `attach_media`, P4 added
     `update_layout_config` and `set_block_placement`), `SplashEditorOpKind`,
     `SplashEditorRefSchema`/`SplashEditorRef`,
     `SplashEditorOpSchema`/`SplashEditorOp`,
     `SplashPendingEditorOpsSchema`/`SplashPendingEditorOps`
   - `SplashSiteContextSchema` now carries the optional `editor` key (the
     advisory editor digest) — the object is `.strict()`, so sending `editor`
     to a runtime whose schema predates it is a hard parse failure, not a
     silently ignored field.

   These are the deployed AgentCore runtime contract; the WALLE worktree copy
   is authoritative over any inline snippet in local planning docs. Drift tests
   on the Splash side (`tests/admin/config/assistant-nav-targets.test.ts`,
   `tests/admin/config/assistant-prefill-kinds.test.ts`,
   `tests/admin/config/vendored-protocol-checksum.test.ts`) guard against
   divergence after a re-vendor.
4. **M2 (`attach_media`)** extended the two Splash editor protocol modules
   in place rather than re-vendoring them: `splash-editor-ops.ts` gained the
   `attach_media` union member and its kind, `splash-editor-context.ts` gained
   the media inventory listed above. These are ADDITIONS to the deployed
   contract, so a runtime that predates them still parses an admin that has
   them — but the reverse does not hold, and `SplashSiteContextSchema` is
   `.strict()`: WALLE must ship the same protocol change first (see the deploy
   ordering in `docs/architecture/assistant-r2e.md`). Re-vendoring from the
   WALLE branch must carry these forward, not revert them.
5. **L3 (theme-scoped section types)** widened `splash-editor-ops.ts` in place,
   the same way M2 did. `add_section.sectionType` and
   `change_section_type.sectionType` were `z.enum(SPLASH_EDITOR_SECTION_TYPES)`;
   they are now `SplashEditorSectionTypeSchema` (`z.string().min(1).max(60)`),
   and `SplashEditorSectionType` widened from the tuple's union to `string`.
   Section types became theme data — a theme declares one by adding
   `themes/<theme>/section-types/<type>.settings.json` — so a four-member enum
   in the protocol could not name a type the renderer renders. The narrowing did
   not disappear: `admin/utils/editorOps/facade.ts` (`knownSectionTypes()`)
   rejects any type the OPEN THEME does not declare, which is strictly tighter
   than the old enum for every theme and correct for themes the enum never knew.
   `SPLASH_EDITOR_SECTION_TYPES` survives as the reference-theme seed for
   prompting. This is a WIDENING of the deployed contract: a runtime that still
   emits one of the four enum values parses unchanged here, so the admin may
   ship first — but a runtime that emits a theme-defined type needs the same
   protocol change on the WALLE side before it will validate there.
7. **Assistant quality (2026-09)** extended `splash-editor-context.ts` in place,
   the same way M2 did: `blockTypes` entries gained an OPTIONAL `settings` array
   (up to 16 declared setting ids, each <=60 chars) so the model writes existing
   settings keys without a `list_block_schemas` round-trip. Ids only — option
   vocabularies stay runtime-side to hold the 24 KB digest budget. This is an
   ADDITION to the deployed contract; because `SplashSiteContextSchema` is
   `.strict()`, a runtime that predates it may reject digests that carry the new
   field — the same deploy ordering as M2 applies (WALLE ships the same optional
   member before an admin that emits it). The degradation ladder treats the ids
   as payload of `blockTypes`: they ride `narrowBlockTypes` and vanish with the
   array at the terminal clamp.
6. `admin/lib/**` is checksummed. After ANY re-vendor, recompute the checksum
   (the command lives in `tests/admin/config/vendored-protocol-checksum.test.ts`)
   and update the `Vendored checksum:` line above. A stale value fails CI —
   that is the point: a partial re-vendor used to ship silently.

This directory is coverage-excluded (`vitest.config.ts`), same as generated
code. There is no ESLint config in this repo (no `eslint.config.mjs` or
equivalent exists anywhere in splash-cms), so there is nothing to exempt it
from. Do not hand-edit beyond the list above.
