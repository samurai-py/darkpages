/**
 * Contratos de dados compartilhados entre features. Uma feature só lê/escreve
 * dados de outra através destas formas. Mudou algo aqui? Avise o dono da
 * outra feature (ver comentário DONO).
 */

// ---------------------------------------------------------------------------
// UNIVERSO — coleção "universo", um documento por ficha. DONO: Universo/Enredo
// ---------------------------------------------------------------------------
export type FichaTipo = 'personagem' | 'lugar' | 'objeto' | 'grupo' | 'divindade'

/** Mudança de valor de um atributo a partir de um capítulo (id estável). */
export interface FichaMudanca {
  valor: string
  /** id estável do capítulo (ChapterInfo.id) a partir do qual o valor vale */
  desde: string
}

export interface FichaCampo {
  nome: string
  /** valor do início do livro (antes de qualquer mudança do histórico) */
  valor: string
  /**
   * "Mudou a partir de…": valores que passam a valer de um capítulo em diante.
   * A continuidade e a IA usam o valor válido na posição do capítulo atual
   * (ver shared/narrativa.ts). Por id de capítulo: reordenar não quebra.
   */
  historico?: FichaMudanca[]
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
export type CartaoTipo = 'cena' | 'virada' | 'personagem' | 'ideia' | 'local' | 'fato'

/**
 * Cartão "fato": de quem é a afirmação. "verdade" = fato do livro;
 * "crenca" = o que uma ficha acredita ou afirma (pode ser falso).
 */
export type PerspectivaFato = { tipo: 'verdade' } | { tipo: 'crenca'; fichaId: string }

/** Fio solto: promessa ou pergunta feita ao leitor, que pede pagamento. */
export interface FioCartao {
  status: 'aberto' | 'resolvido'
  /** id estável do capítulo onde deve ser resolvido */
  resolveEm?: string
}

/** Quem criou o cartão: o autor ou uma sugestão da IA ("→ Enredo", "Virar cartão"). */
export type CartaoOrigem = 'autor' | 'ia'
/**
 * Peso do cartão no livro. "canonico" = plano do autor (a IA trata como fato do
 * planejamento); "provisorio" = ideia ainda não aceita (a IA vê marcada como
 * provisória); "descartado" = fica no quadro, fora do contexto da IA.
 * Cartão vindo da IA nasce provisório; legado sem campo = autor/canonico.
 */
export type CartaoEstado = 'canonico' | 'provisorio' | 'descartado'

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
  origem: CartaoOrigem
  estado: CartaoEstado
  criadoEm: string
  /** só no tipo "fato": verdade ou crença de uma ficha (padrão: verdade) */
  perspectiva?: PerspectivaFato
  /** só no tipo "fato": id estável do capítulo a partir do qual o leitor pode saber */
  revelarEm?: string
  /** só no tipo "fato": palavras ou nomes que entregam o fato (checagem de revelação antecipada) */
  termos?: string[]
  /** qualquer tipo: o cartão é um fio solto (plantado no capítulo do cartão) */
  fio?: FioCartao
  /** imagem do cartão: nome do arquivo em <livro>/assets/ (ver IMAGEM_CARTAO). Não vai para a IA. */
  imagem?: string
}

/**
 * Imagem de cartão: só nome de arquivo (sem pasta), png/jpg/jpeg/webp.
 * Enviadas pelo app se chamam "cartao-<id>-<ts>.<ext>"; importadas podem ter outro nome.
 */
export const IMAGEM_CARTAO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,94}\.(?:png|jpe?g|webp)$/i

/** Nome de imagem de cartão aceitável (sem pastas, sem "..", extensão de imagem, até 100 caracteres). */
export function imagemCartaoValida(nome: unknown): nome is string {
  return typeof nome === 'string' && IMAGEM_CARTAO.test(nome) && !nome.includes('..')
}
/** Prefixo das imagens que o próprio Enredo envia (só essas o app apaga sozinho). */
export const PREFIXO_IMAGEM_CARTAO = 'cartao-'

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
  /** o que ficou fora do contexto enviado à IA (ex.: resumos antigos cortados por tamanho) */
  avisos?: string[]
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
  /** conflito com um cartão "fato" (revelação antecipada) em vez de uma ficha; fichaId = id do cartão */
  cartaoId?: string
}

/** 'ia.beta'(dir, chapterFile) → BetaLeitura */
export interface BetaLeitura {
  notas: { ritmo: number; tensao: number; clareza: number; voz: number; personagens: number }
  funciona: string
  melhorar: string
  citacao: string
  geradoEm: string
  /** o que ficou fora do contexto enviado à IA */
  avisos?: string[]
}

/** 'ia.resumo'(dir, chapterFile) → { resumo, travado, desatualizado } (cacheado em coleção "resumos") */

// ---------------------------------------------------------------------------
// IMPACTO — 'enredo.impacto'(dir, chapterFile) → ImpactoItem[]. DONO: Enredo
// Capítulos SEGUINTES que podem ser afetados quando o capítulo muda. Só leitura.
// ---------------------------------------------------------------------------
export type ImpactoTipo = 'causa' | 'fato' | 'fio' | 'ficha'

export interface ImpactoItem {
  tipo: ImpactoTipo
  /** arquivo do capítulo afetado (ausente = "o resto do livro") */
  capitulo?: string
  cartaoId?: string
  fichaId?: string
  texto: string
}

// ---------------------------------------------------------------------------
// CONFERIR CONTRA O PLANO — 'ia.conferirPlano'(dir, chapterFile). DONO: IA
// Compara o texto com sinopse, cartões, fios e fatos do capítulo. Só leitura.
// ---------------------------------------------------------------------------
export type PlanoAlvoTipo = 'sinopse' | 'cartao' | 'fio' | 'fato'

export interface PlanoAlvo {
  tipo: PlanoAlvoTipo
  /** id do cartão (ausente na sinopse) */
  id?: string
  titulo: string
}

export interface ItemPlano {
  tipo: 'cumprido' | 'faltando' | 'divergente'
  alvo: PlanoAlvo
  explicacao: string
  /** citação exata do capítulo (só vem quando existe no texto) */
  trecho?: string
}

export interface ConferenciaPlano {
  itens: ItemPlano[]
  /** itens do plano que a IA não avaliou */
  semResposta: PlanoAlvo[]
  /** o que ficou fora do contexto enviado à IA */
  avisos: string[]
  geradoEm: string
}

// ---------------------------------------------------------------------------
// MEMÓRIA DO LIVRO — resumos por capítulo que a IA "lembra". DONO: IA
// Coleção "resumos", um documento por capítulo (chave = id estável).
// Métodos 'memoria.*' em src/main/features/revisao.ts. Tela: Enredo › Memória.
// ---------------------------------------------------------------------------
export type MemoriaEstado = 'atual' | 'desatualizado' | 'sem-resumo' | 'sem-texto'

export interface MemoriaItem {
  file: string
  /** id estável do capítulo */
  id: string
  titulo: string
  palavras: number
  resumo: string
  estado: MemoriaEstado
  /** editado pelo autor: a IA nunca sobrescreve */
  travado: boolean
  geradoEm?: string
  editadoEm?: string
}

// ---------------------------------------------------------------------------
// PERFIL DA OBRA — coleção "config", doc "perfil". DONO: IA
// Acrescenta instruções a todos os prompts e afrouxa checagens locais.
// ---------------------------------------------------------------------------
export interface PerfilObra {
  /** falas e narração podem mentir de propósito */
  narradorNaoConfiavel: boolean
  /** lacunas e duplo sentido são intencionais */
  ambiguidadeDeliberada: boolean
  /** a ordem dos capítulos não é a ordem dos acontecimentos */
  naoLinear: boolean
  /** texto livre para a IA: tom, regras do universo, o que nunca fazer */
  notasIa: string
}

export const PERFIL_PADRAO: PerfilObra = { narradorNaoConfiavel: false, ambiguidadeDeliberada: false, naoLinear: false, notasIa: '' }

// ---------------------------------------------------------------------------
// DECISÕES DE REVISÃO — coleção "revisao", doc "decisoes" { itens }. DONO: IA
// "Sempre manter" no Revisor. Respeitadas pelo Revisor, pela continuidade e
// pelos insights proativos (ver src/shared/decisoes.ts).
// ---------------------------------------------------------------------------
export type DecisaoTipo = 'manter-palavra' | 'manter-trecho' | 'ignorar-regra' | 'continuidade'

export interface DecisaoRevisao {
  id: string
  tipo: DecisaoTipo
  /** palavra, trecho, id da regra do LanguageTool ou chave do conflito */
  valor: string
  /** id estável do capítulo quando a decisão vale só nele */
  capitulo?: string
  /** texto curto para a lista ("ortografia: Kaelith") */
  rotulo?: string
  criadoEm: string
}

// ---------------------------------------------------------------------------
// RITMO — métricas baratas por capítulo (só visualização). DONO: IA
// ---------------------------------------------------------------------------
export interface MetricasRitmo {
  palavras: number
  frases: number
  paragrafos: number
  /** palavras por frase */
  mediaFrase: number
  /** palavras por parágrafo */
  mediaParagrafo: number
  /** 0–100: parcela das palavras em parágrafos de fala */
  pctDialogo: number
  /** primeiras palavras de frase que se repetem (3+ vezes), mais frequentes primeiro */
  iniciosRepetidos: Array<{ inicio: string; n: number }>
}

/** 'revisao.ritmo'(dir, chapterFile) → capítulo × média do livro */
export interface RitmoComparado {
  capitulo: MetricasRitmo
  livro: MetricasRitmo
  /** capítulos que entraram na média */
  capitulosNaMedia: number
}

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
  /** outras substituições possíveis (LanguageTool), até 3 */
  alternativas?: string[]
  /** id da regra do LanguageTool (para "sempre ignorar esta regra") */
  regra?: string
  /** chave do conflito de continuidade (fichaId|campo|trecho) */
  chave?: string
  /** palavra repetida (repetição local), forma comparada */
  palavra?: string
  /** só aponta, não tem troca (ex.: repetição local); "Aceitar" não se aplica */
  soAviso?: boolean
  /** trechos a destacar dentro de `original` ([início, fim) relativos) */
  marcas?: Array<[number, number]>
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
