import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { tanstackStartCookies } from 'better-auth/tanstack-start/solid'

const authDbPath = resolve(process.cwd(), '.data', 'better-auth.sqlite')

mkdirSync(dirname(authDbPath), { recursive: true })

const githubClientId = process.env.GITHUB_CLIENT_ID
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET

export const githubAuthEnabled = Boolean(githubClientId && githubClientSecret)

const db = new DatabaseSync(authDbPath)

export const auth = betterAuth({
  secret:
    process.env.BETTER_AUTH_SECRET ??
    'shaderbase-dev-secret-change-me-before-production-please',
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  database: db,
  ...(githubAuthEnabled
    ? {
        socialProviders: {
          github: {
            clientId: githubClientId!,
            clientSecret: githubClientSecret!,
          },
        },
      }
    : {}),
  plugins: [tanstackStartCookies()],
})

let authReadyPromise: Promise<void> | null = null

export function ensureAuthReady() {
  if (!authReadyPromise) {
    authReadyPromise = getMigrations(auth.options).then(async ({ runMigrations }) => {
      await runMigrations()
    })
  }

  return authReadyPromise
}
