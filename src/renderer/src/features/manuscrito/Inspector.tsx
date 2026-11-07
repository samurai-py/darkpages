import { useEffect, useRef, useState, type ReactElement } from 'react'
import { call, folio } from '../../api'
import {
  ASSET_NAMES,
  type Cartao,
  type CartaoTipo,
  type CenaMeta,
  type Conflito,
  type Ficha,
  type FichaCampo,
  type Ideia,
  type IdeiaTipo,
  type IdeiasResult
} from '../../../../shared/models'
import { Ico } from './icones'
import { novoId } from './texto'

interface Props {
  dir: string
  file: string
  rotulo: string
  cena: CenaMeta
  onCena: (c: CenaMeta) => void
  fichas: Ficha[]
  onFicha: (f: Ficha) => void
  presentes: Array<{ ficha: Ficha; vezes: number }>
  conflitos: Conflito[]
  checando: boolean
  erroContinuidade: string | null
  onChecar: () => void
  onAbrirFicha: (id: string) => void
  onIgnorar: (c: Conflito) => void
  /** salva o capítulo antes de chamadas de IA que leem o arquivo */
  antesDaIA: () => Promise<void>
  /** "Escrever no texto": a IA redige a ideia no ponto do cursor como rascunho */
  onRedigir: (ideia: Ideia) => Promise<void>
  /** já existe um rascunho sendo escrito/pendente */
  redigindo: boolean
}

/** Retratos carregados uma vez por livro (data URL ou null). */
const cacheRetratos = new Map<string, Promise<string | null>>()
function retrato(dir: string, nome: string): Promise<string | null> {
  const k = `${dir}::${nome}`
  let p = cacheRetratos.get(k)
  if (!p) {
    p = folio.assets.get(dir, nome).catch(() => null)
    cacheRetratos.set(k, p)
  }
  return p
}

function iniciais(nome: string): string {
  return (
    nome
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join('') || '?'
  )
}

export function Avatar({ dir, ficha, size = 44 }: { dir: string; ficha: Ficha; size?: number }): ReactElement {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    setSrc(null)
    if (ficha.retrato) void retrato(dir, ficha.retrato).then((s) => vivo && setSrc(s))
    return () => {
      vivo = false
    }
  }, [dir, ficha.retrato, ficha.atualizadoEm])
  return (
    <span className="ms-av" style={{ width: size, height: size }}>
      {src ? <img src={src} alt="" /> : <span aria-hidden="true">{iniciais(ficha.nome)}</span>}
    </span>
  )
}

export function Inspector(p: Props): ReactElement {
  const [aba, setAba] = useState<'cena' | 'ideias'>('cena')
  return (
    <aside className="ms-insp" aria-label="Inspetor da cena">
      <div role="tablist" aria-label="Painel" className="ms-tabs">
        <button type="button" role="tab" id="tab-cena" aria-controls="painel-cena" aria-selected={aba === 'cena'} onClick={() => setAba('cena')}>
          Cena
        </button>
        <button
          type="button"
          role="tab"
          id="tab-ideias"
          aria-controls="painel-ideias"
          aria-selected={aba === 'ideias'}
          onClick={() => setAba('ideias')}
        >
          <Ico n="brilho" size={14} /> Ideias
        </button>
      </div>
      {aba === 'cena' ? (
        <div role="tabpanel" id="painel-cena" aria-labelledby="tab-cena" className="ms-painel">
          <PainelCena {...p} />
        </div>
      ) : (
        <div role="tabpanel" id="painel-ideias" aria-labelledby="tab-ideias" className="ms-painel ms-painel-ideias">
          <PainelIdeias {...p} />
        </div>
      )}
    </aside>
  )
}

// ------------------------------------------------------------------ Cena

function PainelCena(p: Props): ReactElement {
  const [fichaAberta, setFichaAberta] = useState<string | null>(null)
  const personagens = p.fichas.filter((f) => f.tipo === 'personagem')
  const lugares = p.fichas.filter((f) => f.tipo === 'lugar')
  const pov = p.fichas.find((f) => f.id === p.cena.pov)
  const cenario = p.fichas.find((f) => f.id === p.cena.cenario)
  const aberta = p.fichas.find((f) => f.id === fichaAberta)
  const set = (patch: Partial<CenaMeta>): void => p.onCena({ ...p.cena, ...patch })

  return (
    <>
      <section className="ms-sec">
        <label className="ms-eb" htmlFor="ms-sinopse">
          Sinopse da cena
        </label>
        <textarea
          id="ms-sinopse"
          className="ms-txt ms-txt-livro"
          rows={3}
          placeholder="Em uma ou duas frases: o que acontece aqui?"
          value={p.cena.sinopse ?? ''}
          onChange={(e) => set({ sinopse: e.target.value })}
        />
      </section>

      <section className="ms-sec">
        <label className="ms-eb" htmlFor="ms-pov">
          Ponto de vista
        </label>
        <div className="ms-sel-ficha">
          {pov && <Avatar dir={p.dir} ficha={pov} size={36} />}
          <select id="ms-pov" className="select" value={p.cena.pov ?? ''} onChange={(e) => set({ pov: e.target.value || undefined })}>
            <option value="">— ninguém definido —</option>
            {personagens.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
                {f.papel ? ` · ${f.papel}` : ''}
              </option>
            ))}
          </select>
        </div>
        <label className="ms-eb" htmlFor="ms-cenario">
          Cenário
        </label>
        <div className="ms-sel-ficha">
          <span className="ms-ico-acc">
            <Ico n="lugar" size={18} />
          </span>
          <select
            id="ms-cenario"
            className="select"
            value={p.cena.cenario ?? ''}
            onChange={(e) => set({ cenario: e.target.value || undefined })}
          >
            <option value="">— nenhum —</option>
            {lugares.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </div>
        {personagens.length === 0 && lugares.length === 0 && (
          <p className="ms-hint">Crie fichas de personagens e lugares no Universo para escolher aqui.</p>
        )}
        {(cenario || pov) && (
          <div className="ms-row ms-row-l">
            {pov && (
              <button type="button" className="ms-link" onClick={() => setFichaAberta(pov.id)}>
                Ficha de {pov.nome}
              </button>
            )}
            {cenario && (
              <button type="button" className="ms-link" onClick={() => setFichaAberta(cenario.id)}>
                Ficha de {cenario.nome}
              </button>
            )}
          </div>
        )}
      </section>

      <section className="ms-sec">
        <span className="ms-eb">Nesta cena</span>
        {p.presentes.length === 0 ? (
          <p className="ms-hint">Ninguém do Universo é citado neste capítulo ainda.</p>
        ) : (
          <ul className="ms-elenco">
            {p.presentes.map(({ ficha, vezes }) => (
              <li key={ficha.id}>
                <button
                  type="button"
                  className="ms-elenco-b"
                  aria-pressed={fichaAberta === ficha.id}
                  onClick={() => setFichaAberta(fichaAberta === ficha.id ? null : ficha.id)}
                  title={`${ficha.nome} · ${vezes}× no capítulo`}
                >
                  <Avatar dir={p.dir} ficha={ficha} />
                  <span className="ms-elenco-n">{ficha.nome.split(' ')[0]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {aberta && <FichaRapida key={aberta.id} dir={p.dir} ficha={aberta} onSalva={p.onFicha} onAbrir={() => p.onAbrirFicha(aberta.id)} onFechar={() => setFichaAberta(null)} />}
      </section>

      <section className="ms-sec">
        <span className="ms-eb">Continuidade</span>
        <p className="ms-hint">A IA compara o capítulo com os atributos das fichas (cor dos olhos, quem já morreu…).</p>
        <button type="button" className="btn sm" onClick={p.onChecar} disabled={p.checando}>
          <Ico n="olho" size={15} /> {p.checando ? 'Checando…' : 'Checar continuidade'}
        </button>
        {p.erroContinuidade && <p className="err">{p.erroContinuidade}</p>}
        {p.conflitos.length > 0 && (
          <ul className="ms-furos">
            {p.conflitos.map((c) => (
              <li key={`${c.fichaId}|${c.campo}|${c.trecho}`} className="ms-furo">
                <strong>
                  {c.fichaNome} · {c.campo}
                </strong>
                <span>
                  Na ficha: <b>{c.esperado}</b>. Aqui: <b className="ms-alerta">{c.encontrado}</b>.
                </span>
                <q className="ms-trecho">{c.trecho}</q>
                {c.explicacao && <span className="ms-hint">{c.explicacao}</span>}
                <div className="ms-row ms-row-l">
                  <button type="button" className="btn sm" onClick={() => p.onAbrirFicha(c.fichaId)}>
                    Abrir ficha
                  </button>
                  <button type="button" className="btn sm ms-quieto" onClick={() => p.onIgnorar(c)}>
                    Foi de propósito
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ms-sec">
        <label className="ms-eb" htmlFor="ms-notas">
          Notas do autor
        </label>
        <textarea
          id="ms-notas"
          className="ms-txt ms-txt-notas"
          rows={5}
          placeholder="Plantar aqui a pista do sino de bolso…"
          value={p.cena.notas ?? ''}
          onChange={(e) => set({ notas: e.target.value })}
        />
      </section>
    </>
  )
}

/** Converte qualquer imagem em PNG de até 768 px (o retrato é gravado como .png). */
async function paraPng(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((ok, fail) => {
      img.onload = () => ok()
      img.onerror = () => fail(new Error('Imagem inválida'))
      img.src = url
    })
    const k = Math.min(1, 768 / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.naturalWidth * k))
    c.height = Math.max(1, Math.round(img.naturalHeight * k))
    c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** M10: editar a ficha sem sair da escrita (papel, atributos, notas e retrato). */
function FichaRapida({
  dir,
  ficha,
  onSalva,
  onAbrir,
  onFechar
}: {
  dir: string
  ficha: Ficha
  onSalva: (f: Ficha) => void
  onAbrir: () => void
  onFechar: () => void
}): ReactElement {
  const [f, setF] = useState<Ficha>(ficha)
  const [estado, setEstado] = useState<string | null>(null)
  const arquivo = useRef<HTMLInputElement>(null)
  const sujo = JSON.stringify(f) !== JSON.stringify(ficha)

  const salvar = async (prox: Ficha): Promise<void> => {
    setEstado('Salvando…')
    try {
      const salvo = await folio.docs.put<Ficha>(dir, 'universo', prox.id, { ...prox, atualizadoEm: new Date().toISOString() })
      onSalva(salvo)
      setF(salvo)
      setEstado('Ficha salva')
    } catch (e) {
      setEstado(e instanceof Error ? e.message : String(e))
    }
  }

  const enviarRetrato = async (file: File): Promise<void> => {
    setEstado('Enviando retrato…')
    try {
      const nome = ASSET_NAMES.retrato(f.id)
      await folio.assets.put(dir, nome, await paraPng(file))
      cacheRetratos.delete(`${dir}::${nome}`)
      await salvar({ ...f, retrato: nome })
    } catch (e) {
      setEstado(e instanceof Error ? e.message : String(e))
    }
  }

  const campo = (i: number, patch: Partial<FichaCampo>): void =>
    setF({ ...f, campos: f.campos.map((c, j) => (j === i ? { ...c, ...patch } : c)) })

  return (
    <form
      className="ms-ficha panel"
      aria-label={`Ficha de ${f.nome}`}
      onSubmit={(e) => {
        e.preventDefault()
        void salvar(f)
      }}
    >
      <div className="ms-ficha-h">
        <button type="button" className="ms-ficha-foto" onClick={() => arquivo.current?.click()} aria-label={`Trocar retrato de ${f.nome}`}>
          <Avatar dir={dir} ficha={f} size={52} />
          <span className="ms-ficha-foto-i">
            <Ico n="imagem" size={13} />
          </span>
        </button>
        <input
          ref={arquivo}
          type="file"
          accept="image/*"
          className="ms-sr"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void enviarRetrato(file)
            e.target.value = ''
          }}
        />
        <div className="ms-ficha-t">
          <strong>{f.nome}</strong>
          <label className="ms-sr" htmlFor="ms-ficha-papel">
            Papel
          </label>
          <input id="ms-ficha-papel" className="ms-inline" placeholder="papel (ex.: protagonista)" value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value })} />
        </div>
        <button type="button" className="ms-ib" aria-label="Fechar ficha" onClick={onFechar}>
          <Ico n="fechar" size={14} />
        </button>
      </div>
      <div className="ms-campos">
        {f.campos.map((c, i) => (
          <div key={i} className="ms-campo">
            <input className="ms-inline" aria-label="Atributo" value={c.nome} placeholder="Atributo" onChange={(e) => campo(i, { nome: e.target.value })} />
            <input className="ms-inline" aria-label={`Valor de ${c.nome || 'atributo'}`} value={c.valor} placeholder="valor" onChange={(e) => campo(i, { valor: e.target.value })} />
            <button
              type="button"
              className="ms-ib"
              aria-label={`Remover ${c.nome || 'atributo'}`}
              onClick={() => setF({ ...f, campos: f.campos.filter((_, j) => j !== i) })}
            >
              <Ico n="fechar" size={12} />
            </button>
          </div>
        ))}
        <button type="button" className="ms-link" onClick={() => setF({ ...f, campos: [...f.campos, { nome: '', valor: '' }] })}>
          + atributo
        </button>
      </div>
      <label className="ms-sr" htmlFor="ms-ficha-notas">
        Notas da ficha
      </label>
      <textarea id="ms-ficha-notas" className="ms-txt" rows={3} placeholder="Notas da ficha" value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} />
      <div className="ms-row">
        <button type="button" className="ms-link" onClick={onAbrir}>
          Abrir no Universo
        </button>
        <button type="submit" className="btn sm pri" disabled={!sujo}>
          Salvar ficha
        </button>
      </div>
      {estado && (
        <span className="ms-hint" role="status">
          {estado}
        </span>
      )}
    </form>
  )
}

// ------------------------------------------------------------------ Ideias (R8)

const TIPOS: Array<{ id: IdeiaTipo | 'tudo'; nome: string }> = [
  { id: 'tudo', nome: 'Tudo' },
  { id: 'virada', nome: 'Viradas' },
  { id: 'conflito', nome: 'Conflito' },
  { id: 'dialogo', nome: 'Diálogo' },
  { id: 'pista', nome: 'Pistas' },
  { id: 'sensorial', nome: 'Sensorial' }
]
const NOME_TIPO: Record<IdeiaTipo, string> = { virada: 'Virada', conflito: 'Conflito', dialogo: 'Diálogo', pista: 'Pista', sensorial: 'Sensorial' }
const CARTAO_DE: Record<IdeiaTipo, CartaoTipo> = { virada: 'virada', conflito: 'ideia', dialogo: 'ideia', pista: 'ideia', sensorial: 'ideia' }

interface IaStatus {
  provedor: string
  nomeProvedor?: string
  modelo?: string
  externo: boolean
  configurado: boolean
}

interface IdeiaUI extends Ideia {
  uid: string
  noEnredo?: boolean
  anotada?: boolean
  variando?: boolean
  escrevendo?: boolean
  escrita?: boolean
}

function PainelIdeias(p: Props): ReactElement {
  const [ideias, setIdeias] = useState<IdeiaUI[]>([])
  const [filtro, setFiltro] = useState<IdeiaTipo | 'tudo'>('tudo')
  const [pedido, setPedido] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  /** o que ficou fora do contexto enviado à IA na última geração */
  const [avisosCtx, setAvisosCtx] = useState<string[]>([])

  const [ia, setIa] = useState<IaStatus | null>(null)
  useEffect(() => {
    let vivo = true
    call<IaStatus>('ia.status')
      .then((st) => vivo && setIa(st))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [])

  const comUid = (lista: Ideia[]): IdeiaUI[] => lista.map((i) => ({ ...i, uid: novoId('ideia') }))

  const gerar = async (): Promise<void> => {
    setCarregando(true)
    setErro(null)
    try {
      await p.antesDaIA()
      const r = await call<IdeiasResult>('ia.ideias', p.dir, p.file, pedido.trim() || undefined)
      setIdeias((v) => [...comUid(r.ideias ?? []), ...v])
      setAvisosCtx(r.avisos ?? [])
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }

  const variar = async (alvo: IdeiaUI): Promise<void> => {
    setIdeias((v) => v.map((i) => (i.uid === alvo.uid ? { ...i, variando: true } : i)))
    setErro(null)
    try {
      const r = await call<IdeiasResult>(
        'ia.ideias',
        p.dir,
        p.file,
        `Proponha UMA variação diferente desta ideia (tipo ${NOME_TIPO[alvo.tipo] ?? alvo.tipo}), mantendo o tipo: "${alvo.texto}"`
      )
      const nova = (r.ideias ?? []).find((i) => i.tipo === alvo.tipo) ?? r.ideias?.[0]
      setIdeias((v) => v.map((i) => (i.uid === alvo.uid ? (nova ? { ...nova, uid: novoId('ideia') } : { ...i, variando: false }) : i)))
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      setIdeias((v) => v.map((i) => (i.uid === alvo.uid ? { ...i, variando: false } : i)))
    }
  }

  const paraEnredo = async (alvo: IdeiaUI): Promise<void> => {
    setErro(null)
    try {
      const palavras = alvo.texto.split(/\s+/)
      const ligadas = p.fichas.filter((f) => alvo.ligadoA && alvo.ligadoA.toLowerCase().includes(f.nome.split(' ')[0]!.toLowerCase())).map((f) => f.id)
      // gravado pelo main (enredo.adicionarCartao), que saneia o quadro e põe o cartão no fim do roteiro do capítulo
      await call<Cartao>('enredo.adicionarCartao', p.dir, {
        tipo: CARTAO_DE[alvo.tipo] ?? 'ideia',
        titulo: palavras.slice(0, 7).join(' ') + (palavras.length > 7 ? '…' : ''),
        texto: alvo.texto,
        capitulo: p.file,
        fichas: ligadas,
        // ideia da IA: entra no Enredo como provisória
        origem: 'ia'
      })
      setIdeias((v) => v.map((i) => (i.uid === alvo.uid ? { ...i, noEnredo: true } : i)))
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  const anotar = (alvo: IdeiaUI): void => {
    const nota = `• ${alvo.texto}${alvo.ligadoA ? ` (${alvo.ligadoA})` : ''}`
    const notas = p.cena.notas?.trim() ? `${p.cena.notas.trimEnd()}\n${nota}` : nota
    p.onCena({ ...p.cena, notas })
    setIdeias((v) => v.map((i) => (i.uid === alvo.uid ? { ...i, anotada: true } : i)))
  }

  const escrever = async (alvo: IdeiaUI): Promise<void> => {
    setErro(null)
    setIdeias((v) => v.map((i) => (i.uid === alvo.uid ? { ...i, escrevendo: true } : i)))
    try {
      await p.onRedigir({ tipo: alvo.tipo, texto: alvo.texto, ligadoA: alvo.ligadoA })
      setIdeias((v) => v.map((i) => (i.uid === alvo.uid ? { ...i, escrevendo: false, escrita: true } : i)))
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      setIdeias((v) => v.map((i) => (i.uid === alvo.uid ? { ...i, escrevendo: false } : i)))
    }
  }

  const visiveis = ideias.filter((i) => filtro === 'tudo' || i.tipo === filtro)

  return (
    <>
      <div className="ms-sec ms-ideias-h">
        <div className="ms-ideias-tit">
          <span className="disp">Ideias · {p.rotulo.toLowerCase()}</span>
          {ideias.length > 0 && <span className="ms-hint">{ideias.length} no painel</span>}
        </div>
        <p className="ms-lido">
          <span>A IA lê:</span> este capítulo, o resumo dos anteriores, as fichas citadas e os cartões de enredo ligados a eles.
        </p>
        <div className="ms-filtros" role="group" aria-label="Filtrar por tipo">
          {TIPOS.map((t) => (
            <button key={t.id} type="button" className="ms-filtro" aria-pressed={filtro === t.id} onClick={() => setFiltro(t.id)}>
              {t.nome}
            </button>
          ))}
        </div>
      </div>

      <div className="ms-ideias">
        {erro && (
          <p className="err" role="alert">
            {erro}
          </p>
        )}
        {avisosCtx.length > 0 && (
          <p className="label" role="note">
            Contexto reduzido: {avisosCtx.join(' ')}
          </p>
        )}
        {ideias.length === 0 && !carregando && !erro && (
          <div className="ms-vazio">
            <p>Nenhuma ideia ainda. Peça sugestões de viradas, conflitos, diálogos, pistas e detalhes sensoriais para este capítulo.</p>
            <button type="button" className="btn sm pri" onClick={() => void gerar()}>
              <Ico n="brilho" size={14} /> Gerar ideias
            </button>
          </div>
        )}
        {carregando && <p className="ms-hint" role="status">Pensando em ideias…</p>}
        {visiveis.map((i) => (
          <article key={i.uid} className={`ms-ideia t-${i.tipo}`}>
            <div className="ms-ideia-h">
              <span className="ms-tag">{NOME_TIPO[i.tipo] ?? i.tipo}</span>
              {i.ligadoA && <span className="ms-hint">{i.ligadoA}</span>}
            </div>
            <p className={i.variando ? 'ms-variando' : ''}>{i.texto}</p>
            <div className="ms-ideia-a">
              <button
                type="button"
                className="ms-chip sm"
                disabled={p.redigindo || i.escrevendo}
                onClick={() => void escrever(i)}
                title="A IA escreve 1 a 3 parágrafos com esta ideia no ponto do cursor (ou no fim do capítulo), na sua voz. Fica marcado como rascunho até você aceitar, refazer ou descartar."
              >
                {i.escrevendo ? 'Escrevendo…' : i.escrita ? 'Escrever de novo' : 'Escrever no texto'}
              </button>
              <button
                type="button"
                className="ms-chip sm"
                disabled={i.noEnredo}
                onClick={() => void paraEnredo(i)}
                title="Cria um cartão com esta ideia no quadro do Enredo, ligado a este capítulo. O texto não muda."
              >
                {i.noEnredo ? 'No Enredo' : '→ Cartão no Enredo'}
              </button>
              <button
                type="button"
                className="ms-chip sm"
                disabled={i.anotada}
                onClick={() => anotar(i)}
                title="Guarda a ideia nas notas da cena (aba Cena). O texto não muda."
              >
                {i.anotada ? 'Anotada' : 'Anotar'}
              </button>
              <button type="button" className="ms-chip sm" disabled={i.variando} onClick={() => void variar(i)} aria-label={`Gerar variação: ${i.texto}`}>
                {i.variando ? 'Variando…' : '↻ Variar'}
              </button>
            </div>
          </article>
        ))}
      </div>

      <form
        className="ms-pedir"
        onSubmit={(e) => {
          e.preventDefault()
          void gerar()
        }}
      >
        <label className="ms-pedir-c">
          <span className="ms-sr">Pedir ideias sobre</span>
          <input
            type="text"
            value={pedido}
            onChange={(e) => setPedido(e.target.value)}
            placeholder="Pedir ideias sobre… (ex.: um final mais cruel)"
          />
          <button type="submit" className="btn sm pri" disabled={carregando}>
            Gerar
          </button>
        </label>
        {ia && (
          <span className="ms-ia-status">
            <i className={`dot ${!ia.configurado ? 'bad' : ia.externo ? 'busy' : ''}`} />
            {!ia.configurado
              ? 'IA desligada ou sem chave (Ajustes)'
              : `${ia.nomeProvedor ?? ia.provedor}${ia.modelo ? ` · ${ia.modelo}` : ''} · ${ia.externo ? 'o texto sai do computador' : 'nada sai do computador'}`}
          </span>
        )}
      </form>
    </>
  )
}
