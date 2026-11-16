const URL_SAFE_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomBytes(length: number): Uint8Array {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return buf;
}

/**
 * Generates a cryptographically secure 144-bit URL-safe room identifier.
 */
export function generateSecureRoomId(): string {
  const bytes = randomBytes(24);
  let id = 'rm_';
  for (let i = 0; i < bytes.length; i++) {
    id += URL_SAFE_ALPHABET[bytes[i] & 63];
  }
  return id;
}

/**
 * Generates a human-shareable secure random 6-character room code (e.g. "A7K9P2").
 */
export function generateSecureRoomCode(): string {
  const bytes = randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

/**
 * Generates a cryptographically secure player identifier and ephemeral session secret.
 */
export function generateSecurePlayerId(): string {
  const bytes = randomBytes(16);
  let id = 'pl_';
  for (let i = 0; i < bytes.length; i++) {
    id += URL_SAFE_ALPHABET[bytes[i] & 63];
  }
  return id;
}

export function generateSecureSessionToken(): string {
  const bytes = randomBytes(32);
  let token = '';
  for (let i = 0; i < bytes.length; i++) {
    token += bytes[i].toString(16).padStart(2, '0');
  }
  return token;
}

export function generateSecureWorldSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % 899999) + 100000;
}

/**
 * Generates a cryptographically secure public player ID (e.g. "WA-7K4P9X2M").
 */
export function generateSecurePublicProfileId(): string {
  const bytes = randomBytes(8);
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `WA-${suffix}`;
}

/**
 * Generates a cryptographically secure 4-digit player tag (e.g. "4827").
 */
export function generateSecurePlayerTag(): string {
  const buf = new Uint16Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 10000).padStart(4, '0');
}

/**
 * Generates a private internal account identifier kept separate from publicProfileId.
 */
export function generateSecureAccountId(): string {
  const bytes = randomBytes(18);
  let id = 'acc_';
  for (let i = 0; i < bytes.length; i++) {
    id += URL_SAFE_ALPHABET[bytes[i] & 63];
  }
  return id;
}

export function generateSecureRecordId(prefix: string): string {
  const bytes = randomBytes(12);
  let id = `${prefix}_`;
  for (let i = 0; i < bytes.length; i++) {
    id += URL_SAFE_ALPHABET[bytes[i] & 63];
  }
  return id;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
