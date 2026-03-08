import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Isolate test DB in a temp directory so runs are idempotent
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'reviews-test-'))

const {
  addReview,
  getReviewsForShader,
  getAverageRating,
  getAllShaderRatings,
} = await import('./reviews-db.ts')

function runTest(name: string, callback: () => void | Promise<void>) {
  const result = callback()
  if (result instanceof Promise) {
    result.then(
      () => console.log(`ok ${name}`),
      (error) => {
        console.error(`not ok ${name}`)
        throw error
      },
    )
    return result
  }
  console.log(`ok ${name}`)
}

// Use a unique shader name per run to avoid cross-run interference
const testShader = `test-shader-${Date.now()}`

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

runTest('addReview returns an id', () => {
  const id = addReview(testShader, 4, 'Great shader!', 'web')
  assert.equal(typeof id, 'number')
  assert.ok(id > 0, `Expected positive id, got ${id}`)
})

runTest('getReviewsForShader returns added reviews', () => {
  const shader = `${testShader}-multi`
  addReview(shader, 3, 'Decent', 'web')
  addReview(shader, 5, 'Excellent!', 'mcp')

  const { reviews } = getReviewsForShader(shader)
  assert.equal(reviews.length, 2)

  // Ordered by created_at DESC so most recent first
  const ratings = reviews.map((r) => r.rating)
  assert.ok(ratings.includes(3))
  assert.ok(ratings.includes(5))

  // Check fields are properly mapped
  const review = reviews.find((r) => r.rating === 5)!
  assert.equal(review.shaderName, shader)
  assert.equal(review.comment, 'Excellent!')
  assert.equal(review.source, 'mcp')
})

runTest('getReviewsForShader stats are correct', () => {
  const shader = `${testShader}-stats`
  addReview(shader, 3, 'OK')
  addReview(shader, 5, 'Perfect')

  const { stats } = getReviewsForShader(shader)
  assert.equal(stats.count, 2)
  assert.equal(stats.average, 4)
})

runTest('getAverageRating returns correct stats', () => {
  const shader = `${testShader}-avg`
  addReview(shader, 2, null)
  addReview(shader, 4, null)
  addReview(shader, 3, null)

  const stats = getAverageRating(shader)
  assert.equal(stats.count, 3)
  assert.equal(stats.average, 3)
})

runTest('getAllShaderRatings includes test shader', () => {
  const shader = `${testShader}-all`
  addReview(shader, 5, 'Top tier')

  const ratings = getAllShaderRatings()
  assert.ok(shader in ratings, `Expected "${shader}" in ratings map`)
  assert.equal(ratings[shader]!.count, 1)
  assert.equal(ratings[shader]!.average, 5)
})

runTest('getReviewsForShader returns empty for unknown shader', () => {
  const { reviews, stats } = getReviewsForShader('nonexistent-shader-xyz')
  assert.equal(reviews.length, 0)
  assert.equal(stats.count, 0)
  assert.equal(stats.average, 0)
})

runTest('addReview handles optional parameters', () => {
  const shader = `${testShader}-optional`
  const id = addReview(shader, 4, null, 'mcp', 'agent-session-123', 'user-456')
  assert.ok(id > 0)

  const { reviews } = getReviewsForShader(shader)
  assert.equal(reviews.length, 1)
  assert.equal(reviews[0]!.comment, null)
  assert.equal(reviews[0]!.source, 'mcp')
  assert.equal(reviews[0]!.agentContext, 'agent-session-123')
  assert.equal(reviews[0]!.userID, 'user-456')
})

runTest('rejects invalid rating (too high)', () => {
  assert.throws(() => addReview(`${testShader}-bad1`, 6), /Rating must be an integer/)
})

runTest('rejects invalid rating (zero)', () => {
  assert.throws(() => addReview(`${testShader}-bad2`, 0), /Rating must be an integer/)
})

runTest('rejects invalid rating (float)', () => {
  assert.throws(() => addReview(`${testShader}-bad3`, 3.5), /Rating must be an integer/)
})

runTest('sanitizes unknown source to web', () => {
  const shader = `${testShader}-badsource`
  addReview(shader, 3, null, 'evil-source')
  const { reviews } = getReviewsForShader(shader)
  assert.equal(reviews[0]!.source, 'web')
})

runTest('truncates long comments', () => {
  const shader = `${testShader}-longcomment`
  const longComment = 'x'.repeat(5000)
  addReview(shader, 4, longComment)
  const { reviews } = getReviewsForShader(shader)
  assert.equal(reviews[0]!.comment!.length, 2000)
})

runTest('duplicate review from same reviewer token is rejected', () => {
  const shader = `${testShader}-dupe`
  addReview(shader, 4, null, 'web', null, null, '192.168.1.100', 'reviewer-a')
  assert.throws(
    () => addReview(shader, 5, null, 'web', null, null, '198.51.100.2', 'reviewer-a'),
    /already reviewed this shader/,
  )
})

runTest('allows same shader from different reviewer tokens on same IP', () => {
  const shader = `${testShader}-shared-ip`
  const ip = '10.0.0.1'
  addReview(shader, 4, null, 'web', null, null, ip, 'reviewer-a')
  addReview(shader, 5, null, 'web', null, null, ip, 'reviewer-b')
})

runTest('allows different shaders from same IP', () => {
  const ip = '10.0.0.1'
  addReview(`${testShader}-diff1`, 4, null, 'web', null, null, ip)
  addReview(`${testShader}-diff2`, 4, null, 'web', null, null, ip)
  // Should not throw — different shaders
})

runTest('reviews without IP bypass rate limiting', () => {
  const shader = `${testShader}-noip`
  addReview(shader, 4, null, 'web', null, null, null)
  addReview(shader, 5, null, 'web', null, null, null)
  // Should not throw — no IP to track
})

runTest('rate limit rejects 6th review from same IP within window', () => {
  const ip = '172.16.0.1'
  for (let i = 1; i <= 5; i++) {
    addReview(`${testShader}-rl-${i}`, 3, null, 'web', null, null, ip, `reviewer-${i}`)
  }
  assert.throws(
    () => addReview(`${testShader}-rl-6`, 3, null, 'web', null, null, ip, 'reviewer-6'),
    /Too many reviews submitted/,
  )
})

console.log('reviews-db tests passed')
