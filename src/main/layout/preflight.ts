import { join } from 'node:path'
import { spineWidthMm } from '../../shared/types'
import { aberturaPath, capaFrentePath, coverDpi, imageSize, widthDpi } from './assets'
import { isbnToEan } from './cover'
import { prepareBook, rememberPageCount } from './export'
import { assetName, parseBody } from './markdown'
import { chapterOpening, resolveLayout } from './settings'
import { compileTypst } from './typst'

export type Nivel = 'ok' | 'aviso' | 'erro'

export interface ItemChecagem {
  nivel: Nivel
  texto: string
}

const DPI_MIN = 300
const DPI_RUIM = 150

function br(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

/** Checagem antes de mandar para a gráfica (D9). Compila o miolo para ler os avisos do Typst. */
export async function preflight(dir: string, resourcesDir: string): Promise<ItemChecagem[]> {
  const out: ItemChecagem[] = []
  const push = (nivel: Nivel, texto: string): void => void out.push({ nivel, texto })
  const b = await prepareBook(dir, resourcesDir)
  const l = resolveLayout(b.project.meta.layout)

  // 1. compilação + fontes
  let pages = 0
  try {
    const r = await compileTypst({
      typst: b.typst,
      buildDir: b.buildDir,
      source: b.source,
      outPdf: join(b.buildDir, 'checagem.pdf'),
      fontDirs: b.fontDirs,
      inputName: 'checagem.typ'
    })
    pages = r.pages
    await rememberPageCount(dir, pages, b.fingerprint)
    const missing = new Set<string>()
    const other: string[] = []
    for (const m of r.warnings.matchAll(/warning: (.+)/g)) {
      const msg = (m[1] ?? '').trim()
      const font = msg.match(/unknown font family: (.+)$/)
      if (font?.[1]) missing.add(font[1].trim())
      else other.push(msg)
    }
    if (missing.size) {
      for (const f of missing) push('erro', `Fonte "${f}" não encontrada: o Typst trocou por outra. Rode \`node scripts/fetch-fonts.mjs\` ou instale a fonte.`)
    } else {
      push('ok', `Fonte do miolo "${l.font}" encontrada e embutida no PDF`)
    }
    for (const w of [...new Set(other)].slice(0, 5)) push('aviso', `Typst: ${w}`)
  } catch (e) {
    push('erro', e instanceof Error ? e.message : String(e))
  }

  // 2. sangria e marcas
  if (l.bleedMm >= 3) push('ok', `Sangria de ${br(l.bleedMm)} mm em todas as páginas`)
  else push('erro', `Sangria de ${br(l.bleedMm)} mm: gráficas pedem de 3 a 5 mm`)
  if (l.cropMarks) push('ok', 'Marcas de corte presentes, fora da área de sangria')
  else push('aviso', 'Marcas de corte desligadas: confirme se a gráfica dispensa')

  // 3. imagens
  const area = { w: l.trim.widthMm + 2 * l.bleedMm, h: l.trim.heightMm + 2 * l.bleedMm }
  let imgs = 0
  for (const c of b.project.chapters) {
    if (chapterOpening(l, c.file) !== 'arte') continue
    const p = await aberturaPath(dir, c.file)
    if (!p) {
      push('aviso', `"${c.title}": abertura com arte, mas sem imagem gerada (usa a ornamentada)`)
      continue
    }
    imgs += 1
    const size = await imageSize(p)
    if (!size) {
      push('erro', `Arte de "${c.title}" não é um PNG ou JPEG legível`)
      continue
    }
    const dpi = coverDpi(size, area.w, area.h)
    if (dpi < DPI_RUIM) push('erro', `Arte de "${c.title}": ${dpi} dpi no tamanho de impressão (${size.width}×${size.height} px). Mínimo ${DPI_MIN}.`)
    else if (dpi < DPI_MIN) push('aviso', `Arte de "${c.title}": ${dpi} dpi no tamanho de impressão (${size.width}×${size.height} px), abaixo de ${DPI_MIN}`)
    else push('ok', `Arte de "${c.title}": ${dpi} dpi`)
  }
  const capa = await capaFrentePath(dir)
  if (capa) {
    imgs += 1
    const size = await imageSize(capa)
    if (!size) push('erro', 'Capa (capa-frente.png) não é um PNG ou JPEG legível')
    else {
      const dpi = coverDpi(size, l.trim.widthMm + l.bleedMm, l.trim.heightMm + 2 * l.bleedMm)
      if (dpi < DPI_MIN) push(dpi < DPI_RUIM ? 'erro' : 'aviso', `Imagem da capa: ${dpi} dpi no tamanho de impressão (${size.width}×${size.height} px), abaixo de ${DPI_MIN}`)
      else push('ok', `Imagem da capa: ${dpi} dpi`)
    }
  }
  // imagens no texto: impressas na largura da mancha (ou menos, se forem altas)
  const textW = l.trim.widthMm - l.margins.insideMm - l.margins.outsideMm
  const textH = l.trim.heightMm - l.margins.topMm - l.margins.bottomMm
  const dpiNoTexto = async (nome: string, rotulo: string, largura?: number): Promise<void> => {
    imgs += 1
    const size = await imageSize(join(dir, 'assets', nome))
    if (!size) {
      push('erro', `${rotulo}: "${nome}" não existe em assets/ ou não é PNG/JPEG`)
      return
    }
    const wMm = largura ?? Math.min(textW, (textH * 0.72 * size.width) / size.height)
    const dpi = widthDpi(size, wMm)
    if (dpi < DPI_MIN) push(dpi < DPI_RUIM ? 'erro' : 'aviso', `${rotulo}: ${dpi} dpi no tamanho de impressão (${size.width}×${size.height} px), abaixo de ${DPI_MIN}`)
    else push('ok', `${rotulo}: ${dpi} dpi`)
  }
  for (const c of b.chapters) {
    for (const x of parseBody(c.body).blocks) {
      if (x.t !== 'figure') continue
      if (!x.src) continue // caminho inválido: já aparece nos problemas do texto
      await dpiNoTexto(x.src, `Imagem "${x.src}" em "${c.title}"`)
    }
  }
  const foto = l.front.sobreAutor ? assetName(l.front.sobreAutorFoto) : null
  if (foto) await dpiNoTexto(foto, 'Foto do autor', textW * 0.38)
  if (!imgs) push('ok', 'Nenhuma imagem no miolo para checar resolução')

  // 4. texto: capítulos vazios e notas
  let notes = 0
  const empty: string[] = []
  for (const c of b.chapters) {
    const { blocks, problems } = parseBody(c.body)
    if (!blocks.some((x) => x.t !== 'scene')) empty.push(c.title)
    for (const p of problems) push('erro', `"${c.title}": ${p}`)
    notes += (c.body.match(/\^\[/g) ?? []).length
  }
  if (empty.length) push('aviso', `Capítulos vazios: ${empty.map((t) => `"${t}"`).join(', ')}`)
  else push('ok', 'Nenhum capítulo vazio')
  if (notes && !out.some((i) => i.nivel === 'erro' && i.texto.includes('Nota'))) push('ok', `${notes} nota(s) de rodapé bem formadas`)
  if (notes && l.avoidWidows) {
    push('aviso', 'Com viúvas/órfãs evitadas, o Typst 0.15 às vezes deixa a nota na página anterior à chamada quando empurra linhas. Confira as páginas com nota na prévia.')
  }

  // 5. páginas e lombada
  if (pages) {
    if (pages % 4 === 0) push('ok', `${pages} páginas (múltiplo de 4)`)
    else push('aviso', `${pages} páginas: muitas gráficas pedem múltiplo de 4 (faltam ${4 - (pages % 4)})`)
    const spine = spineWidthMm(pages, l.paper.caliperMm)
    if (spine < 3) push('aviso', `Lombada de ${br(spine)} mm: fina demais para texto na capa`)
    else push('ok', `Lombada de ${br(spine)} mm (${Math.ceil(pages / 2)} folhas × ${br(l.paper.caliperMm)} mm)`)
    if (pages > 300 && l.margins.insideMm < 18) push('aviso', `Livro grosso (${pages} págs.) com margem interna de ${br(l.margins.insideMm)} mm: o texto pode sumir na dobra`)
  }

  // 6. páginas iniciais
  const f = l.front
  if (f.isbn.trim() && !isbnToEan(f.isbn)) push('erro', `ISBN "${f.isbn}" inválido (dígito verificador não confere)`)
  if (f.dedicatoria && !f.dedicatoriaTexto.trim()) push('aviso', 'Dedicatória ligada, mas sem texto (página omitida)')
  if (f.epigrafe && !f.epigrafeTexto.trim()) push('aviso', 'Epígrafe ligada, mas sem texto (página omitida)')

  push('aviso', 'O PDF sai em RGB. Se a gráfica exigir CMYK ou PDF/X, converta antes de enviar.')

  const order: Record<Nivel, number> = { erro: 0, aviso: 1, ok: 2 }
  return out.sort((a, c) => order[a.nivel] - order[c.nivel])
}
