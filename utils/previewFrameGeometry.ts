export interface FixedPreviewFrameGeometry {
  scale: number
  sizerWidth: number
  sizerHeight: number
  iframeWidth: number
  iframeHeight: number
}

/**
 * Resolves the editor's fixed-width iframe geometry.
 *
 * A canvas has an authoritative height, so both axes participate in fit and
 * the iframe keeps its exact export dimensions. Tablet/mobile previews have
 * no fixed height and retain the existing scrollable-height behaviour.
 */
export function resolveFixedPreviewFrame(
  width: number,
  fixedHeight: number | null,
  availableWidth: number,
  availableHeight: number,
): FixedPreviewFrameGeometry {
  const widthScale = availableWidth > 0 ? availableWidth / width : 1
  const heightScale = fixedHeight && availableHeight > 0 ? availableHeight / fixedHeight : 1
  const scale = Math.min(1, widthScale, heightScale)
  const iframeHeight = fixedHeight ?? (scale > 0 ? availableHeight / scale : 0)

  return {
    scale,
    sizerWidth: width * scale,
    sizerHeight: fixedHeight ? fixedHeight * scale : availableHeight,
    iframeWidth: width,
    iframeHeight,
  }
}
