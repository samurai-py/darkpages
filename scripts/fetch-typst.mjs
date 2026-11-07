// Baixa o binário oficial do Typst (release mais recente do GitHub) para resources/bin.
// Uso: npm run fetch:typst
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TARGETS = {
  'linux-x64': 'typst-x86_64-unknown-linux-musl.tar.xz',
  'linux-arm64': 'typst-aarch64-unknown-linux-musl.tar.xz',
  'darwin-arm64': 'typst-aarch64-apple-darwin.tar.xz',
  'darwin-x64': 'typst-x86_64-apple-darwin.tar.xz',
  'win32-x64': 'typst-x86_64-pc-windows-msvc.zip'
}

const key = `${process.platform}-${process.arch}`
const asset = TARGETS[key]
if (!asset) {
  console.error(`Plataforma sem binário mapeado: ${key}`)
  process.exit(1)
}

const url = `https://github.com/typst/typst/releases/latest/download/${asset}`
const binDir = join(process.cwd(), 'resources', 'bin')
mkdirSync(binDir, { recursive: true })
const work = mkdtempSync(join(tmpdir(), 'folio-typst-'))

console.log(`Baixando ${url}`)
const res = await fetch(url, { redirect: 'follow' })
if (!res.ok) {
  console.error(`Falha no download: HTTP ${res.status}`)
  process.exit(1)
}
const archive = join(work, asset)
writeFileSync(archive, Buffer.from(await res.arrayBuffer()))

if (asset.endsWith('.zip')) execFileSync('tar', ['-xf', archive, '-C', work])
else execFileSync('tar', ['-xJf', archive, '-C', work])

const exe = process.platform === 'win32' ? 'typst.exe' : 'typst'
const folder = readdirSync(work, { withFileTypes: true }).find((d) => d.isDirectory())
if (!folder) {
  console.error('Arquivo baixado não tem a pasta esperada')
  process.exit(1)
}
const dest = join(binDir, exe)
copyFileSync(join(work, folder.name, exe), dest)
chmodSync(dest, 0o755)
rmSync(work, { recursive: true, force: true })

console.log(`Typst instalado em ${dest}`)
console.log(execFileSync(dest, ['--version']).toString().trim())
