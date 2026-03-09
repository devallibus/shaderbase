import { createEffect, on, onCleanup, onMount } from 'solid-js'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { basicSetup } from 'codemirror'
import { cpp } from '@codemirror/lang-cpp'
import { oneDark } from '@codemirror/theme-one-dark'

type PlaygroundEditorProps = {
  value: string
  onChange: (value: string) => void
}

export default function PlaygroundEditor(props: PlaygroundEditorProps) {
  let containerRef!: HTMLDivElement
  let view: EditorView | null = null
  // Track whether we're updating externally to avoid feedback loops
  let isExternalUpdate = false

  onMount(() => {
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !isExternalUpdate) {
        props.onChange(update.state.doc.toString())
      }
    })

    const state = EditorState.create({
      doc: props.value,
      extensions: [
        basicSetup,
        cpp(), // GLSL syntax is close enough to C/C++
        oneDark,
        updateListener,
        EditorView.theme({
          '&': { height: '100%', fontSize: '13px' },
          '.cm-scroller': { overflow: 'auto' },
          '.cm-content': { fontFamily: 'JetBrains Mono, Fira Code, monospace' },
        }),
        keymap.of([]),
      ],
    })

    view = new EditorView({
      state,
      parent: containerRef,
    })

    onCleanup(() => {
      view?.destroy()
      view = null
    })
  })

  // Sync external value changes without losing cursor position
  createEffect(
    on(
      () => props.value,
      (newValue) => {
        if (!view) return
        const currentValue = view.state.doc.toString()
        if (newValue === currentValue) return

        isExternalUpdate = true
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: newValue,
          },
        })
        isExternalUpdate = false
      },
      { defer: true },
    ),
  )

  return (
    <div
      ref={containerRef}
      class="h-full w-full overflow-hidden [&_.cm-editor]:h-full"
    />
  )
}
