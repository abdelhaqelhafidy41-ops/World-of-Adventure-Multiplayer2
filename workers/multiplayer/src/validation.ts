import {
  MAX_WS_MESSAGE_BYTES,
  MULTIPLAYER_PROTOCOL_VERSION,
  isValidClientMessageType,
  isValidPlayerId,
  isValidRoomId,
  sanitizeDisplayName,
  validateChatMessageInput,
  validateEntitySyncBatchPayload,
  validateGameEventPayload,
  validatePlayerReportPayload,
  validatePlayerStatePayload,
  type ClientMessageType,
  type EntitySyncBatchPayload,
  type GameEventPayload,
  type NetworkEnvelope,
  type PlayerNetworkState,
  type PlayerReportPayload,
  type UpdateRoomSettingsPayload,
} from '../../../shared/multiplayerProtocol';

export interface ValidatedClientEnvelope {
  type: ClientMessageType;
  roomId: string;
  playerId: string;
  seq?: number;
  timestamp: number;
  playerState?: PlayerNetworkState;
  gameEvent?: GameEventPayload;
  entitySync?: EntitySyncBatchPayload;
  chatMessage?: string;
  playerReport?: PlayerReportPayload;
  ready?: boolean;
  displayName?: string;
  targetPlayerId?: string;
  roomSettings?: UpdateRoomSettingsPayload;
  pingId?: number;
  clientSentAt?: number;
}

export function getRawByteLength(data: string | ArrayBuffer): number {
  if (typeof data === 'string') {
    return new TextEncoder().encode(data).byteLength;
  }
  return data.byteLength;
}

/**
 * Parses and validates an untrusted client WebSocket payload against bound session identity.
 */
export function validateClientMessage(
  rawData: string | ArrayBuffer,
  boundRoomId: string,
  boundPlayerId: string,
  isPlayerHost: boolean,
): { ok: true; message: ValidatedClientEnvelope } | { ok: false; code: string; reason: string } {
  const byteLength = getRawByteLength(rawData);
  if (byteLength === 0 || byteLength > MAX_WS_MESSAGE_BYTES) {
    return {
      ok: false,
      code: 'MESSAGE_SIZE_EXCEEDED',
      reason: `Message byte size (${byteLength}) out of allowed 1..${MAX_WS_MESSAGE_BYTES} range.`,
    };
  }

  let text: string;
  if (typeof rawData === 'string') {
    text = rawData;
  } else {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(rawData);
    } catch {
      return {
        ok: false,
        code: 'INVALID_ENCODING',
        reason: 'Message must be valid UTF-8 JSON.',
      };
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      code: 'INVALID_JSON',
      reason: 'Message is not valid JSON.',
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      code: 'INVALID_ENVELOPE',
      reason: 'Envelope must be a JSON object.',
    };
  }

  const env = parsed as Partial<Omit<NetworkEnvelope, 'type'> & { type: unknown }>;
  if (env.v !== undefined && env.v !== MULTIPLAYER_PROTOCOL_VERSION) {
    return {
      ok: false,
      code: 'UNSUPPORTED_PROTOCOL_VERSION',
      reason: 'Protocol version mismatch.',
    };
  }

  if (!isValidClientMessageType(env.type)) {
    return {
      ok: false,
      code: 'INVALID_MESSAGE_TYPE',
      reason: 'Unknown or disallowed client message type.',
    };
  }

  // Never trust client-supplied roomId or playerId if they mismatch authenticated socket binding
  if (env.roomId !== undefined) {
    if (!isValidRoomId(env.roomId) || env.roomId !== boundRoomId) {
      return {
        ok: false,
        code: 'ROOM_MISMATCH',
        reason: 'Envelope roomId does not match active room.',
      };
    }
  }

  if (env.playerId !== undefined) {
    if (!isValidPlayerId(env.playerId) || env.playerId !== boundPlayerId) {
      return {
        ok: false,
        code: 'PLAYER_IMPERSONATION_REJECTED',
        reason: 'Envelope playerId does not match authenticated socket player.',
      };
    }
  }

  const msg: ValidatedClientEnvelope = {
    type: env.type,
    roomId: boundRoomId,
    playerId: boundPlayerId,
    timestamp: Date.now(),
    seq:
      typeof env.seq === 'number' && Number.isInteger(env.seq) && env.seq >= 0
        ? env.seq
        : undefined,
  };

  if (
    (env.type === 'START_GAME' ||
      env.type === 'KICK_PLAYER' ||
      env.type === 'TRANSFER_HOST' ||
      env.type === 'UPDATE_ROOM_SETTINGS' ||
      env.type === 'CLOSE_ROOM' ||
      env.type === 'ENTITY_SYNC') &&
    !isPlayerHost
  ) {
    return {
      ok: false,
      code: 'FORBIDDEN_HOST_ONLY',
      reason: 'Only the room host can perform this room action.',
    };
  }

  if (env.type === 'PLAYER_STATE') {
    const check = validatePlayerStatePayload(env.payload);
    if (!check.ok) {
      return { ok: false, code: 'INVALID_PLAYER_STATE', reason: check.reason };
    }
    msg.playerState = check.state;
  } else if (env.type === 'GAME_EVENT') {
    const check = validateGameEventPayload(env.payload, false);
    if (!check.ok) {
      return { ok: false, code: 'INVALID_GAME_EVENT', reason: check.reason };
    }
    msg.gameEvent = check.payload;
  } else if (env.type === 'ENTITY_SYNC') {
    const check = validateEntitySyncBatchPayload(env.payload);
    if (!check.ok) {
      return { ok: false, code: 'INVALID_ENTITY_SYNC', reason: check.reason };
    }
    msg.entitySync = check.payload;
  } else if (env.type === 'ROOM_CHAT') {
    const check = validateChatMessageInput(env.payload);
    if (!check.ok) {
      return { ok: false, code: check.code, reason: check.reason };
    }
    msg.chatMessage = check.message;
  } else if (env.type === 'PLAYER_REPORT') {
    const check = validatePlayerReportPayload(env.payload, boundPlayerId);
    if (!check.ok) {
      return { ok: false, code: check.code, reason: check.reason };
    }
    msg.playerReport = check.payload;
  } else if (env.type === 'READY') {
    const payload = env.payload as { ready?: unknown } | undefined;
    if (!payload || typeof payload.ready !== 'boolean') {
      return {
        ok: false,
        code: 'INVALID_READY_PAYLOAD',
        reason: 'READY payload must include boolean "ready".',
      };
    }
    msg.ready = payload.ready;
  } else if (env.type === 'KICK_PLAYER' || env.type === 'TRANSFER_HOST') {
    const payload = env.payload as { targetPlayerId?: unknown } | undefined;
    if (!payload || !isValidPlayerId(payload.targetPlayerId)) {
      return {
        ok: false,
        code: env.type === 'TRANSFER_HOST' ? 'INVALID_TRANSFER_PAYLOAD' : 'INVALID_KICK_PAYLOAD',
        reason: `${env.type} payload must include a valid targetPlayerId.`,
      };
    }
    if (payload.targetPlayerId === boundPlayerId) {
      return {
        ok: false,
        code: env.type === 'TRANSFER_HOST' ? 'CANNOT_TRANSFER_SELF' : 'CANNOT_KICK_SELF',
        reason:
          env.type === 'TRANSFER_HOST'
            ? 'Host is already assigned to this player.'
            : 'Host cannot kick themselves.',
      };
    }
    msg.targetPlayerId = payload.targetPlayerId;
  } else if (env.type === 'UPDATE_ROOM_SETTINGS') {
    const payload = env.payload as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {
        ok: false,
        code: 'INVALID_ROOM_SETTINGS',
        reason: 'UPDATE_ROOM_SETTINGS payload must be an object.',
      };
    }
    if (
      'seed' in payload ||
      'worldSeed' in payload ||
      'worldType' in payload ||
      'difficulty' in payload ||
      'worldSettings' in payload
    ) {
      return {
        ok: false,
        code: 'FORBIDDEN_CLIENT_AUTHORITY',
        reason: 'World seed and game mode are immutable once the room is created.',
      };
    }
    if (typeof payload.requireAllReady !== 'boolean') {
      return {
        ok: false,
        code: 'INVALID_ROOM_SETTINGS',
        reason: 'UPDATE_ROOM_SETTINGS requires boolean requireAllReady.',
      };
    }
    msg.roomSettings = { requireAllReady: payload.requireAllReady };
  } else if (env.type === 'START_GAME') {
    if (env.payload !== undefined) {
      return {
        ok: false,
        code: 'FORBIDDEN_CLIENT_AUTHORITY',
        reason: 'START_GAME cannot include client-supplied world configuration.',
      };
    }
  } else if (env.type === 'PING' || env.type === 'PONG') {
    const payload = env.payload as { pingId?: unknown; clientSentAt?: unknown } | undefined;
    if (payload && typeof payload === 'object') {
      if (typeof payload.pingId === 'number' && Number.isInteger(payload.pingId)) {
        msg.pingId = payload.pingId;
      }
      if (typeof payload.clientSentAt === 'number' && Number.isFinite(payload.clientSentAt)) {
        msg.clientSentAt = payload.clientSentAt;
      }
    }
  } else if (env.type === 'JOIN_ROOM' || env.type === 'CONNECT') {
    const payload = env.payload as { displayName?: unknown } | undefined;
    if (payload?.displayName !== undefined) {
      msg.displayName = sanitizeDisplayName(payload.displayName);
    }
  }

  return { ok: true, message: msg };
}
