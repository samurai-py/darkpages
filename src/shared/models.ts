/**
 * Contratos de dados compartilhados entre features. Uma feature só lê/escreve
 * dados de outra através destas formas. Mudou algo aqui? Avise o dono da
 * outra feature (ver comentário DONO).
 */

// ---------------------------------------------------------------------------
// UNIVERSO — coleção "universo", um documento por ficha. DONO: Universo/Enredo
// ---------------------------------------------------------------------------
export type FichaTipo = 'personagem' | 'lugar' | 'objeto' | 'grupo' | 'divindade'

export interface FichaCampo {
  nome: string
  valor: string
}

export interface FichaRelacao {
  /** id da outra ficha */
  alvo: string
  /** ex.: "aprendiz de", "irmã de" */
  rotulo: string
}

export interface Ficha {
  id: string
  tipo: FichaTipo
  nome: string
  /** nomes alternativos usados no texto (para detectar menções) */
  apelidos: string[]
  /** papel curto: "protagonista", "capital" */
  papel: string
  /** grupo/facção para agrupar na tela */
  grupo: string
  /** atributos estruturados: Olhos=verdes, Status=morto@cap12 … (usados na checagem de continuidade) */
  campos: FichaCampo[]
  relacoes: FichaRelacao[]
  notas: string
  /** nome do arquivo em assets/ (ver ASSET_NAMES.retrato) ou vazio */
  retrato: string
  criadoEm: string
  atualizadoEm: string
}

// ---------------------------------------------------------------------------
// ENREDO — coleção "enredo", documento único id "board". DONO: Universo/Enredo
// ---------------------------------------------------------------------------
export type CartaoTipo = 'cena' | 'virada' | 'personagem' | 'ideia' | 'local'

export interface Cartao {
  id: string
  tipo: CartaoTipo
  titulo: string
  texto: string
  /** arquivo do capítulo (manuscrito/NNN-x.md) ao qual o cartão pertence, se houver */
  capitulo?: string
  /** fichas ligadas */
  fichas: string[]
  x: number
  y: number
  /** ordem no roteiro do capítulo */
  ordem?: number
  criadoEm: string
}

export interface Ligacao {
  id: string
  de: string
  para: string
  rotulo: string
  tipo: 'relacao' | 'causa'
}

export interface EnredoBoard {
  cartoes: Cartao[]
  ligacoes: Ligacao[]
}

// ---------------------------------------------------------------------------
// METADADOS DE CENA — no front-matter do capítulo. DONO: Manuscrito
// ---------------------------------------------------------------------------
export interface CenaMeta {
  sinopse?: string
  /** id da ficha do ponto de vista */
  pov?: string
  /** id da ficha do lugar */
  cenario?: string
  notas?: string
}

// ---------------------------------------------------------------------------
// IA — métodos implementados em src/main/features/ia.ts. DONO: IA
// Todas devolvem erro legível se a IA estiver desligada/sem chave.
// ---------------------------------------------------------------------------
export type IdeiaTipo = 'virada' | 'conflito' | 'pista' | 'dialogo' | 'sensorial'

export interface Ideia {
  tipo: IdeiaTipo
  texto: string
  /** a que se liga: "Tomé", "cap. 18", "eco do prólogo" */
  ligadoA: string
}

/** 'ia.ideias'(dir, chapterFile, pedido?: string) → Ideia[] */
export interface IdeiasResult {
  ideias: Ideia[]
}

/** 'ia.sinonimos'(palavra, frase) → { sinonimos: string[]; fortes: string[]; classe: string } */
export interface SinonimosResult {
  sinonimos: string[]
  fortes: string[]
  /** ex.: "verbo · passado · ela" */
  classe: string
}

/** 'ia.continuidade'(dir, chapterFile) → Conflito[] */
export interface Conflito {
  trecho: string
  fichaId: string
  fichaNome: string
  campo: string
  esperado: string
  encontrado: string
  explicacao: string
}

/** 'ia.beta'(dir, chapterFile) → BetaLeitura */
export interface BetaLeitura {
  notas: { ritmo: number; tensao: number; clareza: number; voz: number; personagens: number }
  funciona: string
  melhorar: string
  citacao: string
  geradoEm: string
}

/** 'ia.resumo'(dir, chapterFile) → { resumo: string } (cacheado em coleção "resumos") */

export type SugestaoCategoria = 'ortografia' | 'gramatica' | 'estilo' | 'repeticao' | 'continuidade'

/** 'ia.revisar'(dir, chapterFile) → Sugestao[] (LanguageTool + IA de estilo) */
export interface Sugestao {
  id: string
  categoria: SugestaoCategoria
  motivo: string
  /** texto original exato que aparece no capítulo */
  original: string
  /** substituição proposta ('' = remover) */
  substituto: string
  /** contexto antes/depois para exibir */
  antes: string
  depois: string
}

// ---------------------------------------------------------------------------
// ARTE — imagens geradas ficam em <livro>/assets/. DONO: Arte
// Diagramação usa a abertura do capítulo; Universo usa o retrato.
// ---------------------------------------------------------------------------
export const ASSET_NAMES = {
  /** arte de abertura de capítulo: chapterFile "014-o-que-tome-sabia.md" → "abertura-014-o-que-tome-sabia.png" */
  abertura: (chapterFile: string): string => `abertura-${chapterFile.replace(/\.md$/, '')}.png`,
  /** retrato de ficha */
  retrato: (fichaId: string): string => `retrato-${fichaId}.png`,
  /** capa frontal do livro */
  capa: 'capa-frente.png',
  /** fonte do alfabeto do idioma */
  fonteIdioma: (linguaId: string): string => `fonte-${linguaId}.otf`
}

/** coleção "arte", documento "config": estilo travado do livro */
export interface ArteConfig {
  estilo: string
  semente: number
  promptExtra: string
}

// ---------------------------------------------------------------------------
// PROGRESSO / NORTE — DONO: Sync/Biblioteca
// coleção "progresso" doc "diario": { dias: { "2026-11-06": 6840 } } (palavras totais no fim do dia)
// coleção "norte" um doc por marco
// ---------------------------------------------------------------------------
export interface Marco {
  id: string
  titulo: string
  data: string
  feito: boolean
}

// ---------------------------------------------------------------------------
// INSIGHTS (modo proativo) — coleção "insights" do livro. DONO: IA
// Métodos em src/main/features/insights.ts. Configuração na seção "proativo".
// ---------------------------------------------------------------------------
export type InsightTipo = 'continuidade' | 'estilo' | 'ideias' | 'pistas' | 'resumo'
export const INSIGHT_TIPOS: InsightTipo[] = ['continuidade', 'estilo', 'ideias', 'pistas', 'resumo']
export type InsightStatus = 'novo' | 'visto' | 'aplicado' | 'dispensado'

export type InsightAcao =
  | { tipo: 'substituir'; original: string; substituto: string; antes?: string; depois?: string }
  | { tipo: 'abrirFicha'; fichaId: string }
  | { tipo: 'cartao'; titulo: string; texto: string }
  | { tipo: 'redigir'; ideia: { tipo: string; texto: string } }

export interface Insight {
  id: string
  tipo: InsightTipo
  /** arquivo do capítulo ('' no resumo do dia) */
  capitulo: string
  /** trecho do texto a que se refere ('' quando geral) */
  trecho: string
  texto: string
  acao?: InsightAcao
  status: InsightStatus
  /** 'local' (checagem do app) ou 'ia' */
  origem: 'local' | 'ia'
  criadoEm: string
}

export type ProativoModo = 'off' | 'leve' | 'completo'

/** seção "proativo" das configurações */
export interface ProativoSettings {
  modo: ProativoModo
  /** chamadas de IA por dia, somando todos os livros */
  limiteDiario: number
  /** "HH:MM"; início = fim desliga o horário silencioso */
  silencioInicio: string
  silencioFim: string
  tipos: Record<InsightTipo, boolean>
  palavrasMin: number
  /** segundos sem digitar para contar como pausa */
  pausaS: number
}

/** 'insights.estado'() → situação do modo proativo para a interface */
export interface ProativoEstado {
  config: ProativoSettings
  usadasHoje: number
  silencioAgora: boolean
  /** o texto sai do computador quando a IA proativa roda */
  externo: boolean
  nomeProvedor: string
  modeloAutomatico: string
  iaLigada: boolean
}
