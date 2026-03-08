import { createServerFn } from '@tanstack/solid-start'
import { z } from 'zod'
import { resolveSource } from './resolve-source.ts'

export type { ResolvedSource } from './resolve-source.ts'

export const resolveShaderSource = createServerFn({ method: 'POST' })
  .inputValidator((input: { rawInput: string }) => input)
  .handler(async ({ data }) => {
    return resolveSource(data.rawInput)
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
