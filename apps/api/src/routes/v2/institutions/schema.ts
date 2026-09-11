import { Type, type Static } from 'typebox'
import { PaperMetadataInputSchema } from '../../../bibliography/schema'

export const SlugParams = Type.Object({ slug: Type.String({ minLength: 1, maxLength: 200 }) })
export const ImportParams = Type.Object({
  ...SlugParams.properties,
  importId: Type.String({ format: 'uuid' }),
})
export const ItemParams = Type.Object({
  ...ImportParams.properties,
  itemId: Type.String({ format: 'uuid' }),
})
export const ImportHeaders = Type.Object({
  'idempotency-key': Type.String({ minLength: 8, maxLength: 128 }),
})
export const PreviewBody = Type.Object(
  {
    schema_version: Type.Literal(2),
    source: Type.String({ minLength: 1, maxLength: 255 }),
    items: Type.Array(
      Type.Object(
        {
          source_row: Type.Optional(Type.Integer({ minimum: 1, maximum: 10000000 })),
          paper: PaperMetadataInputSchema,
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 500 },
    ),
  },
  { additionalProperties: false },
)
export const ApplyBody = Type.Object(
  {
    item_ids: Type.Optional(
      Type.Array(Type.String({ format: 'uuid' }), {
        minItems: 1,
        maxItems: 500,
        uniqueItems: true,
      }),
    ),
    acknowledge_warnings: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
)
export const ReviewBody = Type.Object(
  {
    ...ApplyBody.properties,
    decision: Type.Union([Type.Literal('approve'), Type.Literal('reject')]),
    notes: Type.String({ minLength: 1, maxLength: 2000 }),
  },
  { additionalProperties: false },
)
export const ListQuery = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
})
const NullableString = Type.Union([Type.String(), Type.Null()])
const Issue = Type.Object({
  code: Type.String(),
  severity: Type.String(),
  field: Type.String(),
  message: Type.String(),
})
export const ImportItem = Type.Object({
  id: Type.String(),
  index: Type.Integer(),
  source_row: Type.Union([Type.Integer(), Type.Null()]),
  title: Type.String(),
  action: Type.String(),
  status: Type.String(),
  paper_id: NullableString,
  target_id: NullableString,
  message: NullableString,
  decision: NullableString,
  issues: Type.Array(Issue),
})
export const ImportSummary = Type.Object({
  id: Type.String(),
  schema_version: Type.Literal(2),
  source: Type.String(),
  status: Type.String(),
  institution_id: Type.String(),
  created_at: Type.String(),
  updated_at: Type.String(),
  summary: Type.Object({
    total: Type.Integer(),
    ready: Type.Integer(),
    pending_review: Type.Integer(),
    completed: Type.Integer(),
    errors: Type.Integer(),
    rejected: Type.Integer(),
  }),
})
export const ImportData = Type.Object({
  ...ImportSummary.properties,
  items: Type.Array(ImportItem),
})
export const ImportResponse = Type.Object({ code: Type.Literal(0), data: ImportData })
export const ListResponse = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({ items: Type.Array(ImportSummary), total: Type.Integer() }),
})
export const ItemResponse = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({
    ...ImportItem.properties,
    paper: PaperMetadataInputSchema,
    changes: Type.Array(
      Type.Object({ field: Type.String(), before: Type.Unknown(), after: Type.Unknown() }),
    ),
    claim_review_status: NullableString,
    decisions: Type.Array(
      Type.Object({
        id: Type.String(),
        decision: Type.String(),
        notes: NullableString,
        actor_type: Type.String(),
        actor_name: NullableString,
        created_at: Type.String(),
      }),
    ),
  }),
})

export type PreviewInput = Static<typeof PreviewBody>
export type ApplyInput = Static<typeof ApplyBody>
export type ReviewInput = Static<typeof ReviewBody>
export type ImportView = Static<typeof ImportData>
export type ImportSummaryView = Static<typeof ImportSummary>
export type ImportItemView = Static<typeof ImportItem>
