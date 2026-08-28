import process from 'node:process'
import { buildApp } from '../app'
import { refreshPaperSearchIndex } from '../routes/papers/paper-index'
import { getConfiguredInstitution } from '../utils/institution-scope'

const DRY_RUN_FLAG = '--dry-run'
const isDryRun = process.argv.includes(DRY_RUN_FLAG)
const app = buildApp({ logger: false })

const summary = {
  papers: 0,
  indexed: 0,
  removed: 0,
  stale: 0,
  failed: 0,
  chunks: 0,
  fullText: 0,
}

const logProgress = (processed: number, total: number): void => {
  if (processed % 100 === 0 || processed === total) {
    console.log(`Processed ${processed}/${total} papers`)
  }
}

const main = async (): Promise<void> => {
  await app.ready()
  const institution = await getConfiguredInstitution(app)
  const papers = await app.prisma.papers.findMany({
    where: {
      claims: {
        some: {
          institutionId: institution.id,
          review_case: { status: 'approved' },
        },
      },
    },
    select: { id: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  summary.papers = papers.length

  console.log(
    `Starting paper search index generation for ${institution.slug}${isDryRun ? ' (dry run)' : ''}`,
  )
  if (isDryRun) {
    console.log(JSON.stringify({ dryRun: true, summary }, null, 2))
    return
  }

  for (let index = 0; index < papers.length; index++) {
    const paper = papers[index]
    try {
      const result = await refreshPaperSearchIndex(app, paper.id)
      summary[result.status] += 1
      summary.chunks += result.chunks
      if (result.fullTextIndexed) {
        summary.fullText += 1
      }
    } catch (error) {
      summary.failed += 1
      console.warn(`Failed to index paper ${paper.id}`)
      console.warn(error)
    }
    logProgress(index + 1, papers.length)
  }

  console.log(JSON.stringify({ dryRun: false, summary }, null, 2))
  if (summary.failed > 0) {
    process.exitCode = 1
  }
}

main()
  .catch((error) => {
    console.error('Paper search index generation failed')
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await app.close()
  })
