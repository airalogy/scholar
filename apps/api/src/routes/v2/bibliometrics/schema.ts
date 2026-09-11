import { Type, type Static } from 'typebox'
import { EditionInputSchema, RankingInputSchema } from '../../../bibliography/schema'

const NullableText = Type.Union([Type.String(), Type.Null()])
const NullableNumber = Type.Union([Type.Integer(), Type.Null()])
export const IdParams = Type.Object({ id: Type.String({ format: 'uuid' }) })
export const PageQuery = Type.Object({
  q: Type.Optional(Type.String({ maxLength: 500 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
})
export const EditionQuery = Type.Object({
  ...PageQuery.properties,
  system: Type.Optional(EditionInputSchema.properties.system),
  status: Type.Optional(Type.Union([Type.Literal('draft'), Type.Literal('published')])),
})
export const EditionView = Type.Object({
  id: Type.String(),
  system: Type.String(),
  version: Type.String(),
  revision: Type.Integer(),
  content_revision: Type.Integer(),
  metric_year: NullableNumber,
  released_on: NullableText,
  observed_on: NullableText,
  source: Type.String(),
  source_url: NullableText,
  status: Type.String(),
  createdAt: Type.String(),
  publishedAt: NullableText,
  ranking_count: Type.Integer(),
  indicator_count: Type.Integer(),
})
const JournalView = Type.Object({
  id: Type.String(),
  name: Type.String(),
  publisher: NullableText,
  identifiers: Type.Array(Type.Object({ scheme: Type.String(), value: Type.String() })),
})
export const RankingView = Type.Object({
  id: Type.String(),
  journalId: Type.String(),
  journal_name: Type.String(),
  category_level: Type.String(),
  category: Type.String(),
  metric: Type.String(),
  quartile: NullableNumber,
  is_top: Type.Union([Type.Boolean(), Type.Null()]),
  source: Type.String(),
})
export const IndicatorView = Type.Object({
  id: Type.String(),
  paperId: Type.String(),
  paper_title: Type.String(),
  kind: Type.String(),
  category: Type.String(),
  value: Type.Boolean(),
  source: Type.String(),
})
export const NoteBody = Type.Object(
  {
    expected_revision: Type.Integer({ minimum: 0 }),
    notes: Type.String({ minLength: 1, maxLength: 2000 }),
  },
  { additionalProperties: false },
)
export const CreateBody = Type.Object(
  { ...EditionInputSchema.properties, notes: NoteBody.properties.notes },
  { additionalProperties: false },
)
export const RankingBody = Type.Object(
  {
    ...NoteBody.properties,
    journal_id: Type.String({ format: 'uuid' }),
    category_level: RankingInputSchema.properties.category_level,
    category: RankingInputSchema.properties.category,
    metric: RankingInputSchema.properties.metric,
    quartile: Type.Optional(Type.Union([Type.Integer({ minimum: 1, maximum: 4 }), Type.Null()])),
    is_top: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
  },
  { additionalProperties: false },
)
export const IndicatorBody = Type.Object(
  {
    ...NoteBody.properties,
    paper_id: Type.String({ format: 'uuid' }),
    kind: Type.Union([Type.Literal('highly_cited'), Type.Literal('hot')]),
    category: Type.String({ maxLength: 255 }),
    value: Type.Boolean(),
  },
  { additionalProperties: false },
)
export const WithdrawBody = Type.Object(
  {
    ...NoteBody.properties,
    observation_id: Type.String({ format: 'uuid' }),
    observation_type: Type.Union([Type.Literal('ranking'), Type.Literal('indicator')]),
  },
  { additionalProperties: false },
)
const envelope = <T extends ReturnType<typeof Type.Object>>(
  data: T,
): ReturnType<typeof Type.Object> => Type.Object({ code: Type.Literal(0), data })
export const EditionResponse = envelope(EditionView)
export const EditionsResponse = envelope(
  Type.Object({ items: Type.Array(EditionView), total: Type.Integer() }),
)
export const JournalsResponse = envelope(
  Type.Object({ items: Type.Array(JournalView), total: Type.Integer() }),
)
export const DetailResponse = envelope(
  Type.Object({
    edition: EditionView,
    rankings: Type.Array(RankingView),
    indicators: Type.Array(IndicatorView),
    events: Type.Array(
      Type.Object({
        id: Type.String(),
        action: Type.String(),
        notes: Type.String(),
        actor_name: NullableText,
        created_at: Type.String(),
      }),
    ),
  }),
)
export type EditionOutput = Static<typeof EditionView>
export type CreateInput = Static<typeof CreateBody>
export type RankingInput = Static<typeof RankingBody>
export type IndicatorInput = Static<typeof IndicatorBody>
export type NoteInput = Static<typeof NoteBody>
export type WithdrawInput = Static<typeof WithdrawBody>
export type PageInput = Static<typeof PageQuery>
export type EditionFilter = Static<typeof EditionQuery>
