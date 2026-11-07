import { useEffect, useId, useState, type ReactElement } from 'react'
import { folio } from '../../api'
import type { Cartao, EnredoBoard, Ficha } from '../../../../shared/models'
import { novoId } from './geom'
import { IconeM } from './icones'
import type { Ligacao } from './types'

/** Cria uma ficha de lugar mínima na coleção "universo". */
export async function criarFichaLugar(dir: string, nome: string): Promise<Ficha> {
  const agora = new Date().toISOString()
  const ficha: Ficha = {
    id: novoId(),
    tipo: 'lugar',
    nome,
    apelidos: [],
    papel: '',
    grupo: '',
    campos: [],
    relacoes: [],
    notas: 'Criada a partir do mapa.',
    retrato: '',
    criadoEm: agora,
    atualizadoEm: agora
  }
  return folio.docs.put<Ficha>(dir, 'universo', ficha.id, ficha)
}

async function carregarLugares(dir: string): Promise<Ficha[]> {
  const todas = await folio.docs.list<Ficha>(dir, 'universo')
  return todas.filter((f) => f.tipo === 'lugar').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

async function carregarCartoes(dir: string): Promise<Cartao[]> {
  const board = await folio.docs.get<EnredoBoard>(dir, 'enredo', 'board')
  return (board?.cartoes ?? []).slice().sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'))
}

const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()

// ---------------------------------------------------------------------------
// diálogo "Ligar a…"
// ---------------------------------------------------------------------------

export function DialogoLigar({
  dir,
  nomeItem,
  atual,
  onLigar,
  onRemover,
  onFechar
}: {
  dir: string
  nomeItem: string
  atual: Ligacao | undefined
  onLigar: (alvo: { fichaId?: string; cartaoId?: string; nomeFicha?: string }) => void
  onRemover: () => void
  onFechar: () => void
}): ReactElement {
  const uid = useId()
  const [aba, setAba] = useState<'ficha' | 'cartao'>(atual?.cartaoId ? 'cartao' : 'ficha')
  const [lugares, setLugares] = useState<Ficha[] | null>(null)
  const [cartoes, setCartoes] = useState<Cartao[] | null>(null)
  const [fichaSel, setFichaSel] = useState(atual?.fichaId ?? '')
  const [cartaoSel, setCartaoSel] = useState(atual?.cartaoId ?? '')
  const [novoNome, setNovoNome] = useState(nomeItem)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let vivo = true
    carregarLugares(dir)
      .then((l) => {
        if (!vivo) return
        setLugares(l)
        if (!atual?.fichaId) {
          const igual = l.find((f) => norm(f.nome) === norm(nomeItem) || f.apelidos.some((a) => norm(a) === norm(nomeItem)))
          if (igual) setFichaSel(igual.id)
        }
      })
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : String(e)))
    carregarCartoes(dir)
      .then((c) => vivo && setCartoes(c))
      .catch(() => vivo && setCartoes([]))
    return () => {
      vivo = false
    }
  }, [dir, nomeItem, atual?.fichaId])

  useEffect(() => {
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onFechar])

  const existe = (lugares ?? []).some((f) => norm(f.nome) === norm(novoNome))

  const criar = async (): Promise<void> => {
    const nome = novoNome.trim()
    if (!nome) return
    setOcupado(true)
    setErro('')
    try {
      const f = await criarFichaLugar(dir, nome)
      onLigar({ fichaId: f.id, nomeFicha: f.nome })
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      setOcupado(false)
    }
  }

  return (
    <div className="mp-dialogo panel" role="dialog" aria-modal="false" aria-labelledby={`${uid}-t`}>
      <header>
        <span id={`${uid}-t`} className="disp mp-dialogo-titulo">
          Ligar “{nomeItem}”
        </span>
        <button type="button" className="mp-x" aria-label="Fechar" onClick={onFechar}>
          <IconeM nome="fechar" size={18} />
        </button>
      </header>
      <div className="mp-seg" role="tablist" aria-label="Tipo de ligação">
        <button type="button" role="tab" aria-selected={aba === 'ficha'} onClick={() => setAba('ficha')}>
          Ficha de lugar
        </button>
        <button type="button" role="tab" aria-selected={aba === 'cartao'} onClick={() => setAba('cartao')}>
          Cartão do enredo
        </button>
      </div>

      {aba === 'ficha' ? (
        <div className="mp-dialogo-corpo">
          <label className="field">
            Fichas de lugar do universo
            <select className="select" value={fichaSel} onChange={(e) => setFichaSel(e.target.value)} disabled={!lugares}>
              <option value="">{lugares ? (lugares.length ? 'Escolha um lugar…' : 'Nenhuma ficha de lugar ainda') : 'Carregando…'}</option>
              {(lugares ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                  {f.papel ? ` · ${f.papel}` : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn pri sm"
            disabled={!fichaSel || ocupado}
            onClick={() => onLigar({ fichaId: fichaSel, nomeFicha: lugares?.find((f) => f.id === fichaSel)?.nome })}
          >
            Ligar a esta ficha
          </button>
          <div className="mp-divisor" role="separator" />
          <label className="field">
            Ou criar uma ficha nova
            <input className="input" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} maxLength={120} />
          </label>
          <button type="button" className="btn sm" disabled={!novoNome.trim() || existe || ocupado} onClick={() => void criar()}>
            {existe ? 'Já existe uma ficha com esse nome' : 'Criar ficha e ligar'}
          </button>
        </div>
      ) : (
        <div className="mp-dialogo-corpo">
          <label className="field">
            Cartões do quadro de enredo
            <select className="select" value={cartaoSel} onChange={(e) => setCartaoSel(e.target.value)} disabled={!cartoes}>
              <option value="">{cartoes ? (cartoes.length ? 'Escolha um cartão…' : 'O quadro de enredo está vazio') : 'Carregando…'}</option>
              {(cartoes ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.titulo || 'Sem título'} · {c.tipo}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn pri sm" disabled={!cartaoSel} onClick={() => onLigar({ cartaoId: cartaoSel })}>
            Ligar a este cartão
          </button>
        </div>
      )}

      {erro && <p className="err">{erro}</p>}
      {atual && (
        <button type="button" className="btn sm" onClick={onRemover}>
          Remover ligação atual
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// popup do símbolo ligado
// ---------------------------------------------------------------------------

type Alvo = { tipo: 'ficha'; ficha: Ficha; retrato: string | null } | { tipo: 'cartao'; cartao: Cartao } | { tipo: 'sumiu' }

export function PopupLigacao({
  dir,
  ligacao,
  x,
  y,
  onAbrirFicha,
  onAbrirCartao,
  onFechar
}: {
  dir: string
  ligacao: Ligacao
  x: number
  y: number
  onAbrirFicha: (id: string) => void
  onAbrirCartao: (id: string) => void
  onFechar: () => void
}): ReactElement {
  const [alvo, setAlvo] = useState<Alvo | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    setAlvo(null)
    const carregar = async (): Promise<Alvo> => {
      if (ligacao.fichaId) {
        const f = await folio.docs.get<Ficha>(dir, 'universo', ligacao.fichaId)
        if (!f) return { tipo: 'sumiu' }
        const retrato = f.retrato ? await folio.assets.get(dir, f.retrato).catch(() => null) : null
        return { tipo: 'ficha', ficha: f, retrato }
      }
      if (ligacao.cartaoId) {
        const c = (await carregarCartoes(dir)).find((k) => k.id === ligacao.cartaoId)
        return c ? { tipo: 'cartao', cartao: c } : { tipo: 'sumiu' }
      }
      return { tipo: 'sumiu' }
    }
    carregar()
      .then((a) => vivo && setAlvo(a))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : String(e)))
    return () => {
      vivo = false
    }
  }, [dir, ligacao.fichaId, ligacao.cartaoId])

  return (
    <div className="mp-pop panel" role="dialog" aria-label="Ligação do símbolo" style={{ left: x, top: y }}>
      <button type="button" className="mp-x mp-pop-x" aria-label="Fechar" onClick={onFechar}>
        <IconeM nome="fechar" size={16} />
      </button>
      {erro && <p className="err">{erro}</p>}
      {!alvo && !erro && <span className="label">Carregando…</span>}
      {alvo?.tipo === 'sumiu' && <span className="label">A ficha ou cartão ligado não existe mais.</span>}
      {alvo?.tipo === 'ficha' && (
        <div className="mp-pop-linha">
          <span className="mp-pop-retrato">
            {alvo.retrato ? (
              <img src={alvo.retrato} alt={`Retrato de ${alvo.ficha.nome}`} />
            ) : (
              <svg width="34" height="32" viewBox="0 0 24 22" aria-hidden="true">
                <path d="M3 21V9h3v3h3V5h2V2l3 3v7h3V9h3v12z" fill="currentColor" />
              </svg>
            )}
          </span>
          <div className="mp-pop-texto">
            <span className="mp-pop-eb">Lugar{alvo.ficha.papel ? ` · ${alvo.ficha.papel}` : ''}</span>
            <span className="disp mp-pop-nome">{alvo.ficha.nome}</span>
            {alvo.ficha.grupo && <span className="label">{alvo.ficha.grupo}</span>}
            <button type="button" className="btn sm" onClick={() => onAbrirFicha(alvo.ficha.id)}>
              Abrir ficha <IconeM nome="abrir" size={14} />
            </button>
          </div>
        </div>
      )}
      {alvo?.tipo === 'cartao' && (
        <div className="mp-pop-texto">
          <span className="mp-pop-eb">Cartão de enredo · {alvo.cartao.tipo}</span>
          <span className="disp mp-pop-nome">{alvo.cartao.titulo || 'Sem título'}</span>
          {alvo.cartao.texto && <span className="label mp-pop-resumo">{alvo.cartao.texto}</span>}
          <button type="button" className="btn sm" onClick={() => onAbrirCartao(alvo.cartao.id)}>
            Abrir no enredo <IconeM nome="abrir" size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
