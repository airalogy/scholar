import crypto from 'node:crypto'
import path from 'node:path'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Prisma } from '../../../prisma/generated/client'
import { buildObjectKey } from '../../utils/oss'
import { applyPdfWatermark } from '../../utils/pdf-watermark'
import {
  PROTECTED_FILE_SECURITY_PROFILE,
  STANDARD_FILE_SECURITY_PROFILE,
  buildProtectedFileAccessUrls,
  isProtectedSecurityProfile,
  verifyProtectedFileAccessToken,
} from '../../utils/protected-files'
import { guessContentTypeFromKey } from '../../utils/content-type'
import { assertCanReviewPaperClaim } from '../../utils/permissions'
import { verifySignedStorageAccessToken } from '../../utils/storage-access'
import { assertTokenUserExists } from '../../utils/auth'
import { getInstitutionAccessById } from '../../utils/permissions'
import { lockMutationScope } from '../../utils/advisory-lock'

const DOWNLOAD_LIMIT_PER_10_MINUTES = 20
const DOWNLOAD_LIMIT_PER_DAY = 100
const TEN_MINUTES_IN_MS = 10 * 60 * 1000
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000

interface UploadOssFileOptions {
  purpose: 'paper' | 'thesis' | 'avatar'
  institutionId?: string | null
}

const PAPER_UPLOAD_LIMIT = 25 * 1024 * 1024
const AVATAR_UPLOAD_LIMIT = 5 * 1024 * 1024
const USER_STORAGE_LIMIT = 500 * 1024 * 1024
const USER_FILE_COUNT_LIMIT = 100
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

const isPdfBuffer = (buffer: Buffer): boolean => {
  return buffer.subarray(0, 5).toString('ascii') === '%PDF-'
}

const isSupportedImageBuffer = (buffer: Buffer): boolean => {
  const isPng =
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const isJpeg =
    buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  const isGif =
    buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))
  const isWebp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  return isPng || isJpeg || isGif || isWebp
}

const resolveUploadPolicy = async (
  fastify: FastifyInstance,
  userId: string,
  fileBuffer: Buffer,
  mimeType: string,
  options: UploadOssFileOptions,
): Promise<{ prefix: string; securityProfile: string; institutionId: string | null }> => {
  if (fileBuffer.length === 0) {
    throw fastify.httpErrors.badRequest('Uploaded file is empty')
  }

  if (options.purpose === 'paper' || options.purpose === 'thesis') {
    const institutionId = options.institutionId?.trim() ?? ''
    if (!UUID_RE.test(institutionId)) {
      throw fastify.httpErrors.badRequest('A valid institution_id is required for document uploads')
    }
    const access = await getInstitutionAccessById(fastify, userId, institutionId)
    if (access.platform_role !== 'platform_admin' && access.institution_role === null) {
      throw fastify.httpErrors.forbidden('You can only upload documents for your institution')
    }
    if (fileBuffer.length > PAPER_UPLOAD_LIMIT) {
      throw fastify.httpErrors.payloadTooLarge('Document files must not exceed 25 MB')
    }
    if (mimeType !== 'application/pdf' || !isPdfBuffer(fileBuffer)) {
      throw fastify.httpErrors.unsupportedMediaType('Document uploads must be valid PDF files')
    }
    return {
      prefix: options.purpose === 'thesis' ? 'scholar/theses' : 'scholar/papers',
      securityProfile: PROTECTED_FILE_SECURITY_PROFILE,
      institutionId,
    }
  }

  if (fileBuffer.length > AVATAR_UPLOAD_LIMIT) {
    throw fastify.httpErrors.payloadTooLarge('Avatar files must not exceed 5 MB')
  }
  if (!mimeType.startsWith('image/') || !isSupportedImageBuffer(fileBuffer)) {
    throw fastify.httpErrors.unsupportedMediaType(
      'Avatar uploads must be valid PNG, JPEG, GIF, or WebP images',
    )
  }
  return {
    prefix: 'scholar/avatars',
    securityProfile: STANDARD_FILE_SECURITY_PROFILE,
    institutionId: null,
  }
}

const assertWithinStorageQuota = async (
  fastify: FastifyInstance,
  client: Pick<Prisma.TransactionClient, 'oss_files'>,
  userId: string,
  incomingSize: number,
): Promise<void> => {
  const [totals, count] = await Promise.all([
    client.oss_files.aggregate({
      where: { userId },
      _sum: { file_size: true },
    }),
    client.oss_files.count({ where: { userId } }),
  ])

  if (
    count >= USER_FILE_COUNT_LIMIT ||
    (totals._sum.file_size ?? 0) + incomingSize > USER_STORAGE_LIMIT
  ) {
    throw fastify.httpErrors.payloadTooLarge('User file storage quota exceeded')
  }
}

const isPdfFile = (mimeType: string, ext: string): boolean => {
  return mimeType === 'application/pdf' || ext.toLocaleLowerCase() === '.pdf'
}

const sanitizeAscii = (value?: string | null): string => {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const buildDownloadFilename = (filename: string): string => {
  const asciiName = sanitizeAscii(filename).replace(/[/\\?%*:|"<>]/g, '_')
  return asciiName || 'download.pdf'
}

const buildContentDisposition = (mode: 'preview' | 'download', filename: string): string => {
  const disposition = mode === 'download' ? 'attachment' : 'inline'
  const safeFilename = buildDownloadFilename(filename)
  return `${disposition}; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

const getClientIp = (request: FastifyRequest): string | null => {
  // Fastify resolves trusted proxy headers into request.ip. Reading
  // x-forwarded-for directly would let an untrusted client spoof audit logs.
  return request.ip ?? null
}

const resolveProtectedFileContext = async (fastify: FastifyInstance, fileId: string) => {
  const [submission, thesisVersions] = await Promise.all([
    fastify.prisma.paper_submissions.findFirst({
      where: { oss_file_id: fileId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    }),
    fastify.prisma.degree_thesis_versions.findMany({
      where: { fileId },
      orderBy: [{ version_number: 'desc' }, { createdAt: 'desc' }],
      include: {
        thesis: {
          include: {
            review_case: { include: { steps: true } },
          },
        },
      },
    }),
  ])

  const claim = submission?.claimId
    ? await fastify.prisma.paper_claims.findUnique({
        where: { id: submission.claimId },
        include: { review_case: true },
      })
    : null

  return {
    submission,
    claim,
    thesisVersions,
  }
}

const assertCanAccessProtectedOssFile = async (
  fastify: FastifyInstance,
  userId: string,
  fileId: string,
) => {
  const ossFile = await fastify.prisma.oss_files.findUnique({
    where: { id: fileId },
  })
  if (!ossFile) {
    throw fastify.httpErrors.notFound('File not found')
  }

  const { submission, claim, thesisVersions } = await resolveProtectedFileContext(fastify, fileId)

  if (ossFile.prefix === 'scholar/theses' && thesisVersions.length > 0) {
    const platformRole = await fastify.prisma.users.findUnique({
      where: { id: userId },
      select: { platform_role: true },
    })
    let permittedVersion = null
    for (const thesisVersion of thesisVersions) {
      const thesis = thesisVersion.thesis
      const reviewCase = thesis.review_case
      const institutionAccess = await getInstitutionAccessById(
        fastify,
        userId,
        thesis.institutionId,
      )
      const currentStep = reviewCase.steps.find(
        (step) => step.step_order === reviewCase.currentStep && step.status === 'pending',
      )
      const reviewerPrivileged =
        reviewCase.status === 'pending_review' &&
        (currentStep
          ? currentStep.eligible_reviewer_user_ids.includes(userId)
          : institutionAccess.can_review_content)
      const privileged =
        thesis.submittedBy === userId ||
        platformRole?.platform_role === 'platform_admin' ||
        institutionAccess.can_edit_content ||
        reviewerPrivileged
      const isPublished = thesis.publishedVersionId === thesisVersion.id
      const isConfidential = Boolean(
        thesisVersion.confidentiality_until &&
        thesisVersion.confidentiality_until.getTime() > Date.now(),
      )
      const visibleToInstitution =
        thesisVersion.visibility === 'institution' && institutionAccess.institution_role !== null
      const visiblePublished =
        isPublished &&
        !isConfidential &&
        (thesisVersion.visibility === 'public' || visibleToInstitution)
      if (privileged || visiblePublished) {
        permittedVersion = thesisVersion
        break
      }
    }
    if (!permittedVersion) {
      throw fastify.httpErrors.forbidden('You do not have permission to access this thesis file')
    }
    return {
      ossFile,
      submission: null,
      claim: null,
      thesisVersion: permittedVersion,
    }
  }

  if (!submission) {
    if (ossFile.userId === userId) {
      return {
        ossFile,
        submission: null,
        claim: null,
        thesisVersion: null,
      }
    }

    throw fastify.httpErrors.forbidden('You do not have permission to access this file')
  }

  if (!claim && submission.userId === userId) {
    return {
      ossFile,
      submission,
      claim: null,
      thesisVersion: null,
    }
  }

  if (!claim) {
    throw fastify.httpErrors.forbidden('This file is not publicly available yet')
  }

  if (claim.review_case.status === 'approved') {
    return {
      ossFile,
      submission,
      claim,
      thesisVersion: null,
    }
  }

  if (submission.userId === userId || claim.submittedBy === userId) {
    return {
      ossFile,
      submission,
      claim,
      thesisVersion: null,
    }
  }

  await assertCanReviewPaperClaim(fastify, userId, claim)

  return {
    ossFile,
    submission,
    claim,
    thesisVersion: null,
  }
}

const recordFileAccess = async (
  fastify: FastifyInstance,
  input: {
    ossFileId: string
    userId: string
    paperId: string | null
    institutionId: string | null
    accessType: 'preview' | 'download'
    watermarked: boolean
    requestId: string
    ipAddress: string | null
    userAgent: string | null
  },
): Promise<string> => {
  const now = new Date()
  return fastify.prisma.$transaction(async (tx) => {
    if (input.accessType === 'download') {
      await lockMutationScope(tx, 'download', input.userId)
      const [recentDownloads, dailyDownloads] = await Promise.all([
        tx.file_access_audits.count({
          where: {
            userId: input.userId,
            access_type: 'download',
            createdAt: { gte: new Date(now.getTime() - TEN_MINUTES_IN_MS) },
          },
        }),
        tx.file_access_audits.count({
          where: {
            userId: input.userId,
            access_type: 'download',
            createdAt: { gte: new Date(now.getTime() - ONE_DAY_IN_MS) },
          },
        }),
      ])

      if (recentDownloads >= DOWNLOAD_LIMIT_PER_10_MINUTES) {
        throw fastify.httpErrors.tooManyRequests(
          'Too many file downloads in a short period, please try again later',
        )
      }
      if (dailyDownloads >= DOWNLOAD_LIMIT_PER_DAY) {
        throw fastify.httpErrors.tooManyRequests(
          'Daily download limit reached, please contact an administrator if needed',
        )
      }
    }

    const audit = await tx.file_access_audits.create({
      data: {
        ossFileId: input.ossFileId,
        userId: input.userId,
        paperId: input.paperId,
        institutionId: input.institutionId,
        access_type: input.accessType,
        watermarked: input.watermarked,
        request_id: input.requestId,
        ip_address: input.ipAddress,
        user_agent: input.userAgent,
      },
    })
    return audit.id
  })
}

const buildProtectedUrls = (
  fastify: FastifyInstance,
  fileId: string,
  userId: string,
  paperId?: string | null,
) => {
  return buildProtectedFileAccessUrls(fastify, {
    fileId,
    userId,
    paperId: paperId ?? null,
  })
}

export async function uploadOssFile(
  fastify: FastifyInstance,
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  userId: string,
  options: UploadOssFileOptions,
) {
  const policy = await resolveUploadPolicy(fastify, userId, fileBuffer, mimeType, options)
  const id = crypto.randomUUID()
  const ext = path.extname(filename) || ''
  const ossKey = buildObjectKey(policy.prefix, id, ext)
  const hash = crypto.createHash('md5').update(fileBuffer).digest('hex')
  const securityProfile = policy.securityProfile
  const watermarkEnabled = isProtectedSecurityProfile(securityProfile) && isPdfFile(mimeType, ext)

  await fastify.oss.upload(ossKey, fileBuffer)

  const now = new Date()
  let ossFile
  try {
    ossFile = await fastify.prisma.$transaction(async (tx) => {
      await lockMutationScope(tx, 'upload', userId)
      await assertWithinStorageQuota(fastify, tx, userId, fileBuffer.length)
      return tx.oss_files.create({
        data: {
          id,
          original_name: filename,
          prefix: policy.prefix,
          file_size: fileBuffer.length,
          mime_type: mimeType,
          hash,
          ext,
          userId,
          createdAt: now,
          institutionId: policy.institutionId,
          security_profile: securityProfile,
          watermark_enabled: watermarkEnabled,
        },
      })
    })
  } catch (error) {
    await fastify.oss.delete(ossKey).catch((cleanupError) => {
      fastify.log.error({ err: cleanupError, ossKey }, 'Failed to remove orphaned upload')
    })
    throw error
  }

  const signatureUrl = isProtectedSecurityProfile(ossFile.security_profile)
    ? buildProtectedUrls(fastify, ossFile.id, userId).previewUrl
    : fastify.oss.getSignedUrl(ossKey)

  return {
    id: ossFile.id,
    oss_key: ossKey,
    signatureUrl,
    original_name: ossFile.original_name,
    file_size: ossFile.file_size,
    mime_type: ossFile.mime_type,
    ext: ossFile.ext,
    hash: ossFile.hash,
    createdAt: ossFile.createdAt.toISOString(),
  }
}

export async function getPreviewUrl(fastify: FastifyInstance, id: string, userId: string) {
  const ossFile = await fastify.prisma.oss_files.findUnique({ where: { id } })
  if (!ossFile) {
    throw fastify.httpErrors.notFound('File not found')
  }

  const ossKey = buildObjectKey(ossFile.prefix ?? '', ossFile.id, ossFile.ext)
  const context = await assertCanAccessProtectedOssFile(fastify, userId, id)

  if (!isProtectedSecurityProfile(ossFile.security_profile)) {
    return {
      id: ossFile.id,
      oss_key: ossKey,
      signatureUrl: fastify.oss.getSignedUrl(ossKey),
    }
  }

  const urls = buildProtectedUrls(fastify, ossFile.id, userId, context.submission?.paperId ?? null)

  return {
    id: ossFile.id,
    oss_key: ossKey,
    signatureUrl: urls.previewUrl,
  }
}

export async function streamProtectedFileAccess(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  id: string,
  token: string,
) {
  const payload = verifyProtectedFileAccessToken(fastify, token)
  if (payload.fileId !== id) {
    throw fastify.httpErrors.unauthorized('File access token does not match the requested file')
  }
  await assertTokenUserExists(fastify, payload.userId)

  const ossFile = await fastify.prisma.oss_files.findUnique({
    where: { id },
  })
  if (!ossFile) {
    throw fastify.httpErrors.notFound('File not found')
  }

  const isProtectedFile = isProtectedSecurityProfile(ossFile.security_profile)
  const accessContext = isProtectedFile
    ? await assertCanAccessProtectedOssFile(fastify, payload.userId, id)
    : {
        ossFile,
        submission: null,
        claim: null,
      }

  const ossKey = buildObjectKey(ossFile.prefix ?? '', ossFile.id, ossFile.ext)
  const auditId = await recordFileAccess(fastify, {
    ossFileId: ossFile.id,
    userId: payload.userId,
    paperId: payload.paperId ?? accessContext.submission?.paperId ?? null,
    institutionId: ossFile.institutionId ?? accessContext.submission?.institutionId ?? null,
    accessType: payload.mode,
    watermarked: false,
    requestId: request.id,
    ipAddress: getClientIp(request),
    userAgent: String(request.headers['user-agent'] ?? '').slice(0, 1000) || null,
  })
  let fileBuffer = await fastify.oss.download(ossKey)
  let watermarked = false

  if (isProtectedFile && isPdfFile(ossFile.mime_type, ossFile.ext)) {
    const [viewer, institution] = await Promise.all([
      fastify.prisma.users.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          email: true,
          name: true,
        },
      }),
      ossFile.institutionId
        ? fastify.prisma.institutions.findUnique({
            where: { id: ossFile.institutionId },
            select: {
              id: true,
              slug: true,
              name: true,
            },
          })
        : Promise.resolve(null),
    ])

    const requestTimestamp = new Date().toISOString()
    const traceId = crypto
      .createHash('sha256')
      .update(`${id}:${payload.userId}:${request.id}:${requestTimestamp}`)
      .digest('hex')
      .slice(0, 16)

    const institutionMarker =
      sanitizeAscii(
        institution?.slug ??
          institution?.name ??
          accessContext.claim?.institutionId ??
          accessContext.submission?.institutionId ??
          ossFile.institutionId ??
          null,
      ) || 'unknown'
    const viewerMarker =
      sanitizeAscii(viewer?.email ?? viewer?.name ?? viewer?.id ?? payload.userId) || payload.userId

    fileBuffer = await applyPdfWatermark(fileBuffer, {
      visibleTextLines: [
        'AIRALOGY SCHOLAR CONFIDENTIAL',
        `inst:${institutionMarker} user:${viewerMarker}`,
        `mode:${payload.mode} time:${requestTimestamp.slice(0, 19)} trace:${traceId}`,
      ],
      metadataFingerprint: [
        `file=${id}`,
        `user=${payload.userId}`,
        `paper=${payload.paperId ?? accessContext.submission?.paperId ?? ''}`,
        `mode=${payload.mode}`,
        `trace=${traceId}`,
        `ts=${requestTimestamp}`,
      ].join('|'),
      mode: payload.mode,
    })
    watermarked = true
  }

  if (watermarked) {
    await fastify.prisma.file_access_audits.update({
      where: { id: auditId },
      data: { watermarked: true },
    })
  }

  reply.header('Cache-Control', 'private, no-store')
  reply.header('Referrer-Policy', 'no-referrer')
  reply.header('X-Content-Type-Options', 'nosniff')
  reply.header('Content-Type', ossFile.mime_type || 'application/octet-stream')
  reply.header('Content-Disposition', buildContentDisposition(payload.mode, ossFile.original_name))
  reply.header('Content-Length', String(fileBuffer.length))

  return reply.send(fileBuffer)
}

export async function streamSignedStorageAccess(
  fastify: FastifyInstance,
  reply: FastifyReply,
  token: string,
) {
  const payload = verifySignedStorageAccessToken(fastify, token)
  const fileBuffer = await fastify.oss.download(payload.key)

  reply.header('Cache-Control', 'private, max-age=3600')
  reply.header('Referrer-Policy', 'no-referrer')
  reply.header('Content-Type', guessContentTypeFromKey(payload.key))
  reply.header('Content-Disposition', 'inline')
  reply.header('Content-Length', String(fileBuffer.length))

  return reply.send(fileBuffer)
}
