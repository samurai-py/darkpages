import { chmod, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { atomicWrite } from './docs'

/**
 * Configurações do app em <dataDir>/settings.json (permissão 0600).
 * Organizadas por seção ("ia", "revisor", "arte", "drive", "spotify"…),
 * cada seção pertence a uma feature.
 *
 * Campos cujo nome termina em Key, Token ou Secret são segredos: nunca vão
 * inteiros para a interface (são mascarados) e uma string vazia vinda da
 * interface significa "manter o valor atual".
 */

export type Section = Record<string, unknown>
type All = Record<string, Section>

const SECRET = /(Key|Token|Secret)$/

function file(dataDir: string): string {
  return join(dataDir, 'settings.json')
}

async function readAll(dataDir: string): Promise<All> {
  try {
    const d = JSON.parse(await readFile(file(dataDir), 'utf8')) as All
    return d && typeof d === 'object' ? d : {}
  } catch {
    return {}
  }
}

/** Seção completa, com segredos em claro. Uso só no processo principal/servidor. */
export async function readSection<T extends object = Section>(dataDir: string, section: string): Promise<Partial<T>> {
  return ((await readAll(dataDir))[section] ?? {}) as Partial<T>
}

/** Seção para a interface: segredos viram "••••1234". */
export async function readSectionMasked(dataDir: string, section: string): Promise<Section> {
  const s = await readSection<Section>(dataDir, section)
  const out: Section = {}
  for (const [k, v] of Object.entries(s)) {
    out[k] = SECRET.test(k) && typeof v === 'string' && v ? `••••${v.slice(-4)}` : v
  }
  return out
}

export async function writeSection(dataDir: string, section: string, patch: Section): Promise<void> {
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(section)) throw new Error('Seção inválida')
  const all = await readAll(dataDir)
  const cur = all[section] ?? {}
  const next: Section = { ...cur }
  for (const [k, v] of Object.entries(patch)) {
    if (SECRET.test(k) && (v === '' || (typeof v === 'string' && v.startsWith('••••')))) continue
    next[k] = v
  }
  all[section] = next
  await mkdir(dataDir, { recursive: true })
  await atomicWrite(file(dataDir), JSON.stringify(all, null, 2))
  await chmod(file(dataDir), 0o600)
}

/** Grava sem a regra de "vazio mantém" (para tokens obtidos pelo próprio app, ex. OAuth). */
export async function writeSectionRaw(dataDir: string, section: string, patch: Section): Promise<void> {
  const all = await readAll(dataDir)
  all[section] = { ...(all[section] ?? {}), ...patch }
  await mkdir(dataDir, { recursive: true })
  await atomicWrite(file(dataDir), JSON.stringify(all, null, 2))
  await chmod(file(dataDir), 0o600)
}
