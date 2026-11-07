import { useRef, useState, type ReactElement } from 'react'
import { call, openExport } from '../../api'
import type { Project } from '../../../../shared/types'
import { MAX_IMPORTACAO, type ItemPrevia, type MsgPrevia, type PreviaImport, type ResultadoImport, type SecaoImport } from '../../../../shared/importar'
import { Modal } from '../manuscrito/Modal'
// o modelo vai embutido no app (desktop e web): o mesmo arquivo de docs/
import modelo from '../../../../../docs/modelo-livro.yaml?raw'
import '../../screens/manuscrito.css'
import './importar.css'

/**
 * Importar "regras e dados" do livro inteiro (formato folio-livro, ver
 * docs/IMPORTAR.md): colar ou escolher o arquivo → prévia → importar.
 * `dir` = livro aberto; sem `dir`, cria um livro novo a partir do arquivo.
 */

const SECAO: Record<SecaoImport, string> = {
  livro: 'Livro',
  metas: 'Metas',
  perfil: 'Perfil',
  nomes: 'Nomes',
  ficha: 'Ficha',
  capitulo: 'Capítulo',
  parte: 'Parte',
  cartao: 'Cartão',
  ligacao: 'Ligação',
  manter: 'Revisão',
  paginas: 'Páginas'
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Baixa um texto como arquivo (funciona no navegador e no Electron). */
function baixarTexto(nome: string, texto: string): void {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/yaml;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Itens({ titulo, itens }: { titulo: string; itens: ItemPrevia[] }): ReactElement | null {
  if (!itens.length) return null
  return (
    <section className="imp-grupo">
      <h3 className="ms-modal-sub">
        {titulo} · {itens.length}
      </h3>
      <ul className="imp-lista">
        {itens.map((it, i) => (
          <li key={i}>
            <span className="ms-eb">{SECAO[it.secao]}</span>
            <span className="imp-nome">{it.nome}</span>
            {it.mudancas?.length ? <span className="imp-mud">{it.mudancas.join(' · ')}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Mensagens({ titulo, itens, erro }: { titulo: string; itens: MsgPrevia[]; erro?: boolean }): ReactElement | null {
  if (!itens.length) return null
  return (
    <section className={`imp-grupo ${erro ? 'imp-erros' : 'imp-avisos'}`}>
      <h3 className="ms-modal-sub">
        {titulo} · {itens.length}
      </h3>
      <ul className="imp-lista">
        {itens.map((m, i) => (
          <li key={i}>
            {m.linha ? <span className="imp-linha">linha {m.linha}</span> : null}
            <span className="imp-msg">{m.texto}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ImportarLivro({
  dir,
  titulo,
  onClose,
  onFeito
}: {
  /** livro onde importar; ausente = criar livro novo a partir do arquivo */
  dir?: string
  titulo?: string
  onClose: () => void
  onFeito: (p: Project) => void
}): ReactElement {
  const input = useRef<HTMLInputElement>(null)
  const [texto, setTexto] = useState('')
  const [arquivo, setArquivo] = useState<string | null>(null)
  const [previa, setPrevia] = useState<PreviaImport | null>(null)
  /** texto que gerou a prévia: mudou o texto, a prévia não vale mais */
  const [previaDe, setPreviaDe] = useState('')
  const [feito, setFeito] = useState<ResultadoImport | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const novo = !dir

  const ler = async (f: File): Promise<void> => {
    setErro(null)
    if (f.size > MAX_IMPORTACAO) {
      setErro('Arquivo grande demais (máx. 2 MB).')
      return
    }
    setTexto(await f.text())
    setArquivo(f.name)
    setPrevia(null)
  }

  const verPrevia = async (): Promise<void> => {
    setErro(null)
    setOcupado('Lendo o arquivo…')
    try {
      setPrevia(await call<PreviaImport>('importar.previa', dir ?? null, texto))
      setPreviaDe(texto)
    } catch (e) {
      setErro(msg(e))
    } finally {
      setOcupado(null)
    }
  }

  const importar = async (): Promise<void> => {
    setErro(null)
    setOcupado(novo ? 'Criando o livro…' : 'Guardando uma versão e importando…')
    try {
      const r = novo
        ? await call<ResultadoImport | null>('importar.novoLivro', texto)
        : await call<ResultadoImport>('importar.aplicar', dir, texto)
      if (!r) return
      setFeito(r)
      onFeito(r.project)
    } catch (e) {
      setErro(msg(e))
    } finally {
      setOcupado(null)
    }
  }

  const copiarModelo = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(modelo)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setErro('Não deu para copiar; use “Baixar modelo”.')
    }
  }

  const valida = previa !== null && previaDe === texto
  const podeImportar = valida && previa.erros.length === 0 && !ocupado
  const nada = valida && previa.criar.length === 0 && previa.atualizar.length === 0
  const nome = novo ? 'Criar livro a partir de arquivo' : 'Importar regras e dados'

  if (feito) {
    return (
      <Modal titulo={nome} onClose={onClose} largura={560}>
        <div className="ms-form">
          <p className="ms-modal-p">
            {novo ? (
              <>
                Livro <b>{feito.project.meta.title}</b> criado.
              </>
            ) : (
              <>Pronto.</>
            )}{' '}
            {feito.criar.length} {feito.criar.length === 1 ? 'item criado' : 'itens criados'}, {feito.atualizar.length}{' '}
            {feito.atualizar.length === 1 ? 'atualizado' : 'atualizados'}.
            {!novo && feito.criar.length + feito.atualizar.length > 0 ? ' A versão anterior do manuscrito está em Versões.' : ''}
          </p>
          <Mensagens titulo="Avisos" itens={feito.avisos} />
          <div className="ms-row">
            <button type="button" className="btn sm pri" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal titulo={nome} onClose={onClose} largura={720}>
      <div className="ms-form">
        <p className="ms-modal-p">
          {novo ? (
            <>
              Um arquivo <b>folio-livro</b> com título e autor vira um livro novo, já com fichas, capítulos, cartões e regras.
            </>
          ) : (
            <>
              Fichas, capítulos, cartões do Enredo, perfil da obra, nomes dos capítulos e páginas do livro{titulo ? <> em <b>{titulo}</b></> : null}.
              O que já existe é atualizado (casando por nome ou título, sem ligar para acentos e maiúsculas), o que falta é criado e nada é apagado.
            </>
          )}{' '}
          Comece pelo modelo: cole-o no ChatGPT ou no Claude e peça para preencher a partir das suas notas.
        </p>
        <div className="ms-row ms-row-l">
          <button type="button" className="btn sm" onClick={() => baixarTexto('modelo-livro.yaml', modelo)}>
            Baixar modelo
          </button>
          <button type="button" className="btn sm" onClick={() => void copiarModelo()}>
            {copiado ? 'Modelo copiado' : 'Copiar modelo'}
          </button>
          <button type="button" className="btn sm" onClick={() => input.current?.click()}>
            Escolher arquivo…
          </button>
          {arquivo && <span className="imp-arq">{arquivo}</span>}
        </div>
        <input
          ref={input}
          className="ms-sr"
          type="file"
          accept=".yaml,.yml,.txt,text/yaml,application/yaml,text/plain"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void ler(f)
            e.target.value = ''
          }}
        />
        <label className="field">
          Ou cole o conteúdo aqui
          <textarea
            className="input imp-texto"
            rows={10}
            spellCheck={false}
            value={texto}
            placeholder={'formato: folio-livro\nversao: 1\n\nfichas:\n  - nome: …'}
            onChange={(e) => {
              setTexto(e.target.value)
              setArquivo(null)
            }}
          />
        </label>

        {valida && (
          <div className="imp-previa" aria-live="polite">
            <Mensagens titulo="Erros — corrija no arquivo antes de importar" itens={previa.erros} erro />
            {nada && previa.erros.length === 0 ? <p className="ms-modal-p">Nada a mudar: o livro já está igual ao arquivo.</p> : null}
            <Itens titulo="Criar" itens={previa.criar} />
            <Itens titulo="Atualizar" itens={previa.atualizar} />
            <Mensagens titulo="Avisos" itens={previa.avisos} />
            {previa.notas.map((n) => (
              <p key={n} className="imp-nota">
                {n}
              </p>
            ))}
          </div>
        )}

        {ocupado && (
          <p className="bib-busy" role="status">
            {ocupado}
          </p>
        )}
        {erro && (
          <p className="err" role="alert">
            {erro}
          </p>
        )}
        <div className="ms-row">
          <button type="button" className="btn sm" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn sm" disabled={!texto.trim() || !!ocupado} onClick={() => void verPrevia()}>
            {valida ? 'Ver prévia de novo' : 'Ver prévia'}
          </button>
          <button
            type="button"
            className="btn sm pri"
            disabled={!podeImportar || (nada && !novo)}
            title={!valida ? 'Veja a prévia antes de importar' : previa.erros.length ? 'Corrija os erros do arquivo' : undefined}
            onClick={() => void importar()}
          >
            {novo ? 'Criar livro' : 'Importar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** Exporta o livro no mesmo formato (para editar fora e importar de volta). */
export function ExportarLivro({ dir, onClose }: { dir: string; onClose: () => void }): ReactElement {
  const [comTexto, setComTexto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)

  const exportar = async (): Promise<void> => {
    setOcupado(true)
    setErro(null)
    try {
      const path = await call<string>('importar.exportarArquivo', dir, { comTexto })
      await openExport(path)
      setFeito(path)
    } catch (e) {
      setErro(msg(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Modal titulo="Exportar como arquivo" onClose={onClose} largura={480}>
      <div className="ms-form">
        <p className="ms-modal-p">
          Fichas, capítulos, cartões, ligações, perfil, nomes, revisão, páginas e metas num arquivo <b>.yaml</b> (formato folio-livro), na pasta export/ do
          livro. Edite onde quiser e importe de volta: o que existe é atualizado, nada é apagado.
        </p>
        <label className="ms-check-l">
          <input type="checkbox" className="ms-check" checked={comTexto} onChange={(e) => setComTexto(e.target.checked)} />
          <span>
            Incluir o texto dos capítulos
            <br />
            <span className="muted">Ao importar, o texto só entra em capítulos novos (ou com “substituir_texto: true”).</span>
          </span>
        </label>
        {feito && <p className="ms-modal-p">Arquivo gerado: {feito.split(/[\\/]/).pop()}</p>}
        {erro && (
          <p className="err" role="alert">
            {erro}
          </p>
        )}
        <div className="ms-row">
          <button type="button" className="btn sm" onClick={onClose}>
            Fechar
          </button>
          <button type="button" className="btn sm pri" disabled={ocupado} onClick={() => void exportar()}>
            {ocupado ? 'Gerando…' : 'Exportar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
