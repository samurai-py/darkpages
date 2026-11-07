import type { Ficha, FichaCampo, FichaTipo } from '../../../../shared/models'

export const COLECAO_UNIVERSO = 'universo'

export const TIPOS: FichaTipo[] = ['personagem', 'lugar', 'objeto', 'grupo', 'divindade']

export const TIPO_ROTULO: Record<FichaTipo, { um: string; varios: string; novo: string }> = {
  personagem: { um: 'Personagem', varios: 'Personagens', novo: 'Novo personagem' },
  lugar: { um: 'Lugar', varios: 'Lugares', novo: 'Novo lugar' },
  objeto: { um: 'Objeto', varios: 'Objetos', novo: 'Novo objeto' },
  grupo: { um: 'Grupo', varios: 'Grupos', novo: 'Novo grupo' },
  divindade: { um: 'Divindade', varios: 'Divindades', novo: 'Nova divindade' }
}

/** Campos estruturados sugeridos por tipo (a continuidade lê estes nomes). */
export const CAMPOS_PADRAO: Record<FichaTipo, string[]> = {
  personagem: ['Olhos', 'Cabelo', 'Idade', 'Ofício', 'Status'],
  lugar: ['Região', 'Clima', 'Governo', 'População', 'Perigo'],
  objeto: ['Material', 'Origem', 'Poder', 'Portador', 'Paradeiro'],
  grupo: ['Líder', 'Sede', 'Objetivo', 'Símbolo', 'Membros'],
  divindade: ['Domínio', 'Símbolo', 'Culto', 'Manifestação', 'Status']
}

/** Id compatível com o armazenamento (minúsculas, dígitos e hífen). */
export function novoId(prefixo: string): string {
  const r = Math.random().toString(36).slice(2, 8)
  return `${prefixo}-${Date.now().toString(36)}-${r}`
}

export function novaFicha(tipo: FichaTipo, grupo = ''): Ficha {
  const agora = new Date().toISOString()
  return {
    id: novoId('ficha'),
    tipo,
    nome: TIPO_ROTULO[tipo].novo,
    apelidos: [],
    papel: '',
    grupo,
    campos: CAMPOS_PADRAO[tipo].map((nome) => ({ nome, valor: '' })),
    relacoes: [],
    notas: '',
    retrato: '',
    criadoEm: agora,
    atualizadoEm: agora
  }
}

/** Ao trocar o tipo: tira campos padrão vazios do tipo antigo e acrescenta os do novo. */
export function trocarTipo(f: Ficha, tipo: FichaTipo): Ficha {
  const antigos = new Set(CAMPOS_PADRAO[f.tipo])
  const campos: FichaCampo[] = f.campos.filter((c) => !(antigos.has(c.nome) && !c.valor.trim()))
  for (const nome of CAMPOS_PADRAO[tipo]) {
    if (!campos.some((c) => c.nome === nome)) campos.push({ nome, valor: '' })
  }
  return { ...f, tipo, campos }
}

/** Completa um documento lido do disco com os campos que faltarem. */
export function normalizarFicha(raw: Partial<Ficha> & { id: string }): Ficha {
  const tipo = TIPOS.includes(raw.tipo as FichaTipo) ? (raw.tipo as FichaTipo) : 'personagem'
  return {
    id: raw.id,
    tipo,
    nome: typeof raw.nome === 'string' ? raw.nome : 'Sem nome',
    apelidos: Array.isArray(raw.apelidos) ? raw.apelidos.filter((a) => typeof a === 'string') : [],
    papel: typeof raw.papel === 'string' ? raw.papel : '',
    grupo: typeof raw.grupo === 'string' ? raw.grupo : '',
    campos: Array.isArray(raw.campos)
      ? raw.campos
          .filter((c) => c && typeof c.nome === 'string')
          .map((c) => {
            const campo: FichaCampo = { nome: c.nome, valor: typeof c.valor === 'string' ? c.valor : '' }
            // "mudou a partir de…" (id estável do capítulo)
            const hist = Array.isArray(c.historico)
              ? c.historico.filter((h) => h && typeof h.desde === 'string' && typeof h.valor === 'string').map((h) => ({ valor: h.valor, desde: h.desde }))
              : []
            if (hist.length) campo.historico = hist
            return campo
          })
      : [],
    relacoes: Array.isArray(raw.relacoes)
      ? raw.relacoes
          .filter((r) => r && typeof r.alvo === 'string')
          .map((r) => ({ alvo: r.alvo, rotulo: typeof r.rotulo === 'string' ? r.rotulo : '' }))
      : [],
    notas: typeof raw.notas === 'string' ? raw.notas : '',
    retrato: typeof raw.retrato === 'string' ? raw.retrato : '',
    criadoEm: typeof raw.criadoEm === 'string' ? raw.criadoEm : new Date().toISOString(),
    atualizadoEm: typeof raw.atualizadoEm === 'string' ? raw.atualizadoEm : new Date().toISOString()
  }
}

export function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Busca por nome, apelido, papel, grupo e campos (nome ou valor). */
export function casaBusca(f: Ficha, busca: string): boolean {
  const q = semAcento(busca.trim())
  if (!q) return true
  const alvo = [f.nome, f.papel, f.grupo, ...f.apelidos, ...f.campos.flatMap((c) => [c.nome, c.valor])]
  return alvo.some((t) => semAcento(t).includes(q))
}

export function porNome(a: Ficha, b: Ficha): number {
  return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
}

/** Agrupa por "grupo" (alfabético, "Sem grupo" por último). */
export function agrupar(fichas: Ficha[]): Array<{ grupo: string; fichas: Ficha[] }> {
  const mapa = new Map<string, Ficha[]>()
  for (const f of fichas) {
    const g = f.grupo.trim()
    const lista = mapa.get(g) ?? []
    lista.push(f)
    mapa.set(g, lista)
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'pt-BR')))
    .map(([grupo, lista]) => ({ grupo, fichas: lista.sort(porNome) }))
}

/** Hash estável de texto (FNV-1a). */
export function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
