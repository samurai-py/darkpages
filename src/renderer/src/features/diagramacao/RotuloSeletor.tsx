import { useId, type ReactElement } from 'react'
import {
  ESTILOS_ROTULO,
  generoSugerido,
  rotuloCapitulo,
  type CaixaRotulo,
  type EstiloRotulo,
  type Genero,
  type RotuloCfg
} from '../../../../shared/rotulo'
import './rotulo-seletor.css'

interface Props {
  value: RotuloCfg
  onChange: (cfg: RotuloCfg) => void
  /** lista de estilos (padrão: a dos capítulos; as partes usam ESTILOS_ROTULO_PARTE) */
  estilos?: { v: EstiloRotulo; label: string }[]
  /** "capítulo" ou "parte": usado no exemplo e no placeholder */
  item?: 'capitulo' | 'parte'
}

const SEM_PALAVRA: EstiloRotulo[] = ['romano', 'numero', 'nenhum']

/** Seletor do nome dos capítulos (Diagramação e Manuscrito usam o mesmo). */
export function RotuloSeletor({ value: v, onChange, estilos = ESTILOS_ROTULO, item = 'capitulo' }: Props): ReactElement {
  const id = useId()
  const set = (patch: Partial<RotuloCfg>): void => onChange({ ...v, ...patch })
  const usaPalavra = !SEM_PALAVRA.includes(v.estilo)
  const nomeItem = item === 'parte' ? 'da parte' : 'do capítulo'
  const exemplos = v.estilo === 'nenhum' ? `só o título ${nomeItem}` : [1, 2, 3].map((n) => rotuloCapitulo(n, v)).join(', ')

  return (
    <div className="rt-sel">
      <label className="field">
        Estilo
        <select className="select" value={v.estilo} onChange={(e) => {
            const estilo = e.target.value as EstiloRotulo
            set(item === 'parte' ? { estilo, genero: generoSugerido(estilo, v.palavra, v.genero) } : { estilo })
          }}>
          {estilos.map((e) => (
            <option key={e.v} value={e.v}>{e.label}</option>
          ))}
        </select>
      </label>
      {v.estilo === 'modelo' && (
        <label className="field">
          Modelo
          <input
            className="input"
            value={v.modelo}
            spellCheck={false}
            aria-describedby={`${id}-ph`}
            onChange={(e) => set({ modelo: e.target.value })}
          />
          <span id={`${id}-ph`} className="rt-dica">
            Use {'{n}'} {'{extenso}'} {'{ordinal}'} {'{romano}'} {'{palavra}'}
          </span>
        </label>
      )}
      {v.estilo !== 'nenhum' && (
        <div className="rt-grid">
          <label className="field">
            Palavra
            <input
              className="input"
              value={v.palavra}
              placeholder={item === 'parte' ? 'Parte' : 'Capítulo'}
              disabled={!usaPalavra}
              onChange={(e) => set({ palavra: e.target.value })}
            />
          </label>
          <label className="field">
            Gênero
            <select className="select" value={v.genero} onChange={(e) => set({ genero: e.target.value as Genero })}>
              <option value="m">Masculino (um, primeiro)</option>
              <option value="f">Feminino (uma, primeira)</option>
            </select>
          </label>
          <label className="field">
            Caixa no livro
            <select className="select" value={v.caixa} onChange={(e) => set({ caixa: e.target.value as CaixaRotulo })}>
              <option value="normal">Normal</option>
              <option value="maiusculas">MAIÚSCULAS</option>
              <option value="versalete">Versalete</option>
            </select>
          </label>
        </div>
      )}
      <p className={`rt-prev${v.caixa === 'versalete' ? ' versalete' : ''}`} aria-live="polite">
        Ex.: {exemplos}
      </p>
    </div>
  )
}
