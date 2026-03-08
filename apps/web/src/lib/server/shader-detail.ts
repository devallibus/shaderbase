import { createServerFn } from '@tanstack/solid-start'
import { getShaderDetailFromSource } from './shader-source.ts'

export type {
  ShaderDetail,
  ShaderDetailUniform,
  ShaderDetailRecipe,
} from './load-shader-detail.ts'

export const getShaderDetail = createServerFn({ method: 'GET' })
  .inputValidator((input: { name: string }) => input)
  .handler(async ({ data }) => {
    return getShaderDetailFromSource(data.name)
  })
