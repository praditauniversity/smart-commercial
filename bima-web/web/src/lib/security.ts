import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { requireEnv, requireEnvNumber } from './env';

const IV_LENGTH = 16;

/**
 * Encrypts sensitive credentials (like OpenRouter API keys) with AES-256-CBC
 */
export function encryptSecret(text: string): string {
  if (!text) return '';
  const key = crypto.createHash('sha256').update(requireEnv('ENCRYPTION_SECRET_KEY')).digest();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts encrypted credentials
 */
export function decryptSecret(encryptedText: string): string {
  if (!encryptedText || !encryptedText.includes(':')) return '';
  const key = crypto.createHash('sha256').update(requireEnv('ENCRYPTION_SECRET_KEY')).digest(); // throws when unset
  try {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    return '';
  }
}

/**
 * Mask secret string for UI display (e.g. sk-or-v1-abc...1234)
 */
export function maskSecret(secret: string | null | undefined): string {
  if (!secret) return 'Belum Dikonfigurasi';
  if (secret.length <= 8) return '••••••••';
  return `${secret.substring(0, 4)}••••••••${secret.substring(secret.length - 4)}`;
}

export interface UserJwtPayload {
  userId: string;
  email: string;
  role: 'surveyor' | 'admin';
  name: string;
}

/**
 * JWT_SECRET and SESSION_MAX_AGE_SECONDS must come from the environment; there is deliberately no
 * built-in fallback (a publicly-known default would let anyone forge a session cookie).
 * Read lazily so `next build` does not fail when the variables are only provided at runtime.
 */
export function signJwtToken(payload: UserJwtPayload): string {
  return jwt.sign(payload, requireEnv('JWT_SECRET'), { expiresIn: requireEnvNumber('SESSION_MAX_AGE_SECONDS') });
}

export function verifyJwtToken(token: string): UserJwtPayload | null {
  const secret = requireEnv('JWT_SECRET'); // throws when unset, so it is loud instead of "everyone is logged out"
  try {
    return jwt.verify(token, secret) as UserJwtPayload;
  } catch {
    return null;
  }
}
