export type SelectionContext =
  | { type: 'block'; blockId: string; sectionId: string }
  | { type: 'section'; sectionId: string }
  | { type: 'layout'; layoutType: string }
