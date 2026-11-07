import { mkdir } from 'node:fs/promises'
import { addChapter, createProject, openProject, readChapter, saveChapter, saveMeta, saveLayout } from '../project'
import { exportPrintPdf } from '../layout/export'
import { recentsStore } from '../recents'
import { deleteAsset, deleteDoc, getAsset, getDoc, listDocs, putAsset, putDoc } from '../store/docs'
import { readSectionMasked, writeSection, type Section } from '../store/settings'
import { bookDir, str, type Handlers } from './context'
import type { LayoutSettings } from '../../shared/types'

/** Métodos centrais: livros, capítulos, documentos genéricos, imagens e configurações. */
export const core: Handlers = {
  recents: async (ctx) => recentsStore(ctx.dataDir).list(),

  open: async (ctx, dir) => {
    const d = str(dir, 4096)
    if (!(await ctx.isAllowed(d))) throw new Error('Projeto desconhecido')
    return ctx.remember(await openProject(d))
  },

  pickAndOpen: async (ctx) => {
    const dir = await ctx.pickDirectory('Abrir livro (pasta .folio)')
    return dir ? ctx.remember(await openProject(dir)) : null
  },

  create: async (ctx, title, author) => {
    let parent: string | null = ctx.libraryDir
    if (!ctx.web) parent = await ctx.pickDirectory('Onde salvar o novo livro?')
    if (!parent) return null
    await mkdir(parent, { recursive: true })
    return ctx.remember(await createProject(parent, str(title, 200), str(author, 200)))
  },

  readChapter: async (ctx, dir, file) => readChapter(await bookDir(ctx, dir), str(file, 200)),
  saveChapter: async (ctx, dir, file, title, body) =>
    saveChapter(await bookDir(ctx, dir), str(file, 200), str(title, 300), str(body)),
  addChapter: async (ctx, dir, title, kind) =>
    addChapter(await bookDir(ctx, dir), str(title, 300), kind === 'parte' ? 'parte' : 'capitulo'),
  saveMeta: async (ctx, dir, title, author) =>
    ctx.remember(await saveMeta(await bookDir(ctx, dir), str(title, 200), str(author ?? '', 200))),
  saveLayout: async (ctx, dir, layout) => saveLayout(await bookDir(ctx, dir), layout as LayoutSettings),
  exportPrintPdf: async (ctx, dir, perfil) => {
    const p = perfil === undefined ? 'grafica' : str(perfil, 10)
    if (p !== 'grafica' && p !== 'kdp' && p !== 'tela') throw new Error('Perfil de PDF inválido: use grafica, kdp ou tela')
    return exportPrintPdf(await bookDir(ctx, dir), ctx.resourcesDir, p)
  },
  revealFile: async (ctx, path) => ctx.reveal(str(path, 4096)),
  openExternal: async (ctx, url) => {
    const u = str(url, 4096)
    if (!/^https:\/\//.test(u)) throw new Error('Só links https')
    return ctx.openExternal(u)
  },

  // documentos genéricos por coleção (<livro>/<coleção>/<id>.json)
  'docs.list': async (ctx, dir, collection) => listDocs(await bookDir(ctx, dir), str(collection, 60)),
  'docs.get': async (ctx, dir, collection, id) => getDoc(await bookDir(ctx, dir), str(collection, 60), str(id, 100)),
  'docs.put': async (ctx, dir, collection, id, data) => {
    if (!data || typeof data !== 'object') throw new Error('Documento inválido')
    return putDoc(await bookDir(ctx, dir), str(collection, 60), str(id, 100), data)
  },
  'docs.delete': async (ctx, dir, collection, id) => deleteDoc(await bookDir(ctx, dir), str(collection, 60), str(id, 100)),

  // imagens/arquivos (<livro>/assets/<nome>) como data URL
  'assets.put': async (ctx, dir, name, dataUrl) => putAsset(await bookDir(ctx, dir), str(name, 100), str(dataUrl, 30_000_000)),
  'assets.get': async (ctx, dir, name) => getAsset(await bookDir(ctx, dir), str(name, 100)),
  'assets.delete': async (ctx, dir, name) => deleteAsset(await bookDir(ctx, dir), str(name, 100)),

  // configurações por seção (segredos mascarados na leitura)
  'settings.get': async (ctx, section) => readSectionMasked(ctx.dataDir, str(section, 40)),
  'settings.put': async (ctx, section, patch) => {
    if (!patch || typeof patch !== 'object') throw new Error('Configuração inválida')
    await writeSection(ctx.dataDir, str(section, 40), patch as Section)
    return readSectionMasked(ctx.dataDir, str(section, 40))
  }
}
