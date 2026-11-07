import { contextBridge, ipcRenderer } from 'electron'

/** Canal único: a interface chama `folioIpc.invoke(método, argumentos)`. */
contextBridge.exposeInMainWorld('folioIpc', {
  invoke: (method: string, args: unknown[]) => ipcRenderer.invoke('invoke', method, args)
})
