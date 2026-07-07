import { config } from '../lib/config.js';
import { clearSessionCookie, currentUser, ensureAllowedDiscordUser, setSessionCookie } from '../lib/auth.js';
import { discordAvatarUrl } from '../lib/discord.js';
import { audit } from '../lib/audit.js';

export async function authRoutes(app) {
  app.get('/api/auth/discord', async (_, reply) => {
    const url = new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('client_id', config.discordClientId);
    url.searchParams.set('redirect_uri', config.discordRedirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'identify');
    return reply.redirect(url.toString());
  });

  app.get('/api/auth/discord/callback', async (request, reply) => {
    const code = request.query.code;
    if (!code) return reply.redirect(`${config.frontendUrl}/?auth=missing_code`);
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.discordClientId,
        client_secret: config.discordClientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.discordRedirectUri,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) return reply.redirect(`${config.frontendUrl}/?auth=token_error`);
    const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const user = await userRes.json();
    if (!userRes.ok) return reply.redirect(`${config.frontendUrl}/?auth=user_error`);
    user.avatarUrl = discordAvatarUrl(user, 128);
    const allowed = await ensureAllowedDiscordUser(user);
    if (!allowed) return reply.redirect(`${config.frontendUrl}/?auth=forbidden`);
    setSessionCookie(reply, allowed);
    request.admin = { discordId: allowed.discordId, username: allowed.username, role: allowed.role };
    await audit(request, 'Admin logged in', 'session', { name: 'Dashboard session' });
    return reply.redirect(config.frontendUrl);
  });

  app.get('/api/auth/me', async (request) => ({ user: await currentUser(request), authDisabled: config.disableAuth }));

  app.post('/api/auth/logout', async (request, reply) => {
    const user = await currentUser(request);
    request.admin = user || { discordId: 'unknown', username: 'Unknown' };
    await audit(request, 'Admin logged out', 'session', { name: 'Dashboard session' });
    clearSessionCookie(reply);
    return { ok: true };
  });
}
