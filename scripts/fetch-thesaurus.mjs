// Baixa o dicionário de sinônimos pt-BR do LibreOffice (formato MyThes) do
// repositório oficial LibreOffice/dictionaries para resources/thesaurus/ e
// gera o índice th_pt_BR.idx (o repositório só traz o .dat; o .idx é gerado
// na hora do empacotamento, como faz o th_gen_idx.pl do MyThes).
//
// Licença: o pacote pt_BR (projeto VERO) é LGPLv3 / MPL (README_en.txt) e o
// dicionário de sinônimos vem com a licença estilo BSD do MyThes
// (license-thes.readme). Os dois arquivos ficam junto do .dat. Nada disso vai
// para o git (resources/thesaurus/ está no .gitignore).
//
// Uso: node scripts/fetch-thesaurus.mjs [--force]
//      FOLIO_TESAURO_REF=<commit ou branch> muda a versão (padrão: master)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const REF = process.env.FOLIO_TESAURO_REF || 'master'
const RAW = `https://raw.githubusercontent.com/LibreOffice/dictionaries/${encodeURIComponent(REF)}/pt_BR`
const ARQUIVOS = ['th_pt_BR.dat', 'license-thes.readme', 'README_en.txt', 'thes_data_layout_pt_BR.txt']
const force = process.argv.includes('--force')
const root = join(process.cwd(), 'resources', 'thesaurus')

async function baixar(nome) {
  const res = await fetch(`${RAW}/${nome}`, { headers: { 'user-agent': 'folio-fetch-thesaurus' }, redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${RAW}/${nome}`)
  return Buffer.from(await res.arrayBuffer())
}

/** Índice MyThes: linha 1 = codificação, linha 2 = nº de entradas, depois "entrada|byte_offset" em ordem. */
function gerarIndice(dat) {
  const nl = dat.indexOf(0x0a)
  const cod = dat.subarray(0, nl).toString('latin1').trim()
  const decod = /utf-?8/i.test(cod) ? 'utf8' : 'latin1'
  const entradas = []
  let i = nl + 1
  while (i < dat.length) {
    let fim = dat.indexOf(0x0a, i)
    if (fim < 0) fim = dat.length
    const linha = dat.subarray(i, fim).toString(decod)
    const barra = linha.lastIndexOf('|')
    if (barra > 0) {
      const n = Number(linha.slice(barra + 1))
      entradas.push([linha.slice(0, barra), i])
      // pula as n linhas de sentidos desta entrada
      let j = fim + 1
      for (let k = 0; k < n && j < dat.length; k++) {
        const f = dat.indexOf(0x0a, j)
        j = f < 0 ? dat.length : f + 1
      }
      i = j
      continue
    }
    i = fim + 1
  }
  entradas.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  return `${cod}\n${entradas.length}\n${entradas.map(([e, o]) => `${e}|${o}`).join('\n')}\n`
}

try {
  mkdirSync(root, { recursive: true })
  for (const nome of ARQUIVOS) {
    const out = join(root, nome)
    if (!force && existsSync(out)) continue
    writeFileSync(out, await baixar(nome))
    console.log(`✓ ${nome}`)
  }
  const idx = join(root, 'th_pt_BR.idx')
  if (force || !existsSync(idx)) {
    writeFileSync(idx, gerarIndice(readFileSync(join(root, 'th_pt_BR.dat'))))
    console.log('✓ th_pt_BR.idx (índice gerado)')
  }
  console.log(`Sinônimos em ${root} (LibreOffice/dictionaries@${REF})`)
} catch (e) {
  console.error(`✗ Sinônimos: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
}
