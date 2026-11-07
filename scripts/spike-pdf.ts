// Teste de ponta a ponta do pipeline de diagramação, sem abrir o Electron:
// cria um livro de exemplo, exporta o miolo com sangria e marcas de corte e
// imprime páginas e lombada.  Uso: npm run spike:pdf
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { addChapter, createProject, openProject } from '../src/main/project'
import { exportPrintPdf } from '../src/main/layout/export'

const OUT = join(process.cwd(), 'spike-output')

const PARAGRAFOS = [
  'A torre cheirava a ferrugem e cera velha. Iara subiu os últimos degraus devagar, contando-os como quem conta dívidas, e parou diante da porta que ninguém abria havia onze anos.',
  'Lá dentro, o sino maior pendia sem badalo. Alguém o tinha arrancado com *cuidado* — não com raiva, pensou ela, mas com zelo, como se o metal ainda pudesse sentir.',
  '— Você sabia — disse, sem se virar. — Sabia desde o começo.',
  'Tomé não respondeu. Encostado à pilastra, observava a cidade lá embaixo, os telhados úmidos de Brumagem brilhando sob a **lua de sal**. Caracteres que quebrariam Typst: #tag $5 [nota] @menção _sub_ <x> \\barra.'
]

async function main(): Promise<void> {
  await rm(OUT, { recursive: true, force: true })
  const { mkdir } = await import('node:fs/promises')
  await mkdir(OUT, { recursive: true })
  let p = await createProject(OUT, 'A Cidade dos Sinos Mudos', 'R. Sereno')
  const texto = Array.from({ length: 30 }, (_, i) => PARAGRAFOS[i % PARAGRAFOS.length]).join('\n\n')
  await writeFile(
    join(p.dir, 'manuscrito', '001-capitulo-um.md'),
    `---\ntitulo: O último sino\ntipo: capitulo\n---\n\n${texto}\n\n***\n\n${texto}\n`
  )
  p = await addChapter(p.dir, 'O que Tomé sabia')
  await writeFile(join(p.dir, 'manuscrito', p.chapters.at(-1)!.file), `---\ntitulo: O que Tomé sabia\ntipo: capitulo\n---\n\n${texto}\n`)
  p = await openProject(p.dir)

  const r = await exportPrintPdf(p.dir, join(process.cwd(), 'resources'))
  console.log(`PDF: ${r.pdfPath}`)
  console.log(`Páginas: ${r.pages} · lombada: ${r.spineMm} mm (${p.meta.layout.paper.name})`)
  console.log(`Fonte Typst gerada: ${join(p.dir, '.build', 'livro.typ')}`)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
