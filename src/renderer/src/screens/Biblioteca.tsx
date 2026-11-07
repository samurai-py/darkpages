import { useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { folio, isWeb } from '../api'
import type { Project, RecentProject } from '../../../shared/types'
import type { Screen } from '../screen'

function when(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function Biblioteca({ onOpen }: { onOpen: (p: Project) => void; go: (s: Screen) => void }): ReactElement {
  const [recents, setRecents] = useState<RecentProject[]>([])
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void folio.recents().then(setRecents)
  }, [])

  const guard = async (fn: () => Promise<Project | null>): Promise<void> => {
    setError(null)
    setBusy(true)
    try {
      const p = await fn()
      if (p) onOpen(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const create = (e: FormEvent): void => {
    e.preventDefault()
    if (!title.trim()) return
    void guard(() => folio.create(title.trim(), author.trim()))
  }

  const hour = new Date().getHours()
  const greeting = hour < 5 || hour >= 18 ? 'Boa noite.' : hour < 12 ? 'Bom dia.' : 'Boa tarde.'

  return (
    <main className="screen lib">
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <h1 className="disp">{greeting} O que vamos escrever?</h1>
        {!isWeb && (
          <button type="button" className="btn" disabled={busy} onClick={() => void guard(() => folio.pickAndOpen())}>
            Abrir livro existente
          </button>
        )}
      </header>

      <form className="panel newbook" onSubmit={create}>
        <label className="field">
          Título do livro
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A Cidade dos Sinos Mudos" />
        </label>
        <label className="field">
          Autor (como sai na capa)
          <input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Seu nome ou pseudônimo" />
        </label>
        <button type="submit" className="btn pri" disabled={busy || !title.trim()}>
          Criar livro
        </button>
      </form>

      {error && <p className="err">{error}</p>}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 className="disp" style={{ margin: 0, fontSize: 24 }}>Abertos recentemente</h2>
        {recents.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Nenhum livro ainda. Crie o primeiro acima.</p>
        ) : (
          <div className="shelf">
            {recents.map((r) => (
              <button
                key={r.dir}
                type="button"
                className="panel recent"
                onClick={() => void guard(() => folio.open(r.dir))}
              >
                <span className="t">{r.title}</span>
                <span className="p" title={r.dir}>{r.dir}</span>
                <span className="p">Aberto em {when(r.openedAt)}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
