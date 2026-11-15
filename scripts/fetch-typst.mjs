// Baixa o binário oficial do Typst (versão FIXA, com SHA-256 conferido) para resources/bin.
// Para atualizar: troque VERSAO e os hashes (gh api repos/typst/typst/releases/tags/<versão> → assets[].digest).
// Uso: npm run fetch:typst
import { createHash } from 'node:crypto'
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

const VERSAO = 'v0.15.1'
const SHA256 = {
  'typst-x86_64-unknown-linux-musl.tar.xz': 'a6d077d0a95eed5a2eba715b2dae06be954f624ccbf85758a03f389ded33118c',
  'typst-aarch64-unknown-linux-musl.tar.xz': '5aa8d74a3d906e60ea12a66ac2f37f8eef1b14cbad7182a745e393a10c23dcee',
  'typst-aarch64-apple-darwin.tar.xz': '48f62ed034aa3a7978309579ac6ca00045e2ef0da73114e8af27cfd8e74dc05a',
  'typst-x86_64-apple-darwin.tar.xz': '7f9fdd9584866245de9a79e0add8f9236fae6f40a8a45e2c4771ccc14db4e0fa',
  'typst-x86_64-pc-windows-msvc.zip': '19ce3551153c2fe7ee9fa2f95208310c8f4d3209fedb699e0333faf8913f6736'
}

const key = `${process.platform}-${process.arch}`
const asset = TARGETS[key]
if (!asset) {
  console.error(`Plataforma sem binário mapeado: ${key}`)
  process.exit(1)
}

const url = `https://github.com/typst/typst/releases/download/${VERSAO}/${asset}`
const binDir = join(process.cwd(), 'resources', 'bin')
mkdirSync(binDir, { recursive: true })
const work = mkdtempSync(join(tmpdir(), 'folio-typst-'))

console.log(`Baixando ${url}`)
const res = await fetch(url, { redirect: 'follow' })
if (!res.ok) {
  console.error(`Falha no download: HTTP ${res.status}`)
  process.exit(1)
}
const bytes = Buffer.from(await res.arrayBuffer())
const hash = createHash('sha256').update(bytes).digest('hex')
if (hash !== SHA256[asset]) {
  console.error(`SHA-256 do ${asset} não confere (esperado ${SHA256[asset]}, veio ${hash}). Nada foi instalado.`)
  process.exit(1)
}
const archive = join(work, asset)
writeFileSync(archive, bytes)

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
