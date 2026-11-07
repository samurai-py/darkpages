import type { DragEvent } from 'react'

/** Arrastar e soltar de cartões entre listas (Roteiro e Mural), com HTML5 DnD. */
const MIME = 'application/x-folio-cartao'

export function arrastavel(id: string): {
  draggable: true
  onDragStart: (e: DragEvent) => void
} {
  return {
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.setData(MIME, id)
      e.dataTransfer.effectAllowed = 'move'
    }
  }
}

export function soltavel(
  chave: string,
  setSobre: (k: string | null) => void,
  onSoltar: (id: string) => void
): {
  onDragOver: (e: DragEvent) => void
  onDragLeave: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
} {
  return {
    onDragOver: (e) => {
      if (!e.dataTransfer.types.includes(MIME)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      setSobre(chave)
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) setSobre(null)
    },
    onDrop: (e) => {
      const id = e.dataTransfer.getData(MIME)
      setSobre(null)
      if (!id) return
      e.preventDefault()
      e.stopPropagation()
      onSoltar(id)
    }
  }
}
