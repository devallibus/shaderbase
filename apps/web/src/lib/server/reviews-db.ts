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
    client_ip TEXT,
    reviewer_token_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_reviews_shader ON reviews(shader_name);
`)

// Migration: add client_ip column to tables created before this column existed
try {
  db.exec(`ALTER TABLE reviews ADD COLUMN client_ip TEXT`)
} catch {
  // Column already exists
}

try {
  db.exec(`ALTER TABLE reviews ADD COLUMN reviewer_token_hash TEXT`)
} catch {
  // Column already exists
}

db.exec(`CREATE INDEX IF NOT EXISTS idx_reviews_ip_time ON reviews(client_ip, created_at)`)
db.exec(
  `CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_shader_time
   ON reviews(reviewer_token_hash, shader_name, created_at)`,
)

const MAX_COMMENT_LENGTH = 2000
const RATE_LIMIT_WINDOW_MINUTES = 10
const RATE_LIMIT_MAX_REVIEWS = 5

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
  clientIp?: string | null,
  reviewerTokenHash?: string | null,
): number {
  // Validate rating is an integer 1-5
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error('Rating must be an integer between 1 and 5')
  }

  // Validate and truncate comment
  const sanitizedComment = comment ? comment.slice(0, MAX_COMMENT_LENGTH).trim() || null : null

  // Validate source
  const allowedSources = ['web', 'mcp', 'cli']
  const sanitizedSource = allowedSources.includes(source) ? source : 'web'

  // Rate limit: max N reviews per IP within the window
  if (clientIp) {
    const recentCount = db
      .prepare(
        `SELECT COUNT(*) AS count FROM reviews
         WHERE client_ip = ? AND created_at > datetime('now', ?)`,
      )
      .get(clientIp, `-${RATE_LIMIT_WINDOW_MINUTES} minutes`) as { count: number }

    if (recentCount.count >= RATE_LIMIT_MAX_REVIEWS) {
      throw new Error('Too many reviews submitted. Please try again later.')
    }

  }

  if (reviewerTokenHash) {
    const duplicate = db
      .prepare(
        `SELECT id FROM reviews
         WHERE reviewer_token_hash = ?
           AND shader_name = ?
           AND created_at > datetime('now', '-24 hours')`,
      )
      .get(reviewerTokenHash, shaderName) as { id: number } | undefined

    if (duplicate) {
      throw new Error('You already reviewed this shader recently')
    }
  }

  const stmt = db.prepare(
    `INSERT INTO reviews (
       shader_name,
       rating,
       comment,
       source,
       agent_context,
       user_id,
       client_ip,
       reviewer_token_hash
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const result = stmt.run(
    shaderName,
    rating,
    sanitizedComment,
    sanitizedSource,
    agentContext ?? null,
    userId ?? null,
    clientIp ?? null,
    reviewerTokenHash ?? null,
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
