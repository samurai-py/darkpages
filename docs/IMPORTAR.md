# Importar regras e dados do livro

Um arquivo de texto (formato **folio-livro**, versão 1) descreve o livro inteiro: fichas, capítulos, cartões do Enredo, regras para a IA e páginas do livro. O modelo comentado está em [`modelo-livro.yaml`](modelo-livro.yaml); o app também oferece "Baixar modelo" e "Copiar modelo".

No Folio:

- **Biblioteca › livro em destaque › "Importar regras e dados…"**: aplica o arquivo no livro.
- **Biblioteca › "+ Novo livro" › "Criar a partir de arquivo…"**: cria um livro novo (precisa de `livro: titulo` e `livro: autor`).
- **Biblioteca › "Exportar como arquivo"**: gera o mesmo formato a partir do livro (em `export/`), para editar fora e importar de volta. O texto dos capítulos só vai se você marcar a opção.

Antes de gravar, o app mostra uma **prévia** (o que vai criar, atualizar, avisos e erros). Com qualquer erro, "Importar" fica desligado. Ao importar, o Folio guarda uma versão do manuscrito (Versões › "Antes de importar regras e dados").

## O que cada seção faz

| Seção | O que faz |
|---|---|
| `livro` | Título, autor e subtítulo; `meta_palavras` (meta do livro) e `meta_capitulo`. |
| `perfil` | Perfil da obra para a IA: narrador não confiável, ambiguidade deliberada, não linear, notas (tom, regras do universo). |
| `nomes` | Como capítulos e partes são chamados ("Primeiro Círculo", "Parte um") e se a numeração recomeça a cada parte. |
| `fichas` | Personagens, lugares, objetos, grupos, divindades: apelidos, papel, grupo, notas, campos e relações. Um campo pode mudar ao longo do livro (`muda: [{ a_partir_de: capítulo, valor }]`). |
| `capitulos` | Estrutura do livro na ordem: capítulos, prólogo, epílogo e partes; sinopse, ponto de vista, cenário, notas, epígrafe e, se quiser, o texto. |
| `cartoes` | Cartões do quadro do Enredo: cenas, viradas, ideias, **fatos** (verdade do livro, com `revelar_em` e `termos`), **crenças** de um personagem e **fios soltos**. `imagem:` aponta para um arquivo que já está na pasta `assets/` do livro (só o nome, ex.: `rio.png`; png, jpg, jpeg ou webp); se o arquivo não existir, vira aviso e a imagem é ignorada. Entram como do autor (canônicos), arrumados em grade abaixo dos que já existem. |
| `ligacoes` | Setas entre cartões (`causa` ou `relacao`). |
| `manter` | Palavras e trechos que o Revisor nunca deve apontar. |
| `paginas` | Dedicatória, epígrafe do livro, editora, cidade, ano, ISBN, agradecimentos, sobre o autor, posfácio e sinopse da contracapa. Texto preenchido liga a página. |

Toda seção é opcional.

## Como o arquivo casa com o livro

- **Por nome e título**, sem diferenciar maiúsculas nem acentos (`VIKTOR` = `Viktor`, `segunda morte` = `Segunda Morte`).
- **O que já existe é atualizado** só nos campos que aparecem no arquivo; o que falta é **criado**. **Nada é apagado.**
- **Valor vazio (`""`) é ignorado**: não apaga o que já está no livro.
- **Ordem**: capítulos e partes novos entram no **fim** do livro, na ordem do arquivo. Os que já existem **não mudam de lugar**; se todos os capítulos do arquivo já existem, a ordem do livro fica como está.
- **Texto de capítulo**: capítulo novo recebe o `texto:`. Em capítulo que já existe, o texto só é trocado com `substituir_texto: true`.
- **Referências** (`pov`, `cenario`, `com`, `fichas`, `crenca_de`, `capitulo`, `a_partir_de`, `revelar_em`, `resolve_em`, `de`/`para`) valem para o que já está no livro **e** para o que o próprio arquivo cria. Referência que não existe vira **aviso** e só aquele campo é ignorado.
- **Erros** (com o número da linha): YAML mal escrito, item sem nome/título, valor fora da lista (ex.: `tipo: heroi`), nome repetido no arquivo. Chave desconhecida é só aviso.
- Importar o mesmo arquivo de novo não duplica nada.
- Limite: 2 MB por arquivo.

## Preencher com o ChatGPT ou o Claude

Cole este modelo e peça para preencher a partir das suas notas. Por exemplo:

> Abaixo está um modelo de arquivo do Folio (YAML). Preencha-o a partir das minhas notas que vêm depois. Mantenha exatamente os nomes das chaves e os valores permitidos indicados nos comentários; apague as seções que não tiverem informação; escreva os nomes das fichas e os títulos dos capítulos sempre iguais quando forem citados em outro lugar. Responda só com o arquivo.
>
> [cole o modelo]
>
> Minhas notas: [cole as notas]

Depois cole a resposta em "Importar regras e dados…", veja a prévia e corrija o que aparecer em erros ou avisos.
