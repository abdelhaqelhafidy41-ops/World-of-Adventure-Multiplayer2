import type { OwnPlayerProfile } from '../../../shared/profileTypes';
import { resolveMultiplayerServerUrl } from '../multiplayer/multiplayerConfig';

const AUTH_SESSION_STORAGE_KEY = 'woa_auth_session_v1';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface AuthSession {
  publicProfileId: string;
  sessionToken: string;
  verifiedWithServer: boolean;
  createdAt: number;
}

export interface AuthUser {
  publicProfileId: string;
  verifiedWithServer: boolean;
}

function getCryptoRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
    return bytes;
  }
  throw new Error('Cryptographically secure random generator is unavailable.');
}

export function generateSecureLocalPublicProfileId(): string {
  const bytes = getCryptoRandomBytes(8);
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `WA-${suffix}`;
}

export function generateSecureLocalPlayerTag(): string {
  const bytes = getCryptoRandomBytes(2);
  const val = ((bytes[0] << 8) | bytes[1]) % 10000;
  return String(val).padStart(4, '0');
}

function generateLocalSessionToken(): string {
  const bytes = getCryptoRandomBytes(24);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

class AuthServiceImpl {
  private cachedSession: AuthSession | null = null;
  private initialized = false;

  private ensureLoaded(): void {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<AuthSession> | null;
      if (
        parsed &&
        typeof parsed.publicProfileId === 'string' &&
        typeof parsed.sessionToken === 'string' &&
        parsed.publicProfileId.startsWith('WA-') &&
        parsed.sessionToken.length >= 16
      ) {
        this.cachedSession = {
          publicProfileId: parsed.publicProfileId,
          sessionToken: parsed.sessionToken,
          verifiedWithServer: Boolean(parsed.verifiedWithServer),
          createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
        };
      }
    } catch {
      this.cachedSession = null;
    }
  }

  private persistSession(): void {
    try {
      if (!this.cachedSession) {
        localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
      } else {
        localStorage.setItem(
          AUTH_SESSION_STORAGE_KEY,
          JSON.stringify(this.cachedSession),
        );
      }
    } catch {
      // Ignore storage quota or private browsing errors
    }
  }

  public getSession(): AuthSession | null {
    this.ensureLoaded();
    return this.cachedSession ? { ...this.cachedSession } : null;
  }

  public getCurrentUser(): AuthUser | null {
    const sess = this.getSession();
    if (!sess) return null;
    return {
      publicProfileId: sess.publicProfileId,
      verifiedWithServer: sess.verifiedWithServer,
    };
  }

  public getBearerHeaders(): Record<string, string> {
    const sess = this.getSession();
    if (!sess || !sess.verifiedWithServer || !sess.sessionToken) {
      return {};
    }
    return { Authorization: `Bearer ${sess.sessionToken}` };
  }

  public signIn(input: {
    publicProfileId: string;
    sessionToken?: string;
    verifiedWithServer: boolean;
  }): AuthSession {
    this.ensureLoaded();
    const session: AuthSession = {
      publicProfileId: input.publicProfileId,
      sessionToken: input.sessionToken || generateLocalSessionToken(),
      verifiedWithServer: input.verifiedWithServer,
      createdAt: Date.now(),
    };
    this.cachedSession = session;
    this.persistSession();
    return { ...session };
  }

  public async refreshSession(): Promise<OwnPlayerProfile | null> {
    const sess = this.getSession();
    const baseUrl = resolveMultiplayerServerUrl();
    if (!sess || !sess.verifiedWithServer || !baseUrl) {
      return null;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return null;
    }
    try {
      const res = await fetch(`${baseUrl}/api/profile/me`, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${sess.sessionToken}`,
        },
      });
      if (!res.ok) return null;
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        profile?: OwnPlayerProfile;
      } | null;
      return data?.ok && data.profile ? data.profile : null;
    } catch {
      return null;
    }
  }

  public signOut(): void {
    this.initialized = true;
    this.cachedSession = null;
    this.persistSession();
  }
}

export const AuthService = new AuthServiceImpl();
