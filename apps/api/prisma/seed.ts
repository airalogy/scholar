import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from './generated/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcrypt'
import { buildPaperEmbeddingText, buildTsvText, splitText } from '../src/utils/document'
import { requireNormalizedDoi } from '../src/utils/doi'
import { assertDestructiveSeedAllowed } from '../src/utils/seed-safety'
import { createDegreeThesisRecordCode } from '../src/routes/v1/theses/record-code'
import { replaceScholarSubjectLinks, resolveAcademicSubjects } from '../src/utils/academic-subjects'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL 环境变量未设置')
}

assertDestructiveSeedAllowed(process.env.ALLOW_DESTRUCTIVE_SEED)

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

const buildLabSlug = (name: string): string => {
  return name.trim().toLowerCase().replace(/[/_]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-')
}

const buildInstitutionSlug = (name: string): string => buildLabSlug(name)

const SEED_AVATAR_ASSETS = [
  { filename: 'zhang-wei.jpg', storageKey: 'scholar/avatars/demo/zhang-wei.jpg' },
  { filename: 'li-na.jpg', storageKey: 'scholar/avatars/demo/li-na.jpg' },
  { filename: 'wang-qiang.jpg', storageKey: 'scholar/avatars/demo/wang-qiang.jpg' },
]

const installSeedAvatarAssets = async (): Promise<void> => {
  if ((process.env.STORAGE_PROVIDER ?? 'local') !== 'local') {
    console.warn('  跳过演示头像安装：种子头像仅支持本地存储')
    return
  }

  const sourceDirectory = fileURLToPath(new URL('./seed-assets/scholar-avatars/', import.meta.url))
  const storageDirectory = path.resolve(
    process.cwd(),
    process.env.LOCAL_STORAGE_DIR ?? 'data/uploads',
  )

  for (const asset of SEED_AVATAR_ASSETS) {
    const targetPath = path.join(storageDirectory, asset.storageKey)
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.copyFile(path.join(sourceDirectory, asset.filename), targetPath)
  }

  console.log(`  安装 ${SEED_AVATAR_ASSETS.length} 个虚构学者演示头像`)
}

const installCoreAcademicSubjects = async (): Promise<void> => {
  const sql = await fs.readFile(new URL('./core-academic-subjects.sql', import.meta.url), 'utf8')
  await prisma.$executeRawUnsafe(sql)
}

const processEmbeddings = async (
  paperId: string,
  title: string,
  abstract: string | null,
  now: Date,
) => {
  const text = buildPaperEmbeddingText(title, abstract)
  if (!text) {
    return
  }

  const chunks = await splitText(text)

  for (let i = 0; i < chunks.length; i++) {
    const tsvString = buildTsvText(chunks[i])

    await prisma.$executeRawUnsafe(
      `INSERT INTO embeddings ("paperId", "segmentIndex", text, embedding, "createdAt", tsv)
       VALUES ($1, $2, $3, NULL, $4, to_tsvector('simple', $5))
       ON CONFLICT ("paperId", "segmentIndex") DO UPDATE
       SET text = EXCLUDED.text, embedding = EXCLUDED.embedding, tsv = EXCLUDED.tsv`,
      paperId,
      i,
      chunks[i],
      now,
      tsvString,
    )
  }
}

const SEED_USERS = [
  {
    email: 'alice@example.com',
    username: 'alice',
    name: 'Alice',
    password: '123456',
    laboratory: '人工智能实验室',
    degree: '博士研究生',
    major: '计算机科学与技术',
    research_interests: '多模态大模型、学术检索与知识增强生成',
  },
  {
    email: 'admin@example.com',
    username: 'admin',
    name: 'Admin',
    password: 'admin123',
    platform_role: 'platform_admin',
  },
  {
    email: 'bob@example.com',
    username: 'bob',
    name: 'Bob',
    password: '123456',
    laboratory: '人工智能实验室',
    degree: '硕士研究生',
    major: '人工智能',
    research_interests: '检索增强生成、知识图谱与评测体系',
  },
  {
    email: 'carol@example.com',
    username: 'carol',
    name: 'Carol',
    password: '123456',
    laboratory: '数据科学与大数据实验室',
    degree: '博士后',
    major: '数据科学',
    research_interests: '图数据挖掘、学术推荐与大规模分析',
  },
  {
    email: 'david@example.com',
    username: 'david',
    name: 'David',
    password: '123456',
    laboratory: '软件工程与系统实验室',
    degree: '硕士研究生',
    major: '软件工程',
    research_interests: '程序分析、软件质量与工程智能体',
  },
]

const SEED_INSTITUTIONS = [
  {
    name: '示例大学',
    website: 'https://example.edu',
    summary: '用于开发和测试机构主页、论文审核和学者资料联动的虚构机构。',
  },
  {
    name: '示例研究院',
    website: 'https://research.example.edu',
    summary: '用于开发和测试跨机构联合认领同一论文场景的虚构研究机构。',
  },
]

const SEED_LABS = [
  {
    institution_name: '示例大学',
    name: '人工智能实验室',
    college: '计算机科学与技术学院',
    location: '理科楼A305',
    website: 'https://example.edu/labs/ai',
    summary:
      '面向学术检索、智能问答与多模态理解构建基础模型与应用系统，持续推进检索增强生成、学术知识组织与科研效率工具研发。',
  },
  {
    institution_name: '示例大学',
    name: '数据科学与大数据实验室',
    college: '信息科学与工程学院',
    location: '信息楼B208',
    website: 'https://example.edu/labs/data',
    summary: '聚焦大规模数据处理、知识图谱与推荐系统，强调从学术数据到服务系统的全链路建模与落地。',
  },
  {
    institution_name: '示例大学',
    name: '软件工程与系统实验室',
    college: '软件学院',
    location: '软件楼C412',
    website: 'https://example.edu/labs/se',
    summary: '围绕软件工程、程序分析与形式化方法开展研究，关注高可靠科研平台与智能软件系统的构建。',
  },
]

const SEED_OSS_FILE = {
  id: '11111111-1111-4111-8111-111111111111',
  original_name: 'demo-paper-001.pdf',
  prefix: 'scholar/papers',
  ext: '.pdf',
  mime_type: 'application/pdf',
  file_size: 0,
  hash: 'seed-demo-paper-001-pdf',
}

const SEED_OSS_FILE_2 = {
  id: 'b96424e1-9eea-45e2-9a95-c3df5b6e8d33',
  original_name: 'demo-paper-002.pdf',
  prefix: 'scholar/papers',
  ext: '.pdf',
  mime_type: 'application/pdf',
  file_size: 0,
  hash: 'seed-demo-paper-002-pdf',
}

const SEED_PAPERS = [
  {
    title: 'Demonstration Study on Retrieval-Assisted Scholarly Search',
    abstract:
      'This paper studies retrieval-augmented generation methods for knowledge-intensive tasks.',
    doi: '10.0000/scholar-demo-001',
    journal_name: 'Example Journal',
    publish_year: 2024,
    paper_type: 1,
    language: 1,
    citation_count: 128,
    pages: '1-18',
    keywords: ['RAG', 'NLP', 'LLM'],
    authors: [
      { name: 'Demo Author A', email: 'author.a@example.com' },
      { name: 'Demo Author B', email: 'author.b@example.com' },
      { name: 'Demo Author C', email: 'author.c@example.com' },
    ],
  },
  {
    title: 'Demonstration Methods for Academic Discovery Systems',
    abstract: 'An overview of LLM applications in academic search, ranking, and recommendation.',
    doi: '10.0000/scholar-demo-002',
    journal_name: 'Example Journal',
    publish_year: 2024,
    paper_type: 2,
    language: 1,
    citation_count: 64,
    pages: '19-33',
    keywords: ['Scholarly Search', 'Recommendation', 'LLM'],
    authors: [
      { name: 'Demo Author D', email: 'author.d@example.com' },
      { name: 'Demo Author E', email: 'author.e@example.com' },
    ],
  },
  {
    title: 'Demonstration Models for Structured Document Analysis',
    abstract:
      'This paper explores cutting-edge machine learning approaches for automatic document analysis and understanding.',
    doi: '10.0000/scholar-demo-003',
    journal_name: 'Example Journal',
    publish_year: 2024,
    paper_type: 1,
    language: 1,
    citation_count: 32,
    pages: '34-50',
    keywords: ['Machine Learning', 'Document Analysis', 'AI'],
    authors: [
      { name: 'Demo Author F', email: 'author.f@example.com' },
      { name: 'Demo Author G', email: 'author.g@example.com' },
    ],
  },
]

const SEED_LAB_MEMBERSHIPS = [
  { username: 'alice', lab_name: '人工智能实验室', role: 'owner' },
  { username: 'bob', lab_name: '人工智能实验室', role: 'admin' },
  { username: 'carol', lab_name: '数据科学与大数据实验室', role: 'owner' },
  { username: 'david', lab_name: '软件工程与系统实验室', role: 'owner' },
]

const SEED_INSTITUTION_MEMBERSHIPS = [
  { username: 'alice', institution_name: '示例大学', role: 'owner' },
  { username: 'bob', institution_name: '示例大学', role: 'admin' },
  { username: 'carol', institution_name: '示例大学', role: 'admin' },
  { username: 'david', institution_name: '示例大学', role: 'admin' },
  { username: 'admin', institution_name: '示例研究院', role: 'owner' },
]

const SEED_PAPER_CLAIMS = [
  {
    paper_title: 'Demonstration Study on Retrieval-Assisted Scholarly Search',
    username: 'alice',
    institution_name: '示例大学',
    lab_name: '人工智能实验室',
    reviewStatus: 'approved',
  },
  {
    paper_title: 'Demonstration Study on Retrieval-Assisted Scholarly Search',
    username: 'admin',
    institution_name: '示例研究院',
    reviewStatus: 'approved',
  },
  {
    paper_title: 'Demonstration Methods for Academic Discovery Systems',
    username: 'carol',
    institution_name: '示例大学',
    lab_name: '数据科学与大数据实验室',
    reviewStatus: 'approved',
  },
  {
    paper_title: 'Demonstration Models for Structured Document Analysis',
    username: 'david',
    institution_name: '示例大学',
    lab_name: '软件工程与系统实验室',
    reviewStatus: 'pending_review',
  },
]

const SEED_SCHOLARS = [
  {
    name: '示例学者甲',
    avatar: 'scholar/avatars/demo/zhang-wei.jpg',
    college: ['计算机科学与技术学院'],
    title: '教授',
    lab: '人工智能实验室',
    office: '理科楼A305',
    email: 'scholar.a@example.edu',
    phone: '010-12345678',
    bio: '主要从事人工智能、机器学习、深度学习等领域的研究工作，在计算机视觉和自然语言处理方面有重要贡献。',
    join_year: 2015,
    research_directions: [
      { name: '人工智能', description: '' },
      { name: '机器学习', description: '' },
      { name: '深度学习', description: '' },
      { name: '计算机视觉', description: '' },
      { name: '自然语言处理', description: '' },
    ],
    education: [
      { degree: '博士', school: '示例大学', period: '2010' },
      { degree: '硕士', school: '示例学院', period: '2007' },
      { degree: '学士', school: '示例学院', period: '2005' },
    ],
    achievements: [
      {
        phase: 'current',
        label: '代表成果',
        years: [
          {
            year: '综合',
            items: [
              { title: '虚构学术荣誉 A', description: '' },
              { title: '虚构学术荣誉 B', description: '' },
              { title: '发表顶级论文100余篇', description: '' },
              { title: '指导博士生30余名', description: '' },
            ],
          },
        ],
      },
    ],
    letter_index: 'Z',
    subject_codes: ['computer-science', 'artificial-intelligence', 'machine-learning'],
  },
  {
    name: '示例学者乙',
    avatar: 'scholar/avatars/demo/li-na.jpg',
    college: ['信息科学与工程学院'],
    title: '副教授',
    lab: '数据科学与大数据实验室',
    office: '信息楼B208',
    email: 'scholar.b@example.edu',
    phone: '010-87654321',
    bio: '专注于数据挖掘、大数据分析、知识图谱等研究方向，在数据科学领域具有重要影响力。',
    join_year: 2018,
    research_directions: [
      { name: '数据挖掘', description: '' },
      { name: '大数据分析', description: '' },
      { name: '知识图谱', description: '' },
      { name: '数据库系统', description: '' },
    ],
    education: [
      { degree: '博士', school: '示例大学', period: '2013' },
      { degree: '硕士', school: '示例学院', period: '2010' },
      { degree: '学士', school: '示例学院', period: '2008' },
    ],
    achievements: [
      {
        phase: 'current',
        label: '代表成果',
        years: [
          {
            year: '综合',
            items: [
              { title: '虚构学术荣誉 C', description: '' },
              { title: '发表CCF A类论文50余篇', description: '' },
              { title: '主持国家自然科学基金项目3项', description: '' },
              { title: '指导硕士生20余名', description: '' },
            ],
          },
        ],
      },
    ],
    letter_index: 'L',
    subject_codes: ['data-science', 'big-data', 'database-systems'],
  },
  {
    name: '示例学者丙',
    avatar: 'scholar/avatars/demo/wang-qiang.jpg',
    college: ['软件学院'],
    title: '教授',
    lab: '软件工程与系统实验室',
    office: '软件楼C412',
    email: 'scholar.c@example.edu',
    phone: '010-11223344',
    bio: '研究兴趣包括软件工程、程序分析、形式化方法等，在软件可靠性和安全性方面有深入研究。',
    join_year: 2016,
    research_directions: [
      { name: '软件工程', description: '' },
      { name: '程序分析', description: '' },
      { name: '形式化方法', description: '' },
      { name: '软件测试', description: '' },
    ],
    education: [
      { degree: '博士', school: '示例大学', period: '2012' },
      { degree: '硕士', school: '示例学院', period: '2009' },
      { degree: '学士', school: '示例学院', period: '2006' },
    ],
    achievements: [
      {
        phase: 'current',
        label: '代表成果',
        years: [
          {
            year: '综合',
            items: [
              { title: '虚构学术荣誉 D', description: '' },
              { title: '发表ICSE、FSE等顶级会议论文30余篇', description: '' },
              { title: '获得软件专利10余项', description: '' },
              { title: '与企业合作项目20余项', description: '' },
            ],
          },
        ],
      },
    ],
    letter_index: 'W',
    subject_codes: ['software-engineering', 'program-analysis', 'formal-methods'],
  },
]

const SEED_DEGREE_THESES = [
  {
    submitted_username: 'alice',
    institution_name: '示例大学',
    institution_reference: 'DEMO-THESIS-001',
    title: '面向学术知识发现的检索增强生成研究',
    title_en: 'Retrieval-Augmented Generation for Scholarly Knowledge Discovery',
    author_name: '示例学生甲',
    student_id: 'DEV2026001',
    training_unit: '计算机科学与技术学院',
    major: '计算机科学与技术',
    degree_category: '博士',
    award_year: 2026,
    advisors: ['示例学者甲'],
    abstract:
      '本论文围绕科研文献检索、证据组织和可追溯生成开展研究，构建了面向学术知识发现的检索增强生成方法与评测流程。',
    keywords: ['检索增强生成', '学术检索', '知识发现'],
    status: 'approved' as const,
  },
  {
    submitted_username: 'bob',
    institution_name: '示例大学',
    institution_reference: 'DEMO-THESIS-002',
    title: '多模态科研文献理解与知识组织方法',
    title_en: 'Multimodal Scientific Literature Understanding and Knowledge Organization',
    author_name: '示例学生乙',
    student_id: 'DEV2026002',
    training_unit: '信息科学与工程学院',
    major: '人工智能',
    degree_category: '硕士',
    award_year: 2026,
    advisors: ['示例学者乙'],
    abstract:
      '本论文研究文本、图表与结构化元数据的联合建模方法，并探索其在科研文献理解和知识组织中的应用。',
    keywords: ['多模态', '文献理解', '知识组织'],
    status: 'pending_review' as const,
  },
]

const main = async () => {
  console.log('🌱 开始执行数据库初始化...')
  await installSeedAvatarAssets()

  // 清空现有数据
  await prisma.content_review_cases.deleteMany()
  await prisma.forum_likes.deleteMany()
  await prisma.forum_comments.deleteMany()
  await prisma.forum_posts.deleteMany()
  await prisma.user_bookmarks.deleteMany()
  await prisma.chats.deleteMany()
  await prisma.embeddings.deleteMany()
  await prisma.paper_submissions.deleteMany()
  await prisma.paper_claims.deleteMany()
  await prisma.paper_authors.deleteMany()
  await prisma.scholar_papers.deleteMany()
  await prisma.institution_user_provisions.deleteMany()
  await prisma.institution_memberships.deleteMany()
  await prisma.lab_memberships.deleteMany()
  await prisma.labs.deleteMany()
  await prisma.institutions.deleteMany()
  await prisma.scholars.deleteMany()
  await prisma.authors.deleteMany()
  await prisma.papers.deleteMany()
  await prisma.oss_files.deleteMany()
  await prisma.users.deleteMany()
  await installCoreAcademicSubjects()

  const createdUsers: { id: string; username: string }[] = []
  const createdScholars: { id: string; name: string }[] = []

  // 创建示例用户（密码用 bcrypt 加密）
  for (const u of SEED_USERS) {
    const password_hash = await bcrypt.hash(u.password, 10)
    const user = await prisma.users.create({
      data: {
        email: u.email,
        username: u.username,
        name: u.name,
        password_hash,
        laboratory: u.laboratory ?? null,
        degree: u.degree ?? null,
        major: u.major ?? null,
        research_interests: u.research_interests ?? null,
        platform_role: u.platform_role ?? 'member',
      },
    })
    createdUsers.push({ id: user.id, username: user.username })
    console.log(`  创建示例用户 ${u.username}`)
  }

  const uploadUserId = createdUsers[0]?.id
  if (!uploadUserId) {
    throw new Error('未创建可用的种子用户，无法初始化论文数据')
  }

  const now = new Date()
  const adminUserId = createdUsers.find((user) => user.username === 'admin')?.id ?? uploadUserId
  const createdInstitutionIds = new Map<string, string>()
  const createdLabIds = new Map<string, string>()

  for (const institution of SEED_INSTITUTIONS) {
    const createdInstitution = await prisma.institutions.create({
      data: {
        name: institution.name,
        slug: buildInstitutionSlug(institution.name),
        summary: institution.summary,
        website: institution.website,
        createdAt: now,
        updatedAt: now,
      },
    })
    createdInstitutionIds.set(institution.name, createdInstitution.id)
    console.log(`  创建机构 ${institution.name}`)
  }

  for (const lab of SEED_LABS) {
    const createdLab = await prisma.labs.create({
      data: {
        institutionId: createdInstitutionIds.get(lab.institution_name) ?? null,
        name: lab.name,
        slug: buildLabSlug(lab.name),
        summary: lab.summary,
        college: lab.college,
        location: lab.location,
        website: lab.website,
        createdAt: now,
        updatedAt: now,
      },
    })
    createdLabIds.set(lab.name, createdLab.id)
    console.log(`  创建实验室 ${lab.name}`)
  }

  for (const membership of SEED_INSTITUTION_MEMBERSHIPS) {
    const userId = createdUsers.find((user) => user.username === membership.username)?.id
    const institutionId = createdInstitutionIds.get(membership.institution_name)
    if (!userId || !institutionId) {
      continue
    }

    await prisma.institution_memberships.create({
      data: {
        institutionId,
        userId,
        role: membership.role,
        createdAt: now,
        updatedAt: now,
      },
    })
    console.log(
      `  绑定机构成员 ${membership.username} -> ${membership.institution_name} (${membership.role})`,
    )
  }

  for (const membership of SEED_LAB_MEMBERSHIPS) {
    const userId = createdUsers.find((user) => user.username === membership.username)?.id
    const labId = createdLabIds.get(membership.lab_name)
    if (!userId || !labId) {
      continue
    }

    await prisma.lab_memberships.create({
      data: {
        labId,
        userId,
        role: membership.role,
        createdAt: now,
        updatedAt: now,
      },
    })
    console.log(
      `  绑定实验室成员 ${membership.username} -> ${membership.lab_name} (${membership.role})`,
    )
  }

  // 创建学者数据；职称和 PI 身份作为学者属性保留
  for (const p of SEED_SCHOLARS) {
    const subjects = await resolveAcademicSubjects(prisma, {
      codes: p.subject_codes,
    })
    const scholar = await prisma.scholars.create({
      data: {
        name: p.name,
        avatar: p.avatar,
        college: p.college,
        title: p.title,
        lab: p.lab,
        office: p.office,
        email: p.email,
        phone: p.phone,
        bio: p.bio,
        join_year: p.join_year,
        research_directions: p.research_directions,
        education: p.education,
        achievements: p.achievements,
        letter_index: p.letter_index,
        createdAt: now,
        updatedAt: now,
      },
    })
    await replaceScholarSubjectLinks(prisma, scholar.id, subjects, 'seed')
    createdScholars.push({ id: scholar.id, name: scholar.name })
    console.log(`  创建学者 ${p.name}`)
  }
  await prisma.oss_files.create({
    data: {
      id: SEED_OSS_FILE.id,
      original_name: SEED_OSS_FILE.original_name,
      prefix: SEED_OSS_FILE.prefix,
      ext: SEED_OSS_FILE.ext,
      mime_type: SEED_OSS_FILE.mime_type,
      file_size: SEED_OSS_FILE.file_size,
      hash: SEED_OSS_FILE.hash,
      userId: uploadUserId,
      createdAt: now,
    },
  })

  await prisma.oss_files.create({
    data: {
      id: SEED_OSS_FILE_2.id,
      original_name: SEED_OSS_FILE_2.original_name,
      prefix: SEED_OSS_FILE_2.prefix,
      ext: SEED_OSS_FILE_2.ext,
      mime_type: SEED_OSS_FILE_2.mime_type,
      file_size: SEED_OSS_FILE_2.file_size,
      hash: SEED_OSS_FILE_2.hash,
      userId: uploadUserId,
      createdAt: now,
    },
  })

  // 创建示例论文（每篇论文都绑定 OSS PDF 路径）
  const createdPaperIds = new Map<string, string>()
  for (let i = 0; i < SEED_PAPERS.length; i++) {
    const p = SEED_PAPERS[i]
    const normalizedDoi = requireNormalizedDoi(p.doi)

    const paper = await prisma.papers.create({
      data: {
        title: p.title,
        abstract: p.abstract,
        doi: normalizedDoi,
        normalized_doi: normalizedDoi,
        journal_name: p.journal_name,
        publish_year: p.publish_year,
        paper_type: p.paper_type,
        language: p.language,
        citation_count: p.citation_count,
        pages: p.pages,
        keywords: p.keywords,
        createdAt: now,
        updatedAt: now,
      },
    })
    createdPaperIds.set(p.title, paper.id)
    await processEmbeddings(paper.id, paper.title, paper.abstract, now)

    for (let j = 0; j < p.authors.length; j++) {
      const author = p.authors[j]
      const createdAuthor = await prisma.authors.create({
        data: {
          name: author.name,
          email: author.email,
          createdAt: now,
          updatedAt: now,
        },
      })

      await prisma.paper_authors.create({
        data: {
          paperId: paper.id,
          authorId: createdAuthor.id,
          order: j + 1,
        },
      })
    }

    console.log(`  创建论文 ${p.title}`)
  }

  for (const claim of SEED_PAPER_CLAIMS) {
    const paperId = createdPaperIds.get(claim.paper_title)
    const userId = createdUsers.find((user) => user.username === claim.username)?.id
    const institutionId = claim.institution_name
      ? createdInstitutionIds.get(claim.institution_name)
      : undefined
    const labId = claim.lab_name ? (createdLabIds.get(claim.lab_name) ?? null) : null
    const sourcePaper = SEED_PAPERS.find((paper) => paper.title === claim.paper_title)

    if (!paperId || !userId || !institutionId || !sourcePaper) {
      continue
    }

    const submission = await prisma.paper_submissions.create({
      data: {
        paperId,
        claimId: null,
        userId,
        institutionId,
        labId,
        oss_file_id:
          sourcePaper.title === 'Demonstration Models for Structured Document Analysis'
            ? SEED_OSS_FILE_2.id
            : SEED_OSS_FILE.id,
        metadata_snapshot: {
          title: sourcePaper.title,
          abstract: sourcePaper.abstract,
          doi: sourcePaper.doi,
          journal_name: sourcePaper.journal_name,
          publish_year: sourcePaper.publish_year,
          paper_type: sourcePaper.paper_type,
          language: sourcePaper.language,
          citation_count: sourcePaper.citation_count,
          pages: sourcePaper.pages,
          keywords: sourcePaper.keywords,
        },
        notes: null,
        createdAt: now,
        updatedAt: now,
      },
    })

    const claimId = crypto.randomUUID()
    const isApproved = claim.reviewStatus === 'approved'
    const reviewCase = await prisma.content_review_cases.create({
      data: {
        institutionId,
        content_type: 'paper',
        subjectId: claimId,
        currentVersionId: submission.id,
        submittedBy: userId,
        status: isApproved ? 'approved' : 'pending_review',
        decision_notes: null,
        decidedBy: isApproved ? adminUserId : null,
        submittedAt: now,
        decidedAt: isApproved ? now : null,
        createdAt: now,
        updatedAt: now,
      },
    })

    await prisma.paper_claims.create({
      data: {
        id: claimId,
        paperId,
        institutionId,
        labId,
        reviewCaseId: reviewCase.id,
        submittedBy: userId,
        submissionId: submission.id,
        createdAt: now,
        updatedAt: now,
      },
    })
    await prisma.paper_submissions.update({
      where: { id: submission.id },
      data: { claimId, updatedAt: now },
    })
    await prisma.content_review_actions.createMany({
      data: [
        {
          caseId: reviewCase.id,
          institutionId,
          actorId: userId,
          action: 'submitted',
          from_status: 'draft',
          to_status: 'pending_review',
          versionId: submission.id,
          createdAt: now,
        },
        ...(isApproved
          ? [
              {
                caseId: reviewCase.id,
                institutionId,
                actorId: adminUserId,
                action: 'approved',
                from_status: 'pending_review',
                to_status: 'approved',
                versionId: submission.id,
                createdAt: now,
              },
            ]
          : []),
      ],
    })

    console.log(
      `  创建论文认领 ${claim.paper_title} -> ${claim.institution_name}${
        claim.lab_name ? ` / ${claim.lab_name}` : ''
      }`,
    )
  }

  const defaultThesisReviewerId =
    createdUsers.find((user) => user.username === 'alice')?.id ?? adminUserId
  for (const thesisSeed of SEED_DEGREE_THESES) {
    const institutionId = createdInstitutionIds.get(thesisSeed.institution_name)
    const submitterId = createdUsers.find(
      (user) => user.username === thesisSeed.submitted_username,
    )?.id
    if (!institutionId || !submitterId) {
      continue
    }

    const thesisId = crypto.randomUUID()
    const reviewCaseId = crypto.randomUUID()
    const isApproved = thesisSeed.status === 'approved'
    const reviewCase = await prisma.content_review_cases.create({
      data: {
        id: reviewCaseId,
        institutionId,
        content_type: 'degree_thesis',
        subjectId: thesisId,
        submittedBy: submitterId,
        status: thesisSeed.status,
        currentStep: isApproved ? null : 1,
        decidedBy: isApproved ? adminUserId : null,
        submittedAt: now,
        decidedAt: isApproved ? now : null,
        createdAt: now,
        updatedAt: now,
      },
    })
    await prisma.degree_theses.create({
      data: {
        id: thesisId,
        institutionId,
        record_code: createDegreeThesisRecordCode(
          buildInstitutionSlug(thesisSeed.institution_name),
        ),
        institution_reference: thesisSeed.institution_reference,
        submittedBy: submitterId,
        reviewCaseId: reviewCase.id,
        createdAt: now,
        updatedAt: now,
      },
    })
    const version = await prisma.degree_thesis_versions.create({
      data: {
        thesisId,
        version_number: 1,
        title: thesisSeed.title,
        title_en: thesisSeed.title_en,
        author_name: thesisSeed.author_name,
        student_id: thesisSeed.student_id,
        training_unit: thesisSeed.training_unit,
        major: thesisSeed.major,
        degree_category: thesisSeed.degree_category,
        award_year: thesisSeed.award_year,
        advisors: thesisSeed.advisors,
        abstract: thesisSeed.abstract,
        keywords: thesisSeed.keywords,
        language: 'zh-CN',
        visibility: 'public',
        createdBy: submitterId,
        createdAt: now,
        submittedAt: now,
      },
    })
    const step = await prisma.content_review_step_instances.create({
      data: {
        caseId: reviewCase.id,
        institutionId,
        step_order: 1,
        step_name: '学位论文发布审核',
        status: isApproved ? 'approved' : 'pending',
        resolver_type: 'institution_role',
        resolver_config: { roles: ['owner', 'admin'] },
        eligible_reviewer_user_ids: [defaultThesisReviewerId],
        reviewedBy: isApproved ? adminUserId : null,
        reviewedAt: isApproved ? now : null,
        createdAt: now,
        updatedAt: now,
      },
    })
    await Promise.all([
      prisma.degree_theses.update({
        where: { id: thesisId },
        data: {
          currentVersionId: version.id,
          publishedVersionId: isApproved ? version.id : null,
          publishedAt: isApproved ? now : null,
          updatedAt: now,
        },
      }),
      prisma.content_review_cases.update({
        where: { id: reviewCase.id },
        data: { currentVersionId: version.id, updatedAt: now },
      }),
      prisma.content_review_actions.createMany({
        data: [
          {
            caseId: reviewCase.id,
            institutionId,
            actorId: submitterId,
            action: 'draft_created',
            to_status: 'draft',
            versionId: version.id,
            createdAt: now,
          },
          {
            caseId: reviewCase.id,
            institutionId,
            actorId: submitterId,
            action: 'submitted',
            from_status: 'draft',
            to_status: 'pending_review',
            versionId: version.id,
            createdAt: now,
          },
          ...(isApproved
            ? [
                {
                  caseId: reviewCase.id,
                  institutionId,
                  stepId: step.id,
                  step_order: 1,
                  step_name: step.step_name,
                  actorId: adminUserId,
                  action: 'approved',
                  from_status: 'pending_review',
                  to_status: 'approved',
                  versionId: version.id,
                  createdAt: now,
                },
              ]
            : []),
        ],
      }),
    ])
    console.log(`  创建学位论文 ${thesisSeed.title} (${thesisSeed.status})`)
  }

  // 创建学者与论文的关联关系
  for (let i = 0; i < createdScholars.length; i++) {
    const scholar = createdScholars[i]

    // 为每个学者分配 1-2 篇代表性论文
    const paperIndices = []
    if (i === 0) {
      paperIndices.push(0, 1) // 示例学者甲分配前两篇论文
    } else if (i === 1) {
      paperIndices.push(1, 2) // 示例学者乙分配第 2、3 篇论文
    } else {
      paperIndices.push(0, 2) // 示例学者丙分配第 1、3 篇论文
    }

    for (let j = 0; j < paperIndices.length; j++) {
      const paperIndex = paperIndices[j]
      const paper = await prisma.papers.findFirst({
        where: { title: SEED_PAPERS[paperIndex].title },
      })

      if (paper) {
        await prisma.scholar_papers.create({
          data: {
            scholarId: scholar.id,
            paperId: paper.id,
            is_representative: j === 0, // 第一篇作为代表性论文
            display_order: j + 1,
          },
        })
        console.log(`  关联学者 ${scholar.name} 与论文 ${paper.title}`)
      }
    }
  }

  console.log('✅ 数据库初始化完成')
}

main()
  .catch((e) => {
    console.error('❌ 初始化失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
