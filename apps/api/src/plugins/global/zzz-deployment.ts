import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import type { DeploymentRuntimeConfig } from '../../utils/deployment'
import { buildDeploymentRuntimeConfig } from '../../utils/deployment'

declare module 'fastify' {
  interface FastifyInstance {
    deployment: DeploymentRuntimeConfig
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const deployment = buildDeploymentRuntimeConfig(fastify)

  fastify.decorate('deployment', deployment)
  fastify.log.info(
    {
      tenancyMode: deployment.tenancyMode,
      managementMode: deployment.managementMode,
      contentAccess: deployment.contentAccess,
      institutionSlug: deployment.institution.slug,
      auth: deployment.auth,
      features: deployment.features,
    },
    'Deployment capabilities resolved',
  )
})
