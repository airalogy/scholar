import type { FastifyInstance } from 'fastify'

export const getConfiguredInstitution = async (fastify: FastifyInstance) => {
  const institution = await fastify.prisma.institutions.findUnique({
    where: { slug: fastify.deployment.institution.slug },
    select: { id: true, slug: true, name: true },
  })
  if (!institution) {
    throw fastify.httpErrors.serviceUnavailable(
      'The configured institution has not been initialized',
    )
  }
  return institution
}

export const assertConfiguredInstitutionId = async (
  fastify: FastifyInstance,
  institutionId: string | null | undefined,
): Promise<string> => {
  const configured = await getConfiguredInstitution(fastify)
  if (institutionId && institutionId !== configured.id) {
    throw fastify.httpErrors.notFound('Institution not found')
  }
  return configured.id
}
