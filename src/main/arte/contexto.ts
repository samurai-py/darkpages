import { createHash } from 'node:crypto'
import type { AiRequest } from '../ai/index'
import type { ArteConfig, CenaMeta, Ficha } from '../../shared/models'
import type { Project } from '../../shared/types'
import { PALETA_PROMPT } from './estilos'
import { chaveDe, type Alvo, type Chip, type EstiloArte, type PromptMontado, type TipoSaida } from './tipos'

/**
 * Montagem do prompt a partir do livro: estilo + resumo visual da cena
 * (feito pela IA de texto via aiChat) + aparência das fichas citadas +
 * promptExtra do livro. Sem IA disponível, monta só com os dados do livro e
 * devolve `aviso` para a interface.
 *
 * Dependências injetadas para poder testar com provedores falsos.
 */

export interface CapituloLido {
  title: string
  body: string
  meta: CenaMeta
}

export interface DepsContexto {
  ia(req: AiRequest): Promise<string>
  projeto(dir: string): Promise<Project>
  capitulo(dir: string, file: string): Promise<CapituloLido>
  fichas(dir: string): Promise<Ficha[]>
  config(dir: string): Promise<ArteConfig>
  estilo(dir: string, id: string): Promise<EstiloArte>
  tamanho(prop: [number, number]): { largura: number; altura: number }
  /** variação atual já gravada para a chave (0 se nunca gerou) */
  variacao(dir: string, chave: string): Promise<number>
}

export interface OpcoesMontagem {
  /** não chama a IA (usado quando o autor já editou o prompt) */
  semIA?: boolean
  /** usar a próxima variação (regenerar) */
  variar?: boolean
}

const ENQUADRAMENTO: Record<TipoSaida, string> = {
  abertura: 'chapter opening illustration, wide horizontal composition, no text',
  retrato: 'character portrait, head and shoulders, plain background, no text',
  capa: 'book cover artwork, vertical composition, empty space at the top for the title, no text'
}

const RETRATO_TIPO: Record<Ficha['tipo'], string> = {
  personagem: 'character portrait, head and shoulders, plain background, no text',
  divindade: 'portrait of a deity, iconic frontal pose, plain background, no text',
  lugar: 'view of a place, establishing shot, no people in focus, no text',
  objeto: 'still life of a single object, centered, plain background, no text',
  grupo: 'emblem and group portrait of a faction, centered, no text'
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function citada(textoNorm: string, f: Ficha): boolean {
  return [f.nome, ...(f.apelidos ?? [])]
    .map((t) => norm(t ?? '').trim())
    .filter((t) => t.length >= 2)
    .some((t) => new RegExp(`(^|[^\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'u').test(textoNorm))
}

/** Fichas citadas no capítulo (nome/apelido), mais POV e cenário do front-matter. Máx. 8. */
export function fichasDoCapitulo(cap: CapituloLido, fichas: Ficha[]): Ficha[] {
  const t = norm(cap.body)
  const ids = new Set<string>()
  const out: Ficha[] = []
  const add = (f: Ficha | undefined): void => {
    if (f && !ids.has(f.id) && out.length < 8) {
      ids.add(f.id)
      out.push(f)
    }
  }
  add(fichas.find((f) => f.id === cap.meta.cenario))
  add(fichas.find((f) => f.id === cap.meta.pov))
  // mais citadas primeiro
  const contadas = fichas
    .filter((f) => !ids.has(f.id) && citada(t, f))
    .map((f) => ({ f, n: t.split(norm(f.nome)).length }))
    .sort((a, b) => b.n - a.n)
  for (const { f } of contadas) add(f)
  return out
}

function camposTexto(f: Ficha): string {
  return (f.campos ?? [])
    .filter((c) => c.nome && c.valor && !/^status$/i.test(c.nome))
    .map((c) => `${c.nome}: ${c.valor}`)
    .join('; ')
}

function descreverFicha(f: Ficha): string {
  return [`${f.nome} (${f.tipo}${f.papel ? `, ${f.papel}` : ''})`, camposTexto(f), f.notas ? `notas: ${f.notas.slice(0, 300)}` : '']
    .filter(Boolean)
    .join(' — ')
}

/** Trecho do capítulo que cabe no contexto da IA: início e fim. */
export function trecho(body: string, max = 9000): string {
  if (body.length <= max) return body
  const ini = Math.round(max * 0.62)
  return `${body.slice(0, ini)}\n[…]\n${body.slice(body.length - (max - ini))}`
}

function extrairJson<T>(texto: string): T {
  const cercado = texto.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = (cercado?.[1] ?? texto).trim()
  const i = raw.indexOf('{')
  const j = raw.lastIndexOf('}')
  if (i < 0 || j < i) throw new Error('A IA não devolveu JSON')
  return JSON.parse(raw.slice(i, j + 1)) as T
}

function s(v: unknown, max = 300): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

const cacheIA = new Map<string, unknown>()

async function perguntarIA<T>(deps: DepsContexto, dir: string, chave: string, req: AiRequest): Promise<T> {
  const k = createHash('sha1').update(`${dir}\n${chave}\n${req.system ?? ''}\n${req.messages.map((m) => m.content).join('\n')}`).digest('hex')
  if (cacheIA.has(k)) return cacheIA.get(k) as T
  const r = extrairJson<T>(await deps.ia(req))
  if (cacheIA.size > 300) cacheIA.clear()
  cacheIA.set(k, r)
  return r
}

const SISTEMA =
  'Você é diretor de arte de livros. Recebe dados de um livro e descreve UMA imagem concreta para um ilustrador. ' +
  'O campo "cena" deve ser em inglês, 1 a 3 frases, só elementos visuais (lugar, luz, hora, pessoas pela aparência, objetos, enquadramento), ' +
  'sem nomes próprios, sem diálogo, sem texto escrito na imagem. Os demais campos em português, curtos.'

interface CenaIA {
  lugar?: string
  quem?: Array<{ nome?: string; aparencia?: string }>
  hora?: string
  objeto?: string
  cena?: string
}

function rotuloCapitulo(p: Project, file: string, titulo: string): string {
  const info = p.chapters.find((c) => c.file === file)
  if (info?.kind === 'prologo') return `Prólogo · ${titulo}`
  if (info?.kind === 'epilogo') return `Epílogo · ${titulo}`
  if (info?.kind === 'parte') return `Parte · ${titulo}`
  const n = Number(file.slice(0, 3))
  return `Cap. ${n} · ${titulo}`
}

export function semente(base: number, variacao: number): number {
  return (Math.floor(base) + variacao * 7919) % 4294967296
}

function juntar(...partes: Array<string | undefined>): string {
  return partes
    .map((p) => (p ?? '').trim().replace(/[,.\s]+$/, ''))
    .filter(Boolean)
    .join(', ')
}

function proporcaoDe(estilo: EstiloArte, tipo: TipoSaida, p: Project): [number, number] {
  const pr = estilo.proporcoes[tipo]
  if (pr === 'livro') return [p.meta.layout.trim.widthMm, p.meta.layout.trim.heightMm]
  return pr
}

export async function montarPrompt(deps: DepsContexto, dir: string, alvo: Alvo, op: OpcoesMontagem = {}): Promise<PromptMontado> {
  const [cfg, projeto] = await Promise.all([deps.config(dir), deps.projeto(dir)])
  const estilo = await deps.estilo(dir, cfg.estilo)
  const chave = chaveDe(alvo)
  const variacao = (await deps.variacao(dir, chave)) + (op.variar ? 1 : 0)
  const chips: Chip[] = []
  let cena = ''
  let enquadramento = ENQUADRAMENTO[alvo.tipo]
  let rotulo = 'Capa'
  let aviso: string | undefined

  const semIA = (e: unknown): void => {
    aviso = `IA de texto indisponível (${(e as Error).message.replace(/[.\s]+$/, '')}). Prompt montado só com os dados do livro; revise antes de gerar.`
  }

  if (alvo.tipo === 'abertura') {
    const cap = await deps.capitulo(dir, alvo.chapterFile)
    const todas = await deps.fichas(dir)
    const citadas = fichasDoCapitulo(cap, todas)
    rotulo = rotuloCapitulo(projeto, alvo.chapterFile, cap.title)
    const lugarFicha = citadas.find((f) => f.tipo === 'lugar')
    const pessoas = citadas.filter((f) => f.tipo === 'personagem' || f.tipo === 'divindade')
    if (!op.semIA && cap.body.trim()) {
      try {
        const r = await perguntarIA<CenaIA>(deps, dir, chave, {
          system: SISTEMA,
          json: true,
          temperature: 0.4,
          maxTokens: 700,
          messages: [
            {
              role: 'user',
              content:
                `Livro: ${projeto.meta.title}\nCapítulo: ${cap.title}\n` +
                (cap.meta.sinopse ? `Sinopse da cena: ${cap.meta.sinopse}\n` : '') +
                `\nFichas citadas (use os campos para a aparência):\n${citadas.map(descreverFicha).join('\n') || '(nenhuma)'}\n` +
                `\nTexto do capítulo:\n${trecho(cap.body)}\n\n` +
                'Escolha o momento mais visual do capítulo para a ilustração de abertura. Responda JSON: ' +
                '{"lugar": "...", "quem": [{"nome": "...", "aparencia": "..."}], "hora": "...", "objeto": "...", "cena": "..."}'
            }
          ]
        })
        cena = s(r.cena, 700)
        if (s(r.lugar)) chips.push({ rotulo: 'Lugar', valor: s(r.lugar, 80) })
        for (const q of (Array.isArray(r.quem) ? r.quem : []).slice(0, 3)) {
          if (s(q.nome)) chips.push({ rotulo: 'Quem', valor: s(q.aparencia) ? `${s(q.nome, 40)} (${s(q.aparencia, 80)})` : s(q.nome, 40) })
        }
        if (s(r.hora)) chips.push({ rotulo: 'Hora', valor: s(r.hora, 60) })
        if (s(r.objeto)) chips.push({ rotulo: 'Objeto', valor: s(r.objeto, 60) })
      } catch (e) {
        semIA(e)
      }
    }
    if (!cena) {
      // sem IA: título + aparência das fichas como matéria-prima (o autor revisa)
      cena = juntar(
        `scene from the chapter "${cap.title}"`,
        cap.meta.sinopse,
        lugarFicha ? `setting: ${lugarFicha.nome}${camposTexto(lugarFicha) ? ` (${camposTexto(lugarFicha)})` : ''}` : '',
        ...pessoas.slice(0, 2).map((f) => (camposTexto(f) ? `a figure with ${camposTexto(f)}` : ''))
      )
      if (lugarFicha) chips.push({ rotulo: 'Lugar', valor: lugarFicha.nome })
      for (const f of pessoas.slice(0, 3)) chips.push({ rotulo: 'Quem', valor: camposTexto(f) ? `${f.nome} (${camposTexto(f).slice(0, 80)})` : f.nome })
      if (!cap.body.trim() && !aviso) aviso = 'Capítulo vazio: o prompt usa só o título.'
    }
  } else if (alvo.tipo === 'retrato') {
    const f = (await deps.fichas(dir)).find((x) => x.id === alvo.fichaId)
    if (!f) throw new Error('Ficha não encontrada')
    rotulo = f.nome
    enquadramento = RETRATO_TIPO[f.tipo] ?? ENQUADRAMENTO.retrato
    chips.push({ rotulo: 'Ficha', valor: f.nome })
    if (f.papel) chips.push({ rotulo: 'Papel', valor: f.papel })
    if (!op.semIA) {
      try {
        const r = await perguntarIA<{ aparencia?: string; cena?: string }>(deps, dir, chave, {
          system: SISTEMA,
          json: true,
          temperature: 0.3,
          maxTokens: 500,
          messages: [
            {
              role: 'user',
              content:
                `Livro: ${projeto.meta.title}\nFicha:\n${descreverFicha(f)}\n\n` +
                'Descreva a aparência visual desta ficha para um retrato. Responda JSON: {"aparencia": "resumo em português", "cena": "..."}'
            }
          ]
        })
        cena = s(r.cena, 700)
        if (s(r.aparencia)) chips.push({ rotulo: 'Aparência', valor: s(r.aparencia, 120) })
      } catch (e) {
        semIA(e)
      }
    }
    if (!cena) {
      cena = juntar(f.tipo === 'personagem' ? 'a person' : f.tipo, camposTexto(f))
      if (camposTexto(f)) chips.push({ rotulo: 'Aparência', valor: camposTexto(f).slice(0, 120) })
    }
  } else {
    const todas = await deps.fichas(dir)
    const principais = todas.filter((f) => /protagonista|principal/i.test(f.papel ?? '')).slice(0, 3)
    chips.push({ rotulo: 'Livro', valor: projeto.meta.title })
    for (const f of principais) chips.push({ rotulo: 'Quem', valor: f.nome })
    if (!op.semIA) {
      try {
        const r = await perguntarIA<{ tema?: string; cena?: string }>(deps, dir, chave, {
          system: SISTEMA,
          json: true,
          temperature: 0.5,
          maxTokens: 600,
          messages: [
            {
              role: 'user',
              content:
                `Livro: ${projeto.meta.title}\nCapítulos: ${projeto.chapters.map((c) => c.title).join(' · ').slice(0, 2500)}\n` +
                `Personagens principais:\n${principais.map(descreverFicha).join('\n') || '(não marcados)'}\n\n` +
                'Proponha a imagem da capa (sem título escrito). Responda JSON: {"tema": "uma frase em português", "cena": "..."}'
            }
          ]
        })
        cena = s(r.cena, 700)
        if (s(r.tema)) chips.push({ rotulo: 'Tema', valor: s(r.tema, 100) })
      } catch (e) {
        semIA(e)
      }
    }
    if (!cena) cena = juntar(`cover art for a novel titled "${projeto.meta.title}"`, ...principais.map((f) => camposTexto(f) ? `a figure with ${camposTexto(f)}` : ''))
  }

  const pal = PALETA_PROMPT[estilo.paleta]
  const proporcao = proporcaoDe(estilo, alvo.tipo, projeto)
  const { largura, altura } = deps.tamanho(proporcao)
  return {
    chave,
    alvo,
    rotulo,
    estilo: estilo.id,
    estiloNome: estilo.nome,
    paleta: estilo.paleta,
    prompt: juntar(estilo.prompt, cena, enquadramento, pal.prompt, cfg.promptExtra),
    negativo: juntar(estilo.negativo, pal.negativo),
    chips,
    semente: semente(cfg.semente, variacao),
    variacao,
    proporcao,
    largura,
    altura,
    ...(aviso ? { aviso } : {})
  }
}
