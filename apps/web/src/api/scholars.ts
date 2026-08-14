import { apiClient } from './client'
import { isDevAuthBypassEnabled } from '@/utils/devAuth'

export interface ResearchDirection {
  name: string
  description: string
}

export interface Education {
  school: string
  degree: string
  period: string
}

export interface AchievementItem {
  title: string
  description: string
}

export interface AchievementYear {
  year: string
  items: AchievementItem[]
}

export interface AchievementGroup {
  phase: string
  label: string
  years: AchievementYear[]
}

export interface ScholarResearchSourcePaper {
  year: number
  title: string
  doi: string
  has_abstract: boolean
  source_status: string
}

export interface ScholarResearchPeriod {
  period_start_year: number
  period_end_year: number
  paper_count: number
  papers_with_abstract: number
  papers_without_abstract: number
  focus_summary: string
  focus_tags: string[]
  source_papers: ScholarResearchSourcePaper[]
}

export interface ScholarResponse {
  id: string
  name: string
  avatar: string | null
  college: string[]
  title: string | null
  lab: string | null
  lab_slug: string | null
  office: string | null
  email: string | null
  phone: string | null
  bio: string | null
  join_year: number | null
  research_directions: ResearchDirection[]
  education: Education[]
  achievements: AchievementGroup[]
  research_timeline: ScholarResearchPeriod[]
  letter_index: string | null
  subjects: string[]
  subject_codes: string[]
  createdAt: string
  updatedAt: string
}

export interface ScholarListResponse {
  items: ScholarResponse[]
  total: number
}

export interface ScholarSubjectFacet {
  id: string
  code: string
  parentId: string | null
  nameZh: string
  nameEn: string | null
  count: number
}

export interface ScholarFacets {
  subjects: ScholarSubjectFacet[]
  colleges: string[]
  letters: string[]
}

interface ScholarFacetsResponse {
  code: 0
  data: ScholarFacets
}

export type TimelineGenerationStatus =
  | 'requested'
  | 'queued'
  | 'running'
  | 'ready'
  | 'published'
  | 'failed'
  | 'rejected'
  | 'archived'

export interface TimelineGenerationIssue {
  id: string
  paperId: string | null
  doi: string
  issueType: string
  existingYear: number | null
  candidateYear: number | null
  metadataSource: string | null
  message: string
}

export interface TimelineGeneration {
  id: string
  scholarId: string
  scholarName: string
  sourceType: string
  status: TimelineGenerationStatus
  sourceFingerprint: string | null
  model: string
  promptVersion: string
  progressStage: string
  completedPeriods: number
  totalPeriods: number
  sourcePaperCount: number
  resolvedPaperCount: number
  unresolvedPaperCount: number
  inputTokens: number | null
  outputTokens: number | null
  errorMessage: string | null
  reviewNotes: string | null
  requestedAt: string
  startedAt: string | null
  completedAt: string | null
  publishedAt: string | null
  reused: boolean
  periods: ScholarResearchPeriod[]
  issues: TimelineGenerationIssue[]
}

interface TimelineGenerationResponse {
  code: 0
  data: TimelineGeneration
}

interface TimelineGenerationListResponse {
  code: 0
  data: {
    items: TimelineGeneration[]
    total: number
  }
}

const MOCK_SCHOLARS: ScholarResponse[] = [
  {
    id: 'mock-scholar-a',
    name: '示例学者甲',
    avatar: null,
    college: ['工学院'],
    title: '示例职称',
    lab: '学术智能演示实验室',
    lab_slug: 'mock-scholar-a-lab',
    office: '示例校区 A101',
    email: 'scholar.a@example.edu',
    phone: null,
    bio: '这是一条不对应任何真实人物或机构的虚构演示资料。',
    join_year: 2015,
    research_directions: [
      {
        name: '多模态理解',
        description: '研究图文联合表示、跨模态检索与科学图表理解。',
      },
      {
        name: '科研智能体',
        description: '探索大模型驱动的论文检索、综述生成与实验辅助流程。',
      },
      {
        name: '医学影像分析',
        description: '面向病理图像与影像报告的弱监督学习与可解释建模。',
      },
    ],
    education: [
      {
        school: '示例大学',
        degree: '博士',
        period: '2006 - 2010',
      },
      {
        school: '示例学院',
        degree: '学士',
        period: '2002 - 2006',
      },
    ],
    achievements: [
      {
        phase: 'current',
        label: '代表成果',
        years: [
          {
            year: '2025',
            items: [
              {
                title: '多模态科研知识图谱构建框架',
                description: '提出面向论文、图表与作者关系的统一表示方法，提升复杂学术检索体验。',
              },
              {
                title: '学术助手交互系统',
                description: '构建支持问答、推荐与论文脉络分析的一体化前端交互原型。',
              },
            ],
          },
          {
            year: '2023',
            items: [
              {
                title: '医学影像弱监督诊断模型',
                description: '在有限标注条件下显著提升病灶检测性能，并增强模型可解释性。',
              },
            ],
          },
        ],
      },
      {
        phase: 'before',
        label: '荣誉与项目',
        years: [
          {
            year: '2021',
            items: [
              {
                title: '虚构演示项目',
                description: '围绕多模态学习与科研知识发现开展系统研究。',
              },
            ],
          },
          {
            year: '2018',
            items: [
              {
                title: '虚构演示荣誉',
                description: '在人工智能与学术计算交叉方向取得持续成果。',
              },
            ],
          },
        ],
      },
    ],
    research_timeline: [],
    letter_index: 'Z',
    subjects: ['计算机科学'],
    subject_codes: ['computer-science'],
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
  },
  {
    id: 'mock-scholar-b',
    name: '示例学者乙',
    avatar: null,
    college: ['生命科学学院'],
    title: '示例职称',
    lab: '计算生物演示实验室',
    lab_slug: 'mock-scholar-b-lab',
    office: '示例校区 B202',
    email: 'scholar.b@example.edu',
    phone: null,
    bio: '这是一条不对应任何真实人物或机构的虚构演示资料。',
    join_year: 2018,
    research_directions: [
      {
        name: 'RNA 剪接调控',
        description: '研究真核转录后加工、剪接异质性与时空组织机制。',
      },
      {
        name: '单分子成像',
        description: '利用高时空分辨成像技术观测转录与 RNA 加工过程。',
      },
    ],
    education: [
      {
        school: '示例大学',
        degree: '博士',
        period: '2009 - 2013',
      },
      {
        school: '示例学院',
        degree: '学士',
        period: '2005 - 2009',
      },
    ],
    achievements: [
      {
        phase: 'current',
        label: '代表成果',
        years: [
          {
            year: '2024',
            items: [
              {
                title: 'RNA 剪接动态研究',
                description: '探索剪接时空调控、基因表达偶联与活细胞观测的新方法。',
              },
            ],
          },
        ],
      },
    ],
    research_timeline: [],
    letter_index: 'L',
    subjects: ['医学'],
    subject_codes: ['medicine'],
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
  },
  {
    id: 'mock-scholar-c',
    name: '示例学者丙',
    avatar: null,
    college: ['理学院'],
    title: '示例职称',
    lab: '可靠系统演示实验室',
    lab_slug: 'mock-scholar-c-lab',
    office: '示例校区 C303',
    email: 'scholar.c@example.edu',
    phone: null,
    bio: '这是一条不对应任何真实人物或机构的虚构演示资料。',
    join_year: 2016,
    research_directions: [
      {
        name: '程序分析',
        description: '面向大型代码库的静态分析、缺陷定位与自动修复。',
      },
      {
        name: '软件可靠性',
        description: '关注复杂系统中的可观测性、测试策略与风险治理。',
      },
    ],
    education: [
      {
        school: '示例大学',
        degree: '博士',
        period: '2008 - 2012',
      },
      {
        school: '示例学院',
        degree: '学士',
        period: '2004 - 2008',
      },
    ],
    achievements: [
      {
        phase: 'current',
        label: '项目经历',
        years: [
          {
            year: '2022',
            items: [
              {
                title: '企业级代码质量平台',
                description: '构建跨语言质量扫描与研发效能可视化能力。',
              },
            ],
          },
        ],
      },
    ],
    research_timeline: [],
    letter_index: 'W',
    subjects: ['物理学'],
    subject_codes: ['physics'],
    createdAt: '2026-03-03T00:00:00.000Z',
    updatedAt: '2026-03-03T00:00:00.000Z',
  },
]

const applyScholarFilters = (
  scholars: ScholarResponse[],
  params?: {
    q?: string
    college?: string
    subject?: string
    subject_id?: string
    letter?: string
    limit?: number
    offset?: number
  },
): ScholarListResponse => {
  const keyword = params?.q?.trim().toLowerCase() ?? ''
  const filtered = scholars.filter((scholar) => {
    const matchesKeyword = !keyword ||
      scholar.name.toLowerCase().includes(keyword) ||
      (scholar.bio ?? '').toLowerCase().includes(keyword) ||
      scholar.research_directions.some((item) => item.name.toLowerCase().includes(keyword))
    const matchesCollege = !params?.college || scholar.college.includes(params.college)
    const selectedMockSubject = params?.subject_id?.startsWith('mock-subject:')
      ? decodeURIComponent(params.subject_id.slice('mock-subject:'.length))
      : params?.subject
    const matchesSubject = !selectedMockSubject || scholar.subjects.includes(selectedMockSubject)
    const matchesLetter = !params?.letter || scholar.letter_index === params.letter

    return matchesKeyword && matchesCollege && matchesSubject && matchesLetter
  })

  const offset = params?.offset ?? 0
  const limit = params?.limit ?? filtered.length

  return {
    items: filtered.slice(offset, offset + limit),
    total: filtered.length,
  }
}

const getMockScholarById = (id: string): ScholarResponse => {
  return MOCK_SCHOLARS.find((item) => item.id === id) ?? MOCK_SCHOLARS[0]
}

export async function listScholars(params?: {
  q?: string
  college?: string
  subject?: string
  subject_id?: string
  letter?: string
  institution_slug?: string
  limit?: number
  offset?: number
}): Promise<ScholarListResponse> {
  try {
    const response = await apiClient.get<ScholarListResponse>('/scholars', { params })
    return response.data
  } catch (error) {
    if (isDevAuthBypassEnabled) {
      return applyScholarFilters(MOCK_SCHOLARS, params)
    }
    throw error
  }
}

const buildMockScholarFacets = (params?: {
  q?: string
  college?: string
  subject_id?: string
  letter?: string
}): ScholarFacets => {
  const subjectScholars = applyScholarFilters(MOCK_SCHOLARS, {
    ...params,
    subject_id: undefined,
  }).items
  const collegeScholars = applyScholarFilters(MOCK_SCHOLARS, {
    ...params,
    college: undefined,
  }).items
  const letterScholars = applyScholarFilters(MOCK_SCHOLARS, {
    ...params,
    letter: undefined,
  }).items
  const subjectCounts = new Map<string, number>()
  const colleges = new Set<string>()
  const letters = new Set<string>()
  for (const scholar of subjectScholars) {
    for (const subject of scholar.subjects) {
      subjectCounts.set(subject, (subjectCounts.get(subject) ?? 0) + 1)
    }
  }
  collegeScholars.forEach((scholar) => scholar.college.forEach((college) => colleges.add(college)))
  letterScholars.forEach((scholar) => {
    if (scholar.letter_index) letters.add(scholar.letter_index)
  })
  return {
    subjects: [...subjectCounts.entries()].map(([name, count]) => ({
      id: `mock-subject:${encodeURIComponent(name)}`,
      code: `mock-${encodeURIComponent(name)}`,
      parentId: null,
      nameZh: name,
      nameEn: null,
      count,
    })),
    colleges: [...colleges].sort((left, right) => left.localeCompare(right, 'zh-CN')),
    letters: [...letters].sort(),
  }
}

export async function getScholarFacets(params?: {
  q?: string
  college?: string
  subject_id?: string
  letter?: string
  institution_slug?: string
}): Promise<ScholarFacets> {
  try {
    const response = await apiClient.get<ScholarFacetsResponse>('/v1/scholars/facets', { params })
    return response.data.data
  } catch (error) {
    if (isDevAuthBypassEnabled) {
      return buildMockScholarFacets(params)
    }
    throw error
  }
}

export async function getScholar(id: string): Promise<ScholarResponse> {
  try {
    const response = await apiClient.get<ScholarResponse>(`/scholars/${id}`)
    return response.data
  } catch (error) {
    if (isDevAuthBypassEnabled) {
      return getMockScholarById(id)
    }
    throw error
  }
}

export async function createTimelineGeneration(
  scholarId: string,
  idempotencyKey: string,
  force = false,
): Promise<TimelineGeneration> {
  const response = await apiClient.post<TimelineGenerationResponse>(
    `/v1/scholars/${scholarId}/research-timeline/generations`,
    { force },
    { headers: { 'Idempotency-Key': idempotencyKey }, timeout: 60_000 },
  )
  return response.data.data
}

export async function getTimelineGeneration(
  scholarId: string,
  generationId: string,
  signal?: AbortSignal,
): Promise<TimelineGeneration> {
  const response = await apiClient.get<TimelineGenerationResponse>(
    `/v1/scholars/${scholarId}/research-timeline/generations/${generationId}`,
    { signal },
  )
  return response.data.data
}

export async function startTimelineGeneration(
  scholarId: string,
  generationId: string,
): Promise<TimelineGeneration> {
  const response = await apiClient.post<TimelineGenerationResponse>(
    `/v1/scholars/${scholarId}/research-timeline/generations/${generationId}/start`,
    {},
  )
  return response.data.data
}

export async function publishTimelineGeneration(
  scholarId: string,
  generationId: string,
  notes = '',
): Promise<TimelineGeneration> {
  const response = await apiClient.post<TimelineGenerationResponse>(
    `/v1/scholars/${scholarId}/research-timeline/generations/${generationId}/publish`,
    notes.trim() ? { notes: notes.trim() } : {},
  )
  return response.data.data
}

export async function rejectTimelineGeneration(
  scholarId: string,
  generationId: string,
  notes = '',
): Promise<TimelineGeneration> {
  const response = await apiClient.post<TimelineGenerationResponse>(
    `/v1/scholars/${scholarId}/research-timeline/generations/${generationId}/reject`,
    notes.trim() ? { notes: notes.trim() } : {},
  )
  return response.data.data
}

export async function listTimelineGenerations(params: {
  status?: TimelineGenerationStatus
  limit?: number
  offset?: number
} = {}): Promise<{ items: TimelineGeneration[]; total: number }> {
  const response = await apiClient.get<TimelineGenerationListResponse>(
    '/v1/scholar-timeline/generations',
    { params },
  )
  return response.data.data
}
