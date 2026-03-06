export default function SearchBar(props: {
  value: string
  onInput: (value: string) => void
  onSubmit: (value: string) => void
  placeholder?: string
}) {
  return (
    <div class="w-full max-w-md">
      <div class="relative">
        <svg
          class="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          class="w-full rounded-xl border border-surface-card-border bg-surface-card py-2.5 pl-10 pr-4 text-sm text-text-primary shadow-sm outline-none transition placeholder:text-text-muted focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
          type="text"
          value={props.value}
          placeholder={props.placeholder ?? 'Search shaders...'}
          onInput={(e) => props.onInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              props.onSubmit(props.value)
            }
          }}
        />
      </div>
    </div>
  )
}
