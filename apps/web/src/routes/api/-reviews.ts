import { randomBytes, createHash } from 'node:crypto'
import { createServerFn } from '@tanstack/solid-start'
import { getCookie, getRequestIP, getRequestProtocol, setCookie } from '@tanstack/solid-start/server'

type SubmitReviewInput = {
  shaderName: string
  rating: number
  comment?: string
  source?: string
  agentContext?: Record<string, unknown>
  userId?: string
}

type GetReviewsInput = {
  shaderName: string
}

const REVIEWER_COOKIE_NAME = 'shaderbase-reviewer'
const REVIEWER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

function getClientIp(): string | null {
  return getRequestIP({ xForwardedFor: true }) ?? null
}

function hashReviewerToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function getOrCreateReviewerTokenHash(): string | null {
  let reviewerToken = getCookie(REVIEWER_COOKIE_NAME)

  if (!reviewerToken) {
    reviewerToken = randomBytes(32).toString('hex')
    setCookie(REVIEWER_COOKIE_NAME, reviewerToken, {
      httpOnly: true,
      maxAge: REVIEWER_COOKIE_MAX_AGE_SECONDS,
      path: '/',
      sameSite: 'lax',
      secure: getRequestProtocol({ xForwardedProto: true }) === 'https',
    })
  }

  return reviewerToken ? hashReviewerToken(reviewerToken) : null
}

export const submitReview = createServerFn({ method: 'POST' })
  .inputValidator((input: SubmitReviewInput) => input)
  .handler(async ({ data }) => {
    const { addReview } = await import('../../lib/server/reviews-db')
    const { listShadersFromSource } = await import('../../lib/server/shader-source')

    // Validate shader exists
    const shaders = await listShadersFromSource()
    if (!shaders.some((s) => s.name === data.shaderName)) {
      throw new Error(`Shader "${data.shaderName}" not found`)
    }

    const clientIp = getClientIp()
    const reviewerTokenHash = getOrCreateReviewerTokenHash()

    const reviewId = addReview(
      data.shaderName,
      data.rating,
      data.comment ?? null,
      data.source ?? 'web',
      data.agentContext ? JSON.stringify(data.agentContext) : null,
      data.userId ?? null,
      clientIp,
      reviewerTokenHash,
    )

    return { ok: true as const, reviewId }
  })

export const getReviews = createServerFn({ method: 'GET' })
  .inputValidator((input: GetReviewsInput) => input)
  .handler(async ({ data }) => {
    const { getReviewsForShader } = await import('../../lib/server/reviews-db')
    return getReviewsForShader(data.shaderName)
  })
