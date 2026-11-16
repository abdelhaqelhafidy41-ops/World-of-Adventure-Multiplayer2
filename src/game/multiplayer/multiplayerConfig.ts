export type AppEnvironment = 'development' | 'staging' | 'production';

export interface MultiplayerEnvironmentConfig {
  environment: AppEnvironment;
  multiplayerUrl: string | null;
  publicAppUrl: string | null;
}

export interface MultiplayerConfigDiagnostic {
  configured: boolean;
  baseUrl: string | null;
  webSocketUrl: string | null;
  environment: AppEnvironment;
  publicAppUrl: string | null;
}

export interface MultiplayerServerHealthResult {
  configured: boolean;
  ok: boolean;
  reachable: boolean;
  status: number | null;
  service: string | null;
  environment: string | null;
  error: string | null;
}

/**
 * Normalizes a multiplayer server URL into a canonical HTTP(S) base URL.
 * Supports `https://`, `http://`, `wss://`, and `ws://` inputs.
 * `wss://` automatically maps to `https://` for HTTP API calls, and
 * `ws://` automatically maps to `http://`.
 */
export function normalizeMultiplayerBaseUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'wss:') {
      parsed.protocol = 'https:';
    } else if (parsed.protocol === 'ws:') {
      parsed.protocol = 'http:';
    } else if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin + parsed.pathname.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function normalizeHttpOnlyUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin + parsed.pathname.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/**
 * Converts an HTTP(S) or WS(S) base URL (plus optional relative path/query)
 * into a normalized WebSocket URL (`https://` -> `wss://`, `http://` -> `ws://`).
 */
export function toWebSocketUrl(
  baseOrUrl: string,
  pathAndQuery = '',
): string | null {
  const normalizedBase = normalizeMultiplayerBaseUrl(baseOrUrl);
  if (!normalizedBase) return null;

  const baseUrl = new URL(normalizedBase);
  const basePath = baseUrl.pathname.replace(/\/+$/, '');
  let targetUrl: URL;

  if (pathAndQuery && /^wss?:\/\//i.test(pathAndQuery.trim())) {
    targetUrl = new URL(pathAndQuery.trim());
  } else if (pathAndQuery) {
    const cleanedPath = pathAndQuery.startsWith('/')
      ? pathAndQuery
      : `/${pathAndQuery}`;
    targetUrl = new URL(`${basePath}${cleanedPath}`, baseUrl.origin);
  } else {
    targetUrl = new URL(baseUrl.toString());
    targetUrl.pathname = basePath || '';
  }

  if (targetUrl.protocol === 'https:') {
    targetUrl.protocol = 'wss:';
  } else if (targetUrl.protocol === 'http:') {
    targetUrl.protocol = 'ws:';
  } else if (targetUrl.protocol !== 'wss:' && targetUrl.protocol !== 'ws:') {
    return null;
  }

  const isLocalHost =
    targetUrl.hostname === 'localhost' ||
    targetUrl.hostname === '127.0.0.1' ||
    targetUrl.hostname === '[::1]';
  if (
    targetUrl.protocol === 'ws:' &&
    !isLocalHost &&
    typeof window !== 'undefined' &&
    window.location?.protocol === 'https:'
  ) {
    targetUrl.protocol = 'wss:';
  }

  return pathAndQuery ? targetUrl.toString() : targetUrl.toString().replace(/\/+$/, '');
}

export function resolveAppEnvironment(): AppEnvironment {
  const raw =
    typeof import.meta !== 'undefined'
      ? String(import.meta.env?.VITE_APP_ENV ?? '').trim().toLowerCase()
      : '';
  if (raw === 'production' || raw === 'prod') return 'production';
  if (raw === 'staging' || raw === 'stage') return 'staging';
  if (raw === 'development' || raw === 'dev') return 'development';

  if (typeof import.meta !== 'undefined' && import.meta.env?.PROD) {
    return 'production';
  }
  return 'development';
}

/**
 * Resolves the public Cloudflare Worker / Durable Objects multiplayer endpoint.
 * Never reads or returns secret keys; accepts HTTP(S) and WS(S) endpoints.
 */
export function resolveMultiplayerServerUrl(): string | null {
  if (typeof import.meta === 'undefined') return null;
  const primary = normalizeMultiplayerBaseUrl(import.meta.env?.VITE_MULTIPLAYER_URL);
  if (primary) return primary;
  return normalizeMultiplayerBaseUrl(import.meta.env?.VITE_MULTIPLAYER_WORKER_URL);
}

/**
 * Resolves the public web application URL used to build shareable room invite links.
 */
export function resolvePublicAppUrl(): string | null {
  if (typeof import.meta !== 'undefined') {
    const configured =
      normalizeHttpOnlyUrl(import.meta.env?.VITE_PUBLIC_APP_URL) ??
      normalizeHttpOnlyUrl(import.meta.env?.PUBLIC_APP_URL) ??
      normalizeHttpOnlyUrl(import.meta.env?.VITE_APP_URL);
    if (configured) return configured;
  }

  if (
    typeof window !== 'undefined' &&
    typeof window.location?.origin === 'string' &&
    /^https?:\/\//i.test(window.location.origin)
  ) {
    const origin = window.location.origin.replace(/\/+$/, '');
    if (window.location.hostname.toLowerCase().endsWith('.github.io')) {
      const firstSegment = (window.location.pathname || '')
        .split('/')
        .filter(Boolean)[0];
      if (firstSegment) {
        return `${origin}/${firstSegment}`;
      }
    }
    return origin;
  }

  return null;
}

/**
 * Builds a safe diagnostic snapshot from raw endpoint values without exposing secrets.
 */
export function buildMultiplayerConfig(
  rawMultiplayerUrl: unknown,
  environment: AppEnvironment = resolveAppEnvironment(),
  publicAppUrl: string | null = resolvePublicAppUrl(),
): MultiplayerConfigDiagnostic {
  const baseUrl = normalizeMultiplayerBaseUrl(rawMultiplayerUrl);
  const webSocketUrl = baseUrl ? toWebSocketUrl(baseUrl) : null;
  return {
    configured: Boolean(baseUrl && webSocketUrl),
    baseUrl,
    webSocketUrl,
    environment,
    publicAppUrl,
  };
}

/**
 * Safe diagnostic report for the active multiplayer endpoint configuration.
 * Never exposes secrets or tokens.
 */
export function getMultiplayerConfig(): MultiplayerConfigDiagnostic {
  const rawUrl =
    typeof import.meta !== 'undefined'
      ? import.meta.env?.VITE_MULTIPLAYER_URL ||
        import.meta.env?.VITE_MULTIPLAYER_WORKER_URL
      : undefined;
  return buildMultiplayerConfig(
    rawUrl,
    resolveAppEnvironment(),
    resolvePublicAppUrl(),
  );
}

export function getMultiplayerEnvironmentConfig(): MultiplayerEnvironmentConfig {
  return {
    environment: resolveAppEnvironment(),
    multiplayerUrl: resolveMultiplayerServerUrl(),
    publicAppUrl: resolvePublicAppUrl(),
  };
}

export function formatMultiplayerDiagnosticReport(
  config: MultiplayerConfigDiagnostic = getMultiplayerConfig(),
): string {
  return [
    `Multiplayer configured: ${config.configured}`,
    `Multiplayer URL: ${config.baseUrl ?? 'not configured'}`,
    `WebSocket URL: ${config.webSocketUrl ?? 'not configured'}`,
    `Environment: ${config.environment}`,
  ].join('\n');
}

let hasLoggedMultiplayerDiagnostic = false;

export function logMultiplayerDiagnosticOnce(): void {
  if (hasLoggedMultiplayerDiagnostic || typeof window === 'undefined') return;
  hasLoggedMultiplayerDiagnostic = true;
  console.info(`[Multiplayer]\n${formatMultiplayerDiagnosticReport()}`);
}

/**
 * Probes the Worker `/health` endpoint (no authentication required) to verify
 * live connectivity and service readiness.
 */
export async function checkMultiplayerServerHealth(
  baseUrlOverride?: string | null,
  timeoutMs = 5000,
): Promise<MultiplayerServerHealthResult> {
  const baseUrl =
    normalizeMultiplayerBaseUrl(baseUrlOverride) ?? resolveMultiplayerServerUrl();
  if (!baseUrl) {
    return {
      configured: false,
      ok: false,
      reachable: false,
      status: null,
      service: null,
      environment: null,
      error: 'NOT_CONFIGURED',
    };
  }

  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer =
    controller && typeof setTimeout !== 'undefined'
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  try {
    const res = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      ...(controller ? { signal: controller.signal } : {}),
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      service?: string;
      environment?: string;
    } | null;

    const ok = res.ok && Boolean(data?.ok);
    return {
      configured: true,
      ok,
      reachable: true,
      status: res.status,
      service: typeof data?.service === 'string' ? data.service : null,
      environment: typeof data?.environment === 'string' ? data.environment : null,
      error: ok ? null : `HTTP_${res.status}`,
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      reachable: false,
      status: null,
      service: null,
      environment: null,
      error: err instanceof Error ? err.message : 'SERVER_UNREACHABLE',
    };
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}
