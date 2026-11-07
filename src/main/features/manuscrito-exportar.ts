import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  AlignmentType,
  Document,
  FootnoteReferenceRun,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  type ParagraphChild
} from 'docx'
import { openProject, readChapter, slugify } from '../project'
import { atomicWrite } from '../store/docs'
import { parseBlocks, parseInline, runsToPlain, type Block, type Run } from './manuscrito-md'
import type { ChapterContent, ChapterKind } from '../../shared/types'

export type FormatoExport = 'docx' | 'md' | 'txt'

const NUMERAIS = [
  'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
  'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove', 'vinte'
]

/** Rótulo acima do título: "Capítulo 3", "Prólogo", "Epílogo". */
export function rotuloCapitulo(kind: ChapterKind, n: number): string {
  if (kind === 'prologo') return 'Prólogo'
  if (kind === 'epilogo') return 'Epílogo'
  return `Capítulo ${NUMERAIS[n - 1] ?? n}`
}

async function lerTodos(dir: string): Promise<{ title: string; author: string; caps: Array<ChapterContent & { n: number }> }> {
  const p = await openProject(dir)
  const caps: Array<ChapterContent & { n: number }> = []
  let n = 0
  for (const c of p.chapters) {
    if (c.kind === 'capitulo') n++
    caps.push({ ...(await readChapter(dir, c.file)), n })
  }
  return { title: p.meta.title, author: p.meta.author, caps }
}

// ---------------------------------------------------------------- Markdown

function exportMd(title: string, author: string, caps: Array<ChapterContent & { n: number }>): string {
  const parts = [`% ${title}`]
  if (author) parts.push(`% ${author}`)
  parts.push('')
  for (const c of caps) parts.push(`# ${c.title}`, '', c.body.trim(), '')
  return parts.join('\n')
}

// ---------------------------------------------------------------- Texto puro

function exportTxt(title: string, author: string, caps: Array<ChapterContent & { n: number }>): string {
  const out: string[] = [title.toUpperCase(), author, '', '']
  for (const c of caps) {
    const notas: string[] = []
    out.push(rotuloCapitulo(c.kind, c.n).toUpperCase(), c.title, '')
    for (const b of parseBlocks(c.body)) {
      if (b.kind === 'cena') out.push('* * *', '')
      else
        out.push(
          runsToPlain(b.runs, (t) => {
            notas.push(runsToPlain(parseInline(t)))
            return `[${notas.length}]`
          }),
          ''
        )
    }
    if (notas.length) {
      out.push('Notas', '')
      notas.forEach((t, i) => out.push(`[${i + 1}] ${t}`))
      out.push('')
    }
    out.push('')
  }
  return out.join('\n').replace(/\n{4,}/g, '\n\n\n')
}

// ---------------------------------------------------------------- DOCX

function exportDocx(title: string, author: string, caps: Array<ChapterContent & { n: number }>): Promise<Buffer> {
  const footnotes: Record<number, { children: Paragraph[] }> = {}
  let nextNote = 1

  const textRuns = (runs: Run[]): ParagraphChild[] =>
    runs.map((r) => {
      if (r.nota !== undefined) {
        const id = nextNote++
        footnotes[id] = { children: [new Paragraph({ children: textRuns(parseInline(r.nota)) })] }
        return new FootnoteReferenceRun(id)
      }
      return new TextRun({ text: r.text, italics: r.italic, bold: r.bold, ...(r.br ? { break: 1 } : {}) })
    })

  const children: Paragraph[] = []
  caps.forEach((c, i) => {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        pageBreakBefore: i > 0,
        spacing: { before: 1200, after: 120 },
        children: [new TextRun({ text: rotuloCapitulo(c.kind, c.n).toUpperCase(), size: 18, characterSpacing: 40 })]
      }),
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 },
        children: [new TextRun({ text: c.title })]
      })
    )
    let first = true
    for (const b of parseBlocks(c.body) as Block[]) {
      if (b.kind === 'cena') {
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 }, children: [new TextRun('⁂')] }))
        first = true
        continue
      }
      if (b.kind === 'h') {
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: textRuns(b.runs) }))
        first = true
        continue
      }
      children.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          indent: first ? undefined : { firstLine: 425 },
          spacing: { line: 360 },
          children: textRuns(b.runs)
        })
      )
      first = false
    }
  })

  const doc = new Document({
    title,
    creator: author || 'Folio',
    styles: { default: { document: { run: { font: 'EB Garamond', size: 24 } } } },
    footnotes,
    sections: [{ children }]
  })
  return Packer.toBuffer(doc)
}

/** Gera o arquivo em <livro>/export/ e devolve o caminho absoluto. */
export async function exportar(dir: string, formato: FormatoExport): Promise<string> {
  const { title, author, caps } = await lerTodos(dir)
  if (caps.length === 0) throw new Error('O livro ainda não tem capítulos')
  const outDir = join(dir, 'export')
  await mkdir(outDir, { recursive: true })
  const path = join(outDir, `${slugify(title)}.${formato}`)
  if (formato === 'docx') await atomicWrite(path, await exportDocx(title, author, caps))
  else if (formato === 'md') await atomicWrite(path, exportMd(title, author, caps))
  else await atomicWrite(path, exportTxt(title, author, caps))
  return path
}
