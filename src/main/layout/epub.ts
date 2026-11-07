import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import JSZip from 'jszip'
import { openProject, readChapter, slugify } from '../project'
import type { ChapterContent, EpigrafeCap } from '../../shared/types'
import { aberturaPath, capaFrentePath, imageKind, mediaType, type ImageKind } from './assets'
import { isbnToEan } from './cover'
import { chapterLabelText, numberChapters, showsTitle } from './labels'
import { dentroDeParte, rotuloTela } from '../../shared/rotulo'
import { assetName, parseBody, parseInline, type Block, type Inline } from './markdown'
import { chapterDropCap, resolveLayout, type FullLayout } from './settings'

/**
 * EPUB 3 escrito à mão (D11): mimetype (primeiro e sem compressão),
 * META-INF/container.xml, content.opf, nav.xhtml (+ toc.ncx para leitores
 * antigos), um XHTML por capítulo com notas ao fim do capítulo, CSS de livro,
 * capa e artes de abertura quando existem.
 */

export interface EpubResult {
  epubPath: string
  capitulos: number
  notas: number
  capa: boolean
  aberturas: number
  /** imagens com legenda no texto */
  figuras: number
  /** fonte do miolo embutida (null = o leitor usa a fonte dele) */
  fonte: string | null
  bytes: number
}

const EXT: Record<ImageKind, string> = { png: 'png', jpeg: 'jpg', webp: 'webp', svg: 'svg' }

function acessibilidade(notas: number, imagens: number): string {
  return [
    'Texto reflowable com títulos, sumário navegável e ordem de leitura que segue o livro impresso.',
    notas ? 'As notas de rodapé ficam no fim de cada capítulo, com link de ida e volta.' : '',
    imagens ? 'Imagens têm texto alternativo (legenda ou descrição).' : '',
    'Sem riscos conhecidos (sem animação, som ou flashes).'
  ]
    .filter(Boolean)
    .join(' ')
}

interface FonteEmbutida {
  files: Array<{ name: string; data: Buffer; italic: boolean; weight: string }>
}

/**
 * Arquivos da fonte do miolo em resources/fonts/<família sem espaços>/, se a
 * pasta tiver a licença OFL (que permite embutir). Só regular, itálico,
 * negrito e negrito itálico (ou os arquivos variáveis [wght]), para o EPUB não
 * inchar. Fonte do sistema não é embutida: a licença é desconhecida.
 */
async function bundledFont(resourcesDir: string, family: string): Promise<FonteEmbutida | null> {
  const folder = join(resourcesDir, 'fonts', family.toLowerCase().replace(/[^a-z0-9]/g, ''))
  let names: string[]
  try {
    names = await readdir(folder)
  } catch {
    return null
  }
  if (!names.some((n) => /^OFL/i.test(n))) return null
  const files: FonteEmbutida['files'] = []
  for (const n of names.filter((x) => /\.(ttf|otf)$/i.test(x)).sort()) {
    const italic = /italic/i.test(n)
    const variable = /\[wght\]/i.test(n)
    const style = n.replace(/\.(ttf|otf)$/i, '').split('-').slice(1).join('-').replace(/italic/i, '')
    let weight: string | null = null
    if (variable) weight = '400 800'
    else if (style === '' || /^regular$/i.test(style)) weight = '400'
    else if (/^bold$/i.test(style)) weight = '700'
    if (!weight) continue
    if (/\.otf$/i.test(n)) continue // manifesto declara font/ttf; .otf ficaria com tipo errado
    files.push({ name: n.replace(/[[\]]/g, ''), data: await readFile(join(folder, n)), italic, weight })
  }
  return files.length ? { files } : null
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

interface NoteSink {
  notes: string[]
  /** prefixo único por capítulo, para ids */
  prefix: string
}

/** Imagens do texto (nome em assets/ → caminho no EPUB), preenchido pelo exportador. */
interface ImgSink {
  map: Map<string, string>
}

/** Blocos do leitor único → XHTML. `firstDrop` aplica a capitular no primeiro parágrafo. */
function blocksXhtml(blocks: Block[], sink: NoteSink, imgs: ImgSink, scene: string, firstDrop: boolean): string {
  let first = true
  let afterBreak = true
  const parts: string[] = []
  for (const b of blocks) {
    switch (b.t) {
      case 'scene':
        parts.push(`<p class="cena" role="separator" aria-label="Quebra de cena">${esc(scene) || '&#160;'}</p>`)
        afterBreak = true
        continue
      case 'pagebreak':
        parts.push('<div class="quebra-pagina" aria-hidden="true"></div>')
        afterBreak = true
        continue
      case 'quote':
        parts.push(`<blockquote>${b.c.map((p) => `<p>${inlineXhtml(p, sink)}</p>`).join('')}</blockquote>`)
        afterBreak = false
        continue
      case 'sub':
        parts.push(`<h2>${inlineXhtml(b.c, sink)}</h2>`)
        afterBreak = true
        continue
      case 'figure': {
        const href = b.src ? imgs.map.get(b.src) : undefined
        const cap = inlineXhtml(b.caption, sink)
        const alt = esc(plainCaption(b.caption) || 'Ilustração')
        parts.push(
          href
            ? `<figure class="figura"><img src="${href}" alt="${alt}"/>${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>`
            : cap
              ? `<p class="legenda-solta">${cap}</p>`
              : ''
        )
        afterBreak = true
        continue
      }
      case 'p': {
        let html = inlineXhtml(b.c, sink)
        if (first && firstDrop) {
          // primeira letra (com aspas de abertura) em capitular, se o parágrafo começar com letra
          const m = html.match(/^((?:&quot;|&#39;|[“«‘(])*)(\p{L}|\p{N})/u)
          if (m) html = `<span class="capitular">${m[0]}</span>${html.slice(m[0].length)}`
        }
        parts.push(`<p${afterBreak ? ' class="sem-recuo"' : ''}>${html}</p>`)
        first = false
        afterBreak = false
      }
    }
  }
  return parts.join('\n')
}

function plainCaption(c: Inline[]): string {
  return c.map((n) => (n.t === 'text' ? n.v : n.t === 'br' ? ' ' : n.t === 'note' ? '' : plainCaption(n.c))).join('').trim()
}

function notesSection(sink: NoteSink): string {
  const prefix = sink.prefix
  return sink.notes.length
    ? `<section class="notas" epub:type="endnotes" role="doc-endnotes">
<h2>Notas</h2>
<ol>
${sink.notes.map((t, i) => `<li id="${prefix}n${i + 1}" epub:type="endnote"><p>${t} <a href="#${prefix}r${i + 1}" role="doc-backlink" title="Voltar ao texto">↩</a></p></li>`).join('\n')}
</ol>
</section>`
    : ''
}

function epigrafeXhtml(e: EpigrafeCap | undefined, sink: NoteSink): string {
  if (!e || !e.texto.trim()) return ''
  const linhas = e.texto
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => inlineXhtml(parseInline(l, []), sink))
  return `<blockquote class="epigrafe-cap" epub:type="epigraph" role="doc-epigraph"><p>${linhas.join('<br/>')}</p>${e.autor?.trim() ? `<p class="quem">— ${esc(e.autor.trim())}</p>` : ''}</blockquote>`
}

function inlineXhtml(c: Inline[], sink: NoteSink): string {
  return c
    .map((n) => {
      switch (n.t) {
        case 'text':
          return esc(n.v)
        case 'br':
          return '<br/>'
        case 'em':
          return `<em>${inlineXhtml(n.c, sink)}</em>`
        case 'strong':
          return `<strong>${inlineXhtml(n.c, sink)}</strong>`
        case 'note': {
          // reserva o número antes de montar o corpo: uma nota dentro da nota
          // ganha o número seguinte e ids próprios (nunca repetidos)
          const k = sink.notes.length + 1
          sink.notes.push('')
          sink.notes[k - 1] = inlineXhtml(n.c, sink)
          return `<sup><a class="noteref" id="${sink.prefix}r${k}" href="#${sink.prefix}n${k}" epub:type="noteref" role="doc-noteref">${k}</a></sup>`
        }
      }
    })
    .join('')
}

function page(title: string, body: string, bodyType = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="pt-BR" lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>${esc(title)}</title>
<link rel="stylesheet" type="text/css" href="estilo.css"/>
</head>
<body${bodyType ? ` epub:type="${bodyType}"` : ''}>
${body}
</body>
</html>
`
}

function multiline(text: string): string {
  return text
    .trim()
    .split('\n')
    .map((l) => esc(l.trim()))
    .join('<br/>')
}

const SCENE_TEXT: Record<string, string> = {
  asterismo: '⁂',
  asteriscos: '* * *',
  losango: '◆',
  vinheta: '❦',
  linha: '—',
  espaco: ''
}

function chapterXhtml(c: ChapterContent, n: number, idx: number, l: FullLayout, art: string | null, imgs: ImgSink): { xhtml: string; notes: number; heading: string } {
  const label = chapterLabelText(c.kind, n, l.rotulo, l.rotuloParte)
  const title = showsTitle(c, label) ? c.title.trim() : (label ?? c.title.trim())
  const tela = rotuloTela(c.kind, n, l.rotulo, l.rotuloParte)
  const navTitle = tela && showsTitle(c, tela) ? `${tela}: ${title}` : title
  const prefix = `c${idx}-`
  const sink: NoteSink = { notes: [], prefix }
  const { blocks } = parseBody(c.body)
  const drop = chapterDropCap(l, c.file) !== 'nenhuma'
  const scene = SCENE_TEXT[l.sceneOrnament] ?? '⁂'
  const epi = epigrafeXhtml(c.epigrafe, sink)
  const texto = blocksXhtml(blocks, sink, imgs, scene, drop)
  const notes = notesSection(sink)
  if (c.kind === 'parte') {
    // página de parte: rótulo, título e o texto curto, centrados; sem capitular
    const corpoParte = blocksXhtml(blocks, sink, imgs, scene, false)
    const bodyParte = `<section class="parte" epub:type="part" role="doc-part" aria-labelledby="titulo">
<header class="abertura-parte">
${label && showsTitle(c, label) ? `<p class="rotulo${l.rotulo.caixa === 'versalete' ? ' versalete' : ''}">${esc(label)}</p>` : ''}
<h1 id="titulo">${esc(title)}</h1>
</header>
${epi}
${corpoParte ? `<div class="texto-parte">${corpoParte}</div>` : ''}
${notes}
</section>`
    return { xhtml: page(title, bodyParte, 'bodymatter'), notes: sink.notes.length, heading: navTitle }
  }
  const type = c.kind === 'prologo' ? 'prologue' : c.kind === 'epilogo' ? 'epilogue' : 'chapter'
  const role = c.kind === 'prologo' ? 'doc-prologue' : c.kind === 'epilogo' ? 'doc-epilogue' : 'doc-chapter'
  const body = `<section epub:type="${type}" role="${role}" aria-labelledby="titulo">
${art ? `<figure class="abertura"><img src="${art}" alt="Ilustração de abertura: ${esc(title)}"/></figure>` : ''}
<header class="abertura-cap">
${label && showsTitle(c, label) ? `<p class="rotulo${l.rotulo.caixa === 'versalete' ? ' versalete' : ''}">${esc(label)}</p>` : ''}
<h1 id="titulo">${esc(title)}</h1>
</header>
${epi}
${texto}
${notes}
</section>`
  return { xhtml: page(title, body, 'bodymatter'), notes: sink.notes.length, heading: navTitle }
}

const CSS = `@charset "UTF-8";
html { -epub-hyphens: auto; hyphens: auto; }
body { margin: 0 5%; font-family: FONTE serif; line-height: 1.45; widows: 2; orphans: 2; }
p { margin: 0; text-indent: 1.4em; text-align: justify; }
p.sem-recuo, .abertura-cap + p { text-indent: 0; }
h1 { font-weight: normal; font-size: 1.8em; text-align: center; margin: 0.2em 0 1.6em; line-height: 1.2; }
h2 { font-weight: normal; font-style: italic; font-size: 1.1em; text-align: center; margin: 1.4em 0 0.8em; }
.abertura-cap { margin-top: 3em; page-break-before: always; break-before: page; }
.rotulo.versalete { font-variant: small-caps; }
.rotulo { text-indent: 0; text-align: center; letter-spacing: 0.3em; font-size: 0.8em; margin-bottom: 0.4em; }
.capitular { float: left; font-size: 3.4em; line-height: 0.85; margin: 0.06em 0.08em 0 0; color: COR; }
.cena { text-indent: 0; text-align: center; margin: 1em 0; letter-spacing: 0.4em; }
blockquote { margin: 1em 1.5em; font-size: 0.95em; }
blockquote p { text-indent: 0; }
sup { line-height: 0; font-size: 0.7em; }
a.noteref { text-decoration: none; }
.notas { margin-top: 2.5em; font-size: 0.88em; border-top: 1px solid currentColor; padding-top: 0.6em; }
.notas h2 { font-style: normal; font-size: 1em; text-align: left; margin: 0 0 0.6em; letter-spacing: 0.1em; text-transform: uppercase; }
.notas ol { margin: 0; padding-left: 1.6em; }
.notas p { text-indent: 0; text-align: left; }
figure.abertura { margin: 0 0 1em; text-align: center; page-break-after: always; break-after: page; }
figure.abertura img { max-width: 100%; max-height: 95vh; }
.preliminar { text-indent: 0; text-align: center; }
.rosto { margin-top: 20%; text-align: center; }
.rosto .autor { text-indent: 0; text-align: center; text-transform: uppercase; letter-spacing: 0.25em; font-size: 0.9em; }
.rosto h1 { font-size: 2.2em; margin: 0.8em 0 0.4em; }
.rosto .sub { text-indent: 0; text-align: center; font-style: italic; }
.rosto .editora { text-indent: 0; text-align: center; margin-top: 3em; letter-spacing: 0.12em; font-size: 0.85em; }
.creditos p { text-indent: 0; text-align: left; font-size: 0.85em; margin-bottom: 0.6em; }
.ficha { border: 1px solid currentColor; padding: 0.8em; margin: 1em 0; font-size: 0.8em; }
.ficha p { font-size: 1em; }
.dedicatoria, .epigrafe { margin: 30% 0 0 35%; font-style: italic; text-align: right; }
.dedicatoria p, .epigrafe p { text-indent: 0; text-align: right; }
.epigrafe .quem { font-style: normal; font-size: 0.9em; margin-top: 0.6em; }
.colofao { margin-top: 40%; text-align: center; font-style: italic; font-size: 0.9em; }
.colofao p { text-indent: 0; text-align: center; }
blockquote p + p { margin-top: 0.6em; }
.quebra-pagina { page-break-after: always; break-after: page; height: 0; margin: 0; }
figure.figura { margin: 1.4em 0; text-align: center; page-break-inside: avoid; break-inside: avoid; }
figure.figura img { max-width: 100%; max-height: 70vh; }
figure.figura figcaption, .legenda-solta { text-indent: 0; text-align: center; font-style: italic; font-size: 0.85em; margin-top: 0.5em; }
.epigrafe-cap { margin: 0 0 2em 35%; font-style: italic; font-size: 0.92em; }
.epigrafe-cap p { text-indent: 0; text-align: left; }
.epigrafe-cap .quem { font-style: normal; text-align: right; font-size: 0.9em; margin-top: 0.4em; }
.final .foto { text-align: center; margin: 0 0 1.4em; }
.final .foto img { max-width: 40%; }
nav#toc ol { list-style: none; padding: 0; }
nav#toc li { margin: 0.4em 0; }
nav#toc a { text-decoration: none; }
.parte { text-align: center; }
.abertura-parte { margin-top: 30%; page-break-before: always; break-before: page; }
.abertura-parte h1 { font-size: 2.1em; margin-bottom: 1em; }
.parte .texto-parte { margin: 2em 10% 0; font-style: italic; }
.parte .texto-parte p { text-indent: 0; text-align: center; }
.parte .epigrafe-cap { margin: 2em 15% 0; text-align: left; }
nav#toc ol ol { padding-left: 1.4em; }
nav#toc li.parte > a { font-style: italic; }
.capa { margin: 0; padding: 0; text-align: center; }
.capa img { max-width: 100%; max-height: 100vh; }
`

function uuidFrom(seed: string): string {
  const h = createHash('sha1').update(seed).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${h.slice(18, 20)}-${h.slice(20, 32)}`
}

interface SpineItem {
  id: string
  href: string
  title: string
  inToc: boolean
  /** 'parte' = abre um nível no sumário; 'filho' = capítulo dentro da parte anterior */
  nivel?: 'parte' | 'filho'
  linear?: boolean
  props?: string
}

interface NoToc {
  item: SpineItem
  filhos: SpineItem[]
}

/** Sumário em árvore: cada parte leva os capítulos que vêm depois dela (até a próxima parte). */
function tocArvore(items: SpineItem[]): NoToc[] {
  const out: NoToc[] = []
  let parte: NoToc | null = null
  for (const it of items) {
    if (it.nivel === 'filho' && parte) {
      parte.filhos.push(it)
      continue
    }
    const no: NoToc = { item: it, filhos: [] }
    out.push(no)
    parte = it.nivel === 'parte' ? no : null
  }
  return out
}

function navLi(n: NoToc): string {
  const a = `<a href="${n.item.href}">${esc(n.item.title)}</a>`
  if (n.item.nivel !== 'parte') return `<li>${a}</li>`
  const sub = n.filhos.length ? `\n<ol>\n${n.filhos.map((f) => `<li><a href="${f.href}">${esc(f.title)}</a></li>`).join('\n')}\n</ol>\n` : ''
  return `<li class="parte">${a}${sub}</li>`
}

/** navMap do toc.ncx (EPUB 2): partes com os capítulos aninhados; playOrder segue a leitura. */
function ncxPoints(arvore: NoToc[]): string {
  let ordem = 0
  const ponto = (s: SpineItem, filhos: () => string): string => {
    const k = (ordem += 1)
    return `<navPoint id="np${k}" playOrder="${k}"><navLabel><text>${esc(s.title)}</text></navLabel><content src="${s.href}"/>${filhos()}</navPoint>`
  }
  return arvore.map((n) => ponto(n.item, () => n.filhos.map((f) => ponto(f, () => '')).join(''))).join('\n')
}

export async function exportEpub(dir: string, resourcesDir?: string): Promise<EpubResult> {
  const project = await openProject(dir)
  const meta = project.meta
  const l = resolveLayout(meta.layout)
  const f = l.front
  const chapters = await Promise.all(project.chapters.map((c) => readChapter(dir, c.file)))
  const nums = numberChapters(chapters, l.reiniciarNumeracao)
  const emParte = dentroDeParte(chapters)
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`
  )
  const O = 'OEBPS/'
  const manifest: string[] = []
  const spine: SpineItem[] = []
  const add = (id: string, href: string, type: string, props?: string): void => {
    manifest.push(`<item id="${id}" href="${href}" media-type="${type}"${props ? ` properties="${props}"` : ''}/>`)
  }
  const xhtml = (item: SpineItem, content: string): void => {
    zip.file(O + item.href, content)
    add(item.id, item.href, 'application/xhtml+xml', item.props)
    spine.push(item)
  }

  // fonte do miolo embutida quando é uma fonte OFL que vem com o Folio (resources/fonts)
  const fonte = resourcesDir ? await bundledFont(resourcesDir, l.font) : null
  const fontFaces: string[] = []
  if (fonte) {
    fonte.files.forEach((f, i) => {
      const href = `fontes/${f.name}`
      zip.file(O + href, f.data)
      add(`fonte-${i + 1}`, href, 'font/ttf')
      fontFaces.push(`@font-face { font-family: "${l.font}"; font-style: ${f.italic ? 'italic' : 'normal'}; font-weight: ${f.weight}; src: url("${href}"); }`)
    })
  }
  zip.file(
    `${O}estilo.css`,
    CSS.replace('COR', l.dropCapColor).replace('FONTE', fonte ? `"${l.font}", ` : '').replace('@charset "UTF-8";', `@charset "UTF-8";\n${fontFaces.join('\n')}`)
  )
  add('css', 'estilo.css', 'text/css')

  // imagens: tipo de mídia pelo conteúdo real do arquivo (PNG ou JPEG), não pelo nome
  const imagem = async (id: string, base: string, path: string, props?: string): Promise<string | null> => {
    const data = await readFile(path)
    const kind = imageKind(data)
    if (!kind || kind === 'webp') return null
    const href = `imagens/${base}.${EXT[kind]}`
    zip.file(O + href, data)
    add(id, href, mediaType(kind), props)
    return href
  }
  const imgs: ImgSink = { map: new Map() }
  let figuras = 0
  const figura = async (name: string): Promise<void> => {
    if (imgs.map.has(name)) return
    const path = join(dir, 'assets', name)
    try {
      const href = await imagem(`fig-${imgs.map.size + 1}`, `fig-${name.replace(/\.[a-z]+$/, '')}`, path)
      if (href) {
        imgs.map.set(name, href)
        figuras += 1
      }
    } catch {
      /* arquivo sumiu: fica só a legenda */
    }
  }
  for (const c of chapters) for (const b of parseBody(c.body).blocks) if (b.t === 'figure' && b.src) await figura(b.src)

  // capa
  const capaPath = await capaFrentePath(dir)
  const capaHref = capaPath ? await imagem('capa-img', 'capa', capaPath, 'cover-image') : null
  const capa = Boolean(capaHref)
  if (capaHref) {
    xhtml(
      { id: 'capa', href: 'capa.xhtml', title: 'Capa', inToc: false },
      page('Capa', `<section class="capa" epub:type="cover" role="doc-cover"><img src="${capaHref}" alt="Capa: ${esc(meta.title)}"/></section>`, 'frontmatter')
    )
  }

  // rosto
  if (f.rosto || f.falsoRosto) {
    xhtml(
      { id: 'rosto', href: 'rosto.xhtml', title: 'Rosto', inToc: false },
      page(
        meta.title,
        `<section class="rosto" epub:type="titlepage">
${meta.author ? `<p class="autor">${esc(meta.author)}</p>` : ''}
<h1>${esc(meta.title)}</h1>
${f.subtitulo.trim() ? `<p class="sub">${esc(f.subtitulo.trim())}</p>` : ''}
${f.editora.trim() ? `<p class="editora">${esc(f.editora.trim())}</p>` : ''}
</section>`,
        'frontmatter'
      )
    )
  }

  // créditos
  if (f.creditos) {
    const year = f.ano.trim() || String(new Date().getFullYear())
    const rows = [
      `<p>© ${esc(year)} ${esc(meta.author || '')}<br/>Todos os direitos reservados.</p>`,
      f.edicao.trim() ? `<p>${esc(f.edicao.trim())}</p>` : '',
      f.creditosTexto.trim() ? `<p>${multiline(f.creditosTexto)}</p>` : '',
      f.ficha.trim() ? `<div class="ficha"><p><strong>Dados Internacionais de Catalogação na Publicação (CIP)</strong></p><p>${multiline(f.ficha)}</p></div>` : '',
      f.isbn.trim() ? `<p>ISBN ${esc(f.isbn.trim())}</p>` : '',
      [f.editora.trim(), f.cidade.trim()].filter(Boolean).length ? `<p>${esc([f.editora.trim(), f.cidade.trim()].filter(Boolean).join(' · '))}</p>` : ''
    ]
    xhtml(
      { id: 'creditos', href: 'creditos.xhtml', title: 'Créditos', inToc: false },
      page('Créditos', `<section class="creditos" epub:type="copyright-page">\n${rows.filter(Boolean).join('\n')}\n</section>`, 'frontmatter')
    )
  }
  if (f.dedicatoria && f.dedicatoriaTexto.trim()) {
    xhtml(
      { id: 'dedicatoria', href: 'dedicatoria.xhtml', title: 'Dedicatória', inToc: false },
      page('Dedicatória', `<section class="dedicatoria" epub:type="dedication" role="doc-dedication"><p>${multiline(f.dedicatoriaTexto)}</p></section>`, 'frontmatter')
    )
  }
  if (f.epigrafe && f.epigrafeTexto.trim()) {
    xhtml(
      { id: 'epigrafe', href: 'epigrafe.xhtml', title: 'Epígrafe', inToc: false },
      page(
        'Epígrafe',
        `<section class="epigrafe" epub:type="epigraph" role="doc-epigraph"><p>${multiline(f.epigrafeTexto)}</p>${f.epigrafeAutor.trim() ? `<p class="quem">— ${esc(f.epigrafeAutor.trim())}</p>` : ''}</section>`,
        'frontmatter'
      )
    )
  }

  // nav (posição do sumário no fluxo: depois das preliminares)
  const navIndex = spine.length

  // capítulos
  let notes = 0
  let arts = 0
  for (let i = 0; i < chapters.length; i += 1) {
    const c = chapters[i]
    if (!c) continue
    const artSrc = await aberturaPath(dir, c.file)
    let art: string | null = null
    if (artSrc) {
      art = await imagem(`abertura-${i + 1}`, `abertura-${i + 1}`, artSrc)
      if (art) arts += 1
    }
    const r = chapterXhtml(c, nums[i] ?? 0, i + 1, l, art, imgs)
    notes += r.notes
    const nivel = c.kind === 'parte' ? 'parte' : emParte[i] ? 'filho' : undefined
    xhtml({ id: `cap-${i + 1}`, href: `cap-${String(i + 1).padStart(3, '0')}.xhtml`, title: r.heading, inToc: true, ...(nivel ? { nivel } : {}) }, r.xhtml)
  }

  // páginas finais: posfácio, agradecimentos, sobre o autor (entram no sumário)
  const finais: Array<{ id: string; titulo: string; tipo: string; role: string; md: string; foto?: string | null }> = []
  if (f.posfacio && f.posfacioTexto.trim()) finais.push({ id: 'posfacio', titulo: 'Posfácio', tipo: 'afterword', role: 'doc-afterword', md: f.posfacioTexto })
  if (f.agradecimentos && f.agradecimentosTexto.trim())
    finais.push({ id: 'agradecimentos', titulo: 'Agradecimentos', tipo: 'acknowledgments', role: 'doc-acknowledgments', md: f.agradecimentosTexto })
  if (f.sobreAutor && (f.sobreAutorTexto.trim() || f.sobreAutorFoto)) {
    let foto: string | null = null
    const nome = assetName(f.sobreAutorFoto)
    if (nome) {
      try {
        foto = await imagem('autor-foto', 'autor-foto', join(dir, 'assets', nome))
      } catch {
        foto = null
      }
    }
    finais.push({ id: 'sobre-autor', titulo: 'Sobre o autor', tipo: 'contributors', role: '', md: f.sobreAutorTexto, foto })
  }
  for (const fin of finais) {
    const blocks = parseBody(fin.md).blocks
    for (const b of blocks) if (b.t === 'figure' && b.src) await figura(b.src)
    const sink: NoteSink = { notes: [], prefix: `${fin.id}-` }
    const corpo = blocksXhtml(blocks, sink, imgs, SCENE_TEXT[l.sceneOrnament] ?? '⁂', false)
    const foto = fin.foto ? `<p class="foto"><img src="${fin.foto}" alt="Foto de ${esc(meta.author || 'quem escreveu')}"/></p>` : ''
    xhtml(
      { id: fin.id, href: `${fin.id}.xhtml`, title: fin.titulo, inToc: true },
      page(
        fin.titulo,
        `<section class="final" epub:type="${fin.tipo}"${fin.role ? ` role="${fin.role}"` : ''} aria-labelledby="titulo">
<header class="abertura-cap"><h1 id="titulo">${esc(fin.titulo)}</h1></header>
${foto}
${corpo}
${notesSection(sink)}
</section>`,
        'backmatter'
      )
    )
  }

  if (f.colofao) {
    const text = f.colofaoTexto.trim() || `Este livro foi composto em ${l.font} e diagramado no Folio.`
    xhtml(
      { id: 'colofao', href: 'colofao.xhtml', title: 'Colofão', inToc: false },
      page('Colofão', `<section class="colofao" epub:type="colophon" role="doc-colophon"><p>${multiline(text)}</p></section>`, 'backmatter')
    )
  }

  const tocItems = spine.filter((s) => s.inToc)
  const firstChapter = tocItems[0]
  const arvore = tocArvore(tocItems)
  const navBody = `<nav epub:type="toc" id="toc" role="doc-toc">
<h1>Sumário</h1>
<ol>
${arvore.map((n) => navLi(n)).join('\n')}
</ol>
</nav>
<nav epub:type="landmarks" id="landmarks" hidden="">
<h2>Marcos</h2>
<ol>
${capa ? '<li><a epub:type="cover" href="capa.xhtml">Capa</a></li>' : ''}
<li><a epub:type="toc" href="nav.xhtml">Sumário</a></li>
${firstChapter ? `<li><a epub:type="bodymatter" href="${firstChapter.href}">Começo</a></li>` : ''}
</ol>
</nav>`
  zip.file(`${O}nav.xhtml`, page('Sumário', navBody, 'frontmatter'))
  add('nav', 'nav.xhtml', 'application/xhtml+xml', 'nav')
  spine.splice(navIndex, 0, { id: 'nav', href: 'nav.xhtml', title: 'Sumário', inToc: false, linear: f.sumario })

  // identificador e metadados
  const ean = f.isbn.trim() ? isbnToEan(f.isbn) : null
  const identifier = ean ? `urn:isbn:${ean}` : `urn:uuid:${uuidFrom(`${meta.title}|${meta.author}|${dir}`)}`
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const date = /^\d{4}$/.test(f.ano.trim()) ? f.ano.trim() : modified.slice(0, 10)

  zip.file(
    `${O}toc.ncx`,
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="pt-BR">
<head><meta name="dtb:uid" content="${esc(identifier)}"/><meta name="dtb:depth" content="${arvore.some((n) => n.filhos.length) ? 2 : 1}"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>${esc(meta.title)}</text></docTitle>
<navMap>
${ncxPoints(arvore)}
</navMap>
</ncx>
`
  )
  add('ncx', 'toc.ncx', 'application/x-dtbncx+xml')

  zip.file(
    `${O}content.opf`,
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="pt-BR">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${esc(identifier)}</dc:identifier>
<dc:title>${esc(meta.title)}</dc:title>
${meta.author ? `<dc:creator id="autor">${esc(meta.author)}</dc:creator>\n<meta refines="#autor" property="role" scheme="marc:relators">aut</meta>` : ''}
<dc:language>pt-BR</dc:language>
<dc:date>${date}</dc:date>
${f.editora.trim() ? `<dc:publisher>${esc(f.editora.trim())}</dc:publisher>` : ''}
${l.cover.sinopse.trim() ? `<dc:description>${esc(l.cover.sinopse.trim())}</dc:description>` : ''}
<dc:rights>© ${esc(f.ano.trim() || date.slice(0, 4))} ${esc(meta.author || '')}</dc:rights>
<meta property="dcterms:modified">${modified}</meta>
<meta property="schema:accessMode">textual</meta>
${arts || figuras || capa ? '<meta property="schema:accessMode">visual</meta>\n' : ''}<meta property="schema:accessModeSufficient">textual</meta>
<meta property="schema:accessibilityFeature">structuralNavigation</meta>
<meta property="schema:accessibilityFeature">tableOfContents</meta>
<meta property="schema:accessibilityFeature">readingOrder</meta>
${arts || figuras || capa ? '<meta property="schema:accessibilityFeature">alternativeText</meta>\n' : ''}<meta property="schema:accessibilityHazard">none</meta>
<meta property="schema:accessibilitySummary">${esc(acessibilidade(notes, arts + figuras + (capa ? 1 : 0)))}</meta>
${capa ? '<meta name="cover" content="capa-img"/>' : ''}
</metadata>
<manifest>
${manifest.join('\n')}
</manifest>
<spine toc="ncx">
${spine.map((s) => `<itemref idref="${s.id}"${s.linear === false ? ' linear="no"' : ''}/>`).join('\n')}
</spine>
</package>
`
  )

  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 }, mimeType: 'application/epub+zip' })
  const outDir = join(dir, 'export')
  await mkdir(outDir, { recursive: true })
  const epubPath = join(outDir, `${slugify(meta.title)}.epub`)
  await writeFile(epubPath, buf)
  return { epubPath, capitulos: chapters.filter((c) => c.kind !== 'parte').length, notas: notes, capa, aberturas: arts, figuras, fonte: fonte ? l.font : null, bytes: buf.length }
}
