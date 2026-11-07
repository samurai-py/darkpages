import { useEffect, useRef, useState, type ReactElement } from 'react'
import { call } from '../../api'
import type { MemoriaEstado, MemoriaItem } from '../../../../shared/models'
import type { ChapterInfo } from '../../../../shared/types'
import { Mini } from '../universo/icons'
import { rotuloCapitulo } from './board'

/**
 * Memória do livro: o resumo de cada capítulo que a IA usa como lembrança
 * quando trabalha nos capítulos seguintes (ideias, leitura beta,
 * continuidade, redigir). O autor vê, corrige (o resumo editado fica
 * travado), regenera um por um e enxerga os desatualizados.
 */

const ESTADO: Record<MemoriaEstado, { nome: string; dica: string }> = {
  atual: { nome: 'Em dia', dica: 'Resumo feito sobre o texto atual.' },
  desatualizado: { nome: 'Desatualizado', dica: 'O capítulo mudou depois do resumo.' },
  'sem-resumo': { nome: 'Sem resumo', dica: 'A IA ainda não resumiu este capítulo.' },
  'sem-texto': { nome: 'Vazio', dica: 'O capítulo não tem texto.' }
}

function quando(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function Memoria({ dir, chapters, onAbrirCapitulo }: { dir: string; chapters: ChapterInfo[]; onAbrirCapitulo: (file: string) => void }): ReactElement {
  const [itens, setItens] = useState<MemoriaItem[] | null>(null)
  const [erro, setErro] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState('')
  const [ocupado, setOcupado] = useState<Record<string, string>>({})
  const [erros, setErros] = useState<Record<string, string>>({})
  const [anuncio, setAnuncio] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let vivo = true
    setItens(null)
    call<MemoriaItem[]>('memoria.listar', dir)
      .then((l) => vivo && setItens(l))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : String(e)))
    return () => {
      vivo = false
    }
  }, [dir, chapters])

  useEffect(() => {
    if (editando) area.current?.focus()
  }, [editando])

  const trocar = (novo: MemoriaItem): void => setItens((l) => (l ?? []).map((x) => (x.file === novo.file ? novo : x)))

  const agir = async (it: MemoriaItem, rotulo: string, metodo: string, ...args: unknown[]): Promise<boolean> => {
    setOcupado((o) => ({ ...o, [it.file]: rotulo }))
    setErros((e) => ({ ...e, [it.file]: '' }))
    try {
      const novo = await call<MemoriaItem>(metodo, dir, it.file, ...args)
      trocar(novo)
      setAnuncio(`${it.titulo}: resumo atualizado.`)
      return true
    } catch (e) {
      setErros((x) => ({ ...x, [it.file]: e instanceof Error ? e.message : String(e) }))
      return false
    } finally {
      setOcupado((o) => {
        const n = { ...o }
        delete n[it.file]
        return n
      })
    }
  }

  const salvar = async (it: MemoriaItem): Promise<void> => {
    if (await agir(it, 'Salvando…', 'memoria.salvar', rascunho)) setEditando(null)
  }

  const lista = itens ?? []
  const conta = (e: MemoriaEstado): number => lista.filter((x) => x.estado === e).length
  const travados = lista.filter((x) => x.travado).length

  return (
    <div className="en-memoria">
      <p className="en-sr" aria-live="polite">
        {anuncio}
      </p>
      <header className="en-memhead">
        <p className="en-memintro">
          O que a IA <b>lembra</b> de cada capítulo quando trabalha nos seguintes. Corrija o que estiver errado: um resumo editado por você fica
          travado e a IA não o sobrescreve.
        </p>
        {itens && (
          <span className="en-memconta">
            <span className="pill">
              <b>{conta('atual')}</b> em dia
            </span>
            {conta('desatualizado') > 0 && (
              <span className="pill en-pdes">
                <b>{conta('desatualizado')}</b> desatualizado{conta('desatualizado') === 1 ? '' : 's'}
              </span>
            )}
            {conta('sem-resumo') > 0 && (
              <span className="pill">
                <b>{conta('sem-resumo')}</b> sem resumo
              </span>
            )}
            {travados > 0 && (
              <span className="pill">
                <Mini name="travar" size={12} /> <b>{travados}</b> travado{travados === 1 ? '' : 's'}
              </span>
            )}
          </span>
        )}
      </header>

      {erro && <p className="err">{erro}</p>}
      {!itens && !erro && <p className="label">Carregando a memória…</p>}
      {itens && !lista.length && <div className="empty">Este livro ainda não tem capítulos.</div>}

      <ol className="en-memlist">
        {lista.map((it, i) => {
          const busy = ocupado[it.file]
          const ed = editando === it.file
          const rot = rotuloCapitulo(chapters, it.file)
          return (
            <li key={it.id || it.file} className={`en-mem s-${it.estado}${it.travado ? ' travado' : ''}`} style={{ animationDelay: `${Math.min(i, 12) * 0.03}s` }} aria-busy={!!busy}>
              <div className="en-memh">
                <span className="en-eb">{rot}</span>
                <h2 className="disp">{it.titulo}</h2>
                <span className={`en-memest s-${it.estado}`} title={ESTADO[it.estado].dica}>
                  <i aria-hidden="true" />
                  {ESTADO[it.estado].nome}
                </span>
                {it.travado && (
                  <span className="en-memest travado" title={`Editado por você${it.editadoEm ? ` em ${quando(it.editadoEm)}` : ''}. A IA não sobrescreve.`}>
                    <Mini name="travar" size={12} /> Seu texto
                  </span>
                )}
                <span className="en-rule" aria-hidden="true" />
                <span className="label en-mempal">{it.palavras.toLocaleString('pt-BR')} palavras</span>
              </div>

              {ed ? (
                <textarea
                  ref={area}
                  className="en-texto en-memedit"
                  value={rascunho}
                  aria-label={`Resumo de ${it.titulo}`}
                  placeholder="Quem aparece, o que acontece, o que muda, pistas e ganchos."
                  maxLength={4000}
                  onChange={(e) => setRascunho(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditando(null)
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void salvar(it)
                  }}
                />
              ) : it.resumo ? (
                <p className="en-memtxt">{it.resumo}</p>
              ) : (
                <p className="en-memtxt vazio">{ESTADO[it.estado].dica}</p>
              )}

              {erros[it.file] && <p className="err">{erros[it.file]}</p>}

              <div className="en-acts">
                {ed ? (
                  <>
                    <button type="button" className="btn sm pri" disabled={!!busy} onClick={() => void salvar(it)}>
                      <Mini name="travar" /> {busy ?? 'Salvar e travar'}
                    </button>
                    <button type="button" className="btn sm" onClick={() => setEditando(null)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn sm"
                      disabled={!!busy}
                      onClick={() => {
                        setRascunho(it.resumo)
                        setEditando(it.file)
                      }}
                    >
                      <Mini name="capitulo" /> {it.resumo ? 'Editar' : 'Escrever'}
                    </button>
                    {it.estado !== 'sem-texto' && (
                      <button
                        type="button"
                        className="btn sm"
                        disabled={!!busy}
                        onClick={() => void agir(it, 'Resumindo…', 'memoria.regenerar')}
                        title={it.travado ? 'Pede um resumo novo à IA e substitui o seu texto.' : 'Pede um resumo novo à IA.'}
                      >
                        <Mini name="faisca" /> {busy === 'Resumindo…' ? busy : it.resumo ? 'Regenerar' : 'Gerar'}
                      </button>
                    )}
                    {it.travado && (
                      <button type="button" className="btn sm" disabled={!!busy} onClick={() => void agir(it, 'Destravando…', 'memoria.destravar')}>
                        Destravar
                      </button>
                    )}
                    <button type="button" className="btn sm en-memabrir" onClick={() => onAbrirCapitulo(it.file)}>
                      <Mini name="abrir" /> Abrir capítulo
                    </button>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
