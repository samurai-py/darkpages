import { useEffect, type ReactElement } from 'react'
import { folio, isWeb } from '../../api'
import { atualizacaoStore, useAtualizacao } from './store'
import './atualizacao.css'

/**
 * Faixa fina sob o topo: aparece só quando há versão nova (ou baixando/pronta).
 * Nada baixa nem instala sem o clique.
 */
export function FaixaAtualizacao(): ReactElement | null {
  const a = useAtualizacao()
  useEffect(() => {
    if (isWeb) return
    // o app procura sozinho 20 s depois de abrir; aqui só se lê o resultado
    const t = setTimeout(() => void atualizacaoStore.ler(), 25_000)
    return () => clearTimeout(t)
  }, [])
  if (a.fase !== 'disponivel' && a.fase !== 'baixando' && a.fase !== 'pronto') return null
  return (
    <div className="atu" role="status" aria-live="polite">
      <span className="atu-t">
        {a.fase === 'disponivel' && <>Nova versão <b>{a.versao}</b> disponível (você usa a {a.versaoAtual}).</>}
        {a.fase === 'baixando' && <>Baixando a versão <b>{a.versao}</b>… {a.progresso ?? 0}%</>}
        {a.fase === 'pronto' && <>Versão <b>{a.versao}</b> baixada. O app fecha e abre de novo ao instalar; seus livros e ajustes ficam como estão.</>}
      </span>
      {a.url && a.fase === 'disponivel' && (
        <button type="button" className="btn sm" onClick={() => void folio.openExternal(a.url!)}>
          O que mudou
        </button>
      )}
      {a.fase === 'disponivel' && (
        <button type="button" className="btn sm pri" onClick={() => void atualizacaoStore.baixar()}>
          Baixar
        </button>
      )}
      {a.fase === 'pronto' && (
        <button type="button" className="btn sm pri" onClick={() => void atualizacaoStore.instalar()}>
          Instalar e reiniciar
        </button>
      )}
    </div>
  )
}

/** Seção "Atualizações" de Ajustes. */
export function SecaoAtualizacao(): ReactElement {
  const a = useAtualizacao()
  useEffect(() => {
    void atualizacaoStore.ler()
  }, [])
  const ocupado = a.fase === 'verificando' || a.fase === 'baixando'
  return (
    <section className="aj-sec" aria-labelledby="aj-h-atu">
      <header className="aj-sh">
        <h2 id="aj-h-atu" className="disp">Atualizações</h2>
        <p>
          O Darkpages procura versão nova nas releases do GitHub quando abre. Nada é baixado ou instalado sem você clicar, e o
          arquivo é conferido pelo hash antes de instalar. Livros e ajustes ficam como estão.
        </p>
      </header>
      {isWeb ? (
        <p className="muted">No modo web não há atualização pelo app: a versão é a do código que está rodando no servidor.</p>
      ) : (
        <div className="atu-card">
          <p className="atu-v">
            Versão instalada: <b>{a.versaoAtual || '…'}</b>
          </p>
          <p className="atu-s" aria-live="polite">
            {a.fase === 'indisponivel' && (a.mensagem ?? 'Atualização automática indisponível aqui.')}
            {a.fase === 'parado' && 'Ainda não verificou nesta sessão.'}
            {a.fase === 'verificando' && 'Procurando versão nova…'}
            {a.fase === 'atual' && 'Você está na versão mais recente.'}
            {a.fase === 'disponivel' && `Versão ${a.versao} disponível.`}
            {a.fase === 'baixando' && `Baixando a versão ${a.versao}… ${a.progresso ?? 0}%`}
            {a.fase === 'pronto' && `Versão ${a.versao} baixada e conferida. Falta instalar.`}
            {a.fase === 'erro' && (a.mensagem ?? 'Não consegui verificar.')}
          </p>
          <div className="atu-ac">
            {a.fase !== 'indisponivel' && (
              <button type="button" className="btn sm" disabled={ocupado} onClick={() => void atualizacaoStore.verificar()}>
                Verificar agora
              </button>
            )}
            {a.fase === 'disponivel' && (
              <button type="button" className="btn sm pri" onClick={() => void atualizacaoStore.baixar()}>
                Baixar {a.versao}
              </button>
            )}
            {a.fase === 'pronto' && (
              <button type="button" className="btn sm pri" onClick={() => void atualizacaoStore.instalar()}>
                Instalar e reiniciar
              </button>
            )}
            <button type="button" className="btn sm" onClick={() => void folio.openExternal('https://github.com/samurai-py/darkpages/releases')}>
              Ver releases
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
