import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { RecentProject } from '../shared/types'

/** Lista de livros abertos recentemente, guardada em `<dataDir>/recentes.json`. */
export function recentsStore(dataDir: string): {
  list: () => Promise<RecentProject[]>
  touch: (dir: string, title: string) => Promise<void>
} {
  const file = join(dataDir, 'recentes.json')
  const list = async (): Promise<RecentProject[]> => {
    try {
      const data = JSON.parse(await readFile(file, 'utf8')) as RecentProject[]
      return Array.isArray(data) ? data : []
    } catch {
      return []
    }
  }
  const touch = async (dir: string, title: string): Promise<void> => {
    const items = (await list()).filter((r) => r.dir !== dir)
    items.unshift({ dir, title, openedAt: new Date().toISOString() })
    await mkdir(dataDir, { recursive: true })
    await writeFile(file, JSON.stringify(items.slice(0, 12), null, 2), 'utf8')
  }
  return { list, touch }
}
