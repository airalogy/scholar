import type { FastifyInstance } from 'fastify'
import { Type, type Static } from 'typebox'
import { Check } from 'typebox/value'
import { getAiRuntime } from '../client'
import { buildEvidenceChunks } from './periodizer'
import {
  TIMELINE_MAX_ABSTRACT_CHARS,
  TIMELINE_MAX_PROMPT_CHARS,
  type TimelinePeriodGroup,
  type TimelineSummary,
  type TimelineSummaryResult,
} from './types'

export const TimelineSummarySchema = Type.Object(
  {
    focus_summary: Type.String({ minLength: 20, maxLength: 1000 }),
    focus_tags: Type.Array(Type.String({ minLength: 1, maxLength: 50 }), {
      minItems: 3,
      maxItems: 5,
      uniqueItems: true,
    }),
  },
  { additionalProperties: false },
)

type TimelineSummaryPayload = Static<typeof TimelineSummarySchema>

const parseJsonObject = (value: string): unknown => {
  const trimmed = value
    .trim()
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '')
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end < start) {
    throw new Error('Timeline model output does not contain a JSON object')
  }
  return JSON.parse(trimmed.slice(start, end + 1)) as unknown
}

const buildPrompt = (
  scholarName: string,
  group: TimelinePeriodGroup,
  evidence: string,
  chunkLabel: string | null,
): string => {
  return [
    '你是一名严谨的科研情报分析员。',
    `请总结学者「${scholarName}」在 ${group.label} 时间窗口内的研究工作。`,
    chunkLabel ? `这是该时间窗口的${chunkLabel}，只总结本段证据。` : null,
    '只能依据给出的论文标题和摘要，不得补充外部事实，不得把合作者工作臆断为该学者的个人贡献。',
    '使用中文概括核心研究主题、方法或对象及可见的研究演进，不要逐篇罗列，不要写 DOI。',
    'focus_summary 使用 120–220 个汉字；focus_tags 提供 3–5 个简洁、互不重复的中文标签。',
    '只输出 JSON 对象，字段严格为 focus_summary 和 focus_tags。',
    evidence,
  ]
    .filter((item): item is string => item !== null)
    .join('\n\n')
}

const buildSynthesisPrompt = (
  scholarName: string,
  group: TimelinePeriodGroup,
  summaries: TimelineSummary[],
): string => {
  return [
    '你是一名严谨的科研情报分析员。',
    `以下是学者「${scholarName}」在 ${group.label} 时间窗口内分块论文证据的阶段性摘要。`,
    '请合成为一个完整研究阶段总结，不得加入分块摘要之外的事实。',
    'focus_summary 使用中文 120–220 个汉字，概括主题、方法、对象及可见演进；focus_tags 提供 3–5 个互不重复的中文标签。',
    '不要提及分块、输入材料或 DOI，只输出字段严格为 focus_summary 和 focus_tags 的 JSON 对象。',
    JSON.stringify({ evidence_summaries: summaries }, null, 2),
  ].join('\n\n')
}

const normalizeSummary = (value: TimelineSummaryPayload): TimelineSummary => {
  return {
    focus_summary: value.focus_summary.trim(),
    focus_tags: value.focus_tags.map((tag) => tag.trim()),
  }
}

const requestSummary = async (
  fastify: FastifyInstance,
  prompt: string,
): Promise<TimelineSummaryResult> => {
  const runtime = getAiRuntime(fastify)
  let previousError = ''

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const correction = previousError
      ? `\n\n上一次输出无效：${previousError}。请重新输出严格 JSON。`
      : ''
    const response = await runtime.client.chat.completions.create({
      model: runtime.timelineModel,
      messages: [{ role: 'user', content: `${prompt}${correction}` }],
      response_format: { type: 'json_object' },
    })
    try {
      const parsed = parseJsonObject(response.choices[0]?.message.content ?? '')
      if (!Check(TimelineSummarySchema, parsed)) {
        throw new Error('JSON does not match the timeline summary schema')
      }
      const normalized = normalizeSummary(parsed)
      if (!Check(TimelineSummarySchema, normalized)) {
        throw new Error('Normalized JSON does not match the timeline summary schema')
      }
      return {
        ...normalized,
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      }
    } catch (error) {
      previousError = error instanceof Error ? error.message : String(error)
    }
  }

  throw new Error(`Timeline model returned invalid structured output: ${previousError}`)
}

export const summarizeResearchTimelinePeriod = async (
  fastify: FastifyInstance,
  scholarName: string,
  group: TimelinePeriodGroup,
): Promise<TimelineSummaryResult> => {
  const chunks = buildEvidenceChunks(
    group.papers,
    TIMELINE_MAX_PROMPT_CHARS,
    TIMELINE_MAX_ABSTRACT_CHARS,
  )
  if (chunks.length === 0) {
    throw new Error('Cannot summarize an empty research timeline period')
  }
  if (chunks.length === 1) {
    return requestSummary(fastify, buildPrompt(scholarName, group, chunks[0], null))
  }

  const partialResults: TimelineSummaryResult[] = []
  for (const [index, chunk] of chunks.entries()) {
    partialResults.push(
      await requestSummary(
        fastify,
        buildPrompt(scholarName, group, chunk, `第 ${index + 1}/${chunks.length} 部分`),
      ),
    )
  }
  const synthesis = await requestSummary(
    fastify,
    buildSynthesisPrompt(scholarName, group, partialResults),
  )
  return {
    ...synthesis,
    inputTokens:
      synthesis.inputTokens + partialResults.reduce((total, item) => total + item.inputTokens, 0),
    outputTokens:
      synthesis.outputTokens + partialResults.reduce((total, item) => total + item.outputTokens, 0),
  }
}
