# VoteHub Dashboard

Dashboard Fastify + React pour gérer les webhooks de votes de plusieurs bots Discord sans modifier `config.js` et sans reboot.

## Ce qui est connecté

- Backend **Fastify**, pas Express.
- Connexion Discord OAuth2 pour sécuriser le dashboard.
- Allowlist admin via `OWNER_DISCORD_IDS`.
- MongoDB avec Mongoose pour stocker les bots, intégrations, webhooks, logs et audit logs.
- Tokens bot et tokens webhook Discord chiffrés avec AES-256-GCM.
- Ajout d'un bot avec token : VoteHub appelle Discord et récupère automatiquement le nom, l'ID et l'avatar du bot.
- Routes webhook dynamiques :
  - `POST /webhook/:botSlug/:integrationSlug`
  - compatibilité legacy : `POST /webhook/:path`
- Logs des votes et logs d'audit.
- UI React connectée aux vraies routes API.

## Installation

```bash
npm install
cp .env.example .env
npm run dev
```

Frontend : `http://localhost:5173`
API Fastify : `http://localhost:4000`

## Configuration Discord OAuth

Dans le Developer Portal Discord, crée ou utilise une application OAuth2.

Redirect URL en développement :

```txt
http://localhost:4000/api/auth/discord/callback
```

Ajoute dans `.env` :

```env
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_REDIRECT_URI=http://localhost:4000/api/auth/discord/callback
OWNER_DISCORD_IDS=ton_id_discord
```

## Ajouter un bot

Dans le dashboard : `Bots` → `Add Bot`.

Tu peux entrer :

- Bot ID / Client ID
- Bot token
- nom optionnel
- avatar optionnel

Le backend valide le token avec Discord via `/users/@me`. Si le token est valide, le nom et l'avatar sont récupérés automatiquement.

> Important : Discord ne fournit pas un endpoint public simple pour lister tous les bots de ton Developer Portal. Le plus fiable est d'ajouter chaque bot une fois avec son token. Ensuite VoteHub peut le gérer sans reboot.

## Créer une intégration de vote

`Vote Integrations` → `Add Integration`.

Exemple Top.gg :

- Vote list name : `Top.gg`
- Slug : `topgg`
- Payload user field : `user`
- Authorization token : vide pour générer un token automatiquement, ou celui donné par la bot list.

URL finale :

```txt
https://ton-domaine.fr/webhook/slug-du-bot/topgg
```

Le header attendu est :

```txt
Authorization: TON_TOKEN_INTEGRATION
```

## Créer le webhook Discord de notification

`Notification Webhooks` → `Add Notification Webhook`.

Colle l'URL webhook Discord complète. Le backend extrait automatiquement l'ID et le token, puis chiffre le token en base.

## Migration depuis l'ancien projet

Place ton ancien `config.js` à la racine ou indique son chemin :

```bash
LEGACY_CONFIG_PATH=../Webhook-UpVotes/config.js npm run migrate:legacy
```

La migration crée :

- 1 ManagedBot
- les VoteListIntegrations
- 1 NotificationTarget

## Production

```bash
npm run build
pm2 start ecosystem.config.js
```

En production, Fastify sert le build React depuis `dist/`.

## Variables importantes

Voir `.env.example`.

## Top.gg v1 webhooks with `whs_` secrets

Top.gg's new webhook system generates a webhook secret prefixed with `whs_` and signs each request with `x-topgg-signature`.
VoteHub now supports both:

- Top.gg v1 signature verification with `x-topgg-signature`
- legacy bot-list webhooks using the `Authorization` header

### How to configure Top.gg locally with ngrok

1. Start VoteHub:

```bash
npm run dev
```

2. Expose the Fastify API:

```bash
ngrok http 4000
```

3. Put the ngrok URL in `.env`:

```env
PUBLIC_BASE_URL=https://your-ngrok-domain.ngrok-free.app
FRONTEND_URL=http://localhost:5173
```

4. Restart VoteHub.

5. In VoteHub, create a Vote Integration:

```txt
Vote list name: Top.gg
Slug: topgg
Webhook secret / token: whs_xxxxxxxxxxxxx
Payload user field: data.user.platform_id
Upvote URL: https://top.gg/bot/YOUR_BOT_ID/vote
```

6. In Top.gg, paste the final webhook URL shown in VoteHub:

```txt
https://your-ngrok-domain.ngrok-free.app/webhook/YOUR_BOT_SLUG/topgg
```

VoteHub stores the `whs_` secret in the integration token field and automatically verifies the Top.gg v1 signature.

## Multi bot-list webhook compatibility

This version supports:

- Top.gg v1 webhooks with `x-topgg-signature` and `whs_...` secret.
- Legacy webhook systems that send a token in `Authorization`.
- Common legacy token variants: `Bearer TOKEN`, `Token TOKEN`, `Bot TOKEN`, `x-webhook-token`, `x-votehub-token`, `x-dbl-token`, `x-botlist-token`.
- Common voter ID payload paths: `user`, `user.id`, `user_id`, `userId`, `discordUserId`, `voter`, `voter.id`, `member.user.id`, and Top.gg v1 `data.user.platform_id`.

For legacy bot lists, set the integration `Webhook secret / token` to the secret/token configured on the bot-list website. Set `Payload user field` to the path used by the provider. If unsure, try `user` first, then check Vote Logs > raw payload.

For Top.gg v1, use:

- Secret/token: `whs_...`
- Payload user field: `data.user.platform_id`


## Production sécurité / NGINX

Le projet contient maintenant deux configs NGINX prêtes à utiliser :

- `docs/nginx/vote.tutorapide.xyz.cloudflare-flexible.conf` : à utiliser tant que Cloudflare est en SSL Flexible.
- `docs/nginx/vote.tutorapide.xyz.full-strict.conf` : à utiliser après passage Cloudflare en Full strict avec certificat sur le VPS.

Important : avec Cloudflare Flexible, ne pas activer HSTS côté VPS.

Voir aussi `SECURITY_DEPLOYMENT.md`.
