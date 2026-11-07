import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { call } from '../../api'
import { EditorGlifo } from './EditorGlifo'
import { GlifoSvg, TextoEmGlifos } from './GlifoView'
import { Ico } from './icones'
import { grafemas, type FonteGerada, type Glifo, type Lingua } from './model'

interface Props {
  l: Lingua
  dir: string
  mudar: (fn: (l: Lingua) => Lingua) => void
  /** texto romanizado vindo do tradutor */
  previaPadrao: string
  salvar: () => Promise<void>
}

const VAZIO: Glifo = { tracos: [], espessura: 1.6 }

/** Registra a fonte gerada no documento para a prévia; devolve o nome da família. */
async function carregarFonte(id: string, dataUrl: string, anterior: FontFace | null): Promise<FontFace> {
  const face = new FontFace(`folio-idioma-${id}-${Date.now().toString(36)}`, `url(${dataUrl})`)
  await face.load()
  if (anterior) document.fonts.delete(anterior)
  document.fonts.add(face)
  return face
}

export function Alfabeto({ l, dir, mudar, previaPadrao, salvar }: Props): ReactElement {
  const chaves = Object.keys(l.glifos)
  const [sel, setSel] = useState<string | null>(chaves[0] ?? null)
  const [nova, setNova] = useState('')
  const [previa, setPrevia] = useState(previaPadrao)
  const [rodada, setRodada] = useState(0)
  const [fonte, setFonte] = useState<{ arquivo: string; dataUrl: string; info?: FonteGerada } | null>(null)
  const [face, setFace] = useState<FontFace | null>(null)
  const [geradaCom, setGeradaCom] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const faceRef = useRef<FontFace | null>(null)
  faceRef.current = face

  useEffect(() => setPrevia(previaPadrao), [previaPadrao])

  // fonte já gerada antes, se houver
  useEffect(() => {
    let vivo = true
    setFonte(null)
    setGeradaCom(null)
    call<string | null>('idioma.fonte', dir, l.id)
      .then(async (dataUrl) => {
        if (!vivo || !dataUrl) return
        setFonte({ arquivo: `fonte-${l.id}.otf`, dataUrl })
        const f = await carregarFonte(l.id, dataUrl, faceRef.current)
        if (vivo) setFace(f)
      })
      .catch(() => {
        /* sem fonte gerada ou arquivo ilegível: a prévia em SVG continua */
      })
    return () => {
      vivo = false
    }
  }, [dir, l.id])

  useEffect(
    () => () => {
      if (faceRef.current) document.fonts.delete(faceRef.current)
    },
    []
  )

  useEffect(() => {
    if (sel && !l.glifos[sel]) setSel(Object.keys(l.glifos)[0] ?? null)
  }, [l.glifos, sel])

  const faltam = useMemo(() => grafemas(l).filter((g) => !l.glifos[g]), [l])
  const assinatura = JSON.stringify(l.glifos)

  const criar = (chave: string): void => {
    const k = chave.trim().toLowerCase()
    if (!k || [...k].length > 4 || /\s/.test(k)) return
    if (!l.glifos[k]) {
      const esp = l.glifos[sel ?? '']?.espessura ?? VAZIO.espessura
      mudar((x) => ({ ...x, glifos: { ...x.glifos, [k]: { tracos: [], espessura: esp } } }))
    }
    setSel(k)
    setNova('')
  }

  const gerar = async (): Promise<void> => {
    setBusy(true)
    setErro(null)
    try {
      await salvar()
      const r = await call<FonteGerada>('idioma.gerarFonte', dir, l.id)
      setFonte({ arquivo: r.arquivo, dataUrl: r.dataUrl, info: r })
      setGeradaCom(assinatura)
      setFace(await carregarFonte(l.id, r.dataUrl, face))
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const glifoSel = sel ? l.glifos[sel] : undefined
  const comTraco = chaves.filter((k) => l.glifos[k]?.tracos.length).length

  return (
    <section className="idi-sec" aria-label="Alfabeto">
      <div className="idi-linha">
        <h2 className="disp idi-h">Alfabeto</h2>
        <span className="pill">
          {comTraco} glifo{comTraco === 1 ? '' : 's'}
          {fonte ? (
            <>
              {' '}
              · fonte <b>{fonte.arquivo}</b>
            </>
          ) : (
            ' · sem fonte'
          )}
        </span>
        <div className="idi-push idi-acoes">
          <button type="button" className="btn sm pri" onClick={() => void gerar()} disabled={busy || !comTraco} aria-busy={busy}>
            <Ico n="fonte" />
            {busy ? 'Gerando…' : fonte ? 'Gerar de novo' : 'Gerar fonte .otf'}
          </button>
          {fonte && (
            <a className="btn sm" href={fonte.dataUrl} download={fonte.arquivo}>
              <Ico n="baixar" />
              Baixar
            </a>
          )}
        </div>
      </div>
      {erro && (
        <p className="err" role="alert">
          {erro}
        </p>
      )}
      {fonte?.info && (
        <p className="idi-dica" role="status">
          {fonte.info.glifos} glifos na fonte ({Math.round(fonte.info.bytes / 1024)} KB), gravada nos arquivos do livro para a Diagramação.
          {fonte.info.ligaduras.length > 0 && ` Dígrafos viram ligadura ao digitar: ${fonte.info.ligaduras.join(', ')}.`}
        </p>
      )}
      {geradaCom && geradaCom !== assinatura && <p className="idi-dica">Os glifos mudaram desde a última geração.</p>}

      <div className="idi-alfa">
        <div className="idi-alfa-grade">
          <ul className="idi-glifos" aria-label="Glifos">
            {chaves.map((k) => (
              <li key={k}>
                <button type="button" className="idi-glifo" aria-pressed={sel === k} aria-label={`Glifo ${k}`} onClick={() => setSel(k)}>
                  <GlifoSvg glifo={l.glifos[k]} size={40} />
                  <span>{k}</span>
                </button>
              </li>
            ))}
            <li>
              <form
                className="idi-glifo novo"
                onSubmit={(e) => {
                  e.preventDefault()
                  criar(nova)
                }}
              >
                <input className="input" value={nova} maxLength={4} aria-label="Letra ou dígrafo do novo glifo" placeholder="th" onChange={(e) => setNova(e.target.value)} />
                <button type="submit" className="btn sm" disabled={!nova.trim()}>
                  <Ico n="mais" />
                  Glifo
                </button>
              </form>
            </li>
          </ul>
          {faltam.length > 0 && (
            <div className="idi-bloco">
              <span className="idi-eb">Sons sem glifo</span>
              <ul className="idi-chips">
                {faltam.map((g) => (
                  <li key={g}>
                    <button type="button" className="idi-chip botao" onClick={() => criar(g)} aria-label={`Criar glifo para ${g}`}>
                      + {g}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {sel && glifoSel ? (
          <div className="panel idi-alfa-editor">
            <div className="idi-linha">
              <span className="idi-eb">Editando “{sel}”</span>
              <button
                type="button"
                className="idi-x idi-push"
                aria-label={`Excluir glifo ${sel}`}
                onClick={() => {
                  const k = sel
                  mudar((x) => {
                    const { [k]: _fora, ...resto } = x.glifos
                    return { ...x, glifos: resto }
                  })
                }}
              >
                <Ico n="lixo" size={15} />
              </button>
            </div>
            <EditorGlifo key={sel} chave={sel} glifo={glifoSel} onChange={(g) => mudar((x) => ({ ...x, glifos: { ...x.glifos, [sel]: g } }))} />
          </div>
        ) : (
          <div className="panel idi-alfa-editor empty">
            <span className="disp">Sem glifos</span>
            Crie um glifo para cada letra ou dígrafo da romanização.
          </div>
        )}
      </div>

      <div className="panel idi-trad">
        <div className="idi-linha">
          <span className="idi-eb">Prévia</span>
          <button type="button" className="btn sm idi-push" onClick={() => setRodada((r) => r + 1)}>
            Desenhar de novo
          </button>
        </div>
        <label className="field">
          Texto romanizado
          <input className="input idi-termo" value={previa} onChange={(e) => setPrevia(e.target.value)} />
        </label>
        <div className="idi-glifos-linha" key={`${previa}-${rodada}`}>
          <TextoEmGlifos texto={previa} glifos={l.glifos} altura={40} />
        </div>
        {face && (
          <div className="idi-amostra">
            <span className="idi-eb">Com a fonte gerada</span>
            <p style={{ fontFamily: `"${face.family}"` }} lang="und">
              {previa}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
