import { Type, type Static } from 'typebox'
import { PaperMetadataInputSchema } from '../bibliography/schema'

const Uuid = Type.String({ format: 'uuid' })
export const ReviewChangeSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal('metadata'),
      title: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
      abstract: Type.Optional(Type.Union([Type.String({ maxLength: 100000 }), Type.Null()])),
      keywords: Type.Optional(
        Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { maxItems: 50 }),
      ),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal('attribution'),
      authorId: Uuid,
      personId: Uuid,
      action: Type.Union([Type.Literal('bind'), Type.Literal('unbind')]),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    { kind: Type.Literal('access'), restricted: Type.Boolean() },
    { additionalProperties: false },
  ),
  Type.Object(
    { kind: Type.Literal('institutional_withdrawal'), withdrawn: Type.Boolean() },
    { additionalProperties: false },
  ),
])
export type ReviewChange = Static<typeof ReviewChangeSchema>
// Full bibliographic proposals originate only from the authorized import service.
// They share rounds, human decisions and the atomic execution queue.
export const ApprovedReviewChangeSchema = Type.Union([
  ReviewChangeSchema,
  Type.Object(
    {
      kind: Type.Literal('bibliography'),
      metadata: PaperMetadataInputSchema,
      expectedFingerprint: Type.String(),
    },
    { additionalProperties: false },
  ),
])
export type ApprovedReviewChange = Static<typeof ApprovedReviewChangeSchema>
export const CreateReviewChangeSchema = Type.Object(
  {
    subjectType: Type.Union([Type.Literal('paper'), Type.Literal('degree_thesis')]),
    subjectId: Uuid,
    change: ReviewChangeSchema,
    notes: Type.String({ minLength: 1, maxLength: 2000 }),
  },
  { additionalProperties: false },
)
