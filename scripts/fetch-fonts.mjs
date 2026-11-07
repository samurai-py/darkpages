// Baixa as fontes do miolo (todas OFL) do repositório oficial google/fonts
// para resources/fonts/<família>/. Lista cada pasta pela API do GitHub e
// baixa os .ttf e a licença OFL.txt — assim segue funcionando quando o
// repositório troca arquivos estáticos por variáveis (ex.: EBGaramond[wght].ttf).
// Uso: node scripts/fetch-fonts.mjs [--force]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const FAMILIES = [
  { dir: 'ebgaramond', name: 'EB Garamond' },
  { dir: 'cormorantgaramond', name: 'Cormorant Garamond' },
  { dir: 'crimsonpro', name: 'Crimson Pro' },
  { dir: 'librebaskerville', name: 'Libre Baskerville' },
  { dir: 'spectral', name: 'Spectral' },
  { dir: 'alegreya', name: 'Alegreya' }
]

/** Spectral só tem estáticos; basta o necessário para miolo (regular, itálico, negritos). */
const SPECTRAL_KEEP = /^Spectral-(Regular|Italic|Medium|MediumItalic|SemiBold|SemiBoldItalic|Bold|BoldItalic)\.ttf$/

const API = 'https://api.github.com/repos/google/fonts/contents/ofl'
const RAW = 'https://raw.githubusercontent.com/google/fonts/main/ofl'
const force = process.argv.includes('--force')
const root = join(process.cwd(), 'resources', 'fonts')

async function get(url, as = 'json') {
  const headers = { 'user-agent': 'folio-fetch-fonts' }
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const res = await fetch(url, { headers, redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`)
  return as === 'json' ? res.json() : Buffer.from(await res.arrayBuffer())
}

let failed = 0
for (const fam of FAMILIES) {
  try {
    const listing = await get(`${API}/${fam.dir}`)
    if (!Array.isArray(listing)) throw new Error('resposta inesperada da API do GitHub')
    const files = listing
      .map((f) => f.name)
      .filter((n) => n === 'OFL.txt' || (n.endsWith('.ttf') && (fam.dir !== 'spectral' || SPECTRAL_KEEP.test(n))))
    if (!files.some((n) => n.endsWith('.ttf'))) throw new Error('nenhum .ttf na pasta')
    const dest = join(root, fam.dir)
    mkdirSync(dest, { recursive: true })
    for (const name of files) {
      const out = join(dest, name)
      if (!force && existsSync(out)) continue
      writeFileSync(out, await get(`${RAW}/${fam.dir}/${encodeURIComponent(name)}`, 'bin'))
    }
    console.log(`✓ ${fam.name}: ${files.filter((n) => n.endsWith('.ttf')).join(', ')}`)
  } catch (e) {
    failed += 1
    console.error(`✗ ${fam.name}: ${e instanceof Error ? e.message : e}`)
  }
}

console.log(`Fontes em ${root}`)
if (failed) process.exit(1)
