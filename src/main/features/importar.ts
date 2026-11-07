import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { bookDir, str, type Ctx, type Handlers } from '../api/context'
import { createProject, slugify } from '../project'
import { atomicWrite } from '../store/docs'
import { MAX_IMPORTACAO, type OpcoesExport, type PreviaImport, type ResultadoImport } from '../../shared/importar'
import { lerArquivo } from './importar-ler'
import { estadoVazio, exportarYaml, importarNoLivro, lerEstado, planejarTexto, tirarCapituloDeExemplo } from './importar-livro'

/**
 * Importar/exportar "regras e dados" do livro inteiro (formato folio-livro v1,
 * docs/modelo-livro.yaml). Duas etapas: 'importar.previa' só lê e mostra o que
 * vai acontecer; 'importar.aplicar' valida de novo, guarda uma versão e grava.
 */

function texto(v: unknown): string {
  if (typeof v !== 'string') throw new Error('Arquivo inválido')
  if (v.length > MAX_IMPORTACAO) throw new Error(`Arquivo grande demais (máx. ${Math.round(MAX_IMPORTACAO / 1024 / 1024)} MB)`)
  return v
}

function opcoes(v: unknown): OpcoesExport {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return { comTexto: o.comTexto === true }
}

export const handlers: Handlers = {
  /**
   * 'importar.previa'(dir | null, yaml) → PreviaImport. Não grava nada.
   * Sem livro (dir null): prévia de "Criar a partir de arquivo".
   */
  'importar.previa': async (ctx, dir, yaml): Promise<PreviaImport> => {
    const t = texto(yaml)
    if (dir === null || dir === undefined || dir === '') {
      const lido = lerArquivo(t)
      const plano = planejarTexto(estadoVazio(lido.dados?.livro.titulo ?? '', lido.dados?.livro.autor ?? ''), t)
      if (lido.dados && !lido.dados.livro.titulo) plano.previa.erros.unshift({ texto: 'Para criar um livro, preencha “livro: titulo:”.' })
      if (lido.dados && !lido.dados.livro.autor) plano.previa.erros.unshift({ texto: 'Para criar um livro, preencha “livro: autor:”.' })
      return plano.previa
    }
    return planejarTexto(await lerEstado(await bookDir(ctx, dir)), t).previa
  },

  /** 'importar.aplicar'(dir, yaml) → ResultadoImport. Com qualquer erro, não grava nada. */
  'importar.aplicar': async (ctx, dir, yaml): Promise<ResultadoImport> => {
    const d = await bookDir(ctx, dir)
    const { previa, project } = await importarNoLivro(d, texto(yaml))
    return { ...previa, project: await ctx.remember(project) }
  },

  /**
   * 'importar.novoLivro'(yaml) → ResultadoImport | null (null = escolha da pasta cancelada).
   * Cria o livro (título e autor do arquivo) onde "+ Novo livro" cria e aplica o arquivo.
   */
  'importar.novoLivro': async (ctx, yaml): Promise<ResultadoImport | null> => {
    const t = texto(yaml)
    const lido = lerArquivo(t)
    const erro = lido.erros[0]
    if (!lido.dados || erro) throw new Error(`O arquivo tem erros; nada foi criado. ${erro?.linha ? `Linha ${erro.linha}: ` : ''}${erro?.texto ?? ''}`)
    const titulo = lido.dados.livro.titulo
    const autor = lido.dados.livro.autor
    if (!titulo || !autor) throw new Error('Para criar um livro, preencha “livro: titulo:” e “livro: autor:”.')
    // valida tudo antes de criar a pasta (referências, duplicados…)
    const previa = planejarTexto(estadoVazio(titulo, autor), t).previa
    if (previa.erros.length) throw new Error(`O arquivo tem erros; nada foi criado. ${previa.erros[0]?.texto ?? ''}`)
    const parent = await pastaDoLivroNovo(ctx)
    if (!parent) return null
    await mkdir(parent, { recursive: true })
    const criado = await createProject(parent, titulo, autor)
    await ctx.remember(criado)
    if (lido.dados.capitulos.length) await tirarCapituloDeExemplo(criado.dir)
    const r = await importarNoLivro(criado.dir, t)
    return { ...r.previa, project: await ctx.remember(r.project) }
  },

  /** 'importar.exportar'(dir, { comTexto? }) → texto YAML do livro no mesmo formato. */
  'importar.exportar': async (ctx, dir, op): Promise<string> => exportarYaml(await lerEstado(await bookDir(ctx, dir)), opcoes(op)),

  /** 'importar.exportarArquivo'(dir, { comTexto? }) → caminho em <livro>/export/ (abrir com openExport). */
  'importar.exportarArquivo': async (ctx, dir, op): Promise<string> => {
    const d = await bookDir(ctx, dir)
    const estado = await lerEstado(d)
    const out = join(d, 'export')
    await mkdir(out, { recursive: true })
    const path = join(out, `${slugify(estado.title)}-regras-e-dados.yaml`)
    await atomicWrite(path, exportarYaml(estado, opcoes(op)))
    return path
  }
}

/** Mesma regra de "+ Novo livro" (core.create): web → pasta padrão; desktop → pergunta onde salvar. */
async function pastaDoLivroNovo(ctx: Ctx): Promise<string | null> {
  if (ctx.web) return ctx.libraryDir
  return ctx.pickDirectory('Onde salvar o novo livro?')
}
