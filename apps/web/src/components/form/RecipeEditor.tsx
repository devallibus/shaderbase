import { Show } from 'solid-js'
import type { SubmissionFormData } from '../../lib/submission-draft'
import { recipeRequirementOptions } from '../../lib/submission-draft'
import Field from '../ui/Field'
import TextInput from '../ui/TextInput'
import TextArea from '../ui/TextArea'
import PillGroup from '../ui/PillGroup'

export default function RecipeEditor(props: { label: string; recipe: SubmissionFormData['threeRecipe']; onToggle: (value: boolean) => void; onSummary: (value: string) => void; onRequirementsToggle: (value: string) => void; onCode: (value: string) => void }) {
  return (
    <div class="rounded-2xl border border-surface-card-border bg-surface-card p-4">
      <label class="inline-flex cursor-pointer items-center gap-3 rounded-2xl border border-surface-card-border bg-surface-secondary px-4 py-3">
        <input checked={props.recipe.enabled} type="checkbox" onChange={(event) => props.onToggle(event.currentTarget.checked)} />
        <span class="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-text-secondary">{props.label}</span>
      </label>
      <Show when={props.recipe.enabled}>
        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <Field class="md:col-span-2" label="Summary"><TextInput value={props.recipe.summary} onInput={props.onSummary} /></Field>
          <PillGroup class="md:col-span-2" label="Requirements" options={recipeRequirementOptions} selected={props.recipe.requirements} onToggle={props.onRequirementsToggle} />
          <Field class="md:col-span-2" label="Code"><TextArea value={props.recipe.code} onInput={props.onCode} rows={10} monospace /></Field>
        </div>
      </Show>
    </div>
  )
}
