import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from 'react'
import type { ScreenProps } from '../screen'
import { folio } from '../api'
import { countWords, type ChapterContent, type Project } from '../../../shared/types'
import { useAutosave, type SaveState } from '../useAutosave'

type Props = ScreenProps

interface Draft {
  file: string
  title: string
  body: string
}

function statusText(s: SaveState): { text: string; cls: string } {
  switch (s.kind) {
    case 'saving':
      return { text: 'Salvando…', cls: 'busy' }
    case 'dirty':
      return { text: 'Alterações não salvas', cls: 'busy' }
    case 'saved':
      return { text: `Salvo às ${s.at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, cls: '' }
    case 'error':
      return { text: `Erro ao salvar: ${s.message}`, cls: 'bad' }
    default:
      return { text: 'Tudo salvo', cls: '' }
  }
}

function chapterLabel(project: Project, index: number): string {
  const c = project.chapters[index]
  if (!c) return ''
  if (c.kind === 'prologo') return 'Pról.'
  if (c.kind === 'epilogo') return 'Epíl.'
  return String(project.chapters.slice(0, index + 1).filter((x) => x.kind === 'capitulo').length)
}

export function Manuscrito({ project, onProject }: Props): ReactElement {
  const [current, setCurrent] = useState<string | null>(project.chapters[0]?.file ?? null)
  const [chapter, setChapter] = useState<ChapterContent | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  const persist = useCallback(
    async (d: Draft): Promise<void> => {
      const r = await folio.saveChapter(project.dir, d.file, d.title, d.body)
      onProject({
        ...project,
        chapters: project.chapters.map((c) => (c.file === d.file ? { ...c, title: d.title, words: r.words } : c))
      })
    },
    [project, onProject]
  )
  const { state, schedule, flush } = useAutosave<Draft>(persist, 1000)

  useEffect(() => {
    if (!current) return
    let alive = true
    setError(null)
    folio
      .readChapter(project.dir, current)
      .then((c) => {
        if (!alive) return
        setChapter(c)
        setDraft({ file: c.file, title: c.title, body: c.body })
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
    // project.dir muda só ao trocar de livro; não recarrega a cada salvamento
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, project.dir])

  const switchTo = async (file: string): Promise<void> => {
    await flush()
    setCurrent(file)
  }

  const edit = (patch: Partial<Draft>): void => {
    if (!draft) return
    const next = { ...draft, ...patch }
    setDraft(next)
    schedule(next)
  }

  const add = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const t = newTitle.trim()
    if (!t) return
    await flush()
    const p = await folio.addChapter(project.dir, t)
    onProject(p)
    setNewTitle('')
    setCurrent(p.chapters.at(-1)?.file ?? null)
  }

  const total = project.chapters.reduce((s, c) => s + c.words, 0)
  const words = draft ? countWords(draft.body) : 0
  const st = statusText(state)

  return (
    <div className="screen">
      <aside className="chapters" aria-label="Capítulos">
        <header>
          <span className="label">Capítulos · {project.chapters.length}</span>
        </header>
        <div className="chlist">
          {project.chapters.map((c, i) => (
            <button
              key={c.file}
              type="button"
              className="ch"
              aria-current={c.file === current}
              onClick={() => void switchTo(c.file)}
            >
              <span className="n">{chapterLabel(project, i)}</span>
              <span className="t">{c.title}</span>
              <span className="w">{c.words.toLocaleString('pt-BR')}</span>
            </button>
          ))}
        </div>
        <form onSubmit={(e) => void add(e)}>
          <footer>
            <input
              className="input"
              aria-label="Título do novo capítulo"
              placeholder="Novo capítulo"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <button type="submit" className="btn sm" disabled={!newTitle.trim()}>
              Criar
            </button>
          </footer>
        </form>
      </aside>

      <main className="desk">
        <div className="desk-scroll">
          {error && <p className="err">{error}</p>}
          {draft && chapter ? (
            <article className="page">
              <input
                className="ctitle"
                aria-label="Título do capítulo"
                value={draft.title}
                onChange={(e) => edit({ title: e.target.value })}
              />
              <textarea
                aria-label="Texto do capítulo"
                spellCheck
                lang="pt-BR"
                value={draft.body}
                onChange={(e) => edit({ body: e.target.value })}
                placeholder="Comece a escrever…"
              />
            </article>
          ) : (
            !error && (
              <div className="empty">
                <span className="disp">Nenhum capítulo</span>
                Crie o primeiro na coluna da esquerda.
              </div>
            )
          )}
        </div>
        <footer className="status">
          <span>
            <b>{words.toLocaleString('pt-BR')}</b> palavras no capítulo
          </span>
          <span>
            <b>{(total - (chapter ? project.chapters.find((c) => c.file === chapter.file)?.words ?? 0 : 0) + words).toLocaleString('pt-BR')}</b>{' '}
            no livro
          </span>
          <span className="saved" role="status">
            <i className={`dot ${st.cls}`} />
            {st.text}
          </span>
        </footer>
      </main>
    </div>
  )
}
