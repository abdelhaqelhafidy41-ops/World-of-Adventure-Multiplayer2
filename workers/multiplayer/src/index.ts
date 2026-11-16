import {
  isValidRoomCode,
  isValidRoomId,
} from '../../../shared/multiplayerProtocol';
import { isValidPublicPlayerId } from '../../../shared/profileTypes';
import type { CfEnv, CfExecutionContext } from './cfTypes';
import { MultiplayerRoomDO } from './MultiplayerRoomDO';
import { PlayerProfileDO } from './PlayerProfileDO';
import { IpRateLimiter } from './rateLimiter';
import { RoomDirectoryDO } from './RoomDirectoryDO';
import { generateSecureRoomId } from './roomId';

export { MultiplayerRoomDO, PlayerProfileDO, RoomDirectoryDO };

const httpRateLimiter = new IpRateLimiter(120, 60_000);
const roomCreateRateLimiter = new IpRateLimiter(8, 60_000);
const profileWriteRateLimiter = new IpRateLimiter(30, 60_000);
const searchRateLimiter = new IpRateLimiter(40, 60_000);
const inviteRateLimiter = new IpRateLimiter(20, 60_000);
const wsUpgradeRateLimiter = new IpRateLimiter(30, 60_000);
const MAX_HTTP_BODY_BYTES = 16_384;
const MAX_PROFILE_HTTP_BODY_BYTES = 64_000;

function parseAllowedOrigins(env: CfEnv): string[] | null {
  const configured = (env.ALLOWED_ORIGINS ?? '*').trim();
  if (!configured || configured === '*') return null;
  const list = configured
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return list.length > 0 ? list : null;
}

function originMatchesList(origin: string, allowedList: string[]): boolean {
  const normalized = origin.trim().replace(/\/+$/, '');
  if (!normalized) return false;
  for (const pattern of allowedList) {
    if (pattern === '*' || pattern === normalized) {
      return true;
    }
    if (pattern.includes('*')) {
      const escaped = pattern
        .replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\*/g, '[^/]+');
      if (new RegExp(`^${escaped}$`, 'i').test(normalized)) {
        return true;
      }
    }
  }
  return false;
}

function isOriginAllowed(request: Request, env: CfEnv): boolean {
  const allowedList = parseAllowedOrigins(env);
  if (!allowedList) return true;
  const origin = request.headers.get('Origin') ?? '';
  // Native mobile (Capacitor/Android) or desktop clients may omit Origin or use capacitor://
  if (!origin) return true;
  return originMatchesList(origin, allowedList);
}

function getCorsHeaders(request: Request, env: CfEnv): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowedList = parseAllowedOrigins(env);

  let allowOrigin = '*';
  if (allowedList) {
    allowOrigin =
      origin && originMatchesList(origin, allowedList)
        ? origin
        : allowedList.find((item) => !item.includes('*')) ?? 'null';
  } else if (origin) {
    allowOrigin = origin;
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

function withCors(response: Response, corsHeaders: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders)) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function getClientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

async function parseBoundedJson(
  request: Request,
  maxBytes = MAX_HTTP_BODY_BYTES,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const declaredLen = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declaredLen) && declaredLen > maxBytes) {
    return { ok: false, status: 413, error: 'PAYLOAD_TOO_LARGE' };
  }
  const raw = await request.text().catch(() => '');
  const byteLen = new TextEncoder().encode(raw).byteLength;
  if (byteLen > maxBytes) {
    return { ok: false, status: 413, error: 'PAYLOAD_TOO_LARGE' };
  }
  if (!raw.trim()) {
    return { ok: true, data: {} };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, status: 400, error: 'INVALID_JSON_BODY' };
    }
    return { ok: true, data: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, status: 400, error: 'INVALID_JSON_BODY' };
  }
}

async function resolveVerifiedProfileIdentity(
  request: Request,
  body: Record<string, unknown> | null,
  env: CfEnv,
): Promise<Record<string, unknown> | null> {
  if (!env.PLAYER_PROFILES) return null;
  const authHeader = request.headers.get('Authorization') ?? '';
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  const rawToken =
    (bearerMatch ? bearerMatch[1].trim() : '') ||
    (typeof body?.profileSessionToken === 'string'
      ? body.profileSessionToken.trim()
      : '');
  if (!rawToken) return null;
  try {
    const stub = env.PLAYER_PROFILES.get(env.PLAYER_PROFILES.idFromName('global'));
    const res = await stub.fetch('https://profiles.internal/internal/resolve-session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profileSessionToken: rawToken }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok?: boolean;
      identity?: Record<string, unknown>;
    };
    return data.ok && data.identity ? data.identity : null;
  } catch {
    return null;
  }
}

async function forwardToProfiles(
  env: CfEnv,
  path: string,
  request: Request,
  method: string,
  bodyObj?: Record<string, unknown> | null,
): Promise<Response> {
  const stub = env.PLAYER_PROFILES.get(env.PLAYER_PROFILES.idFromName('global'));
  const headers = new Headers();
  const auth = request.headers.get('Authorization');
  if (auth) headers.set('Authorization', auth);
  if (bodyObj !== undefined) {
    headers.set('content-type', 'application/json');
    return stub.fetch(`https://profiles.internal${path}`, {
      method,
      headers,
      body: JSON.stringify(bodyObj ?? {}),
    });
  }
  return stub.fetch(`https://profiles.internal${path}`, { method, headers });
}

export default {
  async fetch(
    request: Request,
    env: CfEnv,
    _ctx: CfExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const cors = getCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/health') {
      return withCors(
        Response.json({
          ok: true,
          service: 'world-of-adventure-multiplayer2',
          environment: env.ENVIRONMENT ?? 'development',
          runtime: 'cloudflare-workers-durable-objects',
        }),
        cors,
      );
    }

    try {
    const clientIp = getClientIp(request);

    // WebSocket endpoint forwarding directly into the room Durable Object
    if (url.pathname === '/api/multiplayer/ws') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return withCors(
          Response.json(
            { ok: false, error: 'EXPECTED_WEBSOCKET_UPGRADE' },
            { status: 426 },
          ),
          cors,
        );
      }

      if (!isOriginAllowed(request, env)) {
        return withCors(
          Response.json({ ok: false, error: 'ORIGIN_NOT_ALLOWED' }, { status: 403 }),
          cors,
        );
      }

      if (!wsUpgradeRateLimiter.check(clientIp)) {
        return withCors(
          Response.json(
            { ok: false, error: 'RATE_LIMITED', message: 'Too many connection attempts.' },
            { status: 429 },
          ),
          cors,
        );
      }

      const roomId = url.searchParams.get('roomId') ?? '';
      if (!isValidRoomId(roomId)) {
        return withCors(
          Response.json({ ok: false, error: 'INVALID_ROOM_ID' }, { status: 400 }),
          cors,
        );
      }

      const roomStub = env.MULTIPLAYER_ROOMS.get(
        env.MULTIPLAYER_ROOMS.idFromName(roomId),
      );
      const forwardedHeaders = new Headers(request.headers);
      forwardedHeaders.set('X-Client-IP', clientIp);
      const forwardedReq = new Request(request.url, {
        method: request.method,
        headers: forwardedHeaders,
      });
      return roomStub.fetch(forwardedReq);
    }

    if (!httpRateLimiter.check(clientIp)) {
      return withCors(
        Response.json(
          { ok: false, error: 'RATE_LIMITED', message: 'Too many requests.' },
          { status: 429 },
        ),
        cors,
      );
    }

    // -------------------------------------------------------------------------
    // Player Profile & Social Identity Routes
    // -------------------------------------------------------------------------
    if (request.method === 'POST' && url.pathname === '/api/profile') {
      if (!profileWriteRateLimiter.check(clientIp)) {
        return withCors(
          Response.json({ ok: false, error: 'RATE_LIMITED', message: 'Too many profile requests.' }, { status: 429 }),
          cors,
        );
      }
      const parsed = await parseBoundedJson(request, MAX_PROFILE_HTTP_BODY_BYTES);
      if (!parsed.ok) {
        return withCors(Response.json({ ok: false, error: parsed.error }, { status: parsed.status }), cors);
      }
      return withCors(await forwardToProfiles(env, '/create', request, 'POST', parsed.data), cors);
    }

    if (request.method === 'GET' && url.pathname === '/api/profile/me') {
      return withCors(await forwardToProfiles(env, '/me', request, 'GET'), cors);
    }

    if (request.method === 'POST' && url.pathname === '/api/profile/update') {
      if (!profileWriteRateLimiter.check(clientIp)) {
        return withCors(
          Response.json({ ok: false, error: 'RATE_LIMITED', message: 'Too many profile updates.' }, { status: 429 }),
          cors,
        );
      }
      const parsed = await parseBoundedJson(request, MAX_PROFILE_HTTP_BODY_BYTES);
      if (!parsed.ok) {
        return withCors(Response.json({ ok: false, error: parsed.error }, { status: parsed.status }), cors);
      }
      return withCors(await forwardToProfiles(env, '/update', request, 'POST', parsed.data), cors);
    }

    if (request.method === 'POST' && url.pathname === '/api/profile/presence') {
      const parsed = await parseBoundedJson(request);
      if (!parsed.ok) {
        return withCors(Response.json({ ok: false, error: parsed.error }, { status: parsed.status }), cors);
      }
      return withCors(await forwardToProfiles(env, '/presence', request, 'POST', parsed.data), cors);
    }

    if (request.method === 'POST' && url.pathname === '/api/profile/stats') {
      const parsed = await parseBoundedJson(request);
      if (!parsed.ok) {
        return withCors(Response.json({ ok: false, error: parsed.error }, { status: parsed.status }), cors);
      }
      return withCors(await forwardToProfiles(env, '/stats/delta', request, 'POST', parsed.data), cors);
    }

    if (request.method === 'GET' && url.pathname === '/api/players/search') {
      if (!searchRateLimiter.check(clientIp)) {
        return withCors(
          Response.json({ ok: false, error: 'RATE_LIMITED', message: 'Too many searches.' }, { status: 429 }),
          cors,
        );
      }
      const q = url.searchParams.get('q') ?? '';
      return withCors(
        await forwardToProfiles(env, `/search?q=${encodeURIComponent(q)}`, request, 'GET'),
        cors,
      );
    }

    if (request.method === 'GET' && url.pathname.startsWith('/api/profile/')) {
      const publicId = decodeURIComponent(url.pathname.slice('/api/profile/'.length)).trim();
      if (!isValidPublicPlayerId(publicId)) {
        return withCors(
          Response.json({ ok: false, error: 'INVALID_PLAYER_ID' }, { status: 400 }),
          cors,
        );
      }
      return withCors(
        await forwardToProfiles(env, `/public?id=${encodeURIComponent(publicId)}`, request, 'GET'),
        cors,
      );
    }

    if (request.method === 'GET' && url.pathname === '/api/friends') {
      return withCors(await forwardToProfiles(env, '/friends', request, 'GET'), cors);
    }

    if (
      request.method === 'POST' &&
      (url.pathname === '/api/friends/request' || url.pathname === '/api/friend-requests/request')
    ) {
      const parsed = await parseBoundedJson(request);
      if (!parsed.ok) {
        return withCors(Response.json({ ok: false, error: parsed.error }, { status: parsed.status }), cors);
      }
      return withCors(await forwardToProfiles(env, '/friends/request', request, 'POST', parsed.data), cors);
    }

    if (
      request.method === 'POST' &&
      (url.pathname === '/api/friends/respond' || url.pathname === '/api/friend-requests/respond')
    ) {
      const parsed = await parseBoundedJson(request);
      if (!parsed.ok) {
        return withCors(Response.json({ ok: false, error: parsed.error }, { status: parsed.status }), cors);
      }
      return withCors(await forwardToProfiles(env, '/friends/respond', request, 'POST', parsed.data), cors);
    }

    if (request.method === 'POST' && url.pathname === '/api/friends/remove') {
      const parsed = await parseBoundedJson(request);
      if (!parsed.ok) {
        return withCors(Response.json({ ok: false, error: parsed.error }, { status: parsed.status }), cors);
      }
      return withCors(await forwardToProfiles(env, '/friends/remove', request, 'POST', parsed.data), cors);
    }

    if (request.method === 'POST' && url.pathname === '/api/blocks') {
      const parsed = await parseBoundedJson(request);
      if (!parsed.ok) {
        return withCors(Response.json({ ok: false, error: parsed.error }, { status: parsed.status }), cors);
      }
      return withCors(await forwardToProfiles(env, '/blocks/add', request, 'POST', parsed.data), cors);
    }

    if (request.method === 'POST' && url.pathname === '/api/blocks/remove') {
      const parsed = await parseBoundedJson(request);
      if (!parsed.ok) {
        return withCors(Response.json({ ok: false, error: parsed.error }, { status: parsed.status }), cors);
      }
      return withCors(await forwardToProfiles(env, '/blocks/remove', request, 'POST', parsed.data), cors);
    }

    if (request.method === 'GET' && url.pathname === '/api/messages') {
      const partnerId = url.searchParams.get('with') ?? '';
      return withCors(
        await forwardToProfiles(env, `/messages?with=${encodeURIComponent(partnerId)}`, request, 'GET'),
        cors,
      );
    }

    if (request.method === 'POST' && url.pathname === '/api/messages/send') {
      const parsed = await parseBoundedJson(request);
      if (!parsed.ok) {
        return withCors(Response.json({ ok: false, error: parsed.error }, { status: parsed.status }), cors);
      }
      return withCors(await forwardToProfiles(env, '/messages/send', request, 'POST', parsed.data), cors);
    }

    if (request.method === 'POST' && url.pathname === '/api/reports') {
      const parsed = await parseBoundedJson(request);
      if (!parsed.ok) {
        return withCors(Response.json({ ok: false, error: parsed.error }, { status: parsed.status }), cors);
      }
      return withCors(await forwardToProfiles(env, '/reports/submit', request, 'POST', parsed.data), cors);
    }

    const directoryStub = env.ROOM_DIRECTORY.get(
      env.ROOM_DIRECTORY.idFromName('global'),
    );

    // List public waiting rooms
    if (request.method === 'GET' && url.pathname === '/api/multiplayer/rooms') {
      const dirRes = await directoryStub.fetch('https://directory.internal/list');
      return withCors(dirRes, cors);
    }

    // Deterministic room expiration sweep helper (uses 72h ROOM_INACTIVE_TIMEOUT_MS against optional nowMs)
    if (request.method === 'POST' && url.pathname === '/api/multiplayer/rooms/expire-sweep') {
      const parsed = await parseBoundedJson(request);
      if (!parsed.ok) {
        return withCors(
          Response.json({ ok: false, error: parsed.error }, { status: parsed.status }),
          cors,
        );
      }
      const nowMs =
        typeof parsed.data.nowMs === 'number' && Number.isFinite(parsed.data.nowMs)
          ? parsed.data.nowMs
          : Date.now();
      const targetRoomId =
        typeof parsed.data.roomId === 'string' && isValidRoomId(parsed.data.roomId)
          ? parsed.data.roomId
          : null;
      let roomSweep: Record<string, unknown> | null = null;
      if (targetRoomId) {
        const roomStub = env.MULTIPLAYER_ROOMS.get(
          env.MULTIPLAYER_ROOMS.idFromName(targetRoomId),
        );
        const rRes = await roomStub.fetch('https://room.internal/expire-sweep', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ nowMs }),
        });
        roomSweep = (await rRes.json().catch(() => null)) as Record<string, unknown> | null;
      }
      const dirSweepRes = await directoryStub.fetch('https://directory.internal/expire-sweep', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nowMs }),
      });
      const dirSweep = (await dirSweepRes.json().catch(() => null)) as Record<string, unknown> | null;
      return withCors(
        Response.json({
          ok: true,
          ...(roomSweep ? { room: roomSweep } : {}),
          directory: dirSweep,
        }),
        cors,
      );
    }

    // Verify a room exists, is not full, and is not locked before joining
    if (request.method === 'GET' && url.pathname === '/api/multiplayer/rooms/verify') {
      const rawCodeOrId = (url.searchParams.get('codeOrId') ?? '').trim();
      if (!rawCodeOrId || (!isValidRoomId(rawCodeOrId) && !isValidRoomCode(rawCodeOrId))) {
        return withCors(
          Response.json(
            { ok: false, error: 'ROOM_NOT_FOUND', message: 'ROOM NOT FOUND' },
            { status: 404 },
          ),
          cors,
        );
      }

      let targetRoomId = isValidRoomId(rawCodeOrId) ? rawCodeOrId : '';
      if (!targetRoomId) {
        const resolveRes = await directoryStub.fetch(
          `https://directory.internal/resolve?codeOrId=${encodeURIComponent(rawCodeOrId)}`,
        );
        if (!resolveRes.ok) {
          return withCors(
            Response.json(
              { ok: false, error: 'ROOM_NOT_FOUND', message: 'ROOM NOT FOUND' },
              { status: 404 },
            ),
            cors,
          );
        }
        const resolved = (await resolveRes.json()) as { roomId?: string };
        if (!resolved.roomId || !isValidRoomId(resolved.roomId)) {
          return withCors(
            Response.json(
              { ok: false, error: 'ROOM_NOT_FOUND', message: 'ROOM NOT FOUND' },
              { status: 404 },
            ),
            cors,
          );
        }
        targetRoomId = resolved.roomId;
      }

      const roomStub = env.MULTIPLAYER_ROOMS.get(
        env.MULTIPLAYER_ROOMS.idFromName(targetRoomId),
      );
      const verifyRes = await roomStub.fetch('https://room.internal/verify');
      return withCors(verifyRes, cors);
    }

    // Create a new room with a cryptographically random roomId
    if (request.method === 'POST' && url.pathname === '/api/multiplayer/rooms') {
      if (!roomCreateRateLimiter.check(clientIp)) {
        return withCors(
          Response.json(
            { ok: false, error: 'RATE_LIMITED', message: 'Too many rooms created. Wait a moment.' },
            { status: 429 },
          ),
          cors,
        );
      }
      const parsed = await parseBoundedJson(request);
      if (!parsed.ok) {
        return withCors(
          Response.json({ ok: false, error: parsed.error }, { status: parsed.status }),
          cors,
        );
      }
      const body = { ...parsed.data };
      delete body.verifiedIdentity;
      const verifiedIdentity = await resolveVerifiedProfileIdentity(request, body, env);

      const roomId = generateSecureRoomId();
      const roomStub = env.MULTIPLAYER_ROOMS.get(
        env.MULTIPLAYER_ROOMS.idFromName(roomId),
      );
      const initRes = await roomStub.fetch('https://room.internal/init', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...body,
          ...(verifiedIdentity ? { verifiedIdentity } : {}),
          roomId,
        }),
      });

      const data = (await initRes.json()) as Record<string, unknown>;
      if (!initRes.ok) {
        return withCors(Response.json(data, { status: initRes.status }), cors);
      }

      return withCors(
        Response.json({
          ...data,
          wsPath: `/api/multiplayer/ws?roomId=${encodeURIComponent(roomId)}&playerId=${encodeURIComponent(String(data.playerId ?? ''))}&token=${encodeURIComponent(String(data.sessionToken ?? ''))}`,
        }),
        cors,
      );
    }

    // Join an existing room by roomId or roomCode
    if (request.method === 'POST' && url.pathname === '/api/multiplayer/rooms/join') {
      const parsed = await parseBoundedJson(request);
      if (!parsed.ok) {
        return withCors(
          Response.json({ ok: false, error: parsed.error }, { status: parsed.status }),
          cors,
        );
      }
      const body = parsed.data;
      const rawCodeOrId =
        typeof body.roomCodeOrId === 'string' ? body.roomCodeOrId.trim() : '';

      if (!rawCodeOrId || (!isValidRoomId(rawCodeOrId) && !isValidRoomCode(rawCodeOrId))) {
        return withCors(
          Response.json(
            { ok: false, error: 'ROOM_NOT_FOUND', message: 'ROOM NOT FOUND' },
            { status: 404 },
          ),
          cors,
        );
      }

      let targetRoomId = isValidRoomId(rawCodeOrId) ? rawCodeOrId : '';
      if (!targetRoomId) {
        const resolveRes = await directoryStub.fetch(
          `https://directory.internal/resolve?codeOrId=${encodeURIComponent(rawCodeOrId)}`,
        );
        if (!resolveRes.ok) {
          return withCors(
            Response.json(
              { ok: false, error: 'ROOM_NOT_FOUND', message: 'ROOM NOT FOUND' },
              { status: 404 },
            ),
            cors,
          );
        }
        const resolved = (await resolveRes.json()) as { roomId?: string };
        if (!resolved.roomId || !isValidRoomId(resolved.roomId)) {
          return withCors(
            Response.json(
              { ok: false, error: 'ROOM_NOT_FOUND', message: 'ROOM NOT FOUND' },
              { status: 404 },
            ),
            cors,
          );
        }
        targetRoomId = resolved.roomId;
      }

      const joinPayload = { ...parsed.data };
      delete joinPayload.verifiedIdentity;
      const verifiedIdentity = await resolveVerifiedProfileIdentity(
        request,
        joinPayload,
        env,
      );

      const roomStub = env.MULTIPLAYER_ROOMS.get(
        env.MULTIPLAYER_ROOMS.idFromName(targetRoomId),
      );
      const joinRes = await roomStub.fetch('https://room.internal/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...joinPayload,
          ...(verifiedIdentity ? { verifiedIdentity } : {}),
        }),
      });
      const data = (await joinRes.json()) as Record<string, unknown>;
      if (!joinRes.ok) {
        return withCors(Response.json(data, { status: joinRes.status }), cors);
      }

      return withCors(
        Response.json({
          ...data,
          wsPath: `/api/multiplayer/ws?roomId=${encodeURIComponent(targetRoomId)}&playerId=${encodeURIComponent(String(data.playerId ?? ''))}&token=${encodeURIComponent(String(data.sessionToken ?? ''))}`,
        }),
        cors,
      );
    }

    // Quick join an open public waiting room
    if (
      request.method === 'POST' &&
      url.pathname === '/api/multiplayer/rooms/quick-join'
    ) {
      const parsed = await parseBoundedJson(request);
      if (!parsed.ok) {
        return withCors(
          Response.json({ ok: false, error: parsed.error }, { status: parsed.status }),
          cors,
        );
      }
      const body = { ...parsed.data };
      delete body.verifiedIdentity;
      const verifiedIdentity = await resolveVerifiedProfileIdentity(request, body, env);

      const quickRes = await directoryStub.fetch(
        'https://directory.internal/quick-join',
      );
      if (!quickRes.ok) {
        return withCors(
          Response.json({ ok: false, error: 'NO_OPEN_ROOMS' }, { status: 404 }),
          cors,
        );
      }
      const quickData = (await quickRes.json()) as { roomId?: string };
      if (!quickData.roomId || !isValidRoomId(quickData.roomId)) {
        return withCors(
          Response.json({ ok: false, error: 'NO_OPEN_ROOMS' }, { status: 404 }),
          cors,
        );
      }

      const roomStub = env.MULTIPLAYER_ROOMS.get(
        env.MULTIPLAYER_ROOMS.idFromName(quickData.roomId),
      );
      const joinRes = await roomStub.fetch('https://room.internal/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...body,
          ...(verifiedIdentity ? { verifiedIdentity } : {}),
        }),
      });
      const data = (await joinRes.json()) as Record<string, unknown>;
      if (!joinRes.ok) {
        return withCors(Response.json(data, { status: joinRes.status }), cors);
      }

      return withCors(
        Response.json({
          ...data,
          wsPath: `/api/multiplayer/ws?roomId=${encodeURIComponent(quickData.roomId)}&playerId=${encodeURIComponent(String(data.playerId ?? ''))}&token=${encodeURIComponent(String(data.sessionToken ?? ''))}`,
        }),
        cors,
      );
    }

    // Send a room invitation to a friend by player name
    if (request.method === 'POST' && url.pathname === '/api/multiplayer/invites') {
      if (!inviteRateLimiter.check(clientIp)) {
        return withCors(
          Response.json(
            { ok: false, error: 'RATE_LIMITED', message: 'Too many invitations sent.' },
            { status: 429 },
          ),
          cors,
        );
      }
      const parsed = await parseBoundedJson(request);
      if (!parsed.ok) {
        return withCors(
          Response.json({ ok: false, error: parsed.error }, { status: parsed.status }),
          cors,
        );
      }
      const body = parsed.data;
      const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : '';
      if (!isValidRoomId(roomId)) {
        return withCors(
          Response.json(
            { ok: false, error: 'ROOM_NOT_FOUND', message: 'ROOM NOT FOUND' },
            { status: 404 },
          ),
          cors,
        );
      }
      const fromPlayerId =
        typeof body.fromPlayerId === 'string' ? body.fromPlayerId.trim() : '';
      const sessionToken =
        typeof body.sessionToken === 'string' ? body.sessionToken.trim() : '';
      if (!fromPlayerId || !sessionToken) {
        return withCors(
          Response.json(
            { ok: false, error: 'UNAUTHORIZED_INVITE', message: 'Room session required to send invites.' },
            { status: 403 },
          ),
          cors,
        );
      }

      const roomStub = env.MULTIPLAYER_ROOMS.get(
        env.MULTIPLAYER_ROOMS.idFromName(roomId),
      );
      const memberRes = await roomStub.fetch('https://room.internal/verify-member', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId: fromPlayerId, sessionToken }),
      });
      if (!memberRes.ok) {
        const errData = (await memberRes.json().catch(() => ({ ok: false, error: 'UNAUTHORIZED_INVITE' }))) as Record<string, unknown>;
        return withCors(Response.json(errData, { status: memberRes.status }), cors);
      }
      const memberData = (await memberRes.json()) as {
        displayName?: string;
        publicProfileId?: string;
        playerTag?: string;
        avatar?: unknown;
        room?: {
          roomId: string;
          roomCode: string;
          roomName: string;
          maxPlayers: number;
          players: unknown[];
          gameState: { worldType: string; locked: boolean };
          status: string;
        };
      };
      if (!memberData.room || memberData.room.gameState.locked || memberData.room.status !== 'waiting') {
        return withCors(
          Response.json(
            { ok: false, error: 'GAME_ALREADY_STARTED', message: 'Cannot invite to a room that has already started.' },
            { status: 409 },
          ),
          cors,
        );
      }

      const toPublicProfileId =
        typeof body.toPublicProfileId === 'string' ? body.toPublicProfileId.trim() : '';
      const toPlayerName =
        typeof body.toPlayerName === 'string' ? body.toPlayerName : '';

      let resolvedRecipientId = toPublicProfileId;
      let resolvedRecipientName = toPlayerName;
      if (env.PLAYER_PROFILES) {
        const profilesStub = env.PLAYER_PROFILES.get(
          env.PLAYER_PROFILES.idFromName('global'),
        );
        const checkRes = await profilesStub.fetch(
          'https://profiles.internal/internal/check-invite',
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              fromPublicProfileId: memberData.publicProfileId,
              toPublicProfileId,
              toPlayerName,
            }),
          },
        );
        if (!checkRes.ok) {
          const checkErr = (await checkRes.json().catch(() => ({ ok: false, error: 'INVITE_BLOCKED' }))) as Record<string, unknown>;
          return withCors(Response.json(checkErr, { status: checkRes.status }), cors);
        }
        const checkData = (await checkRes.json()) as {
          resolvedRecipient?: { publicProfileId: string; displayName: string } | null;
        };
        if (checkData.resolvedRecipient) {
          resolvedRecipientId = checkData.resolvedRecipient.publicProfileId;
          if (!resolvedRecipientName) {
            resolvedRecipientName = checkData.resolvedRecipient.displayName;
          }
        }
      }

      const sendRes = await directoryStub.fetch('https://directory.internal/invites/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roomId: memberData.room.roomId,
          roomCode: memberData.room.roomCode,
          roomName: memberData.room.roomName,
          fromPlayerId,
          ...(memberData.publicProfileId
            ? { fromPublicProfileId: memberData.publicProfileId }
            : {}),
          fromPlayerName: memberData.displayName || 'Adventurer',
          ...(memberData.playerTag ? { fromPlayerTag: memberData.playerTag } : {}),
          ...(memberData.avatar ? { fromAvatar: memberData.avatar } : {}),
          ...(resolvedRecipientId ? { toPublicProfileId: resolvedRecipientId } : {}),
          toPlayerName: resolvedRecipientName,
          worldType: memberData.room.gameState.worldType,
          playerCount: memberData.room.players.length,
          maxPlayers: memberData.room.maxPlayers,
        }),
      });
      return withCors(sendRes, cors);
    }

    // List pending invitations for a player name / verified profile ID
    if (request.method === 'GET' && url.pathname === '/api/multiplayer/invites') {
      const playerName = (url.searchParams.get('playerName') ?? '').trim().slice(0, 24);
      const verified = await resolveVerifiedProfileIdentity(request, null, env);
      const publicProfileId =
        typeof verified?.publicProfileId === 'string'
          ? verified.publicProfileId
          : (url.searchParams.get('publicProfileId') ?? '').trim();
      const invRes = await directoryStub.fetch(
        `https://directory.internal/invites?playerName=${encodeURIComponent(playerName)}&publicProfileId=${encodeURIComponent(publicProfileId)}`,
      );
      return withCors(invRes, cors);
    }

    // Accept an invitation: verify & join the Durable Object room
    if (request.method === 'POST' && url.pathname === '/api/multiplayer/invites/accept') {
      const parsed = await parseBoundedJson(request);
      if (!parsed.ok) {
        return withCors(
          Response.json({ ok: false, error: parsed.error }, { status: parsed.status }),
          cors,
        );
      }
      const verifiedIdentity = await resolveVerifiedProfileIdentity(
        request,
        parsed.data,
        env,
      );
      const inviteId =
        typeof parsed.data.inviteId === 'string' ? parsed.data.inviteId.trim() : '';
      const playerName =
        typeof parsed.data.playerName === 'string' ? parsed.data.playerName : 'Adventurer';
      if (!inviteId) {
        return withCors(
          Response.json({ ok: false, error: 'INVITE_NOT_FOUND' }, { status: 400 }),
          cors,
        );
      }
      const consumeRes = await directoryStub.fetch(
        'https://directory.internal/invites/consume',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ inviteId }),
        },
      );
      if (!consumeRes.ok) {
        return withCors(consumeRes, cors);
      }
      const consumed = (await consumeRes.json()) as {
        invite?: { roomId: string };
      };
      const targetRoomId = consumed.invite?.roomId ?? '';
      if (!isValidRoomId(targetRoomId)) {
        return withCors(
          Response.json(
            { ok: false, error: 'ROOM_NOT_FOUND', message: 'ROOM NOT FOUND' },
            { status: 404 },
          ),
          cors,
        );
      }

      const roomStub = env.MULTIPLAYER_ROOMS.get(
        env.MULTIPLAYER_ROOMS.idFromName(targetRoomId),
      );
      const joinRes = await roomStub.fetch('https://room.internal/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          playerName: playerName || 'Adventurer',
          ...(verifiedIdentity ? { verifiedIdentity } : {}),
        }),
      });
      const data = (await joinRes.json()) as Record<string, unknown>;
      if (!joinRes.ok) {
        return withCors(Response.json(data, { status: joinRes.status }), cors);
      }

      return withCors(
        Response.json({
          ...data,
          wsPath: `/api/multiplayer/ws?roomId=${encodeURIComponent(targetRoomId)}&playerId=${encodeURIComponent(String(data.playerId ?? ''))}&token=${encodeURIComponent(String(data.sessionToken ?? ''))}`,
        }),
        cors,
      );
    }

    // Decline an invitation
    if (request.method === 'POST' && url.pathname === '/api/multiplayer/invites/decline') {
      const parsed = await parseBoundedJson(request);
      if (!parsed.ok) {
        return withCors(
          Response.json({ ok: false, error: parsed.error }, { status: parsed.status }),
          cors,
        );
      }
      const inviteId =
        typeof parsed.data.inviteId === 'string' ? parsed.data.inviteId.trim() : '';
      const decRes = await directoryStub.fetch(
        'https://directory.internal/invites/decline',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ inviteId }),
        },
      );
      return withCors(decRes, cors);
    }

    // Fetch current authoritative state for a room
    if (
      request.method === 'GET' &&
      url.pathname.startsWith('/api/multiplayer/rooms/')
    ) {
      const roomId = url.pathname.slice('/api/multiplayer/rooms/'.length);
      if (!isValidRoomId(roomId)) {
        return withCors(
          Response.json(
            { ok: false, error: 'ROOM_NOT_FOUND', message: 'ROOM NOT FOUND' },
            { status: 400 },
          ),
          cors,
        );
      }
      const roomStub = env.MULTIPLAYER_ROOMS.get(
        env.MULTIPLAYER_ROOMS.idFromName(roomId),
      );
      const stateRes = await roomStub.fetch('https://room.internal/state');
      return withCors(stateRes, cors);
    }

    return withCors(
      Response.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 }),
      cors,
    );
    } catch {
      return withCors(
        Response.json(
          {
            ok: false,
            error: 'INTERNAL_SERVER_ERROR',
            message: 'Multiplayer server encountered an unexpected error.',
          },
          { status: 500 },
        ),
        cors,
      );
    }
  },
};
