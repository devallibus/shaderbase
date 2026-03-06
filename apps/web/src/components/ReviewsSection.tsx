import { For, Show, createSignal } from 'solid-js'
import { useServerFn } from '@tanstack/solid-start'
import { submitReview, getReviews } from '../routes/api/-reviews'
import type { Review, ReviewStats } from '../lib/server/reviews-db'
import Badge from './ui/Badge'

type ReviewsSectionProps = {
  shaderName: string
  initialReviews: Review[]
  initialStats: ReviewStats
}

function StarRating(props: { rating: number; interactive?: boolean; onRate?: (r: number) => void }) {
  return (
    <div class="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          type="button"
          class={`text-sm transition ${
            star <= props.rating ? 'text-accent' : 'text-surface-card-border'
          } ${props.interactive ? 'cursor-pointer hover:text-accent/70' : 'cursor-default'}`}
          onClick={() => props.interactive && props.onRate?.(star)}
          disabled={!props.interactive}
        >
          &#9733;
        </button>
      ))}
    </div>
  )
}

export default function ReviewsSection(props: ReviewsSectionProps) {
  const submit = useServerFn(submitReview)
  const fetchReviews = useServerFn(getReviews)
  const [reviews, setReviews] = createSignal(props.initialReviews)
  const [stats, setStats] = createSignal(props.initialStats)
  const [newRating, setNewRating] = createSignal(0)
  const [newComment, setNewComment] = createSignal('')
  const [submitting, setSubmitting] = createSignal(false)
  const [submitMessage, setSubmitMessage] = createSignal('')

  const handleSubmit = async () => {
    if (newRating() === 0) return
    setSubmitting(true)
    setSubmitMessage('')

    try {
      await submit({
        data: {
          shaderName: props.shaderName,
          rating: newRating(),
          comment: newComment().trim() || undefined,
          source: 'web',
        },
      })
      setSubmitMessage('Review submitted')
      setNewRating(0)
      setNewComment('')

      const updated = await fetchReviews({ data: { shaderName: props.shaderName } })
      setReviews(updated.reviews)
      setStats(updated.stats)
    } catch (e) {
      setSubmitMessage(e instanceof Error ? e.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  const sourceBreakdown = () => {
    const counts: Record<string, number> = {}
    for (const r of reviews()) {
      counts[r.source] = (counts[r.source] ?? 0) + 1
    }
    return Object.entries(counts)
  }

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-accent">
          Reviews
        </h2>
        <Show when={stats().count > 0}>
          <div class="flex items-center gap-2">
            <StarRating rating={Math.round(stats().average)} />
            <span class="text-xs text-text-muted">
              {stats().average.toFixed(1)} ({stats().count} review{stats().count !== 1 ? 's' : ''})
            </span>
          </div>
        </Show>
      </div>

      <Show when={sourceBreakdown().length > 0}>
        <div class="flex flex-wrap gap-1.5">
          <For each={sourceBreakdown()}>
            {([source, count]) => (
              <Badge label={`${source}: ${count}`} />
            )}
          </For>
        </div>
      </Show>

      {/* Submit form */}
      <div class="rounded-xl border border-surface-card-border bg-surface-card p-4">
        <p class="mb-2 text-xs font-medium text-text-secondary">Leave a review</p>
        <div class="mb-2">
          <StarRating rating={newRating()} interactive onRate={setNewRating} />
        </div>
        <textarea
          class="mb-2 w-full rounded-lg border border-surface-card-border bg-surface-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
          rows={2}
          placeholder="Optional comment..."
          value={newComment()}
          onInput={(e) => setNewComment(e.currentTarget.value)}
        />
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-surface-primary transition hover:bg-accent/80 disabled:opacity-50"
            disabled={newRating() === 0 || submitting()}
            onClick={() => void handleSubmit()}
          >
            {submitting() ? 'Submitting...' : 'Submit'}
          </button>
          <Show when={submitMessage()}>
            <span class="text-xs text-text-muted">{submitMessage()}</span>
          </Show>
        </div>
      </div>

      {/* Review list */}
      <Show when={reviews().length > 0}>
        <div class="space-y-2">
          <For each={reviews()}>
            {(review) => (
              <div class="rounded-xl border border-surface-card-border p-3">
                <div class="mb-1 flex items-center gap-2">
                  <StarRating rating={review.rating} />
                  <Badge label={review.source} />
                  <span class="text-[0.6rem] text-text-muted">{review.createdAt}</span>
                </div>
                <Show when={review.comment}>
                  <p class="text-xs leading-relaxed text-text-secondary">{review.comment}</p>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={reviews().length === 0}>
        <p class="text-xs text-text-muted">No reviews yet. Be the first!</p>
      </Show>
    </div>
  )
}
