import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  AlignmentType,
  Document,
  FootnoteReferenceRun,
  HeadingLevel,
  ImageRun,
  PageBreak,
  Packer,
  Paragraph,
  TextRun,
  type ParagraphChild
} from 'docx'
import { openProject, readChapter, slugify } from '../project'
import { atomicWrite } from '../store/docs'
import { DEFAULT_ROTULO, resolveRotulo, rotuloTela, type RotuloCfg } from '../../shared/rotulo'
import { assetName, parseBody, parseInline, plainText, type Block, type Inline } from '../layout/markdown'
import { imageKind, imageSize } from '../layout/assets'
import { resolveLayout, type FullLayout } from '../layout/settings'
import type { ChapterContent, ChapterKind, EpigrafeCap } from '../../shared/types'

/**
 * Exportação do manuscrito em DOCX, TXT e MD. DOCX e TXT usam o MESMO leitor
 * de Markdown do miolo e do EPUB (layout/markdown.ts): citação, notas,
 * itálico, quebras de cena e de página, figuras e epígrafes saem iguais em
 * todas as saídas. O MD é regravado a partir do mesmo leitor (normalizado).
 */

export type FormatoExport = 'docx' | 'md' | 'txt'

/** Rótulo acima do título no arquivo exportado ("Capítulo 3", "Primeiro Círculo", "Prólogo"), conforme o nome dos capítulos do livro. */
export function rotuloCapitulo(kind: ChapterKind, n: number, cfg: RotuloCfg = DEFAULT_ROTULO): string {
  return rotuloTela(kind, n, cfg) ?? ''
}

type Cap = ChapterContent & { n: number; rotulo: string }

/** Página final (posfácio, agradecimentos, sobre o autor) já com o texto em Markdown. */
interface Final {
  titulo: string
  md: string
  /** nome em assets/ da foto (sobre o autor) */
  foto?: string | null
}

interface Livro {
  dir: string
  title: string
  author: string
  caps: Cap[]
  finais: Final[]
}

function finaisDe(l: FullLayout): Final[] {
  const f = l.front
  const out: Final[] = []
  if (f.posfacio && f.posfacioTexto.trim()) out.push({ titulo: 'Posfácio', md: f.posfacioTexto })
  if (f.agradecimentos && f.agradecimentosTexto.trim()) out.push({ titulo: 'Agradecimentos', md: f.agradecimentosTexto })
  if (f.sobreAutor && (f.sobreAutorTexto.trim() || f.sobreAutorFoto)) out.push({ titulo: 'Sobre o autor', md: f.sobreAutorTexto, foto: assetName(f.sobreAutorFoto) })
  return out
}

async function lerTodos(dir: string): Promise<Livro> {
  const p = await openProject(dir)
  const caps: Cap[] = []
  const cfg = resolveRotulo(p.meta.layout)
  let n = 0
  for (const c of p.chapters) {
    if (c.kind === 'capitulo') n++
    caps.push({ ...(await readChapter(dir, c.file)), n, rotulo: rotuloCapitulo(c.kind, n, cfg) })
  }
  return { dir, title: p.meta.title, author: p.meta.author, caps, finais: finaisDe(resolveLayout(p.meta.layout)) }
}

function linhasEpigrafe(e: EpigrafeCap): Inline[][] {
  return e.texto
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => parseInline(l, []))
}

// ---------------------------------------------------------------- Markdown

/** Escapa o que o Markdown leria como marcação. */
function escMd(t: string): string {
  return t
    .replace(/([\\`*_[\]^~])/g, '\\$1')
    .replace(/^(\s*)([#>+-])/gm, '$1\\$2')
    .replace(/^(\s*\d+)([.)])(\s)/gm, '$1\\$2$3')
}

function inlineMd(c: Inline[]): string {
  return c
    .map((n) => {
      switch (n.t) {
        case 'text':
          return escMd(n.v)
        case 'br':
          return '\\\n'
        case 'em':
          return `*${inlineMd(n.c)}*`
        case 'strong':
          return `**${inlineMd(n.c)}**`
        case 'note':
          return `^[${inlineMd(n.c)}]`
      }
    })
    .join('')
}

/** Blocos do leitor único → Markdown normalizado (o mesmo que o miolo e o EPUB entendem). Imagens apontam para ../assets/. */
function blocosMd(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.t) {
        case 'scene':
          return '***'
        case 'pagebreak':
          return '\\pagebreak'
        case 'sub':
          return `## ${inlineMd(b.c)}`
        case 'quote':
          return b.c.map((p) => `> ${inlineMd(p).replace(/\n/g, '\n> ')}`).join('\n>\n')
        case 'figure':
          return b.src ? `![${inlineMd(b.caption)}](../assets/${b.src})` : inlineMd(b.caption)
        case 'p':
          return inlineMd(b.c)
      }
    })
    .filter(Boolean)
    .join('\n\n')
}

function exportMd(livro: Livro): string {
  const parts = [`% ${livro.title}`]
  if (livro.author) parts.push(`% ${livro.author}`)
  parts.push('')
  for (const c of livro.caps) {
    parts.push(`# ${c.title}`, '')
    if (c.epigrafe?.texto.trim()) {
      parts.push(linhasEpigrafe(c.epigrafe).map((l) => `> *${inlineMd(l)}*`).join('\\\n'))
      if (c.epigrafe.autor?.trim()) parts.push('>', `> — ${escMd(c.epigrafe.autor.trim())}`)
      parts.push('')
    }
    parts.push(blocosMd(parseBody(c.body).blocks), '')
  }
  for (const f of livro.finais) {
    parts.push(`# ${f.titulo}`, '')
    if (f.foto) parts.push(`![](../assets/${f.foto})`, '')
    parts.push(blocosMd(parseBody(f.md).blocks), '')
  }
  return parts.join('\n')
}

// ---------------------------------------------------------------- Texto puro

/** Inline → texto, com as notas numeradas `[n]` e guardadas em `notas`. */
function textoComNotas(c: Inline[], notas: string[]): string {
  return c
    .map((n) => {
      switch (n.t) {
        case 'text':
          return n.v
        case 'br':
          return '\n'
        case 'note':
          notas.push('')
          {
            const k = notas.length
            notas[k - 1] = textoComNotas(n.c, notas)
            return `[${k}]`
          }
        default:
          return textoComNotas(n.c, notas)
      }
    })
    .join('')
}

function blocosTxt(blocks: Block[], notas: string[], out: string[]): void {
  for (const b of blocks) {
    switch (b.t) {
      case 'scene':
        out.push('* * *', '')
        break
      case 'pagebreak':
        out.push('')
        break
      case 'quote':
        for (const p of b.c) out.push(textoComNotas(p, notas).replace(/^/gm, '    '), '')
        break
      case 'figure':
        out.push(`[Imagem${b.src ? `: ${b.src}` : ''}${b.caption.length ? ` — ${textoComNotas(b.caption, notas)}` : ''}]`, '')
        break
      default:
        out.push(textoComNotas(b.c, notas), '')
    }
  }
}

function exportTxt(livro: Livro): string {
  const out: string[] = [livro.title.toUpperCase(), livro.author, '', '']
  const secao = (rotulo: string, titulo: string, blocks: Block[], epi?: EpigrafeCap, foto?: string | null): void => {
    const notas: string[] = []
    if (rotulo) out.push(rotulo.toUpperCase())
    out.push(titulo, '')
    if (epi?.texto.trim()) {
      out.push(...linhasEpigrafe(epi).map((l) => `    ${plainText(l)}`))
      if (epi.autor?.trim()) out.push(`    — ${epi.autor.trim()}`)
      out.push('')
    }
    if (foto) out.push(`[Foto: ${foto}]`, '')
    blocosTxt(blocks, notas, out)
    if (notas.length) {
      out.push('Notas', '')
      notas.forEach((t, i) => out.push(`[${i + 1}] ${t}`))
      out.push('')
    }
    out.push('')
  }
  for (const c of livro.caps) secao(c.rotulo, c.title, parseBody(c.body).blocks, c.epigrafe)
  for (const f of livro.finais) secao('', f.titulo, parseBody(f.md).blocks, undefined, f.foto)
  return out.join('\n').replace(/\n{4,}/g, '\n\n\n')
}

// ---------------------------------------------------------------- DOCX

/** Largura máxima de imagem no DOCX, em pixels a 96 dpi (≈ 15 cm, a mancha de um A5 com margens). */
const DOCX_IMG_MAX_W = 560
const DOCX_IMG_MAX_H = 640

async function imagemDocx(dir: string, nome: string, alt: string, maxW = DOCX_IMG_MAX_W): Promise<ImageRun | null> {
  const path = join(dir, 'assets', nome)
  let data: Buffer
  try {
    data = await readFile(path)
  } catch {
    return null
  }
  const kind = imageKind(data)
  const size = await imageSize(path)
  if (!size || (kind !== 'png' && kind !== 'jpeg')) return null
  const k = Math.min(1, maxW / size.width, DOCX_IMG_MAX_H / size.height)
  return new ImageRun({
    type: kind === 'png' ? 'png' : 'jpg',
    data,
    transformation: { width: Math.round(size.width * k), height: Math.round(size.height * k) },
    altText: { name: nome, description: alt, title: alt }
  })
}

async function exportDocx(livro: Livro): Promise<Buffer> {
  const footnotes: Record<number, { children: Paragraph[] }> = {}
  let nextNote = 1

  const runs = (c: Inline[], st: { italics?: boolean; bold?: boolean } = {}): ParagraphChild[] =>
    c.flatMap((n): ParagraphChild[] => {
      switch (n.t) {
        case 'text':
          return [new TextRun({ text: n.v, ...st })]
        case 'br':
          return [new TextRun({ text: '', break: 1 })]
        case 'em':
          return runs(n.c, { ...st, italics: !st.italics })
        case 'strong':
          return runs(n.c, { ...st, bold: true })
        case 'note': {
          const id = nextNote++
          footnotes[id] = { children: [new Paragraph({ children: runs(n.c) })] }
          return [new FootnoteReferenceRun(id)]
        }
      }
    })

  const blocos = async (blocks: Block[], out: Paragraph[]): Promise<void> => {
    let first = true
    let quebra = false
    for (const b of blocks) {
      const pageBreakBefore = quebra
      quebra = false
      switch (b.t) {
        case 'scene':
          out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 }, children: [new TextRun('⁂')] }))
          first = true
          continue
        case 'pagebreak':
          // a quebra vai como "quebra de página antes" no parágrafo seguinte
          quebra = true
          first = true
          continue
        case 'sub':
          out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, pageBreakBefore, children: runs(b.c) }))
          first = true
          continue
        case 'quote':
          b.c.forEach((p, i) =>
            out.push(
              new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                indent: { left: 720, right: 720 },
                pageBreakBefore: pageBreakBefore && i === 0,
                spacing: { before: i === 0 ? 200 : 80, after: i === b.c.length - 1 ? 200 : 80, line: 320 },
                children: runs(p)
              })
            )
          )
          first = false
          continue
        case 'figure': {
          const alt = plainText(b.caption) || 'Ilustração'
          const img = b.src ? await imagemDocx(livro.dir, b.src, alt) : null
          if (img) out.push(new Paragraph({ alignment: AlignmentType.CENTER, pageBreakBefore, keepNext: true, spacing: { before: 240, after: 80 }, children: [img] }))
          if (b.caption.length || !img) {
            out.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                pageBreakBefore: pageBreakBefore && !img,
                spacing: { after: 240 },
                children: b.caption.length ? runs(b.caption, { italics: true }) : [new TextRun({ text: `[Imagem não encontrada: ${b.raw}]`, italics: true })]
              })
            )
          }
          first = true
          continue
        }
        case 'p':
          out.push(
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              pageBreakBefore,
              indent: first ? undefined : { firstLine: 425 },
              spacing: { line: 360 },
              children: runs(b.c)
            })
          )
          first = false
      }
    }
    if (quebra) out.push(new Paragraph({ children: [new PageBreak()] }))
  }

  const titulo = (rotulo: string, t: string, quebra: boolean, out: Paragraph[]): void => {
    if (rotulo) {
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          pageBreakBefore: quebra,
          spacing: { before: 1200, after: 120 },
          children: [new TextRun({ text: rotulo.toUpperCase(), size: 18, characterSpacing: 40 })]
        })
      )
    }
    out.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        pageBreakBefore: quebra && !rotulo,
        spacing: { before: rotulo ? 0 : 1200, after: 600 },
        children: [new TextRun({ text: t })]
      })
    )
  }

  const children: Paragraph[] = []
  for (const [i, c] of livro.caps.entries()) {
    titulo(c.rotulo, c.title, i > 0, children)
    if (c.epigrafe?.texto.trim()) {
      const ls = linhasEpigrafe(c.epigrafe)
      children.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          indent: { left: 3600 },
          spacing: { after: c.epigrafe.autor?.trim() ? 80 : 480 },
          children: ls.flatMap((l, k) => [...(k > 0 ? [new TextRun({ text: '', break: 1 })] : []), ...runs(l, { italics: true })])
        })
      )
      if (c.epigrafe.autor?.trim()) {
        children.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 480 }, children: [new TextRun({ text: `— ${c.epigrafe.autor.trim()}`, size: 20 })] }))
      }
    }
    await blocos(parseBody(c.body).blocks, children)
  }
  for (const f of livro.finais) {
    titulo('', f.titulo, children.length > 0, children)
    if (f.foto) {
      const img = await imagemDocx(livro.dir, f.foto, `Foto de ${livro.author || 'quem escreveu'}`, 220)
      if (img) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 360 }, children: [img] }))
    }
    await blocos(parseBody(f.md).blocks, children)
  }

  const doc = new Document({
    title: livro.title,
    creator: livro.author || 'Folio',
    styles: { default: { document: { run: { font: 'EB Garamond', size: 24 } } } },
    footnotes,
    sections: [{ children }]
  })
  return Packer.toBuffer(doc)
}

/** Gera o arquivo em <livro>/export/ e devolve o caminho absoluto. */
export async function exportar(dir: string, formato: FormatoExport): Promise<string> {
  const livro = await lerTodos(dir)
  if (livro.caps.length === 0) throw new Error('O livro ainda não tem capítulos')
  const outDir = join(dir, 'export')
  await mkdir(outDir, { recursive: true })
  const path = join(outDir, `${slugify(livro.title)}.${formato}`)
  if (formato === 'docx') await atomicWrite(path, await exportDocx(livro))
  else if (formato === 'md') await atomicWrite(path, exportMd(livro))
  else await atomicWrite(path, exportTxt(livro))
  return path
}
