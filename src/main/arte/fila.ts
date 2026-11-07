import { randomUUID } from 'node:crypto'
import { chaveDe, type Alvo, type GeracaoMeta, type ItemFila } from './tipos'

/**
 * Fila de geração. Vive no processo principal (desktop) ou no servidor (web),
 * então continua rodando quando a interface troca de tela. Um gerador de
 * imagem usa a GPU inteira ou uma cota de API, por isso há um só trabalhador
 * para todos os livros, em ordem de chegada (pedidos individuais furam a fila).
 *
 * A execução de cada item é injetada (`Executor`), o que permite testar com
 * um provedor falso.
 */

export type Executor = (dir: string, item: ItemFila, signal: AbortSignal) => Promise<GeracaoMeta>

interface Entrada {
  dir: string
  item: ItemFila
  executar: Executor
  ctrl?: AbortController
}

export interface OpcoesEnfileirar {
  rotulo: string
  promptManual?: string
  variar?: boolean
  /** entra na frente dos itens em espera (geração individual) */
  prioridade?: boolean
}

const MAX_HISTORICO = 400

export class FilaArte {
  private entradas: Entrada[] = []
  private ativo: Entrada | null = null
  private duracoes: number[] = []
  /** chamado quando um item termina (ok, erro ou cancelado) */
  onFim?: (dir: string, item: ItemFila) => void

  /** Enfileira ou atualiza o pedido de um alvo. Não duplica alvos em espera/gerando. */
  enfileirar(dir: string, alvo: Alvo, executar: Executor, op: OpcoesEnfileirar): ItemFila {
    const chave = chaveDe(alvo)
    const atual = this.entradas.find((e) => e.dir === dir && e.item.chave === chave && (e.item.status === 'fila' || e.item.status === 'gerando'))
    if (atual) {
      if (atual.item.status === 'fila') {
        atual.item.promptManual = op.promptManual
        atual.item.variar = op.variar ?? atual.item.variar
        atual.executar = executar
        if (op.prioridade) this.paraFrente(atual)
      }
      return { ...atual.item }
    }
    // só o pedido mais recente de cada alvo fica no histórico
    this.entradas = this.entradas.filter((e) => !(e.dir === dir && e.item.chave === chave))
    const item: ItemFila = {
      id: randomUUID(),
      chave,
      alvo,
      rotulo: op.rotulo,
      status: 'fila',
      variar: !!op.variar,
      criadoEm: new Date().toISOString(),
      ...(op.promptManual ? { promptManual: op.promptManual } : {})
    }
    const e: Entrada = { dir, item, executar }
    this.entradas.push(e)
    if (op.prioridade) this.paraFrente(e)
    this.aparar()
    queueMicrotask(() => void this.rodar())
    return { ...item }
  }

  private paraFrente(e: Entrada): void {
    this.entradas = this.entradas.filter((x) => x !== e)
    const i = this.entradas.findIndex((x) => x.item.status === 'fila')
    if (i < 0) this.entradas.push(e)
    else this.entradas.splice(i, 0, e)
  }

  private aparar(): void {
    const finais = this.entradas.filter((e) => e.item.status !== 'fila' && e.item.status !== 'gerando')
    const excesso = finais.length - MAX_HISTORICO
    if (excesso > 0) {
      const tirar = new Set(finais.slice(0, excesso))
      this.entradas = this.entradas.filter((e) => !tirar.has(e))
    }
  }

  /** Cancela um alvo (chave) ou todos os pendentes do livro. */
  cancelar(dir: string, chave?: string): number {
    let n = 0
    for (const e of this.entradas) {
      if (e.dir !== dir || (chave && e.item.chave !== chave)) continue
      if (e.item.status === 'fila') {
        e.item.status = 'cancelado'
        e.item.fim = Date.now()
        n++
      } else if (e.item.status === 'gerando') {
        e.ctrl?.abort()
        n++
      }
    }
    return n
  }

  itens(dir: string): ItemFila[] {
    return this.entradas.filter((e) => e.dir === dir).map((e) => ({ ...e.item }))
  }

  /** Média das últimas gerações bem-sucedidas (ms), ou null. */
  media(): number | null {
    if (!this.duracoes.length) return null
    return Math.round(this.duracoes.reduce((a, b) => a + b, 0) / this.duracoes.length)
  }

  /** Estimativa para esvaziar o que é deste livro, incluindo o que está na frente dele. */
  restante(dir: string): number | null {
    const m = this.media()
    const meus = this.entradas.some((e) => e.dir === dir && (e.item.status === 'fila' || e.item.status === 'gerando'))
    if (m === null || !meus) return null
    let ultimo = -1
    this.entradas.forEach((e, i) => {
      if (e.dir === dir && e.item.status === 'fila') ultimo = i
    })
    const naFrente = ultimo < 0 ? 0 : this.entradas.slice(0, ultimo + 1).filter((e) => e.item.status === 'fila').length
    const decorrido = this.ativo?.item.inicio ? Date.now() - this.ativo.item.inicio : 0
    const atual = this.ativo ? Math.max(0, m - decorrido) : 0
    return Math.round(naFrente * m + atual)
  }

  /** Esvazia o histórico de um livro (itens finalizados). */
  limpar(dir: string): void {
    this.entradas = this.entradas.filter((e) => e.dir !== dir || e.item.status === 'fila' || e.item.status === 'gerando')
  }

  /** Para testes: resolve quando não houver nada em espera nem gerando. */
  async ocioso(): Promise<void> {
    while (this.ativo || this.entradas.some((e) => e.item.status === 'fila')) await new Promise((r) => setTimeout(r, 10))
  }

  private async rodar(): Promise<void> {
    if (this.ativo) return
    const e = this.entradas.find((x) => x.item.status === 'fila')
    if (!e) return
    this.ativo = e
    e.ctrl = new AbortController()
    e.item.status = 'gerando'
    e.item.inicio = Date.now()
    try {
      const meta = await e.executar(e.dir, { ...e.item }, e.ctrl.signal)
      if (e.ctrl.signal.aborted) throw new Error('Cancelado')
      e.item.status = 'pronto'
      e.item.asset = meta.asset
      this.duracoes = [...this.duracoes.slice(-9), meta.duracaoMs]
    } catch (err) {
      if (e.ctrl.signal.aborted) e.item.status = 'cancelado'
      else {
        e.item.status = 'erro'
        e.item.erro = (err as Error).message || 'Falha na geração'
      }
    } finally {
      e.item.fim = Date.now()
      delete e.ctrl
      this.ativo = null
      try {
        this.onFim?.(e.dir, { ...e.item })
      } catch {
        /* observador não derruba a fila */
      }
      queueMicrotask(() => void this.rodar())
    }
  }
}
