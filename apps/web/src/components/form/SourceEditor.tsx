import type { SourceFormRow } from '../../lib/submission-draft'
import { sourceReferenceKindOptions } from '../../lib/submission-draft'
import Field from '../ui/Field'
import TextInput from '../ui/TextInput'
import TextArea from '../ui/TextArea'
import SelectInput from '../ui/SelectInput'

export default function SourceEditor(props: { row: SourceFormRow; onChange: (key: keyof SourceFormRow, value: string) => void; onRemove: () => void }) {
  return (
    <div class="rounded-2xl border border-surface-card-border bg-surface-card p-4">
      <div class="grid gap-4 md:grid-cols-2">
        <Field label="Source name"><TextInput value={props.row.name} onInput={(value) => props.onChange('name', value)} /></Field>
        <Field label="Source kind"><SelectInput value={props.row.kind} onInput={(value) => props.onChange('kind', value)} options={sourceReferenceKindOptions} /></Field>
        <Field class="md:col-span-2" label="Source URL"><TextInput value={props.row.url} onInput={(value) => props.onChange('url', value)} /></Field>
        <Field class="md:col-span-2" label="Repository URL"><TextInput value={props.row.repositoryUrl} onInput={(value) => props.onChange('repositoryUrl', value)} /></Field>
        <Field label="Revision"><TextInput value={props.row.revision} onInput={(value) => props.onChange('revision', value)} /></Field>
        <Field label="Retrieved at"><TextInput value={props.row.retrievedAt} onInput={(value) => props.onChange('retrievedAt', value)} placeholder="2026-03-06" /></Field>
        <Field label="License"><TextInput value={props.row.license} onInput={(value) => props.onChange('license', value)} /></Field>
        <Field label="Authors"><TextInput value={props.row.authorsText} onInput={(value) => props.onChange('authorsText', value)} placeholder="Ian McEwan, Ashima Arts" /></Field>
        <Field class="md:col-span-2" label="Copyright notice"><TextInput value={props.row.copyrightNotice} onInput={(value) => props.onChange('copyrightNotice', value)} /></Field>
        <Field class="md:col-span-2" label="Notes"><TextArea value={props.row.notes} onInput={(value) => props.onChange('notes', value)} rows={4} /></Field>
      </div>
      <button class="mt-3 text-sm font-semibold text-accent transition hover:text-text-primary" type="button" onClick={props.onRemove}>Remove</button>
    </div>
  )
}
