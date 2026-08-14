import assert from 'node:assert/strict'
import test from 'node:test'
import type { FastifyInstance } from 'fastify'
import { getAiRuntime } from '../src/ai/client'
import {
  buildEvidenceChunks,
  buildResearchTimelineFingerprint,
  cleanResearchPaperTitle,
  groupResearchPapersIntoCalendarWindows,
} from '../src/ai/research-timeline/periodizer'
import { resolvePublicationMetadata } from '../src/ai/research-timeline/publication-metadata'
import { resolveTimelinePaperMetadata } from '../src/ai/research-timeline/service'
import { summarizeResearchTimelinePeriod } from '../src/ai/research-timeline/summarizer'
import type {
  PublicationMetadataCandidate,
  TimelinePaper,
  TimelinePaperInput,
} from '../src/ai/research-timeline/types'
import {
  resolveTimelineFailureState,
  TIMELINE_MAX_ATTEMPTS,
} from '../src/plugins/app/research-timeline-worker'

const makePaper = (
  id: string,
  year: number | null,
  overrides: Partial<TimelinePaperInput> = {},
): TimelinePaperInput => ({
  id,
  doi: `10.1000/${id}`,
  normalizedDoi: `10.1000/${id}`,
  title: `Paper ${id}`,
  abstract: `Abstract for ${id}`,
  year,
  publicationDate: year ? new Date(`${year}-01-01T00:00:00.000Z`) : null,
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  sourceStatus: 'database_year',
  ...overrides,
})

const createAiFastifyStub = (): FastifyInstance =>
  ({
    config: {
      OPENAI_BASE_URL: 'https://example.invalid/v1',
      OPENAI_API_KEY: 'test-key',
      OPENAI_EMBEDDING_MODEL: 'test-embedding',
      CHAT_MODEL: 'test-chat',
      TIMELINE_MODEL: 'test-timeline',
    },
  }) as FastifyInstance

const validSummary = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          focus_summary: '该阶段围绕科研知识组织与学术检索展开系统研究，并逐步形成结构化方法。',
          focus_tags: ['知识组织', '学术检索', '结构化方法'],
        }),
      },
    },
  ],
  usage: { prompt_tokens: 100, completion_tokens: 30 },
}

test('timeline periodizer cleans titles and uses fixed five-year calendar windows', () => {
  assert.equal(cleanResearchPaperTitle('H<sub>2</sub>O &amp; X<sup>2+</sup>'), 'H₂O & X²⁺')
  const groups = groupResearchPapersIntoCalendarWindows(
    [makePaper('a', 2019), makePaper('b', 2020), makePaper('c', 2024), makePaper('unknown', null)],
    5,
  )
  assert.deepEqual(
    groups.map((group) => [group.startYear, group.endYear, group.papers.length]),
    [
      [2015, 2019, 1],
      [2020, 2024, 2],
    ],
  )
})

test('timeline evidence chunks stay inside the total prompt budget', () => {
  const papers = [
    makePaper('a', 2020, { abstract: 'a'.repeat(80) }),
    makePaper('b', 2021, { abstract: 'b'.repeat(80) }),
    makePaper('c', 2022, { abstract: null }),
  ] as TimelinePaper[]
  const chunks = buildEvidenceChunks(papers, 240, 60)
  assert.ok(chunks.length > 1)
  assert.ok(chunks.every((chunk) => chunk.length < 400))
  assert.match(chunks.join(''), /摘要缺失/u)
})

test('timeline fingerprint is stable and changes with source data or model', () => {
  const papers = [makePaper('b', 2021), makePaper('a', 2020)]
  const first = buildResearchTimelineFingerprint('scholar', papers, 'model-a', 'v1', 5)
  const reordered = buildResearchTimelineFingerprint(
    'scholar',
    [...papers].reverse(),
    'model-a',
    'v1',
    5,
  )
  const changed = buildResearchTimelineFingerprint('scholar', papers, 'model-b', 'v1', 5)
  assert.equal(first, reordered)
  assert.notEqual(first, changed)
})

test('timeline jobs retry twice and become failed after the third attempt', () => {
  assert.deepEqual(resolveTimelineFailureState(1), {
    status: 'queued',
    progressStage: 'queued',
  })
  assert.deepEqual(resolveTimelineFailureState(2), {
    status: 'queued',
    progressStage: 'queued',
  })
  assert.deepEqual(resolveTimelineFailureState(TIMELINE_MAX_ATTEMPTS), {
    status: 'failed',
    progressStage: 'failed',
  })
})

test('Crossref takes priority while OpenAlex remains the fallback', async () => {
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('openalex.org')) {
      return new Response(
        JSON.stringify({
          results: [
            {
              doi: 'https://doi.org/10.1000/a',
              publication_year: 2020,
              publication_date: '2020-01-01',
              title: 'A',
            },
            {
              doi: 'https://doi.org/10.1000/b',
              publication_year: 2022,
              publication_date: '2022-02-01',
              title: 'B',
            },
          ],
        }),
        { status: 200 },
      )
    }
    if (url.includes('10.1000%2Fa')) {
      return new Response(
        JSON.stringify({
          message: { title: ['A'], published: { 'date-parts': [[2021, 3, 2]] } },
        }),
        { status: 200 },
      )
    }
    return new Response('', { status: 404 })
  }) as typeof fetch

  const result = await resolvePublicationMetadata(['10.1000/a', '10.1000/b'], { fetchImpl })
  assert.deepEqual(result.get('10.1000/a'), {
    doi: '10.1000/a',
    year: 2021,
    publicationDate: '2021-03-02',
    title: 'A',
    source: 'crossref',
  })
  assert.equal(result.get('10.1000/b')?.year, 2022)
  assert.equal(result.get('10.1000/b')?.source, 'openalex')
})

test('metadata resolution only fills empty years and records conflicts', async () => {
  const updates: Array<Record<string, unknown>> = []
  const fastify = {
    config: { OPENALEX_MAILTO: '' },
    log: { warn: () => undefined },
    prisma: {
      papers: {
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data)
          return data
        },
      },
    },
  } as unknown as FastifyInstance
  const candidates = new Map<string, PublicationMetadataCandidate>([
    [
      '10.1000/empty',
      {
        doi: '10.1000/empty',
        year: 2022,
        publicationDate: '2022-04-03',
        title: 'Filled',
        source: 'crossref',
      },
    ],
    [
      '10.1000/conflict',
      {
        doi: '10.1000/conflict',
        year: 2024,
        publicationDate: '2024-01-01',
        title: 'Conflict',
        source: 'openalex',
      },
    ],
    [
      '10.1000/date-conflict',
      {
        doi: '10.1000/date-conflict',
        year: 2023,
        publicationDate: '2023-09-08',
        title: 'Date Conflict',
        source: 'crossref',
      },
    ],
  ])
  const resolved = await resolveTimelinePaperMetadata(
    fastify,
    [
      makePaper('empty', null),
      makePaper('conflict', 2023),
      makePaper('date-conflict', 2023, {
        publicationDate: new Date('2023-01-01T00:00:00.000Z'),
      }),
    ],
    { resolver: async () => candidates },
  )

  assert.equal(resolved.papers[0].year, 2022)
  assert.equal(resolved.papers[1].year, 2023)
  assert.equal(resolved.issues.length, 2)
  assert.equal(resolved.issues[0].issueType, 'metadata_conflict')
  assert.match(resolved.issues[1].message, /publication date/u)
  assert.equal(updates[0].publish_year, 2022)
  assert.equal(updates[1].publish_year, undefined)
})

test('timeline summarizer corrects one invalid model output', async () => {
  const fastify = createAiFastifyStub()
  const runtime = getAiRuntime(fastify)
  let calls = 0
  Reflect.set(runtime.client.chat.completions, 'create', async () => {
    calls += 1
    return calls === 1
      ? { choices: [{ message: { content: '{"focus_summary":"too short"}' } }] }
      : validSummary
  })
  const result = await summarizeResearchTimelinePeriod(fastify, '测试学者', {
    startYear: 2020,
    endYear: 2024,
    label: '2020-2024',
    papers: [makePaper('a', 2020) as TimelinePaper],
  })
  assert.equal(calls, 2)
  assert.equal(result.focus_tags.length, 3)
})

test('oversized timeline periods summarize chunks before synthesis', async () => {
  const fastify = createAiFastifyStub()
  const runtime = getAiRuntime(fastify)
  let calls = 0
  Reflect.set(runtime.client.chat.completions, 'create', async () => {
    calls += 1
    return validSummary
  })
  const result = await summarizeResearchTimelinePeriod(fastify, '高产学者', {
    startYear: 2020,
    endYear: 2024,
    label: '2020-2024',
    papers: Array.from({ length: 40 }, (_, index) => {
      return makePaper(String(index), 2020 + (index % 5), {
        abstract: String(index).repeat(1800),
      }) as TimelinePaper
    }),
  })
  assert.ok(calls >= 3)
  assert.equal(result.inputTokens, calls * 100)
})
