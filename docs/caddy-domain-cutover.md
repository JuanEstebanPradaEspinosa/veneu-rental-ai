# Caddy + HTTPS reference for Allusion Booking

Reference for putting `venue.allusion.ventures` in front of the Allusion Booking app on the Hetzner VPS, terminating TLS in Caddy and reverse-proxying to the existing Express backend.

**Initial cutover:** 2026-04-28 (`venue.juanestebanpradaespinosa.com`)
**Renamed to current domain:** 2026-04-29 (`venue.allusion.ventures`)
**VPS:** Hetzner, public IP `195.201.232.211`, Tailscale `100.117.202.57`
**Active domain:** `venue.allusion.ventures`
**Legacy domain (redirected):** `venue.juanestebanpradaespinosa.com`

---

## Architecture

```
Internet ──HTTPS:443──> Caddy ──HTTP:3001──> Express (PM2: allusion-booking)
                        (Let's Encrypt        bound to 127.0.0.1
                         auto-renew)          serves /api/* + Vite dist/
```

- Caddy terminates TLS, handles HTTP/2 + HTTP/3, auto-provisions and renews certificates via Let's Encrypt.
- Express on `127.0.0.1:3001` serves both `/api/*` and the built Vite frontend (same-origin SPA fallback). It is **not** reachable from the public internet directly — only through Caddy.
- No CORS needed at runtime because frontend and backend share an origin.

## Public port surface

| Port | Bind | Purpose |
|------|------|---------|
| 22   | `0.0.0.0` | SSH |
| 80   | `0.0.0.0` | Caddy (auto-redirects to 443) |
| 443  | `0.0.0.0` | Caddy (HTTPS, HTTP/2, HTTP/3 via QUIC) |
| 3001 | `127.0.0.1` | Express — localhost-only, reverse-proxied by Caddy |

## DNS

| Record | Type | Value |
|--------|------|-------|
| `venue.allusion.ventures` | A | `195.201.232.211` |
| `venue.juanestebanpradaespinosa.com` | A | `195.201.232.211` (kept for redirect) |

Verify with:
```
dig +short venue.allusion.ventures A
```

DNS must propagate **before** reloading Caddy, otherwise the Let's Encrypt HTTP-01 challenge fails for the new host.

---

## Renaming the domain — single command

Single source of truth: `VENUE_HOST` in `backend/.env`. The backend derives `FRONTEND_URL` from it (see `backend/src/config/site.js`); CORS, Stripe `success_url`, and confirmation-email links all flow from that one value.

To rename:

```bash
scripts/set-domain.sh venue.newdomain.com
```

The script:
1. Updates `VENUE_HOST` in `backend/.env`.
2. Rewrites the primary site block in `/etc/caddy/Caddyfile` (legacy redirect blocks left intact).
3. Validates and reloads Caddy.
4. Restarts the PM2 app with `--update-env`.
5. Smoke-tests the new host.

Manual follow-ups it cannot do:

- **Stripe Dashboard → Developers → Webhooks** — update endpoint URL to `https://<new>/api/stripe/webhook`. If Stripe issues a new signing secret, update `STRIPE_WEBHOOK_SECRET` in `backend/.env` and `pm2 restart allusion-booking --update-env`.
- **Slack app config (api.slack.com)** — update **Interactivity & Shortcuts → Request URL** to `https://<new>/api/slack/actions`. Same for Event Subscriptions if used.
- **DNS** — add an A record for the new host pointing to `195.201.232.211` before running the script (Let's Encrypt issuance will fail otherwise).
- **Caddyfile legacy redirect** — if you want to keep links to the *previous* domain working, append a new redirect block (see below).

---

## Caddy configuration

File: `/etc/caddy/Caddyfile`

```caddyfile
venue.allusion.ventures {
    reverse_proxy localhost:3001
}

# Legacy domain redirects — keeps old links (Stripe receipts, emails, bookmarks)
# working after a rename. Add new lines here when retiring more hosts.
venue.juanestebanpradaespinosa.com {
    redir https://venue.allusion.ventures{uri} permanent
}
```

`reverse_proxy` defaults handle everything this app needs:

- Pass-through of all headers (`Host`, cookies, body)
- Auto-injection of `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`
- WebSocket upgrade tunneling (out of the box)
- Streaming pass-through of request bodies (so the Stripe webhook raw-body verification keeps working)
- Default timeouts: 3s dial, 2m keepalive

### Why no `handle /api/*` or `try_files`

Most Caddy + Vite tutorials split the config into a `handle /api/*` block (proxied to Node) and a `handle` fallback (static `file_server` + `try_files {path} /index.html`). That pattern is correct **only when Caddy serves the built static assets directly**. In this project, Express already serves the Vite `dist/` and handles SPA fallback (see `backend/src/index.js`), so there is nothing for Caddy to split — one `reverse_proxy` line is sufficient and avoids duplicating the static-serving path.

### Apply config changes manually (without the script)

```bash
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak
sudo install -m 644 -o root -g root /tmp/Caddyfile.new /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
sudo journalctl -u caddy -f   # watch for "certificate obtained successfully"
```

### Rollback

```bash
sudo cp /etc/caddy/Caddyfile.bak /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

---

## Backend configuration

### `backend/.env`

```
VENUE_HOST=venue.allusion.ventures
# FRONTEND_URL=  # uncomment to override (e.g. http://localhost:5173 for dev)
```

`VENUE_HOST` is the single source of truth. `FRONTEND_URL` is derived from it in `backend/src/config/site.js` — set `FRONTEND_URL` explicitly only as a dev-time override.

It is consumed in three places:
- Stripe Checkout `success_url` (`backend/src/services/stripe.js`)
- Booking confirmation email links (`backend/src/services/email.js`)
- CORS `Access-Control-Allow-Origin` header (`backend/src/index.js`)

### Localhost-only bind

Express binds to localhost only so the public IP cannot bypass HTTPS:

```js
app.listen(PORT, '127.0.0.1', () => { ... });
```

### Restart PM2

```bash
pm2 restart allusion-booking --update-env
```

`--update-env` is required because PM2 caches env vars from when the process was first started; without it, the `VENUE_HOST` change would not take effect.

---

## Verification

After reload, in order:

```bash
# Express bound to localhost only
ss -tlnp | grep 3001
# Expect: 127.0.0.1:3001 (NOT 0.0.0.0:3001 or *:3001)

# Localhost path works
curl -sI http://127.0.0.1:3001/api/health

# Public IP on :3001 is closed (should hang/refuse)
curl --max-time 4 -sI http://195.201.232.211:3001/

# HTTPS site end-to-end
curl -sI https://venue.allusion.ventures/api/health
# Expect: HTTP/2 200, header `via: 1.1 Caddy`,
#         access-control-allow-origin: https://venue.allusion.ventures

# Legacy redirect
curl -sI https://venue.juanestebanpradaespinosa.com
# Expect: HTTP/2 308 (or 301), location: https://venue.allusion.ventures/
```

---

## Third-party dashboard updates

These cannot be automated from the box and must be done manually after a domain change.

### Stripe

**Stripe Dashboard → Developers → Webhooks**

- Endpoint URL: `https://venue.allusion.ventures/api/stripe/webhook`
- Events: `checkout.session.completed`, `payment_intent.succeeded`
- After saving, copy the **Signing secret** (`whsec_...`) and set in `backend/.env`:

  ```
  STRIPE_WEBHOOK_SECRET=whsec_<real_value>
  ```

- Restart: `pm2 restart allusion-booking --update-env`
- Test with **Send test webhook** button — should respond `200 OK`. `400 Webhook Error` means the signing secret is wrong.

### Slack

**api.slack.com → Your Apps → [Allusion app]**

- **Interactivity & Shortcuts → Request URL:**
  `https://venue.allusion.ventures/api/slack/actions`
- **Event Subscriptions** (if used): same URL.
- Fill in real credentials in `backend/.env`:

  ```
  SLACK_BOT_TOKEN=xoxb-<real>
  SLACK_SIGNING_SECRET=<real>
  ```

- Restart: `pm2 restart allusion-booking --update-env`
- Reinstall the app to the workspace if scopes changed or this is a first install.

### Google (OAuth + APIs)

The runtime reads a pre-issued token from `/home/trader/.hermes/google_token.json` and does **not** perform a live OAuth callback, so no redirect URI needs to be live for normal operation.

If/when re-authorizing (token revoked, scope change):

- **Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs** — add the redirect URI used by whichever script mints the token (typically a local one-shot, not the production app).
- **OAuth consent screen** — promote from "Testing" to "In production" if not already, otherwise refresh tokens expire every 7 days.

### Odoo

No domain-side changes. Odoo does not call back into the app — the app calls into Odoo. Update env vars when ready:

```
ODOO_URL=https://<your-instance>.odoo.com
ODOO_DB=<db>
ODOO_USERNAME=<user>
ODOO_PASSWORD=<password>
```

Restart PM2 after editing.

---

## Outstanding placeholders in `backend/.env`

As of 2026-04-29, these env vars are still placeholder strings and the corresponding integrations will not work end-to-end until filled in:

- `SLACK_BOT_TOKEN` — `xoxb-your-token-here`
- `SLACK_SIGNING_SECRET` — `your-signing-secret-here`
- `STRIPE_WEBHOOK_SECRET` — `whsec_your_webhook_secret_here`
- `ODOO_URL` / `ODOO_DB` / `ODOO_USERNAME` / `ODOO_PASSWORD` — placeholders

Stripe checkout (with the real `STRIPE_SECRET_KEY`) does work; only the webhook callback fails signature verification until `STRIPE_WEBHOOK_SECRET` is real.

---

## Operational notes

- **Cert renewal:** automatic. Caddy renews ~30 days before expiry. No cron, no certbot. Watch with `journalctl -u caddy | grep -i cert`.
- **Logs:** Caddy → `journalctl -u caddy`. App → `pm2 logs allusion-booking` (or files in `~/projects/allusion-booking/logs/`).
- **Reload vs restart:** `systemctl reload caddy` is zero-downtime and applies Caddyfile changes without dropping in-flight connections. Use `restart` only if the binary is upgraded.
- **Hetzner Cloud Firewall:** if a network firewall is attached to the VPS in the Hetzner console, ensure inbound TCP 80 and 443 are open and TCP 3001 is **not** open externally. (Nothing inside the VM listens on `:3001` externally now, but defense in depth.)
- **Stripe webhook raw body:** the webhook router is mounted before `express.json()` in `backend/src/index.js`. Do not reorder middleware — Stripe signature verification requires the unparsed body.
