import { Type } from 'typebox'
import {
  TypeBoxValidatorCompiler,
  type FastifyPluginAsyncTypebox,
} from '@fastify/type-provider-typebox'
import { resolvePaperScope } from '../../papers/service.paper'
import { requireNormalizedDoi } from '../../../utils/doi'
import { assertFeatureEnabled } from '../../../utils/deployment'

const routes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.setValidatorCompiler(TypeBoxValidatorCompiler)
  fastify.post(
    '/submission-check',
    {
      schema: {
        body: Type.Object(
          {
            doi: Type.String({ minLength: 1, maxLength: 200 }),
            institutionId: Type.String({ format: 'uuid' }),
            labId: Type.Optional(Type.String({ format: 'uuid' })),
          },
          { additionalProperties: false },
        ),
        response: {
          200: Type.Object({
            code: Type.Literal(0),
            data: Type.Object({
              action: Type.Union([
                Type.Literal('new'),
                Type.Literal('resubmit'),
                Type.Literal('change_request'),
                Type.Literal('pending'),
                Type.Literal('archived'),
              ]),
              paperId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
            }),
          }),
        },
      },
    },
    async (request) => {
      assertFeatureEnabled(fastify, 'paperUpload', 'Paper upload is unavailable')
      const doi = requireNormalizedDoi(request.body.doi)
      const scope = await resolvePaperScope(
        fastify,
        request.user.userId,
        request.body.institutionId,
        request.body.labId,
      )
      const claim = await fastify.prisma.paper_claims.findFirst({
        where: { institutionId: scope.institutionId, paper: { doi } },
        include: { review_case: true },
      })
      if (!claim) return { code: 0 as const, data: { action: 'new' as const, paperId: null } }
      const status = claim.review_case.status
      const own = claim.submittedBy === request.user.userId
      const action =
        status === 'approved'
          ? ('change_request' as const)
          : status === 'archived'
            ? ('archived' as const)
            : own
              ? ('resubmit' as const)
              : ('pending' as const)
      return {
        code: 0 as const,
        data: { action, paperId: own || status === 'approved' ? claim.paperId : null },
      }
    },
  )
}
export default routes
