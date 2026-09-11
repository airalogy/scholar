import { Type, type Static } from 'typebox'
import { CustomFieldValueSchema } from '../../../bibliography/schema'

const Text = Type.String()
const NullableText = Type.Union([Text, Type.Null()])
const NullableNumber = Type.Union([Type.Integer(), Type.Null()])
const NullableBoolean = Type.Union([Type.Boolean(), Type.Null()])
const Identifier = Type.Object({ scheme: Text, value: Text })
export const PaperParams = Type.Object({ id: Type.String({ format: 'uuid' }) })
export const EditionParams = Type.Object({
  ...PaperParams.properties,
  editionId: Type.String({ format: 'uuid' }),
})
export const PageQuery = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
})
export const BibliographyView = Type.Object({
  paper_id: Text,
  titles: Type.Array(
    Type.Object({
      language: Text,
      kind: Text,
      title: Text,
      is_primary: Type.Boolean(),
    }),
  ),
  language_tags: Type.Array(Text),
  document_type: NullableText,
  publication_status: NullableText,
  identifiers: Type.Array(Identifier),
  authors: Type.Array(
    Type.Object({
      id: Type.Integer(),
      author_id: Text,
      name: Text,
      order: Type.Integer(),
      order_verified: Type.Boolean(),
      corresponding: NullableBoolean,
      equal_contribution: NullableBoolean,
      contributor_type: Text,
      orcid: NullableText,
      affiliation_ids: Type.Array(Text),
    }),
  ),
  affiliations: Type.Array(
    Type.Object({
      id: Text,
      raw_name: Text,
      organization_name: NullableText,
      department: NullableText,
      country_code: NullableText,
      ror_id: NullableText,
    }),
  ),
  funding: Type.Array(
    Type.Object({
      id: Text,
      funder_name: NullableText,
      funder_identifier: NullableText,
      award_number: NullableText,
      raw_text: Text,
    }),
  ),
  sources: Type.Array(
    Type.Object({ provider: Text, external_id: NullableText, collected_on: NullableText }),
  ),
  journal: Type.Union([
    Type.Object({ id: Text, name: Text, identifiers: Type.Array(Identifier) }),
    Type.Null(),
  ]),
  institution: Type.Object({
    owning_units: Type.Array(Text),
    secondary_units: Type.Array(Text),
    signature_type: NullableText,
    reported_affiliation_count: NullableNumber,
    cooperation_types: Type.Array(Text),
    cooperation_description: NullableText,
    custom_fields: Type.Array(
      Type.Object({
        key: Text,
        label: Text,
        label_en: NullableText,
        field_type: Text,
        value: CustomFieldValueSchema,
      }),
    ),
  }),
})
export const PublishedEditionView = Type.Object({
  id: Text,
  system: Text,
  version: Text,
  revision: Type.Integer(),
  metric_year: NullableNumber,
  source: Text,
  source_url: NullableText,
  released_on: NullableText,
  observed_on: NullableText,
})
export const MetricsView = Type.Object({
  edition: PublishedEditionView,
  rankings: Type.Array(
    Type.Object({
      id: Text,
      category_level: Text,
      category: Text,
      metric: Text,
      quartile: NullableNumber,
      is_top: NullableBoolean,
    }),
  ),
  indicators: Type.Array(
    Type.Object({ id: Text, kind: Text, category: Text, value: Type.Boolean() }),
  ),
  ranking_total: Type.Integer(),
  indicator_total: Type.Integer(),
})
export const BibliographyResponse = Type.Object({ code: Type.Literal(0), data: BibliographyView })
export const EditionsResponse = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({ items: Type.Array(PublishedEditionView), total: Type.Integer() }),
})
export const MetricsResponse = Type.Object({ code: Type.Literal(0), data: MetricsView })
export type BibliographyOutput = Static<typeof BibliographyView>
export type PublishedEdition = Static<typeof PublishedEditionView>
export type MetricsOutput = Static<typeof MetricsView>
export type PageInput = Static<typeof PageQuery>
