export type ShaderDiagnostic = {
  kind: 'glsl-compile' | 'glsl-link'
  message: string
}

type ShaderLogContext = {
  gl: {
    COMPILE_STATUS: number
    getProgramInfoLog: (program: unknown) => string | null
    getShaderInfoLog: (shader: unknown) => string | null
    getShaderParameter: (shader: unknown, pname: number) => boolean
  }
  program: unknown
  vertexShader?: unknown | null
  fragmentShader?: unknown | null
}

function normalizeLog(log: string | null | undefined): string {
  return log?.trim() ?? ''
}

function pushDiagnostic(
  diagnostics: ShaderDiagnostic[],
  kind: ShaderDiagnostic['kind'],
  message: string | null | undefined,
) {
  const normalized = normalizeLog(message)
  if (!normalized) return
  if (diagnostics.some((entry) => entry.kind === kind && entry.message === normalized)) return
  diagnostics.push({ kind, message: normalized })
}

export function collectShaderDiagnostics({
  gl,
  program,
  vertexShader,
  fragmentShader,
}: ShaderLogContext): ShaderDiagnostic[] {
  const diagnostics: ShaderDiagnostic[] = []
  let compileFailure = false

  for (const shader of [vertexShader, fragmentShader]) {
    if (!shader) continue

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      compileFailure = true
      pushDiagnostic(diagnostics, 'glsl-compile', gl.getShaderInfoLog(shader))
    }
  }

  pushDiagnostic(diagnostics, 'glsl-link', gl.getProgramInfoLog(program))

  if (diagnostics.length > 0) {
    return diagnostics
  }

  if (compileFailure) {
    return [{ kind: 'glsl-compile', message: 'GLSL shader compilation failed.' }]
  }

  return [{ kind: 'glsl-link', message: 'GLSL program linking failed.' }]
}

export function diagnosticsToMessages(diagnostics: ShaderDiagnostic[]): string[] {
  return diagnostics.map(({ message }) => message)
}
