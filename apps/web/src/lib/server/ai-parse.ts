import { createServerFn } from '@tanstack/solid-start'
import { z } from 'zod'

export type ResolvedSource = {
  code: string
  sourceType: 'glsl' | 'shadertoy' | 'gist' | 'github-file'
  metadata?: { title?: string; author?: string; url?: string }
}

export const resolveShaderSource = createServerFn({ method: 'POST' })
  .inputValidator((input: { rawInput: string }) => input)
  .handler(async ({ data }): Promise<ResolvedSource> => {
    const input = data.rawInput.trim()

    // Shadertoy URL
    const shadertoyMatch = input.match(/shadertoy\.com\/view\/([A-Za-z0-9]+)/)
    if (shadertoyMatch) {
      const id = shadertoyMatch[1]
      const apiUrl = `https://www.shadertoy.com/api/v1/shaders/${id}?key=BdHjRn`
      const resp = await fetch(apiUrl)
      if (!resp.ok) throw new Error(`Shadertoy API returned ${resp.status}`)
      const json = (await resp.json()) as {
        Shader?: {
          info?: { name?: string; username?: string }
          renderpass?: Array<{ code?: string }>
        }
      }
      const shader = json.Shader
      const code = shader?.renderpass?.[0]?.code ?? ''
      if (!code) throw new Error('No shader code found in Shadertoy response')
      return {
        code,
        sourceType: 'shadertoy',
        metadata: {
          title: shader?.info?.name,
          author: shader?.info?.username,
          url: `https://www.shadertoy.com/view/${id}`,
        },
      }
    }

    // GitHub gist URL
    const gistMatch = input.match(/gist\.github\.com\/(?:[^/]+\/)?([a-f0-9]+)/)
    if (gistMatch) {
      const id = gistMatch[1]
      const resp = await fetch(`https://api.github.com/gists/${id}`, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      })
      if (!resp.ok) throw new Error(`GitHub API returned ${resp.status}`)
      const json = (await resp.json()) as {
        description?: string
        owner?: { login?: string }
        files?: Record<string, { content?: string; filename?: string }>
      }
      const files = Object.values(json.files ?? {})
      const glslFile = files.find(
        (f) => f.filename?.endsWith('.glsl') || f.filename?.endsWith('.frag') || f.filename?.endsWith('.vert'),
      )
      const code = glslFile?.content ?? files[0]?.content ?? ''
      if (!code) throw new Error('No files found in gist')
      return {
        code,
        sourceType: 'gist',
        metadata: {
          title: json.description ?? undefined,
          author: json.owner?.login ?? undefined,
          url: `https://gist.github.com/${id}`,
        },
      }
    }

    // Raw GitHub file URL
    const githubFileMatch = input.match(
      /github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/,
    )
    if (githubFileMatch) {
      const [, owner, repo, branch, path] = githubFileMatch
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
      const resp = await fetch(rawUrl)
      if (!resp.ok) throw new Error(`GitHub raw fetch returned ${resp.status}`)
      return {
        code: await resp.text(),
        sourceType: 'github-file',
        metadata: {
          url: input,
          author: owner,
        },
      }
    }

    // Plain GLSL
    return { code: input, sourceType: 'glsl' }
  })

const aiFormDataSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  summary: z.string(),
  description: z.string(),
  authorName: z.string(),
  category: z.string(),
  tagsText: z.string(),
  pipeline: z.enum(['surface', 'postprocessing', 'geometry', 'utility']),
  stage: z.enum(['fragment', 'vertex', 'vertex-and-fragment', 'fullscreen-pass']),
  capabilityRequires: z.array(z.enum(['uv', 'time', 'resolution', 'mouse', 'normals', 'world-position', 'input-texture', 'camera', 'screen-space'])),
  capabilityOutputs: z.array(z.enum(['color', 'alpha', 'emissive', 'position-offset', 'normal-perturbation'])),
  material: z.enum(['shader-material', 'raw-shader-material', 'post-processing-pass', 'custom']),
  sourceKind: z.enum(['original', 'adapted', 'ported']),
  attributionSummary: z.string(),
  uniforms: z.array(
    z.object({
      name: z.string(),
      type: z.enum(['float', 'int', 'bool', 'vec2', 'vec3', 'vec4', 'mat3', 'mat4', 'color', 'sampler2D', 'samplerCube']),
      defaultValue: z.string(),
      description: z.string(),
      min: z.string(),
      max: z.string(),
    }),
  ),
  inputs: z.array(
    z.object({
      name: z.string(),
      kind: z.enum(['uv', 'position', 'normal', 'time', 'resolution', 'texture', 'mouse']),
      description: z.string(),
      required: z.boolean(),
    }),
  ),
  outputs: z.array(
    z.object({
      name: z.string(),
      kind: z.enum(['color', 'alpha', 'emissive', 'position-offset', 'normal-perturbation']),
      description: z.string(),
    }),
  ),
  vertexShader: z.string(),
  fragmentShader: z.string(),
})

const systemPrompt = `You are a GLSL shader analyzer for ShaderBase, a Three.js shader registry.
Given shader source code, analyze it and extract metadata to populate a submission form.

RULES:
- Parse uniform declarations to build the uniforms array. For each uniform, determine its type and suggest a reasonable default value.
- For vec3 defaults, use comma-separated numbers like "0.5, 0.5, 0.5". Same for vec2, vec4.
- For float/int defaults, use a single number.
- For bool defaults, use "true" or "false".
- For sampler2D/samplerCube defaults, use empty string.
- Analyze the shader to determine: pipeline (surface/postprocessing/geometry/utility), stage, what it requires (uv, time, normals, etc.), and what it outputs.
- If the code references iTime/iResolution/iMouse (Shadertoy conventions), note it uses time/resolution/mouse.
- For Shadertoy shaders: the fragmentShader should adapt mainImage() to void main() with gl_FragColor, and replace iTime with uTime, iResolution with uResolution, etc. Generate a compatible vertex shader.
- Infer a kebab-case name, human display name, category, and tags from the shader behavior.
- Determine sourceKind: "original" if user-authored, "adapted" if from Shadertoy/external with modifications, "ported" if directly translated.
- Always set capabilityOutputs to at least ["color"].
- For min/max on uniforms, provide reasonable ranges as strings (e.g., "0", "1") or empty strings if unknown.`

type AiParseInput = {
  code: string
  sourceType: string
  metadata?: { title?: string; author?: string; url?: string }
}

export const aiParseShader = createServerFn({ method: 'POST' })
  .inputValidator((input: AiParseInput) => input)
  .handler(async ({ data }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not configured. Add it to apps/web/.env to enable AI parsing.',
      )
    }

    const { generateObject } = await import('ai')
    const { createAnthropic } = await import('@ai-sdk/anthropic')

    const anthropic = createAnthropic({ apiKey })

    const userMessage = [
      `Source type: ${data.sourceType}`,
      data.metadata?.title ? `Title: ${data.metadata.title}` : '',
      data.metadata?.author ? `Author: ${data.metadata.author}` : '',
      data.metadata?.url ? `URL: ${data.metadata.url}` : '',
      '',
      '--- SHADER CODE ---',
      data.code,
    ]
      .filter(Boolean)
      .join('\n')

    const result = await generateObject({
      model: anthropic('claude-sonnet-4-20250514'),
      system: systemPrompt,
      prompt: userMessage,
      schema: aiFormDataSchema,
    })

    return result.object
  })
