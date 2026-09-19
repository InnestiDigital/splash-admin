// Section type icons — inline SVG strings for visual pickers
// viewBox="0 0 48 48" for section types, "0 0 32 32" for layout settings

export const sectionTypeIcons: Record<string, string> = {
  // Section type wireframes (80x60 viewBox, rendered at 48px height)
  // Color-coded zones: grey=#e8e8e8 (content), blue=#d5e3f7 (sidebar/chrome), dark=#c8c8c8 (media)

  hero: `<svg viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="78" height="58" rx="3" fill="#3a3a3a" stroke="#999" stroke-width="1"/>
    <rect x="20" y="14" width="40" height="4" rx="2" fill="#fff" opacity="0.9"/>
    <rect x="26" y="22" width="28" height="2.5" rx="1" fill="#fff" opacity="0.5"/>
    <rect x="30" y="28" width="20" height="2.5" rx="1" fill="#fff" opacity="0.5"/>
    <rect x="32" y="38" width="16" height="6" rx="3" fill="#90b8e8" opacity="0.8"/>
    <text x="40" y="42.5" text-anchor="middle" font-size="4" fill="#fff" font-family="sans-serif">CTA</text>
    <text x="40" y="54" text-anchor="middle" font-size="5" fill="#aaa" font-family="sans-serif">Title · CTA · Media</text>
  </svg>`,

  stacked: `<svg viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="12" y="4" width="56" height="14" rx="3" fill="#e8e8e8" stroke="#ccc" stroke-width="0.5"/>
    <rect x="16" y="8" width="30" height="2" rx="1" fill="#999"/><rect x="16" y="12" width="22" height="2" rx="1" fill="#bbb"/>
    <rect x="12" y="22" width="56" height="14" rx="3" fill="#e8e8e8" stroke="#ccc" stroke-width="0.5"/>
    <rect x="16" y="26" width="34" height="2" rx="1" fill="#999"/><rect x="16" y="30" width="26" height="2" rx="1" fill="#bbb"/>
    <rect x="12" y="40" width="56" height="14" rx="3" fill="#e8e8e8" stroke="#ccc" stroke-width="0.5"/>
    <rect x="16" y="44" width="28" height="2" rx="1" fill="#999"/><rect x="16" y="48" width="20" height="2" rx="1" fill="#bbb"/>
    <text x="40" y="4" text-anchor="middle" font-size="5" fill="#aaa" font-family="sans-serif" dy="-0.5">Blocks in order ↓</text>
  </svg>`,

  'editorial-split': `<svg viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="48" height="56" rx="3" fill="#e8e8e8" stroke="#ccc" stroke-width="0.5"/>
    <rect x="53" y="2" width="25" height="56" rx="3" fill="#d5e3f7" stroke="#90b8e8" stroke-width="0.5"/>
    <rect x="6" y="7" width="28" height="3" rx="1.5" fill="#999"/>
    <rect x="6" y="14" width="40" height="2" rx="1" fill="#bbb"/>
    <rect x="6" y="19" width="36" height="2" rx="1" fill="#bbb"/>
    <rect x="6" y="24" width="38" height="2" rx="1" fill="#bbb"/>
    <rect x="6" y="29" width="32" height="2" rx="1" fill="#bbb"/>
    <rect x="57" y="7" width="17" height="3" rx="1.5" fill="#7aa8de"/>
    <rect x="57" y="14" width="14" height="2" rx="1" fill="#a0c0e8"/>
    <rect x="57" y="19" width="16" height="2" rx="1" fill="#a0c0e8"/>
    <rect x="57" y="28" width="17" height="6" rx="3" fill="#90b8e8"/>
    <text x="25" y="52" text-anchor="middle" font-size="5" fill="#999" font-family="sans-serif">Content</text>
    <text x="65.5" y="52" text-anchor="middle" font-size="5" fill="#7aa8de" font-family="sans-serif">Sidebar</text>
  </svg>`,

  gallery: `<svg viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="4" width="22" height="22" rx="3" fill="#e8e8e8" stroke="#ccc" stroke-width="0.5"/>
    <rect x="29" y="4" width="22" height="22" rx="3" fill="#e8e8e8" stroke="#ccc" stroke-width="0.5"/>
    <rect x="54" y="4" width="22" height="22" rx="3" fill="#e8e8e8" stroke="#ccc" stroke-width="0.5"/>
    <rect x="4" y="29" width="22" height="22" rx="3" fill="#e8e8e8" stroke="#ccc" stroke-width="0.5"/>
    <rect x="29" y="29" width="22" height="22" rx="3" fill="#e8e8e8" stroke="#ccc" stroke-width="0.5"/>
    <rect x="54" y="29" width="22" height="22" rx="3" fill="#e8e8e8" stroke="#ccc" stroke-width="0.5"/>
    <line x1="13" y1="11" x2="17" y2="17" stroke="#bbb" stroke-width="1"/><line x1="17" y1="17" x2="21" y2="13" stroke="#bbb" stroke-width="1"/>
    <circle cx="11" cy="10" r="2" fill="#d0d0d0"/>
    <line x1="38" y1="11" x2="42" y2="17" stroke="#bbb" stroke-width="1"/><line x1="42" y1="17" x2="46" y2="13" stroke="#bbb" stroke-width="1"/>
    <circle cx="36" cy="10" r="2" fill="#d0d0d0"/>
    <text x="40" y="57" text-anchor="middle" font-size="5" fill="#aaa" font-family="sans-serif">Grid · Masonry · Strip · Carousel</text>
  </svg>`,
}

/**
 * The wireframe for a section type this file has never heard of.
 *
 * Section types are theme vocabulary (L3), so `sectionTypeIcons` can only ever
 * cover the reference theme's four. A theme-defined type used to render no icon
 * at all, which read as a broken row rather than an unillustrated one.
 */
export const genericSectionTypeIcon = `<svg viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="76" height="56" rx="3" fill="#f5f5f5" stroke="#ccc" stroke-width="1" stroke-dasharray="4 3"/>
  <rect x="10" y="10" width="60" height="10" rx="2" fill="#e8e8e8" stroke="#ddd" stroke-width="0.5"/>
  <rect x="10" y="24" width="28" height="24" rx="2" fill="#e8e8e8" stroke="#ddd" stroke-width="0.5"/>
  <rect x="42" y="24" width="28" height="24" rx="2" fill="#d5e3f7" stroke="#bcd4f0" stroke-width="0.5"/>
  <text x="40" y="17.5" text-anchor="middle" font-size="5" fill="#aaa" font-family="sans-serif">Theme layout</text>
</svg>`

/** The icon for `sectionType`, never empty. */
export function sectionTypeIcon(sectionType: string): string {
  return sectionTypeIcons[sectionType] ?? genericSectionTypeIcon
}

// Layout setting icons (32x32) — keyed by "settingId.optionValue"
export const settingIcons: Record<string, string> = {
  // shellSide
  'shellSide.left': `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="4" width="10" height="24" rx="2" fill="#d5e3f7" stroke="#90b8e8" stroke-width="1"/>
    <rect x="14" y="4" width="16" height="24" rx="2" fill="#e8e8e8" stroke="#bbb" stroke-width="1"/>
  </svg>`,

  'shellSide.right': `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="4" width="16" height="24" rx="2" fill="#e8e8e8" stroke="#bbb" stroke-width="1"/>
    <rect x="20" y="4" width="10" height="24" rx="2" fill="#d5e3f7" stroke="#90b8e8" stroke-width="1"/>
  </svg>`,

  // contentWidthRatio
  'contentWidthRatio.equal': `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="4" width="13" height="24" rx="2" fill="#e8e8e8" stroke="#bbb" stroke-width="1"/>
    <rect x="17" y="4" width="13" height="24" rx="2" fill="#e8e8e8" stroke="#bbb" stroke-width="1"/>
  </svg>`,

  'contentWidthRatio.wide-left': `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="4" width="18" height="24" rx="2" fill="#d5e3f7" stroke="#90b8e8" stroke-width="1"/>
    <rect x="22" y="4" width="8" height="24" rx="2" fill="#e8e8e8" stroke="#bbb" stroke-width="1"/>
  </svg>`,

  'contentWidthRatio.wide-right': `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="4" width="8" height="24" rx="2" fill="#e8e8e8" stroke="#bbb" stroke-width="1"/>
    <rect x="12" y="4" width="18" height="24" rx="2" fill="#d5e3f7" stroke="#90b8e8" stroke-width="1"/>
  </svg>`,

  'contentWidthRatio.narrow-left': `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="4" width="6" height="24" rx="2" fill="#e8e8e8" stroke="#bbb" stroke-width="1"/>
    <rect x="10" y="4" width="20" height="24" rx="2" fill="#d5e3f7" stroke="#90b8e8" stroke-width="1"/>
  </svg>`,

  // shellLayout
  'shellLayout.stacked': `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="4" width="24" height="7" rx="2" fill="#e8e8e8" stroke="#bbb" stroke-width="1"/>
    <rect x="4" y="13" width="24" height="7" rx="2" fill="#e8e8e8" stroke="#bbb" stroke-width="1"/>
    <rect x="4" y="22" width="24" height="7" rx="2" fill="#e8e8e8" stroke="#bbb" stroke-width="1"/>
  </svg>`,

  'shellLayout.centered': `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="6" width="16" height="5" rx="1.5" fill="#e8e8e8" stroke="#bbb" stroke-width="1"/>
    <rect x="6" y="14" width="20" height="5" rx="1.5" fill="#e8e8e8" stroke="#bbb" stroke-width="1"/>
    <rect x="10" y="22" width="12" height="5" rx="1.5" fill="#e8e8e8" stroke="#bbb" stroke-width="1"/>
  </svg>`,

  'shellLayout.none': `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="4" width="24" height="24" rx="2" fill="#f5f5f5" stroke="#ddd" stroke-width="1" stroke-dasharray="3 2"/>
    <rect x="10" y="13" width="12" height="2" rx="1" fill="#ccc"/>
    <rect x="12" y="17" width="8" height="2" rx="1" fill="#ccc"/>
  </svg>`,

  // mediaPosition
  'mediaPosition.center': `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="28" height="28" rx="2" fill="#e8e8e8" stroke="#bbb" stroke-width="1"/>
    <rect x="6" y="10" width="20" height="12" rx="1.5" fill="#d5e3f7" stroke="#90b8e8" stroke-width="1"/>
  </svg>`,

  'mediaPosition.top': `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="28" height="28" rx="2" fill="#e8e8e8" stroke="#bbb" stroke-width="1"/>
    <rect x="6" y="4" width="20" height="12" rx="1.5" fill="#d5e3f7" stroke="#90b8e8" stroke-width="1"/>
  </svg>`,

  'mediaPosition.bottom': `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="28" height="28" rx="2" fill="#e8e8e8" stroke="#bbb" stroke-width="1"/>
    <rect x="6" y="16" width="20" height="12" rx="1.5" fill="#d5e3f7" stroke="#90b8e8" stroke-width="1"/>
  </svg>`,
}
