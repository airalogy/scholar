import { Type, type TString } from 'typebox'

const Uuid = Type.String({ format: 'uuid' })
const Text = (maxLength: number): TString =>
  Type.String({ minLength: 1, maxLength, pattern: '\\S' })
const NullableText = Type.Union([Type.String(), Type.Null()])
export const IdentityProofBody = Type.Object(
  { proofToken: Type.String({ minLength: 43, maxLength: 43 }) },
  { additionalProperties: false },
)
export const SubmitIdentityRequestBody = Type.Object(
  {
    ...IdentityProofBody.properties,
    previousInternalId: Text(100),
    explanation: Text(2000),
    confirmsOwnAccount: Type.Literal(true),
  },
  { additionalProperties: false },
)
export const IdentityConflictResponse = Type.Object({
  code: Type.Literal(409),
  message: Type.String(),
  data: Type.Optional(
    Type.Object({
      reason: Type.Literal('institution_identity_conflict'),
      proofToken: Type.String(),
      expiresAt: Type.String(),
    }),
  ),
})
export const RequestStatus = Type.Union([
  Type.Literal('pending'),
  Type.Literal('needs_information'),
  Type.Literal('approved'),
  Type.Literal('rejected'),
])
export const ApplicantRequestSchema = Type.Object({
  id: Uuid,
  status: RequestStatus,
  previousInternalId: Type.String(),
  explanation: Type.String(),
  applicantMessage: NullableText,
  createdAt: Type.String(),
  updatedAt: Type.String(),
})
export const ApplicantResponse = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({
    internalId: Type.String(),
    request: Type.Union([ApplicantRequestSchema, Type.Null()]),
  }),
})
export const IdentityInstitutionParams = Type.Object({ slug: Text(200) })
export const IdentityPersonParams = Type.Object({
  ...IdentityInstitutionParams.properties,
  personId: Uuid,
})
export const IdentityIdentifierParams = Type.Object({
  ...IdentityPersonParams.properties,
  identifierId: Uuid,
})
export const IdentityRequestParams = Type.Object({
  ...IdentityInstitutionParams.properties,
  requestId: Uuid,
})
export const IdentityPeopleQuery = Type.Object({
  search: Type.Optional(Type.String({ maxLength: 100 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 100000 })),
})
export const IdentityRequestsQuery = Type.Object({
  status: Type.Optional(RequestStatus),
  offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 100000 })),
})
export const IdentityNoteBody = Type.Object({ notes: Text(2000) }, { additionalProperties: false })
export const IdentityIdentifierBody = Type.Object(
  { value: Text(100), notes: Text(2000) },
  { additionalProperties: false },
)
export const IdentityDecisionBody = Type.Object(
  {
    action: Type.Union([
      Type.Literal('approve'),
      Type.Literal('reject'),
      Type.Literal('request_information'),
    ]),
    personId: Type.Optional(Uuid),
    notes: Text(2000),
    applicantMessage: Type.Optional(Text(1000)),
  },
  { additionalProperties: false },
)
const Person = Type.Object({
  id: Uuid,
  name: Type.String(),
  internalId: Type.String(),
  email: NullableText,
  userId: NullableText,
  is_active: Type.Boolean(),
})
const Identifier = Type.Object({
  id: Uuid,
  value: Type.String(),
  isPrimary: Type.Boolean(),
  source: Type.String(),
  version: Type.Integer(),
  revokedAt: NullableText,
  createdAt: Type.String(),
})
const Event = Type.Object({
  id: Uuid,
  action: Type.String(),
  notes: Type.String(),
  actorUserId: NullableText,
  createdAt: Type.String(),
})
export const AdminRequestSchema = Type.Object({
  ...ApplicantRequestSchema.properties,
  internalId: Type.String(),
  name: Type.String(),
  email: Type.String(),
  personId: NullableText,
  reviewedAt: NullableText,
})
export const IdentityPeopleResponse = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({ items: Type.Array(Person), total: Type.Integer() }),
})
export const IdentityPersonResponse = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({
    person: Person,
    identifiers: Type.Array(Identifier),
    events: Type.Array(Event),
  }),
})
export const IdentityRequestsResponse = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({ items: Type.Array(AdminRequestSchema), total: Type.Integer() }),
})
export const IdentityRequestResponse = Type.Object({
  code: Type.Literal(0),
  data: Type.Object({ request: AdminRequestSchema, events: Type.Array(Event) }),
})
export const IdentityMutationResponse = Type.Object({ code: Type.Literal(0) })
