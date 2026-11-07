import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { findTypst } from './typst'

const run = promisify(execFile)

export interface FonteDisponivel {
  nome: string
  /** 'projeto' = baixada em resources/fonts (OFL, vai junto com o app); 'typst' = embutida no Typst; 'sistema' = instalada na máquina */
  origem: 'projeto' | 'typst' | 'sistema'
}

const TYPST_EMBEDDED = new Set(['Libertinus Serif', 'New Computer Modern', 'New Computer Modern Math', 'DejaVu Sans Mono'])

async function families(typst: string, args: string[]): Promise<string[]> {
  const { stdout } = await run(typst, ['fonts', ...args], { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 })
  return stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Fontes que o Typst enxerga (`typst fonts --font-path resources/fonts`), com a origem de cada uma. */
export async function listFonts(resourcesDir: string): Promise<FonteDisponivel[]> {
  const typst = await findTypst(resourcesDir)
  const fontArgs = ['--font-path', join(resourcesDir, 'fonts')]
  try {
    const [all, bundled] = await Promise.all([families(typst, fontArgs), families(typst, ['--ignore-system-fonts', ...fontArgs])])
    const local = new Set(bundled)
    const out: FonteDisponivel[] = all.map((nome) => ({
      nome,
      origem: TYPST_EMBEDDED.has(nome) ? 'typst' : local.has(nome) ? 'projeto' : 'sistema'
    }))
    const rank = { projeto: 0, typst: 1, sistema: 2 } as const
    return out.sort((a, b) => rank[a.origem] - rank[b.origem] || a.nome.localeCompare(b.nome, 'pt-BR'))
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code === 'ENOENT') throw new Error('Typst não encontrado. Rode `npm run fetch:typst`.')
    throw new Error(`Não consegui listar as fontes: ${err.message}`)
  }
}
