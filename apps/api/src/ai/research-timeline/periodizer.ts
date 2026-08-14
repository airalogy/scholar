import { createHash } from 'node:crypto'
import type { TimelinePaper, TimelinePaperInput, TimelinePeriodGroup } from './types'

const SUBSCRIPT: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
}
const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
}

const translateScript = (text: string, table: Record<string, string>): string => {
  return [...text].map((character) => table[character] ?? character).join('')
}

export const cleanResearchPaperTitle = (value: string): string => {
  let title = value
  for (let index = 0; index < 2; index += 1) {
    title = title
      .replace(/&amp;/giu, '&')
      .replace(/&lt;/giu, '<')
      .replace(/&gt;/giu, '>')
      .replace(/&quot;/giu, '"')
      .replace(/&#39;|&apos;/giu, "'")
      .replace(/&middot;/giu, '·')
  }

  return title
    .replace(/<sub>(.*?)<\/sub>/giu, (_match, text: string) => translateScript(text, SUBSCRIPT))
    .replace(/<sup>(.*?)<\/sup>/giu, (_match, text: string) => translateScript(text, SUPERSCRIPT))
    .replace(/<[^>]*>/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

export const groupResearchPapersIntoCalendarWindows = (
  papers: TimelinePaperInput[],
  windowSizeYears: number,
): TimelinePeriodGroup[] => {
  const groups = new Map<string, TimelinePeriodGroup>()

  for (const paper of papers) {
    if (!Number.isInteger(paper.year)) {
      continue
    }

    const resolvedPaper = paper as TimelinePaper
    const startYear = Math.floor(resolvedPaper.year / windowSizeYears) * windowSizeYears
    const endYear = startYear + windowSizeYears - 1
    const label = `${startYear}-${endYear}`
    const group = groups.get(label) ?? { startYear, endYear, label, papers: [] }
    group.papers.push(resolvedPaper)
    groups.set(label, group)
  }

  return [...groups.values()]
    .sort((left, right) => left.startYear - right.startYear)
    .map((group) => ({
      ...group,
      papers: [...group.papers].sort((left, right) => {
        return left.year - right.year || left.title.localeCompare(right.title)
      }),
    }))
}

const clip = (value: string, maxChars: number): string => {
  const text = value.replace(/\s+/gu, ' ').trim()
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}…`
}

export const buildEvidenceChunks = (
  papers: TimelinePaper[],
  maxPromptChars: number,
  maxAbstractChars: number,
): string[] => {
  const chunks: string[] = []
  let current: Array<Record<string, string | number>> = []
  let currentLength = 0

  for (const [index, paper] of papers.entries()) {
    const evidence = {
      index: index + 1,
      year: paper.year,
      doi: paper.normalizedDoi,
      title: cleanResearchPaperTitle(paper.title),
      abstract: clip(paper.abstract || '（摘要缺失，仅依据标题）', maxAbstractChars),
    }
    const serializedLength = JSON.stringify(evidence).length
    if (current.length > 0 && currentLength + serializedLength > maxPromptChars) {
      chunks.push(JSON.stringify({ papers: current }, null, 2))
      current = []
      currentLength = 0
    }
    current.push(evidence)
    currentLength += serializedLength
  }

  if (current.length > 0) {
    chunks.push(JSON.stringify({ papers: current }, null, 2))
  }
  return chunks
}

export const buildResearchTimelineFingerprint = (
  scholarId: string,
  papers: TimelinePaperInput[],
  model: string,
  promptVersion: string,
  windowSizeYears: number,
): string => {
  const input = {
    scholarId,
    model,
    promptVersion,
    windowSizeYears,
    papers: [...papers]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((paper) => ({
        id: paper.id,
        title: paper.title,
        abstract: paper.abstract,
        year: paper.year,
        publicationDate: paper.publicationDate?.toISOString() ?? null,
        updatedAt: paper.updatedAt.toISOString(),
      })),
  }
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}
