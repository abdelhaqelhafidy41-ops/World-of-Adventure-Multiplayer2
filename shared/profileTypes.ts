export type AvatarKind = 'preset' | 'generated' | 'uploaded';

export interface AvatarConfig {
  kind: AvatarKind;
  /**
   * - preset: one of PRESET_AVATAR_IDS (e.g. 'ranger')
   * - generated: deterministic seed string (e.g. 'WA-7K4P9X2M')
   * - uploaded: compressed square thumbnail data URL (data:image/webp|png|jpeg;base64,...)
   */
  value: string;
  color?: string;
}

export const PRESET_AVATAR_IDS = [
  'ranger',
  'knight',
  'mystic',
  'scout',
  'blacksmith',
  'hunter',
  'nomad',
  'guardian',
] as const;

export type PresetAvatarId = (typeof PRESET_AVATAR_IDS)[number];

export type OnlinePresenceStatus = 'online' | 'away' | 'in-game' | 'offline';
export type EditablePresenceStatus = 'online' | 'away' | 'offline';
export type MessagePrivacyOption = 'everyone' | 'friends' | 'nobody';
export type FavoriteGameMode = 'normal' | 'adventure' | 'survival' | 'creative';

export const MAX_PROFILE_NAME_LENGTH = 20;
export const MIN_PROFILE_NAME_LENGTH = 3;
export const MAX_BIO_LENGTH = 160;
export const MAX_COUNTRY_LENGTH = 40;
export const MAX_AVATAR_DATA_URL_LENGTH = 36_000;
export const MAX_DIRECT_MESSAGE_LENGTH = 240;

export interface PlayerPrivacySettings {
  showOnlineStatus: boolean;
  showPlayerName: boolean;
  allowFriendRequests: boolean;
  allowGameInvites: boolean;
  allowMessages: MessagePrivacyOption;
}

export const DEFAULT_PLAYER_PRIVACY: PlayerPrivacySettings = {
  showOnlineStatus: true,
  showPlayerName: true,
  allowFriendRequests: true,
  allowGameInvites: true,
  allowMessages: 'everyone',
};

export interface PlayerProfileStats {
  level: number;
  xp: number;
  xpToNextLevel: number;
  playTimeSeconds: number;
  worldsCreated: number;
  worldsJoined: number;
  questsCompleted: number;
  enemiesDefeated: number;
  animalsDefeated: number;
  villagesDiscovered: number;
  resourcesCollected: number;
  distanceTraveledMeters: number;
  multiplayerSessions: number;
  gamesHosted: number;
}

export interface ProfileStatsDelta {
  xpGained?: number;
  playTimeSeconds?: number;
  worldsCreated?: number;
  worldsJoined?: number;
  questsCompleted?: number;
  enemiesDefeated?: number;
  animalsDefeated?: number;
  villagesDiscovered?: number;
  resourcesCollected?: number;
  distanceTraveledMeters?: number;
  multiplayerSessions?: number;
  gamesHosted?: number;
}

export interface PublicPlayerProfile {
  publicProfileId: string;
  displayName: string;
  playerTag: string;
  avatar: AvatarConfig;
  bio: string;
  country: string;
  favoriteGameMode: FavoriteGameMode;
  presenceStatus: OnlinePresenceStatus;
  statusNote?: string;
  isOnlineVisible: boolean;
  currentRoomId?: string | null;
  currentRoomName?: string | null;
  stats: PlayerProfileStats;
  createdAt: number;
  lastActiveAt: number;
}

export interface OwnPlayerProfile extends PublicPlayerProfile {
  manualStatus: EditablePresenceStatus;
  privacy: PlayerPrivacySettings;
  tagUpdatedAt: number;
  friendsCount: number;
  pendingIncomingRequestsCount: number;
  pendingOutgoingRequestsCount: number;
  blockedCount: number;
}

export interface PlayerSearchSummary {
  publicProfileId: string;
  displayName: string;
  playerTag: string;
  avatar: AvatarConfig;
  presenceStatus: OnlinePresenceStatus;
  isOnlineVisible: boolean;
  level: number;
  favoriteGameMode: FavoriteGameMode;
  currentRoomId?: string | null;
  currentRoomName?: string | null;
  isFriend?: boolean;
  hasIncomingRequest?: boolean;
  hasOutgoingRequest?: boolean;
}

export interface FriendRecord {
  publicProfileId: string;
  displayName: string;
  playerTag: string;
  avatar: AvatarConfig;
  presenceStatus: OnlinePresenceStatus;
  isOnlineVisible: boolean;
  level: number;
  favoriteGameMode: FavoriteGameMode;
  currentRoomId?: string | null;
  currentRoomName?: string | null;
  addedAt: number;
  lastActiveAt: number;
}

export interface FriendRequestRecord {
  requestId: string;
  fromPublicProfileId: string;
  fromDisplayName: string;
  fromPlayerTag: string;
  fromAvatar: AvatarConfig;
  toPublicProfileId: string;
  toDisplayName: string;
  toPlayerTag: string;
  toAvatar: AvatarConfig;
  createdAt: number;
}

export interface DirectMessageRecord {
  id: string;
  fromPublicProfileId: string;
  fromDisplayName: string;
  fromPlayerTag: string;
  fromAvatar: AvatarConfig;
  toPublicProfileId: string;
  message: string;
  timestamp: number;
}

const PUBLIC_PROFILE_ID_RE = /^WA-[A-Z0-9]{6,10}$/;
const PLAYER_TAG_RE = /^\d{4}$/;
// Allows English/Latin letters, Arabic blocks, numbers, single spaces, underscore, hyphen
const SAFE_PLAYER_NAME_RE =
  /^[\p{L}\p{N}\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF _-]+$/u;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const UPLOADED_AVATAR_RE = /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/;

export function getXpRequiredForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.min(200, Math.floor(level)));
  return Math.round(120 * Math.pow(1.22, safeLevel - 1));
}

export function createEmptyProfileStats(): PlayerProfileStats {
  return {
    level: 1,
    xp: 0,
    xpToNextLevel: getXpRequiredForLevel(1),
    playTimeSeconds: 0,
    worldsCreated: 0,
    worldsJoined: 0,
    questsCompleted: 0,
    enemiesDefeated: 0,
    animalsDefeated: 0,
    villagesDiscovered: 0,
    resourcesCollected: 0,
    distanceTraveledMeters: 0,
    multiplayerSessions: 0,
    gamesHosted: 0,
  };
}

export function computeLevelAndXp(
  currentLevel: number,
  currentXp: number,
  xpGain: number,
): { level: number; xp: number; xpToNextLevel: number } {
  let level = Math.max(1, Math.min(200, Math.floor(currentLevel || 1)));
  let xp = Math.max(0, Math.floor(currentXp || 0)) + Math.max(0, Math.floor(xpGain || 0));
  let required = getXpRequiredForLevel(level);
  while (xp >= required && level < 200) {
    xp -= required;
    level += 1;
    required = getXpRequiredForLevel(level);
  }
  return { level, xp, xpToNextLevel: required };
}

export function isValidPublicPlayerId(value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_PROFILE_ID_RE.test(value.trim().toUpperCase());
}

export function validatePlayerTag(value: unknown): { ok: true; tag: string } | { ok: false; reason: string } {
  if (typeof value !== 'string') {
    return { ok: false, reason: 'Player tag must be a 4-digit string.' };
  }
  const cleaned = value.replace(/^#/, '').trim();
  if (!PLAYER_TAG_RE.test(cleaned)) {
    return { ok: false, reason: 'Player tag must be exactly 4 digits (e.g. 4827).' };
  }
  return { ok: true, tag: cleaned };
}

export function stripDangerousText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>&"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizePlayerNameInput(raw: unknown): string {
  return stripDangerousText(raw).slice(0, MAX_PROFILE_NAME_LENGTH);
}

export function validatePlayerName(
  raw: unknown,
): { ok: true; name: string } | { ok: false; code: string; reason: string } {
  if (typeof raw !== 'string') {
    return { ok: false, code: 'INVALID_PLAYER_NAME', reason: 'Player name must be text.' };
  }
  const normalized = stripDangerousText(raw);
  const chars = Array.from(normalized);
  if (chars.length < MIN_PROFILE_NAME_LENGTH) {
    return {
      ok: false,
      code: 'PLAYER_NAME_TOO_SHORT',
      reason: `Player name must be at least ${MIN_PROFILE_NAME_LENGTH} characters.`,
    };
  }
  if (chars.length > MAX_PROFILE_NAME_LENGTH) {
    return {
      ok: false,
      code: 'PLAYER_NAME_TOO_LONG',
      reason: `Player name cannot exceed ${MAX_PROFILE_NAME_LENGTH} characters.`,
    };
  }
  if (!SAFE_PLAYER_NAME_RE.test(normalized)) {
    return {
      ok: false,
      code: 'INVALID_PLAYER_NAME_CHARS',
      reason: 'Player name may contain Arabic, English letters, numbers, spaces, _ or -.',
    };
  }
  return { ok: true, name: normalized };
}

export function sanitizeBio(raw: unknown): string {
  return stripDangerousText(raw).slice(0, MAX_BIO_LENGTH);
}

export function sanitizeCountryRegion(raw: unknown): string {
  return stripDangerousText(raw).slice(0, MAX_COUNTRY_LENGTH);
}

export function validateFavoriteGameMode(raw: unknown): FavoriteGameMode {
  if (
    raw === 'normal' ||
    raw === 'adventure' ||
    raw === 'survival' ||
    raw === 'creative'
  ) {
    return raw;
  }
  return 'normal';
}

export function validateAvatarConfig(
  raw: unknown,
  fallbackSeed = 'ranger',
): { ok: true; avatar: AvatarConfig } | { ok: false; code: string; reason: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: true,
      avatar: { kind: 'preset', value: 'ranger', color: '#3b82f6' },
    };
  }
  const obj = raw as Record<string, unknown>;
  const color =
    typeof obj.color === 'string' && HEX_COLOR_RE.test(obj.color.trim())
      ? obj.color.trim()
      : '#3b82f6';

  if (obj.kind === 'preset') {
    const val = typeof obj.value === 'string' ? obj.value.trim() : '';
    if (!(PRESET_AVATAR_IDS as readonly string[]).includes(val)) {
      return {
        ok: false,
        code: 'INVALID_AVATAR_PRESET',
        reason: 'Selected preset avatar does not exist.',
      };
    }
    return { ok: true, avatar: { kind: 'preset', value: val, color } };
  }

  if (obj.kind === 'generated') {
    const seed = stripDangerousText(typeof obj.value === 'string' ? obj.value : fallbackSeed)
      .replace(/[^A-Za-z0-9_-]/g, '')
      .slice(0, 32);
    return {
      ok: true,
      avatar: { kind: 'generated', value: seed || fallbackSeed, color },
    };
  }

  if (obj.kind === 'uploaded') {
    const dataUrl = typeof obj.value === 'string' ? obj.value.trim() : '';
    if (
      !dataUrl ||
      dataUrl.length > MAX_AVATAR_DATA_URL_LENGTH ||
      !UPLOADED_AVATAR_RE.test(dataUrl)
    ) {
      return {
        ok: false,
        code: 'INVALID_AVATAR_IMAGE',
        reason: 'Uploaded avatar must be a compact square WebP, PNG, or JPEG thumbnail.',
      };
    }
    return { ok: true, avatar: { kind: 'uploaded', value: dataUrl, color } };
  }

  return {
    ok: false,
    code: 'INVALID_AVATAR_KIND',
    reason: 'Unsupported avatar type.',
  };
}
