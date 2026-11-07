import { bookDir, str, type Handlers } from '../api/context'
import { openProject, readChapter } from '../project'
import { recentsStore } from '../recents'
import { getAsset, getDoc, listDocs, putAsset, putDoc } from '../store/docs'
import { ASSET_NAMES, type Ficha, type FichaTipo } from '../../shared/models'

/**
 * Universo (U1–U3): fichas ficam na coleção "universo" (um documento por ficha,
 * gravado direto pela interface via docs.*). Aqui ficam só as operações que
 * precisam ler o livro inteiro ou outro livro da série.
 */

const COLECAO = 'universo'
const TIPOS: FichaTipo[] = ['personagem', 'lugar', 'objeto', 'grupo', 'divindade']

/** Remove acentos e caixa: "Tomé" → "tome". */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Conta menções de qualquer um dos termos como palavra inteira, ignorando
 * acentos e maiúsculas. Termos que se sobrepõem ("Iara Vennt" e "Iara") contam
 * uma vez só: vence o mais longo.
 */
export function contarMencoes(texto: string, termos: string[]): number {
  const alvo = normalizar(texto)
  const unicos = [...new Set(termos.map((t) => normalizar(t.trim()).replace(/\s+/g, ' ')).filter((t) => t.length > 0))]
  unicos.sort((a, b) => b.length - a.length)
  const ocupado: Array<[number, number]> = []
  let total = 0
  for (const termo of unicos) {
    const padrao = escaparRegex(termo).replace(/ /g, '\\s+')
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${padrao}(?![\\p{L}\\p{N}])`, 'gu')
    for (const m of alvo.matchAll(re)) {
      const ini = m.index ?? 0
      const fim = ini + m[0].length
      if (ocupado.some(([a, b]) => ini < b && fim > a)) continue
      ocupado.push([ini, fim])
      total++
    }
  }
  return total
}

export interface AparicaoCapitulo {
  file: string
  title: string
  mencoes: number
}

export interface Aparicoes {
  capitulos: AparicaoCapitulo[]
  /** total de menções no livro */
  total: number
  /** capítulos com ao menos uma menção */
  presentes: number
}

function fichaValida(v: unknown): v is Ficha {
  if (!v || typeof v !== 'object') return false
  const f = v as Partial<Ficha>
  return typeof f.nome === 'string' && typeof f.tipo === 'string' && TIPOS.includes(f.tipo as FichaTipo)
}

export interface LivroDaSerie {
  dir: string
  title: string
  fichas: number
}

export const handlers: Handlers = {
  /** 'universo.aparicoes'(dir, fichaId) → Aparicoes: menções de nome + apelidos por capítulo. */
  'universo.aparicoes': async (ctx, dir, fichaId): Promise<Aparicoes> => {
    const d = await bookDir(ctx, dir)
    const ficha = await getDoc<Ficha>(d, COLECAO, str(fichaId, 100))
    if (!ficha) throw new Error('Ficha não encontrada')
    const termos = [ficha.nome, ...(Array.isArray(ficha.apelidos) ? ficha.apelidos : [])].filter(
      (t): t is string => typeof t === 'string'
    )
    const projeto = await openProject(d)
    const capitulos: AparicaoCapitulo[] = []
    for (const ch of projeto.chapters) {
      const c = await readChapter(d, ch.file)
      capitulos.push({ file: ch.file, title: ch.title, mencoes: contarMencoes(c.body, termos) })
    }
    return {
      capitulos,
      total: capitulos.reduce((s, c) => s + c.mencoes, 0),
      presentes: capitulos.filter((c) => c.mencoes > 0).length
    }
  },

  /** 'universo.livros'(dir) → LivroDaSerie[]: outros livros já abertos neste app (para importar fichas). */
  'universo.livros': async (ctx, dir): Promise<LivroDaSerie[]> => {
    const d = await bookDir(ctx, dir)
    const out: LivroDaSerie[] = []
    for (const r of await recentsStore(ctx.dataDir).list()) {
      if (r.dir === d || !(await ctx.isAllowed(r.dir))) continue
      try {
        const fichas = (await listDocs(r.dir, COLECAO)).filter(fichaValida).length
        out.push({ dir: r.dir, title: r.title, fichas })
      } catch {
        /* livro movido ou apagado: some da lista */
      }
    }
    return out
  },

  /** 'universo.fichasDe'(origem) → Ficha[] de outro livro da série. */
  'universo.fichasDe': async (ctx, origem): Promise<Ficha[]> => {
    const o = await bookDir(ctx, origem)
    return (await listDocs<Ficha>(o, COLECAO)).filter(fichaValida)
  },

  /**
   * 'universo.importar'(dir, origem, ids[]) → { importadas, atualizadas }.
   * Copia fichas (e retratos) de outro livro mantendo o mesmo id: importar de
   * novo atualiza a cópia, então a série compartilha a mesma ficha.
   */
  'universo.importar': async (ctx, dir, origem, ids): Promise<{ importadas: number; atualizadas: number }> => {
    const d = await bookDir(ctx, dir)
    const o = await bookDir(ctx, origem)
    if (d === o) throw new Error('Escolha outro livro')
    if (!Array.isArray(ids) || ids.length > 2000) throw new Error('Lista de fichas inválida')
    let importadas = 0
    let atualizadas = 0
    for (const raw of ids) {
      const id = str(raw, 100)
      const f = await getDoc<Ficha>(o, COLECAO, id)
      if (!fichaValida(f)) continue
      const existente = await getDoc<Ficha>(d, COLECAO, id)
      let retrato = ''
      if (f.retrato) {
        try {
          const url = await getAsset(o, f.retrato)
          if (url) retrato = await putAsset(d, ASSET_NAMES.retrato(id), url)
        } catch {
          retrato = ''
        }
      }
      const agora = new Date().toISOString()
      await putDoc(d, COLECAO, id, {
        ...f,
        retrato: retrato || existente?.retrato || '',
        criadoEm: existente?.criadoEm ?? f.criadoEm ?? agora,
        atualizadoEm: agora
      })
      if (existente) atualizadas++
      else importadas++
    }
    return { importadas, atualizadas }
  }
}
