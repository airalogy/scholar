import assert from 'node:assert/strict'
import test from 'node:test'
import type { FastifyInstance } from 'fastify'
import {
  reciprocalRankFuse,
  searchPaperSegmentsByBm25,
  type PaperRetrievalResult,
} from '../src/search/paper-retrieval'

const result = (paperId: string, segmentIndex: number, score: number): PaperRetrievalResult => ({
  paperId,
  segmentIndex,
  score,
  text: `${paperId}:${segmentIndex}`,
})

test('reciprocal rank fusion combines lexical and vector rankings deterministically', () => {
  const fused = reciprocalRankFuse(
    [
      [result('paper-a', 0, 10), result('paper-b', 0, 9)],
      [result('paper-b', 1, 0.9), result('paper-a', 1, 0.8)],
    ],
    (item) => item.paperId,
    2,
  )

  assert.deepEqual(
    fused.map((item) => item.paperId),
    ['paper-a', 'paper-b'],
  )
  assert.equal(fused[0].score, fused[1].score)
})

test('BM25 retrieval normalizes terms and preserves institution scope', async () => {
  const calls: unknown[][] = []
  const fastify = {
    prisma: {
      $queryRawUnsafe: async (...args: unknown[]) => {
        calls.push(args)
        return [{ paperId: 'paper-a', segmentIndex: 0, text: 'text', score: '1.5' }]
      },
    },
  } as unknown as FastifyInstance

  const results = await searchPaperSegmentsByBm25(fastify, 'BM25, bm25 hybrid', {
    institutionId: '22222222-2222-4222-8222-222222222222',
    limit: 5,
    distinctPapers: true,
  })

  assert.deepEqual(JSON.parse(String(calls[0][1])), ['bm25', 'hybrid'])
  assert.equal(calls[0][2], '22222222-2222-4222-8222-222222222222')
  assert.match(String(calls[0][0]), /document_frequencies/u)
  assert.match(String(calls[0][0]), /claim\."institutionId" = \$2::uuid/u)
  assert.equal(results[0].score, 1.5)
})
