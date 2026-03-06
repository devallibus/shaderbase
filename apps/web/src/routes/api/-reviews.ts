import { createServerFn } from '@tanstack/solid-start'

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

export const submitReview = createServerFn({ method: 'POST' })
  .inputValidator((input: SubmitReviewInput) => input)
  .handler(async ({ data }) => {
    const { existsSync } = await import('node:fs')
    const { join, resolve } = await import('node:path')
    const { addReview } = await import('../../lib/server/reviews-db')

    const repoRoot = resolve(process.cwd(), '../..')
    const shaderDir = join(repoRoot, 'shaders', data.shaderName)

    if (!existsSync(shaderDir)) {
      throw new Error(`Shader "${data.shaderName}" not found`)
    }

    const reviewId = addReview(
      data.shaderName,
      data.rating,
      data.comment ?? null,
      data.source ?? 'web',
      data.agentContext ? JSON.stringify(data.agentContext) : null,
      data.userId ?? null,
    )

    return { ok: true as const, reviewId }
  })

export const getReviews = createServerFn({ method: 'GET' })
  .inputValidator((input: GetReviewsInput) => input)
  .handler(async ({ data }) => {
    const { getReviewsForShader } = await import('../../lib/server/reviews-db')
    return getReviewsForShader(data.shaderName)
  })
