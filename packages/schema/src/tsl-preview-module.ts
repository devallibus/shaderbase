type ImportBinding = {
  imported: string
  local: string
}

export type TslPreviewModuleRuntime = {
  THREE: unknown
  TSL: unknown
  width: number
  height: number
  pipeline: string
}

export type TslPreviewModuleResult = {
  material: unknown
  geometry?: unknown
  camera?: unknown
  update?: (time: number) => void
  dispose?: () => void
}

function parseImportBindings(specifierList: string): ImportBinding[] {
  return specifierList
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [imported = '', local] = item.split(/\s+as\s+/)
      return {
        imported: imported.trim(),
        local: (local ?? imported).trim(),
      }
    })
}

function buildDestructureLine(namespace: string, bindings: ImportBinding[]) {
  if (bindings.length === 0) return ''

  const entries = bindings.map((binding) =>
    binding.imported === binding.local
      ? binding.imported
      : `${binding.imported}: ${binding.local}`,
  )

  return `const { ${entries.join(', ')} } = ${namespace};`
}

function normalizeTslSource(sourceCode: string) {
  const importPattern = /^import\s*{\s*([^}]+)\s*}\s*from\s*['"]([^'"]+)['"];?\s*$/gm
  const tslBindings: ImportBinding[] = []
  const webgpuBindings: ImportBinding[] = []

  const strippedSource = sourceCode.replace(importPattern, (_match, specifiers: string, from: string) => {
    const bindings = parseImportBindings(specifiers)

    if (from === 'three/tsl') {
      tslBindings.push(...bindings)
      return ''
    }

    if (from === 'three/webgpu') {
      webgpuBindings.push(...bindings)
      return ''
    }

    throw new Error(`Unsupported TSL import source: ${from}`)
  })

  const normalizedSource = strippedSource
    .replace(/export\s+function\s+createMaterial\s*\(/, 'function createMaterial(')
    .replace(/\)\s*:\s*[A-Za-z0-9_<>\[\]\s,.|]+\s*\{/g, ') {')
    .replace(/export\s+const\s+createMaterial\s*=/, 'const createMaterial =')

  return {
    normalizedSource,
    tslBindings,
    webgpuBindings,
  }
}

export function buildTslPreviewModule(sourceCode: string) {
  const { normalizedSource, tslBindings, webgpuBindings } = normalizeTslSource(sourceCode)

  const moduleBody = [
    buildDestructureLine('TSL', tslBindings),
    buildDestructureLine('THREE', webgpuBindings),
    normalizedSource.trim(),
    `
export function createPreview(runtime) {
  const material = createMaterial();
  return { material };
}
`.trim(),
  ]
    .filter(Boolean)
    .join('\n\n')

  return `${moduleBody}\n`
}
