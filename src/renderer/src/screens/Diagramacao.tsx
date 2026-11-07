import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { ScreenProps } from '../screen'
import { call, folio, isWeb, openExport } from '../api'
import type { ChapterLayout, ExportResult } from '../../../shared/types'
import { Mesa } from '../features/diagramacao/Mesa'
import { Painel } from '../features/diagramacao/Painel'
import { CapaTab } from '../features/diagramacao/CapaTab'
import { EbookTab } from '../features/diagramacao/EbookTab'
import { Ico } from '../features/diagramacao/icons'
import {
  DROPCAPS,
  OPENINGS,
  errText,
  fmt,
  spine,
  withDefaults,
  type FonteDisponivel,
  type FullLayout,
  type ItemChecagem,
  type PreviewResult
} from '../features/diagramacao/model'
import './diagramacao.css'

type Tab = 'miolo' | 'capa' | 'ebook'

const TABS: { v: Tab; label: string }[] = [
  { v: 'miolo', label: 'Miolo' },
  { v: 'capa', label: 'Capa' },
  { v: 'ebook', label: 'E-book' }
]

/** px por mm no zoom 100% */
const BASE_K = 2.2
const SAVE_MS = 450
const PREVIEW_MS = 250

/** Páginas visíveis no spread que contém `p`: par à esquerda, ímpar à direita (a página 1 fica sozinha à direita). */
function spreadOf(p: number, total: number): { esq: number | null; dir: number | null } {
  if (p <= 1) return { esq: null, dir: 1 }
  const esq = p % 2 === 0 ? p : p - 1
  return { esq, dir: esq + 1 <= total ? esq + 1 : null }
}

export function Diagramacao({ project, onProject, params }: ScreenProps): ReactElement {
  const dir = project.dir
  const [l, setL] = useState<FullLayout>(() => withDefaults(project.meta.layout))
  const [tab, setTab] = useState<Tab>('miolo')
  const [zoom, setZoom] = useState(1)
  const [guides, setGuides] = useState(true)
  const [page, setPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [fontes, setFontes] = useState<FonteDisponivel[]>([])
  const [checks, setChecks] = useState<ItemChecagem[] | null>(null)
  const [checking, setChecking] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [pdf, setPdf] = useState<ExportResult | null>(null)
  const saveTimer = useRef<number | null>(null)
  const pending = useRef<FullLayout | null>(null)
  const seq = useRef(0)
  const jumped = useRef(false)

  // novo livro aberto: recomeça do layout salvo
  useEffect(() => {
    setL(withDefaults(project.meta.layout))
    setPreview(null)
    setPage(1)
    setChecks(null)
    setPdf(null)
    jumped.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir])

  useEffect(() => {
    call<FonteDisponivel[]>('diagramacao.fontes')
      .then(setFontes)
      .catch(() => setFontes([]))
  }, [])

  const save = useCallback(async (): Promise<void> => {
    const next = pending.current
    if (!next) return
    pending.current = null
    try {
      onProject(await folio.saveLayout(dir, next))
      setVersion((v) => v + 1)
    } catch (e) {
      setErr(errText(e))
    }
  }, [dir, onProject])

  const flush = useCallback(async (): Promise<void> => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    await save()
  }, [save])

  const set = useCallback(
    (patch: Partial<FullLayout>): void => {
      setL((cur) => {
        const next = { ...cur, ...patch }
        pending.current = next
        return next
      })
      setPdf(null)
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null
        void save()
      }, SAVE_MS)
    },
    [save]
  )

  // salva o que estiver pendente ao sair da tela
  useEffect(() => () => void flush(), [flush])

  const total = preview?.total ?? 0
  const { esq, dir: dirPage } = spreadOf(page, Math.max(total, 1))
  const start = esq ?? dirPage ?? 1
  const count = (esq !== null ? 1 : 0) + (dirPage !== null ? 1 : 0)
  const k = BASE_K * zoom
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const ppi = Math.min(200, Math.max(48, Math.round((k * 25.4 * dpr * 1.6) / 24) * 24))

  // prévia: recompila quando o layout é salvo, a página muda ou o zoom pede outra resolução
  useEffect(() => {
    if (tab !== 'miolo') return
    const my = ++seq.current
    setBusy(true)
    const t = window.setTimeout(() => {
      call<PreviewResult>('diagramacao.previa', dir, start, count, ppi)
        .then((r) => {
          if (my !== seq.current) return
          setPreview(r)
          setErr(null)
          if (!jumped.current && params.chapter) {
            jumped.current = true
            const c = r.capitulos.find((x) => x.arquivo === params.chapter)
            if (c) setPage(c.pagina)
          }
          if (page > r.total) setPage(Math.max(1, r.total))
        })
        .catch((e) => {
          if (my === seq.current) setErr(errText(e))
        })
        .finally(() => {
          if (my === seq.current) setBusy(false)
        })
    }, PREVIEW_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir, version, start, count, ppi, tab])

  useEffect(() => setPageInput(String(page)), [page])

  const go = (p: number): void => setPage(Math.min(Math.max(1, total || 1), Math.max(1, p)))
  const prev = (): void => go((esq ?? dirPage ?? 1) - 1)
  const next = (): void => go((dirPage ?? esq ?? 0) + 1)

  const currentChapter = useMemo(() => {
    if (!preview) return null
    let cur: string | null = null
    for (const c of preview.capitulos) if (c.pagina <= (dirPage ?? esq ?? 1)) cur = c.arquivo
    return cur
  }, [preview, esq, dirPage])

  const setChapter = (file: string, patch: Partial<ChapterLayout>): void => {
    const cur = { ...(l.chapters[file] ?? {}), ...patch }
    for (const key of Object.keys(cur) as Array<keyof ChapterLayout>) if (cur[key] === undefined) delete cur[key]
    const chapters = { ...l.chapters }
    if (Object.keys(cur).length) chapters[file] = cur
    else delete chapters[file]
    set({ chapters })
  }

  const checar = async (): Promise<void> => {
    setTab('miolo')
    setChecking(true)
    try {
      await flush()
      setChecks(await call<ItemChecagem[]>('diagramacao.checar', dir))
    } catch (e) {
      setChecks([{ nivel: 'erro', texto: errText(e) }])
    } finally {
      setChecking(false)
    }
  }

  const gerarPdf = async (): Promise<void> => {
    setExporting(true)
    setErr(null)
    try {
      await flush()
      const r = await folio.exportPrintPdf(dir)
      setPdf(r)
      await openExport(r.pdfPath)
    } catch (e) {
      setErr(errText(e))
    } finally {
      setExporting(false)
    }
  }

  const lomb = total ? spine(total, l.paper.caliperMm) : null
  const pageOf = (file: string): number | undefined => preview?.capitulos.find((c) => c.arquivo === file)?.pagina

  return (
    <div className="screen dg">
      <div className="dg-bar">
        <div className="dg-tabs" role="tablist" aria-label="O que diagramar">
          {TABS.map((t) => (
            <button
              key={t.v}
              type="button"
              role="tab"
              id={`dg-tab-${t.v}`}
              aria-controls={`dg-panel-${t.v}`}
              aria-selected={tab === t.v}
              className="dg-tab"
              onClick={() => setTab(t.v)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab !== 'ebook' && (
          <label className="dg-zoom">
            Zoom
            <input type="range" min={50} max={200} step={10} value={Math.round(zoom * 100)} onChange={(e) => setZoom(Number(e.target.value) / 100)} />
            <output>{Math.round(zoom * 100)}%</output>
          </label>
        )}
        <span className="dg-sum">
          {fmt(l.trim.widthMm)}×{fmt(l.trim.heightMm)} mm · {total ? `${total} págs` : '… págs'} · lombada <b>{lomb !== null ? `${fmt(lomb)} mm` : '…'}</b> · sangria {fmt(l.bleedMm)} mm
        </span>
        <button type="button" className="btn" disabled={checking} onClick={() => void checar()}>
          <Ico name="checar" /> {checking ? 'Checando…' : 'Checar arquivo'}
        </button>
        <button type="button" className="btn pri" disabled={exporting} onClick={() => void gerarPdf()}>
          <Ico name="pdf" /> {exporting ? 'Gerando PDF…' : 'Gerar PDF da gráfica'}
        </button>
      </div>

      {tab === 'miolo' && (
        <div className="dg-body" role="tabpanel" id="dg-panel-miolo" aria-labelledby="dg-tab-miolo">
          <aside className="dg-chs" aria-label="Capítulos na diagramação">
            <span className="dg-eb">
              {project.chapters.length} capítulos{total ? ` · ${total} págs` : ''}
            </span>
            {project.chapters.map((c) => {
              const own = l.chapters[c.file] ?? {}
              const p = pageOf(c.file)
              return (
                <div key={c.file} className="dg-ch" data-atual={currentChapter === c.file}>
                  <button type="button" className="dg-ch-go" disabled={p === undefined} onClick={() => p !== undefined && go(p)} aria-label={`Ir para ${c.title}${p ? `, página ${p}` : ''}`}>
                    <b>{c.title}</b>
                    <span>{p !== undefined ? `p. ${p}` : '…'}</span>
                  </button>
                  <div className="dg-ch-opts">
                    <select
                      className="dg-mini"
                      aria-label={`Abertura de ${c.title}`}
                      value={own.opening ?? ''}
                      onChange={(e) => setChapter(c.file, { opening: (e.target.value || undefined) as ChapterLayout['opening'] })}
                    >
                      <option value="">Abertura: padrão</option>
                      {OPENINGS.map((o) => (
                        <option key={o.v} value={o.v}>Abertura: {o.label.toLowerCase()}</option>
                      ))}
                    </select>
                    <select
                      className="dg-mini"
                      aria-label={`Capitular de ${c.title}`}
                      value={own.dropCap ?? ''}
                      onChange={(e) => setChapter(c.file, { dropCap: (e.target.value || undefined) as ChapterLayout['dropCap'] })}
                    >
                      <option value="">Capitular: padrão</option>
                      {DROPCAPS.map((o) => (
                        <option key={o.v} value={o.v}>{o.label.startsWith('Sem') ? 'Sem capitular' : `Capitular: ${o.label.replace('Capitular ', '')}`}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )
            })}
          </aside>

          <section
            className="dg-desk"
            aria-label="Prévia das páginas"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return
              if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                e.preventDefault()
                prev()
              } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
                e.preventDefault()
                next()
              } else if (e.key === 'Home') go(1)
              else if (e.key === 'End') go(total)
            }}
          >
            <div className="dg-deskbar">
              <button type="button" className="btn sm" onClick={prev} disabled={(esq ?? dirPage ?? 1) <= 1} aria-label="Spread anterior">
                <Ico name="anterior" size={16} />
              </button>
              <label>
                <span className="sr-only">Ir para a página</span>
                <input
                  className="input"
                  inputMode="numeric"
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') go(Number(pageInput) || 1)
                  }}
                  onBlur={() => go(Number(pageInput) || page)}
                />
              </label>
              <span>de {total || '…'}</span>
              <button type="button" className="btn sm" onClick={next} disabled={!total || (dirPage ?? esq ?? 0) >= total} aria-label="Próximo spread">
                <Ico name="proxima" size={16} />
              </button>
              <button type="button" className="btn sm" aria-pressed={guides} onClick={() => setGuides((g) => !g)}>
                <Ico name="guias" size={16} /> Guias
              </button>
              {pdf && (
                <button type="button" className="btn sm" onClick={() => void openExport(pdf.pdfPath)}>
                  <Ico name="abrir" size={16} /> {isWeb ? 'Abrir PDF' : 'PDF na pasta'} · {pdf.pages} págs
                </button>
              )}
              <span className="dg-status" role="status">
                <span className={`dg-dot${busy ? ' busy' : err ? ' bad' : ''}`} aria-hidden="true" />
                {busy ? 'Atualizando…' : err ? 'Erro na prévia' : preview ? 'Prévia em dia' : ''}
              </span>
            </div>
            {err && <p className="err" style={{ margin: '12px 16px' }}>{err}</p>}
            {preview ? (
              <div className="dg-stage">
                <Mesa preview={preview} esq={esq} dir={dirPage} k={k} guides={guides} busy={busy} />
              </div>
            ) : (
              !err && (
                <div className="dg-empty">
                  <span className="disp">Compondo o miolo…</span>
                  O Typst está paginando o livro para a prévia.
                </div>
              )
            )}
          </section>

          <Painel l={l} set={set} pages={total || null} fontes={fontes} checks={checks} checking={checking} />
        </div>
      )}

      {tab === 'capa' && (
        <div role="tabpanel" id="dg-panel-capa" aria-labelledby="dg-tab-capa" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <CapaTab dir={dir} l={l} set={set} version={version} zoom={zoom} />
        </div>
      )}

      {tab === 'ebook' && (
        <div role="tabpanel" id="dg-panel-ebook" aria-labelledby="dg-tab-ebook" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <EbookTab project={project} l={l} flush={flush} />
        </div>
      )}
    </div>
  )
}
