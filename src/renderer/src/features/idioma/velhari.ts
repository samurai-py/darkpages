import { linguaVazia, type Classe, type Entrada, type Glifo, type Lingua, type PontoGlifo } from './model'

/** Língua de exemplo oferecida ao criar a primeira língua do livro. */

const g = (espessura: number, ...tracos: Array<Array<[number, number] | [number, number, 1]>>): Glifo => ({
  espessura,
  tracos: tracos as PontoGlifo[][]
})

const GLIFOS: Record<string, Glifo> = {
  a: g(1.6, [[6, 20], [12, 5], [18, 20]], [[12, 5], [12, 12]]),
  e: g(1.6, [[7, 5], [17, 5]], [[12, 5], [12, 20]], [[7, 20], [12, 13, 1], [17, 20]]),
  i: g(1.6, [[12, 4], [12, 20]], [[8, 8], [12, 4], [16, 8]]),
  o: g(1.6, [[12, 4], [20, 4, 1], [20, 12], [20, 20, 1], [12, 20], [4, 20, 1], [4, 12], [4, 4, 1], [12, 4]], [[12, 12]]),
  u: g(1.6, [[6, 5], [6, 14], [6, 20, 1], [12, 20], [18, 20, 1], [18, 14], [18, 5]]),
  v: g(1.6, [[5, 5], [12, 20], [19, 5]], [[12, 20], [12, 10]]),
  l: g(1.6, [[8, 4], [8, 20], [17, 20]], [[8, 12], [14, 7]]),
  r: g(1.6, [[7, 20], [7, 4], [17, 4, 1], [17, 9], [17, 13, 1], [7, 13]], [[11, 13], [17, 20]]),
  th: g(1.6, [[6, 4], [18, 4]], [[12, 4], [12, 20]], [[6, 12], [12, 18, 1], [18, 12]]),
  d: g(1.6, [[7, 4], [7, 20]], [[7, 4], [19, 12, 1], [7, 20]]),
  n: g(1.6, [[6, 20], [6, 5], [18, 19], [18, 4]]),
  m: g(1.6, [[5, 20], [5, 5], [12, 13], [19, 5], [19, 20]]),
  s: g(1.6, [[17, 5], [6, 5, 1], [12, 12], [18, 19, 1], [7, 19]]),
  sh: g(1.6, [[17, 5], [6, 5, 1], [12, 12], [18, 19, 1], [7, 19]], [[4, 12], [20, 12]]),
  t: g(1.6, [[5, 5], [19, 5]], [[12, 5], [12, 20]], [[9, 20], [15, 20]]),
  b: g(1.6, [[7, 4], [7, 20]], [[7, 4], [17, 8, 1], [7, 12]], [[7, 12], [19, 16, 1], [7, 20]]),
  h: g(1.6, [[6, 4], [6, 20]], [[18, 4], [18, 20]], [[6, 12], [18, 8]])
}

const LEX: Array<[string, string, Classe, string?]> = [
  ['sino', 'dorran', 'substantivo', 'o grande sino de Brumagem'],
  ['calar', 'ush', 'verbo'],
  ['e', 'ta', 'conjunção'],
  ['cidade', 'velhar', 'substantivo', 'de “velha morada”'],
  ['esquecer', 'oblav', 'verbo'],
  ['névoa', 'brum', 'substantivo', 'raiz de Brumagem'],
  ['velho', 'vel', 'adjetivo'],
  ['casa', 'hos', 'substantivo'],
  ['rio', 'lir', 'substantivo'],
  ['noite', 'nathu', 'substantivo'],
  ['luz', 'sael', 'substantivo'],
  ['sangue', 'dor', 'substantivo', 'mesma raiz de “sino”: o que chama'],
  ['ferro', 'tham', 'substantivo'],
  ['pedra', 'mos', 'substantivo'],
  ['rei', 'reth', 'substantivo'],
  ['ver', 'mir', 'verbo'],
  ['ir', 'va', 'verbo'],
  ['falar', 'sol', 'verbo'],
  ['lembrar', 'mennar', 'verbo'],
  ['não', 'na', 'advérbio'],
  ['eu', 'me', 'pronome'],
  ['tu', 'te', 'pronome'],
  ['ele', 'lo', 'pronome'],
  ['mar', 'mor', 'substantivo'],
  ['estrela', 'eshel', 'substantivo'],
  ['de', 'du', 'preposição'],
  ['em', 'in', 'preposição']
]

export function velhari(): Omit<Lingua, 'id'> {
  const base = linguaVazia('Velhári')
  const lexico: Entrada[] = LEX.map(([pt, termo, classe, nota], i) => ({ id: `v${i.toString(36)}`, pt, termo, classe, nota: nota ?? '' }))
  return {
    ...base,
    descricao: 'Falado em Brumagem. Língua de sinos e névoa: sílabas abertas, finais em -n, -r e -l.',
    consoantes: ['v', 'l', 'r', 'th', 'd', 'n', 'm', 's', 'sh', 'k', 'g', 'h', 't', 'b'],
    vogais: ['a', 'e', 'i', 'o', 'u', 'á'],
    padraoSilaba: '(C)V(C)',
    regras: {
      proibicoes: [
        { fonema: 'k', posicao: 'fim' },
        { fonema: 'h', posicao: 'fim' },
        { fonema: 'g', posicao: 'fim' }
      ],
      clusters: [],
      pesos: { a: 3, e: 2, o: 2, r: 2, l: 2, n: 2, v: 1.5, k: 0.5, g: 0.5, á: 0.6 }
    },
    lexico,
    morfologia: { plural: 'i', passado: 'en', feminino: 'á', ordem: 'SVO', omitirArtigos: true },
    glifos: GLIFOS,
    gerador: { semente: 1207, quantidade: 12, silabasMin: 1, silabasMax: 3 }
  }
}
