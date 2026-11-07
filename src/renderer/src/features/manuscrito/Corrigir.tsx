import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { Editor } from '@tiptap/react'
import { call } from '../../api'
import type { ResultadoRevisorCorrigir } from '../../../../shared/corrigir'
import { Modal } from './Modal'
import { Ico } from './icones'
import './corrigir.css'
import {
  aplicarCorrecoes,
  blocosNoIntervalo,
  correcoesDoRevisor,
  correcoesLocais,
  intervaloDoEscopo,
  ROTULO_CORRECAO,
  semSobreposicao,
  textoParaRevisor,
  visivel,
  type Correcao,
  type EscopoCorrecao,
  type TipoCorrecao
} from './corrigir'

/**
 * Prévia do "Corrigir": lista o que muda (antes → depois, com contexto), deixa
 * desmarcar item a item ou por tipo e aplica tudo numa transação só do editor
 * (um Ctrl+Z desfaz). O autosave grava como em qualquer edição. No capítulo
 * inteiro, guarda antes uma versão na Arca ("antes de corrigir").
 */

const TITULO: Record<EscopoCorrecao, string> = {
  selecao: 'Corrigir seleção',
  paragrafo: 'Corrigir parágrafo',
  capitulo: 'Corrigir capítulo'
}

const ORDEM: TipoCorrecao[] = ['ortografia', 'gramatica', 'dialogo', 'travessao', 'aspas', 'reticencias', 'pontuacao', 'espacos', 'vazios']
/** acima disso a lista mostra só o começo (os tipos continuam marcando/desmarcando tudo) */
const MAX_LINHAS = 400

type EstadoLt =
  | { fase: 'carregando' }
  | { fase: 'pronto'; modo: ResultadoRevisorCorrigir['modo']; correcoes: Correcao[] }
  | { fase: 'indisponivel'; aviso: string }

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Espaços visíveis no trecho que sai ou entra. */
function trecho(s: string): string {
  return visivel(s).replace(/ /g, '·')
}

interface Props {
  editor: Editor
  dir: string
  file: string
  escopo: EscopoCorrecao
  /** grava o que está pendente (antes do snapshot) */
  antes: () => Promise<void>
  onFechar: () => void
  onAplicado: (n: number) => void
}

export function Corrigir({ editor, dir, file, escopo, antes, onFechar, onAplicado }: Props): ReactElement {
  // o texto como estava ao abrir: é sobre ele que as posições valem
  const [base] = useState(() => {
    const iv = intervaloDoEscopo(editor.state, escopo)
    return iv ? { doc: editor.state.doc, ...iv } : null
  })
  const locais = useMemo(() => (base ? correcoesLocais(base.doc, base.de, base.ate) : []), [base])
  const [lt, setLt] = useState<EstadoLt>({ fase: 'carregando' })
  const [usarLt, setUsarLt] = useState(true)
  const [fora, setFora] = useState<Set<string>>(() => new Set())
  const [aplicando, setAplicando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!base) return
    let vivo = true
    const { texto, mapa } = textoParaRevisor(blocosNoIntervalo(base.doc, base.de, base.ate))
    if (!texto.trim()) {
      setLt({ fase: 'indisponivel', aviso: 'Sem texto para conferir.' })
      return
    }
    call<ResultadoRevisorCorrigir>('corrigir.revisor', dir, file, texto)
      .then((r) => {
        if (!vivo) return
        if (!r.ativo) setLt({ fase: 'indisponivel', aviso: r.aviso ?? 'LanguageTool indisponível.' })
        else setLt({ fase: 'pronto', modo: r.modo, correcoes: correcoesDoRevisor(r.sugestoes, mapa, base.doc, base.de, base.ate) })
      })
      .catch((e: unknown) => {
        if (vivo) setLt({ fase: 'indisponivel', aviso: `LanguageTool: ${msg(e)}` })
      })
    return () => {
      vivo = false
    }
  }, [base, dir, file])

  const comLt = usarLt && lt.fase === 'pronto'
  // tipografia primeiro: onde as duas mexem no mesmo trecho, vale a regra local
  const lista = useMemo(() => semSobreposicao(locais, comLt && lt.fase === 'pronto' ? lt.correcoes : []), [locais, comLt, lt])
  const escolhidas = lista.filter((c) => !fora.has(c.id))
  const porTipo = useMemo(() => {
    const m = new Map<TipoCorrecao, Correcao[]>()
    for (const c of lista) m.set(c.tipo, [...(m.get(c.tipo) ?? []), c])
    return ORDEM.filter((t) => m.has(t)).map((t) => ({ tipo: t, itens: m.get(t)! }))
  }, [lista])

  const alternar = (id: string): void =>
    setFora((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const alternarTipo = (itens: Correcao[]): void =>
    setFora((s) => {
      const n = new Set(s)
      const todos = itens.every((c) => !n.has(c.id))
      for (const c of itens) {
        if (todos) n.add(c.id)
        else n.delete(c.id)
      }
      return n
    })

  const aplicar = async (): Promise<void> => {
    if (!base || !escolhidas.length) return
    setAplicando(true)
    setErro(null)
    try {
      if (escopo === 'capitulo') {
        await antes()
        await call('corrigir.snapshot', dir)
      }
      if (editor.isDestroyed || editor.state.doc !== base.doc) {
        throw new Error('O texto mudou enquanto a correção era preparada. Feche e abra o Corrigir de novo.')
      }
      editor.view.dispatch(aplicarCorrecoes(editor.state.tr, escolhidas).scrollIntoView())
      editor.commands.focus()
      onAplicado(escolhidas.length)
    } catch (e) {
      setErro(msg(e))
      setAplicando(false)
    }
  }

  const n = escolhidas.length
  const carregando = lt.fase === 'carregando'

  return (
    <Modal titulo={TITULO[escopo]} onClose={onFechar} largura={720}>
      {!base ? (
        <p className="ms-modal-p">Selecione um trecho do texto (ou ponha o cursor num parágrafo) e tente de novo.</p>
      ) : (
        <>
          <label className={`ms-check-l ms-corr-lt ${lt.fase === 'indisponivel' ? 'off' : ''}`}>
            <input
              type="checkbox"
              className="ms-check"
              checked={comLt}
              disabled={lt.fase !== 'pronto' || aplicando}
              onChange={(e) => setUsarLt(e.target.checked)}
            />
            <span>
              <b>Ortografia e gramática</b>
              <small aria-live="polite">
                {lt.fase === 'carregando'
                  ? 'Conferindo com o LanguageTool…'
                  : lt.fase === 'indisponivel'
                    ? lt.aviso
                    : `LanguageTool${lt.modo === 'publico' ? ' público: o trecho foi enviado para languagetool.org' : ', no seu servidor'}. Respeita “Sempre manter” e o dicionário do livro.`}
              </small>
            </span>
          </label>

          {porTipo.length > 0 && (
            <div className="ms-corr-tipos" role="group" aria-label="Marcar ou desmarcar por tipo">
              {porTipo.map(({ tipo, itens }) => {
                const marcadas = itens.filter((c) => !fora.has(c.id)).length
                return (
                  <button
                    key={tipo}
                    type="button"
                    className="ms-corr-tipo"
                    aria-pressed={marcadas === itens.length}
                    disabled={aplicando}
                    onClick={() => alternarTipo(itens)}
                    title={marcadas === itens.length ? 'Desmarcar todas deste tipo' : 'Marcar todas deste tipo'}
                  >
                    <span className={`ms-corr-dot t-${tipo}`} aria-hidden="true" />
                    {ROTULO_CORRECAO[tipo]}
                    <b>{marcadas === itens.length ? itens.length : `${marcadas}/${itens.length}`}</b>
                  </button>
                )
              })}
            </div>
          )}

          {lista.length > 0 ? (
            <ol className="ms-previa ms-corr-lista">
              {lista.slice(0, MAX_LINHAS).map((c) => {
                const off = fora.has(c.id)
                return (
                  <li key={c.id} className={off ? 'off' : ''}>
                    <input
                      type="checkbox"
                      className="ms-check"
                      aria-label={`${ROTULO_CORRECAO[c.tipo]}: ${c.original || 'inserir'} por ${c.por || 'nada'}`}
                      checked={!off}
                      disabled={aplicando}
                      onChange={() => alternar(c.id)}
                    />
                    <span className="ms-previa-m">
                      <span className="ms-corr-h">
                        <span className={`ms-corr-dot t-${c.tipo}`} aria-hidden="true" />
                        <span className="ms-eb">{ROTULO_CORRECAO[c.tipo]}</span>
                        {c.motivo && <span className="ms-corr-why">{c.motivo}</span>}
                      </span>
                      {c.bloco ? (
                        <span className="ms-corr-diff">
                          <del>{c.original}</del>
                        </span>
                      ) : (
                        <span className="ms-corr-diff">
                          <span className="ms-corr-ctx">{visivel(c.antes)}</span>
                          {c.original && <del>{trecho(c.original)}</del>}
                          {c.por && <ins>{trecho(c.por)}</ins>}
                          <span className="ms-corr-ctx">{visivel(c.depois)}</span>
                        </span>
                      )}
                    </span>
                  </li>
                )
              })}
              {lista.length > MAX_LINHAS && (
                <li className="ms-corr-mais">
                  E mais {lista.length - MAX_LINHAS}. Use os tipos acima para marcar ou desmarcar todas de uma vez.
                </li>
              )}
            </ol>
          ) : (
            !carregando && (
              <p className="ms-modal-p">
                <b>Nada a corrigir aqui.</b> Tipografia e espaços estão em ordem{lt.fase === 'pronto' ? ', e o LanguageTool não achou erros' : ''}.
              </p>
            )
          )}

          {lista.length > 0 && (
            <p className="ms-modal-p">
              Ctrl+Z desfaz tudo de uma vez.
              {escopo === 'capitulo' && ' Antes, uma versão do capítulo fica guardada em Versões (“antes de corrigir”).'}
            </p>
          )}
          {erro && (
            <p className="err" role="alert" style={{ margin: 0 }}>
              {erro}
            </p>
          )}
        </>
      )}
      <div className="ms-row">
        <button type="button" className="btn sm" onClick={onFechar} disabled={aplicando}>
          {lista.length ? 'Cancelar' : 'Fechar'}
        </button>
        {lista.length > 0 && (
          <button type="button" className="btn sm pri" disabled={aplicando || n === 0} onClick={() => void aplicar()}>
            <Ico n="corrigir" size={14} />
            {aplicando ? 'Aplicando…' : `Aplicar ${n} ${n === 1 ? 'correção' : 'correções'}`}
          </button>
        )}
      </div>
    </Modal>
  )
}
