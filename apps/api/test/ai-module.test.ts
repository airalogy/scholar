import assert from 'node:assert/strict'
import test from 'node:test'
import type { FastifyInstance } from 'fastify'
import { getAiRuntime } from '../src/ai/client'
import { AI_MODES } from '../src/ai'

const createFastifyStub = (): FastifyInstance => {
  return {
    config: {
      OPENAI_BASE_URL: 'https://example.invalid/v1',
      OPENAI_API_KEY: 'test-key',
      OPENAI_EMBEDDING_MODEL: 'test-embedding-model',
      CHAT_MODEL: 'test-chat-model',
      TIMELINE_MODEL: '',
    },
  } as FastifyInstance
}

test('AI modes are exposed from one backend module', () => {
  assert.deepEqual(AI_MODES, ['general', 'scholar_recommendation'])
})

test('AI runtime reuses one configured model client per Fastify app', () => {
  const fastify = createFastifyStub()
  const first = getAiRuntime(fastify)
  const second = getAiRuntime(fastify)

  assert.strictEqual(first, second)
  assert.equal(first.chatModel, 'test-chat-model')
  assert.equal(first.timelineModel, 'test-chat-model')
  assert.equal(first.embeddingModel, 'test-embedding-model')
  assert.notStrictEqual(first, getAiRuntime(createFastifyStub()))
})
