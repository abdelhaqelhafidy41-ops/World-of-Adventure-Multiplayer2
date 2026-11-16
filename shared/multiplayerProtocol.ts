import type { AvatarConfig } from './profileTypes';

export type MultiplayerWorldType = 'normal' | 'adventure' | 'survival' | 'creative';
export type MultiplayerDifficultyLevel = 'easy' | 'normal' | 'hard';
export type WorldType = MultiplayerWorldType;
export type DifficultyLevel = MultiplayerDifficultyLevel;

export const MULTIPLAYER_PROTOCOL_VERSION = 1 as const;
export const MAX_WS_MESSAGE_BYTES = 4096;
export const MAX_PLAYERS_PER_ROOM = 32;
export const ALLOWED_MAX_PLAYER_COUNTS = [2, 4, 8, 16, 32] as const;
export const MIN_PLAYERS_PER_ROOM = 2;
export const MAX_ROOM_NAME_LENGTH = 36;
export const MAX_PLAYER_NAME_LENGTH = 24;
export const MAX_GAME_EVENT_NAME_LENGTH = 48;
export const MAX_CHAT_MESSAGE_LENGTH = 240;
export const CHAT_RATE_COOLDOWN_MS = 900;
export const CHAT_HISTORY_LIMIT = 40;
export const PLAYER_REPORT_DETAILS_MAX_LENGTH = 200;
export const MAX_PLAYABLE_COORD = 3600;
export const HEARTBEAT_INTERVAL_MS = 15_000;
export const HEARTBEAT_TIMEOUT_MS = 45_000;
export const HOST_DISCONNECT_GRACE_MS = 12_000;
export const PLAYER_RECONNECT_GRACE_MS = 45_000;
export const MAX_RECONNECT_ATTEMPTS = 6;

export type RoomPrivacy = 'public' | 'friends' | 'private';
export type RoomStatus = 'waiting' | 'starting' | 'in-game';
export type ConnectionQuality = 'excellent' | 'good' | 'poor' | 'disconnected';

export const AVATAR_PALETTE = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#8b5cf6',
  '#06b6d4',
  '#ef4444',
  '#84cc16',
] as const;

export function pickAvatarColor(seedText: string): string {
  let hash = 0;
  for (let i = 0; i < seedText.length; i++) {
    hash = (hash * 31 + seedText.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

export function getConnectionQuality(
  pingMs: number | null | undefined,
  isConnected = true,
): ConnectionQuality {
  if (!isConnected) return 'disconnected';
  if (pingMs === null || pingMs === undefined || !Number.isFinite(pingMs) || pingMs < 0) {
    return 'good';
  }
  if (pingMs < 80) return 'excellent';
  if (pingMs < 180) return 'good';
  return 'poor';
}

export type SyncedEntityKind = 'npc' | 'animal' | 'enemy';

export interface ServerWeaponSpec {
  id: string;
  baseDamage: number;
  minDamage?: number;
  maxDamage?: number;
  range: number;
  cooldownMs: number;
  isRanged: boolean;
  critMult: number;
  headshotMult?: number;
  minSpeed?: number;
  maxSpeed?: number;
  gravity?: number;
}

export const SERVER_WEAPON_SPECS: Record<string, ServerWeaponSpec> = {
  unarmed: {
    id: 'unarmed',
    baseDamage: 9,
    range: 2.1,
    cooldownMs: 300,
    isRanged: false,
    critMult: 1.0,
  },
  'ranger-sword': {
    id: 'ranger-sword',
    baseDamage: 26,
    range: 2.85,
    cooldownMs: 340,
    isRanged: false,
    critMult: 1.5,
  },
  'wooden-sword': {
    id: 'wooden-sword',
    baseDamage: 16,
    range: 2.6,
    cooldownMs: 320,
    isRanged: false,
    critMult: 1.5,
  },
  'iron-sword': {
    id: 'iron-sword',
    baseDamage: 34,
    range: 2.95,
    cooldownMs: 360,
    isRanged: false,
    critMult: 1.5,
  },
  'steel-sword': {
    id: 'steel-sword',
    baseDamage: 44,
    range: 3.05,
    cooldownMs: 320,
    isRanged: false,
    critMult: 1.5,
  },
  'woodland-axe': {
    id: 'woodland-axe',
    baseDamage: 42,
    range: 2.95,
    cooldownMs: 580,
    isRanged: false,
    critMult: 1.75,
  },
  'battle-axe': {
    id: 'battle-axe',
    baseDamage: 52,
    range: 3.1,
    cooldownMs: 620,
    isRanged: false,
    critMult: 1.75,
  },
  'hunter-knife': {
    id: 'hunter-knife',
    baseDamage: 22,
    range: 2.25,
    cooldownMs: 210,
    isRanged: false,
    critMult: 1.75,
  },
  spear: {
    id: 'spear',
    baseDamage: 36,
    range: 3.85,
    cooldownMs: 440,
    isRanged: false,
    critMult: 1.6,
  },
  'hunter-bow': {
    id: 'hunter-bow',
    baseDamage: 32,
    minDamage: 10,
    maxDamage: 50,
    range: 52,
    cooldownMs: 360,
    isRanged: true,
    critMult: 1.65,
    headshotMult: 2.0,
    minSpeed: 15,
    maxSpeed: 45,
    gravity: 9.8,
  },
  crossbow: {
    id: 'crossbow',
    baseDamage: 46,
    minDamage: 16,
    maxDamage: 66,
    range: 58,
    cooldownMs: 560,
    isRanged: true,
    critMult: 1.65,
    headshotMult: 2.0,
    minSpeed: 22,
    maxSpeed: 56,
    gravity: 6.2,
  },
};

export const SERVER_ENEMY_MAX_HP: Record<string, number> = {
  bandit_scout: 65,
  thorn_stalker: 50,
  stone_sentinel: 120,
};

export const SERVER_ANIMAL_MAX_HP: Record<string, number> = {
  deer: 55,
  rabbit: 22,
  wolf: 68,
  bear: 135,
  bird: 14,
  cow: 80,
  sheep: 45,
  chicken: 16,
};

export const SERVER_NPC_MAX_HP: Record<string, number> = {
  guard: 140,
  default: 100,
};

export const SERVER_CRAFTABLE_YIELDS: Record<
  string,
  { itemId: string; count: number }
> = {
  'recipe-bed': { itemId: 'bed', count: 1 },
  'recipe-wooden-sword': { itemId: 'wooden-sword', count: 1 },
  'recipe-hunter-knife': { itemId: 'hunter-knife', count: 1 },
  'recipe-spear': { itemId: 'spear', count: 1 },
  'recipe-iron-sword': { itemId: 'iron-sword', count: 1 },
  'recipe-steel-sword': { itemId: 'steel-sword', count: 1 },
  'recipe-battle-axe': { itemId: 'battle-axe', count: 1 },
  'recipe-hunter-bow': { itemId: 'hunter-bow', count: 1 },
  'recipe-crossbow': { itemId: 'crossbow', count: 1 },
  'recipe-arrow': { itemId: 'arrow', count: 8 },
  'recipe-driftwood-arrows': { itemId: 'arrow', count: 6 },
};

export interface SyncedEntityDelta {
  id: string;
  kind: SyncedEntityKind;
  archetype: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  state: string;
  hp?: number;
  maxHp?: number;
  isDead?: boolean;
  tx?: number;
  tz?: number;
}

export interface EntitySyncBatchPayload {
  entities: SyncedEntityDelta[];
  worldHours?: number;
  weather?: string;
}

export interface RoomWorldSnapshotPayload {
  openedChests: string[];
  collectedPickups: string[];
  depletedResources: Array<{ id: string; usesRemaining: number; regenAtMs: number }>;
  doors: Array<{ id: string; isOpen: boolean }>;
  placedBeds: Array<{
    id: string;
    x: number;
    y: number;
    z: number;
    yaw: number;
    ownerId: string;
  }>;
  droppedItems: Array<{
    id: string;
    itemId: string;
    count: number;
    label: string;
    x: number;
    y: number;
    z: number;
    droppedBy: string;
  }>;
  quests: Array<{
    questId: string;
    status: string;
    stepIndex: number;
    updatedBy: string;
  }>;
  discoveredLandmarks: string[];
  deadEntities: Array<{ id: string; kind: SyncedEntityKind }>;
  worldHours?: number;
  weather?: string;
  ammoCount?: number;
}

/**
 * Core multiplayer message types required across client WebSocket & Durable Object room server.
 */
export const CLIENT_MESSAGE_TYPES = [
  'CONNECT',
  'DISCONNECT',
  'PING',
  'PONG',
  'JOIN_ROOM',
  'LEAVE_ROOM',
  'PLAYER_STATE',
  'GAME_EVENT',
  'ENTITY_SYNC',
  'ROOM_CHAT',
  'PLAYER_REPORT',
  'READY',
  'START_GAME',
  'KICK_PLAYER',
  'TRANSFER_HOST',
  'UPDATE_ROOM_SETTINGS',
  'CLOSE_ROOM',
] as const;

export type ClientMessageType = (typeof CLIENT_MESSAGE_TYPES)[number];

export const ALLOWED_WEAPON_IDS = new Set<string>([
  'ranger-sword',
  'wooden-sword',
  'iron-sword',
  'steel-sword',
  'woodland-axe',
  'battle-axe',
  'hunter-bow',
  'crossbow',
  'spear',
  'hunter-knife',
]);

export const ALLOWED_ATTACK_ANIM_TYPES = new Set<string>([
  'melee_slash',
  'heavy_chop',
  'bow_shot',
  'spear_thrust',
  'knife_slash',
  'unarmed_punch',
]);

export function generateNetworkEntityId(playerId: string): string {
  return `ent_${playerId}`;
}

export const SERVER_MESSAGE_TYPES = [
  'CONNECT',
  'DISCONNECT',
  'PING',
  'PONG',
  'JOIN_ROOM',
  'LEAVE_ROOM',
  'PLAYER_STATE',
  'PLAYER_VITALS',
  'POSITION_CORRECTION',
  'GAME_EVENT',
  'ENTITY_SYNC',
  'WORLD_SNAPSHOT',
  'ROOM_CHAT',
  'CHAT_HISTORY',
  'REPORT_ACK',
  'READY',
  'START_GAME',
  'KICK_PLAYER',
  'TRANSFER_HOST',
  'UPDATE_ROOM_SETTINGS',
  'CLOSE_ROOM',
  'ROOM_STATE',
  'HOST_TRANSFERRED',
  'PLAYER_KICKED',
  'ROOM_CLOSED',
  'ERROR',
] as const;

export type ServerMessageType = (typeof SERVER_MESSAGE_TYPES)[number];

export interface PlayerNetworkState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  aimYaw?: number;
  pitch?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  movementState?: 'idle' | 'walking' | 'running' | 'jumping' | 'falling';
  animState?: string;
  sprinting?: boolean;
  jumping?: boolean;
  crouching?: boolean;
  grounded?: boolean;
  weaponId?: string | null;
  bowCharging?: boolean;
  bowCharge?: number;
  shooting?: boolean;
  reloading?: boolean;
  seq?: number;
  // Server-stamped authoritative fields (stripped/rejected if sent by clients)
  networkEntityId?: string;
  health?: number;
  maxHealth?: number;
  isDead?: boolean;
  serverTime?: number;
}

export interface AuthoritativePlayerVitals {
  playerId: string;
  networkEntityId: string;
  health: number;
  maxHealth: number;
  isDead: boolean;
  reviveAtMs?: number | null;
}

export interface PositionCorrectionPayload {
  x: number;
  y: number;
  z: number;
  yaw: number;
  seq?: number;
  reason: string;
}

export interface NetworkPlayerRecord {
  playerId: string;
  publicProfileId?: string;
  networkEntityId?: string;
  displayName: string;
  playerTag?: string;
  avatarColor?: string;
  avatar?: AvatarConfig;
  isHost: boolean;
  isReady: boolean;
  pingMs?: number | null;
  connectionQuality?: ConnectionQuality;
  joinedAt: number;
  lastSeenAt: number;
  disconnectedAt?: number | null;
  health?: number;
  maxHealth?: number;
  isDead?: boolean;
  state?: PlayerNetworkState;
}

export interface AuthoritativeWorldSettings {
  worldType: WorldType;
  difficulty: DifficultyLevel;
  pvpEnabled: boolean;
  staminaUnlimited: boolean;
  spawnX: number;
  spawnY: number;
  spawnZ: number;
}

export interface RoomGameState {
  seed: number;
  worldName: string;
  worldType: WorldType;
  difficulty: DifficultyLevel;
  privacy: RoomPrivacy;
  isPrivate: boolean;
  allowFriends: boolean;
  requireAllReady: boolean;
  worldSettings?: AuthoritativeWorldSettings;
  locked: boolean;
  hasPassword: boolean;
  startedAt: number | null;
  tick: number;
}

export interface AuthoritativeRoomSnapshot {
  roomId: string;
  roomCode: string;
  roomName: string;
  hostId: string;
  hostName: string;
  players: NetworkPlayerRecord[];
  maxPlayers: number;
  status: RoomStatus;
  gameState: RoomGameState;
  createdAt: number;
}

export interface NetworkEnvelope<
  TPayload = unknown,
  TType extends string = ServerMessageType | ClientMessageType,
> {
  v: number;
  type: TType;
  roomId: string;
  playerId: string;
  timestamp: number;
  seq?: number;
  payload?: TPayload;
}

export interface JoinRoomPayload {
  displayName: string;
  token?: string;
}

export interface ReadyPayload {
  ready: boolean;
}

export interface KickPlayerPayload {
  targetPlayerId: string;
}

export interface TransferHostPayload {
  targetPlayerId: string;
}

export interface UpdateRoomSettingsPayload {
  requireAllReady?: boolean;
}

export interface HostTransferredPayload {
  previousHostId: string;
  newHostId: string;
  newHostName: string;
}

export interface PlayerKickedPayload {
  targetPlayerId: string;
  targetDisplayName: string;
  kickedBy: string;
}

export interface RoomClosedPayload {
  reason: string;
  closedBy: string;
}

export interface MultiplayerInviteRecord {
  inviteId: string;
  roomId: string;
  roomCode: string;
  roomName: string;
  fromPlayerId: string;
  fromPublicProfileId?: string;
  fromPlayerName: string;
  fromPlayerTag?: string;
  fromAvatar?: AvatarConfig;
  toPublicProfileId?: string;
  toPlayerName: string;
  worldType: WorldType;
  playerCount: number;
  maxPlayers: number;
  sentAt: number;
}

export interface GameEventPayload {
  event: string;
  data?: Record<string, string | number | boolean | null>;
}

export interface RoomChatMessage {
  id: string;
  playerId: string;
  publicProfileId?: string;
  playerName: string;
  playerTag?: string;
  avatar?: AvatarConfig;
  message: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface RoomChatSendPayload {
  message: string;
}

export interface ChatHistoryPayload {
  messages: RoomChatMessage[];
}

export const ALLOWED_REPORT_REASONS = [
  'spam',
  'harassment',
  'cheating',
  'inappropriate_name',
  'inappropriate_profile',
  'other',
] as const;

export type PlayerReportReason = (typeof ALLOWED_REPORT_REASONS)[number];

export interface PlayerReportPayload {
  targetPlayerId: string;
  reason: PlayerReportReason;
  details?: string;
}

export interface ReportAckPayload {
  reportId: string;
  targetPlayerId: string;
  reason: PlayerReportReason;
  timestamp: number;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export const CLIENT_COORDINATE_EVENTS = new Set<string>([
  'COMBAT_HIT',
  'ARROW_FIRED',
  'PROJECTILE_HIT',
  'PLAYER_COLLECTED_RESOURCE',
  'ITEM_DROPPED',
  'ITEM_PICKED_UP',
  'DOOR_OPENED',
  'DOOR_CLOSED',
  'CHEST_OPENED',
  'BED_PLACED',
  'BED_USED',
  'QUEST_UPDATED',
  'WORLD_EVENT',
]);

export const SERVER_ONLY_GAME_EVENTS = new Set<string>([
  'NPC_DAMAGED',
  'NPC_DIED',
  'ANIMAL_DAMAGED',
  'ANIMAL_DIED',
  'ENEMY_DAMAGED',
  'ENEMY_DIED',
  'PLAYER_DIED',
]);

export const ALLOWED_GAME_EVENTS = new Set<string>([
  'player:emote',
  'player:chat',
  'player:attack',
  'player:shoot',
  'player:damage-taken',
  'player:respawn',
  'player:interact',
  'world:ping-marker',
  'world:time-sync-request',
  ...CLIENT_COORDINATE_EVENTS,
  ...SERVER_ONLY_GAME_EVENTS,
]);

const ROOM_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;
const ROOM_CODE_RE = /^[A-Z0-9-]{4,16}$/;
const PLAYER_ID_RE = /^[a-zA-Z0-9_-]{6,64}$/;

export function isValidRoomId(value: unknown): value is string {
  return typeof value === 'string' && ROOM_ID_RE.test(value);
}

export function isValidRoomCode(value: unknown): value is string {
  return typeof value === 'string' && ROOM_CODE_RE.test(value.trim().toUpperCase());
}

export function isValidPlayerId(value: unknown): value is string {
  return typeof value === 'string' && PLAYER_ID_RE.test(value);
}

export function sanitizeDisplayName(value: unknown, fallback = 'Adventurer'): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned.slice(0, MAX_PLAYER_NAME_LENGTH) : fallback;
}

export function sanitizeRoomName(value: unknown, fallback = 'Adventure Room'): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned.slice(0, MAX_ROOM_NAME_LENGTH) : fallback;
}

export function isValidClientMessageType(value: unknown): value is ClientMessageType {
  return (
    typeof value === 'string' &&
    (CLIENT_MESSAGE_TYPES as readonly string[]).includes(value)
  );
}

export const FORBIDDEN_CLIENT_AUTHORITY_KEYS = new Set<string>([
  'health',
  'maxHealth',
  'isDead',
  'networkEntityId',
  'serverTime',
  'inventory',
  'items',
  'coins',
  'damage',
  'seed',
  'worldSeed',
  'worldType',
  'gameMode',
  'difficulty',
  'worldSettings',
  'isHost',
  'hostId',
  'xp',
  'level',
]);

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseCorePlayerMotionFields(
  obj: Record<string, unknown>,
): { ok: true; state: PlayerNetworkState } | { ok: false; reason: string } {
  const { x, y, z, yaw } = obj;
  if (
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    typeof y !== 'number' ||
    !Number.isFinite(y) ||
    typeof z !== 'number' ||
    !Number.isFinite(z) ||
    typeof yaw !== 'number' ||
    !Number.isFinite(yaw)
  ) {
    return { ok: false, reason: 'PLAYER_STATE requires finite numeric x, y, z, yaw.' };
  }

  if (Math.abs(x) > MAX_PLAYABLE_COORD || Math.abs(z) > MAX_PLAYABLE_COORD) {
    return { ok: false, reason: 'PLAYER_STATE coordinates exceed world bounds.' };
  }
  if (y < -200 || y > 1200) {
    return { ok: false, reason: 'PLAYER_STATE elevation exceeds world bounds.' };
  }

  const state: PlayerNetworkState = {
    x: round3(x),
    y: round3(y),
    z: round3(z),
    yaw: round3(yaw),
  };

  if (typeof obj.aimYaw === 'number' && Number.isFinite(obj.aimYaw)) {
    state.aimYaw = round3(Math.max(-Math.PI * 2, Math.min(Math.PI * 2, obj.aimYaw)));
  }
  if (typeof obj.pitch === 'number' && Number.isFinite(obj.pitch)) {
    state.pitch = round3(Math.max(-Math.PI, Math.min(Math.PI, obj.pitch)));
  }
  if (typeof obj.vx === 'number' && Number.isFinite(obj.vx)) {
    state.vx = round2(Math.max(-60, Math.min(60, obj.vx)));
  }
  if (typeof obj.vy === 'number' && Number.isFinite(obj.vy)) {
    state.vy = round2(Math.max(-80, Math.min(80, obj.vy)));
  }
  if (typeof obj.vz === 'number' && Number.isFinite(obj.vz)) {
    state.vz = round2(Math.max(-60, Math.min(60, obj.vz)));
  }
  if (
    obj.movementState === 'idle' ||
    obj.movementState === 'walking' ||
    obj.movementState === 'running' ||
    obj.movementState === 'jumping' ||
    obj.movementState === 'falling'
  ) {
    state.movementState = obj.movementState;
  }
  if (typeof obj.animState === 'string' && ALLOWED_ATTACK_ANIM_TYPES.has(obj.animState)) {
    state.animState = obj.animState;
  }
  if (typeof obj.sprinting === 'boolean') {
    state.sprinting = obj.sprinting;
  }
  if (typeof obj.jumping === 'boolean') {
    state.jumping = obj.jumping;
  }
  if (typeof obj.crouching === 'boolean') {
    state.crouching = obj.crouching;
  }
  if (typeof obj.grounded === 'boolean') {
    state.grounded = obj.grounded;
  }
  if (obj.weaponId === null) {
    state.weaponId = null;
  } else if (typeof obj.weaponId === 'string') {
    if (!ALLOWED_WEAPON_IDS.has(obj.weaponId)) {
      return { ok: false, reason: `Unknown weaponId "${obj.weaponId}".` };
    }
    state.weaponId = obj.weaponId;
  }
  if (typeof obj.bowCharging === 'boolean') {
    state.bowCharging = obj.bowCharging;
  }
  if (typeof obj.bowCharge === 'number' && Number.isFinite(obj.bowCharge)) {
    state.bowCharge = round2(Math.max(0, Math.min(1, obj.bowCharge)));
  }
  if (typeof obj.shooting === 'boolean') {
    state.shooting = obj.shooting;
  }
  if (typeof obj.reloading === 'boolean') {
    state.reloading = obj.reloading;
  }
  if (typeof obj.seq === 'number' && Number.isInteger(obj.seq) && obj.seq >= 0) {
    state.seq = obj.seq;
  }

  return { ok: true, state };
}

/**
 * Validates an untrusted client-sent PLAYER_STATE payload.
 * Rejects any forbidden server-authoritative fields.
 */
export function validatePlayerStatePayload(
  raw: unknown,
): { ok: true; state: PlayerNetworkState } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'PLAYER_STATE payload must be an object.' };
  }
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_CLIENT_AUTHORITY_KEYS.has(key)) {
      return {
        ok: false,
        reason: `Client cannot modify authoritative field "${key}".`,
      };
    }
  }
  return parseCorePlayerMotionFields(obj);
}

/**
 * Parses a server-relayed PLAYER_STATE payload on the receiving client,
 * preserving server-stamped authoritative vitals & entity identity.
 */
export function parseRelayedPlayerStatePayload(
  raw: unknown,
): { ok: true; state: PlayerNetworkState } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'PLAYER_STATE payload must be an object.' };
  }
  const obj = raw as Record<string, unknown>;
  const core = parseCorePlayerMotionFields(obj);
  if (!core.ok) return core;

  if (typeof obj.networkEntityId === 'string' && obj.networkEntityId.length > 0) {
    core.state.networkEntityId = obj.networkEntityId;
  }
  if (typeof obj.health === 'number' && Number.isFinite(obj.health)) {
    core.state.health = Math.max(0, Math.round(obj.health));
  }
  if (typeof obj.maxHealth === 'number' && Number.isFinite(obj.maxHealth)) {
    core.state.maxHealth = Math.max(1, Math.round(obj.maxHealth));
  }
  if (typeof obj.isDead === 'boolean') {
    core.state.isDead = obj.isDead;
  }
  if (typeof obj.serverTime === 'number' && Number.isFinite(obj.serverTime)) {
    core.state.serverTime = obj.serverTime;
  }
  return core;
}

const COORDINATE_DATA_KEYS = new Set<string>([
  'x',
  'y',
  'z',
  'originX',
  'originY',
  'originZ',
  'dirX',
  'dirY',
  'dirZ',
  'yaw',
]);

export function validateGameEventPayload(
  raw: unknown,
  allowServerBroadcastFields = false,
): { ok: true; payload: GameEventPayload } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'GAME_EVENT payload must be an object.' };
  }
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.event !== 'string' ||
    obj.event.length === 0 ||
    obj.event.length > MAX_GAME_EVENT_NAME_LENGTH ||
    !ALLOWED_GAME_EVENTS.has(obj.event)
  ) {
    return { ok: false, reason: 'Unsupported or invalid GAME_EVENT name.' };
  }

  if (!allowServerBroadcastFields && SERVER_ONLY_GAME_EVENTS.has(obj.event)) {
    return {
      ok: false,
      reason: `Event "${obj.event}" is server-authoritative and cannot be emitted directly by clients.`,
    };
  }

  const allowsCoords = allowServerBroadcastFields || CLIENT_COORDINATE_EVENTS.has(obj.event);
  const sanitizedData: Record<string, string | number | boolean | null> = {};
  if (obj.data !== undefined) {
    if (!obj.data || typeof obj.data !== 'object' || Array.isArray(obj.data)) {
      return { ok: false, reason: 'GAME_EVENT data must be a flat record.' };
    }
    const entries = Object.entries(obj.data as Record<string, unknown>).slice(0, 18);
    for (const [key, val] of entries) {
      if (key.length === 0 || key.length > 32) continue;
      if (!allowServerBroadcastFields) {
        if (FORBIDDEN_CLIENT_AUTHORITY_KEYS.has(key) || key === 'position') {
          return {
            ok: false,
            reason: `Client cannot supply authoritative gameplay field "${key}" in GAME_EVENT.`,
          };
        }
        if (!allowsCoords && COORDINATE_DATA_KEYS.has(key)) {
          return {
            ok: false,
            reason: `Client cannot supply coordinate field "${key}" in "${obj.event}".`,
          };
        }
      }
      if (typeof val === 'string') {
        sanitizedData[key] = val.slice(0, 160);
      } else if (typeof val === 'number' && Number.isFinite(val)) {
        if (
          (key === 'x' || key === 'z' || key === 'originX' || key === 'originZ') &&
          Math.abs(val) > MAX_PLAYABLE_COORD
        ) {
          return {
            ok: false,
            reason: `Coordinate "${key}" exceeds world bounds.`,
          };
        }
        if ((key === 'y' || key === 'originY') && (val < -200 || val > 1200)) {
          return {
            ok: false,
            reason: `Elevation "${key}" exceeds world bounds.`,
          };
        }
        sanitizedData[key] = round3(val);
      } else if (typeof val === 'boolean' || val === null) {
        sanitizedData[key] = val;
      }
    }
  }

  return {
    ok: true,
    payload: {
      event: obj.event,
      data: sanitizedData,
    },
  };
}

export function validateEntitySyncBatchPayload(
  raw: unknown,
): { ok: true; payload: EntitySyncBatchPayload } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'ENTITY_SYNC payload must be an object.' };
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.entities)) {
    return { ok: false, reason: 'ENTITY_SYNC requires an entities array.' };
  }
  if (obj.entities.length > 22) {
    return { ok: false, reason: 'ENTITY_SYNC batch exceeds maximum entity count (22).' };
  }

  const sanitized: SyncedEntityDelta[] = [];
  for (const item of obj.entities) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    if (
      typeof rec.id !== 'string' ||
      rec.id.length === 0 ||
      rec.id.length > 64 ||
      (rec.kind !== 'npc' && rec.kind !== 'animal' && rec.kind !== 'enemy') ||
      typeof rec.archetype !== 'string' ||
      rec.archetype.length === 0 ||
      rec.archetype.length > 32 ||
      typeof rec.x !== 'number' ||
      !Number.isFinite(rec.x) ||
      typeof rec.y !== 'number' ||
      !Number.isFinite(rec.y) ||
      typeof rec.z !== 'number' ||
      !Number.isFinite(rec.z) ||
      typeof rec.yaw !== 'number' ||
      !Number.isFinite(rec.yaw) ||
      typeof rec.state !== 'string' ||
      rec.state.length === 0 ||
      rec.state.length > 24
    ) {
      return { ok: false, reason: 'Invalid entity delta entry in ENTITY_SYNC.' };
    }
    if (
      Math.abs(rec.x) > MAX_PLAYABLE_COORD ||
      Math.abs(rec.z) > MAX_PLAYABLE_COORD ||
      rec.y < -200 ||
      rec.y > 1200
    ) {
      continue;
    }

    const delta: SyncedEntityDelta = {
      id: rec.id,
      kind: rec.kind,
      archetype: rec.archetype,
      x: round2(rec.x),
      y: round2(rec.y),
      z: round2(rec.z),
      yaw: round2(rec.yaw),
      state: rec.state,
    };
    if (typeof rec.tx === 'number' && Number.isFinite(rec.tx)) {
      delta.tx = round2(rec.tx);
    }
    if (typeof rec.tz === 'number' && Number.isFinite(rec.tz)) {
      delta.tz = round2(rec.tz);
    }
    if (typeof rec.hp === 'number' && Number.isFinite(rec.hp)) {
      delta.hp = Math.max(0, Math.round(rec.hp));
    }
    if (typeof rec.maxHp === 'number' && Number.isFinite(rec.maxHp)) {
      delta.maxHp = Math.max(1, Math.round(rec.maxHp));
    }
    if (typeof rec.isDead === 'boolean') {
      delta.isDead = rec.isDead;
    }
    sanitized.push(delta);
  }

  const out: EntitySyncBatchPayload = { entities: sanitized };
  if (typeof obj.worldHours === 'number' && Number.isFinite(obj.worldHours)) {
    out.worldHours = round3(((obj.worldHours % 24) + 24) % 24);
  }
  if (typeof obj.weather === 'string' && obj.weather.length <= 24) {
    out.weather = obj.weather;
  }
  return { ok: true, payload: out };
}

export function sanitizeChatText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\r\n?/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateChatMessageInput(
  raw: unknown,
): { ok: true; message: string } | { ok: false; code: string; reason: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      code: 'INVALID_CHAT_PAYLOAD',
      reason: 'ROOM_CHAT payload must be an object.',
    };
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.message !== 'string') {
    return {
      ok: false,
      code: 'INVALID_CHAT_PAYLOAD',
      reason: 'ROOM_CHAT requires a string message.',
    };
  }
  const cleaned = sanitizeChatText(obj.message);
  if (cleaned.length === 0) {
    return {
      ok: false,
      code: 'EMPTY_CHAT_MESSAGE',
      reason: 'Chat message cannot be empty.',
    };
  }
  if (cleaned.length > MAX_CHAT_MESSAGE_LENGTH) {
    return {
      ok: false,
      code: 'CHAT_TOO_LONG',
      reason: `Chat message exceeds ${MAX_CHAT_MESSAGE_LENGTH} characters.`,
    };
  }
  return { ok: true, message: cleaned };
}

export function parseRelayedChatMessage(raw: unknown): RoomChatMessage | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.id !== 'string' ||
    obj.id.length === 0 ||
    typeof obj.playerId !== 'string' ||
    typeof obj.playerName !== 'string' ||
    typeof obj.message !== 'string' ||
    typeof obj.timestamp !== 'number' ||
    !Number.isFinite(obj.timestamp)
  ) {
    return null;
  }
  const cleanedMsg = sanitizeChatText(obj.message).slice(0, MAX_CHAT_MESSAGE_LENGTH);
  if (!cleanedMsg) return null;
  return {
    id: obj.id.slice(0, 64),
    playerId: obj.playerId.slice(0, 64),
    ...(typeof obj.publicProfileId === 'string' && obj.publicProfileId.length > 0
      ? { publicProfileId: obj.publicProfileId.slice(0, 32) }
      : {}),
    playerName: sanitizeDisplayName(obj.playerName),
    ...(typeof obj.playerTag === 'string' && /^\d{4}$/.test(obj.playerTag)
      ? { playerTag: obj.playerTag }
      : {}),
    ...(obj.avatar && typeof obj.avatar === 'object'
      ? { avatar: obj.avatar as AvatarConfig }
      : {}),
    message: cleanedMsg,
    timestamp: Math.round(obj.timestamp),
    ...(obj.isSystem === true ? { isSystem: true } : {}),
  };
}

export function validatePlayerReportPayload(
  raw: unknown,
  reporterPlayerId: string,
): { ok: true; payload: PlayerReportPayload } | { ok: false; code: string; reason: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      code: 'INVALID_REPORT_PAYLOAD',
      reason: 'PLAYER_REPORT payload must be an object.',
    };
  }
  const obj = raw as Record<string, unknown>;
  if (!isValidPlayerId(obj.targetPlayerId)) {
    return {
      ok: false,
      code: 'INVALID_TARGET_PLAYER',
      reason: 'PLAYER_REPORT requires a valid targetPlayerId.',
    };
  }
  if (obj.targetPlayerId === reporterPlayerId) {
    return {
      ok: false,
      code: 'CANNOT_REPORT_SELF',
      reason: 'You cannot report yourself.',
    };
  }
  if (
    typeof obj.reason !== 'string' ||
    !(ALLOWED_REPORT_REASONS as readonly string[]).includes(obj.reason)
  ) {
    return {
      ok: false,
      code: 'INVALID_REPORT_REASON',
      reason: 'PLAYER_REPORT requires a valid report reason.',
    };
  }
  let details: string | undefined;
  if (typeof obj.details === 'string') {
    const cleanedDetails = sanitizeChatText(obj.details).slice(
      0,
      PLAYER_REPORT_DETAILS_MAX_LENGTH,
    );
    if (cleanedDetails.length > 0) {
      details = cleanedDetails;
    }
  }
  return {
    ok: true,
    payload: {
      targetPlayerId: obj.targetPlayerId,
      reason: obj.reason as PlayerReportReason,
      ...(details ? { details } : {}),
    },
  };
}

