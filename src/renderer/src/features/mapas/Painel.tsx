import { useEffect, useRef, useState, type ReactElement } from 'react'
import { isWeb } from '../../api'
import { Escolha, Faixa, Segmentos, Texto, type Passo } from './controles'
import { dimensoesPng, exportarMapa, type Exportado, type Formato, type Papel } from './exportar'
import { IconeM } from './icones'
import { acharItem, acharPorId, ehSimboloCamada, editarRio, editarRota, editarRotulo, editarSimbolo, nomeItem, type ItemRef } from './itens'
import { SIMBOLOS, TIPOS } from './simbolos'
import { terrenoVazio } from './geom'
import { CAMADAS, type Canto, type CamadaId, type MapaDoc, type Rio, type Rota, type Rotulo, type Simbolo } from './types'
import type { Historico } from './useHistorico'

const CANTOS: Array<{ v: Canto; nome: string }> = [
  { v: 'no', nome: 'Noroeste (sup. esq.)' },
  { v: 'ne', nome: 'Nordeste (sup. dir.)' },
  { v: 'so', nome: 'Sudoeste (inf. esq.)' },
  { v: 'se', nome: 'Sudeste (inf. dir.)' }
]

const virgula = (n: number, casas = 2): string => n.toFixed(casas).replace('.', ',')

interface Props {
  dir: string
  doc: MapaDoc
  hist: Historico<MapaDoc>
  passo: Passo
  sel: ItemRef | null
  focarNome: string | null
  alvos: { fichas: Map<string, string>; cartoes: Map<string, string> }
  onSelecionar: (r: ItemRef) => void
  onVerLigacao: (itemId: string) => void
  onLigar: (r: ItemRef) => void
  onExcluir: () => void
  onDuplicar: () => void
  flush: () => Promise<void>
}

export function PainelLateral(props: Props): ReactElement {
  const { doc, hist, passo, sel } = props
  const contagem: Record<CamadaId, number> = {
    terreno: doc.terreno.rle.split(',').filter((r) => !r.startsWith('0:')).length > 0 ? 1 : 0,
    relevo: doc.relevo.length,
    vegetacao: doc.vegetacao.length,
    simbolos: doc.simbolos.length,
    rios: doc.rios.length,
    rotas: doc.rotas.length,
    rotulos: doc.rotulos.length + [...doc.relevo, ...doc.vegetacao, ...doc.simbolos].filter((s) => s.nome).length
  }
  const alternarCamada = (c: CamadaId): void =>
    hist.aplicar((d) => ({ ...d, ocultas: d.ocultas.includes(c) ? d.ocultas.filter((x) => x !== c) : [...d.ocultas, c] }))

  const deco = doc.deco
  const setDeco = (f: (x: MapaDoc['deco']) => MapaDoc['deco'], continuo = false): void =>
    (continuo ? hist.previa : hist.aplicar)((d) => ({ ...d, deco: f(d.deco) }))

  return (
    <aside className="mp-lado" aria-label="Painel do mapa">
      <section className="mp-sec" aria-labelledby="mp-h-mapa">
        <h3 id="mp-h-mapa" className="mp-eb">
          Mapa
        </h3>
        <Texto rotulo="Nome" valor={doc.nome} max={120} passoHist={passo} onMuda={(v) => hist.previa((d) => ({ ...d, nome: v }))} />
        <div className="mp-estilos" role="radiogroup" aria-label="Estilo do mapa">
          <button type="button" role="radio" aria-checked={doc.estilo === 'pena'} onClick={() => hist.aplicar((d) => ({ ...d, estilo: 'pena' }))}>
            <Amostra estilo="pena" />
            <span>À pena</span>
          </button>
          <button type="button" role="radio" aria-checked={doc.estilo === 'colorido'} onClick={() => hist.aplicar((d) => ({ ...d, estilo: 'colorido' }))}>
            <Amostra estilo="colorido" />
            <span>Colorido</span>
          </button>
        </div>
      </section>

      {sel && <Inspetor {...props} sel={sel} />}

      <section className="mp-sec" aria-labelledby="mp-h-camadas">
        <h3 id="mp-h-camadas" className="mp-eb">
          Camadas
        </h3>
        <ul className="mp-camadas">
          {CAMADAS.map((c) => (
            <li key={c.id}>
              <label className="check">
                <input type="checkbox" checked={!doc.ocultas.includes(c.id)} onChange={() => alternarCamada(c.id)} />
                <span className="mp-camada-nome">{c.nome}</span>
                <span className="mp-conta" aria-label={`${contagem[c.id]} itens`}>
                  {c.id === 'terreno' ? (contagem.terreno ? 'pintado' : 'vazio') : contagem[c.id]}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <label className="check">
          <input type="checkbox" checked={deco.grade} onChange={(e) => setDeco((x) => ({ ...x, grade: e.target.checked }))} />
          Grade
        </label>
      </section>

      {doc.ligacoes.length > 0 && (
        <section className="mp-sec" aria-labelledby="mp-h-lig">
          <h3 id="mp-h-lig" className="mp-eb">
            Ligações · {doc.ligacoes.length}
          </h3>
          <ul className="mp-ligs">
            {doc.ligacoes.map((l) => {
              const r = acharPorId(doc, l.item)
              if (!r) return null
              const alvo = l.fichaId ? props.alvos.fichas.get(l.fichaId) : l.cartaoId ? props.alvos.cartoes.get(l.cartaoId) : undefined
              return (
                <li key={l.id}>
                  <button type="button" className="mp-lig" onClick={() => props.onVerLigacao(l.item)}>
                    <span className="mp-lig-item">{nomeItem(doc, r)}</span>
                    <span className="mp-lig-alvo">
                      {l.fichaId ? 'Ficha' : 'Cartão'}: {alvo ?? 'não encontrado'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="mp-sec" aria-labelledby="mp-h-costa">
        <h3 id="mp-h-costa" className="mp-eb">
          Costa
        </h3>
        <Faixa
          rotulo="Irregularidade"
          valor={doc.terreno.rugosidade}
          min={0}
          max={1}
          passo={0.05}
          fmt={(v) => `${Math.round(v * 100)}%`}
          passoHist={passo}
          onMuda={(v) => hist.previa((d) => ({ ...d, terreno: { ...d.terreno, rugosidade: v } }))}
        />
        <div className="mp-linha">
          <button
            type="button"
            className="btn sm"
            onClick={() => hist.aplicar((d) => ({ ...d, terreno: { ...d.terreno, semente: Math.floor(Math.random() * 1e6) } }))}
          >
            Variar recortes
          </button>
          <button
            type="button"
            className="btn sm"
            onClick={() => hist.aplicar((d) => ({ ...d, terreno: { ...terrenoVazio(d.largura, d.altura, d.terreno.cel), rugosidade: d.terreno.rugosidade } }))}
          >
            Limpar terreno
          </button>
        </div>
      </section>

      <section className="mp-sec" aria-labelledby="mp-h-orn">
        <h3 id="mp-h-orn" className="mp-eb">
          Moldura e ornamentos
        </h3>
        <label className="check">
          <input type="checkbox" checked={deco.moldura} onChange={(e) => setDeco((x) => ({ ...x, moldura: e.target.checked }))} />
          Moldura
        </label>

        <label className="check">
          <input type="checkbox" checked={deco.cartucho.on} onChange={(e) => setDeco((x) => ({ ...x, cartucho: { ...x.cartucho, on: e.target.checked } }))} />
          Cartucho com o nome
        </label>
        {deco.cartucho.on && (
          <div className="mp-sub">
            <Texto
              rotulo="Título"
              valor={deco.cartucho.titulo}
              placeholder={doc.nome}
              passoHist={passo}
              onMuda={(v) => setDeco((x) => ({ ...x, cartucho: { ...x.cartucho, titulo: v } }), true)}
            />
            <Texto
              rotulo="Subtítulo"
              valor={deco.cartucho.subtitulo}
              passoHist={passo}
              onMuda={(v) => setDeco((x) => ({ ...x, cartucho: { ...x.cartucho, subtitulo: v } }), true)}
            />
            <Escolha rotulo="Posição" valor={deco.cartucho.canto} opcoes={CANTOS} onMuda={(v) => setDeco((x) => ({ ...x, cartucho: { ...x.cartucho, canto: v } }))} />
          </div>
        )}

        <label className="check">
          <input type="checkbox" checked={deco.rosa.on} onChange={(e) => setDeco((x) => ({ ...x, rosa: { ...x.rosa, on: e.target.checked } }))} />
          Rosa dos ventos
        </label>
        {deco.rosa.on && (
          <div className="mp-sub">
            <Escolha rotulo="Posição" valor={deco.rosa.canto} opcoes={CANTOS} onMuda={(v) => setDeco((x) => ({ ...x, rosa: { ...x.rosa, canto: v } }))} />
            <Faixa
              rotulo="Tamanho"
              valor={deco.rosa.tam}
              min={30}
              max={180}
              passoHist={passo}
              onMuda={(v) => setDeco((x) => ({ ...x, rosa: { ...x.rosa, tam: v } }), true)}
            />
          </div>
        )}

        <label className="check">
          <input type="checkbox" checked={deco.escala.on} onChange={(e) => setDeco((x) => ({ ...x, escala: { ...x.escala, on: e.target.checked } }))} />
          Escala em léguas
        </label>
        {deco.escala.on && (
          <div className="mp-sub">
            <Escolha rotulo="Posição" valor={deco.escala.canto} opcoes={CANTOS} onMuda={(v) => setDeco((x) => ({ ...x, escala: { ...x.escala, canto: v } }))} />
            <Faixa
              rotulo="Largura do mapa"
              valor={deco.escala.leguasLargura}
              min={10}
              max={3000}
              passo={10}
              fmt={(v) => `${v} léguas`}
              passoHist={passo}
              onMuda={(v) => setDeco((x) => ({ ...x, escala: { ...x.escala, leguasLargura: v } }), true)}
            />
          </div>
        )}
      </section>

      <Exportar dir={props.dir} doc={doc} flush={props.flush} />
    </aside>
  )
}

/** Amostra do estilo do mapa (paleta própria do desenho, não da interface). */
function Amostra({ estilo }: { estilo: MapaDoc['estilo'] }): ReactElement {
  const ilha = 'M14 30c4-12 16-18 30-16s22-6 30 2 6 20-6 24-26 4-36 2-20 0-18-12z'
  if (estilo === 'pena') {
    return (
      <svg className="mp-amostra" viewBox="0 0 100 50" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="100" height="50" fill="#E8D9B5" />
        <path d={ilha} fill="none" stroke="#3B2E1E" strokeOpacity=".3" strokeWidth="9" />
        <path d={ilha} fill="none" stroke="#E8D9B5" strokeWidth="7" />
        <path d={ilha} fill="#F5ECD4" stroke="#3B2E1E" strokeWidth="1.2" />
        <path d="M34 30l6-9 3 4 3-3 6 8z" fill="#F4EAD2" stroke="#3B2E1E" strokeWidth=".8" strokeLinejoin="round" />
        <path d="M58 27a3 3 0 106 0 3 3 0 10-6 0M64 30a3 3 0 106 0 3 3 0 10-6 0" fill="#F1E6CA" stroke="#3B2E1E" strokeWidth=".7" />
      </svg>
    )
  }
  return (
    <svg className="mp-amostra" viewBox="0 0 100 50" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="100" height="50" fill="#4F7F96" />
      <path d={ilha} fill="none" stroke="#8DB8C4" strokeWidth="6" />
      <path d={ilha} fill="#A9C07F" />
      <path d="M30 30c2-8 10-12 18-10s10 8 4 12-20 4-22-2z" fill="#BDB073" />
      <path d="M38 28c1-4 5-6 8-5s4 4 1 6-9 2-9-1z" fill="#A88C66" />
      <path d="M56 22c6-3 14-1 14 5s-8 6-12 4-6-6-2-9z" fill="#5F8A4C" fillOpacity=".7" />
      <path d={ilha} fill="none" stroke="#3A4A34" strokeWidth=".8" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// inspetor do item selecionado
// ---------------------------------------------------------------------------

function Inspetor(props: Props & { sel: ItemRef }): ReactElement | null {
  const { doc, hist, passo, sel, focarNome, alvos } = props
  const it = acharItem(doc, sel)
  if (!it) return null
  const lig = doc.ligacoes.find((l) => l.item === sel.id)
  const alvoNome = lig ? (lig.fichaId ? alvos.fichas.get(lig.fichaId) : lig.cartaoId ? alvos.cartoes.get(lig.cartaoId) : undefined) : undefined
  const ligavel = sel.camada !== 'rios' && sel.camada !== 'rotas'
  const acoes = (
    <div className="mp-linha">
      {ligavel && (
        <button type="button" className="btn sm" onClick={() => props.onLigar(sel)}>
          <IconeM nome="ligar" size={16} />
          {lig ? 'Trocar ligação' : 'Ligar…'}
        </button>
      )}
      <button type="button" className="btn sm" onClick={props.onDuplicar} title="Duplicar (Ctrl+D)">
        Duplicar
      </button>
      <button type="button" className="btn sm" onClick={props.onExcluir} title="Excluir (Delete)">
        Excluir
      </button>
    </div>
  )
  const ligInfo = lig && (
    <p className="mp-ligado">
      Ligado {lig.fichaId ? 'à ficha' : 'ao cartão'} <b>{alvoNome ?? 'não encontrado'}</b>{' '}
      <button type="button" className="mp-link" onClick={() => props.onVerLigacao(sel.id)}>
        ver
      </button>
    </p>
  )

  if (ehSimboloCamada(sel.camada)) {
    const camada = sel.camada
    const s = it as Simbolo
    const edita = (f: (x: Simbolo) => Simbolo, continuo = true): void => (continuo ? hist.previa : hist.aplicar)((d) => editarSimbolo(d, camada, s.id, f))
    return (
      <section className="mp-sec mp-insp" aria-labelledby="mp-h-sel">
        <h3 id="mp-h-sel" className="mp-eb">
          Selecionado · {SIMBOLOS[s.tipo].nome}
        </h3>
        <Escolha
          rotulo="Símbolo"
          valor={s.tipo}
          opcoes={TIPOS.filter((t) => SIMBOLOS[t].camada === camada).map((t) => ({ v: t, nome: SIMBOLOS[t].nome }))}
          onMuda={(v) => edita((x) => ({ ...x, tipo: v }), false)}
        />
        <Texto
          key={`nome-${s.id}`}
          rotulo="Nome no mapa"
          valor={s.nome ?? ''}
          placeholder="Sem nome"
          autoFocus={focarNome === s.id}
          passoHist={passo}
          onMuda={(v) => edita((x) => ({ ...x, nome: v || undefined }))}
        />
        <Faixa rotulo="Escala" valor={s.escala} min={0.3} max={4} passo={0.05} fmt={(v) => `${virgula(v)}×`} passoHist={passo} onMuda={(v) => edita((x) => ({ ...x, escala: v }))} />
        <Faixa rotulo="Rotação" valor={s.rot} min={-180} max={180} fmt={(v) => `${v}°`} passoHist={passo} onMuda={(v) => edita((x) => ({ ...x, rot: v }))} />
        {ligInfo}
        {acoes}
      </section>
    )
  }

  if (sel.camada === 'rotulos') {
    const r = it as Rotulo
    const edita = (f: (x: Rotulo) => Rotulo, continuo = true): void => (continuo ? hist.previa : hist.aplicar)((d) => editarRotulo(d, r.id, f))
    return (
      <section className="mp-sec mp-insp" aria-labelledby="mp-h-sel">
        <h3 id="mp-h-sel" className="mp-eb">
          Selecionado · Rótulo
        </h3>
        <Texto key={`txt-${r.id}`} rotulo="Texto" valor={r.texto} autoFocus={focarNome === r.id} passoHist={passo} onMuda={(v) => edita((x) => ({ ...x, texto: v }))} />
        <Segmentos
          rotulo="Estilo"
          valor={r.estilo}
          onMuda={(v) => edita((x) => ({ ...x, estilo: v }), false)}
          opcoes={[
            { v: 'mar', nome: 'Mar' },
            { v: 'regiao', nome: 'Região' },
            { v: 'cidade', nome: 'Cidade' }
          ]}
        />
        <Faixa rotulo="Tamanho" valor={r.tam} min={8} max={90} passoHist={passo} onMuda={(v) => edita((x) => ({ ...x, tam: v }))} />
        <Faixa rotulo="Espaçamento" valor={r.espaco} min={0} max={40} passoHist={passo} onMuda={(v) => edita((x) => ({ ...x, espaco: v }))} />
        <Faixa
          rotulo="Curvatura"
          valor={r.curva}
          min={-1}
          max={1}
          passo={0.05}
          fmt={(v) => (Math.abs(v) < 0.01 ? 'reto' : virgula(v))}
          passoHist={passo}
          onMuda={(v) => edita((x) => ({ ...x, curva: v }))}
        />
        <Faixa rotulo="Rotação" valor={r.rot} min={-90} max={90} fmt={(v) => `${v}°`} passoHist={passo} onMuda={(v) => edita((x) => ({ ...x, rot: v }))} />
        {ligInfo}
        {acoes}
      </section>
    )
  }

  if (sel.camada === 'rios') {
    const r = it as Rio
    return (
      <section className="mp-sec mp-insp" aria-labelledby="mp-h-sel">
        <h3 id="mp-h-sel" className="mp-eb">
          Selecionado · Rio
        </h3>
        <Faixa
          rotulo="Largura na foz"
          valor={r.largura}
          min={2}
          max={40}
          passoHist={passo}
          onMuda={(v) => hist.previa((d) => editarRio(d, r.id, (x) => ({ ...x, largura: v })))}
        />
        <button type="button" className="btn sm" onClick={() => hist.aplicar((d) => editarRio(d, r.id, (x) => ({ ...x, pontos: x.pontos.slice().reverse() })))}>
          Inverter nascente e foz
        </button>
        {acoes}
      </section>
    )
  }

  const r = it as Rota
  return (
    <section className="mp-sec mp-insp" aria-labelledby="mp-h-sel">
      <h3 id="mp-h-sel" className="mp-eb">
        Selecionado · Rota
      </h3>
      <Segmentos
        rotulo="Tipo de rota"
        valor={r.tipo}
        onMuda={(v) => hist.aplicar((d) => editarRota(d, r.id, (x) => ({ ...x, tipo: v })))}
        opcoes={[
          { v: 'trilha', nome: 'Por terra' },
          { v: 'mar', nome: 'Marítima' }
        ]}
      />
      {acoes}
    </section>
  )
}

// ---------------------------------------------------------------------------
// exportação
// ---------------------------------------------------------------------------

function Exportar({ dir, doc, flush }: { dir: string; doc: MapaDoc; flush: () => Promise<void> }): ReactElement {
  const [papel, setPapel] = useState<Papel>('A4')
  const [ocupado, setOcupado] = useState<Formato | null>(null)
  const [res, setRes] = useState<Exportado | null>(null)
  const [erro, setErro] = useState('')
  const urlRef = useRef<string | null>(null)
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    []
  )
  const dims = dimensoesPng(doc, papel)

  const exportar = async (formato: Formato): Promise<void> => {
    setOcupado(formato)
    setErro('')
    try {
      await flush()
      const r = await exportarMapa(dir, doc, formato, papel)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = r.url
      setRes(r)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(null)
    }
  }

  return (
    <section className="mp-sec mp-export" aria-labelledby="mp-h-exp">
      <h3 id="mp-h-exp" className="mp-eb">
        Exportar
      </h3>
      <Segmentos rotulo="Papel" valor={papel} onMuda={setPapel} opcoes={[{ v: 'A4', nome: 'A4' }, { v: 'A3', nome: 'A3' }]} />
      <span className="label">
        PNG {dims.w} × {dims.h} px · 300 dpi
      </span>
      <div className="mp-linha">
        <button type="button" className="btn pri sm" disabled={ocupado !== null} onClick={() => void exportar('png')}>
          <IconeM nome="exportar" size={16} />
          {ocupado === 'png' ? 'Gerando PNG…' : 'PNG'}
        </button>
        <button type="button" className="btn sm" disabled={ocupado !== null} onClick={() => void exportar('svg')}>
          {ocupado === 'svg' ? 'Gerando SVG…' : 'SVG'}
        </button>
      </div>
      <div role="status" aria-live="polite">
        {erro && <p className="err">{erro}</p>}
        {res && !erro && (
          <div className="mp-exportado">
            <span className="label">
              Salvo no livro em <b>assets/{res.arquivo}</b> ({(res.bytes / 1e6).toFixed(1).replace('.', ',')} MB)
            </span>
            <a className="btn sm" href={res.url} download={res.download}>
              {isWeb ? 'Baixar arquivo' : 'Salvar uma cópia…'}
            </a>
          </div>
        )}
      </div>
    </section>
  )
}
