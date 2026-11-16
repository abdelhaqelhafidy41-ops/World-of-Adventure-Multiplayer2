import { isValidRoomCode, isValidRoomId } from '../../../shared/multiplayerProtocol';
import type {} from '../../utils/platformExit';
import { resolvePublicAppUrl } from './multiplayerConfig';

declare global {
  interface Window {
    __handleMultiplayerJoinLink?: (url: string) => void;
  }
}

/**
 * Resolves the configured production domain from environment variables without hardcoding,
 * falling back to the current web origin when running on HTTP(S).
 */
export function getMultiplayerAppDomain(): string {
  return resolvePublicAppUrl() ?? '';
}

/**
 * Builds a shareable join link. Uses `/?join=<ROOM_ID>` on subpath / static hosts
 * such as GitHub Pages, or `<domain>/join/<ROOM_ID>` on root origins.
 */
export function buildRoomShareLink(
  roomIdOrCode: string,
  domainOverride?: string | null,
): string {
  const cleanId = encodeURIComponent(roomIdOrCode.trim());
  const domain = (domainOverride ?? getMultiplayerAppDomain()).replace(/\/+$/, '');
  if (!domain) {
    return `/join/${cleanId}`;
  }
  try {
    const parsed = new URL(domain);
    const pathname = parsed.pathname.replace(/\/+$/, '');
    if (pathname.length > 0 || parsed.hostname.toLowerCase().endsWith('.github.io')) {
      return `${domain}/?join=${cleanId}`;
    }
  } catch {
    // Fall back to /join path if domain is not a standard URL
  }
  return `${domain}/join/${cleanId}`;
}

/**
 * Extracts a room ID or room code from `/join/<id>`, `#/join/<id>`, `?join=<id>`,
 * or custom-scheme `worldofadventure://join/<id>` URLs.
 */
export function extractJoinTargetFromUrl(inputUrl?: string): string | null {
  const raw =
    inputUrl ??
    (typeof window !== 'undefined' ? window.location.href : '');
  if (!raw) return null;

  let candidate: string | null = null;
  try {
    const parsed = new URL(raw, 'https://placeholder.local');
    const queryJoin = parsed.searchParams.get('join');
    if (queryJoin) {
      candidate = queryJoin.trim();
    } else if (parsed.hostname.toLowerCase() === 'join' && parsed.pathname.length > 1) {
      candidate = decodeURIComponent(parsed.pathname.replace(/^\/+/, '').split('/')[0] ?? '').trim();
    } else {
      const pathMatch = parsed.pathname.match(/\/join\/([^/?#]+)/i);
      if (pathMatch?.[1]) {
        candidate = decodeURIComponent(pathMatch[1]).trim();
      } else if (parsed.hash) {
        const hashMatch = parsed.hash.match(/#\/?join\/([^/?#]+)/i);
        if (hashMatch?.[1]) {
          candidate = decodeURIComponent(hashMatch[1]).trim();
        }
      }
    }
  } catch {
    const fallbackMatch = raw.match(/(?:\/join\/|join\/|[?&]join=)([a-zA-Z0-9_-]+)/i);
    candidate = fallbackMatch?.[1] ?? null;
  }

  if (!candidate) return null;
  if (isValidRoomId(candidate) || isValidRoomCode(candidate)) {
    return candidate;
  }
  return null;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to execCommand fallback
  }

  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export type ShareInviteResult =
  | { status: 'shared'; method: 'android-native' | 'web-share' }
  | { status: 'cancelled' }
  | { status: 'copied-fallback'; copied: boolean };

export async function shareRoomInvite(params: {
  title: string;
  text: string;
  url: string;
}): Promise<ShareInviteResult> {
  if (
    typeof window !== 'undefined' &&
    typeof window.AndroidNativeBridge?.shareText === 'function'
  ) {
    window.AndroidNativeBridge.shareText(params.title, params.text, params.url);
    return { status: 'shared', method: 'android-native' };
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: params.title,
        text: params.text,
        url: params.url,
      });
      return { status: 'shared', method: 'web-share' };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { status: 'cancelled' };
      }
      // Fall back to COPY LINK when Web Share is unsupported/blocked in iframe or desktop
    }
  }

  const copied = await copyTextToClipboard(params.url);
  return { status: 'copied-fallback', copied };
}
