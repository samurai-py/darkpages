import { useEffect, useState, type ReactElement } from 'react'
import { call } from '../../api'

interface AparicaoCapitulo {
  file: string
  title: string
  mencoes: number
}

interface Aparicoes {
  capitulos: AparicaoCapitulo[]
  total: number
  presentes: number
}

/**
 * Faixa de quadradinhos, um por capítulo, com a intensidade das menções.
 * Só consulta depois que a ficha está salva (o main lê nome/apelidos do disco).
 */
export function AparicoesFaixa({
  dir,
  fichaId,
  termos,
  pendente,
  onAbrir
}: {
  dir: string
  fichaId: string
  /** nome + apelidos, só para saber quando recontar */
  termos: string
  pendente: boolean
  onAbrir: (chapterFile: string) => void
}): ReactElement {
  const [dados, setDados] = useState<Aparicoes | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (pendente) return
    let vivo = true
    setCarregando(true)
    call<Aparicoes>('universo.aparicoes', dir, fichaId)
      .then((d) => {
        if (!vivo) return
        setDados(d)
        setErro('')
      })
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => vivo && setCarregando(false))
    return () => {
      vivo = false
    }
  }, [dir, fichaId, termos, pendente])

  const max = dados ? Math.max(1, ...dados.capitulos.map((c) => c.mencoes)) : 1
  const n = dados?.capitulos.length ?? 0

  return (
    <section className="uv-sec" aria-busy={carregando}>
      <h3 className="uv-eb">
        Aparições
        {dados && (
          <>
            {' · '}
            {dados.presentes} de {n} {n === 1 ? 'capítulo' : 'capítulos'} · {dados.total}{' '}
            {dados.total === 1 ? 'menção' : 'menções'}
          </>
        )}
      </h3>
      {erro && <p className="err">{erro}</p>}
      {!erro && dados && n === 0 && <p className="label">O livro ainda não tem capítulos.</p>}
      {dados && n > 0 && (
        <div className="uv-strip" style={{ gridTemplateColumns: `repeat(${Math.min(n, 24)}, minmax(0, 1fr))` }}>
          {dados.capitulos.map((c, i) => {
            const nivel = c.mencoes === 0 ? 0 : 0.35 + 0.65 * (c.mencoes / max)
            return (
              <button
                key={c.file}
                type="button"
                className={`uv-sq${c.mencoes ? ' on' : ''}`}
                style={c.mencoes ? { opacity: nivel } : undefined}
                title={`${i + 1}. ${c.title}: ${c.mencoes} ${c.mencoes === 1 ? 'menção' : 'menções'}`}
                aria-label={`Capítulo ${i + 1}, ${c.title}: ${c.mencoes} ${c.mencoes === 1 ? 'menção' : 'menções'}. Abrir no manuscrito`}
                onClick={() => onAbrir(c.file)}
              />
            )
          })}
        </div>
      )}
      {carregando && !dados && <p className="label">Contando menções…</p>}
    </section>
  )
}
