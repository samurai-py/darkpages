import { useEffect, useId, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactElement } from 'react'
import type { Cartao, CartaoTipo, EnredoBoard, Ficha, Ligacao } from '../../../../shared/models'
import type { ChapterInfo } from '../../../../shared/types'
import { estadoFio } from '../../../../shared/narrativa'
import { TIPO_ROTULO, porNome } from '../universo/fichas'
import { Mini } from '../universo/icons'
import { CARTAO_ROTULO, CARTAO_TIPOS, LIGACAO_ROTULO, rotuloCapitulo, rotuloPorId } from './board'
import { ESTADO_ROTULO } from './Selo'
import { enviarImagemCartao, imagemDe, useImagemCartao } from './imagem'

const EXPLICA_ESTADO: Record<Cartao['estado'], string> = {
  canonico: 'Faz parte do plano do livro: a IA trata como planejamento.',
  provisorio: 'Ideia ainda não aceita: a IA vê marcada como provisória, nunca como fato do livro.',
  descartado: 'Fica no quadro, mas a IA não vê.'
}

export interface CartaoPanelProps {
  /** pasta do livro (imagens dos cartões em assets/) */
  dir: string
  board: EnredoBoard
  cartaoId?: string
  ligacaoId?: string
  fichas: Ficha[]
  chapters: ChapterInfo[]
  focar: boolean
  onCartao: (c: Cartao) => void
  /** troca (nome) ou tira (undefined) a imagem do cartão; quem chama apaga a antiga se ficou sem uso */
  onImagem: (id: string, nome: string | undefined) => void
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

      <SecaoImagem dir={props.dir} c={c} onImagem={props.onImagem} />

      {c.tipo === 'fato' && <SecaoFato c={c} fichas={ordenadas} chapters={chapters} set={set} />}

      <SecaoFio c={c} chapters={chapters} set={set} />

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

/** Imagem do cartão: escolher arquivo, soltar ou colar; prévia, trocar e remover. */
function SecaoImagem({
  dir,
  c,
  onImagem
}: {
  dir: string
  c: Cartao
  onImagem: (id: string, nome: string | undefined) => void
}): ReactElement {
  const uid = useId()
  const arquivo = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [sobre, setSobre] = useState(false)
  const url = useImagemCartao(dir, c.imagem)

  useEffect(() => {
    setErro('')
    setSobre(false)
  }, [c.id])

  const enviar = async (file: File | null): Promise<void> => {
    if (!file) {
      setErro('Use uma imagem PNG, JPEG ou WebP.')
      return
    }
    const id = c.id
    setErro('')
    setEnviando(true)
    try {
      onImagem(id, await enviarImagemCartao(dir, id, file))
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviando(false)
    }
  }

  const temArquivos = (e: DragEvent): boolean => e.dataTransfer.types.includes('Files')
  const onDragOver = (e: DragEvent): void => {
    if (!temArquivos(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setSobre(true)
  }
  const onDrop = (e: DragEvent): void => {
    if (!temArquivos(e)) return
    e.preventDefault()
    setSobre(false)
    void enviar(imagemDe(e.dataTransfer.files))
  }
  const onPaste = (e: ClipboardEvent): void => {
    const f = imagemDe(e.clipboardData.files)
    if (!f) return
    e.preventDefault()
    void enviar(f)
  }

  return (
    <section className="en-sec" aria-labelledby={`${uid}-i`}>
      <h3 className="en-eb" id={`${uid}-i`}>
        <Mini name="imagem" size={14} /> Imagem
      </h3>
      <div
        className={`en-img${sobre ? ' drop' : ''}${c.imagem ? ' tem' : ''}`}
        tabIndex={0}
        role="group"
        aria-label={c.imagem ? 'Imagem do cartão. Solte ou cole outra para trocar.' : 'Sem imagem. Solte ou cole uma imagem aqui.'}
        aria-busy={enviando}
        onDragOver={onDragOver}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) setSobre(false)
        }}
        onDrop={onDrop}
        onPaste={onPaste}
      >
        {c.imagem && url && <img src={url} alt={`Imagem do cartão ${c.titulo || ''}`.trim()} draggable={false} />}
        {c.imagem && url === null && <span className="label">Arquivo “{c.imagem}” não encontrado em assets/.</span>}
        {!c.imagem && (
          <span className="en-img-vazio">
            <Mini name="imagem" size={22} />
            {enviando ? 'Enviando…' : 'Solte, cole (Ctrl+V) ou escolha uma imagem'}
          </span>
        )}
        {c.imagem && enviando && <span className="en-img-msg">Enviando…</span>}
      </div>
      <div className="en-acts">
        <button type="button" className="btn sm" disabled={enviando} onClick={() => arquivo.current?.click()}>
          <Mini name="imagem" /> {c.imagem ? 'Trocar imagem' : 'Escolher imagem'}
        </button>
        {c.imagem && (
          <button type="button" className="btn sm" disabled={enviando} onClick={() => onImagem(c.id, undefined)}>
            <Mini name="lixo" /> Remover imagem
          </button>
        )}
      </div>
      <input
        ref={arquivo}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          e.target.value = ''
          if (f) void enviar(imagemDe([f]))
        }}
      />
      {erro && (
        <p className="err" role="alert">
          {erro}
        </p>
      )}
      <p className="en-estado-txt">Fica em assets/ do livro. Só aparece no Enredo: a IA não vê imagens.</p>
    </section>
  )
}

/** Seletor de capítulo pelo id estável (os rótulos seguem o nome dos capítulos do livro). */
function CapituloPorId({
  chapters,
  valor,
  vazio,
  rotulo,
  onChange
}: {
  chapters: ChapterInfo[]
  valor: string | undefined
  vazio: string
  rotulo: string
  onChange: (id: string | undefined) => void
}): ReactElement {
  return (
    <select className="select" aria-label={rotulo} value={valor ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">{vazio}</option>
      {valor && !chapters.some((ch) => ch.id === valor) && <option value={valor}>(capítulo removido)</option>}
      {chapters.map((ch) => (
        <option key={ch.id} value={ch.id}>
          {rotuloPorId(chapters, ch.id)}
        </option>
      ))}
    </select>
  )
}

/** Cartão "fato": de quem é a afirmação, quando o leitor pode saber e as palavras que o entregam. */
function SecaoFato({
  c,
  fichas,
  chapters,
  set
}: {
  c: Cartao
  fichas: Ficha[]
  chapters: ChapterInfo[]
  set: (patch: Partial<Cartao>) => void
}): ReactElement {
  const uid = useId()
  const [termo, setTermo] = useState('')
  const termos = c.termos ?? []
  const crenca = c.perspectiva?.tipo === 'crenca' ? c.perspectiva : null
  const personagens = fichas.filter((f) => f.tipo === 'personagem' || f.tipo === 'divindade' || f.tipo === 'grupo')

  useEffect(() => setTermo(''), [c.id])

  const addTermo = (): void => {
    const t = termo.trim()
    if (t && !termos.some((x) => x.toLowerCase() === t.toLowerCase())) set({ termos: [...termos, t] })
    setTermo('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTermo()
    } else if (e.key === 'Backspace' && !termo && termos.length) set({ termos: termos.slice(0, -1) })
  }

  return (
    <section className="en-sec en-fato" aria-labelledby={`${uid}-t`}>
      <h3 className="en-eb" id={`${uid}-t`}>
        <Mini name="fato" size={14} /> Fato
      </h3>
      <fieldset className="en-fs">
        <legend className="en-sr">De quem é</legend>
        <label className="check">
          <input type="radio" name={`${uid}-p`} checked={!crenca} onChange={() => set({ perspectiva: { tipo: 'verdade' } })} />
          Verdade do livro
        </label>
        <label className="check">
          <input
            type="radio"
            name={`${uid}-p`}
            checked={!!crenca}
            disabled={!personagens.length}
            onChange={() => {
              const f = personagens[0]
              if (f) set({ perspectiva: { tipo: 'crenca', fichaId: f.id } })
            }}
          />
          Crença ou afirmação de um personagem
        </label>
        {crenca && (
          <select
            className="select"
            aria-label="Quem acredita ou afirma"
            value={crenca.fichaId}
            onChange={(e) => set({ perspectiva: { tipo: 'crenca', fichaId: e.target.value } })}
          >
            {!fichas.some((f) => f.id === crenca.fichaId) && <option value={crenca.fichaId}>(ficha ausente)</option>}
            {personagens.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        )}
        <p className="en-estado-txt">
          {crenca
            ? 'A IA recebe “fulano acredita/afirma…”, não como verdade: deixa de corrigir o texto quando ele narra essa crença.'
            : 'A IA trata como fato do livro a partir do capítulo de revelação; antes dele, como segredo que não pode vazar.'}
        </p>
      </fieldset>
      <label className="field">
        O leitor pode saber a partir de
        <CapituloPorId chapters={chapters} valor={c.revelarEm} vazio="Desde o início do livro" rotulo="Capítulo da revelação" onChange={(id) => set({ revelarEm: id })} />
      </label>
      <div className="field">
        <span id={`${uid}-w`}>Palavras que entregam o fato</span>
        <div className="en-chips" role="group" aria-labelledby={`${uid}-w`}>
          {termos.map((t) => (
            <span key={t} className="pill en-pchip">
              <b>{t}</b>
              <button type="button" className="en-px" aria-label={`Remover ${t}`} onClick={() => set({ termos: termos.filter((x) => x !== t) })}>
                <Mini name="fechar" size={12} />
              </button>
            </span>
          ))}
          <input
            className="en-chipin"
            value={termo}
            placeholder={termos.length ? 'mais uma…' : 'nome, apelido, palavra'}
            aria-label="Nova palavra que entrega o fato (Enter para adicionar)"
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={onKey}
            onBlur={addTermo}
          />
        </div>
        <p className="en-estado-txt">
          {c.revelarEm
            ? 'O app avisa (Revisor, continuidade e insights) quando alguma aparece antes do capítulo da revelação. Ignora acento e maiúsculas.'
            : 'Escolha o capítulo da revelação para o app vigiar estas palavras.'}
        </p>
      </div>
    </section>
  )
}

const FIO_ROTULO = { aberto: 'Aberto', resolvido: 'Resolvido', atrasado: 'Atrasado' } as const

/** Fio solto: qualquer cartão pode ser uma promessa ou pergunta ao leitor. */
function SecaoFio({ c, chapters, set }: { c: Cartao; chapters: ChapterInfo[]; set: (patch: Partial<Cartao>) => void }): ReactElement {
  const uid = useId()
  const est = estadoFio(c, chapters)
  return (
    <section className={`en-sec en-fio${est ? ` f-${est}` : ''}`} aria-labelledby={`${uid}-f`}>
      <label className="check" id={`${uid}-f`}>
        <input
          type="checkbox"
          checked={!!c.fio}
          onChange={(e) => {
            if (e.target.checked) set({ fio: { status: 'aberto' } })
            else {
              const { fio: _f, ...resto } = c
              set({ ...resto, fio: undefined })
            }
          }}
        />
        <Mini name="fio" size={15} /> Fio solto (promessa ou pergunta ao leitor)
      </label>
      {c.fio && (
        <>
          <div className="en-grid2">
            <label className="field">
              Situação
              <select className="select" value={c.fio.status} onChange={(e) => set({ fio: { ...c.fio, status: e.target.value === 'resolvido' ? 'resolvido' : 'aberto' } })}>
                <option value="aberto">Aberto</option>
                <option value="resolvido">Resolvido</option>
              </select>
            </label>
            <label className="field">
              Resolve em
              <CapituloPorId
                chapters={chapters}
                valor={c.fio.resolveEm}
                vazio="Ainda não sei"
                rotulo="Capítulo onde o fio se resolve"
                onChange={(id) => set({ fio: { status: c.fio?.status ?? 'aberto', ...(id ? { resolveEm: id } : {}) } })}
              />
            </label>
          </div>
          <p className="en-estado-txt">
            {est === 'atrasado'
              ? `${FIO_ROTULO.atrasado}: o livro já passou de ${rotuloPorId(chapters, c.fio.resolveEm, false)} e o fio continua aberto.`
              : c.capitulo
                ? `Plantado em ${rotuloCapitulo(chapters, c.capitulo)}.`
                : 'Ligue o cartão a um capítulo para marcar onde o fio foi plantado.'}
          </p>
        </>
      )}
    </section>
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
