import { Type, type Static } from 'typebox'

const Text = (maxLength = 500): ReturnType<typeof Type.String> =>
  Type.String({ minLength: 1, maxLength })
const OptionalText = (
  maxLength = 500,
): ReturnType<typeof Type.Optional<ReturnType<typeof Type.String>>> =>
  Type.Optional(Text(maxLength))
const Source = OptionalText(255)

export const TitleInputSchema = Type.Object(
  {
    language: Text(64),
    title: Text(500),
    kind: Type.Optional(
      Type.Union([
        Type.Literal('original'),
        Type.Literal('translated'),
        Type.Literal('machine_translated'),
      ]),
    ),
    is_primary: Type.Optional(Type.Boolean()),
    source: Source,
  },
  { additionalProperties: false },
)

export const IdentifierInputSchema = Type.Object(
  {
    scheme: Text(64),
    value: Text(500),
  },
  { additionalProperties: false },
)

export const AuthorshipInputSchema = Type.Object(
  {
    source_key: OptionalText(200),
    author_id: Type.Optional(Type.String({ format: 'uuid' })),
    name: Text(500),
    order: Type.Integer({ minimum: 1, maximum: 30000 }),
    corresponding: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
    equal_contribution: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
    contributor_type: Type.Optional(Type.Union([Type.Literal('person'), Type.Literal('group')])),
    orcid: OptionalText(64),
    affiliation_keys: Type.Optional(Type.Array(Text(200), { maxItems: 100 })),
  },
  { additionalProperties: false },
)

export const AffiliationInputSchema = Type.Object(
  {
    source_key: Text(200),
    raw_name: Text(10000),
    organization_name: OptionalText(),
    department: OptionalText(),
    country_code: Type.Optional(Type.String({ pattern: '^[A-Z]{2}$' })),
    ror_id: OptionalText(100),
  },
  { additionalProperties: false },
)

export const JournalInputSchema = Type.Object(
  {
    id: Type.Optional(Type.String({ format: 'uuid' })),
    name: Text(500),
    identifiers: Type.Optional(Type.Array(IdentifierInputSchema, { maxItems: 10 })),
  },
  { additionalProperties: false },
)

export const EditionInputSchema = Type.Object(
  {
    system: Type.Union([
      Type.Literal('jcr'),
      Type.Literal('cas'),
      Type.Literal('esi'),
      Type.Literal('institution'),
    ]),
    version: Text(100),
    revision: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
    metric_year: Type.Optional(Type.Integer({ minimum: 1900, maximum: 9999 })),
    released_on: Type.Optional(Type.String({ format: 'date' })),
    observed_on: Type.Optional(Type.String({ format: 'date' })),
    source: Text(255),
    source_url: OptionalText(2000),
  },
  { additionalProperties: false },
)

export const RankingInputSchema = Type.Object(
  {
    edition: EditionInputSchema,
    category_level: Type.Union([
      Type.Literal('category'),
      Type.Literal('broad'),
      Type.Literal('narrow'),
    ]),
    category: Text(500),
    metric: Type.Union([
      Type.Literal('jif'),
      Type.Literal('jci'),
      Type.Literal('cas'),
      Type.Literal('institution'),
    ]),
    quartile: Type.Optional(Type.Integer({ minimum: 1, maximum: 4 })),
    is_top: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
)

export const IndicatorInputSchema = Type.Object(
  {
    edition: EditionInputSchema,
    kind: Type.Union([Type.Literal('highly_cited'), Type.Literal('hot')]),
    category: OptionalText(255),
    value: Type.Boolean(),
  },
  { additionalProperties: false },
)

export const CustomFieldValueSchema = Type.Union([
  Type.Null(),
  Type.String({ maxLength: 10000 }),
  Type.Number(),
  Type.Boolean(),
  Type.Array(Type.String({ maxLength: 500 }), { maxItems: 100 }),
])

export const CustomFieldDefinitionInputSchema = Type.Object(
  {
    key: Type.String({ pattern: '^[a-z][a-z0-9_]{0,99}$' }),
    label: Text(200),
    label_en: Type.Optional(Type.Union([Text(200), Type.Null()])),
    field_type: Type.Union([
      Type.Literal('text'),
      Type.Literal('number'),
      Type.Literal('boolean'),
      Type.Literal('date'),
      Type.Literal('single_select'),
      Type.Literal('multi_select'),
    ]),
    options: Type.Optional(Type.Array(Text(500), { maxItems: 100, uniqueItems: true })),
    is_required: Type.Optional(Type.Boolean()),
    min_value: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
    max_value: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
    max_length: Type.Optional(Type.Integer({ minimum: 1, maximum: 10000 })),
    min_date: Type.Optional(Type.Union([Type.String({ format: 'date' }), Type.Null()])),
    max_date: Type.Optional(Type.Union([Type.String({ format: 'date' }), Type.Null()])),
    visibility: Type.Optional(
      Type.Union([Type.Literal('admin'), Type.Literal('institution'), Type.Literal('public')]),
    ),
    is_active: Type.Optional(Type.Boolean()),
    display_order: Type.Optional(Type.Integer({ minimum: 0, maximum: 10000 })),
  },
  { additionalProperties: false },
)

export const InstitutionMetadataInputSchema = Type.Object(
  {
    owning_units: Type.Optional(Type.Array(Text(500), { maxItems: 100 })),
    secondary_units: Type.Optional(Type.Array(Text(500), { maxItems: 100 })),
    signature_type: OptionalText(100),
    reported_affiliation_count: Type.Optional(Type.Integer({ minimum: 0, maximum: 10000 })),
    source_author_order: OptionalText(2000),
    cooperation_types: Type.Optional(Type.Array(Text(100), { maxItems: 100 })),
    cooperation_description: OptionalText(50000),
    custom_fields: Type.Optional(
      Type.Record(Type.String(), CustomFieldValueSchema, { maxProperties: 100 }),
    ),
  },
  { additionalProperties: false },
)

export const PaperMetadataInputSchema = Type.Object(
  {
    paper_id: Type.Optional(Type.String({ format: 'uuid' })),
    title: OptionalText(500),
    titles: Type.Optional(Type.Array(TitleInputSchema, { minItems: 1, maxItems: 50 })),
    doi: OptionalText(200),
    identifiers: Type.Optional(Type.Array(IdentifierInputSchema, { maxItems: 50 })),
    publish_year: Type.Optional(Type.Integer({ minimum: 1000, maximum: 9999 })),
    publish_date: Type.Optional(Type.String({ format: 'date' })),
    paper_type: Type.Optional(Type.Integer()),
    document_type: Type.Optional(
      Type.Union([
        Type.Literal('article'),
        Type.Literal('review'),
        Type.Literal('letter'),
        Type.Literal('editorial'),
        Type.Literal('correction'),
        Type.Literal('news'),
        Type.Literal('note'),
        Type.Literal('conference_paper'),
        Type.Literal('meeting_abstract'),
        Type.Literal('thesis'),
        Type.Literal('report'),
        Type.Literal('other'),
      ]),
    ),
    publication_status: Type.Optional(
      Type.Union([Type.Literal('early_access'), Type.Literal('published')]),
    ),
    language: Type.Optional(Type.Integer()),
    language_tags: Type.Optional(Type.Array(Text(64), { maxItems: 20 })),
    abstract: Type.Optional(Type.String({ maxLength: 200000 })),
    journal_name: OptionalText(500),
    journal: Type.Optional(JournalInputSchema),
    citation_count: Type.Optional(Type.Integer({ minimum: 0 })),
    pages: OptionalText(50),
    link: OptionalText(255),
    keywords: Type.Optional(Type.Array(Text(100), { maxItems: 100 })),
    authors: Type.Optional(Type.Array(AuthorshipInputSchema, { maxItems: 5000 })),
    affiliations: Type.Optional(Type.Array(AffiliationInputSchema, { maxItems: 2000 })),
    funding: Type.Optional(
      Type.Array(
        Type.Object(
          {
            source_key: OptionalText(200),
            funder_name: OptionalText(2000),
            funder_identifier: OptionalText(255),
            award_number: OptionalText(255),
            raw_text: Text(10000),
          },
          { additionalProperties: false },
        ),
        { maxItems: 500 },
      ),
    ),
    sources: Type.Optional(
      Type.Array(
        Type.Object(
          {
            provider: Text(64),
            external_id: OptionalText(500),
            collected_on: Type.Optional(Type.String({ format: 'date' })),
          },
          { additionalProperties: false },
        ),
        { maxItems: 50 },
      ),
    ),
    institution_metadata: Type.Optional(InstitutionMetadataInputSchema),
    rankings: Type.Optional(Type.Array(RankingInputSchema, { maxItems: 200 })),
    indicators: Type.Optional(Type.Array(IndicatorInputSchema, { maxItems: 100 })),
  },
  { additionalProperties: false },
)

export type PaperMetadataInput = Static<typeof PaperMetadataInputSchema>
export type CustomFieldDefinitionInput = Static<typeof CustomFieldDefinitionInputSchema>
export type CustomFieldValue = Static<typeof CustomFieldValueSchema>
export type IdentifierInput = Static<typeof IdentifierInputSchema>
export type TitleInput = Static<typeof TitleInputSchema>
export type AuthorshipInput = Static<typeof AuthorshipInputSchema>
export type EditionInput = Static<typeof EditionInputSchema>
export type RankingInput = Static<typeof RankingInputSchema>
