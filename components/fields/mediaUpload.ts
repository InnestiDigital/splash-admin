import { isRef, type InjectionKey, type Ref } from 'vue'
import type {
  EditorChangeScope,
  EditorChangeSurface,
} from '~/admin/stores/editorChangeStore'
import type { MediaRecord } from '~/server/storage/types'

/**
 * Optional identity used to include a field upload in the editor save guard.
 *
 * The owner chooses the immutable target key and scope. This keeps generic
 * media fields reusable across page, site, and block authoring surfaces.
 */
export interface MediaUploadOperation {
  readonly key: string
  readonly surface: EditorChangeSurface
  readonly scope: EditorChangeScope
  readonly label?: string
}

export type MediaUploadOperationResolver = (
  field: Readonly<Record<string, unknown>>,
) => MediaUploadOperation | undefined

/**
 * A form owner can provide one operation (or a reactive/resolved operation)
 * for descendant image fields instead of threading it through every schema
 * renderer. TImagePicker adds its own instance identity to the returned base
 * key, so repeated and nested fields never share an upload lane.
 */
export type MediaUploadOperationSource =
  | MediaUploadOperation
  | Ref<MediaUploadOperation | undefined>
  | MediaUploadOperationResolver

export const MEDIA_UPLOAD_OPERATION_KEY: InjectionKey<MediaUploadOperationSource> =
  Symbol('media-upload-operation')

export function resolveMediaUploadOperation(
  source: MediaUploadOperationSource | undefined,
  field: Readonly<Record<string, unknown>>,
): MediaUploadOperation | undefined {
  if (!source) return undefined
  if (isRef(source)) return source.value
  if (typeof source === 'function') return source(field)
  return source
}

export type MediaUploadCommit = (media: MediaRecord) => void

/** An owner-managed modal upload that decides when selection is committed. */
export type MediaUploadHandler = (
  file: File,
  commit: MediaUploadCommit,
) => Promise<void>
