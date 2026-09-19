<template>
  <div v-if="known" class="tpl-sketch" aria-hidden="true">
    <!-- Editorial Article — Text First: centered narrow column, wide lead image, gallery below -->
    <svg v-if="templateId === 'article-editorial'" viewBox="0 0 160 100">
      <rect x="66" y="8" width="28" height="3" rx="1.5" class="s-faint" />
      <rect x="46" y="15" width="68" height="6" rx="2" class="s-strong" />
      <rect x="54" y="25" width="52" height="3" rx="1.5" class="s-mid" />
      <rect x="30" y="33" width="100" height="26" rx="2" class="s-img" />
      <rect x="46" y="64" width="68" height="2.5" rx="1.2" class="s-mid" />
      <rect x="46" y="69" width="68" height="2.5" rx="1.2" class="s-mid" />
      <rect x="46" y="74" width="48" height="2.5" rx="1.2" class="s-mid" />
      <rect x="30" y="82" width="31" height="12" rx="2" class="s-img" />
      <rect x="64.5" y="82" width="31" height="12" rx="2" class="s-img" />
      <rect x="99" y="82" width="31" height="12" rx="2" class="s-img" />
    </svg>

    <!-- Editorial Gallery — Sticky Info: gallery column + sticky info card, related strip -->
    <svg v-else-if="templateId === 'article-gallery-sticky'" viewBox="0 0 160 100">
      <rect x="8" y="8" width="92" height="30" rx="2" class="s-img" />
      <rect x="8" y="42" width="92" height="22" rx="2" class="s-img" />
      <rect x="8" y="68" width="92" height="10" rx="2" class="s-img" />
      <rect x="106" y="8" width="46" height="46" rx="2" class="s-card" />
      <rect x="111" y="14" width="30" height="5" rx="2" class="s-strong" />
      <rect x="111" y="23" width="36" height="2.5" rx="1.2" class="s-mid" />
      <rect x="111" y="28" width="36" height="2.5" rx="1.2" class="s-mid" />
      <rect x="111" y="33" width="24" height="2.5" rx="1.2" class="s-mid" />
      <rect x="111" y="40" width="18" height="2.5" rx="1.2" class="s-faint" />
      <rect x="111" y="45" width="26" height="2.5" rx="1.2" class="s-faint" />
      <rect x="8" y="84" width="34" height="10" rx="2" class="s-img" />
      <rect x="46" y="84" width="34" height="10" rx="2" class="s-img" />
      <rect x="84" y="84" width="34" height="10" rx="2" class="s-img" />
      <rect x="122" y="84" width="30" height="10" rx="2" class="s-img" />
    </svg>

    <!-- Cover Story: full-screen image with overlaid title, text column below -->
    <svg v-else-if="templateId === 'article-cover-story'" viewBox="0 0 160 100">
      <rect x="0" y="0" width="160" height="66" class="s-img" />
      <rect x="0" y="40" width="160" height="26" class="s-scrim" />
      <rect x="10" y="46" width="70" height="7" rx="2" class="s-strong" />
      <rect x="10" y="57" width="48" height="3" rx="1.5" class="s-mid" />
      <rect x="46" y="74" width="68" height="2.5" rx="1.2" class="s-mid" />
      <rect x="46" y="79" width="68" height="2.5" rx="1.2" class="s-mid" />
      <rect x="46" y="84" width="68" height="2.5" rx="1.2" class="s-mid" />
      <rect x="46" y="89" width="44" height="2.5" rx="1.2" class="s-mid" />
    </svg>

    <!-- Split Panorama: pinned image half, scrolling text half -->
    <svg v-else-if="templateId === 'article-split-panorama'" viewBox="0 0 160 100">
      <rect x="0" y="0" width="78" height="100" class="s-img" />
      <rect x="88" y="12" width="18" height="2.5" rx="1.2" class="s-faint" />
      <rect x="88" y="18" width="58" height="6" rx="2" class="s-strong" />
      <rect x="88" y="28" width="40" height="2.5" rx="1.2" class="s-faint" />
      <rect x="88" y="38" width="60" height="2.5" rx="1.2" class="s-mid" />
      <rect x="88" y="43" width="60" height="2.5" rx="1.2" class="s-mid" />
      <rect x="88" y="48" width="60" height="2.5" rx="1.2" class="s-mid" />
      <rect x="88" y="53" width="60" height="2.5" rx="1.2" class="s-mid" />
      <rect x="88" y="58" width="60" height="2.5" rx="1.2" class="s-mid" />
      <rect x="88" y="63" width="60" height="2.5" rx="1.2" class="s-mid" />
      <rect x="88" y="68" width="60" height="2.5" rx="1.2" class="s-mid" />
      <rect x="88" y="73" width="60" height="2.5" rx="1.2" class="s-mid" />
      <rect x="88" y="78" width="60" height="2.5" rx="1.2" class="s-mid" />
      <rect x="88" y="83" width="38" height="2.5" rx="1.2" class="s-mid" />
    </svg>

    <!-- Plain Typographic: oversized title, hairline, columned text, no images -->
    <svg v-else-if="templateId === 'article-plain-typographic'" viewBox="0 0 160 100">
      <rect x="12" y="12" width="120" height="12" rx="2" class="s-strong" />
      <rect x="12" y="28" width="86" height="3" rx="1.5" class="s-mid" />
      <rect x="12" y="36" width="30" height="2.2" rx="1.1" class="s-faint" />
      <rect x="12" y="42" width="136" height="0.8" class="s-mid" />
      <rect x="12" y="50" width="64" height="2.5" rx="1.2" class="s-mid" />
      <rect x="12" y="55" width="64" height="2.5" rx="1.2" class="s-mid" />
      <rect x="12" y="60" width="64" height="2.5" rx="1.2" class="s-mid" />
      <rect x="12" y="65" width="64" height="2.5" rx="1.2" class="s-mid" />
      <rect x="12" y="70" width="64" height="2.5" rx="1.2" class="s-mid" />
      <rect x="12" y="75" width="64" height="2.5" rx="1.2" class="s-mid" />
      <rect x="12" y="80" width="44" height="2.5" rx="1.2" class="s-mid" />
      <rect x="84" y="50" width="64" height="2.5" rx="1.2" class="s-mid" />
      <rect x="84" y="55" width="64" height="2.5" rx="1.2" class="s-mid" />
      <rect x="84" y="60" width="64" height="2.5" rx="1.2" class="s-mid" />
      <rect x="84" y="65" width="64" height="2.5" rx="1.2" class="s-mid" />
      <rect x="84" y="70" width="64" height="2.5" rx="1.2" class="s-mid" />
      <rect x="84" y="75" width="64" height="2.5" rx="1.2" class="s-mid" />
      <rect x="84" y="80" width="30" height="2.5" rx="1.2" class="s-mid" />
    </svg>

    <!-- Editorial — Blog Grid: hero band, lead feature, card grid -->
    <svg v-else-if="templateId === 'blog-index-editorial-grid'" viewBox="0 0 160 100">
      <rect x="8" y="8" width="144" height="18" rx="2" class="s-img" />
      <rect x="8" y="31" width="94" height="26" rx="2" class="s-card" />
      <rect x="12" y="36" width="40" height="16" rx="2" class="s-img" />
      <rect x="56" y="38" width="40" height="4" rx="2" class="s-strong" />
      <rect x="56" y="46" width="42" height="2.5" rx="1.2" class="s-mid" />
      <rect x="106" y="31" width="46" height="26" rx="2" class="s-card" />
      <rect x="8" y="62" width="44" height="32" rx="2" class="s-card" />
      <rect x="58" y="62" width="44" height="32" rx="2" class="s-card" />
      <rect x="108" y="62" width="44" height="32" rx="2" class="s-card" />
    </svg>
    <!-- Chronicle: oversized title, hairline, year-grouped list rows -->
    <svg v-else-if="templateId === 'blog-index-chronicle-list'" viewBox="0 0 160 100">
      <rect x="12" y="10" width="104" height="11" rx="2" class="s-strong" />
      <rect x="12" y="26" width="70" height="2.5" rx="1.2" class="s-mid" />
      <rect x="12" y="34" width="136" height="0.8" class="s-mid" />
      <rect x="12" y="42" width="16" height="6" rx="1.5" class="s-strong" />
      <rect x="36" y="43" width="80" height="2.5" rx="1.2" class="s-mid" />
      <rect x="128" y="43" width="20" height="2.5" rx="1.2" class="s-faint" />
      <rect x="36" y="50" width="68" height="2.5" rx="1.2" class="s-mid" />
      <rect x="128" y="50" width="20" height="2.5" rx="1.2" class="s-faint" />
      <rect x="36" y="57" width="74" height="2.5" rx="1.2" class="s-mid" />
      <rect x="128" y="57" width="20" height="2.5" rx="1.2" class="s-faint" />
      <rect x="12" y="68" width="16" height="6" rx="1.5" class="s-strong" />
      <rect x="36" y="69" width="76" height="2.5" rx="1.2" class="s-mid" />
      <rect x="128" y="69" width="20" height="2.5" rx="1.2" class="s-faint" />
      <rect x="36" y="76" width="64" height="2.5" rx="1.2" class="s-mid" />
      <rect x="128" y="76" width="20" height="2.5" rx="1.2" class="s-faint" />
      <rect x="36" y="83" width="72" height="2.5" rx="1.2" class="s-mid" />
      <rect x="128" y="83" width="20" height="2.5" rx="1.2" class="s-faint" />
    </svg>

    <!-- Mosaic: compact header, dense square tile grid -->
    <svg v-else-if="templateId === 'blog-index-mosaic'" viewBox="0 0 160 100">
      <rect x="8" y="8" width="44" height="5" rx="2" class="s-strong" />
      <rect x="58" y="9.5" width="56" height="2.5" rx="1.2" class="s-faint" />
      <rect x="8" y="20" width="34" height="34" rx="1.5" class="s-img" />
      <rect x="46" y="20" width="34" height="34" rx="1.5" class="s-img" />
      <rect x="84" y="20" width="34" height="34" rx="1.5" class="s-img" />
      <rect x="122" y="20" width="30" height="34" rx="1.5" class="s-img" />
      <rect x="8" y="58" width="34" height="34" rx="1.5" class="s-img" />
      <rect x="46" y="58" width="34" height="34" rx="1.5" class="s-img" />
      <rect x="84" y="58" width="34" height="34" rx="1.5" class="s-img" />
      <rect x="122" y="58" width="30" height="34" rx="1.5" class="s-img" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const KNOWN = [
  'article-editorial',
  'article-gallery-sticky',
  'article-cover-story',
  'article-split-panorama',
  'article-plain-typographic',
  'blog-index-editorial-grid',
  'blog-index-chronicle-list',
  'blog-index-mosaic',
]

const props = defineProps<{ templateId: string }>()

const known = computed(() => KNOWN.includes(props.templateId))
</script>

<style scoped>
.tpl-sketch {
  aspect-ratio: 16 / 10;
  background: var(--cms-surface-sunken);
  border-radius: 0.3rem;
  overflow: hidden;
}
.tpl-sketch svg {
  width: 100%;
  height: 100%;
  display: block;
}
.s-strong { fill: var(--cms-ink-subtle); }
.s-mid { fill: var(--cms-line); }
.s-faint { fill: var(--cms-line); opacity: 0.6; }
.s-img { fill: var(--cms-line); opacity: 0.85; }
.s-card {
  fill: var(--cms-surface);
  stroke: var(--cms-line);
  stroke-width: 1;
}
.s-scrim { fill: var(--cms-ink-subtle); opacity: 0.25; }
</style>
