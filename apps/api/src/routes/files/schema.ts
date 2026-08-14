import { Type, type Static } from 'typebox'

export const UploadFileSchema = Type.Object({
  file: Type.String({ format: 'binary' }),
})

export type UploadFileBody = Static<typeof UploadFileSchema>

export const OssUploadResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  oss_key: Type.String(),
  signatureUrl: Type.String(),
  original_name: Type.String(),
  file_size: Type.Integer(),
  mime_type: Type.String(),
  ext: Type.String(),
  hash: Type.String(),
  createdAt: Type.String(),
})

export type OssUploadResponse = Static<typeof OssUploadResponseSchema>

export const OssPreviewParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

export type OssPreviewParams = Static<typeof OssPreviewParamsSchema>

export const OssPreviewResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  oss_key: Type.String(),
  signatureUrl: Type.String(),
})

export type OssPreviewResponse = Static<typeof OssPreviewResponseSchema>

export const FileAccessParamsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

export type FileAccessParams = Static<typeof FileAccessParamsSchema>

export const FileAccessQuerySchema = Type.Object({
  token: Type.String({ minLength: 1 }),
})

export type FileAccessQuery = Static<typeof FileAccessQuerySchema>
