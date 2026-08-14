import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import {
  ActivateInstitutionProvisionBodySchema,
  AuthInstitutionListResponseSchema,
  InstitutionProvisionPreviewBodySchema,
  InstitutionProvisionPreviewSchema,
  IntegrationTokenBodySchema,
  IntegrationTokenResponseSchema,
  OauthAuthorizeQuerySchema,
  OauthCallbackBodySchema,
  OauthCallbackResponseSchema,
  PublicAppConfigSchema,
  SignupBodySchema,
  SigninBodySchema,
  TokenResponseSchema,
} from './schema'
import { completeAiralogyOauthLogin, createAiralogyOauthAuthorization } from './oauth/airalogy'
import {
  completeInstitutionSsoLogin,
  createInstitutionSsoAuthorization,
} from './oauth/institution-sso'
import {
  activateInstitutionProvision,
  getPublicAppConfig,
  getInstitutionProvisionPreview,
  listPublicAuthInstitutions,
  signupUser,
  signinUser,
} from './service'
import { exchangeIntegrationToken } from './service.integration'
import { assertAuthCapabilityEnabled } from '../../utils/deployment'

const authRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post(
    '/integration-token',
    {
      config: {
        publicRoute: true,
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
      schema: {
        tags: ['auth'],
        body: IntegrationTokenBodySchema,
        response: {
          200: IntegrationTokenResponseSchema,
        },
        security: [],
      },
    },
    async (request) => {
      return exchangeIntegrationToken(fastify, request, request.body)
    },
  )

  fastify.post(
    '/signup',
    {
      config: {
        publicRoute: true,
        rateLimit: { max: 5, timeWindow: '1 hour' },
      },
      schema: {
        tags: ['auth'],
        body: SignupBodySchema,
        response: {
          200: TokenResponseSchema,
        },
        security: [],
      },
    },
    async (request) => {
      assertAuthCapabilityEnabled(
        fastify,
        'enablePublicSignup',
        'Public signup is not available in this deployment',
      )
      return signupUser(fastify, request.body)
    },
  )

  fastify.post(
    '/signin',
    {
      config: {
        publicRoute: true,
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
      schema: {
        tags: ['auth'],
        body: SigninBodySchema,
        response: {
          200: TokenResponseSchema,
        },
        security: [],
      },
    },
    async (request) => {
      assertAuthCapabilityEnabled(
        fastify,
        'enablePasswordSignin',
        'Password sign-in is not available in this deployment',
      )
      return signinUser(fastify, request.body)
    },
  )

  fastify.get(
    '/public-config',
    {
      config: { publicRoute: true },
      schema: {
        tags: ['auth'],
        response: {
          200: PublicAppConfigSchema,
        },
        security: [],
      },
    },
    async () => {
      return getPublicAppConfig(fastify)
    },
  )

  fastify.get(
    '/airalogy/authorize',
    {
      config: {
        publicRoute: true,
        rateLimit: { max: 30, timeWindow: '1 minute' },
      },
      schema: {
        tags: ['auth'],
        querystring: OauthAuthorizeQuerySchema,
        security: [],
      },
    },
    async (request, reply) => {
      assertAuthCapabilityEnabled(
        fastify,
        'enableAiralogyOauth',
        'Airalogy OAuth is not available in this deployment',
      )
      const redirectUrl = await createAiralogyOauthAuthorization(fastify, request.query.returnTo)
      return reply.redirect(redirectUrl)
    },
  )

  fastify.post(
    '/airalogy/callback',
    {
      config: {
        publicRoute: true,
        rateLimit: { max: 20, timeWindow: '1 minute' },
      },
      schema: {
        tags: ['auth'],
        body: OauthCallbackBodySchema,
        response: {
          200: OauthCallbackResponseSchema,
        },
        security: [],
      },
    },
    async (request) => {
      assertAuthCapabilityEnabled(
        fastify,
        'enableAiralogyOauth',
        'Airalogy OAuth is not available in this deployment',
      )
      return completeAiralogyOauthLogin(fastify, request.body)
    },
  )

  fastify.get(
    '/institution-sso/authorize',
    {
      config: {
        publicRoute: true,
        rateLimit: { max: 30, timeWindow: '1 minute' },
      },
      schema: {
        tags: ['auth'],
        querystring: OauthAuthorizeQuerySchema,
        security: [],
      },
    },
    async (request, reply) => {
      assertAuthCapabilityEnabled(
        fastify,
        'enableInstitutionSso',
        'Institution SSO is not available in this deployment',
      )
      const redirectUrl = createInstitutionSsoAuthorization(fastify, request.query.returnTo)
      return reply.redirect(redirectUrl)
    },
  )

  fastify.post(
    '/institution-sso/callback',
    {
      config: {
        publicRoute: true,
        rateLimit: { max: 20, timeWindow: '1 minute' },
      },
      schema: {
        tags: ['auth'],
        body: OauthCallbackBodySchema,
        response: {
          200: OauthCallbackResponseSchema,
        },
        security: [],
      },
    },
    async (request) => {
      assertAuthCapabilityEnabled(
        fastify,
        'enableInstitutionSso',
        'Institution SSO is not available in this deployment',
      )
      return completeInstitutionSsoLogin(fastify, request.body)
    },
  )

  fastify.get(
    '/institutions',
    {
      config: { publicRoute: true },
      schema: {
        tags: ['auth'],
        response: {
          200: AuthInstitutionListResponseSchema,
        },
        security: [],
      },
    },
    async () => {
      return listPublicAuthInstitutions(fastify)
    },
  )

  fastify.post(
    '/institution-provisions/preview',
    {
      config: {
        publicRoute: true,
        rateLimit: { max: 60, timeWindow: '1 minute' },
      },
      schema: {
        tags: ['auth'],
        body: InstitutionProvisionPreviewBodySchema,
        response: {
          200: InstitutionProvisionPreviewSchema,
        },
        security: [],
      },
    },
    async (request) => {
      assertAuthCapabilityEnabled(
        fastify,
        'enableInstitutionProvisionLogin',
        'Institution activation tokens are not available in this deployment',
      )
      return getInstitutionProvisionPreview(
        fastify,
        request.body.token,
        request.body.institutionSlug,
      )
    },
  )

  fastify.post(
    '/institution-provisions/activate',
    {
      config: {
        publicRoute: true,
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
      schema: {
        tags: ['auth'],
        body: ActivateInstitutionProvisionBodySchema,
        response: {
          200: TokenResponseSchema,
        },
        security: [],
      },
    },
    async (request) => {
      assertAuthCapabilityEnabled(
        fastify,
        'enableInstitutionProvisionLogin',
        'Institution activation tokens are not available in this deployment',
      )
      return activateInstitutionProvision(fastify, request.body)
    },
  )
}

export default authRoutes
