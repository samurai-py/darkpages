import { bookDir, str, type Handlers } from '../api/context'
import { getDoc, listDocs, newId, putDoc } from '../store/docs'

/**
 * Métodos da feature "mapas". Os mapas ficam na coleção "mapas" (um documento
 * por mapa); o editor lê/grava o documento inteiro por docs.get/docs.put.
 * Aqui ficam só as operações que não valem a pena trafegar o mapa inteiro.
 */

interface MapaArmazenado {
  nome?: string
  estilo?: string
  atualizadoEm?: string
  criadoEm?: string
  relevo?: unknown[]
  vegetacao?: unknown[]
  simbolos?: unknown[]
  rios?: unknown[]
  rotas?: unknown[]
  rotulos?: unknown[]
}

const n = (v: unknown[] | undefined): number => (Array.isArray(v) ? v.length : 0)

export const handlers: Handlers = {
  /** 'mapas.listar'(dir) → MapaResumo[] (mais recentes primeiro) */
  'mapas.listar': async (ctx, dir) => {
    const docs = await listDocs<MapaArmazenado>(await bookDir(ctx, dir), 'mapas')
    return docs
      .map((d) => ({
        id: d.id,
        nome: typeof d.nome === 'string' && d.nome ? d.nome : 'Mapa sem nome',
        estilo: d.estilo === 'colorido' ? 'colorido' : 'pena',
        itens: n(d.relevo) + n(d.vegetacao) + n(d.simbolos) + n(d.rios) + n(d.rotas) + n(d.rotulos),
        atualizadoEm: d.atualizadoEm ?? d.criadoEm ?? ''
      }))
      .sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm))
  },

  /** 'mapas.duplicar'(dir, id, nome) → { id } da cópia */
  'mapas.duplicar': async (ctx, dir, id, nome) => {
    const d = await bookDir(ctx, dir)
    const orig = await getDoc<MapaArmazenado & Record<string, unknown>>(d, 'mapas', str(id, 100))
    if (!orig) throw new Error('Mapa não encontrado')
    const novo = newId('mapa')
    const agora = new Date().toISOString()
    const { id: _velho, ...resto } = orig
    await putDoc(d, 'mapas', novo, { ...resto, nome: str(nome, 200), criadoEm: agora, atualizadoEm: agora })
    return { id: novo }
  },

  /** 'mapas.renomear'(dir, id, nome) → void (sem reenviar o mapa inteiro) */
  'mapas.renomear': async (ctx, dir, id, nome) => {
    const d = await bookDir(ctx, dir)
    const orig = await getDoc<Record<string, unknown>>(d, 'mapas', str(id, 100))
    if (!orig) throw new Error('Mapa não encontrado')
    const novoNome = str(nome, 200).trim()
    if (!novoNome) throw new Error('Nome vazio')
    await putDoc(d, 'mapas', orig.id, { ...orig, nome: novoNome, atualizadoEm: new Date().toISOString() })
  }
}
