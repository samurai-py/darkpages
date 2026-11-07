import { useState, type ReactElement } from 'react'
import { resolveRotulo, type RotuloCfg } from '../../../../shared/rotulo'
import type { Project } from '../../../../shared/types'
import { folio } from '../../api'
import { RotuloSeletor } from '../diagramacao/RotuloSeletor'
import { Modal } from './Modal'

/** "Nome dos capítulos…" no Manuscrito: o mesmo seletor da Diagramação, salvo no layout do livro. */
export function NomeCapitulos({ project, onClose, onFeito }: { project: Project; onClose: () => void; onFeito: (p: Project) => void }): ReactElement {
  const [cfg, setCfg] = useState<RotuloCfg>(() => resolveRotulo(project.meta.layout))
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const salvar = async (): Promise<void> => {
    setOcupado(true)
    setErro(null)
    try {
      onFeito(await folio.saveLayout(project.dir, { ...project.meta.layout, rotulo: cfg }))
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      setOcupado(false)
    }
  }

  return (
    <Modal titulo="Nome dos capítulos" onClose={onClose} largura={520}>
      <p className="ms-modal-p">Vale para o livro inteiro: lista de capítulos, editor, diagramação, sumário, cabeçalho e EPUB.</p>
      <RotuloSeletor value={cfg} onChange={setCfg} />
      {erro && (
        <p className="err" role="alert">
          {erro}
        </p>
      )}
      <div className="ms-row">
        <button type="button" className="btn sm" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="btn sm pri" disabled={ocupado} onClick={() => void salvar()}>
          {ocupado ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </Modal>
  )
}
