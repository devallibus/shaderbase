import { createServerFn } from '@tanstack/solid-start'
import { getRequestIP } from '@tanstack/solid-start/server'

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

function getClientIp(): string | null {
  return getRequestIP({ xForwardedFor: true }) ?? null
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

    const reviewId = addReview(
      data.shaderName,
      data.rating,
      data.comment ?? null,
      data.source ?? 'web',
      data.agentContext ? JSON.stringify(data.agentContext) : null,
      data.userId ?? null,
      clientIp,
    )

    return { ok: true as const, reviewId }
  })

export const getReviews = createServerFn({ method: 'GET' })
  .inputValidator((input: GetReviewsInput) => input)
  .handler(async ({ data }) => {
    const { getReviewsForShader } = await import('../../lib/server/reviews-db')
    return getReviewsForShader(data.shaderName)
  })
