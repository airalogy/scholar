import type { FastifyInstance } from 'fastify'
import { getUserPlatformRole, assertCanManageInstitutionMembers } from '../utils/permissions'
import { loadImportInstitution } from '../routes/v1/institutions/service.shared'

export const assertCanManageBibliometrics = async (
  fastify: FastifyInstance,
  userId: string,
): Promise<void> => {
  if ((await getUserPlatformRole(fastify, userId)) === 'platform_admin') return
  if (fastify.deployment.managementMode !== 'self_hosted')
    throw fastify.httpErrors.forbidden('Platform administration permission is required')
  const institution = await loadImportInstitution(fastify, fastify.deployment.institution.slug)
  await assertCanManageInstitutionMembers(fastify, userId, institution.id)
}
