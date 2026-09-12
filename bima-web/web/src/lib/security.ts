import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const ENCRYPTION_KEY = process.env.ENCRYPTION_SECRET_KEY || 'bima-aes-encryption-key-32bytes!';
const JWT_SECRET = process.env.JWT_SECRET || 'bima-jwt-super-secret-key-32-chars-min-key!';
const IV_LENGTH = 16;

/**
 * Encrypts sensitive credentials (like OpenRouter API keys) with AES-256-CBC
 */
export function encryptSecret(text: string): string {
  if (!text) return '';
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
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
  try {
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
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

export function signJwtToken(payload: UserJwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyJwtToken(token: string): UserJwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as UserJwtPayload;
  } catch {
    return null;
  }
}
