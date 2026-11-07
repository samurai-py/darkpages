import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react'
import type { ChapterInfo, ChapterKind } from '../../../../shared/types'
import { Ico } from './icones'
import { Modal } from './Modal'
import { fmt } from './texto'
import { comoNumeracao, dentroDeParte, numerarItens, romano, rotuloTela, type Numeracao, type RotuloCfg } from '../../../../shared/rotulo'

export interface Metas {
  metaCapitulo: number
  metaLivro: number
}

interface Props {
  capitulos: ChapterInfo[]
  atual: string | null
  /** palavras ao vivo do capítulo aberto */
  palavrasAtual: number
  metas: Metas
  onMetas: (m: Metas) => void
  onAbrir: (file: string) => void
  onCriar: (titulo: string) => Promise<void>
  /** cria uma parte antes do capítulo aberto (ou no fim, sem capítulo aberto) */
  onCriarParte: (titulo: string) => Promise<void>
  onRenomear: (file: string, titulo: string) => Promise<void>
  onMover: (ordem: string[]) => Promise<void>
  onTipo: (file: string, k: ChapterKind) => Promise<void>
  onExcluir: (file: string) => Promise<void>
  onImportar: () => void
  onExportar: () => void
  /** nome dos capítulos e das partes do livro (e se a numeração recomeça por parte) */
  rotulo: RotuloCfg | Numeracao
  /** abre o seletor "Nome dos capítulos…" */
  onNomeCapitulos: () => void
  /** abre a lixeira (Versões) para recuperar capítulos excluídos */
  onLixeira?: () => void
}

/** Número curto na coluna (algarismo, ou romano quando o livro usa romanos). */
export function rotuloCurto(caps: ChapterInfo[], i: number, cfg?: RotuloCfg | Numeracao): string {
  const c = caps[i]
  if (!c) return ''
  if (c.kind === 'prologo') return 'Pról.'
  if (c.kind === 'epilogo') return 'Epíl.'
  const num = comoNumeracao(cfg)
  const n = numerarItens(caps.slice(0, i + 1), num.reiniciar)[i] ?? 0
  const r = c.kind === 'parte' ? num.parte : num.rotulo
  return r.estilo === 'romano' || r.estilo === 'romano-palavra' ? romano(n) : String(n)
}

/** Rótulo completo ("Capítulo um", "Primeiro Círculo", "Prólogo", "Parte um"), em caixa normal. */
export function rotuloLongo(caps: ChapterInfo[], file: string, cfg?: RotuloCfg | Numeracao): string {
  const i = caps.findIndex((c) => c.file === file)
  const c = caps[i]
  if (!c) return ''
  const num = comoNumeracao(cfg)
  const n = numerarItens(caps.slice(0, i + 1), num.reiniciar)[i] ?? 0
  return rotuloTela(c.kind, n, num.rotulo, num.parte) ?? ''
}

const NOME_TIPO: Record<ChapterKind, string> = { capitulo: 'Capítulo', prologo: 'Prólogo', epilogo: 'Epílogo', parte: 'Parte' }

export function ChapterList(p: Props): ReactElement {
  const [novo, setNovo] = useState<string | null>(null)
  const [novoParte, setNovoParte] = useState(false)
  const [menu, setMenu] = useState<string | null>(null)
  const [menuCol, setMenuCol] = useState(false)
  const [renomeando, setRenomeando] = useState<{ file: string; titulo: string } | null>(null)
  const [excluir, setExcluir] = useState<ChapterInfo | null>(null)
  const [editMetas, setEditMetas] = useState(false)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [alvo, setAlvo] = useState<{ file: string; antes: boolean } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const caps = p.capitulos
  const emParte = dentroDeParte(caps)
  const palavras = (c: ChapterInfo): number => (c.file === p.atual ? p.palavrasAtual : c.words)
  const total = caps.reduce((s, c) => s + palavras(c), 0)
  const pct = p.metas.metaLivro > 0 ? Math.min(1, total / p.metas.metaLivro) : 0
  const R = 19
  const circ = 2 * Math.PI * R

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setOcupado(true)
    setErro(null)
    try {
      await fn()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
      setMenu(null)
    }
  }

  const mover = (file: string, delta: number): void => {
    const i = caps.findIndex((c) => c.file === file)
    const j = i + delta
    if (i < 0 || j < 0 || j >= caps.length) return
    const ordem = caps.map((c) => c.file)
    ;[ordem[i], ordem[j]] = [ordem[j]!, ordem[i]!]
    void run(() => p.onMover(ordem))
  }

  const soltar = (): void => {
    if (!arrastando || !alvo || arrastando === alvo.file) return
    const ordem = caps.map((c) => c.file).filter((f) => f !== arrastando)
    let k = ordem.indexOf(alvo.file)
    if (!alvo.antes) k++
    ordem.splice(k, 0, arrastando)
    if (ordem.join('|') !== caps.map((c) => c.file).join('|')) void run(() => p.onMover(ordem))
  }

  const criar = (e: FormEvent): void => {
    e.preventDefault()
    const t = novo?.trim()
    if (!t) return
    void run(async () => {
      await (novoParte ? p.onCriarParte(t) : p.onCriar(t))
      setNovo(null)
      setNovoParte(false)
    })
  }

  return (
    <aside className="ms-caps" aria-label="Capítulos" aria-busy={ocupado}>
      <header className="ms-caps-h">
        <span className="ms-eb">Capítulos · {caps.length}</span>
        <span className="ms-caps-hb">
          <button
            type="button"
            className="ms-ib"
            aria-label="Opções da coluna de capítulos"
            aria-expanded={menuCol}
            onClick={() => setMenuCol((v) => !v)}
          >
            <Ico n="menu" size={16} />
          </button>
          <button
            type="button"
            className="ms-ib ms-ib-acc"
            aria-label="Novo capítulo"
            onClick={() => {
              setNovoParte(false)
              setNovo((v) => (v === null || novoParte ? '' : null))
            }}
          >
            <Ico n="mais" size={16} />
          </button>
          {menuCol && (
            <div className="ms-menu panel ms-menu-col" role="menu" onKeyDown={(e) => e.key === 'Escape' && setMenuCol(false)}>
              <button type="button" role="menuitem" onClick={() => (setMenuCol(false), setNovoParte(true), setNovo(''))}>
                <Ico n="mais" size={14} /> Nova parte…
              </button>
              <button type="button" role="menuitem" onClick={() => (setMenuCol(false), p.onNomeCapitulos())}>
                <Ico n="lapis" size={14} /> Nome dos capítulos e partes…
              </button>
              {p.onLixeira && (
                <button type="button" role="menuitem" onClick={() => (setMenuCol(false), p.onLixeira?.())}>
                  <Ico n="lixeira" size={14} /> Lixeira…
                </button>
              )}
            </div>
          )}
        </span>
      </header>

      {novo !== null && (
        <form className="ms-novo" onSubmit={criar}>
          <label className="ms-sr" htmlFor="ms-novo-t">
            {novoParte ? 'Título da nova parte (entra antes do capítulo aberto)' : 'Título do novo capítulo'}
          </label>
          <input
            id="ms-novo-t"
            className="input"
            autoFocus
            placeholder={novoParte ? 'Título da nova parte' : 'Título do novo capítulo'}
            title={novoParte ? 'A parte entra antes do capítulo aberto; os capítulos seguintes passam a pertencer a ela.' : undefined}
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setNovo(null), setNovoParte(false))}
          />
          <button type="submit" className="btn sm pri" disabled={!novo.trim() || ocupado}>
            Criar
          </button>
        </form>
      )}

      <ol className="ms-lista" onDragLeave={() => setAlvo(null)}>
        {caps.map((c, i) => {
          const w = palavras(c)
          const prog = p.metas.metaCapitulo > 0 ? Math.min(1, w / p.metas.metaCapitulo) : 0
          const aberto = menu === c.file
          const cls = ['ms-ch']
          const parte = c.kind === 'parte'
          if (parte) cls.push('ms-parte')
          else if (emParte[i]) cls.push('em-parte')
          if (arrastando === c.file) cls.push('drag')
          if (alvo?.file === c.file) cls.push(alvo.antes ? 'alvo-antes' : 'alvo-depois')
          return (
            <li
              key={c.file}
              className={cls.join(' ')}
              draggable={!renomeando}
              onDragStart={(e) => {
                setArrastando(c.file)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', c.title)
              }}
              onDragEnd={() => {
                setArrastando(null)
                setAlvo(null)
              }}
              onDragOver={(e) => {
                if (!arrastando) return
                e.preventDefault()
                const r = e.currentTarget.getBoundingClientRect()
                setAlvo({ file: c.file, antes: e.clientY < r.top + r.height / 2 })
              }}
              onDrop={(e) => {
                e.preventDefault()
                soltar()
                setArrastando(null)
                setAlvo(null)
              }}
            >
              {renomeando?.file === c.file ? (
                <form
                  className="ms-ren"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const t = renomeando.titulo.trim()
                    if (!t) return
                    void run(async () => {
                      await p.onRenomear(c.file, t)
                      setRenomeando(null)
                    })
                  }}
                >
                  <label className="ms-sr" htmlFor={`ren-${c.file}`}>
                    Novo título
                  </label>
                  <input
                    id={`ren-${c.file}`}
                    className="input"
                    autoFocus
                    value={renomeando.titulo}
                    onChange={(e) => setRenomeando({ file: c.file, titulo: e.target.value })}
                    onKeyDown={(e) => e.key === 'Escape' && setRenomeando(null)}
                  />
                  <button type="submit" className="btn sm pri">
                    OK
                  </button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    className="ms-ch-b"
                    aria-current={c.file === p.atual ? 'true' : undefined}
                    onClick={() => p.onAbrir(c.file)}
                    onDoubleClick={() => setRenomeando({ file: c.file, titulo: c.title })}
                  >
                    {parte ? (
                      <>
                        <span className="ms-parte-r">{rotuloLongo(caps, c.file, p.rotulo) || 'Parte'}</span>
                        <span className="ms-ch-t">{c.title}</span>
                      </>
                    ) : (
                      <>
                        <span className={`ms-ch-n${c.kind !== 'capitulo' ? ' esp' : ''}`} title={rotuloLongo(caps, c.file, p.rotulo)}>
                          {rotuloCurto(caps, i, p.rotulo)}
                        </span>
                        <span className="ms-ch-m">
                          <span className="ms-ch-t">{c.title}</span>
                          <span
                            className="ms-bar"
                            role="progressbar"
                            aria-label={`Progresso de ${c.title}`}
                            aria-valuemin={0}
                            aria-valuemax={p.metas.metaCapitulo}
                            aria-valuenow={w}
                          >
                            <span style={{ width: `${prog * 100}%` }} />
                          </span>
                        </span>
                        <span className="ms-ch-w">{fmt(w)}</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="ms-ib ms-ch-menu"
                    aria-label={`Ações de ${c.title}`}
                    aria-expanded={aberto}
                    onClick={() => setMenu(aberto ? null : c.file)}
                  >
                    <Ico n="menu" size={16} />
                  </button>
                  {aberto && (
                    <div className="ms-menu panel" role="menu" onKeyDown={(e) => e.key === 'Escape' && setMenu(null)}>
                      <button type="button" role="menuitem" onClick={() => (setRenomeando({ file: c.file, titulo: c.title }), setMenu(null))}>
                        <Ico n="lapis" size={14} /> Renomear
                      </button>
                      <button type="button" role="menuitem" disabled={i === 0 || ocupado} onClick={() => mover(c.file, -1)}>
                        <Ico n="subir" size={14} /> Subir
                      </button>
                      <button type="button" role="menuitem" disabled={i === caps.length - 1 || ocupado} onClick={() => mover(c.file, 1)}>
                        <Ico n="descer" size={14} /> Descer
                      </button>
                      <span className="ms-menu-sep" />
                      {(['capitulo', 'prologo', 'epilogo', 'parte'] as ChapterKind[]).map((k) => (
                        <button
                          key={k}
                          type="button"
                          role="menuitemradio"
                          aria-checked={c.kind === k}
                          disabled={ocupado}
                          onClick={() => c.kind !== k && void run(() => p.onTipo(c.file, k))}
                        >
                          <span className="ms-radio" aria-hidden="true" />
                          {NOME_TIPO[k]}
                        </button>
                      ))}
                      <span className="ms-menu-sep" />
                      <button type="button" role="menuitem" className="ms-perigo" onClick={() => (setExcluir(c), setMenu(null))}>
                        <Ico n="lixeira" size={14} /> Excluir…
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ol>

      {erro && (
        <p className="err ms-caps-err" role="alert">
          {erro}
        </p>
      )}

      <div className="ms-caps-acoes">
        <button type="button" className="btn sm" onClick={p.onImportar}>
          <Ico n="importar" size={15} /> Importar
        </button>
        <button type="button" className="btn sm" onClick={p.onExportar} disabled={caps.length === 0}>
          <Ico n="exportar" size={15} /> Exportar
        </button>
      </div>

      <button type="button" className="ms-meta" onClick={() => setEditMetas(true)} aria-label={`Progresso do livro: ${Math.round(pct * 100)}% da meta. Editar metas`}>
        <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
          <circle cx="23" cy="23" r={R} fill="none" strokeWidth="4" className="ms-ring-bg" />
          <circle
            cx="23"
            cy="23"
            r={R}
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct)}
            transform="rotate(-90 23 23)"
            className="ms-ring"
          />
        </svg>
        <span className="ms-meta-t">
          <strong>{fmt(total)} palavras</strong>
          <span>
            {Math.round(pct * 100)}% da meta · {caps.filter((c) => c.kind === 'capitulo').length} capítulos
          </span>
        </span>
      </button>

      {editMetas && <MetasForm metas={p.metas} onClose={() => setEditMetas(false)} onSave={(m) => (p.onMetas(m), setEditMetas(false))} />}

      {excluir && (
        <Modal titulo={excluir.kind === 'parte' ? 'Excluir parte' : 'Excluir capítulo'} onClose={() => setExcluir(null)}>
          <ConfirmaExcluir
            cap={excluir}
            onCancel={() => setExcluir(null)}
            onOk={() =>
              void run(async () => {
                await p.onExcluir(excluir.file)
                setExcluir(null)
              })
            }
          />
        </Modal>
      )}
    </aside>
  )
}

function ConfirmaExcluir({ cap, onCancel, onOk }: { cap: ChapterInfo; onCancel: () => void; onOk: () => void }): ReactElement {
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => cancel.current?.focus(), [])
  return (
    <>
      <p className="ms-modal-p">
        Excluir <b>“{cap.title}”</b> ({fmt(cap.words)} palavras)? O arquivo sai do livro e vai para a lixeira da Arca
        (<code>.arca/lixeira</code>), de onde pode ser recuperado em <b>Lixeira…</b>, no menu da coluna.
      </p>
      <div className="ms-row">
        <button ref={cancel} type="button" className="btn sm" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="btn sm pri" onClick={onOk}>
          Excluir capítulo
        </button>
      </div>
    </>
  )
}

function MetasForm({ metas, onClose, onSave }: { metas: Metas; onClose: () => void; onSave: (m: Metas) => void }): ReactElement {
  const [cap, setCap] = useState(String(metas.metaCapitulo))
  const [livro, setLivro] = useState(String(metas.metaLivro))
  return (
    <Modal titulo="Metas de palavras" onClose={onClose} largura={380}>
      <form
        className="ms-form"
        onSubmit={(e) => {
          e.preventDefault()
          onSave({ metaCapitulo: Math.max(0, Math.round(Number(cap) || 0)), metaLivro: Math.max(0, Math.round(Number(livro) || 0)) })
        }}
      >
        <label className="field">
          Meta por capítulo
          <input className="input" type="number" min={0} step={100} value={cap} onChange={(e) => setCap(e.target.value)} />
        </label>
        <label className="field">
          Meta do livro
          <input className="input" type="number" min={0} step={1000} value={livro} onChange={(e) => setLivro(e.target.value)} />
        </label>
        <div className="ms-row">
          <button type="button" className="btn sm" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn sm pri">
            Salvar metas
          </button>
        </div>
      </form>
    </Modal>
  )
}
