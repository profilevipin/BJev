#!/usr/bin/env bash
# Keep Folio reachable even when Cursor Preview port-forward fails.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-43123}"
HOST="${HOST:-0.0.0.0}"
TUNNEL_DIR="${TUNNEL_DIR:-/tmp/folio-tunnel}"
mkdir -p "$TUNNEL_DIR" data

if [ ! -d .next ]; then
  echo "[folio] No production build found; running npm run build…"
  npm run build
fi

# Start Cloudflare quick tunnel if available (best-effort).
start_tunnel() {
  local bin="$TUNNEL_DIR/cloudflared"
  if [ ! -x "$bin" ]; then
    curl -fsSL -o "$bin" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 || return 0
    chmod +x "$bin"
  fi
  pkill -f "[c]loudflared tunnel --url http://127.0.0.1:${PORT}" >/dev/null 2>&1 || true
  : > "$TUNNEL_DIR/tunnel.log"
  nohup "$bin" tunnel --url "http://127.0.0.1:${PORT}" --no-autoupdate >"$TUNNEL_DIR/tunnel.log" 2>&1 &
  (
    for _ in $(seq 1 40); do
      url="$(grep -aEo 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$TUNNEL_DIR/tunnel.log" | tail -1 || true)"
      if [ -n "${url:-}" ]; then
        echo "$url" > data/public-url.txt
        echo "[folio] Public preview: $url"
        exit 0
      fi
      sleep 1
    done
  ) &
}

start_tunnel || true
echo "[folio] Listening on http://${HOST}:${PORT}"
echo "[folio] If Cursor Preview shows ERR_CONNECTION_REFUSED, open data/public-url.txt or the Forwarded Ports plug menu and forward ${PORT}."
exec npx next start --hostname "$HOST" --port "$PORT"
