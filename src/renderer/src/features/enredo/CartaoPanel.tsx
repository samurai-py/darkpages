import { useEffect, useId, useRef, useState, type ReactElement } from 'react'
import type { Cartao, CartaoTipo, EnredoBoard, Ficha, Ligacao } from '../../../../shared/models'
import type { ChapterInfo } from '../../../../shared/types'
import { TIPO_ROTULO, porNome } from '../universo/fichas'
import { Mini } from '../universo/icons'
import { CARTAO_ROTULO, CARTAO_TIPOS, LIGACAO_ROTULO, rotuloCapitulo } from './board'
import { ESTADO_ROTULO } from './Selo'

const EXPLICA_ESTADO: Record<Cartao['estado'], string> = {
  canonico: 'Faz parte do plano do livro: a IA trata como planejamento.',
  provisorio: 'Ideia ainda não aceita: a IA vê marcada como provisória, nunca como fato do livro.',
  descartado: 'Fica no quadro, mas a IA não vê.'
}

export interface CartaoPanelProps {
  board: EnredoBoard
  cartaoId?: string
  ligacaoId?: string
  fichas: Ficha[]
  chapters: ChapterInfo[]
  focar: boolean
  onCartao: (c: Cartao) => void
  /** muda o capítulo do cartão (vai para o fim do roteiro do capítulo) */
  onMoverPara: (id: string, capitulo: string) => void
  onLigacao: (l: Ligacao) => void
  onExcluirCartao: (id: string) => void
  onExcluirLigacao: (id: string) => void
  onSelCartao: (id: string) => void
  onSelLigacao: (id: string) => void
  onAbrirCapitulo: (file: string) => void
  onAbrirFicha: (id: string) => void
  onFechar: () => void
}

function tituloDe(c: Cartao | undefined, fichas: Ficha[]): string {
  if (!c) return '(cartão removido)'
  return c.titulo || fichas.find((f) => f.id === c.fichas[0])?.nome || CARTAO_ROTULO[c.tipo].um
}

export function CartaoPanel(props: CartaoPanelProps): ReactElement | null {
  const { board, fichas } = props
  const c = props.cartaoId ? board.cartoes.find((x) => x.id === props.cartaoId) : undefined
  const l = props.ligacaoId ? board.ligacoes.find((x) => x.id === props.ligacaoId) : undefined
  if (c) return <PainelCartao {...props} c={c} />
  if (l) return <PainelLigacao {...props} l={l} fichas={fichas} />
  return null
}

function PainelCartao(props: CartaoPanelProps & { c: Cartao }): ReactElement {
  const { c, board, fichas, chapters, onCartao } = props
  const uid = useId()
  const tituloRef = useRef<HTMLInputElement>(null)
  const [confirmar, setConfirmar] = useState(false)
  const [addFicha, setAddFicha] = useState('')

  useEffect(() => {
    setConfirmar(false)
    setAddFicha('')
    if (props.focar) {
      tituloRef.current?.focus()
      tituloRef.current?.select()
    }
  }, [c.id])

  const set = (patch: Partial<Cartao>): void => onCartao({ ...c, ...patch })
  const ordenadas = [...fichas].sort(
    (a, b) => Number(b.tipo === 'personagem') - Number(a.tipo === 'personagem') || porNome(a, b)
  )
  const ligadas = c.fichas.map((id) => fichas.find((f) => f.id === id)).filter((f): f is Ficha => !!f)
  const livres = ordenadas.filter((f) => !c.fichas.includes(f.id))
  const ligacoes = board.ligacoes.filter((x) => x.de === c.id || x.para === c.id)
  const principal = c.tipo === 'personagem' ? c.fichas[0] ?? '' : ''

  const setCapitulo = (file: string): void => props.onMoverPara(c.id, file)

  return (
    <aside className="en-aside" aria-label="Cartão selecionado">
      <header className="en-ahead">
        <span className="en-eb">
          <Mini name={c.tipo} size={14} /> {CARTAO_ROTULO[c.tipo].um}
          {c.capitulo && ` · ${rotuloCapitulo(chapters, c.capitulo)}`}
        </span>
        <button type="button" className="en-ico" onClick={props.onFechar} aria-label="Fechar painel">
          <Mini name="fechar" />
        </button>
      </header>

      <input
        ref={tituloRef}
        className="en-atitulo disp"
        value={c.titulo}
        aria-label="Título do cartão"
        placeholder={c.tipo === 'personagem' ? 'papel na trama (opcional)' : 'Título'}
        onChange={(e) => set({ titulo: e.target.value })}
      />

      <section className={`en-estado s-${c.estado}`} aria-labelledby={`${uid}-e`}>
        <span className="en-eb" id={`${uid}-e`}>
          <Mini name={c.estado === 'descartado' ? 'descartar' : c.estado === 'provisorio' ? 'provisorio' : 'canonico'} size={14} />
          {c.origem === 'ia' ? 'Veio da IA' : 'Do autor'} · {ESTADO_ROTULO[c.estado]}
        </span>
        <p className="en-estado-txt">{EXPLICA_ESTADO[c.estado]}</p>
        <div className="en-acts">
          {c.estado !== 'canonico' && (
            <button type="button" className="btn sm pri" onClick={() => set({ estado: 'canonico' })}>
              <Mini name="canonico" /> Tornar canônico
            </button>
          )}
          {c.estado === 'canonico' && (
            <button type="button" className="btn sm" onClick={() => set({ estado: 'provisorio' })}>
              <Mini name="provisorio" /> Marcar provisório
            </button>
          )}
          {c.estado !== 'descartado' ? (
            <button type="button" className="btn sm" onClick={() => set({ estado: 'descartado' })}>
              <Mini name="descartar" /> Descartar
            </button>
          ) : (
            <button type="button" className="btn sm" onClick={() => set({ estado: 'provisorio' })}>
              <Mini name="provisorio" /> Recuperar como provisório
            </button>
          )}
        </div>
      </section>

      <div className="en-grid2">
        <label className="field">
          Tipo
          <select className="select" value={c.tipo} onChange={(e) => set({ tipo: e.target.value as CartaoTipo })}>
            {CARTAO_TIPOS.map((t) => (
              <option key={t} value={t}>
                {CARTAO_ROTULO[t].um}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Capítulo
          <select className="select" value={c.capitulo ?? ''} onChange={(e) => setCapitulo(e.target.value)}>
            <option value="">Sem capítulo</option>
            {c.capitulo && !chapters.some((ch) => ch.file === c.capitulo) && <option value={c.capitulo}>(capítulo removido)</option>}
            {chapters.map((ch) => (
              <option key={ch.file} value={ch.file}>
                {rotuloCapitulo(chapters, ch.file)} — {ch.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {c.tipo === 'personagem' && (
        <label className="field">
          Ficha do personagem
          <select
            className="select"
            value={principal}
            onChange={(e) => {
              const id = e.target.value
              set({ fichas: id ? [id, ...c.fichas.filter((x) => x !== id)] : c.fichas.slice(1) })
            }}
          >
            <option value="">— escolher —</option>
            {ordenadas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome} · {TIPO_ROTULO[f.tipo].um}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="field">
        Texto
        <textarea
          className="en-texto"
          value={c.texto}
          placeholder="O que acontece, por que importa…"
          onChange={(e) => set({ texto: e.target.value })}
        />
      </label>

      <section className="en-sec">
        <h3 className="en-eb" id={`${uid}-f`}>
          Fichas ligadas
        </h3>
        <div className="en-chips" role="group" aria-labelledby={`${uid}-f`}>
          {ligadas.length === 0 && <span className="label">Nenhuma.</span>}
          {ligadas.map((f) => (
            <span key={f.id} className="pill en-pchip">
              <button type="button" className="en-plink" onClick={() => props.onAbrirFicha(f.id)} aria-label={`Abrir ficha de ${f.nome}`}>
                <b>{f.nome}</b>
              </button>
              <button
                type="button"
                className="en-px"
                aria-label={`Desligar ${f.nome}`}
                onClick={() => set({ fichas: c.fichas.filter((x) => x !== f.id) })}
              >
                <Mini name="fechar" size={12} />
              </button>
            </span>
          ))}
        </div>
        {livres.length > 0 && (
          <select
            className="select"
            aria-label="Ligar ficha"
            value={addFicha}
            onChange={(e) => {
              const id = e.target.value
              if (id) set({ fichas: [...c.fichas, id] })
              setAddFicha('')
            }}
          >
            <option value="">+ ligar ficha…</option>
            {livres.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome} · {TIPO_ROTULO[f.tipo].um}
              </option>
            ))}
          </select>
        )}
        {fichas.length === 0 && <p className="label">Crie fichas no Universo para ligá-las aqui.</p>}
      </section>

      <div className="en-acts">
        {c.capitulo && chapters.some((ch) => ch.file === c.capitulo) && (
          <button type="button" className="btn sm" onClick={() => c.capitulo && props.onAbrirCapitulo(c.capitulo)}>
            <Mini name="capitulo" /> Abrir capítulo
          </button>
        )}
        {c.tipo === 'personagem' && principal && (
          <button type="button" className="btn sm" onClick={() => props.onAbrirFicha(principal)}>
            <Mini name="personagem" /> Abrir ficha
          </button>
        )}
      </div>

      {ligacoes.length > 0 && (
        <section className="en-sec">
          <h3 className="en-eb">Ligações</h3>
          <ul className="en-ligs">
            {ligacoes.map((x) => {
              const sai = x.de === c.id
              const outro = board.cartoes.find((y) => y.id === (sai ? x.para : x.de))
              return (
                <li key={x.id}>
                  <button type="button" className="en-lig" onClick={() => props.onSelLigacao(x.id)}>
                    <span className={`en-ltipo ${x.tipo}`} aria-hidden="true" />
                    <span>
                      {sai ? '→' : '←'} {tituloDe(outro, fichas)}
                      {x.rotulo && <span className="label"> · {x.rotulo}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div className="en-danger">
        {!confirmar ? (
          <button type="button" className="btn sm" onClick={() => setConfirmar(true)}>
            <Mini name="lixo" /> Excluir cartão
          </button>
        ) : (
          <div className="en-confirm" role="alertdialog" aria-label="Confirmar exclusão">
            <span>
              Excluir <b>{tituloDe(c, fichas)}</b>
              {ligacoes.length > 0 && ` e ${ligacoes.length} ${ligacoes.length === 1 ? 'ligação' : 'ligações'}`}?
            </span>
            <div className="en-row">
              <button type="button" className="btn sm pri" autoFocus onClick={() => props.onExcluirCartao(c.id)}>
                Excluir
              </button>
              <button type="button" className="btn sm" onClick={() => setConfirmar(false)}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

function PainelLigacao(props: CartaoPanelProps & { l: Ligacao; fichas: Ficha[] }): ReactElement {
  const { l, board, fichas, onLigacao } = props
  const uid = useId()
  const de = board.cartoes.find((c) => c.id === l.de)
  const para = board.cartoes.find((c) => c.id === l.para)
  const set = (patch: Partial<Ligacao>): void => onLigacao({ ...l, ...patch })
  return (
    <aside className="en-aside" aria-label="Ligação selecionada">
      <header className="en-ahead">
        <span className="en-eb">
          <Mini name="ligar" size={14} /> Ligação
        </span>
        <button type="button" className="en-ico" onClick={props.onFechar} aria-label="Fechar painel">
          <Mini name="fechar" />
        </button>
      </header>
      <div className="en-ends">
        <button type="button" className="en-end" onClick={() => de && props.onSelCartao(de.id)}>
          {tituloDe(de, fichas)}
        </button>
        <span className="en-arrow" aria-label="para">
          →
        </span>
        <button type="button" className="en-end" onClick={() => para && props.onSelCartao(para.id)}>
          {tituloDe(para, fichas)}
        </button>
      </div>
      <label className="field">
        Rótulo
        <input
          className="input"
          value={l.rotulo}
          placeholder={l.tipo === 'causa' ? 'leva a, provoca…' : 'aprendiz, irmã, traiu…'}
          autoFocus
          onChange={(e) => set({ rotulo: e.target.value })}
        />
      </label>
      <fieldset className="en-fs">
        <legend className="en-eb" id={`${uid}-t`}>
          Tipo
        </legend>
        {(['relacao', 'causa'] as const).map((t) => (
          <label key={t} className="check">
            <input type="radio" name={`${uid}-tipo`} checked={l.tipo === t} onChange={() => set({ tipo: t })} />
            <span className={`en-ltipo ${t}`} aria-hidden="true" />
            {LIGACAO_ROTULO[t]}
          </label>
        ))}
      </fieldset>
      <div className="en-acts">
        <button type="button" className="btn sm" onClick={() => set({ de: l.para, para: l.de })}>
          Inverter sentido
        </button>
        <button type="button" className="btn sm" onClick={() => props.onExcluirLigacao(l.id)}>
          <Mini name="lixo" /> Excluir ligação
        </button>
      </div>
    </aside>
  )
}
