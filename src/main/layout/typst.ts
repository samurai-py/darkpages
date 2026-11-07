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
  /** nome do .typ dentro de buildDir (padrão livro.typ) */
  inputName?: string
}

function typstError(e: unknown): Error {
  const err = e as NodeJS.ErrnoException & { stderr?: string }
  if (err.code === 'ENOENT') {
    return new Error('Typst não encontrado. Rode `npm run fetch:typst` ou instale o typst no PATH.')
  }
  return new Error(`Falha ao compilar com Typst:\n${(err.stderr ?? err.message).trim()}`)
}

async function writeSource(buildDir: string, name: string, source: string): Promise<string> {
  await mkdir(buildDir, { recursive: true })
  const input = join(buildDir, name)
  await writeFile(input, source, 'utf8')
  return input
}

function fontArgs(fontDirs: string[]): string[] {
  return fontDirs.flatMap((d) => ['--font-path', d])
}

const EXEC = { timeout: 180_000, maxBuffer: 64 * 1024 * 1024 }

export async function compileTypst(o: CompileOptions): Promise<{ pages: number; warnings: string }> {
  const input = await writeSource(o.buildDir, o.inputName ?? 'livro.typ', o.source)
  const args = ['compile', '--root', o.buildDir, ...fontArgs(o.fontDirs), input, o.outPdf]
  try {
    const { stderr } = await run(o.typst, args, EXEC)
    const pages = countPdfPages(await readFile(o.outPdf))
    return { pages, warnings: stderr.trim() }
  } catch (e) {
    throw typstError(e)
  }
}

export interface PngOptions {
  typst: string
  buildDir: string
  /** .typ já escrito em buildDir */
  inputName: string
  fontDirs: string[]
  /** pasta onde os PNG são gravados (limpa antes pelo chamador) */
  outDir: string
  /** intervalo no formato do --pages (ex.: "3-6") */
  pages: string
  ppi: number
}

/** Rasteriza páginas em PNG. Os arquivos saem como p-<página>.png. */
export async function renderPng(o: PngOptions): Promise<string> {
  const args = [
    'compile', '--root', o.buildDir, ...fontArgs(o.fontDirs),
    '--format', 'png', '--ppi', String(o.ppi), '--pages', o.pages,
    join(o.buildDir, o.inputName), join(o.outDir, 'p-{p}.png')
  ]
  try {
    const { stderr } = await run(o.typst, args, EXEC)
    return stderr.trim()
  } catch (e) {
    throw typstError(e)
  }
}

/** Lê o valor do metadata com o rótulo (`typst eval --in`, que substituiu o `typst query`). */
export async function queryTypst<T>(o: { typst: string; buildDir: string; inputName: string; fontDirs: string[]; label: string }): Promise<T> {
  const args = [
    'eval', '--root', o.buildDir, ...fontArgs(o.fontDirs),
    '--in', join(o.buildDir, o.inputName),
    `query(<${o.label}>).first().value`
  ]
  try {
    const { stdout } = await run(o.typst, args, EXEC)
    return JSON.parse(stdout) as T
  } catch (e) {
    throw typstError(e)
  }
}

export { writeSource }
