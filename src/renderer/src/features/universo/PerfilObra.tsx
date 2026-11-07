import { useEffect, useRef, useState, type ReactElement } from 'react'
import { call } from '../../api'
import { PERFIL_PADRAO, type PerfilObra as Perfil } from '../../../../shared/models'
import { Mini } from './icons'

/**
 * Perfil da obra: como a IA e as checagens locais devem ler ESTE livro.
 * Mora no Universo porque descreve as regras do mundo e da narração, não do app
 * (Ajustes é do app inteiro, vale para todos os livros).
 */

const OPCOES: Array<{ k: 'narradorNaoConfiavel' | 'ambiguidadeDeliberada' | 'naoLinear'; nome: string; efeito: string }> = [
  {
    k: 'narradorNaoConfiavel',
    nome: 'Narrador ou personagens não confiáveis',
    efeito: 'Falas e narração podem mentir de propósito. A IA só aponta contradição com fato das fichas; a checagem local não confere atributos dentro de falas.'
  },
  {
    k: 'ambiguidadeDeliberada',
    nome: 'Ambiguidade deliberada',
    efeito: 'Lacunas e duplo sentido são intencionais: a IA não tenta resolvê-los nem os aponta como erro.'
  },
  {
    k: 'naoLinear',
    nome: 'Linha do tempo não linear',
    efeito: 'A ordem dos capítulos não é a dos acontecimentos. A checagem “morto que fala depois” fica desligada.'
  }
]

export function PerfilObra({ dir, onFechar }: { dir: string; onFechar: () => void }): ReactElement {
  const ref = useRef<HTMLDialogElement>(null)
  const [p, setP] = useState<Perfil | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    ref.current?.showModal()
    call<Perfil>('livro.perfil', dir)
      .then(setP)
      .catch((e: unknown) => {
        setP({ ...PERFIL_PADRAO })
        setErro(e instanceof Error ? e.message : String(e))
      })
  }, [dir])

  const salvar = async (): Promise<void> => {
    if (!p) return
    setOcupado(true)
    setErro('')
    try {
      await call<Perfil>('livro.salvarPerfil', dir, p)
      ref.current?.close()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      setOcupado(false)
    }
  }

  return (
    <dialog ref={ref} className="uv-dialog panel uv-perfil" aria-labelledby="uv-perfil-t" onClose={onFechar}>
      <header className="uv-dhead">
        <h2 id="uv-perfil-t" className="disp">
          Perfil da obra
        </h2>
        <button type="button" className="uv-ico" aria-label="Fechar" onClick={() => ref.current?.close()}>
          <Mini name="fechar" />
        </button>
      </header>
      <p className="label">Vale para toda IA do livro (ideias, beta, continuidade, redigir, revisão, insights) e para as checagens locais.</p>
      {erro && <p className="err">{erro}</p>}
      {!p && <p className="label">Carregando…</p>}
      {p && (
        <>
          <div className="uv-perfil-ops">
            {OPCOES.map((o) => (
              <label key={o.k} className={`uv-perfil-op${p[o.k] ? ' on' : ''}`}>
                <input type="checkbox" checked={p[o.k]} onChange={(e) => setP({ ...p, [o.k]: e.target.checked })} />
                <span>
                  <b>{o.nome}</b>
                  <span className="label">{o.efeito}</span>
                </span>
              </label>
            ))}
          </div>
          <label className="field">
            Notas para a IA
            <textarea
              className="uv-notas"
              value={p.notasIa}
              maxLength={2000}
              placeholder="Tom, regras do universo, o que nunca fazer. Ex.: a magia sempre cobra um preço físico; ninguém usa celular; tom seco, sem melodrama."
              onChange={(e) => setP({ ...p, notasIa: e.target.value })}
            />
          </label>
        </>
      )}
      <footer className="uv-row uv-end">
        <button type="button" className="btn sm" onClick={() => ref.current?.close()}>
          Cancelar
        </button>
        <button type="button" className="btn sm pri" disabled={!p || ocupado} onClick={() => void salvar()}>
          {ocupado ? 'Salvando…' : 'Salvar perfil'}
        </button>
      </footer>
    </dialog>
  )
}
