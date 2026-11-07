import { useMemo, useRef, useState, type ReactElement } from 'react'
import { importarCsv, paraCsv } from './csv'
import { checarPalavra } from './fonologia'
import { Ico } from './icones'
import { CLASSES, novoIdEntrada, type Classe, type Entrada, type Lingua } from './model'
import { normalizar } from './tradutor'

const LIMITE = 300

function baixar(nome: string, conteudo: string, tipo: string): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }))
  const a = Object.assign(document.createElement('a'), { href: url, download: nome })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function Lexico({ l, mudar }: { l: Lingua; mudar: (fn: (l: Lingua) => Lingua) => void }): ReactElement {
  const [busca, setBusca] = useState('')
  const [classe, setClasse] = useState<Classe | ''>('')
  const [aviso, setAviso] = useState<string | null>(null)
  const arquivo = useRef<HTMLInputElement>(null)

  const filtradas = useMemo(() => {
    const q = normalizar(busca)
    return l.lexico.filter(
      (e) => (!classe || e.classe === classe) && (!q || normalizar(e.pt).includes(q) || normalizar(e.termo).includes(q) || normalizar(e.nota).includes(q))
    )
  }, [l.lexico, busca, classe])

  const setEntrada = (id: string, patch: Partial<Entrada>): void =>
    mudar((x) => ({ ...x, lexico: x.lexico.map((e) => (e.id === id ? { ...e, ...patch } : e)) }))

  const importar = async (f: File): Promise<void> => {
    const { entradas, ignoradas } = importarCsv(await f.text())
    const chave = (e: Entrada): string => `${normalizar(e.pt)}|${normalizar(e.termo)}`
    const existentes = new Set(l.lexico.map(chave))
    const novas = entradas.filter((e) => !existentes.has(chave(e)))
    mudar((x) => ({ ...x, lexico: [...x.lexico, ...novas] }))
    setAviso(
      `${novas.length} entrada${novas.length === 1 ? '' : 's'} importada${novas.length === 1 ? '' : 's'}` +
        (entradas.length - novas.length ? `, ${entradas.length - novas.length} repetida(s)` : '') +
        (ignoradas ? `, ${ignoradas} linha(s) sem português ou termo` : '') +
        '.'
    )
  }

  const nomeArquivo = `lexico-${normalizar(l.nome).replace(/[^a-z0-9]+/g, '-') || 'idioma'}.csv`

  return (
    <section className="idi-sec" aria-label="Léxico">
      <div className="idi-barra">
        <input className="input idi-busca" type="search" placeholder="Buscar em português, na língua ou nas notas" aria-label="Buscar no léxico" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="select" aria-label="Filtrar por classe" value={classe} onChange={(e) => setClasse(e.target.value as Classe | '')}>
          <option value="">Todas as classes</option>
          {CLASSES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn sm pri"
          onClick={() => {
            setBusca('')
            mudar((x) => ({ ...x, lexico: [{ id: novoIdEntrada(), pt: '', termo: '', classe: classe || 'substantivo', nota: '' }, ...x.lexico] }))
          }}
        >
          <Ico n="mais" />
          Entrada
        </button>
        <button type="button" className="btn sm" onClick={() => arquivo.current?.click()}>
          <Ico n="importar" />
          Importar CSV
        </button>
        <input
          ref={arquivo}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void importar(f).catch((err: unknown) => setAviso(err instanceof Error ? err.message : String(err)))
          }}
        />
        <button type="button" className="btn sm" disabled={!l.lexico.length} onClick={() => baixar(nomeArquivo, '﻿' + paraCsv(l.lexico), 'text/csv;charset=utf-8')}>
          <Ico n="baixar" />
          Exportar CSV
        </button>
      </div>
      {aviso && (
        <p className="idi-dica" role="status">
          {aviso}
        </p>
      )}
      <p className="idi-dica">
        {filtradas.length === l.lexico.length ? `${l.lexico.length} palavras` : `${filtradas.length} de ${l.lexico.length} palavras`}
        {filtradas.length > LIMITE ? ` · mostrando as ${LIMITE} primeiras; refine a busca` : ''}. CSV com colunas pt, termo, classe, nota.
      </p>
      {l.lexico.length === 0 ? (
        <div className="empty">
          <span className="disp">Léxico vazio</span>
          Adicione palavras pelo gerador, pelo tradutor ou importando um CSV.
        </div>
      ) : (
        <div className="idi-tabela-wrap">
          <table className="idi-tabela">
            <thead>
              <tr>
                <th scope="col">Português</th>
                <th scope="col">{l.nome}</th>
                <th scope="col">Classe</th>
                <th scope="col">Nota</th>
                <th scope="col">
                  <span className="idi-sr">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, LIMITE).map((e) => {
                const problema = e.termo ? checarPalavra(l, e.termo) : null
                return (
                  <tr key={e.id}>
                    <td>
                      <input className="idi-cel" aria-label="Português" value={e.pt} onChange={(ev) => setEntrada(e.id, { pt: ev.target.value })} />
                    </td>
                    <td>
                      <div className="idi-cel-termo">
                        <input
                          className="idi-cel idi-termo"
                          aria-label={`Termo em ${l.nome}`}
                          aria-invalid={!!problema}
                          title={problema ?? undefined}
                          value={e.termo}
                          onChange={(ev) => setEntrada(e.id, { termo: ev.target.value })}
                        />
                        {problema && (
                          <span className="idi-alerta" role="img" aria-label={`Aviso: ${problema}`} title={problema}>
                            !
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <select className="idi-cel" aria-label="Classe" value={e.classe} onChange={(ev) => setEntrada(e.id, { classe: ev.target.value as Classe })}>
                        {CLASSES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input className="idi-cel" aria-label="Nota" value={e.nota} onChange={(ev) => setEntrada(e.id, { nota: ev.target.value })} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="idi-x"
                        aria-label={`Excluir ${e.pt || e.termo || 'entrada'}`}
                        onClick={() => mudar((x) => ({ ...x, lexico: x.lexico.filter((y) => y.id !== e.id) }))}
                      >
                        <Ico n="lixo" size={15} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
