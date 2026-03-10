import type { PlaygroundErrorReport, PlaygroundError } from './playground-types'

type TslErrorKind = Extract<PlaygroundError['kind'], 'tsl-parse' | 'tsl-runtime' | 'tsl-material-build'>

export class TslPreviewError extends Error {
  kind: TslErrorKind

  constructor(kind: TslErrorKind, message: string) {
    super(message)
    this.kind = kind
    this.name = 'TslPreviewError'
  }
}

function getMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }

  return fallbackMessage
}

export function createPlainErrorReport(errors: string[]): PlaygroundErrorReport {
  return {
    errors,
    structuredErrors: [],
  }
}

export function createTslErrorReport(
  error: unknown,
  fallbackKind: TslErrorKind,
  fallbackMessage: string,
): PlaygroundErrorReport {
  const message = getMessage(error, fallbackMessage)
  const kind = error instanceof TslPreviewError
    ? error.kind
    : error instanceof SyntaxError
      ? 'tsl-parse'
      : fallbackKind

  return {
    errors: [message],
    structuredErrors: [{ kind, message }],
  }
}
