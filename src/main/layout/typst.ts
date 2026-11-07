import { execFile } from 'node:child_process'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * Procura o binário do Typst:
 * 1. variável FOLIO_TYPST
 * 2. resources/bin/typst (baixado por `npm run fetch:typst`)
 * 3. `typst` no PATH
 */
export async function findTypst(resourcesDir: string): Promise<string> {
  const exe = process.platform === 'win32' ? 'typst.exe' : 'typst'
  const candidates = [process.env['FOLIO_TYPST'], join(resourcesDir, 'bin', exe)].filter(
    (c): c is string => Boolean(c)
  )
  for (const c of candidates) {
    try {
      await access(c, constants.X_OK)
      return c
    } catch {
      /* tenta o próximo */
    }
  }
  return exe
}

/** Conta páginas de um PDF sem dependências: usa o /Count da árvore de páginas. */
export function countPdfPages(pdf: Buffer): number {
  const text = pdf.toString('latin1')
  let max = 0
  for (const m of text.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g)) {
    max = Math.max(max, Number(m[1] ?? m[2]))
  }
  if (max > 0) return max
  return (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length
}

export interface CompileOptions {
  typst: string
  buildDir: string
  source: string
  outPdf: string
  fontDirs: string[]
}

export async function compileTypst(o: CompileOptions): Promise<{ pages: number; warnings: string }> {
  await mkdir(o.buildDir, { recursive: true })
  const input = join(o.buildDir, 'livro.typ')
  await writeFile(input, o.source, 'utf8')
  const args = ['compile', '--root', o.buildDir]
  for (const d of o.fontDirs) args.push('--font-path', d)
  args.push(input, o.outPdf)
  try {
    const { stderr } = await run(o.typst, args, { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 })
    const pages = countPdfPages(await readFile(o.outPdf))
    return { pages, warnings: stderr.trim() }
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string }
    if (err.code === 'ENOENT') {
      throw new Error('Typst não encontrado. Rode `npm run fetch:typst` ou instale o typst no PATH.')
    }
    throw new Error(`Falha ao compilar com Typst:\n${err.stderr ?? err.message}`)
  }
}
