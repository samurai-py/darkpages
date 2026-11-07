import { useState, type ReactElement } from 'react'
import { ESTILOS_ROTULO_PARTE, resolveNumeracao, type RotuloCfg } from '../../../../shared/rotulo'
import type { Project } from '../../../../shared/types'
import { folio } from '../../api'
import { RotuloSeletor } from '../diagramacao/RotuloSeletor'
import { Modal } from './Modal'

/** "Nome dos capítulos e partes…" no Manuscrito: os mesmos seletores da Diagramação, salvos no layout do livro. */
export function NomeCapitulos({ project, onClose, onFeito }: { project: Project; onClose: () => void; onFeito: (p: Project) => void }): ReactElement {
  const inicial = resolveNumeracao(project.meta.layout)
  const [cfg, setCfg] = useState<RotuloCfg>(inicial.rotulo)
  const [parte, setParte] = useState<RotuloCfg>(inicial.parte)
  const [reiniciar, setReiniciar] = useState(inicial.reiniciar)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const temPartes = project.chapters.some((c) => c.kind === 'parte')

  const salvar = async (): Promise<void> => {
    setOcupado(true)
    setErro(null)
    try {
      onFeito(await folio.saveLayout(project.dir, { ...project.meta.layout, rotulo: cfg, rotuloParte: parte, reiniciarNumeracao: reiniciar }))
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      setOcupado(false)
    }
  }

  return (
    <Modal titulo="Nome dos capítulos e partes" onClose={onClose} largura={520}>
      <p className="ms-modal-p">Vale para o livro inteiro: lista de capítulos, editor, diagramação, sumário, cabeçalho e EPUB.</p>
      <RotuloSeletor value={cfg} onChange={setCfg} />
      <h3 className="ms-modal-sub">Partes</h3>
      <p className="ms-modal-p">
        {temPartes
          ? 'As partes agrupam os capítulos que vêm depois delas, até a próxima parte.'
          : 'O livro ainda não tem partes. Crie uma em “Nova parte…”, no menu da coluna de capítulos.'}
      </p>
      <RotuloSeletor value={parte} onChange={setParte} estilos={ESTILOS_ROTULO_PARTE} item="parte" />
      <label className="ms-check-l">
        <input type="checkbox" className="ms-check" checked={reiniciar} onChange={(e) => setReiniciar(e.target.checked)} />
        <span>Recomeçar a numeração dos capítulos em cada parte (senão, ela continua no livro todo)</span>
      </label>
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
