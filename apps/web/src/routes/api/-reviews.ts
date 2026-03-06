import { createServerFn } from '@tanstack/solid-start'
import { z } from 'zod'

const submitReviewInput = z.object({
  shaderName: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  source: z.string().default('web'),
  agentContext: z.record(z.unknown()).optional(),
  userId: z.string().optional(),
})

export const submitReview = createServerFn({ method: 'POST' })
  .validator(submitReviewInput)
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
      data.source,
      data.agentContext ? JSON.stringify(data.agentContext) : null,
      data.userId ?? null,
    )

    return { ok: true as const, reviewId }
  })

const getReviewsInput = z.object({
  shaderName: z.string().min(1),
})

export const getReviews = createServerFn({ method: 'GET' })
  .validator(getReviewsInput)
  .handler(async ({ data }) => {
    const { getReviewsForShader } = await import('../../lib/server/reviews-db')
    return getReviewsForShader(data.shaderName)
  })
