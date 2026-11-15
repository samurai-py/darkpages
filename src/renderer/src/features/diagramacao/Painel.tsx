import { useEffect, useState, type ReactElement } from 'react'
import { fileToDataUrl, folio } from '../../api'
import type { FrontMatter } from '../../../../shared/types'
import { NumField, Stepper, TextField } from './fields'
import { Ico } from './icons'
import { RotuloSeletor } from './RotuloSeletor'
import { ESTILOS_ROTULO_PARTE } from '../../../../shared/rotulo'
import { ModelosLayout } from './ModelosLayout'
import {
  DROPCAPS,
  FOLIOS,
  OPENINGS,
  ORNAMENTS,
  PAPERS,
  TRIMS,
  errText,
  fmt,
  spine,
  type FonteDisponivel,
  type FullLayout,
  type ItemChecagem
} from './model'

interface Props {
  dir: string
  l: FullLayout
  set: (patch: Partial<FullLayout>) => void
  pages: number | null
  fontes: FonteDisponivel[]
  checks: ItemChecagem[] | null
  checking: boolean
}

const ORIGEM = { projeto: 'do Darkpages', typst: 'do Typst', sistema: 'do sistema' } as const

export function Painel({ dir, l, set, pages, fontes, checks, checking }: Props): ReactElement {
  const trimKey = TRIMS.findIndex((t) => t.w === l.trim.widthMm && t.h === l.trim.heightMm)
  const paperKey = PAPERS.findIndex((p) => p.name === l.paper.name)
  const f = l.front
  const setF = (patch: Partial<FrontMatter>): void => set({ front: { ...f, ...patch } })
  const lomb = pages ? spine(pages, l.paper.caliperMm) : null
  const fontKnown = fontes.some((x) => x.nome === l.font)

  return (
    <aside className="dg-side" aria-label="Formato, tipografia e checagem">
      <ModelosLayout l={l} set={set} />

      <fieldset className="dg-sec">
        <legend className="dg-eb">Formato e papel</legend>
        <div className="dg-grid2">
          <label className="field">
            Formato
            <select
              className="select"
              value={trimKey}
              onChange={(e) => {
                const t = TRIMS[Number(e.target.value)]
                if (t) set({ trim: { widthMm: t.w, heightMm: t.h } })
              }}
            >
              {trimKey === -1 && <option value={-1}>{fmt(l.trim.widthMm)} × {fmt(l.trim.heightMm)} mm</option>}
              {TRIMS.map((t, i) => (
                <option key={t.label} value={i}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Papel
            <select
              className="select"
              value={paperKey}
              onChange={(e) => {
                const p = PAPERS[Number(e.target.value)]
                if (p) set({ paper: p })
              }}
            >
              {paperKey === -1 && <option value={-1}>{l.paper.name}</option>}
              {PAPERS.map((p, i) => (
                <option key={p.name} value={i}>{p.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="dg-grid2">
          <NumField label="Largura (mm)" value={l.trim.widthMm} min={80} max={300} onChange={(n) => set({ trim: { ...l.trim, widthMm: n } })} />
          <NumField label="Altura (mm)" value={l.trim.heightMm} min={100} max={400} onChange={(n) => set({ trim: { ...l.trim, heightMm: n } })} />
        </div>
        <NumField
          label="Caliper: espessura da folha (mm)"
          value={l.paper.caliperMm}
          min={0.03}
          max={0.5}
          onChange={(n) => set({ paper: { name: paperKey === -1 ? l.paper.name : `${l.paper.name} (ajustado)`, caliperMm: n } })}
        />
        <div className="dg-calc" aria-live="polite">
          {pages && lomb !== null ? (
            <>
              Lombada = {pages} págs ÷ 2 × {fmt(l.paper.caliperMm, 3)} mm = <b>{fmt(lomb)} mm</b>. Ajuste o caliper se a gráfica informar outro.
            </>
          ) : (
            'A lombada aparece quando a prévia contar as páginas.'
          )}
        </div>
      </fieldset>

      <fieldset className="dg-sec">
        <legend className="dg-eb">Tipografia do miolo</legend>
        <label className="field">
          Fonte
          <select className="select" value={l.font} onChange={(e) => set({ font: e.target.value })}>
            {!fontKnown && <option value={l.font}>{l.font} (não encontrada)</option>}
            {(['projeto', 'typst', 'sistema'] as const).map((o) => {
              const list = fontes.filter((x) => x.origem === o)
              return list.length ? (
                <optgroup key={o} label={`Fontes ${ORIGEM[o]}`}>
                  {list.map((x) => (
                    <option key={x.nome} value={x.nome}>{x.nome}</option>
                  ))}
                </optgroup>
              ) : null
            })}
          </select>
        </label>
        <Stepper label="Corpo" value={l.bodyPt} step={0.25} min={7} max={16} unit=" pt" onChange={(n) => set({ bodyPt: n })} />
        <Stepper label="Entrelinha" value={l.lineHeight} step={0.02} min={1} max={2} onChange={(n) => set({ lineHeight: n })} />
        <label className="check">
          <input type="checkbox" checked={l.avoidWidows} onChange={(e) => set({ avoidWidows: e.target.checked })} />
          Evitar viúvas e órfãs
        </label>
        <div className="dg-grid2">
          <label className="field">
            Capitular
            <select className="select" value={l.dropCap} onChange={(e) => set({ dropCap: e.target.value as FullLayout['dropCap'] })}>
              {DROPCAPS.map((d) => (
                <option key={d.v} value={d.v}>{d.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Abertura
            <select className="select" value={l.opening} onChange={(e) => set({ opening: e.target.value as FullLayout['opening'] })}>
              {OPENINGS.map((d) => (
                <option key={d.v} value={d.v}>{d.label}</option>
              ))}
            </select>
          </label>
        </div>
        {l.dropCap === 'descida' && (
          <Stepper label="Linhas da capitular" value={l.dropCapLines} step={1} min={2} max={5} digits={0} onChange={(n) => set({ dropCapLines: n })} />
        )}
        {l.dropCap !== 'nenhuma' && (
          <div className="dg-row">
            <span>Cor da capitular</span>
            <span className="dg-color">
              <input type="color" aria-label="Cor da capitular" value={l.dropCapColor} onChange={(e) => set({ dropCapColor: e.target.value })} />
            </span>
          </div>
        )}
        <label className="field">
          Arte de abertura entra na página
          <select className="select" value={l.openingArtPage} onChange={(e) => set({ openingArtPage: e.target.value as 'impar' | 'par' })}>
            <option value="impar">Ímpar (texto começa no verso)</option>
            <option value="par">Par (diante da abertura)</option>
          </select>
        </label>
        <fieldset className="dg-rotulo">
          <legend>Nome dos capítulos</legend>
          <RotuloSeletor value={l.rotulo} onChange={(rotulo) => set({ rotulo })} />
        </fieldset>
        <fieldset className="dg-rotulo">
          <legend>Nome das partes</legend>
          <RotuloSeletor value={l.rotuloParte} onChange={(rotuloParte) => set({ rotuloParte })} estilos={ESTILOS_ROTULO_PARTE} item="parte" />
          <label className="check">
            <input type="checkbox" checked={l.reiniciarNumeracao} onChange={(e) => set({ reiniciarNumeracao: e.target.checked })} />
            Recomeçar a numeração dos capítulos em cada parte
          </label>
        </fieldset>
        <div className="dg-grid2">
          <label className="field">
            Quebra de cena
            <select className="select" value={l.sceneOrnament} onChange={(e) => set({ sceneOrnament: e.target.value as FullLayout['sceneOrnament'] })}>
              {ORNAMENTS.map((d) => (
                <option key={d.v} value={d.v}>{d.label}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          Número de página
          <select className="select" value={l.folio} onChange={(e) => set({ folio: e.target.value as FullLayout['folio'] })}>
            {FOLIOS.map((d) => (
              <option key={d.v} value={d.v}>{d.label}</option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={l.runningHead} onChange={(e) => set({ runningHead: e.target.checked })} />
          Cabeçalho corrente (livro / capítulo)
        </label>
      </fieldset>

      <fieldset className="dg-sec">
        <legend className="dg-eb">Margens e sangria (mm)</legend>
        <div className="dg-grid4">
          {(
            [
              ['topMm', 'sup.'],
              ['bottomMm', 'inf.'],
              ['insideMm', 'int.'],
              ['outsideMm', 'ext.']
            ] as const
          ).map(([key, label]) => (
            <NumField key={key} label={label} value={l.margins[key]} min={5} max={60} onChange={(n) => set({ margins: { ...l.margins, [key]: n } })} />
          ))}
        </div>
        <div className="dg-grid2">
          <NumField label="Sangria" value={l.bleedMm} min={0} max={10} onChange={(n) => set({ bleedMm: n })} />
          <label className="check" style={{ alignSelf: 'end', minHeight: 36 }}>
            <input type="checkbox" checked={l.cropMarks} onChange={(e) => set({ cropMarks: e.target.checked })} />
            Marcas de corte
          </label>
        </div>
      </fieldset>

      <fieldset className="dg-sec">
        <legend className="dg-eb">Páginas iniciais e finais</legend>
        <label className="check">
          <input type="checkbox" checked={f.falsoRosto} onChange={(e) => setF({ falsoRosto: e.target.checked })} />
          Falso rosto
        </label>
        <label className="check">
          <input type="checkbox" checked={f.rosto} onChange={(e) => setF({ rosto: e.target.checked })} />
          Rosto
        </label>
        {f.rosto && (
          <div className="dg-fm">
            <TextField label="Subtítulo" value={f.subtitulo} onChange={(v) => setF({ subtitulo: v })} />
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={f.creditos} onChange={(e) => setF({ creditos: e.target.checked })} />
          Créditos e ficha catalográfica
        </label>
        {f.creditos && (
          <div className="dg-fm">
            <TextField label="Editora" value={f.editora} onChange={(v) => setF({ editora: v })} />
            <div className="dg-grid2">
              <TextField label="Cidade" value={f.cidade} onChange={(v) => setF({ cidade: v })} />
              <TextField label="Ano" value={f.ano} onChange={(v) => setF({ ano: v })} />
            </div>
            <div className="dg-grid2">
              <TextField label="Edição" value={f.edicao} onChange={(v) => setF({ edicao: v })} />
              <TextField label="ISBN" value={f.isbn} placeholder="978-…" onChange={(v) => setF({ isbn: v })} />
            </div>
            <TextField label="Ficha catalográfica (CIP)" multiline rows={5} value={f.ficha} placeholder="Uma linha por linha, como a bibliotecária enviou" onChange={(v) => setF({ ficha: v })} />
            <TextField label="Outros créditos" multiline value={f.creditosTexto} placeholder="Revisão, capa, ilustrações (uma por linha)" onChange={(v) => setF({ creditosTexto: v })} />
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={f.dedicatoria} onChange={(e) => setF({ dedicatoria: e.target.checked })} />
          Dedicatória
        </label>
        {f.dedicatoria && (
          <div className="dg-fm">
            <TextField label="Texto da dedicatória" multiline value={f.dedicatoriaTexto} onChange={(v) => setF({ dedicatoriaTexto: v })} />
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={f.epigrafe} onChange={(e) => setF({ epigrafe: e.target.checked })} />
          Epígrafe
        </label>
        {f.epigrafe && (
          <div className="dg-fm">
            <TextField label="Citação" multiline value={f.epigrafeTexto} onChange={(v) => setF({ epigrafeTexto: v })} />
            <TextField label="Autor da citação" value={f.epigrafeAutor} onChange={(v) => setF({ epigrafeAutor: v })} />
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={f.sumario} onChange={(e) => setF({ sumario: e.target.checked })} />
          Sumário
        </label>
        <label className="check">
          <input type="checkbox" checked={f.posfacio} onChange={(e) => setF({ posfacio: e.target.checked })} />
          Posfácio
        </label>
        {f.posfacio && (
          <div className="dg-fm">
            <TextField label="Texto do posfácio" multiline rows={6} value={f.posfacioTexto} placeholder="Parágrafos separados por linha em branco; aceita *itálico* e notas ^[assim]" onChange={(v) => setF({ posfacioTexto: v })} />
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={f.agradecimentos} onChange={(e) => setF({ agradecimentos: e.target.checked })} />
          Agradecimentos
        </label>
        {f.agradecimentos && (
          <div className="dg-fm">
            <TextField label="Texto dos agradecimentos" multiline rows={5} value={f.agradecimentosTexto} onChange={(v) => setF({ agradecimentosTexto: v })} />
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={f.sobreAutor} onChange={(e) => setF({ sobreAutor: e.target.checked })} />
          Sobre o autor
        </label>
        {f.sobreAutor && (
          <div className="dg-fm">
            <TextField label="Texto sobre o autor" multiline rows={5} value={f.sobreAutorTexto} onChange={(v) => setF({ sobreAutorTexto: v })} />
            <FotoAutor dir={dir} nome={f.sobreAutorFoto} onChange={(nome) => setF({ sobreAutorFoto: nome })} />
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={f.colofao} onChange={(e) => setF({ colofao: e.target.checked })} />
          Colofão no fim
        </label>
        {f.colofao && (
          <div className="dg-fm">
            <TextField label="Texto do colofão" multiline value={f.colofaoTexto} placeholder="Em branco: fonte, corpo e “diagramado no Darkpages”" onChange={(v) => setF({ colofaoTexto: v })} />
          </div>
        )}
      </fieldset>

      <section className="dg-sec" aria-labelledby="dg-check-t" aria-busy={checking}>
        <span id="dg-check-t" className="dg-eb">Checagem para a gráfica</span>
        {checking && <p className="label" style={{ margin: 0 }}>Checando…</p>}
        {!checking && !checks && <p className="label" style={{ margin: 0 }}>Use “Checar arquivo” na barra de cima.</p>}
        {checks && (
          <ul className="dg-checks">
            {checks.map((c, i) => (
              <li key={i} data-n={c.nivel}>
                <Ico name={c.nivel === 'ok' ? 'ok' : c.nivel === 'aviso' ? 'aviso' : 'erro'} size={16} />
                <span>
                  <span className="sr-only">{c.nivel === 'ok' ? 'Certo: ' : c.nivel === 'aviso' ? 'Aviso: ' : 'Erro: '}</span>
                  {c.texto}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}

/** Foto do autor em <livro>/assets/autor-foto.(png|jpg): envia, mostra e remove. */
function FotoAutor({ dir, nome, onChange }: { dir: string; nome: string; onChange: (nome: string) => void }): ReactElement {
  const [src, setSrc] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!nome) {
      setSrc(null)
      return
    }
    let vivo = true
    folio.assets
      .get(dir, nome)
      .then((d) => vivo && setSrc(d))
      .catch(() => vivo && setSrc(null))
    return () => {
      vivo = false
    }
  }, [dir, nome])

  const enviar = async (file: File): Promise<void> => {
    setErr(null)
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : null
    if (!ext) {
      setErr('Use uma foto PNG ou JPEG.')
      return
    }
    setBusy(true)
    try {
      const novo = `autor-foto.${ext}`
      await folio.assets.put(dir, novo, await fileToDataUrl(file))
      if (nome && nome !== novo) await folio.assets.delete(dir, nome).catch(() => undefined)
      setSrc(null)
      onChange(novo)
      // mesmo nome: força recarregar a miniatura
      if (nome === novo) setSrc(await folio.assets.get(dir, novo))
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="field">
      Foto (opcional)
      {src && <img src={src} alt="Foto do autor" style={{ maxWidth: 96, maxHeight: 120, borderRadius: 4, display: 'block', margin: '4px 0' }} />}
      <span className="dg-actions">
        <label className="btn sm">
          {busy ? 'Enviando…' : nome ? 'Trocar foto' : 'Escolher foto'}
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void enviar(file)
            }}
          />
        </label>
        {nome && (
          <button type="button" className="btn sm" onClick={() => onChange('')}>
            Tirar foto
          </button>
        )}
      </span>
      {nome && <span className="label">Sai centralizada, com 38% da largura do texto. A checagem avisa se tiver menos de 300 dpi.</span>}
      {err && <span className="err">{err}</span>}
    </div>
  )
}
