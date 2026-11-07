import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from 'react'
import type { ChapterContent, Project } from '../../../../shared/types'
import type { MotivoSnapshot } from '../../../../shared/versoes'
import { Modal } from '../manuscrito/Modal'
import { Ico } from '../manuscrito/icones'
import { fmt } from '../manuscrito/texto'
import { relTime } from '../sync/api'
import { quando, versoesApi, type DiffVersao, type ItemLixeira, type VersaoCapitulo } from './api'
import { DiffView, Placar } from './DiffView'
import './versoes.css'

export type AbaVersoes = 'capitulo' | 'lixeira'

const MOTIVO: Record<MotivoSnapshot, { nome: string; cls: string }> = {
  automático: { nome: 'Automático', cls: 'auto' },
  'antes de reordenar': { nome: 'Antes de reordenar', cls: 'antes' },
  'antes de aplicar revisão': { nome: 'Antes de aplicar revisão', cls: 'antes' },
  'antes de importar': { nome: 'Antes de importar', cls: 'antes' },
  'antes de restaurar': { nome: 'Antes de restaurar', cls: 'antes' },
  manual: { nome: 'Salva por você', cls: 'manual' }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Versões do capítulo e lixeira do livro. Mostra o que mudou entre uma versão
 * guardada na Arca e o texto atual (riscado = saiu desde então, sublinhado =
 * entrou), restaura com confirmação e recupera capítulos excluídos.
 */
export function Versoes(p: {
  dir: string
  /** capítulo aberto (null: só a lixeira) */
  file: string | null
  /** "Capítulo três · O porto" */
  nomeCapitulo: string
  aba: AbaVersoes
  /** grava o que está pendente no editor antes de comparar ou restaurar */
  antes: () => Promise<void>
  onClose: () => void
  onRestaurado: (project: Project, capitulo: ChapterContent) => void
  onRecuperado: (project: Project, arquivo: string, titulo: string) => void
}): ReactElement {
  const [aba, setAba] = useState<AbaVersoes>(p.file ? p.aba : 'lixeira')
  const [versoes, setVersoes] = useState<VersaoCapitulo[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [diff, setDiff] = useState<DiffVersao | null>(null)
  const [carregandoDiff, setCarregandoDiff] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [rotulo, setRotulo] = useState('')
  const [lixo, setLixo] = useState<ItemLixeira[] | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const carregar = useCallback(async (): Promise<void> => {
    setErro(null)
    try {
      await p.antes()
      if (p.file) {
        const l = await versoesApi.capitulo(p.dir, p.file)
        setVersoes(l)
        setSel((s) => (s && l.some((v) => v.id === s) ? s : (l.find((v) => !v.igual)?.id ?? l[0]?.id ?? null)))
      }
      setLixo(await versoesApi.lixeira(p.dir))
    } catch (e) {
      setErro(msg(e))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.dir, p.file])

  useEffect(() => {
    void carregar()
  }, [carregar])

  useEffect(() => {
    setConfirmar(false)
    if (!sel || !p.file) {
      setDiff(null)
      return
    }
    let vivo = true
    setCarregandoDiff(true)
    versoesApi
      .diff(p.dir, sel, p.file)
      .then((d) => vivo && setDiff(d))
      .catch((e: unknown) => vivo && setErro(msg(e)))
      .finally(() => vivo && setCarregandoDiff(false))
    return () => {
      vivo = false
    }
  }, [sel, p.dir, p.file])

  const salvar = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setOcupado(true)
    setErro(null)
    try {
      await p.antes()
      const s = await versoesApi.salvar(p.dir, rotulo.trim())
      setRotulo('')
      setAviso(`Versão guardada (${quando(s.criadoEm)}). Versões salvas por você nunca são apagadas.`)
      await carregar()
    } catch (er) {
      setErro(msg(er))
    } finally {
      setOcupado(false)
    }
  }

  const restaurar = async (): Promise<void> => {
    if (!sel || !p.file) return
    setOcupado(true)
    setErro(null)
    try {
      await p.antes()
      const r = await versoesApi.restaurar(p.dir, sel, p.file)
      p.onRestaurado(r.project, r.capitulo)
    } catch (e) {
      setErro(msg(e))
      setOcupado(false)
    }
  }

  const recuperar = async (it: ItemLixeira): Promise<void> => {
    setOcupado(true)
    setErro(null)
    try {
      await p.antes()
      const r = await versoesApi.recuperar(p.dir, it.nome)
      p.onRecuperado(r.project, r.arquivo, it.titulo)
    } catch (e) {
      setErro(msg(e))
      setOcupado(false)
    }
  }

  const v = versoes?.find((x) => x.id === sel) ?? null

  return (
    <Modal titulo="Versões" onClose={p.onClose} largura={980}>
      <div className="ms-tabs vs-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={aba === 'capitulo'} disabled={!p.file} onClick={() => setAba('capitulo')}>
          <Ico n="versoes" size={15} /> Este capítulo
        </button>
        <button type="button" role="tab" aria-selected={aba === 'lixeira'} onClick={() => setAba('lixeira')}>
          <Ico n="lixeira" size={15} /> Lixeira{lixo && lixo.length > 0 ? ` · ${lixo.length}` : ''}
        </button>
      </div>

      {erro && <p className="err">{erro}</p>}

      {aba === 'capitulo' && p.file && (
        <>
          <form className="vs-salvar" onSubmit={(e) => void salvar(e)}>
            <span className="ms-eb">{p.nomeCapitulo}</span>
            <label className="ms-sr" htmlFor="vs-rotulo">
              Nome da versão (opcional)
            </label>
            <input
              id="vs-rotulo"
              className="input"
              value={rotulo}
              maxLength={120}
              placeholder="Nome da versão (opcional): “antes da reescrita do final”"
              onChange={(e) => setRotulo(e.target.value)}
            />
            <button type="submit" className="btn sm pri" disabled={ocupado}>
              <Ico n="versoes" size={14} /> Salvar versão agora
            </button>
          </form>
          {aviso && <p className="ms-aviso">{aviso}</p>}

          {versoes === null ? (
            <p className="ms-hint">Abrindo a Arca…</p>
          ) : versoes.length === 0 ? (
            <div className="vs-nada">
              <span className="disp">Nenhuma versão ainda</span>
              <p className="ms-modal-p">
                O Folio guarda o manuscrito na Arca a cada 10 minutos de escrita e antes de toda mudança que não vem de você digitando: aplicar
                revisões, importar, reordenar, restaurar. Use <b>Salvar versão agora</b> para marcar um ponto que quer guardar para sempre.
              </p>
            </div>
          ) : (
            <div className="vs-grade">
              <ol className="vs-lista" aria-label="Versões do capítulo">
                {versoes.map((x) => (
                  <li key={x.id}>
                    <button type="button" className="vs-item" aria-pressed={x.id === sel} onClick={() => setSel(x.id)}>
                      <span className="vs-item-l">
                        <b>{quando(x.criadoEm)}</b>
                        <span className="muted">{relTime(x.criadoEm)}</span>
                      </span>
                      <span className={`vs-motivo m-${MOTIVO[x.motivo].cls}`}>{x.rotulo ? `“${x.rotulo}”` : MOTIVO[x.motivo].nome}</span>
                      <span className="vs-item-l muted">
                        <span>{fmt(x.palavras)} palavras</span>
                        {x.igual && <span className="vs-igual">igual ao atual</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>

              <section className="vs-painel" aria-live="polite">
                {v && (
                  <header className="vs-painel-h">
                    <div>
                      <span className="ms-eb">
                        {MOTIVO[v.motivo].nome} · {quando(v.criadoEm)}
                      </span>
                      <p className="ms-hint">
                        Riscado: saiu do texto desde esta versão. Sublinhado: entrou depois.
                        {diff && diff.tituloVersao !== diff.tituloAtual && (
                          <>
                            {' '}
                            Título nesta versão: <b>“{diff.tituloVersao}”</b>.
                          </>
                        )}
                      </p>
                    </div>
                    {diff && <Placar adicionadas={diff.adicionadas} removidas={diff.removidas} />}
                  </header>
                )}
                <div className="vs-texto">
                  {carregandoDiff && !diff ? (
                    <p className="ms-hint">Comparando…</p>
                  ) : diff ? (
                    <DiffView ops={diff.ops} vazio="Esta versão é igual ao texto atual." />
                  ) : null}
                  {diff && !diff.porPalavra && <p className="ms-hint">Mudou muito: alguns trechos aparecem como parágrafo inteiro.</p>}
                </div>
                {v && !v.igual && (
                  <footer className="vs-painel-f">
                    {confirmar ? (
                      <>
                        <p className="ms-modal-p">
                          O capítulo volta a ser como era em <b>{quando(v.criadoEm)}</b>. O texto de agora vai para a Arca antes, como “antes
                          de restaurar”: dá para desfazer daqui mesmo.
                        </p>
                        <div className="ms-row">
                          <button type="button" className="btn sm ms-quieto" onClick={() => setConfirmar(false)} disabled={ocupado}>
                            Cancelar
                          </button>
                          <button type="button" className="btn sm pri" onClick={() => void restaurar()} disabled={ocupado}>
                            <Ico n="restaurar" size={14} /> {ocupado ? 'Restaurando…' : 'Restaurar esta versão'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="ms-row">
                        <button type="button" className="btn sm" onClick={() => setConfirmar(true)} disabled={ocupado || !diff}>
                          <Ico n="restaurar" size={14} /> Restaurar…
                        </button>
                      </div>
                    )}
                  </footer>
                )}
              </section>
            </div>
          )}
        </>
      )}

      {aba === 'lixeira' && (
        <>
          <p className="ms-modal-p">
            Capítulos excluídos ficam aqui (<code>.arca/lixeira</code>), sem prazo. Recuperar devolve o capítulo ao <b>fim do livro</b>; depois é só
            arrastá-lo para o lugar.
          </p>
          {lixo === null ? (
            <p className="ms-hint">Abrindo a lixeira…</p>
          ) : lixo.length === 0 ? (
            <div className="vs-nada">
              <span className="disp">Lixeira vazia</span>
            </div>
          ) : (
            <ul className="ms-previa vs-lixo">
              {lixo.map((it) => (
                <li key={it.nome}>
                  <span className="vs-lixo-i" aria-hidden="true">
                    <Ico n="lixeira" size={18} />
                  </span>
                  <div className="ms-previa-m">
                    <b>{it.titulo}</b>
                    <span className="muted">
                      {fmt(it.palavras)} palavras · excluído {relTime(it.excluidoEm)} ({quando(it.excluidoEm)})
                    </span>
                  </div>
                  <button type="button" className="btn sm" disabled={ocupado} onClick={() => void recuperar(it)}>
                    <Ico n="restaurar" size={14} /> Recuperar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  )
}
