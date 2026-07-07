import crypto from 'node:crypto';
import { config } from './config.js';

const key = crypto.createHash('sha256').update(config.encryptionSecret).digest();

export function encrypt(value = '') {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

export function decrypt(value = '') {
  if (!value) return '';
  const raw = Buffer.from(value, 'base64url');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', config.sessionSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySession(token) {
  try {
    if (!token || !token.includes('.')) return null;
    const [body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', config.sessionSecret).update(body).digest('base64url');
    const sigBuffer = Buffer.from(sig || '');
    const expectedBuffer = Buffer.from(expected);

    if (sigBuffer.length !== expectedBuffer.length) return null;
    if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function maskSecret(value = '', visible = 4) {
  if (!value) return '';
  if (value.length <= visible * 2) return `${value.slice(0, 2)}********`;
  return `${value.slice(0, visible)}${'*'.repeat(Math.min(16, value.length - visible * 2))}${value.slice(-visible)}`;
}

export function randomToken(prefix = 'vote') {
  return `${prefix}_${crypto.randomBytes(24).toString('hex')}`;
}
