import type { ChapterContent, ExportResult, LayoutSettings, PerfilPdf, Project, RecentProject, SaveResult } from '../../shared/types'

interface FolioIpc {
  invoke(method: string, args: unknown[]): Promise<unknown>
}

declare global {
  interface Window {
    folioIpc?: FolioIpc
  }
}

/** true quando a interface roda no navegador (modo web), sem o Electron. */
export const isWeb = typeof window.folioIpc === 'undefined'

/**
 * Chamada genérica à API (desktop: IPC; web: HTTP). Toda feature usa isto:
 *   const fichas = await call<Ficha[]>('docs.list', dir, 'universo')
 */
export async function call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
  if (window.folioIpc) return (await window.folioIpc.invoke(method, args)) as T
  const res = await fetch(`/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args)
  })
  const data = (await res.json()) as { ok: boolean; result?: T; error?: string }
  if (!res.ok || !data.ok) throw new Error(data.error ?? `Erro ${res.status}`)
  return data.result as T
}

/** Abre um arquivo exportado (PDF, EPUB, DOCX…): desktop mostra na pasta; web baixa/abre. */
export async function openExport(path: string): Promise<void> {
  if (isWeb) {
    window.open(`/files/export?path=${encodeURIComponent(path)}`, '_blank', 'noopener')
    return
  }
  await call('revealFile', path)
}

/** Métodos centrais tipados. */
export const folio = {
  recents: () => call<RecentProject[]>('recents'),
  pickAndOpen: () => call<Project | null>('pickAndOpen'),
  open: (dir: string) => call<Project>('open', dir),
  create: (title: string, author: string) => call<Project | null>('create', title, author),
  readChapter: (dir: string, file: string) => call<ChapterContent>('readChapter', dir, file),
  saveChapter: (dir: string, file: string, title: string, body: string) =>
    call<SaveResult>('saveChapter', dir, file, title, body),
  addChapter: (dir: string, title: string, kind?: 'capitulo' | 'parte') => call<Project>('addChapter', dir, title, kind),
  saveLayout: (dir: string, layout: LayoutSettings) => call<Project>('saveLayout', dir, layout),
  exportPrintPdf: (dir: string, perfil: PerfilPdf = 'grafica') => call<ExportResult>('exportPrintPdf', dir, perfil),
  revealFile: (path: string) => openExport(path),
  openExternal: (url: string) => (isWeb ? Promise.resolve(void window.open(url, '_blank', 'noopener')) : call<void>('openExternal', url)),
  docs: {
    list: <T>(dir: string, collection: string) => call<Array<T & { id: string }>>('docs.list', dir, collection),
    get: <T>(dir: string, collection: string, id: string) => call<(T & { id: string }) | null>('docs.get', dir, collection, id),
    put: <T extends object>(dir: string, collection: string, id: string, data: T) =>
      call<T & { id: string }>('docs.put', dir, collection, id, data),
    delete: (dir: string, collection: string, id: string) => call<void>('docs.delete', dir, collection, id)
  },
  assets: {
    put: (dir: string, name: string, dataUrl: string) => call<string>('assets.put', dir, name, dataUrl),
    get: (dir: string, name: string) => call<string | null>('assets.get', dir, name),
    delete: (dir: string, name: string) => call<void>('assets.delete', dir, name)
  },
  settings: {
    get: <T = Record<string, unknown>>(section: string) => call<T>('settings.get', section),
    put: <T = Record<string, unknown>>(section: string, patch: Record<string, unknown>) => call<T>('settings.put', section, patch)
  }
}

/** Lê um File (input type=file) como data URL. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((ok, fail) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result))
    r.onerror = () => fail(r.error ?? new Error('Falha ao ler arquivo'))
    r.readAsDataURL(file)
  })
}
