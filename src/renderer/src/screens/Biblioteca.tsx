import { useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { folio, isWeb } from '../api'
import type { Project, RecentProject } from '../../../shared/types'
import type { NavParams, Screen } from '../screen'
import { bibliotecaApi, errMsg, relTime, syncApi, type Destaque } from '../features/sync/api'
import { CapaTipografica } from '../features/sync/biblioteca/Capa'
import { Semana } from '../features/sync/biblioteca/Semana'
import { Norte } from '../features/sync/biblioteca/Norte'
import { Inspiracoes } from '../features/sync/biblioteca/Inspiracoes'
import { Trilha } from '../features/sync/biblioteca/Trilha'
import './biblioteca.css'

interface Metas {
  palavras?: number
}

interface Featured {
  project: Project
  destaque: Destaque | null
  dias: Record<string, number>
  meta: number | null
}

const fmt = (n: number): string => n.toLocaleString('pt-BR')

function cabecalho(d = new Date()): { data: string; saudacao: string } {
  const data = d
    .toLocaleString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    .replace(/,? às /, ' · ')
    .replace(/, /, ' · ')
  const h = d.getHours()
  const saudacao = h < 5 || h >= 18 ? 'Boa noite.' : h < 12 ? 'Bom dia.' : 'Boa tarde.'
  return { data: data.charAt(0).toUpperCase() + data.slice(1), saudacao }
}

/** Espera no máximo `ms`; depois segue sem o resultado. */
function comLimite<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((ok) => setTimeout(() => ok(null), ms))])
}

export function Biblioteca({ onOpen, go }: { onOpen: (p: Project) => void; go: (s: Screen, params?: NavParams) => void }): ReactElement {
  const [recents, setRecents] = useState<RecentProject[] | null>(null)
  const [feat, setFeat] = useState<Featured | null>(null)
  const [featErro, setFeatErro] = useState<string | null>(null)
  const [novo, setNovo] = useState(false)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [editMeta, setEditMeta] = useState(false)
  const [metaIn, setMetaIn] = useState('')

  useEffect(() => {
    let vivo = true
    void (async () => {
      let list: RecentProject[] = []
      try {
        list = await folio.recents()
      } catch (e) {
        if (vivo) setError(errMsg(e))
      }
      if (!vivo) return
      setRecents(list)
      const first = list[0]
      if (!first) {
        setNovo(true)
        return
      }
      try {
        // abrir autoriza a leitura das coleções do livro
        const project = await folio.open(first.dir)
        const [destaque, diario, metas] = await Promise.all([
          bibliotecaApi.destaque(project.dir).catch(() => null),
          bibliotecaApi.registrar(project.dir).catch(() => ({ dias: {} })),
          folio.docs.get<Metas>(project.dir, 'config', 'metas').catch(() => null)
        ])
        if (!vivo) return
        setFeat({ project, destaque, dias: diario.dias, meta: typeof metas?.palavras === 'number' ? metas.palavras : null })
      } catch (e) {
        if (vivo) setFeatErro(`Não deu para abrir “${first.title}”: ${errMsg(e)}`)
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  const guard = async (label: string, fn: () => Promise<Project | null>, after?: () => void): Promise<void> => {
    setError(null)
    setBusy(label)
    try {
      const p = await fn()
      if (p) {
        onOpen(p)
        after?.()
      }
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  /** Abre um livro trazendo antes do Drive o que for mais novo lá (sem travar se estiver offline). */
  const abrir = (dir: string, after?: () => void): void => {
    void guard(
      'Abrindo e buscando novidades no Drive…',
      async () => {
        let p = await folio.open(dir)
        try {
          const r = await comLimite(syncApi.puxar(p.dir), 15_000)
          if (r && r.baixados > 0) p = await folio.open(p.dir)
        } catch {
          /* offline ou Drive desconectado: abre a versão local */
        }
        return p
      },
      after
    )
  }

  const create = (e: FormEvent): void => {
    e.preventDefault()
    if (!title.trim()) return
    void guard('Criando o livro…', () => folio.create(title.trim(), author.trim()))
  }

  const salvarMeta = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!feat) return
    const n = Math.round(Number(metaIn.replace(/\D/g, '')))
    try {
      if (n > 0) await folio.docs.put<Metas>(feat.project.dir, 'config', 'metas', { palavras: n })
      else await folio.docs.delete(feat.project.dir, 'config', 'metas')
      setFeat({ ...feat, meta: n > 0 ? n : null })
      setEditMeta(false)
    } catch (err) {
      setError(errMsg(err))
    }
  }

  const { data, saudacao } = cabecalho()
  const temLivros = Boolean(recents && recents.length > 0)
  const d = feat?.destaque ?? null
  const palavras = d?.palavras ?? feat?.project.chapters.reduce((s, c) => s + c.words, 0) ?? 0
  const pct = feat?.meta ? Math.min(100, (palavras / feat.meta) * 100) : 0

  return (
    <main className="screen lib bib">
      <header className="bib-head">
        <div>
          <span className="bib-eb">{data}</span>
          <h1 className="disp">
            {saudacao} {temLivros ? 'Vamos continuar?' : 'O que vamos escrever?'}
          </h1>
        </div>
        <div className="bib-row">
          {!isWeb && (
            <button type="button" className="btn" disabled={busy !== null} onClick={() => void guard('Abrindo…', () => folio.pickAndOpen())}>
              Abrir livro existente
            </button>
          )}
          <button type="button" className="btn pri" aria-expanded={novo} aria-controls="bib-novo" onClick={() => setNovo((v) => !v)}>
            + Novo livro
          </button>
        </div>
      </header>

      {novo && (
        <form id="bib-novo" className="panel newbook" onSubmit={create}>
          <label className="field">
            Título do livro
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A Cidade dos Sinos Mudos" autoFocus={temLivros} />
          </label>
          <label className="field">
            Autor (como sai na capa)
            <input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Seu nome ou pseudônimo" />
          </label>
          <button type="submit" className="btn pri" disabled={busy !== null || !title.trim()}>
            Criar livro
          </button>
        </form>
      )}

      {busy && <p className="bib-busy" role="status">{busy}</p>}
      {error && <p className="err" role="alert">{error}</p>}

      {featErro && <p className="err">{featErro}</p>}
      {feat && (
        <section className="panel bib-feat" aria-labelledby="bib-feat-t">
          <div className="bib-feat-cover">
            {d?.capa ? (
              <img src={d.capa} alt={`Capa: ${feat.project.meta.title}`} className="bib-cover3d" />
            ) : (
              <CapaTipografica title={feat.project.meta.title} author={feat.project.meta.author} className="bib-cover3d" />
            )}
          </div>
          <div className="bib-feat-body">
            <span className="bib-eb acc">Continuar escrevendo</span>
            <h2 id="bib-feat-t" className="disp bib-feat-title">{feat.project.meta.title}</h2>
            {d?.capitulo && (
              <span className="muted">
                {d.capitulo.numero > 0 ? `Capítulo ${d.capitulo.numero} · ` : ''}
                {d.capitulo.title} · {relTime(d.editadoEm)}
              </span>
            )}
            {d?.trecho && <p className="bib-trecho">“{d.trecho}”</p>}
            <div className="bib-prog">
              {feat.meta ? (
                <span
                  className="bib-track"
                  role="progressbar"
                  aria-label="Progresso da meta de palavras"
                  aria-valuemin={0}
                  aria-valuemax={feat.meta}
                  aria-valuenow={Math.min(palavras, feat.meta)}
                >
                  <span style={{ width: `${pct}%` }} />
                </span>
              ) : null}
              {editMeta ? (
                <form className="bib-meta" onSubmit={(e) => void salvarMeta(e)}>
                  <label className="muted" htmlFor="bib-meta-in">Meta</label>
                  <input id="bib-meta-in" className="input" inputMode="numeric" value={metaIn} onChange={(e) => setMetaIn(e.target.value)} placeholder="88000" autoFocus />
                  <span className="muted">palavras</span>
                  <button type="submit" className="btn sm">Salvar</button>
                  <button type="button" className="btn sm" onClick={() => setEditMeta(false)}>Cancelar</button>
                </form>
              ) : (
                <span className="bib-num">
                  {fmt(palavras)}
                  {feat.meta ? ` / ${fmt(feat.meta)}` : ''} palavras
                  {d?.capitulo && d.capitulo.numero > 0 ? ` · cap. ${d.capitulo.numero} de ${d.capitulo.total}` : ''}
                  <button
                    type="button"
                    className="bib-link"
                    onClick={() => {
                      setMetaIn(feat.meta ? String(feat.meta) : '')
                      setEditMeta(true)
                    }}
                  >
                    {feat.meta ? 'mudar meta' : 'definir meta'}
                  </button>
                </span>
              )}
            </div>
            <div className="bib-row">
              <button type="button" className="btn pri" disabled={busy !== null} onClick={() => abrir(feat.project.dir, d?.capitulo ? () => go('manuscrito', { chapter: d.capitulo?.file }) : undefined)}>
                {d?.capitulo && d.capitulo.numero > 0 ? `Continuar o capítulo ${d.capitulo.numero}` : 'Continuar escrevendo'}
              </button>
              <button type="button" className="btn" disabled={busy !== null} onClick={() => abrir(feat.project.dir, () => go('diagramar'))}>
                Ver diagramação
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="bib-sec" aria-labelledby="bib-shelf-h">
        <div className="bib-rule">
          <h2 id="bib-shelf-h" className="disp">Na estante</h2>
          <span />
        </div>
        {recents === null ? (
          <p className="muted">Carregando…</p>
        ) : (
          <div className="bib-shelf">
            {recents.map((r) => (
              <button key={r.dir} type="button" className="bib-book" disabled={busy !== null} onClick={() => abrir(r.dir)} title={r.dir}>
                <CapaTipografica title={r.title} className="bib-cover" />
                <span className="disp bib-bt">{r.title}</span>
                <span className="bib-bs">Aberto {relTime(r.openedAt)}</span>
              </button>
            ))}
            <button type="button" className="bib-new" onClick={() => setNovo(true)}>
              + Novo livro
            </button>
          </div>
        )}
      </section>

      {feat && (
        <section className="bib-panels" aria-label={`Painéis de ${feat.project.meta.title}`}>
          <Semana dias={feat.dias} />
          <Norte dir={feat.project.dir} />
          <Inspiracoes dir={feat.project.dir} />
          <Trilha dir={feat.project.dir} onAjustes={() => go('ajustes')} />
        </section>
      )}
    </main>
  )
}
