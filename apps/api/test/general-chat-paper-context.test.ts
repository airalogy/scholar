import assert from 'node:assert/strict'
import test from 'node:test'
import type { FastifyInstance } from 'fastify'
import { buildGeneralChatMessages, parsePaperContextId } from '../src/ai/modes/general-chat'
import type { AiMessage } from '../src/ai/types'

const INSTITUTION_ID = '22222222-2222-4222-8222-222222222222'
const PAPER_ID = '33333333-3333-4333-8333-333333333333'
const messages: AiMessage[] = [
  { role: 'system', content: `\u8bba\u6587ID\uff1a${PAPER_ID}\n\u6807\u9898\uff1aExample` },
  { role: 'user', content: 'What method does this paper use?' },
]

test('paper context parser accepts only the explicit paper-reading system field', () => {
  assert.equal(parsePaperContextId(messages), PAPER_ID)
  assert.equal(
    parsePaperContextId([{ role: 'user', content: `\u8bba\u6587ID\uff1a${PAPER_ID}` }]),
    null,
  )
})

test('approved PDF passages are not added when model processing is disabled', async () => {
  let queried = false
  const fastify = {
    config: { ALLOW_APPROVED_PDF_MODEL_PROCESSING: false },
    prisma: {
      $queryRawUnsafe: async () => {
        queried = true
        return []
      },
    },
  } as unknown as FastifyInstance

  const built = await buildGeneralChatMessages(fastify, messages)

  assert.equal(queried, false)
  assert.equal(built.length, 3)
})

test('explicit deployment opt-in adds institution-scoped PDF evidence', async () => {
  const fastify = {
    deployment: { institution: { slug: 'example' } },
    config: {
      ALLOW_APPROVED_PDF_MODEL_PROCESSING: true,
      OPENAI_BASE_URL: '',
      OPENAI_API_KEY: '',
      CHAT_MODEL: '',
      TIMELINE_MODEL: '',
      OPENAI_EMBEDDING_MODEL: '',
    },
    prisma: {
      institutions: {
        findUnique: async () => ({ id: INSTITUTION_ID, slug: 'example', name: 'Example' }),
      },
      $queryRawUnsafe: async () => [
        {
          paperId: PAPER_ID,
          segmentIndex: 2,
          text: 'Retrieved evidence from the approved PDF.',
          score: 1.2,
        },
      ],
    },
    log: { warn: () => undefined },
  } as unknown as FastifyInstance

  const built = await buildGeneralChatMessages(fastify, messages)

  assert.equal(built.length, 4)
  assert.match(String(built[1].content), /Retrieved evidence from the approved PDF/u)
})
