/**
 * Contrato do armazenamento remoto usado pelo motor de sync. A implementação
 * real é o Google Drive (drive.ts); os testes usam um fake em memória.
 */

export interface RemoteFile {
  id: string
  name: string
  /** MD5 do conteúdo (só arquivos binários; pastas não têm) */
  md5?: string
  modifiedTime: string
  folder: boolean
}

export interface Remote {
  /** Pasta (criando se preciso) `name` dentro de `parentId` ('root' = raiz do Drive). */
  ensureFolder(parentId: string, name: string, appProps?: Record<string, string>): Promise<string>
  /** Filhos diretos (não excluídos) de uma pasta. */
  listChildren(folderId: string): Promise<RemoteFile[]>
  /** Arquivo por nome dentro de uma pasta (o mais recente, se houver vários). */
  findChild(folderId: string, name: string): Promise<RemoteFile | null>
  /** Metadados atuais; null se não existe mais ou está na lixeira. */
  get(id: string): Promise<RemoteFile | null>
  /** Cria (sem existingId) ou substitui o conteúdo de um arquivo. */
  upload(parentId: string, name: string, bytes: Buffer, existingId?: string): Promise<RemoteFile>
  download(id: string): Promise<Buffer>
  /** Move para a lixeira do Drive (recuperável por 30 dias). */
  trash(id: string): Promise<void>
}
