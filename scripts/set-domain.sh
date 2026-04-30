#!/usr/bin/env bash
# Change the public domain for the Allusion Booking site.
#
# Usage:  scripts/set-domain.sh <new-domain>
# Example: scripts/set-domain.sh venue.allusion.ventures
#
# What it touches:
#   - backend/.env                  -> VENUE_HOST=<new-domain>
#   - /etc/caddy/Caddyfile          -> primary site block uses <new-domain>
#                                      (legacy redirect block left intact)
#   - reloads Caddy (sudo)
#   - restarts the PM2 app with refreshed env vars
#
# Requires: sudo for the Caddyfile rewrite + reload.

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <new-domain>" >&2
  exit 1
fi

NEW_HOST="$1"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/backend/.env"
CADDYFILE="/etc/caddy/Caddyfile"
PM2_APP="allusion-booking"

# Locate pm2 (often installed via npx, not on PATH)
PM2_BIN="$(command -v pm2 || true)"
if [[ -z "$PM2_BIN" ]]; then
  PM2_BIN="$(find "$HOME/.npm/_npx" -maxdepth 4 -name pm2 -type f -executable 2>/dev/null | head -1 || true)"
fi
if [[ -z "$PM2_BIN" ]]; then
  echo "pm2 binary not found — install or set PATH" >&2
  exit 1
fi

CURRENT_HOST="$(grep -E '^VENUE_HOST=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
echo "Current VENUE_HOST: ${CURRENT_HOST:-<unset>}"
echo "New VENUE_HOST:     $NEW_HOST"
if [[ "$CURRENT_HOST" == "$NEW_HOST" ]]; then
  echo "No change — exiting."
  exit 0
fi

# 1) backend/.env
sed -i.bak "s|^VENUE_HOST=.*|VENUE_HOST=$NEW_HOST|" "$ENV_FILE"

# 2) Caddyfile — rewrite the PRIMARY site block (the first non-comment site address).
#    The legacy-redirect block stays untouched so old links keep redirecting.
sudo cp "$CADDYFILE" "$CADDYFILE.bak.$(date +%s)"
sudo awk -v new="$NEW_HOST" '
  BEGIN { replaced = 0 }
  # Replace the first site-address line (a bare "host {" not starting with # or whitespace)
  !replaced && /^[a-z0-9.-]+ \{[[:space:]]*$/ {
    sub(/^[a-z0-9.-]+/, new)
    replaced = 1
  }
  { print }
' "$CADDYFILE" | sudo tee "$CADDYFILE.new" >/dev/null
sudo mv "$CADDYFILE.new" "$CADDYFILE"

# 3) Validate + reload Caddy
sudo caddy validate --config "$CADDYFILE"
sudo systemctl reload caddy

# 4) Restart PM2 with refreshed env
"$PM2_BIN" restart "$PM2_APP" --update-env

echo
echo "Done. Verifying:"
echo "  Caddyfile primary host:"
grep -m1 -E '^[a-z0-9.-]+ \{' "$CADDYFILE" || true
echo "  curl -sI https://$NEW_HOST"
curl -sI "https://$NEW_HOST" | head -5 || true

cat <<EOF

Manual follow-ups (NOT done by this script):
  - Stripe dashboard: update webhook endpoint to https://$NEW_HOST/api/stripe/webhook
  - Slack app config: update Interactivity request URL to https://$NEW_HOST/api/slack/actions
  - DNS: ensure an A record for $NEW_HOST points to this VPS
EOF
