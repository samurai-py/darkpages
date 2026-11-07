import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { recentsStore } from './recents'
import { dispatch } from './api/registry'
import type { Ctx } from './api/context'
import type { Project } from '../shared/types'

/** Livros abertos nesta sessão + recentes: só esses podem ser lidos/escritos. */
const allowedDirs = new Set<string>()

function makeCtx(): Ctx {
  const dataDir = app.getPath('userData')
  const recents = recentsStore(dataDir)
  return {
    web: false,
    resourcesDir: app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources'),
    dataDir,
    libraryDir: join(homedir(), 'Folio'),
    isAllowed: async (dir) => allowedDirs.has(dir) || (await recents.list()).some((r) => r.dir === dir),
    remember: async (p: Project) => {
      allowedDirs.add(p.dir)
      await recents.touch(p.dir, p.meta.title)
      return p
    },
    pickDirectory: async (title) => {
      const r = await dialog.showOpenDialog({ title, properties: ['openDirectory', 'createDirectory'] })
      return r.canceled ? null : (r.filePaths[0] ?? null)
    },
    openExternal: (url) => shell.openExternal(url),
    reveal: async (path) => shell.showItemInFolder(path)
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: '#070707',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

void app.whenReady().then(() => {
  const ctx = makeCtx()
  ipcMain.handle('invoke', (_e, method: unknown, args: unknown) => {
    if (typeof method !== 'string' || !Array.isArray(args)) throw new Error('Chamada inválida')
    return dispatch(ctx, method, args)
  })
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
