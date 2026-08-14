import type { FastifyInstance, FastifyRequest } from 'fastify'
import { assertCanImportInstitutionData } from './permissions'

export const INTEGRATION_TOKEN_TYPE = 'integration'

export const INTEGRATION_SCOPES = ['papers:import', 'scholars:import', 'imports:read'] as const

export type IntegrationScope = (typeof INTEGRATION_SCOPES)[number]

export interface ImportActor {
  type: 'user' | 'integration'
  userId: string
  credentialId: string | null
  institutionId: string | null
  scopes: IntegrationScope[]
}

const isIntegrationScope = (value: string): value is IntegrationScope => {
  return INTEGRATION_SCOPES.includes(value as IntegrationScope)
}

export const resolveImportActor = (request: FastifyRequest): ImportActor => {
  if (request.user.token_type === INTEGRATION_TOKEN_TYPE) {
    return {
      type: 'integration',
      userId: request.user.userId,
      credentialId: request.user.credentialId ?? null,
      institutionId: request.user.institutionId ?? null,
      scopes: (request.user.scopes ?? []).filter(isIntegrationScope),
    }
  }

  return {
    type: 'user',
    userId: request.user.userId,
    credentialId: null,
    institutionId: null,
    scopes: [],
  }
}

export const assertImportActorAccess = async (
  fastify: FastifyInstance,
  actor: ImportActor,
  institutionId: string,
  requiredScope: IntegrationScope,
): Promise<void> => {
  if (actor.type === 'integration') {
    if (
      !actor.credentialId ||
      actor.institutionId !== institutionId ||
      !actor.scopes.includes(requiredScope)
    ) {
      throw fastify.httpErrors.forbidden('Integration credential does not allow this operation')
    }
    return
  }

  await assertCanImportInstitutionData(fastify, actor.userId, institutionId)
}
