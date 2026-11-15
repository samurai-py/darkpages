# Componentes de terceiros

- **Snowball (português)**: algoritmo de radicais traduzido em `src/shared/stemmer-pt.ts`. Licença BSD de 3 cláusulas, texto completo no cabeçalho do arquivo.
- **Typst**: baixado por `npm run fetch:typst` (Apache-2.0) e usado para gerar PDF.
- **Fontes do miolo**: baixadas por `npm run fetch:fonts` (SIL OFL), cada uma com a própria licença na pasta.
- **Dicionário de sinônimos (MyThes pt_BR)**: baixado por `npm run fetch:tesauro`, com as licenças junto dos arquivos.
- **LanguageTool**: não vem no app. O script `scripts/languagetool-local.sh` baixa o oficial (LGPL) na sua máquina.
