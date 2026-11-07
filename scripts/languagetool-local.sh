#!/usr/bin/env bash
# LanguageTool local para o Revisor do Folio (Ajustes → Revisor → Servidor próprio).
#
# Baixa o pacote oficial (https://languagetool.org/download/LanguageTool-stable.zip,
# LGPL 2.1+) uma vez para ~/.local/share/folio/languagetool (fora do repositório)
# e sobe o servidor HTTP em 127.0.0.1:8081. Por padrão o servidor do
# LanguageTool só aceita conexões desta máquina (sem --public); o Folio usa
# http://127.0.0.1:8081.
# Comando conforme https://dev.languagetool.org/http-server e o --help do 6.6:
#   java -cp languagetool-server.jar org.languagetool.server.HTTPServer --config server.properties --port 8081
# Sem --allow-origin de propósito: o Folio chama o servidor pelo processo
# principal (Node), não pelo navegador, e "--allow-origin" sem valor libera
# qualquer site aberto no navegador a usar o servidor (Access-Control-Allow-Origin: *).
#
# Uso:
#   scripts/languagetool-local.sh              baixa (se preciso) e roda em primeiro plano (Ctrl+C para parar)
#   scripts/languagetool-local.sh --baixar     só baixa/atualiza o pacote
#   scripts/languagetool-local.sh --systemd    mostra um serviço systemd de usuário (não instala nada)
#   scripts/languagetool-local.sh --atualizar  apaga o pacote baixado e baixa de novo
# Variáveis: FOLIO_LT_DIR (pasta), FOLIO_LT_PORTA (porta, padrão 8081), FOLIO_LT_MEM (heap Java, padrão 1g)
# Requer Java 17+ (o LanguageTool 6.x exige).
set -euo pipefail

URL="https://languagetool.org/download/LanguageTool-stable.zip"
BASE="${FOLIO_LT_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/folio/languagetool}"
PORTA="${FOLIO_LT_PORTA:-8081}"
MEM="${FOLIO_LT_MEM:-1g}"

erro() { echo "✗ $*" >&2; exit 1; }

pasta_lt() {
  # a pasta descompactada mais recente (LanguageTool-<versão>)
  [[ -d "$BASE" ]] || return 0
  find "$BASE" -maxdepth 1 -type d -name 'LanguageTool-*' | sort -V | tail -n 1
}

checar_java() {
  command -v java >/dev/null 2>&1 || erro "Java não encontrado. Instale o Java 17+ (ex.: sudo apt install openjdk-17-jre-headless)."
  local v
  v="$(java -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -n 1)"
  if [[ -n "$v" && "$v" -lt 17 ]]; then erro "O LanguageTool precisa do Java 17+ (encontrei Java $v)."; fi
}

baixar() {
  command -v unzip >/dev/null 2>&1 || erro "Preciso do unzip (ex.: sudo apt install unzip)."
  mkdir -p "$BASE"
  TMP_LT="$(mktemp -d "$BASE/.baixando.XXXXXX")"; tmp="$TMP_LT"
  trap 'rm -rf "${TMP_LT:-}"' EXIT
  echo "→ Baixando $URL (~250 MB)…" >&2
  curl -fL --retry 3 --progress-bar -o "$tmp/lt.zip" "$URL" || erro "Falha no download."
  unzip -tq "$tmp/lt.zip" >/dev/null || erro "O arquivo baixado está corrompido."
  echo "→ Descompactando em $BASE…" >&2
  unzip -q "$tmp/lt.zip" -d "$tmp/x"
  local dentro
  dentro="$(find "$tmp/x" -maxdepth 1 -type d -name 'LanguageTool-*' | head -n 1)"
  [[ -n "$dentro" && -f "$dentro/languagetool-server.jar" ]] || erro "Pacote inesperado: languagetool-server.jar não encontrado."
  rm -rf "${BASE:?}/$(basename "$dentro")"
  mv "$dentro" "$BASE/"
  rm -rf "$tmp"
  trap - EXIT
  echo "✓ $(basename "$dentro") em $BASE" >&2
}

garantir() {
  local d
  d="$(pasta_lt)"
  if [[ -z "$d" || ! -f "$d/languagetool-server.jar" ]]; then baixar; d="$(pasta_lt)"; fi
  # configuração mínima (o servidor aceita --config; sem limites extras)
  [[ -f "$d/server.properties" ]] || printf '# configurações do servidor LanguageTool (veja --help)\n' >"$d/server.properties"
  echo "$d"
}

case "${1:-}" in
  --baixar)
    garantir >/dev/null
    ;;
  --atualizar)
    d="$(pasta_lt)"
    [[ -n "$d" ]] && rm -rf "$d"
    garantir >/dev/null
    ;;
  --systemd)
    checar_java
    d="$(garantir)"
    cat <<EOF
# Salve em ~/.config/systemd/user/folio-languagetool.service e rode:
#   systemctl --user daemon-reload
#   systemctl --user enable --now folio-languagetool
[Unit]
Description=LanguageTool local para o Folio (127.0.0.1:$PORTA)
After=network.target

[Service]
ExecStart=$(command -v java) -Xmx$MEM -cp "$d/languagetool-server.jar" org.languagetool.server.HTTPServer --config "$d/server.properties" --port $PORTA
WorkingDirectory=$d
Restart=on-failure

[Install]
WantedBy=default.target
EOF
    ;;
  ""|--rodar)
    checar_java
    d="$(garantir)"
    echo "→ LanguageTool em http://127.0.0.1:$PORTA (só esta máquina). Ctrl+C para parar."
    cd "$d"
    exec java "-Xmx$MEM" -cp "$d/languagetool-server.jar" org.languagetool.server.HTTPServer \
      --config "$d/server.properties" --port "$PORTA"
    ;;
  -h|--help)
    sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
    ;;
  *)
    erro "Opção desconhecida: $1 (use --help)"
    ;;
esac
