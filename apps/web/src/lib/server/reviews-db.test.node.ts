import assert from 'node:assert/strict'
import {
  addReview,
  getReviewsForShader,
  getAverageRating,
  getAllShaderRatings,
} from './reviews-db.ts'

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

runTest('duplicate review from same IP is rejected', () => {
  const shader = `${testShader}-dupe`
  const ip = '192.168.1.100'
  addReview(shader, 4, null, 'web', null, null, ip)
  assert.throws(
    () => addReview(shader, 5, null, 'web', null, null, ip),
    /already reviewed this shader/,
  )
})

runTest('allows different shaders from same IP', () => {
  const ip = `10.0.0.${Date.now() % 255}`
  addReview(`${testShader}-rl1`, 4, null, 'web', null, null, ip)
  addReview(`${testShader}-rl2`, 4, null, 'web', null, null, ip)
  // Should not throw — different shaders
})

runTest('reviews without IP bypass rate limiting', () => {
  const shader = `${testShader}-noip`
  addReview(shader, 4, null, 'web', null, null, null)
  addReview(shader, 5, null, 'web', null, null, null)
  // Should not throw — no IP to track
})

console.log('reviews-db tests passed')
