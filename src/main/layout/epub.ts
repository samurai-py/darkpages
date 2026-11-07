import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import JSZip from 'jszip'
import { openProject, readChapter, slugify } from '../project'
import type { ChapterContent } from '../../shared/types'
import { aberturaPath, capaFrentePath } from './assets'
import { isbnToEan } from './cover'
import { chapterLabelText, numberChapters, showsTitle } from './labels'
import { parseBody, type Inline } from './markdown'
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
  bytes: number
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

interface NoteSink {
  notes: string[]
  /** prefixo único por capítulo, para ids */
  prefix: string
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
          const k = sink.notes.length + 1
          // a nota é montada antes de entrar na lista: notas aninhadas viram texto
          const body = inlineXhtml(n.c, { notes: [], prefix: sink.prefix })
          sink.notes.push(body)
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

function chapterXhtml(c: ChapterContent, n: number, idx: number, l: FullLayout, art: string | null): { xhtml: string; notes: number; heading: string } {
  const label = chapterLabelText(c.kind, n, l.chapterLabel)
  const title = showsTitle(c, label) ? c.title.trim() : (label ?? c.title.trim())
  const prefix = `c${idx}-`
  const sink: NoteSink = { notes: [], prefix }
  const { blocks } = parseBody(c.body)
  const drop = chapterDropCap(l, c.file) !== 'nenhuma'
  const scene = SCENE_TEXT[l.sceneOrnament] ?? '⁂'
  let first = true
  let afterBreak = true
  const parts: string[] = []
  for (const b of blocks) {
    if (b.t === 'scene') {
      parts.push(`<p class="cena" role="separator" aria-label="Quebra de cena">${esc(scene) || '&#160;'}</p>`)
      afterBreak = true
      continue
    }
    if (b.t === 'quote') {
      parts.push(`<blockquote><p>${inlineXhtml(b.c, sink)}</p></blockquote>`)
      afterBreak = false
      continue
    }
    if (b.t === 'sub') {
      parts.push(`<h2>${inlineXhtml(b.c, sink)}</h2>`)
      afterBreak = true
      continue
    }
    let html = inlineXhtml(b.c, sink)
    if (first && drop) {
      // primeira letra (com aspas de abertura) em capitular, se o parágrafo começar com letra
      const m = html.match(/^((?:&quot;|&#39;|[“«‘(])*)(\p{L}|\p{N})/u)
      if (m) html = `<span class="capitular">${m[0]}</span>${html.slice(m[0].length)}`
    }
    parts.push(`<p${afterBreak ? ' class="sem-recuo"' : ''}>${html}</p>`)
    first = false
    afterBreak = false
  }
  const notes = sink.notes.length
    ? `<section class="notas" epub:type="endnotes" role="doc-endnotes">
<h2>Notas</h2>
<ol>
${sink.notes.map((t, i) => `<li id="${prefix}n${i + 1}" epub:type="endnote"><p>${t} <a href="#${prefix}r${i + 1}" role="doc-backlink" title="Voltar ao texto">↩</a></p></li>`).join('\n')}
</ol>
</section>`
    : ''
  const type = c.kind === 'prologo' ? 'prologue' : c.kind === 'epilogo' ? 'epilogue' : 'chapter'
  const role = c.kind === 'prologo' ? 'doc-prologue' : c.kind === 'epilogo' ? 'doc-epilogue' : 'doc-chapter'
  const body = `<section epub:type="${type}" role="${role}" aria-labelledby="titulo">
${art ? `<figure class="abertura"><img src="${art}" alt="Ilustração de abertura: ${esc(title)}"/></figure>` : ''}
<header class="abertura-cap">
${label && showsTitle(c, label) ? `<p class="rotulo">${esc(label)}</p>` : ''}
<h1 id="titulo">${esc(title)}</h1>
</header>
${parts.join('\n')}
${notes}
</section>`
  return { xhtml: page(title, body, 'bodymatter'), notes: sink.notes.length, heading: title }
}

const CSS = `@charset "UTF-8";
html { -epub-hyphens: auto; hyphens: auto; }
body { margin: 0 5%; font-family: serif; line-height: 1.45; widows: 2; orphans: 2; }
p { margin: 0; text-indent: 1.4em; text-align: justify; }
p.sem-recuo, .abertura-cap + p { text-indent: 0; }
h1 { font-weight: normal; font-size: 1.8em; text-align: center; margin: 0.2em 0 1.6em; line-height: 1.2; }
h2 { font-weight: normal; font-style: italic; font-size: 1.1em; text-align: center; margin: 1.4em 0 0.8em; }
.abertura-cap { margin-top: 3em; page-break-before: always; break-before: page; }
.rotulo { text-indent: 0; text-align: center; text-transform: uppercase; letter-spacing: 0.3em; font-size: 0.8em; margin-bottom: 0.4em; }
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
nav#toc ol { list-style: none; padding: 0; }
nav#toc li { margin: 0.4em 0; }
nav#toc a { text-decoration: none; }
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
  linear?: boolean
  props?: string
}

export async function exportEpub(dir: string): Promise<EpubResult> {
  const project = await openProject(dir)
  const meta = project.meta
  const l = resolveLayout(meta.layout)
  const f = l.front
  const chapters = await Promise.all(project.chapters.map((c) => readChapter(dir, c.file)))
  const nums = numberChapters(chapters)
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

  zip.file(`${O}estilo.css`, CSS.replace('COR', l.dropCapColor))
  add('css', 'estilo.css', 'text/css')

  // capa
  const capa = await capaFrentePath(dir)
  if (capa) {
    zip.file(`${O}imagens/capa.png`, await readFile(capa))
    add('capa-img', 'imagens/capa.png', 'image/png', 'cover-image')
    xhtml(
      { id: 'capa', href: 'capa.xhtml', title: 'Capa', inToc: false },
      page('Capa', `<section class="capa" epub:type="cover" role="doc-cover"><img src="imagens/capa.png" alt="Capa: ${esc(meta.title)}"/></section>`, 'frontmatter')
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
      const name = `imagens/abertura-${i + 1}.png`
      zip.file(O + name, await readFile(artSrc))
      add(`abertura-${i + 1}`, name, 'image/png')
      art = name
      arts += 1
    }
    const r = chapterXhtml(c, nums[i] ?? 0, i + 1, l, art)
    notes += r.notes
    xhtml({ id: `cap-${i + 1}`, href: `cap-${String(i + 1).padStart(3, '0')}.xhtml`, title: r.heading, inToc: true }, r.xhtml)
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
  const navBody = `<nav epub:type="toc" id="toc" role="doc-toc">
<h1>Sumário</h1>
<ol>
${tocItems.map((s) => `<li><a href="${s.href}">${esc(s.title)}</a></li>`).join('\n')}
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
<head><meta name="dtb:uid" content="${esc(identifier)}"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>${esc(meta.title)}</text></docTitle>
<navMap>
${tocItems.map((s, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${esc(s.title)}</text></navLabel><content src="${s.href}"/></navPoint>`).join('\n')}
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
  return { epubPath, capitulos: chapters.length, notas: notes, capa: Boolean(capa), aberturas: arts, bytes: buf.length }
}
