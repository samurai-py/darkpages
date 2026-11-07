import { useCallback, useRef, useState } from 'react'

const LIMITE = 80

export interface Historico<T> {
  atual: T
  /** substitui o estado e cria um passo de desfazer */
  aplicar: (f: (v: T) => T) => void
  /** abre um passo (arrastar, pintar): as próximas `previa` não criam passos novos */
  iniciar: () => void
  /** altera o estado dentro do passo aberto por `iniciar` */
  previa: (f: (v: T) => T) => void
  /** fecha o passo; se nada mudou, descarta */
  concluir: () => void
  desfazer: () => void
  refazer: () => void
  podeDesfazer: boolean
  podeRefazer: boolean
  /** troca o documento sem histórico (carregar outro mapa) */
  resetar: (v: T) => void
}

/** Desfazer/refazer por instantâneos imutáveis do documento. */
export function useHistorico<T>(inicial: T): Historico<T> {
  const [estado, setEstado] = useState<{ passado: T[]; atual: T; futuro: T[] }>({ passado: [], atual: inicial, futuro: [] })
  const aberto = useRef<T | null>(null)

  const aplicar = useCallback((f: (v: T) => T) => {
    setEstado((s) => {
      const novo = f(s.atual)
      if (novo === s.atual) return s
      return { passado: [...s.passado, s.atual].slice(-LIMITE), atual: novo, futuro: [] }
    })
  }, [])

  const iniciar = useCallback(() => {
    setEstado((s) => {
      // já aberto (tecla repetida, foco + clique): mantém o ponto de partida
      if (aberto.current === null) aberto.current = s.atual
      return s
    })
  }, [])

  const previa = useCallback((f: (v: T) => T) => {
    setEstado((s) => {
      const novo = f(s.atual)
      return novo === s.atual ? s : { ...s, atual: novo }
    })
  }, [])

  const concluir = useCallback(() => {
    setEstado((s) => {
      const antes = aberto.current
      aberto.current = null
      if (antes === null || antes === s.atual) return s
      return { passado: [...s.passado, antes].slice(-LIMITE), atual: s.atual, futuro: [] }
    })
  }, [])

  const desfazer = useCallback(() => {
    setEstado((s) => {
      const ant = s.passado[s.passado.length - 1]
      if (ant === undefined) return s
      return { passado: s.passado.slice(0, -1), atual: ant, futuro: [s.atual, ...s.futuro] }
    })
  }, [])

  const refazer = useCallback(() => {
    setEstado((s) => {
      const prox = s.futuro[0]
      if (prox === undefined) return s
      return { passado: [...s.passado, s.atual], atual: prox, futuro: s.futuro.slice(1) }
    })
  }, [])

  const resetar = useCallback((v: T) => {
    aberto.current = null
    setEstado({ passado: [], atual: v, futuro: [] })
  }, [])

  return {
    atual: estado.atual,
    aplicar,
    iniciar,
    previa,
    concluir,
    desfazer,
    refazer,
    podeDesfazer: estado.passado.length > 0,
    podeRefazer: estado.futuro.length > 0,
    resetar
  }
}
