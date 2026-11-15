import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { call } from '../../api'
import type { Project } from '../../../../shared/types'
import { INSIGHT_TIPOS, type Cartao, type Insight, type InsightTipo, type ProativoEstado } from '../../../../shared/models'
import type { NavParams, Screen } from '../../screen'
import { ia } from '../ia/api'
import { insightsStore, useInsights } from './store'
import { ponte } from './ponte'
import { NOME_TIPO_INSIGHT } from './tipos'
import './insights.css'

interface Props {
  project: Project
  go: (s: Screen, p?: NavParams) => void
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Painel lateral "Insights" do livro aberto. */
export function PainelInsights({ project, go }: Props): ReactElement {
  const { lista, erro, capitulo: capInicial } = useInsights()
  const [tipo, setTipo] = useState<InsightTipo | ''>('')
  const [cap, setCap] = useState(capInicial)
  const [resolvidos, setResolvidos] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ id: string; texto: string; erro: boolean } | null>(null)
  const [est, setEst] = useState<ProativoEstado | null>(null)
  const fechar = useRef<HTMLButtonElement>(null)

  useEffect(() => setCap(capInicial), [capInicial])
  useEffect(() => {
    fechar.current?.focus()
    ia.proativo()
      .then(setEst)
      .catch(() => undefined)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') insightsStore.fechar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const titulo = (file: string): string => project.chapters.find((c) => c.file === file)?.title ?? file
  const visiveis = useMemo(
    () =>
      lista.filter(
        (i) =>
          (resolvidos ? true : i.status === 'novo' || i.status === 'visto') &&
          (!tipo || i.tipo === tipo) &&
          (!cap || i.capitulo === cap)
      ),
    [lista, tipo, cap, resolvidos]
  )

  // o que está no painel deixa de ser "novo" (o sininho zera) — sem esperar
  useEffect(() => {
    const novos = visiveis.filter((i) => i.status === 'novo').slice(0, 30)
    if (!novos.length) return
    const t = setTimeout(() => novos.forEach((i) => void insightsStore.marcar(i.id, 'visto').catch(() => undefined)), 1500)
    return () => clearTimeout(t)
  }, [visiveis])

  const executar = async (i: Insight, f: () => Promise<string | void>): Promise<void> => {
    setOcupado(i.id)
    setAviso(null)
    try {
      const r = await f()
      if (r) setAviso({ id: i.id, texto: r, erro: false })
    } catch (e) {
      setAviso({ id: i.id, texto: msg(e), erro: true })
    } finally {
      setOcupado(null)
    }
  }

  const aplicar = (i: Insight): Promise<void> =>
    executar(i, async () => {
      if (i.acao?.tipo !== 'substituir') return
      const p = ponte.atual
      if (p && p.file === i.capitulo) {
        if (p.rascunhoPendente()) throw new Error('Aceite ou descarte o rascunho da IA neste capítulo antes de aplicar.')
        await p.flush()
      }
      const { tipo: _t, ...troca } = i.acao
      const r = await ia.aplicar(project.dir, i.capitulo, [troca])
      if (!r.aplicadas) throw new Error(r.falhas[0]?.motivo ?? 'O trecho mudou desde a análise; não deu para aplicar.')
      if (p && p.file === i.capitulo) p.recarregar(i.capitulo)
      await insightsStore.marcar(i.id, 'aplicado')
      return 'Aplicado no texto.'
    })

  const cartao = (i: Insight): Promise<void> =>
    executar(i, async () => {
      const palavras = i.texto.split(/\s+/)
      // gravado pelo main (enredo.adicionarCartao), que saneia o quadro
      await call<Cartao>('enredo.adicionarCartao', project.dir, {
        tipo: i.tipo === 'pistas' ? 'ideia' : 'cena',
        titulo: i.acao?.tipo === 'cartao' ? i.acao.titulo : palavras.slice(0, 7).join(' ') + (palavras.length > 7 ? '…' : ''),
        texto: i.acao?.tipo === 'cartao' ? i.acao.texto : i.texto,
        ...(i.capitulo ? { capitulo: i.capitulo } : {}),
        fichas: [],
        // sugestão da IA: entra no Enredo como provisória
        origem: 'ia'
      })
      await insightsStore.marcar(i.id, 'aplicado')
      return 'Virou cartão no Enredo.'
    })

  // "aplicado" só quando o autor aceitar o rascunho no Manuscrito (ver Manuscrito.tsx → aceitar)
  const escrever = (i: Insight): void => {
    insightsStore.fechar()
    go('manuscrito', { chapter: i.capitulo, redigir: i.id, n: String(Date.now()) })
  }

  const abrirFicha = (i: Insight): void => {
    if (i.acao?.tipo !== 'abrirFicha') return
    insightsStore.fechar()
    go('universo', { ficha: i.acao.fichaId })
  }

  const silenciar = (i: Insight): Promise<void> =>
    executar(i, async () => {
      setEst(await call<ProativoEstado>('insights.silenciarTipo', i.tipo))
      await insightsStore.marcar(i.id, 'dispensado')
      return `${NOME_TIPO_INSIGHT[i.tipo]} não será mais observado (dá para religar em Ajustes → IA).`
    })

  const caps = [...new Set(lista.map((i) => i.capitulo).filter(Boolean))]

  return (
    <aside className="ins" role="dialog" aria-modal="false" aria-labelledby="ins-h">
      <header className="ins-h">
        <h2 id="ins-h" className="disp">
          Insights
        </h2>
        <span className="ins-livro">{project.meta.title}</span>
        <button ref={fechar} type="button" className="btn sm" onClick={() => insightsStore.fechar()} aria-label="Fechar painel de insights">
          Fechar
        </button>
      </header>

      <div className="ins-filtros">
        <label className="field">
          Tipo
          <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value as InsightTipo | '')}>
            <option value="">Todos</option>
            {INSIGHT_TIPOS.map((t) => (
              <option key={t} value={t}>
                {NOME_TIPO_INSIGHT[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Capítulo
          <select className="select" value={cap} onChange={(e) => setCap(e.target.value)}>
            <option value="">Todos</option>
            {caps.map((c) => (
              <option key={c} value={c}>
                {titulo(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="check ins-res">
          <input type="checkbox" checked={resolvidos} onChange={(e) => setResolvidos(e.target.checked)} />
          Mostrar aplicados e dispensados
        </label>
      </div>

      <div className="ins-lista" aria-live="polite">
        {erro && <p className="err">Última análise: {erro}</p>}
        {visiveis.length === 0 && (
          <p className="ins-vazio">
            {est?.config.modo === 'off'
              ? 'O modo proativo está desligado. Ligue em Ajustes → IA → Modo proativo.'
              : 'Nada por aqui. Enquanto você escreve, as observações aparecem neste painel, sem interromper.'}
          </p>
        )}
        {visiveis.map((i) => (
          <article key={i.id} className={`ins-item${i.status === 'novo' ? ' novo' : ''}${i.status === 'aplicado' || i.status === 'dispensado' ? ' feito' : ''}`}>
            <div className="ins-meta">
              <span className="ins-tag">{NOME_TIPO_INSIGHT[i.tipo] ?? i.tipo}</span>
              {i.capitulo && <span className="ins-cap">{titulo(i.capitulo)}</span>}
              <span className="ins-origem" title={i.origem === 'ia' ? 'Gerado pela IA' : 'Checagem local do Darkpages (nada sai do computador)'}>
                {i.origem === 'ia' ? 'IA' : 'local'}
              </span>
              {i.status !== 'novo' && i.status !== 'visto' && <span className="ins-cap">{i.status}</span>}
            </div>
            {i.trecho && i.tipo !== 'resumo' && <blockquote className="ins-trecho">{i.trecho}</blockquote>}
            <p className="ins-texto">{i.texto}</p>
            {i.acao?.tipo === 'substituir' && (
              <p className="ins-troca">
                <del>{i.acao.original}</del> <span aria-hidden="true">→</span> <ins>{i.acao.substituto || '(remover)'}</ins>
              </p>
            )}
            {(i.status === 'novo' || i.status === 'visto') && (
              <div className="ins-acoes">
                {i.acao?.tipo === 'substituir' && (
                  <button type="button" className="btn sm pri" disabled={ocupado === i.id} onClick={() => void aplicar(i)} title="Troca o trecho no capítulo e salva">
                    Aplicar no texto
                  </button>
                )}
                {i.acao?.tipo === 'abrirFicha' && (
                  <button type="button" className="btn sm" onClick={() => abrirFicha(i)} title="Abre a ficha no Universo para conferir">
                    Abrir ficha
                  </button>
                )}
                {(i.acao?.tipo === 'redigir' || i.tipo === 'ideias') && i.capitulo && (
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => escrever(i)}
                    title="Abre o capítulo e a IA escreve 1 a 3 parágrafos no fim dele, como rascunho que você aceita ou descarta"
                  >
                    Escrever no texto
                  </button>
                )}
                {(i.acao?.tipo === 'cartao' || i.tipo === 'ideias' || i.tipo === 'pistas') && (
                  <button type="button" className="btn sm" disabled={ocupado === i.id} onClick={() => void cartao(i)} title="Cria um cartão no quadro do Enredo, ligado ao capítulo">
                    Virar cartão
                  </button>
                )}
                {i.capitulo && i.tipo === 'resumo' && (
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => {
                      insightsStore.fechar()
                      go('manuscrito', { chapter: i.capitulo })
                    }}
                  >
                    Abrir capítulo
                  </button>
                )}
                <button type="button" className="btn sm" disabled={ocupado === i.id} onClick={() => void executar(i, () => insightsStore.marcar(i.id, 'dispensado'))}>
                  Dispensar
                </button>
                <button type="button" className="btn sm ins-quieto" disabled={ocupado === i.id} onClick={() => void silenciar(i)} title="Desliga este tipo no modo proativo">
                  Não mostrar esse tipo
                </button>
              </div>
            )}
            {aviso?.id === i.id && (
              <p className={aviso.erro ? 'err' : 'ins-ok'} role={aviso.erro ? 'alert' : 'status'}>
                {aviso.texto}
              </p>
            )}
          </article>
        ))}
      </div>

      {est && (
        <footer className="ins-rodape">
          <i className={`dot ${est.config.modo === 'off' ? 'bad' : est.externo && est.iaLigada ? 'busy' : ''}`} />
          {est.config.modo === 'off'
            ? 'Modo proativo desligado.'
            : `Modo ${est.config.modo} · IA hoje: ${est.usadasHoje}/${est.config.limiteDiario} · ${
                !est.iaLigada ? 'só checagens locais, nada sai do computador' : est.externo ? `trechos vão para ${est.nomeProvedor}` : 'nada sai do computador'
              }${est.silencioAgora ? ' · horário silencioso' : ''}`}
        </footer>
      )}
    </aside>
  )
}
