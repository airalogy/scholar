import env from '@fastify/env'
import { Type } from 'typebox'

declare module 'fastify' {
  export interface FastifyInstance {
    config: {
      NODE_ENV: 'development' | 'test' | 'production'
      LOG_LEVEL: string
      TRUST_PROXY: string
      HOST: string
      PORT: number
      DEPLOYMENT_MODE: 'public' | 'private'
      PRIVATE_INSTITUTION_SLUG: string
      STORAGE_PROVIDER: 'oss' | 'local'
      LOCAL_STORAGE_DIR: string
      JWT_SECRET: string
      ENABLE_PASSWORD_SIGNIN: boolean
      ENABLE_PUBLIC_SIGNUP: boolean
      ENABLE_AIRALOGY_OAUTH: boolean
      ENABLE_INSTITUTION_LOGIN: boolean
      INSTITUTION_LOGIN_INSTITUTION_SLUG: string
      ENABLE_INSTITUTION_PROVISION_LOGIN: boolean
      INSTITUTION_SSO_ENABLED: boolean
      ENABLE_AI_CHAT: boolean
      SCHOLAR_TIMELINE_GENERATION_MODE: 'disabled' | 'request_only' | 'preview' | 'admin'
      TIMELINE_MODEL: string
      TIMELINE_CONCURRENCY: number
      TIMELINE_DAILY_USER_LIMIT: number
      OPENALEX_MAILTO: string
      ENABLE_PAPER_UPLOAD: boolean
      ENABLE_DEGREE_THESES: boolean
      ENABLE_FORUM: boolean
      PUBLIC_APP_NAME: string
      SHOW_BRAND_LOGO: boolean
      SHOW_INSTITUTION_LOGO: boolean
      PUBLIC_BRAND_LOGO_URL: string
      PUBLIC_INSTITUTION_LOGO_URL: string
      PUBLIC_INSTITUTION_WATERMARK_URL: string
      // database
      DATABASE_URL: string
      // openai
      OPENAI_BASE_URL: string
      OPENAI_API_KEY: string
      OPENAI_EMBEDDING_MODEL: string
      CHAT_MODEL: string
      // oss
      OSS_ENDPOINT: string
      OSS_ACCESS_KEY_ID: string
      OSS_ACCESS_KEY_SECRET: string
      OSS_BUCKET: string
      AIRALOGY_OAUTH_BASE_URL: string
      AIRALOGY_OAUTH_CLIENT_ID: string
      AIRALOGY_OAUTH_CLIENT_SECRET: string
      AIRALOGY_OAUTH_REDIRECT_URI: string
      AIRALOGY_OAUTH_SCOPE: string
      INSTITUTION_SSO_TYPE: 'oauth2'
      INSTITUTION_SSO_PROVIDER_ID: string
      INSTITUTION_SSO_DISPLAY_NAME: string
      INSTITUTION_SSO_AUTHORIZATION_URL: string
      INSTITUTION_SSO_TOKEN_URL: string
      INSTITUTION_SSO_USERINFO_URL: string
      INSTITUTION_SSO_CLIENT_ID: string
      INSTITUTION_SSO_CLIENT_SECRET: string
      INSTITUTION_SSO_REDIRECT_URI: string
      INSTITUTION_SSO_SCOPE: string
      INSTITUTION_SSO_EXTERNAL_ID_FIELD: string
      INSTITUTION_SSO_EMAIL_FIELD: string
      INSTITUTION_SSO_NAME_FIELD: string
      INSTITUTION_SSO_USERINFO_TOKEN_MODE: 'bearer' | 'query'
    }
  }
}

const schema = Type.Object({
  NODE_ENV: Type.Union(
    [Type.Literal('development'), Type.Literal('test'), Type.Literal('production')],
    { default: 'development' },
  ),
  LOG_LEVEL: Type.String({ default: 'info' }),
  TRUST_PROXY: Type.String({ default: '' }),
  HOST: Type.String({ default: 'localhost' }),
  PORT: Type.Number({ default: 3000 }),
  DEPLOYMENT_MODE: Type.Union([Type.Literal('public'), Type.Literal('private')], {
    default: 'public',
  }),
  PRIVATE_INSTITUTION_SLUG: Type.String({ default: '' }),
  STORAGE_PROVIDER: Type.Union([Type.Literal('oss'), Type.Literal('local')], {
    default: 'local',
  }),
  LOCAL_STORAGE_DIR: Type.String({ default: 'data/uploads' }),
  // jwt
  JWT_SECRET: Type.String({ minLength: 32 }),
  ENABLE_PASSWORD_SIGNIN: Type.Boolean({ default: true }),
  ENABLE_PUBLIC_SIGNUP: Type.Boolean({ default: false }),
  ENABLE_AIRALOGY_OAUTH: Type.Boolean({ default: false }),
  ENABLE_INSTITUTION_LOGIN: Type.Boolean({ default: false }),
  INSTITUTION_LOGIN_INSTITUTION_SLUG: Type.String({ default: '' }),
  ENABLE_INSTITUTION_PROVISION_LOGIN: Type.Boolean({ default: false }),
  INSTITUTION_SSO_ENABLED: Type.Boolean({ default: false }),
  ENABLE_AI_CHAT: Type.Boolean({ default: false }),
  SCHOLAR_TIMELINE_GENERATION_MODE: Type.Union(
    [
      Type.Literal('disabled'),
      Type.Literal('request_only'),
      Type.Literal('preview'),
      Type.Literal('admin'),
    ],
    { default: 'disabled' },
  ),
  TIMELINE_MODEL: Type.String({ default: '' }),
  TIMELINE_CONCURRENCY: Type.Integer({ minimum: 1, maximum: 10, default: 2 }),
  TIMELINE_DAILY_USER_LIMIT: Type.Integer({ minimum: 1, maximum: 100, default: 3 }),
  OPENALEX_MAILTO: Type.String({ default: '' }),
  ENABLE_PAPER_UPLOAD: Type.Boolean({ default: true }),
  ENABLE_DEGREE_THESES: Type.Boolean({ default: true }),
  ENABLE_FORUM: Type.Boolean({ default: true }),
  PUBLIC_APP_NAME: Type.String({ default: 'Airalogy Scholar' }),
  SHOW_BRAND_LOGO: Type.Boolean({ default: true }),
  SHOW_INSTITUTION_LOGO: Type.Boolean({ default: false }),
  PUBLIC_BRAND_LOGO_URL: Type.String({ default: '' }),
  PUBLIC_INSTITUTION_LOGO_URL: Type.String({ default: '' }),
  PUBLIC_INSTITUTION_WATERMARK_URL: Type.String({ default: '' }),
  // database
  DATABASE_URL: Type.String(),
  // openai
  OPENAI_BASE_URL: Type.String({ default: '' }),
  OPENAI_API_KEY: Type.String({ default: '' }),
  OPENAI_EMBEDDING_MODEL: Type.String({ default: 'text-embedding-v4' }),
  CHAT_MODEL: Type.String({ default: 'qwen3.5-plus' }),
  // oss
  OSS_ENDPOINT: Type.String({ default: '' }),
  OSS_ACCESS_KEY_ID: Type.String({ default: '' }),
  OSS_ACCESS_KEY_SECRET: Type.String({ default: '' }),
  OSS_BUCKET: Type.String({ default: '' }),
  AIRALOGY_OAUTH_BASE_URL: Type.String({ default: '' }),
  AIRALOGY_OAUTH_CLIENT_ID: Type.String({ default: '' }),
  AIRALOGY_OAUTH_CLIENT_SECRET: Type.String({ default: '' }),
  AIRALOGY_OAUTH_REDIRECT_URI: Type.String({ default: '' }),
  AIRALOGY_OAUTH_SCOPE: Type.String({ default: 'basic' }),
  INSTITUTION_SSO_TYPE: Type.Literal('oauth2', { default: 'oauth2' }),
  INSTITUTION_SSO_PROVIDER_ID: Type.String({ default: '' }),
  INSTITUTION_SSO_DISPLAY_NAME: Type.String({ default: '' }),
  INSTITUTION_SSO_AUTHORIZATION_URL: Type.String({ default: '' }),
  INSTITUTION_SSO_TOKEN_URL: Type.String({ default: '' }),
  INSTITUTION_SSO_USERINFO_URL: Type.String({ default: '' }),
  INSTITUTION_SSO_CLIENT_ID: Type.String({ default: '' }),
  INSTITUTION_SSO_CLIENT_SECRET: Type.String({ default: '' }),
  INSTITUTION_SSO_REDIRECT_URI: Type.String({ default: '' }),
  INSTITUTION_SSO_SCOPE: Type.String({ default: 'basic' }),
  INSTITUTION_SSO_EXTERNAL_ID_FIELD: Type.String({ default: 'sub' }),
  INSTITUTION_SSO_EMAIL_FIELD: Type.String({ default: 'email' }),
  INSTITUTION_SSO_NAME_FIELD: Type.String({ default: 'name' }),
  INSTITUTION_SSO_USERINFO_TOKEN_MODE: Type.Union([Type.Literal('bearer'), Type.Literal('query')], {
    default: 'bearer',
  }),
})

export const autoConfig = {
  // Decorate Fastify instance with `config` key
  // Optional, default: 'config'
  confKey: 'config',

  // Schema to validate
  schema,

  // Needed to read .env in root folder
  dotenv: true,
}

/**
 * This plugins helps to check environment variables.
 *
 * @see {@link https://github.com/fastify/fastify-env}
 */
export default env
