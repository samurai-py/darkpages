# Darkpages

Aplicativo para escrever, planejar e diagramar livros: manuscrito, fichas de personagens e lugares, quadro de enredo, revisão, e exportação para PDF, EPUB e DOCX. Tema padrão preto e vermelho.

É um **projeto pessoal**. Eu uso para escrever os meus livros e deixo o código e os instaladores aqui para quem quiser usar. Não é um produto: não há suporte, e as coisas mudam quando eu preciso.

## Instalar (Windows)

Baixe o instalador (`.exe`) ou a versão portátil em [Releases](../../releases). O app não é assinado digitalmente, então o Windows mostra "O Windows protegeu o computador": clique em **Mais informações** e depois em **Executar assim mesmo**.

## Rodar pelo código

Precisa de Node 22.

```bash
npm ci
npm run setup      # baixa o Typst (PDF), as fontes e o dicionário de sinônimos
npm run dev        # janela do app
npm run web        # modo web em http://127.0.0.1:4747
npm test
```

## IA (opcional)

Nada de IA é obrigatório. Em **Ajustes › IA**: Ollama (local), sua assinatura do Claude ou do ChatGPT pelos programas oficiais já logados na máquina, ou chave de API (Anthropic, OpenAI, Gemini, Groq). O texto do livro só sai do computador com provedores de nuvem, e o app diz qual está em uso. Com Ollama, tudo fica na máquina.

No Windows, para as assinaturas o app usa o programa em formato `.exe`; se o seu foi instalado por npm (arquivo `.cmd`), aponte o `.exe` em `FOLIO_CLAUDE_BIN` ou `FOLIO_CODEX_BIN`.

## Corretor sem internet (opcional)

`npm run languagetool` baixa e liga o LanguageTool oficial só para a sua máquina (precisa de Java; o script é para Linux e macOS). Depois escolha o servidor próprio em **Ajustes › Revisor**.

## Segurança do modo web

O modo web não tem senha: quem alcançar o endereço usa o app, que lê e grava arquivos e usa as suas chaves de IA. Ele escuta só em `127.0.0.1` por padrão. **Não exponha na internet.** Para usar de outro aparelho, use uma rede privada (por exemplo Tailscale) e defina `FOLIO_HOST` e `FOLIO_ALLOWED_HOSTS`.

## Dados

Os livros ficam em pastas comuns no seu computador (texto em Markdown). As chaves de API ficam no `settings.json` do app, com permissão restrita, e não vão para o Google Drive nem para este repositório. A sincronização opcional com o Google Drive envia só os arquivos do livro.

Os nomes internos ainda usam "folio" (pasta `~/Folio`, variáveis `FOLIO_*`) por herança do nome antigo.

## Licença

MIT. Componentes de terceiros em [NOTICE.md](NOTICE.md).
