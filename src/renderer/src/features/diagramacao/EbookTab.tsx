import { useState, type ReactElement } from 'react'
import { call, isWeb, openExport } from '../../api'
import type { Project } from '../../../../shared/types'
import { Ico } from './icons'
import { errText, fmt, type EpubResult, type FullLayout } from './model'

interface Props {
  project: Project
  l: FullLayout
  /** salva configurações pendentes antes de gerar */
  flush: () => Promise<void>
}

/** EPUB 3 para Kindle e lojas, gerado sem conversor de terceiros. */
export function EbookTab({ project, l, flush }: Props): ReactElement {
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<EpubResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const f = l.front

  const gerar = async (): Promise<void> => {
    setBusy(true)
    setErr(null)
    try {
      await flush()
      setRes(await call<EpubResult>('diagramacao.epub', project.dir))
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const parts = [
    'Capa (se houver imagem em Arte)',
    f.rosto || f.falsoRosto ? 'Rosto' : null,
    f.creditos ? 'Créditos e ficha catalográfica' : null,
    f.dedicatoria && f.dedicatoriaTexto.trim() ? 'Dedicatória' : null,
    f.epigrafe && f.epigrafeTexto.trim() ? 'Epígrafe' : null,
    'Sumário navegável',
    `${project.chapters.filter((c) => c.kind !== 'parte').length} capítulos${project.chapters.some((c) => c.kind === 'parte') ? ' em partes' : ''}, com notas no fim de cada um, epígrafes e imagens com legenda`,
    f.posfacio && f.posfacioTexto.trim() ? 'Posfácio' : null,
    f.agradecimentos && f.agradecimentosTexto.trim() ? 'Agradecimentos' : null,
    f.sobreAutor && (f.sobreAutorTexto.trim() || f.sobreAutorFoto) ? 'Sobre o autor' : null,
    f.colofao ? 'Colofão' : null
  ].filter((x): x is string => Boolean(x))

  return (
    <section className="dg-work" aria-live="polite" aria-busy={busy}>
      <div className="panel dg-card">
        <h2 className="disp">E-book (EPUB 3)</h2>
        <p className="muted">Arquivo único para Kindle (via Send to Kindle/KDP), Kobo, Apple Livros e Google Play. O corpo fica a cargo do leitor; a fonte do miolo vai embutida quando é uma das fontes livres (OFL) que vêm com o Darkpages. Capitulares, quebras de cena e artes de abertura vão junto, com metadados de acessibilidade.</p>
        <ul className="dg-list">
          {parts.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="label">
          Metadados: título, autor, idioma pt-BR, {f.isbn.trim() ? `ISBN ${f.isbn.trim()}` : 'identificador próprio (sem ISBN)'}
          {f.editora.trim() ? `, ${f.editora.trim()}` : ''}, data {f.ano || 'de hoje'}.
        </p>
        <div className="dg-actions">
          <button type="button" className="btn pri" disabled={busy} onClick={() => void gerar()}>
            <Ico name="epub" /> {busy ? 'Gerando EPUB…' : 'Gerar EPUB'}
          </button>
        </div>
        {err && <p className="err">{err}</p>}
      </div>
      {res && (
        <div className="panel dg-card">
          <h2 className="disp">EPUB pronto</h2>
          <p>
            {res.capitulos} capítulos · {res.notas} notas · {res.aberturas} artes de abertura · {res.figuras} imagens no texto · {res.capa ? 'com capa' : 'sem capa'} ·{' '}
            {res.fonte ? `fonte ${res.fonte} embutida` : 'fonte do leitor'} · {fmt(res.bytes / 1024, 0)} KB
          </p>
          <p className="dg-path">{res.epubPath}</p>
          <div className="dg-actions">
            <button type="button" className="btn" onClick={() => void openExport(res.epubPath)}>
              <Ico name="abrir" /> {isWeb ? 'Baixar o EPUB' : 'Mostrar na pasta'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
