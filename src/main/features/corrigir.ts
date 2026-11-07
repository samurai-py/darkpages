import { bookDir, str, type Handlers } from '../api/context'
import { readChapter } from '../project'
import { snapshotAgora } from '../arca'
import { checarLanguageTool, revisorSettings } from '../ai/languagetool'
import { dicionarioDoLivro, listarDecisoes } from '../ai/decisoes'
import { filtrarSugestoes } from '../../shared/decisoes'
import { posicaoDaSugestao, type ResultadoRevisorCorrigir, type SugestaoCorrigir } from '../../shared/corrigir'

/**
 * Métodos do "Corrigir" do Manuscrito (prefixo "corrigir."). Contratos em
 * src/shared/corrigir.ts. A tipografia é corrigida na interface (sem rede);
 * aqui fica só a parte que precisa do LanguageTool e da Arca.
 */

const CAP_RE = /^\d{3}-[a-z0-9-]+\.md$/
/** um capítulo grande cabe com folga; acima disso é engano */
const MAX_TEXTO = 400_000

function capFile(v: unknown): string {
  const f = str(v, 200)
  if (!CAP_RE.test(f)) throw new Error('Capítulo inválido.')
  return f
}

export const handlers: Handlers = {
  /** Ortografia e gramática do trecho (só LanguageTool, nada de IA). */
  'corrigir.revisor': async (ctx, dir, file, texto): Promise<ResultadoRevisorCorrigir> => {
    const d = await bookDir(ctx, dir)
    const f = capFile(file)
    const t = str(texto, MAX_TEXTO)
    const s = await revisorSettings(ctx)
    const modo = s.ltModo
    if (modo === 'off') {
      return { ativo: false, modo, sugestoes: [], aviso: 'LanguageTool desligado (Ajustes › Revisor): só tipografia e espaços foram conferidos.' }
    }
    if (!t.trim()) return { ativo: true, modo, sugestoes: [] }
    const cap = await readChapter(d, f)
    const decisoes = await listarDecisoes(d)
    let lista
    try {
      lista = await checarLanguageTool(ctx, t, await dicionarioDoLivro(d, decisoes))
    } catch (e) {
      return { ativo: false, modo, sugestoes: [], aviso: `LanguageTool: ${(e as Error).message}` }
    }
    const validas = filtrarSugestoes(
      lista.filter((x) => x.categoria === 'ortografia' || x.categoria === 'gramatica'),
      decisoes,
      cap.ignorados,
      cap.id
    )
    const sugestoes: SugestaoCorrigir[] = []
    for (const x of validas) {
      const inicio = posicaoDaSugestao(t, x)
      if (inicio >= 0) sugestoes.push({ ...x, inicio })
    }
    return { ativo: true, modo, sugestoes }
  },

  /** Guarda o manuscrito na Arca antes de corrigir o capítulo inteiro. */
  'corrigir.snapshot': async (ctx, dir) => {
    const s = await snapshotAgora(await bookDir(ctx, dir), 'antes de corrigir')
    return { id: s.id }
  }
}
