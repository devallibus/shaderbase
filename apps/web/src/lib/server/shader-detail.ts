import { createServerFn } from '@tanstack/solid-start'
import { loadShaderDetail } from './load-shader-detail.ts'

export type {
  ShaderDetail,
  ShaderDetailUniform,
  ShaderDetailRecipe,
} from './load-shader-detail.ts'

export const getShaderDetail = createServerFn({ method: 'GET' })
  .inputValidator((input: { name: string }) => input)
  .handler(async ({ data }) => {
    const { join, resolve } = await import('node:path')

    const repoRoot = resolve(process.cwd(), '../..')
    const shaderDir = join(repoRoot, 'shaders', data.name)

    return loadShaderDetail(shaderDir)
  })
