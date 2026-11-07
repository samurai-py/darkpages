import { useRef, useState, type ReactElement } from 'react'
import { call, fileToDataUrl, openExport } from '../../api'
import type { ChapterKind, Project } from '../../../../shared/types'
import { Modal } from './Modal'
import { fmt } from './texto'

interface Previa {
  id: string
  arquivo: string
  capitulos: Array<{ titulo: string; tipo: ChapterKind; palavras: number; inicio: string }>
  avisos: string[]
}

const TIPO: Record<ChapterKind, string> = { capitulo: 'Capítulo', prologo: 'Prólogo', epilogo: 'Epílogo', parte: 'Parte' }

/** Importar .docx/.txt/.md: escolhe o arquivo, mostra a divisão em capítulos e confirma. */
export function Importar({
  dir,
  onClose,
  onFeito
}: {
  dir: string
  onClose: () => void
  onFeito: (p: Project, criados: string[]) => void
}): ReactElement {
  const input = useRef<HTMLInputElement>(null)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [titulos, setTitulos] = useState<string[]>([])
  const [incluir, setIncluir] = useState<boolean[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const ler = async (f: File): Promise<void> => {
    setErro(null)
    setOcupado(true)
    try {
      if (f.size > 25 * 1024 * 1024) throw new Error('Arquivo grande demais (máx. 25 MB)')
      const r = await call<Previa>('manuscrito.importar', dir, f.name, await fileToDataUrl(f))
      setPrevia(r)
      setTitulos(r.capitulos.map((c) => c.titulo))
      setIncluir(r.capitulos.map(() => true))
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  const confirmar = async (): Promise<void> => {
    if (!previa) return
    setOcupado(true)
    setErro(null)
    try {
      const idx = incluir.flatMap((v, i) => (v ? [i] : []))
      const r = await call<{ project: Project; criados: string[] }>('manuscrito.importarConfirmar', dir, previa.id, titulos, idx)
      onFeito(r.project, r.criados)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      setOcupado(false)
    }
  }

  const n = incluir.filter(Boolean).length
  const palavras = previa ? previa.capitulos.reduce((s, c, i) => s + (incluir[i] ? c.palavras : 0), 0) : 0

  return (
    <Modal titulo="Importar manuscrito" onClose={onClose} largura={640}>
      {!previa ? (
        <div className="ms-form">
          <p className="ms-modal-p">
            Escolha um arquivo <b>.docx</b>, <b>.txt</b> ou <b>.md</b>. O Folio separa os capítulos pelo Título 1 do Word ou por linhas como
            “Capítulo 3”, “CAPÍTULO III”, “Prólogo”. Itálico, negrito e notas de rodapé do Word são mantidos. Os capítulos entram no fim do
            livro.
          </p>
          <input
            ref={input}
            className="ms-sr"
            type="file"
            id="ms-imp-arq"
            accept=".docx,.txt,.md,.markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void ler(f)
              e.target.value = ''
            }}
          />
          <div className="ms-row">
            <button type="button" className="btn sm" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="btn sm pri" disabled={ocupado} onClick={() => input.current?.click()}>
              {ocupado ? 'Lendo arquivo…' : 'Escolher arquivo'}
            </button>
          </div>
        </div>
      ) : (
        <div className="ms-form">
          <p className="ms-modal-p">
            <b>{previa.arquivo}</b>: {previa.capitulos.length} {previa.capitulos.length === 1 ? 'capítulo encontrado' : 'capítulos encontrados'}.
            Revise os títulos antes de importar.
          </p>
          {previa.avisos.map((a) => (
            <p key={a} className="ms-aviso">
              {a}
            </p>
          ))}
          <ol className="ms-previa">
            {previa.capitulos.map((c, i) => (
              <li key={i} className={incluir[i] ? '' : 'off'}>
                <input
                  type="checkbox"
                  className="ms-check"
                  aria-label={`Importar ${titulos[i] ?? c.titulo}`}
                  checked={!!incluir[i]}
                  onChange={(e) => setIncluir((v) => v.map((x, j) => (j === i ? e.target.checked : x)))}
                />
                <span className="ms-previa-m">
                  <span className="ms-previa-l">
                    <span className="ms-eb">{TIPO[c.tipo]}</span>
                    <span className="ms-eb">{fmt(c.palavras)} palavras</span>
                  </span>
                  <label className="ms-sr" htmlFor={`imp-t-${i}`}>
                    Título do capítulo {i + 1}
                  </label>
                  <input
                    id={`imp-t-${i}`}
                    className="input"
                    value={titulos[i] ?? ''}
                    onChange={(e) => setTitulos((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  {c.inicio && <span className="ms-previa-i">{c.inicio}…</span>}
                </span>
              </li>
            ))}
          </ol>
          <div className="ms-row">
            <button type="button" className="btn sm" onClick={() => setPrevia(null)} disabled={ocupado}>
              Outro arquivo
            </button>
            <button type="button" className="btn sm pri" onClick={() => void confirmar()} disabled={ocupado || n === 0}>
              {ocupado ? 'Importando…' : `Importar ${n} ${n === 1 ? 'capítulo' : 'capítulos'} · ${fmt(palavras)} palavras`}
            </button>
          </div>
        </div>
      )}
      {erro && (
        <p className="err" role="alert">
          {erro}
        </p>
      )}
    </Modal>
  )
}

const FORMATOS: Array<{ id: 'docx' | 'md' | 'txt'; nome: string; desc: string }> = [
  { id: 'docx', nome: 'Word (.docx)', desc: 'Títulos, itálico, negrito, quebras de cena e notas de rodapé.' },
  { id: 'md', nome: 'Markdown (.md)', desc: 'O texto como está nos arquivos do livro, num só arquivo.' },
  { id: 'txt', nome: 'Texto puro (.txt)', desc: 'Sem formatação; notas numeradas no fim de cada capítulo.' }
]

export function Exportar({ dir, onClose, onFeito }: { dir: string; onClose: () => void; onFeito: (path: string) => void }): ReactElement {
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const exportar = async (f: 'docx' | 'md' | 'txt'): Promise<void> => {
    setOcupado(f)
    setErro(null)
    try {
      const path = await call<string>('manuscrito.exportar', dir, f)
      await openExport(path)
      onFeito(path)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(null)
    }
  }
  return (
    <Modal titulo="Exportar manuscrito" onClose={onClose} largura={460}>
      <div className="ms-form">
        <p className="ms-modal-p">O livro inteiro, na ordem dos capítulos, vai para a pasta export/ do projeto.</p>
        <div className="ms-formatos">
          {FORMATOS.map((f) => (
            <button key={f.id} type="button" className="ms-formato" disabled={!!ocupado} onClick={() => void exportar(f.id)}>
              <b>{ocupado === f.id ? 'Gerando…' : f.nome}</b>
              <span>{f.desc}</span>
            </button>
          ))}
        </div>
        {erro && (
          <p className="err" role="alert">
            {erro}
          </p>
        )}
        <div className="ms-row">
          <button type="button" className="btn sm" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </Modal>
  )
}
