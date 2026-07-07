# VoteHub Dashboard

VoteHub is a secure dashboard for managing Discord bot vote webhooks and vote-related automation.

It is designed to handle vote events from bot listing platforms, protect private dashboard access with Discord authentication, and provide a clean interface for monitoring vote activity.

## Features

- Discord OAuth authentication
- Private dashboard access
- Vote webhook handling
- Protected API routes
- Secure session-based login
- CORS origin allowlist
- Production security checks
- Fastify backend
- React + Vite frontend
- Static production build support
- Cloudflare-compatible deployment
- Security-focused NGINX configuration
- Custom logo, favicon, and web app manifest

## Tech Stack

### Frontend

- React
- Vite
- Tailwind CSS

### Backend

- Node.js
- Fastify
- Fastify Cookie
- Fastify Session
- Discord OAuth

### Deployment

- NGINX
- PM2
- Cloudflare
- Linux VPS

## Project Structure

```txt
votehub/
├── public/
│   ├── favicon.ico
│   ├── favicon.svg
│   ├── apple-touch-icon.png
│   ├── web-app-manifest-192x192.png
│   ├── web-app-manifest-512x512.png
│   ├── site.webmanifest
│   └── votehub-logo.png
├── src/
│   └── ...
├── server/
│   └── index.js
├── docs/
│   └── nginx/
│       ├── vote.tutorapide.xyz.cloudflare-flexible.conf
│       └── vote.tutorapide.xyz.full-strict.conf
├── index.html
├── package.json
├── .env.example
├── LICENSE
└── README.md
```

## Security Notice

Before publishing this repository, make sure that no secrets are committed.

Never commit:

```txt
.env
.env.local
.env.production
Discord bot token
Discord client secret
Session secret
Encryption secret
Webhook secret
Database credentials
Cloudflare API tokens
Production logs
```

Recommended `.gitignore`:

```gitignore
node_modules/
dist/
.env
.env.*
!.env.example
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.DS_Store
*.zip
```

## Environment Variables

Create a `.env` file from `.env.example`.

```env
NODE_ENV=production

# Server
PORT=3000
PUBLIC_URL=https://vote.example.com

# Discord OAuth
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_REDIRECT_URI=https://vote.example.com/api/auth/callback

# Security
SESSION_SECRET=replace_with_a_long_random_secret
ENCRYPTION_SECRET=replace_with_a_long_random_secret

# CORS
ALLOWED_ORIGINS=https://vote.example.com

# Optional
DISABLE_AUTH=false
```

Generate secure secrets with:

```bash
openssl rand -hex 32
```

## Installation

```bash
git clone https://github.com/your-username/votehub.git
cd votehub
npm install
```

## Development

```bash
npm run dev
```

Depending on your configuration, the frontend and backend may run on different ports.

Example:

```txt
Frontend: http://localhost:5173
Backend:  http://localhost:3000
```

## Production Build

```bash
npm run build
```

Start the production server:

```bash
npm start
```

Or use PM2:

```bash
pm2 start server/index.js --name votehub-dashboard
pm2 save
```

Restart after updates:

```bash
pm2 restart votehub-dashboard
```

## NGINX Deployment

The project includes production-ready NGINX examples in:

```txt
docs/nginx/
```

### Cloudflare Flexible SSL

Use this configuration only if Cloudflare SSL/TLS mode is set to **Flexible**:

```txt
docs/nginx/vote.tutorapide.xyz.cloudflare-flexible.conf
```

In Flexible mode:

```txt
Browser -> Cloudflare = HTTPS
Cloudflare -> VPS = HTTP
```

Because of this, HSTS should remain disabled.

Install example:

```bash
sudo cp docs/nginx/vote.tutorapide.xyz.cloudflare-flexible.conf /etc/nginx/sites-available/votehub
sudo ln -s /etc/nginx/sites-available/votehub /etc/nginx/sites-enabled/votehub
sudo nginx -t
sudo systemctl reload nginx
```

### Cloudflare Full Strict

For a stronger production setup, switch Cloudflare SSL/TLS mode to **Full (strict)** and install a valid origin certificate on the VPS.

Then use:

```txt
docs/nginx/vote.tutorapide.xyz.full-strict.conf
```

In Full Strict mode:

```txt
Browser -> Cloudflare = HTTPS
Cloudflare -> VPS = HTTPS
```

This mode allows HSTS to be safely enabled.

## Security Headers

Security headers should be managed in one place only.

Recommended setup:

```txt
NGINX = security headers
Node/Fastify = application logic
Cloudflare = proxy, DNS, and cache
```

The NGINX configuration includes:

```txt
Content-Security-Policy
X-Content-Type-Options
X-Frame-Options
Referrer-Policy
Permissions-Policy
Cross-Origin-Opener-Policy
Cross-Origin-Resource-Policy
Origin-Agent-Cluster
```

HSTS is enabled only in the Full Strict NGINX configuration.

## OWASP ZAP Scan

VoteHub was tested with OWASP ZAP after the security changes.

Latest result:

```txt
High:   0
Medium: 0
Low:    1
Info:   1
```

The remaining low alert was related to HSTS not being enabled while Cloudflare was still configured in Flexible SSL mode.

This is expected. It should only be fixed after switching Cloudflare to Full Strict.

## Public Repository Checklist

Before making the repository public:

- [ ] Remove all real `.env` files
- [ ] Keep only `.env.example`
- [ ] Check `.gitignore`
- [ ] Remove tokens from code and comments
- [ ] Remove private Discord server IDs if needed
- [ ] Remove production logs
- [ ] Remove old ZIP files
- [ ] Run `npm audit`
- [ ] Run a fresh OWASP ZAP scan after deployment
- [ ] Verify that `DISABLE_AUTH=false` in production
- [ ] Verify that `SESSION_SECRET` and `ENCRYPTION_SECRET` are strong
- [ ] Verify that CORS only allows trusted domains

## Useful Commands

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Build the project:

```bash
npm run build
```

Start production:

```bash
npm start
```

Restart with PM2:

```bash
pm2 restart votehub-dashboard
```

Check NGINX configuration:

```bash
sudo nginx -t
```

Reload NGINX:

```bash
sudo systemctl reload nginx
```

Check HTTP headers:

```bash
curl -I https://vote.example.com
```

Run dependency audit:

```bash
npm audit
```

## Recommended GitHub Description

```txt
Secure dashboard for Discord bot vote webhooks, built with React, Vite, Fastify, NGINX, and Cloudflare-ready deployment.
```

## Recommended GitHub Topics

```txt
discord
discord-bot
dashboard
webhook
vote-webhook
fastify
react
vite
cloudflare
nginx
security
owasp-zap
```

## License

This project is licensed under the MIT License.

See the `LICENSE` file for details.

## Disclaimer

This project is provided as-is.

Security depends on your final deployment, environment variables, Discord application configuration, Cloudflare settings, and NGINX configuration.

Always test your production deployment before exposing it publicly.
