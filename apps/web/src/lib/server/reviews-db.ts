import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const dataDir = process.env.DATA_DIR || resolve(process.cwd(), '.data')
const reviewsDbPath = resolve(dataDir, 'reviews.sqlite')
mkdirSync(dirname(reviewsDbPath), { recursive: true })

const db = new DatabaseSync(reviewsDbPath)

db.exec(`
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shader_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment TEXT,
    source TEXT NOT NULL DEFAULT 'web',
    agent_context TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_reviews_shader ON reviews(shader_name);
`)

export type Review = {
  id: number
  shaderName: string
  rating: number
  comment: string | null
  source: string
  agentContext: string | null
  userID: string | null
  createdAt: string
}

export type ReviewStats = {
  average: number
  count: number
}

export function addReview(
  shaderName: string,
  rating: number,
  comment?: string | null,
  source = 'web',
  agentContext?: string | null,
  userId?: string | null,
): number {
  const stmt = db.prepare(
    `INSERT INTO reviews (shader_name, rating, comment, source, agent_context, user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const result = stmt.run(
    shaderName,
    rating,
    comment ?? null,
    source,
    agentContext ?? null,
    userId ?? null,
  )
  return Number(result.lastInsertRowid)
}

export function getReviewsForShader(shaderName: string): { reviews: Review[]; stats: ReviewStats } {
  const rows = db
    .prepare(
      `SELECT id, shader_name, rating, comment, source, agent_context, user_id, created_at
       FROM reviews WHERE shader_name = ? ORDER BY created_at DESC`,
    )
    .all(shaderName) as Array<{
    id: number
    shader_name: string
    rating: number
    comment: string | null
    source: string
    agent_context: string | null
    user_id: string | null
    created_at: string
  }>

  const reviews: Review[] = rows.map((r) => ({
    id: r.id,
    shaderName: r.shader_name,
    rating: r.rating,
    comment: r.comment,
    source: r.source,
    agentContext: r.agent_context,
    userID: r.user_id,
    createdAt: r.created_at,
  }))

  const count = reviews.length
  const average = count > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0

  return { reviews, stats: { average, count } }
}

export function getAverageRating(shaderName: string): ReviewStats {
  const row = db
    .prepare(
      `SELECT COALESCE(AVG(rating), 0) AS avg, COUNT(*) AS count
       FROM reviews WHERE shader_name = ?`,
    )
    .get(shaderName) as { avg: number; count: number }

  return { average: row.avg, count: row.count }
}

export function getAllShaderRatings(): Record<string, ReviewStats> {
  const rows = db
    .prepare(
      `SELECT shader_name, AVG(rating) AS avg, COUNT(*) AS count
       FROM reviews GROUP BY shader_name`,
    )
    .all() as Array<{ shader_name: string; avg: number; count: number }>

  const result: Record<string, ReviewStats> = {}
  for (const row of rows) {
    result[row.shader_name] = { average: row.avg, count: row.count }
  }
  return result
}
