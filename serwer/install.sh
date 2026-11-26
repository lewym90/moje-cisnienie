#!/usr/bin/env bash
# Instaluje (albo aktualizuje) serwer aplikacji Ciśnienie obok istniejących aplikacji.
# Dodaje tylko: /opt/cisnienie (własny Node + kod), /var/lib/cisnienie (baza i kopie), /etc/cisnienie (klucz szyfrowania),
# użytkownika systemowego cisnienie, usługę cisnienie, polecenia cisnienie-kod i cisnienie-konta oraz własną trasę w /etc/caddy/conf.d.
# Niczego innego nie zmienia. Przy błędzie trasy Caddy wycofuje ją.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_SUSPEND=1
DIR=/opt/cisnienie
DANE=/var/lib/cisnienie
PORT=18945

main() {
[ "$(id -u)" -eq 0 ] || { echo "Uruchom jako root (najpierw: sudo -i)."; exit 1; }
command -v caddy >/dev/null || { echo "STOP: ten skrypt wymaga działającego Caddy."; exit 2; }
CF=/etc/caddy/Caddyfile
grep -q 'conf.d' "$CF" || { echo "STOP: Caddyfile nie wczytuje conf.d. Nic nie zmieniam."; exit 2; }
IP=$(curl -4fsS https://api.ipify.org)
HOST="${IP//./-}.sslip.io"
if ss -ltnpH "( sport = :$PORT )" | grep -q . && ! systemctl is-active --quiet cisnienie; then
  echo "STOP: port $PORT jest zajęty przez inną aplikację. Nic nie zmieniam."; exit 2
fi

echo "Sprawdzam, czy Twoje pozostałe aplikacje działają (przed zmianą)..."
PRZED=$(for u in "https://$HOST/midgard-api/zdrowie" "https://$HOST/lacznik-api/zdrowie" "https://$HOST/am-api/zdrowie" "https://$HOST/kucharz-import/health" "https://$HOST/smart-home-push/health"; do echo "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$u") $u"; done)

mkdir -p "$DIR" "$DANE"

# --- własny Node (nie dotyka systemowego ani innych aplikacji) ---
case "$(uname -m)" in x86_64) ARCH=x64 ;; aarch64|arm64) ARCH=arm64 ;; *) echo "STOP: nieznany procesor $(uname -m)"; exit 2 ;; esac
NODE="$DIR/node/bin/node"
if [ ! -x "$NODE" ] || [ "$("$NODE" -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  echo "Pobieram Node.js 24 (tylko dla aplikacji Ciśnienie)..."
  TMPN=$(mktemp -d)
  curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$TMPN/SUMS"
  FILE=$(grep -o "node-v[0-9.]*-linux-$ARCH.tar.xz" "$TMPN/SUMS" | head -1)
  curl -fsSL "https://nodejs.org/dist/latest-v24.x/$FILE" -o "$TMPN/$FILE"
  (cd "$TMPN" && grep " $FILE\$" SUMS | sha256sum -c - >/dev/null) || { echo "STOP: suma kontrolna Node się nie zgadza."; exit 2; }
  rm -rf "$DIR/node"; mkdir -p "$DIR/node"
  tar -xJf "$TMPN/$FILE" -C "$DIR/node" --strip-components=1
  rm -rf "$TMPN"
fi
echo "Node: $("$NODE" -v)"

# --- kod serwera z GitHuba ---
echo "Pobieram najnowszą wersję z GitHuba..."
TMP=$(mktemp -d)
curl -fsSL https://codeload.github.com/lewym90/moje-cisnienie/tar.gz/main | tar -xz -C "$TMP"
rm -rf "$DIR/app.nowy"; mkdir -p "$DIR/app.nowy"
cp -r "$TMP"/moje-cisnienie-main/serwer/. "$DIR/app.nowy/"
cp "$TMP"/moje-cisnienie-main/js/core.js "$DIR/app.nowy/core.cjs"
rm -rf "$TMP" "$DIR/app"; mv "$DIR/app.nowy" "$DIR/app"

# --- konto systemowe, dane i klucz szyfrowania ---
id cisnienie >/dev/null 2>&1 || useradd --system --no-create-home --home-dir "$DANE" --shell /usr/sbin/nologin cisnienie
chown -R cisnienie:cisnienie "$DANE"; chmod 750 "$DANE"
mkdir -p /etc/cisnienie; chmod 700 /etc/cisnienie
if [ ! -s /etc/cisnienie/klucz ]; then
  ( umask 077; openssl rand -hex 32 > /etc/cisnienie/klucz )
  echo "Utworzono klucz szyfrowania pomiarów: /etc/cisnienie/klucz"
fi
chmod 600 /etc/cisnienie/klucz
[ -f /etc/cisnienie.env ] || ( umask 077; printf 'PORT=%s\nCISNIENIE_DANE=%s\n' "$PORT" "$DANE" > /etc/cisnienie.env )

cat > /etc/systemd/system/cisnienie.service <<EOS
[Unit]
Description=Ciśnienie — konta, kopie i przypomnienia
After=network-online.target
[Service]
User=cisnienie
Group=cisnienie
EnvironmentFile=/etc/cisnienie.env
LoadCredential=klucz:/etc/cisnienie/klucz
WorkingDirectory=$DIR/app
ExecStart=$NODE --no-warnings $DIR/app/cisnienie.mjs
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$DANE
ProtectHome=true
PrivateTmp=true
MemoryMax=300M
[Install]
WantedBy=multi-user.target
EOS

# --- polecenia administratora ---
cat > /usr/local/bin/cisnienie-kod <<EOS
#!/usr/bin/env bash
# Pokazuje albo zmienia kod zaproszenia (potrzebny do założenia konta w aplikacji Ciśnienie).
set -euo pipefail
[ "\$(id -u)" -eq 0 ] || { echo "Uruchom jako root."; exit 1; }
if [ \$# -eq 0 ]; then
  runuser -u cisnienie -- env CISNIENIE_DANE=$DANE $NODE --no-warnings $DIR/app/admin.mjs kod
  read -rp "Wpisz nowy kod zaproszenia (Enter = bez zmian): " K </dev/tty || true
  [ -n "\${K:-}" ] && runuser -u cisnienie -- env CISNIENIE_DANE=$DANE $NODE --no-warnings $DIR/app/admin.mjs kod "\$K"
else
  runuser -u cisnienie -- env CISNIENIE_DANE=$DANE $NODE --no-warnings $DIR/app/admin.mjs kod "\$1"
fi
EOS
cat > /usr/local/bin/cisnienie-konta <<EOS
#!/usr/bin/env bash
# Lista kont aplikacji Ciśnienie; "cisnienie-konta reset LOGIN" daje nowe hasło, "cisnienie-konta usun LOGIN" usuwa konto.
set -euo pipefail
[ "\$(id -u)" -eq 0 ] || { echo "Uruchom jako root."; exit 1; }
if [ "\${1:-}" = "usun" ]; then
  read -rp "Na pewno usunąć konto \${2:-} razem ze wszystkimi pomiarami? (t/N): " O </dev/tty
  [[ "\$O" =~ ^[tT] ]] || { echo "Anulowano."; exit 0; }
  runuser -u cisnienie -- env CISNIENIE_DANE=$DANE $NODE --no-warnings $DIR/app/admin.mjs usun "\${2:-}"
elif [ "\${1:-}" = "reset" ]; then
  runuser -u cisnienie -- env CISNIENIE_DANE=$DANE $NODE --no-warnings $DIR/app/admin.mjs reset "\${2:-}"
else
  runuser -u cisnienie -- env CISNIENIE_DANE=$DANE $NODE --no-warnings $DIR/app/admin.mjs konta
fi
EOS
chmod 755 /usr/local/bin/cisnienie-kod /usr/local/bin/cisnienie-konta

systemctl daemon-reload
systemctl enable cisnienie >/dev/null 2>&1
systemctl restart cisnienie
sleep 2

# --- trasa w Caddy: tylko własny plik w conf.d ---
LC=/etc/caddy/conf.d/cisnienie.caddy
if [ ! -f "$LC" ]; then
  printf 'handle_path /cisnienie-api/* {\n\treverse_proxy 127.0.0.1:%s\n}\n' "$PORT" > "$LC"
  chown --reference="$CF" "$LC"; chmod 644 "$LC"
  if ! caddy validate --config "$CF" --adapter caddyfile >/dev/null 2>&1; then rm -f "$LC"; echo "STOP: Caddy nie przyjął trasy. Wycofałem ją, nic się nie zmieniło."; exit 2; fi
  if ! systemctl reload caddy; then
    rm -f "$LC"; systemctl reload caddy 2>/dev/null || true
    echo "STOP: Caddy nie przeładował konfiguracji. Wycofałem trasę, Twoje aplikacje działają jak wcześniej."; exit 2
  fi
  sleep 2
fi

echo
if curl -fsS --max-time 20 "https://$HOST/cisnienie-api/zdrowie" -o /tmp/cisnienie-zdrowie.json; then
  echo "Status: OK  $(cat /tmp/cisnienie-zdrowie.json)"
else
  echo "Status: BŁĄD, https://$HOST/cisnienie-api/zdrowie nie odpowiada."
  journalctl -u cisnienie -n 15 --no-pager; exit 2
fi

if grep -q '"kod":false' /tmp/cisnienie-zdrowie.json; then
  echo
  echo "=============================================="
  echo "  Ustaw KOD ZAPROSZENIA. Każdy, komu go podasz,"
  echo "  założy w aplikacji własne konto."
  echo "=============================================="
  while :; do
    read -rp "Kod zaproszenia (min. 4 znaki, np. Serce2026): " K </dev/tty || { echo "Ustaw go później poleceniem: cisnienie-kod"; break; }
    [ "${#K}" -ge 4 ] && { runuser -u cisnienie -- env CISNIENIE_DANE=$DANE $NODE --no-warnings $DIR/app/admin.mjs kod "$K"; break; }
    echo "Za krótki, spróbuj jeszcze raz."
  done
else
  echo "Kod zaproszenia jest już ustawiony. Pokażesz/zmienisz go poleceniem: cisnienie-kod"
fi

echo; echo "Twoje pozostałe aplikacje (przed → po):"
for u in "https://$HOST/midgard-api/zdrowie" "https://$HOST/lacznik-api/zdrowie" "https://$HOST/am-api/zdrowie" "https://$HOST/kucharz-import/health" "https://$HOST/smart-home-push/health"; do
  P=$(echo "$PRZED" | grep " $u\$" | cut -d' ' -f1)
  echo "  $P → $(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$u")  $u"
done
echo; echo "Aplikacja: https://lewym90.github.io/moje-cisnienie/"
echo; echo "CIŚNIENIE GOTOWE"
}
main </dev/null
