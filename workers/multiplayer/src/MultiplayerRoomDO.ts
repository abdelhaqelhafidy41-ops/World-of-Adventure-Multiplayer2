import {
  ALLOWED_ATTACK_ANIM_TYPES,
  ALLOWED_MAX_PLAYER_COUNTS,
  ALLOWED_WEAPON_IDS,
  CHAT_HISTORY_LIMIT,
  CHAT_RATE_COOLDOWN_MS,
  HEARTBEAT_TIMEOUT_MS,
  HOST_DISCONNECT_GRACE_MS,
  MAX_PLAYERS_PER_ROOM,
  MAX_WEATHER_DURATION_MS,
  MIN_PLAYERS_PER_ROOM,
  MULTIPLAYER_PROTOCOL_VERSION,
  PLAYER_RECONNECT_GRACE_MS,
  ROOM_INACTIVE_TIMEOUT_MS,
  SERVER_ANIMAL_MAX_HP,
  SERVER_CRAFTABLE_YIELDS,
  SERVER_ENEMY_MAX_HP,
  SERVER_NPC_MAX_HP,
  SERVER_WEAPON_SPECS,
  generateNetworkEntityId,
  getConnectionQuality,
  isValidPlayerId,
  isValidRoomId,
  pickAvatarColor,
  sanitizeDisplayName,
  sanitizeRoomName,
  type AuthoritativePlayerVitals,
  type AuthoritativeProgressionState,
  type AuthoritativeRoomSnapshot,
  type AuthoritativeWorldSettings,
  type AuthoritativeWorldTimeState,
  type AuthoritativeWorldWeatherState,
  type ChatHistoryPayload,
  type DifficultyLevel,
  type NetworkEnvelope,
  type NetworkPlayerRecord,
  type PlayerNetworkState,
  type PlayerReportReason,
  type PositionCorrectionPayload,
  type ReportAckPayload,
  type RoomChatMessage,
  type RoomGameState,
  type RoomPrivacy,
  type RoomStatus,
  type RoomWorldSnapshotPayload,
  type ServerMessageType,
  type SyncedEntityKind,
  type WorldSettingsPermission,
  type WorldTimePreset,
  type WorldWeatherState,
  type WorldType,
} from '../../../shared/multiplayerProtocol';
import type { AvatarConfig, ProfileStatsDelta } from '../../../shared/profileTypes';
import {
  createCfWebSocketPair,
  makeWebSocketUpgradeResponse,
  type CfDurableObjectState,
  type CfEnv,
  type CfWebSocket,
} from './cfTypes';
import { ConnectionRateLimiter } from './rateLimiter';
import {
  generateSecurePlayerId,
  generateSecureRoomCode,
  generateSecureSessionToken,
  generateSecureWorldSeed,
  sha256Hex,
  timingSafeEqualHex,
} from './roomId';
import { validateClientMessage } from './validation';

interface AuthoritativePlayerRecord {
  networkEntityId: string;
  health: number;
  maxHealth: number;
  isDead: boolean;
  reviveAtMs: number | null;
  lastDamageAtMs: number;
  lastAttackAtMs: number;
  lastSwingId: string | null;
  lastSwingWeaponId: string | null;
  lastSwingAtMs: number;
  lastSwingTargetIds: string[];
  ammoCount: number;
  equippedWeaponId: string | null;
  inventoryItemIds: string[];
  lastX: number;
  lastY: number;
  lastZ: number;
  lastStateAtMs: number;
  movementJitterM: number;
  lastBedUsedAtMs: number;
  lastResourceCollectAtMs: number;
  chestWeaponLootCount: number;
  coins: number;
  xp: number;
  level: number;
  lastEnemyAttackAtBySource: Record<string, number>;
}

interface ServerTrackedEntity {
  id: string;
  kind: SyncedEntityKind;
  archetype: string;
  maxHp: number;
  hp: number;
  isDead: boolean;
  diedAtMs: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  state: string;
  lastUpdatedAtMs: number;
}

interface ServerTrackedArrow {
  arrowId: string;
  shooterId: string;
  weaponId: string;
  charge: number;
  originX: number;
  originY: number;
  originZ: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  speed: number;
  gravity: number;
  createdAtMs: number;
  consumed: boolean;
}

interface RoomQuestEntry {
  questId: string;
  status: string;
  stepIndex: number;
  updatedBy: string;
  updatedAtMs: number;
}

interface RoomWorldSyncState {
  entities: Record<string, ServerTrackedEntity>;
  openedChests: Record<string, { openedBy: string; openedAtMs: number }>;
  collectedPickups: Record<string, string>;
  depletedResources: Record<
    string,
    { usesRemaining: number; regenAtMs: number; collectedBy: string }
  >;
  doors: Record<string, boolean>;
  placedBeds: Record<
    string,
    { id: string; ownerId: string; x: number; y: number; z: number; yaw: number }
  >;
  droppedItems: Record<
    string,
    {
      id: string;
      itemId: string;
      count: number;
      label: string;
      x: number;
      y: number;
      z: number;
      droppedBy: string;
    }
  >;
  quests?: Record<string, RoomQuestEntry>;
  questsByPlayer?: Record<string, Record<string, RoomQuestEntry>>;
  discoveredLandmarks: string[];
  worldHours?: number;
  weather?: string;
}

interface RoomReportEntry {
  reportId: string;
  targetPlayerId: string;
  targetDisplayName: string;
  reporterPlayerId: string;
  reason: PlayerReportReason;
  details?: string;
  timestamp: number;
}

interface StoredRoomRecord {
  roomId: string;
  roomCode: string;
  roomName: string;
  hostId: string;
  players: Record<string, NetworkPlayerRecord>;
  authoritativePlayers?: Record<string, AuthoritativePlayerRecord>;
  worldSync?: RoomWorldSyncState;
  chatMessages?: RoomChatMessage[];
  reports?: RoomReportEntry[];
  maxPlayers: number;
  status: RoomStatus;
  gameState: RoomGameState;
  passwordHash: string | null;
  playerTokens: Record<string, string>;
  createdAt: number;
  lastActivityAt?: number;
  lastPlayerJoinedAt?: number | null;
  lastPlayerLeftAt?: number | null;
  expiresAt?: number;
  worldTime?: AuthoritativeWorldTimeState;
  worldWeather?: AuthoritativeWorldWeatherState;
}

interface ActiveSocketSession {
  ws: CfWebSocket;
  playerId: string;
  clientIp: string;
  limiter: ConnectionRateLimiter;
  connectedAt: number;
  pendingPingId: number;
  pendingPingSentAt: number;
  lastRttMeasuredAt: number;
  nextPingSeq: number;
  lastChatSentAtMs: number;
  lastChatNormalized: string;
  duplicateChatStreak: number;
  reportedTargets: Set<string>;
  cleanDisconnect: boolean;
}

const ROOM_STORAGE_KEY = 'authoritative_room_v1';
const MAX_PLAYER_SPEED_MPS = 18;
const MAX_MOVEMENT_JITTER_M = 6;
const MAX_CONNECTIONS_PER_IP_PER_ROOM = 8;
const BED_HEAL_COOLDOWN_MS = 8_000;
const STARTING_COINS_BY_WORLD_TYPE: Record<WorldType, number> = {
  creative: 500,
  adventure: 50,
  normal: 0,
  survival: 0,
};
const TIME_PRESET_HOURS: Record<WorldTimePreset, number> = {
  sunrise: 6.2,
  noon: 12.0,
  sunset: 18.2,
  midnight: 0.0,
};
const ENEMY_REWARDS: Record<string, { xp: number; coins: number }> = {
  bandit_scout: { xp: 25, coins: 12 },
  thorn_stalker: { xp: 18, coins: 8 },
  stone_sentinel: { xp: 55, coins: 30 },
};
const VALID_QUEST_STATUSES = new Set<string>([
  'locked',
  'available',
  'active',
  'completed',
]);
const VALID_WORLD_TYPES = new Set<WorldType>([
  'normal',
  'adventure',
  'survival',
  'creative',
]);
const VALID_DIFFICULTIES = new Set<DifficultyLevel>(['easy', 'normal', 'hard']);
const VALID_PRIVACY = new Set<RoomPrivacy>(['public', 'friends', 'private']);

export class MultiplayerRoomDO {
  private readonly ctx: CfDurableObjectState;
  private readonly env: CfEnv;
  private room: StoredRoomRecord | null = null;
  private loaded = false;
  private readonly sessions = new Map<WebSocket, ActiveSocketSession>();
  private readonly activeArrows = new Map<string, ServerTrackedArrow>();
  private chatSeq = 0;
  private reportSeq = 0;
  private readonly bootAt = Date.now();
  private lastStatePersistAt = 0;
  private sweepTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly wsHandshakeTimestamps = new Map<string, number[]>();
  private readonly lastAmmoCraftAtByPlayer = new Map<string, number>();

  constructor(ctx: CfDurableObjectState, env: CfEnv) {
    this.ctx = ctx;
    this.env = env;
  }

  private getHostDisconnectGraceMs(): number {
    const raw = Number(this.env.HOST_DISCONNECT_GRACE_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : HOST_DISCONNECT_GRACE_MS;
  }

  private getPlayerReconnectGraceMs(): number {
    const raw = Number(this.env.PLAYER_RECONNECT_GRACE_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : PLAYER_RECONNECT_GRACE_MS;
  }

  private clearSweepTimer(): void {
    if (this.sweepTimer !== null) {
      clearTimeout(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const saved = await this.ctx.storage.get<StoredRoomRecord>(ROOM_STORAGE_KEY);
    if (saved && isValidRoomId(saved.roomId)) {
      this.room = saved;
      // After a DO eviction or server restart, active WebSockets are gone; grant a fresh
      // reconnection grace window from this server boot time so clients can auto-reconnect.
      const connectedIds = new Set(
        Array.from(this.sessions.values()).map((s) => s.playerId),
      );
      let modified = false;
      for (const p of Object.values(this.room.players)) {
        if (!connectedIds.has(p.playerId)) {
          if (p.disconnectedAt === undefined || p.disconnectedAt === null) {
            p.disconnectedAt = this.bootAt;
            modified = true;
          }
          if (p.connectionQuality !== 'disconnected') {
            p.connectionQuality = 'disconnected';
            modified = true;
          }
        }
      }
      if (!this.room.lastActivityAt) {
        this.room.lastActivityAt = this.room.createdAt || this.bootAt;
        modified = true;
      }
      if (!this.room.expiresAt) {
        this.room.expiresAt = this.room.lastActivityAt + ROOM_INACTIVE_TIMEOUT_MS;
        modified = true;
      }
      if (modified) {
        await this.persist();
      }
      const expired = await this.expireIfNeeded(this.bootAt);
      if (!expired && this.room.status !== 'closed') {
        await this.scheduleLifecycleSweep();
      }
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    if (!this.room) {
      this.clearSweepTimer();
      await this.ctx.storage.deleteAlarm?.();
      await this.ctx.storage.delete(ROOM_STORAGE_KEY);
      return;
    }
    await this.ctx.storage.put(ROOM_STORAGE_KEY, this.room);
  }

  private ensureWorldSync(): RoomWorldSyncState {
    if (!this.room!.worldSync) {
      this.room!.worldSync = {
        entities: {},
        openedChests: {},
        collectedPickups: {},
        depletedResources: {},
        doors: {},
        placedBeds: {},
        droppedItems: {},
        questsByPlayer: {},
        discoveredLandmarks: [],
      };
    }
    if (!this.room!.worldSync.questsByPlayer) {
      this.room!.worldSync.questsByPlayer = {};
    }
    return this.room!.worldSync;
  }

  private getDefaultStartingCoins(): number {
    const wt = this.room?.gameState.worldType ?? 'normal';
    return STARTING_COINS_BY_WORLD_TYPE[wt] ?? 0;
  }

  private touchRoomActivity(nowMs: number): void {
    if (!this.room || this.room.status === 'closed') return;
    this.room.lastActivityAt = nowMs;
    this.room.expiresAt = nowMs + ROOM_INACTIVE_TIMEOUT_MS;
  }

  private ensureWorldTime(nowMs: number): AuthoritativeWorldTimeState {
    const ws = this.ensureWorldSync();
    if (!this.room!.worldTime) {
      this.room!.worldTime = {
        worldHours: typeof ws.worldHours === 'number' ? ws.worldHours : 8.2,
        dayCount: 1,
        timeScale: 1,
        paused: false,
        fullDayDurationSeconds: 720,
        anchorServerMs: nowMs,
      };
    }
    return this.room!.worldTime;
  }

  private materializeWorldTime(nowMs: number): AuthoritativeWorldTimeState {
    const wt = this.ensureWorldTime(nowMs);
    if (!wt.paused && nowMs > wt.anchorServerMs) {
      const elapsedSec = (nowMs - wt.anchorServerMs) / 1000;
      const hoursPerSec = 24 / Math.max(60, wt.fullDayDurationSeconds);
      const totalHours = wt.worldHours + elapsedSec * hoursPerSec * wt.timeScale;
      const dayAdvance = Math.floor(totalHours / 24);
      if (dayAdvance > 0) {
        wt.dayCount += dayAdvance;
      }
      wt.worldHours = Math.round((((totalHours % 24) + 24) % 24) * 1000) / 1000;
      wt.anchorServerMs = nowMs;
    } else if (nowMs > wt.anchorServerMs) {
      wt.anchorServerMs = nowMs;
    }
    const ws = this.ensureWorldSync();
    ws.worldHours = wt.worldHours;
    return { ...wt };
  }

  private ensureWorldWeather(nowMs: number): AuthoritativeWorldWeatherState {
    const ws = this.ensureWorldSync();
    if (!this.room!.worldWeather) {
      const fallbackWeather: WorldWeatherState =
        ws.weather === 'cloudy' ||
        ws.weather === 'overcast' ||
        ws.weather === 'rain' ||
        ws.weather === 'storm' ||
        ws.weather === 'fog'
          ? ws.weather
          : 'clear';
      this.room!.worldWeather = {
        currentState: fallbackWeather,
        targetState: fallbackWeather,
        intensity: fallbackWeather === 'clear' ? 0 : 0.6,
        dynamicEnabled: true,
        transitionDurationSeconds: 12,
        startMs: nowMs,
        durationMs: 240_000,
        endMs: nowMs + 240_000,
      };
    }
    return this.room!.worldWeather;
  }

  private materializeWorldWeather(nowMs: number): AuthoritativeWorldWeatherState {
    const ww = this.ensureWorldWeather(nowMs);
    ww.durationMs = Math.max(5_000, Math.min(MAX_WEATHER_DURATION_MS, ww.durationMs));
    ww.endMs = ww.startMs + ww.durationMs;
    if (nowMs >= ww.endMs && ww.currentState !== ww.targetState) {
      ww.currentState = ww.targetState;
    }
    const ws = this.ensureWorldSync();
    ws.weather = ww.currentState;
    return { ...ww };
  }

  private async expireIfNeeded(nowMs: number): Promise<boolean> {
    if (!this.room) return false;
    if (this.room.status === 'closed') return true;
    const expiresAt =
      this.room.expiresAt ??
      (this.room.lastActivityAt ?? this.room.createdAt) + ROOM_INACTIVE_TIMEOUT_MS;
    if (nowMs < expiresAt) return false;

    const departedPlayers = Object.values(this.room.players);
    this.broadcast('ROOM_CLOSED', 'system', {
      reason: 'Room expired after 72 hours of inactivity.',
      closedBy: 'system',
    });

    this.room.players = {};
    this.room.playerTokens = {};
    this.room.hostId = '';
    this.room.status = 'closed';
    this.room.gameState.locked = true;
    this.room.lastActivityAt = nowMs;
    this.room.expiresAt = expiresAt;
    await this.syncDirectory();
    for (const p of departedPlayers) {
      await this.syncProfileEvent(p.publicProfileId, {
        currentRoomId: null,
        currentRoomName: null,
      });
    }
    for (const [sock, sess] of Array.from(this.sessions.entries())) {
      sess.cleanDisconnect = true;
      this.sessions.delete(sock);
      try {
        sock.close(4010, 'Room expired');
      } catch {
        // Ignore close errors
      }
    }
    await this.persist();
    this.clearSweepTimer();
    await this.ctx.storage.deleteAlarm?.();
    return true;
  }

  private resolveEntityMaxHp(kind: SyncedEntityKind, archetype: string): number {
    if (kind === 'enemy') {
      return SERVER_ENEMY_MAX_HP[archetype] ?? 65;
    }
    if (kind === 'animal') {
      return SERVER_ANIMAL_MAX_HP[archetype] ?? 50;
    }
    return SERVER_NPC_MAX_HP[archetype] ?? SERVER_NPC_MAX_HP.default;
  }

  private buildWorldSnapshot(playerId: string): RoomWorldSnapshotPayload {
    const ws = this.ensureWorldSync();
    const auth = this.ensureAuthoritativePlayer(playerId);
    const now = Date.now();
    const worldTime = this.materializeWorldTime(now);
    const worldWeather = this.materializeWorldWeather(now);
    const depletedResources: RoomWorldSnapshotPayload['depletedResources'] = [];
    for (const [id, rec] of Object.entries(ws.depletedResources)) {
      if (now >= rec.regenAtMs) {
        delete ws.depletedResources[id];
      } else {
        depletedResources.push({
          id,
          usesRemaining: rec.usesRemaining,
          regenAtMs: rec.regenAtMs,
        });
      }
    }
    const deadEntities = Object.values(ws.entities)
      .filter((e) => e.isDead)
      .map((e) => ({ id: e.id, kind: e.kind }));
    const playerQuests = ws.questsByPlayer?.[playerId] ?? {};

    return {
      openedChests: Object.keys(ws.openedChests),
      collectedPickups: Object.keys(ws.collectedPickups),
      depletedResources,
      doors: Object.entries(ws.doors).map(([id, isOpen]) => ({ id, isOpen })),
      placedBeds: Object.values(ws.placedBeds),
      droppedItems: Object.values(ws.droppedItems),
      quests: Object.values(playerQuests).map((q) => ({
        questId: q.questId,
        status: q.status,
        stepIndex: q.stepIndex,
        updatedBy: q.updatedBy,
      })),
      discoveredLandmarks: ws.discoveredLandmarks.slice(),
      deadEntities,
      worldHours: worldTime.worldHours,
      weather: worldWeather.currentState,
      worldTime,
      worldWeather,
      worldSettingsPermission:
        this.room!.gameState.worldSettingsPermission ?? 'HOST_ONLY',
      serverTimestamp: now,
      ammoCount: auth.ammoCount,
      coins: auth.coins,
      xp: auth.xp,
      level: auth.level,
      xpToNextLevel: auth.level * 100,
    };
  }

  private ensureAuthoritativePlayer(playerId: string): AuthoritativePlayerRecord {
    if (!this.room!.authoritativePlayers) {
      this.room!.authoritativePlayers = {};
    }
    let auth = this.room!.authoritativePlayers[playerId];
    if (!auth) {
      const spawnX = this.room!.gameState.worldSettings?.spawnX ?? 0;
      const spawnY = this.room!.gameState.worldSettings?.spawnY ?? 0;
      const spawnZ = this.room!.gameState.worldSettings?.spawnZ ?? 4;
      auth = {
        networkEntityId: generateNetworkEntityId(playerId),
        health: 100,
        maxHealth: 100,
        isDead: false,
        reviveAtMs: null,
        lastDamageAtMs: 0,
        lastAttackAtMs: 0,
        lastSwingId: null,
        lastSwingWeaponId: null,
        lastSwingAtMs: 0,
        lastSwingTargetIds: [],
        ammoCount: 24,
        equippedWeaponId: 'ranger-sword',
        inventoryItemIds: [
          'compass',
          'journal',
          'ranger-sword',
          'woodland-axe',
          'hunter-bow',
          'arrow',
        ],
        lastX: spawnX,
        lastY: spawnY,
        lastZ: spawnZ,
        lastStateAtMs: 0,
        movementJitterM: MAX_MOVEMENT_JITTER_M,
        lastBedUsedAtMs: 0,
        lastResourceCollectAtMs: 0,
        chestWeaponLootCount: 0,
        coins: this.getDefaultStartingCoins(),
        xp: 0,
        level: 1,
        lastEnemyAttackAtBySource: {},
      };
      this.room!.authoritativePlayers[playerId] = auth;
    } else {
      if (!auth.networkEntityId) {
        auth.networkEntityId = generateNetworkEntityId(playerId);
      }
      if (typeof auth.ammoCount !== 'number') {
        auth.ammoCount = 24;
      }
      if (typeof auth.lastAttackAtMs !== 'number') {
        auth.lastAttackAtMs = 0;
      }
      if (auth.lastSwingId === undefined) {
        auth.lastSwingId = null;
      }
      if (auth.lastSwingWeaponId === undefined) {
        auth.lastSwingWeaponId = null;
      }
      if (typeof auth.lastSwingAtMs !== 'number') {
        auth.lastSwingAtMs = 0;
      }
      if (!Array.isArray(auth.lastSwingTargetIds)) {
        auth.lastSwingTargetIds = [];
      }
      if (auth.equippedWeaponId === undefined) {
        auth.equippedWeaponId = 'ranger-sword';
      }
      if (!Array.isArray(auth.inventoryItemIds)) {
        auth.inventoryItemIds = [
          'compass',
          'journal',
          'ranger-sword',
          'woodland-axe',
          'hunter-bow',
          'arrow',
        ];
      }
      if (typeof auth.movementJitterM !== 'number' || !Number.isFinite(auth.movementJitterM)) {
        auth.movementJitterM = MAX_MOVEMENT_JITTER_M;
      }
      if (typeof auth.lastBedUsedAtMs !== 'number') {
        auth.lastBedUsedAtMs = 0;
      }
      if (typeof auth.lastResourceCollectAtMs !== 'number') {
        auth.lastResourceCollectAtMs = 0;
      }
      if (typeof auth.chestWeaponLootCount !== 'number') {
        auth.chestWeaponLootCount = 0;
      }
      if (typeof auth.coins !== 'number' || !Number.isFinite(auth.coins)) {
        auth.coins = this.getDefaultStartingCoins();
      }
      if (typeof auth.xp !== 'number' || !Number.isFinite(auth.xp)) {
        auth.xp = 0;
      }
      if (typeof auth.level !== 'number' || !Number.isFinite(auth.level) || auth.level < 1) {
        auth.level = 1;
      }
      if (!auth.lastEnemyAttackAtBySource || typeof auth.lastEnemyAttackAtBySource !== 'object') {
        auth.lastEnemyAttackAtBySource = {};
      }
    }
    return auth;
  }

  private sendToPlayer<T>(
    playerId: string,
    type: ServerMessageType,
    payload?: T,
  ): void {
    for (const [sock, sess] of this.sessions) {
      if (sess.playerId === playerId) {
        this.sendToSocket(sock, type, playerId, payload);
      }
    }
  }

  private grantProgression(
    playerId: string,
    deltaXp: number,
    deltaCoins: number,
    reason: string,
  ): AuthoritativeProgressionState {
    const auth = this.ensureAuthoritativePlayer(playerId);
    if (deltaCoins !== 0) {
      auth.coins = Math.max(0, Math.round(auth.coins + deltaCoins));
    }
    if (deltaXp > 0) {
      auth.xp += Math.round(deltaXp);
      while (auth.xp >= auth.level * 100) {
        auth.xp -= auth.level * 100;
        auth.level += 1;
      }
    }
    const payload: AuthoritativeProgressionState = {
      playerId,
      coins: auth.coins,
      xp: auth.xp,
      level: auth.level,
      xpToNextLevel: auth.level * 100,
      reason,
    };
    this.sendToPlayer<AuthoritativeProgressionState>(
      playerId,
      'PROGRESSION_UPDATED',
      payload,
    );
    return payload;
  }

  private buildSnapshot(): AuthoritativeRoomSnapshot | null {
    if (!this.room) return null;
    const now = Date.now();
    const worldTime = this.materializeWorldTime(now);
    const worldWeather = this.materializeWorldWeather(now);
    const playerList = Object.values(this.room.players)
      .map((p) => {
        const auth = this.room?.authoritativePlayers?.[p.playerId];
        return {
          ...p,
          networkEntityId:
            p.networkEntityId ??
            auth?.networkEntityId ??
            generateNetworkEntityId(p.playerId),
          health: auth?.health ?? p.health ?? 100,
          maxHealth: auth?.maxHealth ?? p.maxHealth ?? 100,
          isDead: auth?.isDead ?? p.isDead ?? false,
        };
      })
      .sort((a, b) => a.joinedAt - b.joinedAt);
    const hostPlayer =
      this.room.players[this.room.hostId] ?? playerList[0] ?? null;

    return {
      roomId: this.room.roomId,
      roomCode: this.room.roomCode,
      roomName: this.room.roomName,
      hostId: this.room.hostId,
      hostName: hostPlayer?.displayName ?? (playerList.length === 0 ? 'Open Room' : 'Host'),
      players: playerList,
      maxPlayers: this.room.maxPlayers,
      status: this.room.status,
      gameState: {
        ...this.room.gameState,
        worldSettingsPermission:
          this.room.gameState.worldSettingsPermission ?? 'HOST_ONLY',
      },
      createdAt: this.room.createdAt,
      lastActivityAt: this.room.lastActivityAt ?? this.room.createdAt,
      lastPlayerJoinedAt: this.room.lastPlayerJoinedAt ?? null,
      lastPlayerLeftAt: this.room.lastPlayerLeftAt ?? null,
      expiresAt:
        this.room.expiresAt ??
        (this.room.lastActivityAt ?? this.room.createdAt) + ROOM_INACTIVE_TIMEOUT_MS,
      worldTime,
      worldWeather,
      serverTimestamp: now,
    };
  }

  private async syncDirectory(): Promise<void> {
    try {
      const dirId = this.env.ROOM_DIRECTORY.idFromName('global');
      const stub = this.env.ROOM_DIRECTORY.get(dirId);

      if (!this.room || this.room.status === 'closed') {
        if (this.room?.roomId) {
          await stub.fetch('https://directory.internal/remove', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ roomId: this.room.roomId }),
          });
        }
        return;
      }

      const snap = this.buildSnapshot();
      if (!snap) return;

      await stub.fetch('https://directory.internal/upsert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roomId: snap.roomId,
          roomCode: snap.roomCode,
          roomName: snap.roomName,
          hostName: snap.hostName,
          worldName: snap.gameState.worldName,
          worldType: snap.gameState.worldType,
          difficulty: snap.gameState.difficulty,
          maxPlayers: snap.maxPlayers,
          playerCount: snap.players.length,
          privacy: snap.gameState.privacy,
          isPrivate: snap.gameState.isPrivate,
          allowFriends: snap.gameState.allowFriends,
          requireAllReady: snap.gameState.requireAllReady,
          locked: snap.gameState.locked,
          status: snap.status,
          hasPassword: snap.gameState.hasPassword,
          createdAt: snap.createdAt,
          updatedAt: Date.now(),
          lastActivityAt: snap.lastActivityAt,
          expiresAt: snap.expiresAt,
        }),
      });
    } catch {
      // Directory sync is best-effort; authoritative room state lives in this DO
    }
  }

  private async syncProfileEvent(
    publicProfileId: string | undefined,
    update: {
      currentRoomId?: string | null;
      currentRoomName?: string | null;
      statsDelta?: ProfileStatsDelta;
    },
  ): Promise<void> {
    if (!publicProfileId || !this.env.PLAYER_PROFILES) return;
    try {
      const stub = this.env.PLAYER_PROFILES.get(
        this.env.PLAYER_PROFILES.idFromName('global'),
      );
      await stub.fetch('https://profiles.internal/internal/room-event', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          publicProfileId,
          ...update,
        }),
      });
    } catch {
      // Profile telemetry sync is best-effort
    }
  }

  private sendToSocket<T>(
    ws: WebSocket,
    type: ServerMessageType,
    playerId: string,
    payload?: T,
    seq?: number,
  ): void {
    if (!this.room) return;
    const envelope: NetworkEnvelope<T> = {
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type,
      roomId: this.room.roomId,
      playerId,
      timestamp: Date.now(),
      ...(seq !== undefined ? { seq } : {}),
      ...(payload !== undefined ? { payload } : {}),
    };
    try {
      ws.send(JSON.stringify(envelope));
    } catch {
      // Socket closed before send
    }
  }

  private broadcast<T>(
    type: ServerMessageType,
    senderPlayerId: string,
    payload?: T,
    excludeWs?: WebSocket,
  ): void {
    if (!this.room) return;
    const envelope: NetworkEnvelope<T> = {
      v: MULTIPLAYER_PROTOCOL_VERSION,
      type,
      roomId: this.room.roomId,
      playerId: senderPlayerId,
      timestamp: Date.now(),
      ...(payload !== undefined ? { payload } : {}),
    };
    const serialized = JSON.stringify(envelope);
    for (const [sock] of this.sessions) {
      if (excludeWs && sock === excludeWs) continue;
      try {
        sock.send(serialized);
      } catch {
        // Ignore broken sockets; close handler cleans up
      }
    }
  }

  private broadcastRoomState(): void {
    const snapshot = this.buildSnapshot();
    if (!snapshot || !this.room) return;
    this.broadcast('ROOM_STATE', this.room.hostId, snapshot);
  }

  private async handleCreateRoom(request: Request): Promise<Response> {
    if (this.room && this.room.status !== 'closed') {
      return Response.json(
        { ok: false, error: 'ROOM_ALREADY_EXISTS' },
        { status: 409 },
      );
    }

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || !isValidRoomId(body.roomId)) {
      return Response.json({ ok: false, error: 'INVALID_ROOM_ID' }, { status: 400 });
    }

    const verifiedIdentity =
      body.verifiedIdentity &&
      typeof body.verifiedIdentity === 'object' &&
      !Array.isArray(body.verifiedIdentity)
        ? (body.verifiedIdentity as {
            publicProfileId?: string;
            displayName?: string;
            playerTag?: string;
            avatar?: AvatarConfig;
          })
        : null;

    const hostId = generateSecurePlayerId();
    const sessionToken = generateSecureSessionToken();
    const hostName = sanitizeDisplayName(
      verifiedIdentity?.displayName ?? body.playerName,
      'Adventurer',
    );
    const roomName = sanitizeRoomName(body.roomName, 'Oakhollow Co-op Expedition');
    const worldName = sanitizeRoomName(body.worldName ?? roomName, roomName);
    const worldType: WorldType = VALID_WORLD_TYPES.has(body.worldType as WorldType)
      ? (body.worldType as WorldType)
      : 'normal';
    const difficulty: DifficultyLevel = VALID_DIFFICULTIES.has(
      body.difficulty as DifficultyLevel,
    )
      ? (body.difficulty as DifficultyLevel)
      : 'normal';
    const isPrivate =
      typeof body.isPrivate === 'boolean'
        ? body.isPrivate
        : body.privacy === 'private' || body.privacy === 'friends';
    const allowFriends =
      typeof body.allowFriends === 'boolean'
        ? body.allowFriends
        : body.privacy !== 'private';
    const privacy: RoomPrivacy = VALID_PRIVACY.has(body.privacy as RoomPrivacy)
      ? (body.privacy as RoomPrivacy)
      : !isPrivate
        ? 'public'
        : allowFriends
          ? 'friends'
          : 'private';
    const rawMax =
      typeof body.maxPlayers === 'number' && Number.isFinite(body.maxPlayers)
        ? Math.floor(body.maxPlayers)
        : 8;
    const maxPlayers = (ALLOWED_MAX_PLAYER_COUNTS as readonly number[]).includes(rawMax)
      ? rawMax
      : Math.max(MIN_PLAYERS_PER_ROOM, Math.min(MAX_PLAYERS_PER_ROOM, rawMax));
    const requireAllReady =
      typeof body.requireAllReady === 'boolean' ? body.requireAllReady : true;
    const rawPassword =
      typeof body.password === 'string' && body.password.trim().length > 0
        ? body.password.trim().slice(0, 64)
        : null;
    const passwordHash = rawPassword ? await sha256Hex(rawPassword) : null;
    const now = Date.now();

    const worldSettings: AuthoritativeWorldSettings = {
      worldType,
      difficulty,
      pvpEnabled: false,
      staminaUnlimited: worldType === 'creative',
      spawnX: 0,
      spawnY: 0,
      spawnZ: 4,
    };

    const hostEntityId = generateNetworkEntityId(hostId);
    const hostPlayer: NetworkPlayerRecord = {
      playerId: hostId,
      ...(verifiedIdentity?.publicProfileId
        ? { publicProfileId: verifiedIdentity.publicProfileId }
        : {}),
      networkEntityId: hostEntityId,
      displayName: hostName,
      ...(verifiedIdentity?.playerTag
        ? { playerTag: verifiedIdentity.playerTag }
        : {}),
      avatarColor: verifiedIdentity?.avatar?.color ?? pickAvatarColor(hostId),
      ...(verifiedIdentity?.avatar ? { avatar: verifiedIdentity.avatar } : {}),
      isHost: true,
      isReady: true,
      pingMs: null,
      connectionQuality: 'good',
      joinedAt: now,
      lastSeenAt: now,
      health: 100,
      maxHealth: 100,
      isDead: false,
    };

    this.room = {
      roomId: body.roomId,
      roomCode: generateSecureRoomCode(),
      roomName,
      hostId,
      players: { [hostId]: hostPlayer },
      authoritativePlayers: {
        [hostId]: {
          networkEntityId: hostEntityId,
          health: 100,
          maxHealth: 100,
          isDead: false,
          reviveAtMs: null,
          lastDamageAtMs: 0,
          lastAttackAtMs: 0,
          lastSwingId: null,
          lastSwingWeaponId: null,
          lastSwingAtMs: 0,
          lastSwingTargetIds: [],
          ammoCount: 24,
          equippedWeaponId: 'ranger-sword',
          inventoryItemIds: [
            'compass',
            'journal',
            'ranger-sword',
            'woodland-axe',
            'hunter-bow',
            'arrow',
          ],
          lastX: worldSettings.spawnX,
          lastY: worldSettings.spawnY,
          lastZ: worldSettings.spawnZ,
          lastStateAtMs: 0,
          movementJitterM: MAX_MOVEMENT_JITTER_M,
          lastBedUsedAtMs: 0,
          lastResourceCollectAtMs: 0,
          chestWeaponLootCount: 0,
          coins: STARTING_COINS_BY_WORLD_TYPE[worldType] ?? 0,
          xp: 0,
          level: 1,
          lastEnemyAttackAtBySource: {},
        },
      },
      maxPlayers,
      status: 'waiting',
      gameState: {
        seed: generateSecureWorldSeed(),
        worldName,
        worldType,
        difficulty,
        privacy,
        isPrivate,
        allowFriends,
        requireAllReady,
        worldSettingsPermission: 'HOST_ONLY',
        worldSettings,
        locked: false,
        hasPassword: Boolean(passwordHash),
        startedAt: null,
        tick: 0,
      },
      passwordHash,
      playerTokens: { [hostId]: sessionToken },
      createdAt: now,
      lastActivityAt: now,
      lastPlayerJoinedAt: now,
      lastPlayerLeftAt: null,
      expiresAt: now + ROOM_INACTIVE_TIMEOUT_MS,
      worldTime: {
        worldHours: 8.2,
        dayCount: 1,
        timeScale: 1,
        paused: false,
        fullDayDurationSeconds: 720,
        anchorServerMs: now,
      },
      worldWeather: {
        currentState: 'clear',
        targetState: 'clear',
        intensity: 0,
        dynamicEnabled: true,
        transitionDurationSeconds: 12,
        startMs: now,
        durationMs: 240_000,
        endMs: now + 240_000,
      },
    };

    await this.persist();
    await this.syncDirectory();
    await this.scheduleLifecycleSweep();
    await this.syncProfileEvent(hostPlayer.publicProfileId, {
      currentRoomId: this.room.roomId,
      currentRoomName: this.room.roomName,
      statsDelta: { worldsCreated: 1, gamesHosted: 1, multiplayerSessions: 1 },
    });

    return Response.json({
      ok: true,
      room: this.buildSnapshot(),
      playerId: hostId,
      sessionToken,
    });
  }

  private async handleIssueJoinTicket(request: Request): Promise<Response> {
    if (!this.room) {
      return Response.json(
        { ok: false, error: 'ROOM_NOT_FOUND', message: 'ROOM NOT FOUND' },
        { status: 404 },
      );
    }
    if (await this.expireIfNeeded(Date.now())) {
      return Response.json(
        { ok: false, error: 'ROOM_EXPIRED', message: 'ROOM EXPIRED' },
        { status: 410 },
      );
    }

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) {
      return Response.json({ ok: false, error: 'INVALID_BODY' }, { status: 400 });
    }

    if (this.room.gameState.locked || this.room.status !== 'waiting') {
      return Response.json(
        {
          ok: false,
          error: 'GAME_ALREADY_STARTED',
          message: 'GAME ALREADY STARTED',
        },
        { status: 409 },
      );
    }

    const currentCount = Object.keys(this.room.players).length;
    if (currentCount >= this.room.maxPlayers) {
      return Response.json(
        { ok: false, error: 'ROOM_FULL', message: 'ROOM IS FULL' },
        { status: 409 },
      );
    }

    if (this.room.passwordHash) {
      const provided = typeof body.password === 'string' ? body.password.trim() : '';
      if (!provided) {
        return Response.json(
          { ok: false, error: 'PASSWORD_REQUIRED' },
          { status: 403 },
        );
      }
      const providedHash = await sha256Hex(provided);
      if (!timingSafeEqualHex(providedHash, this.room.passwordHash)) {
        return Response.json(
          { ok: false, error: 'INVALID_PASSWORD' },
          { status: 403 },
        );
      }
    }

    const verifiedIdentity =
      body.verifiedIdentity &&
      typeof body.verifiedIdentity === 'object' &&
      !Array.isArray(body.verifiedIdentity)
        ? (body.verifiedIdentity as {
            publicProfileId?: string;
            displayName?: string;
            playerTag?: string;
            avatar?: AvatarConfig;
          })
        : null;

    const playerId = generateSecurePlayerId();
    const sessionToken = generateSecureSessionToken();
    const displayName = sanitizeDisplayName(
      verifiedIdentity?.displayName ?? body.playerName,
      'Adventurer',
    );
    const now = Date.now();

    const playerEntityId = generateNetworkEntityId(playerId);
    const shouldBecomeHost =
      !this.room.hostId ||
      Object.keys(this.room.players).length === 0 ||
      !this.room.players[this.room.hostId];
    const joinedPlayer: NetworkPlayerRecord = {
      playerId,
      ...(verifiedIdentity?.publicProfileId
        ? { publicProfileId: verifiedIdentity.publicProfileId }
        : {}),
      networkEntityId: playerEntityId,
      displayName,
      ...(verifiedIdentity?.playerTag
        ? { playerTag: verifiedIdentity.playerTag }
        : {}),
      avatarColor: verifiedIdentity?.avatar?.color ?? pickAvatarColor(playerId),
      ...(verifiedIdentity?.avatar ? { avatar: verifiedIdentity.avatar } : {}),
      isHost: shouldBecomeHost,
      isReady: shouldBecomeHost,
      pingMs: null,
      connectionQuality: 'good',
      joinedAt: now,
      lastSeenAt: now,
      health: 100,
      maxHealth: 100,
      isDead: false,
    };
    if (shouldBecomeHost) {
      this.room.hostId = playerId;
    }
    this.room.players[playerId] = joinedPlayer;
    if (!this.room.authoritativePlayers) {
      this.room.authoritativePlayers = {};
    }
    this.room.authoritativePlayers[playerId] = {
      networkEntityId: playerEntityId,
      health: 100,
      maxHealth: 100,
      isDead: false,
      reviveAtMs: null,
      lastDamageAtMs: 0,
      lastAttackAtMs: 0,
      lastSwingId: null,
      lastSwingWeaponId: null,
      lastSwingAtMs: 0,
      lastSwingTargetIds: [],
      ammoCount: 24,
      equippedWeaponId: 'ranger-sword',
      inventoryItemIds: [
        'compass',
        'journal',
        'ranger-sword',
        'woodland-axe',
        'hunter-bow',
        'arrow',
      ],
      lastX: this.room.gameState.worldSettings?.spawnX ?? 0,
      lastY: this.room.gameState.worldSettings?.spawnY ?? 0,
      lastZ: this.room.gameState.worldSettings?.spawnZ ?? 4,
      lastStateAtMs: 0,
      movementJitterM: MAX_MOVEMENT_JITTER_M,
      lastBedUsedAtMs: 0,
      lastResourceCollectAtMs: 0,
      chestWeaponLootCount: 0,
      coins: this.getDefaultStartingCoins(),
      xp: 0,
      level: 1,
      lastEnemyAttackAtBySource: {},
    };
    this.room.playerTokens[playerId] = sessionToken;
    this.room.lastPlayerJoinedAt = now;
    this.touchRoomActivity(now);

    await this.persist();
    await this.syncDirectory();
    await this.scheduleLifecycleSweep();
    await this.syncProfileEvent(joinedPlayer.publicProfileId, {
      currentRoomId: this.room.roomId,
      currentRoomName: this.room.roomName,
      statsDelta: { worldsJoined: 1, multiplayerSessions: 1 },
    });
    this.broadcast('JOIN_ROOM', playerId, { displayName });
    this.broadcastRoomState();

    return Response.json({
      ok: true,
      room: this.buildSnapshot(),
      playerId,
      sessionToken,
    });
  }

  private async handleLeavePlayer(playerId: string): Promise<void> {
    if (!this.room || !this.room.players[playerId]) return;

    const now = Date.now();
    const leavingPlayer = this.room.players[playerId];
    const leavingName = leavingPlayer.displayName;
    const wasHost = this.room.hostId === playerId;
    delete this.room.players[playerId];
    delete this.room.playerTokens[playerId];
    if (this.room.authoritativePlayers) {
      delete this.room.authoritativePlayers[playerId];
    }
    await this.syncProfileEvent(leavingPlayer.publicProfileId, {
      currentRoomId: null,
      currentRoomName: null,
    });

    const connectedPlayerIds = new Set(
      Array.from(this.sessions.values()).map((s) => s.playerId),
    );
    const remaining = Object.values(this.room.players).sort((a, b) => {
      const aConnected = connectedPlayerIds.has(a.playerId) ? 0 : 1;
      const bConnected = connectedPlayerIds.has(b.playerId) ? 0 : 1;
      if (aConnected !== bConnected) return aConnected - bConnected;
      return a.joinedAt - b.joinedAt;
    });

    if (remaining.length === 0) {
      this.broadcast('LEAVE_ROOM', playerId, { displayName: leavingName });
      this.room.hostId = '';
      this.room.status = 'waiting';
      this.room.gameState.locked = false;
      this.room.lastPlayerLeftAt = now;
      this.touchRoomActivity(now);
      await this.persist();
      await this.syncDirectory();
      await this.scheduleLifecycleSweep();
      return;
    }

    let hostTransferredPayload: {
      previousHostId: string;
      newHostId: string;
      newHostName: string;
    } | null = null;

    if (wasHost) {
      const nextHost = remaining[0];
      this.room.hostId = nextHost.playerId;
      for (const p of remaining) {
        p.isHost = p.playerId === this.room.hostId;
        if (p.isHost) {
          p.isReady = true;
        }
      }
      hostTransferredPayload = {
        previousHostId: playerId,
        newHostId: nextHost.playerId,
        newHostName: nextHost.displayName,
      };
    }

    await this.persist();
    await this.syncDirectory();
    this.broadcast('LEAVE_ROOM', playerId, { displayName: leavingName });
    if (hostTransferredPayload) {
      this.broadcast('HOST_TRANSFERRED', hostTransferredPayload.newHostId, hostTransferredPayload);
    }
    this.broadcastRoomState();
  }

  private async handleTransferHost(
    hostPlayerId: string,
    targetPlayerId: string,
  ): Promise<void> {
    if (!this.room) return;
    const target = this.room.players[targetPlayerId];
    if (!target || targetPlayerId === hostPlayerId) return;

    this.room.hostId = targetPlayerId;
    for (const p of Object.values(this.room.players)) {
      p.isHost = p.playerId === targetPlayerId;
      if (p.isHost) {
        p.isReady = true;
      }
    }

    await this.persist();
    await this.syncDirectory();
    this.broadcast('HOST_TRANSFERRED', hostPlayerId, {
      previousHostId: hostPlayerId,
      newHostId: targetPlayerId,
      newHostName: target.displayName,
    });
    this.broadcastRoomState();
  }

  private async handleKickPlayer(
    hostPlayerId: string,
    targetPlayerId: string,
  ): Promise<void> {
    if (!this.room) return;
    const target = this.room.players[targetPlayerId];
    if (!target) return;

    this.broadcast('PLAYER_KICKED', hostPlayerId, {
      targetPlayerId,
      targetDisplayName: target.displayName,
      kickedBy: hostPlayerId,
    });

    delete this.room.players[targetPlayerId];
    delete this.room.playerTokens[targetPlayerId];
    if (this.room.authoritativePlayers) {
      delete this.room.authoritativePlayers[targetPlayerId];
    }
    await this.syncProfileEvent(target.publicProfileId, {
      currentRoomId: null,
      currentRoomName: null,
    });

    for (const [sock, sess] of Array.from(this.sessions.entries())) {
      if (sess.playerId === targetPlayerId) {
        sess.cleanDisconnect = true;
        this.sessions.delete(sock);
        try {
          sock.close(4001, 'Kicked by host');
        } catch {
          // Ignore close errors
        }
      }
    }

    await this.persist();
    await this.syncDirectory();
    this.broadcastRoomState();
  }

  private async handleCloseRoom(hostPlayerId: string): Promise<void> {
    if (!this.room) return;
    const roomId = this.room.roomId;
    const departedPlayers = Object.values(this.room.players);
    this.broadcast('ROOM_CLOSED', hostPlayerId, {
      reason: 'Host closed the room.',
      closedBy: hostPlayerId,
    });

    this.room.players = {};
    this.room.playerTokens = {};
    await this.syncDirectory();
    for (const p of departedPlayers) {
      await this.syncProfileEvent(p.publicProfileId, {
        currentRoomId: null,
        currentRoomName: null,
      });
    }

    for (const [sock, sess] of Array.from(this.sessions.entries())) {
      sess.cleanDisconnect = true;
      this.sessions.delete(sock);
      try {
        sock.close(4000, 'Room closed by host');
      } catch {
        // Ignore close errors
      }
    }

    this.room = null;
    await this.persist();
    void roomId;
  }

  private sendServerPing(session: ActiveSocketSession): void {
    const now = Date.now();
    session.nextPingSeq += 1;
    session.pendingPingId = session.nextPingSeq;
    session.pendingPingSentAt = now;
    this.sendToSocket(session.ws, 'PING', session.playerId, {
      pingId: session.pendingPingId,
      sentAt: now,
    });
  }

  private hasActiveSocketForPlayer(playerId: string, excludeWs?: WebSocket): boolean {
    for (const [sock, sess] of this.sessions) {
      if (excludeWs && sock === excludeWs) continue;
      if (sess.playerId === playerId) return true;
    }
    return false;
  }

  private async handleUnexpectedSocketDrop(session: ActiveSocketSession): Promise<void> {
    if (!this.room) return;
    if (session.cleanDisconnect) return;
    if (this.hasActiveSocketForPlayer(session.playerId)) {
      return;
    }

    const player = this.room.players[session.playerId];
    if (!player) return;

    const now = Date.now();
    player.connectionQuality = 'disconnected';
    player.disconnectedAt = player.disconnectedAt ?? now;
    await this.persist();

    this.broadcast('DISCONNECT', session.playerId, {
      temporary: true,
      graceMs: this.getPlayerReconnectGraceMs(),
    });
    this.broadcastRoomState();
    await this.scheduleLifecycleSweep();
  }

  private async scheduleLifecycleSweep(): Promise<void> {
    this.clearSweepTimer();
    if (!this.room || this.room.status === 'closed') return;

    const now = Date.now();
    const hostGraceMs = this.getHostDisconnectGraceMs();
    const reconnectGraceMs = this.getPlayerReconnectGraceMs();
    const connectedIds = new Set(
      Array.from(this.sessions.values()).map((s) => s.playerId),
    );

    let earliestDeadline: number | null =
      this.room.expiresAt ??
      (this.room.lastActivityAt ?? this.room.createdAt) + ROOM_INACTIVE_TIMEOUT_MS;

    // Check host transfer deadline if host is disconnected & another player is connected
    const hostPlayer = this.room.players[this.room.hostId];
    if (hostPlayer && !connectedIds.has(hostPlayer.playerId) && connectedIds.size > 0) {
      const hostSince = hostPlayer.disconnectedAt ?? this.bootAt;
      const deadline = hostSince + hostGraceMs;
      earliestDeadline =
        earliestDeadline === null ? deadline : Math.min(earliestDeadline, deadline);
    }

    // Check reconnect expiration deadline for all disconnected players
    for (const p of Object.values(this.room.players)) {
      if (!connectedIds.has(p.playerId)) {
        const since = p.disconnectedAt ?? Math.max(p.lastSeenAt, this.bootAt);
        const deadline = since + reconnectGraceMs;
        earliestDeadline =
          earliestDeadline === null ? deadline : Math.min(earliestDeadline, deadline);
      } else {
        const silentDeadline = p.lastSeenAt + HEARTBEAT_TIMEOUT_MS;
        earliestDeadline =
          earliestDeadline === null
            ? silentDeadline
            : Math.min(earliestDeadline, silentDeadline);
      }
    }

    if (earliestDeadline === null) {
      await this.ctx.storage.deleteAlarm?.();
      return;
    }

    const targetTime = Math.max(now + 25, earliestDeadline);
    if (typeof this.ctx.storage.setAlarm === 'function') {
      await this.ctx.storage.setAlarm(targetTime);
    }
    const deltaMs = targetTime - now;
    if (deltaMs <= 120_000) {
      const delayMs = Math.max(25, deltaMs);
      this.sweepTimer = setTimeout(() => {
        this.sweepTimer = null;
        void this.sweepLifecycle();
      }, delayMs);
      (this.sweepTimer as { unref?: () => void }).unref?.();
    }
  }

  public async alarm(): Promise<void> {
    await this.ensureLoaded();
    await this.sweepLifecycle();
  }

  public async sweepLifecycle(): Promise<void> {
    if (!this.room || this.room.status === 'closed') return;
    const now = Date.now();
    if (await this.expireIfNeeded(now)) {
      return;
    }
    const hostGraceMs = this.getHostDisconnectGraceMs();
    const reconnectGraceMs = this.getPlayerReconnectGraceMs();

    // 1. Force-disconnect any open sockets that stopped sending heartbeats past HEARTBEAT_TIMEOUT_MS
    for (const [sock, sess] of Array.from(this.sessions.entries())) {
      const player = this.room.players[sess.playerId];
      if (!player) {
        this.sessions.delete(sock);
        continue;
      }
      if (now - player.lastSeenAt > HEARTBEAT_TIMEOUT_MS) {
        this.sessions.delete(sock);
        try {
          sock.close(4008, 'Player heartbeat timeout');
        } catch {
          // Ignore close errors
        }
        if (!this.hasActiveSocketForPlayer(sess.playerId)) {
          player.connectionQuality = 'disconnected';
          player.disconnectedAt = player.disconnectedAt ?? now;
          this.broadcast('DISCONNECT', sess.playerId, {
            temporary: true,
            reason: 'PLAYER_TIMEOUT',
          });
        }
      }
    }

    const connectedIds = new Set(
      Array.from(this.sessions.values()).map((s) => s.playerId),
    );

    // 2. Transfer host authority if host disconnected beyond grace & connected players exist
    const currentHost = this.room.players[this.room.hostId];
    if (currentHost && !connectedIds.has(currentHost.playerId) && connectedIds.size > 0) {
      const hostSince = currentHost.disconnectedAt ?? this.bootAt;
      if (now - hostSince >= hostGraceMs) {
        const candidate = Object.values(this.room.players)
          .filter((p) => p.playerId !== currentHost.playerId && connectedIds.has(p.playerId))
          .sort((a, b) => a.joinedAt - b.joinedAt)[0];
        if (candidate) {
          await this.handleTransferHost(currentHost.playerId, candidate.playerId);
        }
      }
    }

    // 3. Remove any players whose reconnection grace period expired
    const expiredIds: string[] = [];
    for (const p of Object.values(this.room.players)) {
      if (!connectedIds.has(p.playerId)) {
        const since = p.disconnectedAt ?? Math.max(p.lastSeenAt, this.bootAt);
        if (now - since >= reconnectGraceMs) {
          expiredIds.push(p.playerId);
        }
      }
    }
    for (const expiredId of expiredIds) {
      await this.handleLeavePlayer(expiredId);
      if (!this.room || this.room.status === 'closed') return;
    }

    await this.scheduleLifecycleSweep();
  }

  private attachSocketHandlers(
    ws: CfWebSocket,
    playerId: string,
    clientIp: string,
  ): ActiveSocketSession {
    const limiter = new ConnectionRateLimiter();
    const session: ActiveSocketSession = {
      ws,
      playerId,
      clientIp,
      limiter,
      connectedAt: Date.now(),
      pendingPingId: 0,
      pendingPingSentAt: 0,
      lastRttMeasuredAt: 0,
      nextPingSeq: 0,
      lastChatSentAtMs: 0,
      lastChatNormalized: '',
      duplicateChatStreak: 0,
      reportedTargets: new Set<string>(),
      cleanDisconnect: false,
    };
    this.sessions.set(ws, session);

    ws.addEventListener('message', (event: MessageEvent) => {
      void this.onSocketMessage(session, event.data);
    });

    ws.addEventListener('close', () => {
      if (!this.sessions.has(ws)) return;
      this.sessions.delete(ws);
      void this.handleUnexpectedSocketDrop(session);
    });

    ws.addEventListener('error', () => {
      if (!this.sessions.has(ws)) return;
      this.sessions.delete(ws);
      void this.handleUnexpectedSocketDrop(session);
    });

    return session;
  }

  private async onSocketMessage(
    session: ActiveSocketSession,
    rawData: unknown,
  ): Promise<void> {
    if (!this.room) {
      session.ws.close(1008, 'Room no longer exists');
      return;
    }

    if (typeof rawData !== 'string' && !(rawData instanceof ArrayBuffer)) {
      this.sendToSocket(session.ws, 'ERROR', session.playerId, {
        code: 'UNSUPPORTED_FRAME',
        message: 'Only UTF-8 JSON text frames are supported.',
      });
      return;
    }

    const player = this.room.players[session.playerId];
    if (!player) {
      session.ws.close(1008, 'Player not registered in room');
      return;
    }

    const validated = validateClientMessage(
      rawData,
      this.room.roomId,
      session.playerId,
      this.room.hostId === session.playerId,
    );

    if (!validated.ok) {
      this.sendToSocket(session.ws, 'ERROR', session.playerId, {
        code: validated.code,
        message: validated.reason,
      });
      return;
    }

    const msg = validated.message;
    const rateDecision = session.limiter.checkMessage(msg.type);
    if (!rateDecision.allowed) {
      this.sendToSocket(session.ws, 'ERROR', session.playerId, {
        code: 'RATE_LIMITED',
        message: `Too many ${msg.type} messages. Slow down.`,
      });
      if (rateDecision.violations >= 25) {
        session.ws.close(1008, 'Rate limit exceeded');
      }
      return;
    }

    const now = Date.now();
    player.lastSeenAt = now;

    switch (msg.type) {
      case 'PING': {
        this.sendToSocket(
          session.ws,
          'PONG',
          session.playerId,
          {
            serverTime: now,
            ...(msg.clientSentAt !== undefined ? { clientSentAt: msg.clientSentAt } : {}),
          },
          msg.seq,
        );
        if (now - session.lastRttMeasuredAt >= 3500) {
          this.sendServerPing(session);
        }
        break;
      }

      case 'PONG': {
        if (
          msg.pingId !== undefined &&
          msg.pingId === session.pendingPingId &&
          session.pendingPingSentAt > 0
        ) {
          const rtt = Math.max(1, Math.min(9999, now - session.pendingPingSentAt));
          const prevPing = player.pingMs;
          const prevQuality = player.connectionQuality;
          const nextQuality = getConnectionQuality(rtt, true);
          player.pingMs = rtt;
          player.connectionQuality = nextQuality;
          session.pendingPingId = 0;
          session.lastRttMeasuredAt = now;

          if (
            prevPing === null ||
            prevPing === undefined ||
            Math.abs(prevPing - rtt) >= 8 ||
            prevQuality !== nextQuality
          ) {
            await this.persist();
            this.broadcastRoomState();
          }
        }
        break;
      }

      case 'CONNECT':
      case 'JOIN_ROOM': {
        if (msg.displayName) {
          player.displayName = msg.displayName;
          await this.persist();
          await this.syncDirectory();
        }
        this.sendToSocket(
          session.ws,
          'ROOM_STATE',
          session.playerId,
          this.buildSnapshot(),
        );
        break;
      }

      case 'DISCONNECT':
      case 'LEAVE_ROOM': {
        session.cleanDisconnect = true;
        this.sessions.delete(session.ws);
        await this.handleLeavePlayer(session.playerId);
        try {
          session.ws.close(1000, 'Left room');
        } catch {
          // Ignore close errors
        }
        break;
      }

      case 'READY': {
        if (this.room.status !== 'waiting' || this.room.gameState.locked) {
          this.sendToSocket(session.ws, 'ERROR', session.playerId, {
            code: 'INVALID_ROOM_STATUS',
            message: 'Cannot change ready state after game has started.',
          });
          return;
        }
        player.isReady = Boolean(msg.ready);
        await this.persist();
        this.broadcast('READY', session.playerId, { ready: player.isReady });
        this.broadcastRoomState();
        break;
      }

      case 'UPDATE_ROOM_SETTINGS': {
        if (this.room.hostId !== session.playerId) {
          this.sendToSocket(session.ws, 'ERROR', session.playerId, {
            code: 'FORBIDDEN_HOST_ONLY',
            message: 'Only the host can update room settings.',
          });
          return;
        }
        if (this.room.status !== 'waiting' || this.room.gameState.locked) {
          this.sendToSocket(session.ws, 'ERROR', session.playerId, {
            code: 'INVALID_ROOM_STATUS',
            message: 'Room settings cannot be changed after the game starts.',
          });
          return;
        }
        if (typeof msg.roomSettings?.requireAllReady === 'boolean') {
          this.room.gameState.requireAllReady = msg.roomSettings.requireAllReady;
          await this.persist();
          await this.syncDirectory();
          this.broadcastRoomState();
        }
        break;
      }

      case 'START_GAME': {
        if (this.room.hostId !== session.playerId) {
          this.sendToSocket(session.ws, 'ERROR', session.playerId, {
            code: 'FORBIDDEN_HOST_ONLY',
            message: 'Only the host can start the game.',
          });
          return;
        }
        if (this.room.status !== 'waiting' || this.room.gameState.locked) {
          this.sendToSocket(session.ws, 'ERROR', session.playerId, {
            code: 'INVALID_ROOM_STATUS',
            message: 'Room is already locked or started.',
          });
          return;
        }
        if (this.room.gameState.requireAllReady) {
          const nonHostPlayers = Object.values(this.room.players).filter(
            (p) => !p.isHost,
          );
          if (nonHostPlayers.some((p) => !p.isReady)) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'PLAYERS_NOT_READY',
              message: 'All required players must be ready before starting.',
            });
            return;
          }
        }
        this.room.status = 'in-game';
        this.room.gameState.locked = true;
        this.room.gameState.startedAt = now;
        this.room.gameState.tick += 1;
        this.touchRoomActivity(now);
        const startWorldTime = this.ensureWorldTime(now);
        startWorldTime.anchorServerMs = now;
        this.ensureWorldWeather(now);
        await this.persist();
        await this.syncDirectory();
        this.broadcastRoomState();
        this.broadcast('START_GAME', session.playerId, {
          roomId: this.room.roomId,
          roomCode: this.room.roomCode,
          roomName: this.room.roomName,
          worldName: this.room.gameState.worldName,
          seed: this.room.gameState.seed,
          worldType: this.room.gameState.worldType,
          difficulty: this.room.gameState.difficulty,
          requireAllReady: this.room.gameState.requireAllReady,
          worldSettingsPermission:
            this.room.gameState.worldSettingsPermission ?? 'HOST_ONLY',
          worldSettings: this.room.gameState.worldSettings ?? {
            worldType: this.room.gameState.worldType,
            difficulty: this.room.gameState.difficulty,
            pvpEnabled: false,
            staminaUnlimited: this.room.gameState.worldType === 'creative',
            spawnX: 0,
            spawnY: 0,
            spawnZ: 4,
          },
          locked: true,
          startedAt: this.room.gameState.startedAt,
        });
        for (const [sock, sess] of this.sessions) {
          this.sendToSocket(
            sock,
            'WORLD_SNAPSHOT',
            sess.playerId,
            this.buildWorldSnapshot(sess.playerId),
          );
          const pAuth = this.ensureAuthoritativePlayer(sess.playerId);
          this.sendToSocket<AuthoritativeProgressionState>(
            sock,
            'PROGRESSION_UPDATED',
            sess.playerId,
            {
              playerId: sess.playerId,
              coins: pAuth.coins,
              xp: pAuth.xp,
              level: pAuth.level,
              xpToNextLevel: pAuth.level * 100,
              reason: 'start_game',
            },
          );
        }
        break;
      }

      case 'WORLD_SETTINGS_UPDATE': {
        if (!msg.worldSettingsUpdate) return;
        const upd = msg.worldSettingsUpdate;
        const isHost = this.room.hostId === session.playerId;

        if (upd.worldSettingsPermission !== undefined) {
          if (!isHost) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'FORBIDDEN_HOST_ONLY',
              message: 'Only the room host can change world settings permissions.',
            });
            return;
          }
          this.room.gameState.worldSettingsPermission = upd.worldSettingsPermission;
        }

        const hasWorldControlFields =
          upd.preset !== undefined ||
          upd.worldHours !== undefined ||
          upd.dayCount !== undefined ||
          upd.timeScale !== undefined ||
          upd.paused !== undefined ||
          upd.fullDayDurationSeconds !== undefined ||
          upd.weatherState !== undefined ||
          upd.targetWeatherState !== undefined ||
          upd.weatherIntensity !== undefined ||
          upd.dynamicEnabled !== undefined ||
          upd.transitionDurationSeconds !== undefined ||
          upd.durationMs !== undefined ||
          upd.triggerLightning !== undefined;

        const currentPermission: WorldSettingsPermission =
          this.room.gameState.worldSettingsPermission ?? 'HOST_ONLY';
        if (hasWorldControlFields && !isHost && currentPermission !== 'ALL_PLAYERS') {
          this.sendToSocket(session.ws, 'ERROR', session.playerId, {
            code: 'FORBIDDEN_WORLD_SETTINGS',
            message: 'Host currently restricts world time and weather controls.',
          });
          return;
        }

        this.touchRoomActivity(now);
        const materializedTime = this.materializeWorldTime(now);
        const wt = this.ensureWorldTime(now);
        const prevDay = wt.dayCount;
        const prevScale = wt.timeScale;
        let timeChanged = false;

        if (upd.preset !== undefined) {
          wt.worldHours = TIME_PRESET_HOURS[upd.preset];
          wt.anchorServerMs = now;
          timeChanged = true;
        }
        if (upd.worldHours !== undefined) {
          wt.worldHours = Math.round(upd.worldHours * 1000) / 1000;
          wt.anchorServerMs = now;
          timeChanged = true;
        }
        if (upd.dayCount !== undefined) {
          wt.dayCount = upd.dayCount;
          wt.anchorServerMs = now;
          timeChanged = true;
        }
        if (upd.timeScale !== undefined) {
          wt.timeScale = upd.timeScale;
          wt.anchorServerMs = now;
          timeChanged = true;
        }
        if (upd.paused !== undefined) {
          wt.paused = upd.paused;
          wt.anchorServerMs = now;
          timeChanged = true;
        }
        if (upd.fullDayDurationSeconds !== undefined) {
          wt.fullDayDurationSeconds = upd.fullDayDurationSeconds;
          wt.anchorServerMs = now;
          timeChanged = true;
        }
        const wsSync = this.ensureWorldSync();
        wsSync.worldHours = wt.worldHours;

        const ww = this.materializeWorldWeather(now);
        const wwRef = this.ensureWorldWeather(now);
        let weatherChanged = false;
        let intensityChanged = false;

        if (
          upd.weatherState !== undefined ||
          upd.targetWeatherState !== undefined ||
          upd.dynamicEnabled !== undefined ||
          upd.durationMs !== undefined ||
          upd.transitionDurationSeconds !== undefined
        ) {
          const nextState = upd.targetWeatherState ?? upd.weatherState ?? wwRef.currentState;
          if (upd.weatherState !== undefined && upd.targetWeatherState === undefined) {
            wwRef.currentState = upd.weatherState;
          }
          wwRef.targetState = nextState;
          if (upd.dynamicEnabled !== undefined) {
            wwRef.dynamicEnabled = upd.dynamicEnabled;
          }
          if (upd.transitionDurationSeconds !== undefined) {
            wwRef.transitionDurationSeconds = upd.transitionDurationSeconds;
          }
          if (upd.weatherState !== undefined || upd.targetWeatherState !== undefined || upd.durationMs !== undefined) {
            wwRef.startMs = now;
            wwRef.durationMs = Math.max(
              5_000,
              Math.min(MAX_WEATHER_DURATION_MS, upd.durationMs ?? wwRef.durationMs ?? 240_000),
            );
            wwRef.endMs = wwRef.startMs + wwRef.durationMs;
          }
          if (upd.weatherIntensity === undefined && upd.weatherState !== undefined) {
            const defaultIntensity =
              upd.weatherState === 'storm'
                ? 0.9
                : upd.weatherState === 'rain'
                  ? 0.72
                  : upd.weatherState === 'fog' || upd.weatherState === 'overcast'
                    ? 0.6
                    : upd.weatherState === 'cloudy'
                      ? 0.35
                      : 0;
            wwRef.intensity = defaultIntensity;
          }
          wsSync.weather = wwRef.currentState;
          weatherChanged = true;
        }
        if (upd.weatherIntensity !== undefined) {
          wwRef.intensity = upd.weatherIntensity;
          intensityChanged = true;
        }

        await this.persist();

        const finalTime = { ...wt };
        const finalWeather = { ...wwRef };
        if (timeChanged && (wt.worldHours !== materializedTime.worldHours || wt.paused !== materializedTime.paused || upd.preset !== undefined || upd.worldHours !== undefined || upd.fullDayDurationSeconds !== undefined)) {
          this.broadcast('WORLD_TIME_CHANGED', session.playerId, {
            worldTime: finalTime,
            serverTimestamp: now,
            updatedBy: session.playerId,
          });
        }
        if (wt.dayCount !== prevDay) {
          this.broadcast('WORLD_DAY_CHANGED', session.playerId, {
            dayCount: wt.dayCount,
            worldHours: wt.worldHours,
            serverTimestamp: now,
            updatedBy: session.playerId,
          });
        }
        if (wt.timeScale !== prevScale) {
          this.broadcast('WORLD_TIME_SCALE_CHANGED', session.playerId, {
            timeScale: wt.timeScale,
            paused: wt.paused,
            worldTime: finalTime,
            serverTimestamp: now,
            updatedBy: session.playerId,
          });
        }
        if (weatherChanged || upd.triggerLightning) {
          this.broadcast('WORLD_WEATHER_CHANGED', session.playerId, {
            worldWeather: finalWeather,
            triggerLightning: Boolean(upd.triggerLightning),
            serverTimestamp: now,
            updatedBy: session.playerId,
          });
        }
        if (intensityChanged || (upd.weatherState !== undefined && ww.intensity !== finalWeather.intensity)) {
          this.broadcast('WORLD_WEATHER_INTENSITY_CHANGED', session.playerId, {
            intensity: finalWeather.intensity,
            worldWeather: finalWeather,
            serverTimestamp: now,
            updatedBy: session.playerId,
          });
        }
        this.broadcast('WORLD_SETTINGS_UPDATED', session.playerId, {
          worldSettingsPermission: this.room.gameState.worldSettingsPermission ?? 'HOST_ONLY',
          worldTime: finalTime,
          worldWeather: finalWeather,
          triggerLightning: Boolean(upd.triggerLightning),
          serverTimestamp: now,
          updatedBy: session.playerId,
        });
        if (upd.worldSettingsPermission !== undefined) {
          this.broadcastRoomState();
        }
        break;
      }

      case 'ENEMY_ATTACK_PLAYER': {
        if (!msg.enemyAttackPlayer) return;
        if (this.room.status !== 'in-game') return;
        if (this.room.hostId !== session.playerId) {
          this.sendToSocket(session.ws, 'ERROR', session.playerId, {
            code: 'FORBIDDEN_HOST_ONLY',
            message: 'Only the room host can submit NPC/enemy attacks.',
          });
          return;
        }
        if (this.room.gameState.worldType === 'creative') return;
        const { targetPlayerId, sourceId, damage, x, z } = msg.enemyAttackPlayer;
        const targetPlayer = this.room.players[targetPlayerId];
        const targetAuth = this.room.authoritativePlayers?.[targetPlayerId];
        if (!targetPlayer || !targetAuth || targetAuth.isDead) return;

        const lastSrcHit = targetAuth.lastEnemyAttackAtBySource[sourceId] ?? 0;
        if (now - lastSrcHit < 650) return;

        if (x !== undefined && z !== undefined) {
          if (Math.hypot(x - targetAuth.lastX, z - targetAuth.lastZ) > 9.5) {
            return;
          }
        }

        targetAuth.lastEnemyAttackAtBySource[sourceId] = now;
        targetAuth.health = Math.max(0, targetAuth.health - damage);
        targetAuth.lastDamageAtMs = now;
        if (targetAuth.health <= 0) {
          targetAuth.isDead = true;
          targetAuth.reviveAtMs = now + 2000;
        }
        targetPlayer.health = targetAuth.health;
        targetPlayer.maxHealth = targetAuth.maxHealth;
        targetPlayer.isDead = targetAuth.isDead;
        if (targetPlayer.state) {
          targetPlayer.state.health = targetAuth.health;
          targetPlayer.state.isDead = targetAuth.isDead;
        }
        this.touchRoomActivity(now);
        this.broadcast<AuthoritativePlayerVitals>('PLAYER_VITALS', targetPlayerId, {
          playerId: targetPlayerId,
          networkEntityId: targetAuth.networkEntityId,
          health: targetAuth.health,
          maxHealth: targetAuth.maxHealth,
          isDead: targetAuth.isDead,
          reviveAtMs: targetAuth.reviveAtMs,
        });
        if (targetAuth.isDead) {
          this.broadcast('GAME_EVENT', session.playerId, {
            event: 'PLAYER_DIED',
            data: {
              playerId: targetPlayerId,
              killerId: sourceId,
              displayName: targetPlayer.displayName,
              x: targetAuth.lastX,
              y: targetAuth.lastY,
              z: targetAuth.lastZ,
            },
          });
        }
        break;
      }

      case 'REPAIR_WEAPONS': {
        if (!msg.repairWeapons) return;
        if (this.room.status !== 'in-game') return;
        const auth = this.ensureAuthoritativePlayer(session.playerId);
        const cost = this.room.gameState.worldType === 'creative' ? 0 : msg.repairWeapons.costCoins;
        if (auth.coins < cost) {
          this.sendToSocket(session.ws, 'ERROR', session.playerId, {
            code: 'INSUFFICIENT_COINS',
            message: 'Not enough coins to repair weapons.',
          });
          return;
        }
        this.touchRoomActivity(now);
        this.grantProgression(session.playerId, 0, -cost, 'weapons_repaired');
        await this.persist();
        break;
      }

      case 'KICK_PLAYER': {
        if (this.room.hostId !== session.playerId) {
          this.sendToSocket(session.ws, 'ERROR', session.playerId, {
            code: 'FORBIDDEN_HOST_ONLY',
            message: 'Only the host can kick players.',
          });
          return;
        }
        if (!msg.targetPlayerId || !this.room.players[msg.targetPlayerId]) {
          this.sendToSocket(session.ws, 'ERROR', session.playerId, {
            code: 'PLAYER_NOT_FOUND',
            message: 'Target player is no longer in this room.',
          });
          return;
        }
        await this.handleKickPlayer(session.playerId, msg.targetPlayerId);
        break;
      }

      case 'TRANSFER_HOST': {
        if (this.room.hostId !== session.playerId) {
          this.sendToSocket(session.ws, 'ERROR', session.playerId, {
            code: 'FORBIDDEN_HOST_ONLY',
            message: 'Only the host can transfer host ownership.',
          });
          return;
        }
        if (!msg.targetPlayerId || !this.room.players[msg.targetPlayerId]) {
          this.sendToSocket(session.ws, 'ERROR', session.playerId, {
            code: 'PLAYER_NOT_FOUND',
            message: 'Target player is no longer in this room.',
          });
          return;
        }
        await this.handleTransferHost(session.playerId, msg.targetPlayerId);
        break;
      }

      case 'CLOSE_ROOM': {
        if (this.room.hostId !== session.playerId) {
          this.sendToSocket(session.ws, 'ERROR', session.playerId, {
            code: 'FORBIDDEN_HOST_ONLY',
            message: 'Only the host can close the room.',
          });
          return;
        }
        await this.handleCloseRoom(session.playerId);
        break;
      }

      case 'ROOM_CHAT': {
        if (!msg.chatMessage) return;

        if (session.lastChatSentAtMs > 0 && now - session.lastChatSentAtMs < CHAT_RATE_COOLDOWN_MS) {
          this.sendToSocket(session.ws, 'ERROR', session.playerId, {
            code: 'CHAT_SPAM_LIMITED',
            message: 'You are sending messages too quickly. Please wait a moment.',
          });
          return;
        }

        const normalized = msg.chatMessage.toLowerCase();
        if (
          normalized === session.lastChatNormalized &&
          now - session.lastChatSentAtMs < 12_000
        ) {
          session.duplicateChatStreak += 1;
          if (session.duplicateChatStreak >= 2) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'CHAT_DUPLICATE_SPAM',
              message: 'Repeated duplicate messages are blocked by anti-spam.',
            });
            return;
          }
        } else {
          session.duplicateChatStreak = 1;
          session.lastChatNormalized = normalized;
        }
        session.lastChatSentAtMs = now;

        this.chatSeq += 1;
        const chatEntry: RoomChatMessage = {
          id: `chat_${now}_${this.chatSeq}`,
          playerId: session.playerId,
          ...(player.publicProfileId ? { publicProfileId: player.publicProfileId } : {}),
          playerName: player.displayName,
          ...(player.playerTag ? { playerTag: player.playerTag } : {}),
          ...(player.avatar ? { avatar: player.avatar } : {}),
          message: msg.chatMessage,
          timestamp: now,
        };

        if (!this.room.chatMessages) {
          this.room.chatMessages = [];
        }
        this.room.chatMessages.push(chatEntry);
        if (this.room.chatMessages.length > CHAT_HISTORY_LIMIT) {
          this.room.chatMessages = this.room.chatMessages.slice(-CHAT_HISTORY_LIMIT);
        }
        this.touchRoomActivity(now);
        await this.persist();
        this.broadcast<RoomChatMessage>('ROOM_CHAT', session.playerId, chatEntry);
        break;
      }

      case 'PLAYER_REPORT': {
        if (!msg.playerReport) return;
        const { targetPlayerId, reason, details } = msg.playerReport;
        const targetPlayer = this.room.players[targetPlayerId];
        if (!targetPlayer) {
          this.sendToSocket(session.ws, 'ERROR', session.playerId, {
            code: 'PLAYER_NOT_FOUND',
            message: 'Reported player is not in this room.',
          });
          return;
        }
        if (session.reportedTargets.has(targetPlayerId)) {
          this.sendToSocket(session.ws, 'ERROR', session.playerId, {
            code: 'REPORT_ALREADY_SUBMITTED',
            message: 'You have already reported this player in this room.',
          });
          return;
        }
        session.reportedTargets.add(targetPlayerId);
        this.reportSeq += 1;
        const reportId = `rep_${now}_${this.reportSeq}`;
        if (!this.room.reports) {
          this.room.reports = [];
        }
        this.room.reports.push({
          reportId,
          targetPlayerId,
          targetDisplayName: targetPlayer.displayName,
          reporterPlayerId: session.playerId,
          reason,
          ...(details ? { details } : {}),
          timestamp: now,
        });
        if (this.room.reports.length > 40) {
          this.room.reports = this.room.reports.slice(-40);
        }
        await this.persist();
        this.sendToSocket<ReportAckPayload>(session.ws, 'REPORT_ACK', session.playerId, {
          reportId,
          targetPlayerId,
          reason,
          timestamp: now,
        });
        break;
      }

      case 'PLAYER_STATE': {
        if (!msg.playerState) return;
        if (this.room.status !== 'in-game') {
          this.sendToSocket(session.ws, 'ERROR', session.playerId, {
            code: 'GAME_NOT_STARTED',
            message: 'Player movement updates are only accepted after the game starts.',
          });
          return;
        }
        const auth = this.ensureAuthoritativePlayer(session.playerId);

        if (auth.isDead) {
          this.sendToSocket<AuthoritativePlayerVitals>(
            session.ws,
            'PLAYER_VITALS',
            session.playerId,
            {
              playerId: session.playerId,
              networkEntityId: auth.networkEntityId,
              health: auth.health,
              maxHealth: auth.maxHealth,
              isDead: auth.isDead,
              reviveAtMs: auth.reviveAtMs,
            },
          );
          return;
        }

        if (auth.lastStateAtMs > 0) {
          const dtSec = Math.max(0.005, Math.min(5, (now - auth.lastStateAtMs) / 1000));
          const horizDist = Math.hypot(
            msg.playerState.x - auth.lastX,
            msg.playerState.z - auth.lastZ,
          );
          const vertDist = Math.abs(msg.playerState.y - auth.lastY);
          // Regenerate jitter allowance over real elapsed time (prevents packet-burst speedhacks)
          auth.movementJitterM = Math.min(
            MAX_MOVEMENT_JITTER_M,
            auth.movementJitterM + dtSec * 2.5,
          );
          const baseAllowedHoriz = MAX_PLAYER_SPEED_MPS * dtSec;
          const horizExcess = Math.max(0, horizDist - baseAllowedHoriz);
          const maxAllowedVert = 36 * dtSec + 8;

          if (horizExcess > auth.movementJitterM || vertDist > maxAllowedVert) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'INVALID_POSITION_DELTA',
              message: 'Position update rejected: movement delta exceeds server limit.',
            });
            this.sendToSocket<PositionCorrectionPayload>(
              session.ws,
              'POSITION_CORRECTION',
              session.playerId,
              {
                x: auth.lastX,
                y: auth.lastY,
                z: auth.lastZ,
                yaw: player.state?.yaw ?? msg.playerState.yaw,
                seq: msg.playerState.seq,
                reason: 'INVALID_POSITION_DELTA',
              },
            );
            return;
          }
          auth.movementJitterM = Math.max(0, auth.movementJitterM - horizExcess);
        }

        auth.lastX = msg.playerState.x;
        auth.lastY = msg.playerState.y;
        auth.lastZ = msg.playerState.z;
        auth.lastStateAtMs = now;
        if (msg.playerState.weaponId !== undefined) {
          auth.equippedWeaponId = msg.playerState.weaponId;
        }

        const relayedState: PlayerNetworkState = {
          ...msg.playerState,
          networkEntityId: auth.networkEntityId,
          health: auth.health,
          maxHealth: auth.maxHealth,
          isDead: auth.isDead,
          serverTime: now,
        };
        player.networkEntityId = auth.networkEntityId;
        player.health = auth.health;
        player.maxHealth = auth.maxHealth;
        player.isDead = auth.isDead;
        player.state = relayedState;
        this.room.gameState.tick += 1;
        this.touchRoomActivity(now);
        if (now - this.lastStatePersistAt >= 3000) {
          this.lastStatePersistAt = now;
          await this.persist();
        }
        this.broadcast(
          'PLAYER_STATE',
          session.playerId,
          relayedState,
          session.ws,
        );
        break;
      }

      case 'ENTITY_SYNC': {
        if (!msg.entitySync) return;
        if (this.room.status !== 'in-game') return;
        if (this.room.hostId !== session.playerId) {
          this.sendToSocket(session.ws, 'ERROR', session.playerId, {
            code: 'FORBIDDEN_HOST_ONLY',
            message: 'Only the room host can synchronize world entity movement.',
          });
          return;
        }

        const ws = this.ensureWorldSync();
        this.touchRoomActivity(now);

        const relayedEntities = [];
        for (const delta of msg.entitySync.entities) {
          const capMaxHp = this.resolveEntityMaxHp(delta.kind, delta.archetype);
          let tracked = ws.entities[delta.id];
          if (!tracked) {
            const initMaxHp =
              typeof delta.maxHp === 'number'
                ? Math.max(1, Math.min(capMaxHp, delta.maxHp))
                : capMaxHp;
            const initHp =
              typeof delta.hp === 'number'
                ? Math.max(0, Math.min(initMaxHp, delta.hp))
                : initMaxHp;
            tracked = {
              id: delta.id,
              kind: delta.kind,
              archetype: delta.archetype,
              maxHp: initMaxHp,
              hp: delta.isDead ? 0 : initHp,
              isDead: Boolean(delta.isDead || initHp <= 0),
              diedAtMs: delta.isDead ? now : 0,
              x: delta.x,
              y: delta.y,
              z: delta.z,
              yaw: delta.yaw,
              state: delta.state,
              lastUpdatedAtMs: now,
            };
            ws.entities[delta.id] = tracked;
          } else {
            tracked.x = delta.x;
            tracked.y = delta.y;
            tracked.z = delta.z;
            tracked.yaw = delta.yaw;
            tracked.state = delta.state;
            tracked.lastUpdatedAtMs = now;
            // Allow respawning enemies after respawn timer, never overwrite server death prematurely
            if (
              delta.kind === 'enemy' &&
              tracked.isDead &&
              delta.isDead === false &&
              now - tracked.diedAtMs >= 20_000
            ) {
              tracked.isDead = false;
              tracked.hp = tracked.maxHp;
              tracked.diedAtMs = 0;
            }
          }

          relayedEntities.push({
            ...delta,
            hp: tracked.hp,
            maxHp: tracked.maxHp,
            isDead: tracked.isDead,
          });
        }

        const worldTime = this.materializeWorldTime(now);
        const worldWeather = this.materializeWorldWeather(now);
        this.broadcast(
          'ENTITY_SYNC',
          session.playerId,
          {
            entities: relayedEntities,
            worldHours: worldTime.worldHours,
            weather: worldWeather.currentState,
          },
          session.ws,
        );
        break;
      }

      case 'GAME_EVENT': {
        if (!msg.gameEvent) return;
        if (this.room.status !== 'in-game') {
          this.sendToSocket(session.ws, 'ERROR', session.playerId, {
            code: 'GAME_NOT_STARTED',
            message: 'Gameplay events are only accepted after the game starts.',
          });
          return;
        }
        const auth = this.ensureAuthoritativePlayer(session.playerId);
        const eventName = msg.gameEvent.event;
        const eventData = msg.gameEvent.data ?? {};
        this.room.gameState.tick += 1;

        if (eventName === 'player:damage-taken') {
          if (this.room.gameState.worldType === 'creative' || auth.isDead) {
            return;
          }
          if (now - auth.lastDamageAtMs < 240) {
            return;
          }
          const rawAmount =
            typeof eventData.amount === 'number' && Number.isFinite(eventData.amount)
              ? eventData.amount
              : 0;
          const clampedDamage = Math.max(1, Math.min(55, Math.round(rawAmount)));
          auth.health = Math.max(0, auth.health - clampedDamage);
          auth.lastDamageAtMs = now;
          if (auth.health <= 0) {
            auth.isDead = true;
            auth.reviveAtMs = now + 2000;
          }
          player.health = auth.health;
          player.maxHealth = auth.maxHealth;
          player.isDead = auth.isDead;
          if (player.state) {
            player.state.health = auth.health;
            player.state.isDead = auth.isDead;
          }
          this.broadcast<AuthoritativePlayerVitals>('PLAYER_VITALS', session.playerId, {
            playerId: session.playerId,
            networkEntityId: auth.networkEntityId,
            health: auth.health,
            maxHealth: auth.maxHealth,
            isDead: auth.isDead,
            reviveAtMs: auth.reviveAtMs,
          });
          if (auth.isDead) {
            this.broadcast('GAME_EVENT', session.playerId, {
              event: 'PLAYER_DIED',
              data: {
                playerId: session.playerId,
                displayName: player.displayName,
                x: auth.lastX,
                y: auth.lastY,
                z: auth.lastZ,
              },
            });
          }
          break;
        }

        if (eventName === 'player:respawn') {
          const spawnX = this.room.gameState.worldSettings?.spawnX ?? 0;
          const spawnY = this.room.gameState.worldSettings?.spawnY ?? 0;
          const spawnZ = this.room.gameState.worldSettings?.spawnZ ?? 4;
          auth.health = auth.maxHealth;
          auth.isDead = false;
          auth.reviveAtMs = null;
          auth.lastX = spawnX;
          auth.lastY = spawnY;
          auth.lastZ = spawnZ;
          auth.lastStateAtMs = now;
          player.health = auth.health;
          player.maxHealth = auth.maxHealth;
          player.isDead = false;
          if (player.state) {
            player.state.x = spawnX;
            player.state.y = spawnY;
            player.state.z = spawnZ;
            player.state.health = auth.health;
            player.state.isDead = false;
          }
          this.broadcast<AuthoritativePlayerVitals>('PLAYER_VITALS', session.playerId, {
            playerId: session.playerId,
            networkEntityId: auth.networkEntityId,
            health: auth.health,
            maxHealth: auth.maxHealth,
            isDead: false,
            reviveAtMs: null,
          });
          this.sendToSocket<PositionCorrectionPayload>(
            session.ws,
            'POSITION_CORRECTION',
            session.playerId,
            {
              x: spawnX,
              y: spawnY,
              z: spawnZ,
              yaw: player.state?.yaw ?? 0,
              reason: 'RESPAWN',
            },
          );
          break;
        }

        if (eventName === 'player:attack' || eventName === 'player:shoot') {
          if (auth.isDead) return;
          const weaponId =
            typeof eventData.weaponId === 'string' && ALLOWED_WEAPON_IDS.has(eventData.weaponId)
              ? eventData.weaponId
              : null;
          if (weaponId) {
            auth.equippedWeaponId = weaponId;
          }
          const animType =
            typeof eventData.animType === 'string' &&
            ALLOWED_ATTACK_ANIM_TYPES.has(eventData.animType)
              ? eventData.animType
              : eventName === 'player:shoot'
                ? 'bow_shot'
                : 'melee_slash';
          const bowCharge =
            typeof eventData.bowCharge === 'number' && Number.isFinite(eventData.bowCharge)
              ? Math.max(0, Math.min(1, Math.round(eventData.bowCharge * 100) / 100))
              : 1;
          const aimYaw =
            typeof eventData.aimYaw === 'number' && Number.isFinite(eventData.aimYaw)
              ? Math.round(eventData.aimYaw * 1000) / 1000
              : player.state?.aimYaw ?? player.state?.yaw ?? 0;
          const pitch =
            typeof eventData.pitch === 'number' && Number.isFinite(eventData.pitch)
              ? Math.round(eventData.pitch * 1000) / 1000
              : player.state?.pitch ?? 0;

          this.broadcast(
            'GAME_EVENT',
            session.playerId,
            {
              event: eventName,
              data: {
                weaponId,
                animType,
                bowCharge,
                aimYaw,
                pitch,
              },
            },
            session.ws,
          );
          break;
        }

        if (eventName === 'ARROW_FIRED') {
          if (auth.isDead) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'PLAYER_DEAD',
              message: 'Cannot fire arrows while downed.',
            });
            return;
          }
          const weaponId =
            typeof eventData.weaponId === 'string' ? eventData.weaponId : '';
          const spec = SERVER_WEAPON_SPECS[weaponId];
          if (!spec || !spec.isRanged) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'INVALID_WEAPON',
              message: 'Weapon cannot fire projectiles.',
            });
            return;
          }
          if (
            this.room.gameState.worldType !== 'creative' &&
            !auth.inventoryItemIds.includes(weaponId)
          ) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'WEAPON_NOT_OWNED',
              message: 'Player does not own this ranged weapon.',
            });
            return;
          }
          if (now - auth.lastAttackAtMs < spec.cooldownMs * 0.72) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'WEAPON_COOLDOWN',
              message: 'Weapon is still on cooldown.',
            });
            return;
          }
          if (this.room.gameState.worldType !== 'creative' && auth.ammoCount <= 0) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'NO_AMMO',
              message: 'Out of arrows.',
            });
            return;
          }

          const originX =
            typeof eventData.originX === 'number' && Number.isFinite(eventData.originX)
              ? eventData.originX
              : auth.lastX;
          const originY =
            typeof eventData.originY === 'number' && Number.isFinite(eventData.originY)
              ? eventData.originY
              : auth.lastY + 1.45;
          const originZ =
            typeof eventData.originZ === 'number' && Number.isFinite(eventData.originZ)
              ? eventData.originZ
              : auth.lastZ;

          if (
            Math.hypot(originX - auth.lastX, originZ - auth.lastZ) > 4.2 ||
            Math.abs(originY - (auth.lastY + 1.45)) > 3.5
          ) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'INVALID_ORIGIN',
              message: 'Arrow launch origin too far from player position.',
            });
            return;
          }

          const rawDirX = typeof eventData.dirX === 'number' ? eventData.dirX : 0;
          const rawDirY = typeof eventData.dirY === 'number' ? eventData.dirY : 0;
          const rawDirZ = typeof eventData.dirZ === 'number' ? eventData.dirZ : 1;
          const dirLen = Math.hypot(rawDirX, rawDirY, rawDirZ);
          if (
            !Number.isFinite(rawDirX) ||
            !Number.isFinite(rawDirY) ||
            !Number.isFinite(rawDirZ) ||
            dirLen < 0.5 ||
            dirLen > 1.5
          ) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'INVALID_DIRECTION',
              message: 'Projectile launch direction vector is invalid.',
            });
            return;
          }
          const dirX = Math.round((rawDirX / dirLen) * 1000) / 1000;
          const dirY = Math.round((rawDirY / dirLen) * 1000) / 1000;
          const dirZ = Math.round((rawDirZ / dirLen) * 1000) / 1000;

          const arrowId =
            typeof eventData.arrowId === 'string' && eventData.arrowId.length > 0
              ? eventData.arrowId.slice(0, 48)
              : `arr_${session.playerId}_${now}`;
          if (this.activeArrows.has(arrowId)) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'DUPLICATE_ARROW_ID',
              message: 'Arrow network ID already exists.',
            });
            return;
          }

          const charge =
            typeof eventData.bowCharge === 'number' && Number.isFinite(eventData.bowCharge)
              ? Math.max(0, Math.min(1, eventData.bowCharge))
              : 1;
          const speed =
            (spec.minSpeed ?? 15) +
            charge * ((spec.maxSpeed ?? 45) - (spec.minSpeed ?? 15));
          const gravity = spec.gravity ?? 9.8;

          auth.lastAttackAtMs = now;
          auth.equippedWeaponId = weaponId;
          if (this.room.gameState.worldType !== 'creative') {
            auth.ammoCount = Math.max(0, auth.ammoCount - 1);
          }

          if (this.activeArrows.size > 160) {
            for (const [k, v] of this.activeArrows) {
              if (now - v.createdAtMs > 6000 || v.consumed) {
                this.activeArrows.delete(k);
              }
            }
          }

          this.activeArrows.set(arrowId, {
            arrowId,
            shooterId: session.playerId,
            weaponId,
            charge,
            originX,
            originY,
            originZ,
            dirX,
            dirY,
            dirZ,
            speed,
            gravity,
            createdAtMs: now,
            consumed: false,
          });

          this.broadcast('GAME_EVENT', session.playerId, {
            event: 'ARROW_FIRED',
            data: {
              arrowId,
              shooterId: session.playerId,
              weaponId,
              originX,
              originY,
              originZ,
              dirX,
              dirY,
              dirZ,
              speed,
              gravity,
              bowCharge: charge,
              ammoCount: auth.ammoCount,
            },
          });
          break;
        }

        if (eventName === 'PROJECTILE_HIT') {
          if (auth.isDead) return;
          const arrowId =
            typeof eventData.arrowId === 'string' ? eventData.arrowId : '';
          const arrow = this.activeArrows.get(arrowId);
          if (!arrow || arrow.consumed || arrow.shooterId !== session.playerId) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'INVALID_PROJECTILE',
              message: 'Arrow does not exist or already resolved.',
            });
            return;
          }
          if (now - arrow.createdAtMs > 6500) {
            this.activeArrows.delete(arrowId);
            return;
          }

          const spec = SERVER_WEAPON_SPECS[arrow.weaponId];
          if (!spec) {
            this.activeArrows.delete(arrowId);
            return;
          }

          const hitX =
            typeof eventData.x === 'number' && Number.isFinite(eventData.x)
              ? eventData.x
              : arrow.originX;
          const hitY =
            typeof eventData.y === 'number' && Number.isFinite(eventData.y)
              ? eventData.y
              : arrow.originY;
          const hitZ =
            typeof eventData.z === 'number' && Number.isFinite(eventData.z)
              ? eventData.z
              : arrow.originZ;
          const flightDist = Math.hypot(
            hitX - arrow.originX,
            hitY - arrow.originY,
            hitZ - arrow.originZ,
          );
          if (flightDist > spec.range + 10) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'OUT_OF_RANGE',
              message: 'Projectile hit exceeds maximum weapon range.',
            });
            return;
          }

          if (flightDist > 2.0) {
            const tEst = flightDist / Math.max(8, arrow.speed);
            const dx = hitX - arrow.originX;
            const dy = hitY - arrow.originY + 0.5 * arrow.gravity * tEst * tEst;
            const dz = hitZ - arrow.originZ;
            const compLen = Math.hypot(dx, dy, dz) || 1;
            const dot =
              (dx / compLen) * arrow.dirX +
              (dy / compLen) * arrow.dirY +
              (dz / compLen) * arrow.dirZ;
            if (dot < 0.15) {
              arrow.consumed = true;
              this.activeArrows.delete(arrowId);
              this.sendToSocket(session.ws, 'ERROR', session.playerId, {
                code: 'INVALID_PROJECTILE_TRAJECTORY',
                message: 'Projectile impact point contradicts launch direction.',
              });
              return;
            }
          }

          arrow.consumed = true;
          this.activeArrows.delete(arrowId);

          const targetKind =
            typeof eventData.targetKind === 'string' ? eventData.targetKind : 'world';
          const targetId =
            typeof eventData.targetId === 'string' ? eventData.targetId : '';
          const isHeadshot = Boolean(eventData.isHeadshot);

          if (targetKind === 'world' || !targetId) {
            this.broadcast('GAME_EVENT', session.playerId, {
              event: 'PROJECTILE_HIT',
              data: {
                arrowId,
                shooterId: session.playerId,
                targetKind: 'world',
                targetId: '',
                x: hitX,
                y: hitY,
                z: hitZ,
                isHeadshot: false,
              },
            });
            break;
          }

          // Calculate authoritative arrow damage on server
          const minD = spec.minDamage ?? spec.baseDamage;
          const maxD = spec.maxDamage ?? spec.baseDamage;
          const baseDmg = minD + arrow.charge * (maxD - minD);
          const damage = Math.max(
            1,
            Math.round(baseDmg * (isHeadshot ? (spec.headshotMult ?? 2.0) : 1)),
          );

          const applied = await this.applyAuthoritativeDamage(
            session.playerId,
            targetKind,
            targetId,
            typeof eventData.archetype === 'string' ? eventData.archetype : 'default',
            damage,
            isHeadshot,
            hitX,
            hitY,
            hitZ,
            now,
          );
          if (applied) {
            this.broadcast('GAME_EVENT', session.playerId, {
              event: 'PROJECTILE_HIT',
              data: {
                arrowId,
                shooterId: session.playerId,
                targetKind,
                targetId,
                x: hitX,
                y: hitY,
                z: hitZ,
                isHeadshot,
              },
            });
          }
          break;
        }

        if (eventName === 'COMBAT_HIT') {
          if (auth.isDead) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'PLAYER_DEAD',
              message: 'Downed players cannot attack.',
            });
            return;
          }
          const weaponId =
            typeof eventData.weaponId === 'string' && eventData.weaponId.length > 0
              ? eventData.weaponId
              : 'unarmed';
          const spec = SERVER_WEAPON_SPECS[weaponId];
          if (!spec || spec.isRanged) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'INVALID_WEAPON',
              message: 'Invalid melee weapon for COMBAT_HIT.',
            });
            return;
          }
          if (
            weaponId !== 'unarmed' &&
            this.room.gameState.worldType !== 'creative' &&
            !auth.inventoryItemIds.includes(weaponId)
          ) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'WEAPON_NOT_OWNED',
              message: 'Player does not own this weapon.',
            });
            return;
          }
          const targetKind =
            typeof eventData.targetKind === 'string' ? eventData.targetKind : '';
          const targetId =
            typeof eventData.targetId === 'string' ? eventData.targetId : '';
          if (
            (targetKind !== 'enemy' &&
              targetKind !== 'animal' &&
              targetKind !== 'npc' &&
              targetKind !== 'player') ||
            !targetId
          ) {
            return;
          }

          const attackId =
            typeof eventData.attackId === 'string' && eventData.attackId.length > 0
              ? eventData.attackId.slice(0, 64)
              : null;
          const isSameSwingCleave = Boolean(
            attackId &&
              auth.lastSwingId === attackId &&
              auth.lastSwingWeaponId === weaponId &&
              now - auth.lastSwingAtMs <= 320 &&
              !auth.lastSwingTargetIds.includes(targetId) &&
              auth.lastSwingTargetIds.length < 4,
          );
          if (!isSameSwingCleave && now - auth.lastAttackAtMs < spec.cooldownMs * 0.65) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'WEAPON_COOLDOWN',
              message: 'Attack speed exceeds weapon cooldown.',
            });
            return;
          }

          const hitX = typeof eventData.x === 'number' ? eventData.x : auth.lastX;
          const hitY = typeof eventData.y === 'number' ? eventData.y : auth.lastY;
          const hitZ = typeof eventData.z === 'number' ? eventData.z : auth.lastZ;
          const distToTarget = Math.hypot(hitX - auth.lastX, hitZ - auth.lastZ);
          if (distToTarget > spec.range + 3.4) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'OUT_OF_RANGE',
              message: 'Target is out of melee reach.',
            });
            return;
          }

          if (isSameSwingCleave) {
            auth.lastSwingTargetIds.push(targetId);
          } else {
            auth.lastAttackAtMs = now;
            auth.lastSwingId = attackId;
            auth.lastSwingWeaponId = weaponId;
            auth.lastSwingAtMs = now;
            auth.lastSwingTargetIds = [targetId];
          }
          auth.equippedWeaponId = weaponId === 'unarmed' ? null : weaponId;
          const isCrit = Boolean(eventData.isCrit);
          const damage = Math.max(
            1,
            Math.round(spec.baseDamage * (isCrit ? spec.critMult : 1)),
          );

          await this.applyAuthoritativeDamage(
            session.playerId,
            targetKind,
            targetId,
            typeof eventData.archetype === 'string' ? eventData.archetype : 'default',
            damage,
            isCrit,
            hitX,
            hitY,
            hitZ,
            now,
          );
          break;
        }

        if (eventName === 'CHEST_OPENED') {
          if (auth.isDead) return;
          const chestId =
            typeof eventData.chestId === 'string'
              ? eventData.chestId.trim().slice(0, 64)
              : '';
          if (!chestId) return;
          const cx = typeof eventData.x === 'number' ? eventData.x : auth.lastX;
          const cz = typeof eventData.z === 'number' ? eventData.z : auth.lastZ;
          if (Math.hypot(cx - auth.lastX, cz - auth.lastZ) > 8.5) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'OUT_OF_RANGE',
              message: 'Too far from chest to open.',
            });
            return;
          }
          const ws = this.ensureWorldSync();
          if (ws.openedChests[chestId]) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'CHEST_ALREADY_OPENED',
              message: 'Chest has already been opened.',
            });
            return;
          }
          ws.openedChests[chestId] = { openedBy: session.playerId, openedAtMs: now };
          if (eventData.hasArrows === true) {
            const arrowAdd =
              typeof eventData.arrowCount === 'number' && Number.isFinite(eventData.arrowCount)
                ? Math.max(1, Math.min(12, Math.round(eventData.arrowCount)))
                : 8;
            auth.ammoCount = Math.min(240, auth.ammoCount + arrowAdd);
          }
          if (
            typeof eventData.lootItems === 'string' &&
            eventData.lootItems.length > 0 &&
            auth.chestWeaponLootCount < 3
          ) {
            const items = eventData.lootItems.split(',').slice(0, 1);
            for (const itemId of items) {
              const trimmed = itemId.trim();
              if (
                ALLOWED_WEAPON_IDS.has(trimmed) &&
                !auth.inventoryItemIds.includes(trimmed)
              ) {
                auth.inventoryItemIds.push(trimmed);
                auth.chestWeaponLootCount += 1;
              }
            }
          }
          await this.persist();
          this.grantProgression(session.playerId, 15, 12, 'chest_opened');
          this.broadcast('GAME_EVENT', session.playerId, {
            event: 'CHEST_OPENED',
            data: {
              chestId,
              openedBy: session.playerId,
              x: cx,
              y: typeof eventData.y === 'number' ? eventData.y : auth.lastY,
              z: cz,
            },
          });
          break;
        }

        if (eventName === 'PLAYER_COLLECTED_RESOURCE') {
          if (auth.isDead) return;
          if (now - auth.lastResourceCollectAtMs < 200) {
            return;
          }
          const nodeId =
            typeof eventData.nodeId === 'string'
              ? eventData.nodeId.trim().slice(0, 64)
              : '';
          if (!nodeId) return;
          const rx = typeof eventData.x === 'number' ? eventData.x : auth.lastX;
          const rz = typeof eventData.z === 'number' ? eventData.z : auth.lastZ;
          if (Math.hypot(rx - auth.lastX, rz - auth.lastZ) > 9.0) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'OUT_OF_RANGE',
              message: 'Too far from resource node.',
            });
            return;
          }
          const ws = this.ensureWorldSync();
          const prev = ws.depletedResources[nodeId];
          if (prev && now < prev.regenAtMs && prev.usesRemaining <= 0) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'RESOURCE_DEPLETED',
              message: 'Resource node is already depleted.',
            });
            return;
          }
          auth.lastResourceCollectAtMs = now;
          const currentUses =
            prev && now < prev.regenAtMs
              ? prev.usesRemaining
              : typeof eventData.maxUses === 'number' && eventData.maxUses >= 1
                ? Math.min(4, Math.round(eventData.maxUses))
                : 2;
          const usesRemaining = Math.max(0, currentUses - 1);
          const depleted = usesRemaining <= 0;
          const regenAtMs = now + 90_000;
          ws.depletedResources[nodeId] = {
            usesRemaining,
            regenAtMs,
            collectedBy: session.playerId,
          };
          const itemId =
            typeof eventData.itemId === 'string' ? eventData.itemId.slice(0, 32) : 'wood';
          const count =
            typeof eventData.count === 'number'
              ? Math.max(1, Math.min(5, Math.round(eventData.count)))
              : 1;
          if (itemId === 'arrow') {
            auth.ammoCount = Math.min(240, auth.ammoCount + count);
          }
          await this.persist();
          this.grantProgression(session.playerId, 5, 0, 'resource_collected');
          await this.syncProfileEvent(player.publicProfileId, {
            statsDelta: { resourcesCollected: 1, xpGained: 5 },
          });
          this.broadcast('GAME_EVENT', session.playerId, {
            event: 'PLAYER_COLLECTED_RESOURCE',
            data: {
              nodeId,
              itemId,
              count,
              usesRemaining,
              depleted,
              collectedBy: session.playerId,
              x: rx,
              y: typeof eventData.y === 'number' ? eventData.y : auth.lastY,
              z: rz,
            },
          });
          break;
        }

        if (eventName === 'ITEM_DROPPED') {
          if (auth.isDead) return;
          const itemId = typeof eventData.itemId === 'string' ? eventData.itemId : '';
          if (!itemId) return;
          const count =
            typeof eventData.count === 'number'
              ? Math.max(1, Math.min(99, Math.round(eventData.count)))
              : 1;
          if (itemId === 'arrow' && this.room.gameState.worldType !== 'creative') {
            if (auth.ammoCount < count) {
              this.sendToSocket(session.ws, 'ERROR', session.playerId, {
                code: 'INSUFFICIENT_ITEMS',
                message: 'Not enough arrows to drop.',
              });
              return;
            }
            auth.ammoCount = Math.max(0, auth.ammoCount - count);
          } else if (
            this.room.gameState.worldType !== 'creative' &&
            ALLOWED_WEAPON_IDS.has(itemId)
          ) {
            const idx = auth.inventoryItemIds.indexOf(itemId);
            if (idx === -1) {
              this.sendToSocket(session.ws, 'ERROR', session.playerId, {
                code: 'INSUFFICIENT_ITEMS',
                message: 'Weapon not owned to drop.',
              });
              return;
            }
            auth.inventoryItemIds.splice(idx, 1);
          }
          const dropId =
            typeof eventData.dropId === 'string' && eventData.dropId.length > 0
              ? eventData.dropId.slice(0, 64)
              : `drop_${session.playerId}_${now}`;
          const dx = typeof eventData.x === 'number' ? eventData.x : auth.lastX;
          const dy = typeof eventData.y === 'number' ? eventData.y : auth.lastY;
          const dz = typeof eventData.z === 'number' ? eventData.z : auth.lastZ;
          const label =
            typeof eventData.label === 'string' ? eventData.label.slice(0, 48) : itemId;
          const ws = this.ensureWorldSync();
          delete ws.collectedPickups[dropId];
          ws.droppedItems[dropId] = {
            id: dropId,
            itemId,
            count,
            label,
            x: dx,
            y: dy,
            z: dz,
            droppedBy: session.playerId,
          };
          await this.persist();
          this.broadcast('GAME_EVENT', session.playerId, {
            event: 'ITEM_DROPPED',
            data: {
              dropId,
              itemId,
              count,
              label,
              x: dx,
              y: dy,
              z: dz,
              droppedBy: session.playerId,
            },
          });
          break;
        }

        if (eventName === 'ITEM_PICKED_UP') {
          if (auth.isDead) return;
          const pickupId =
            typeof eventData.pickupId === 'string' ? eventData.pickupId : '';
          if (!pickupId) return;
          const ws = this.ensureWorldSync();
          const drop = ws.droppedItems[pickupId];
          if (drop) {
            if (Math.hypot(drop.x - auth.lastX, drop.z - auth.lastZ) > 9.5) {
              this.sendToSocket(session.ws, 'ERROR', session.playerId, {
                code: 'OUT_OF_RANGE',
                message: 'Too far from dropped item.',
              });
              return;
            }
            delete ws.droppedItems[pickupId];
            ws.collectedPickups[pickupId] = session.playerId;
            if (drop.itemId === 'arrow') {
              auth.ammoCount += drop.count;
            } else if (ALLOWED_WEAPON_IDS.has(drop.itemId)) {
              const grantCount = Math.min(4, Math.max(1, drop.count));
              for (let c = 0; c < grantCount; c++) {
                auth.inventoryItemIds.push(drop.itemId);
              }
            }
            await this.persist();
            this.broadcast('GAME_EVENT', session.playerId, {
              event: 'ITEM_PICKED_UP',
              data: {
                pickupId,
                itemId: drop.itemId,
                count: drop.count,
                isPlayerDrop: true,
                pickedUpBy: session.playerId,
                x: drop.x,
                y: drop.y,
                z: drop.z,
              },
            });
            break;
          }

          // Static world pickup or herb (reject already-claimed or fabricated drop_ IDs)
          if (ws.collectedPickups[pickupId] || pickupId.startsWith('drop_')) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'ALREADY_COLLECTED',
              message: 'Item has already been collected.',
            });
            return;
          }
          const px = typeof eventData.x === 'number' ? eventData.x : auth.lastX;
          const pz = typeof eventData.z === 'number' ? eventData.z : auth.lastZ;
          if (Math.hypot(px - auth.lastX, pz - auth.lastZ) > 9.5) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'OUT_OF_RANGE',
              message: 'Too far from item.',
            });
            return;
          }
          const itemId =
            typeof eventData.itemId === 'string'
              ? eventData.itemId.trim().slice(0, 32)
              : 'herb';
          if (ALLOWED_WEAPON_IDS.has(itemId)) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'FORBIDDEN_ITEM_GRANT',
              message: 'Weapons cannot be fabricated via untracked static pickups.',
            });
            return;
          }
          const count =
            typeof eventData.count === 'number'
              ? Math.max(1, Math.min(6, Math.round(eventData.count)))
              : 1;
          ws.collectedPickups[pickupId] = session.playerId;
          if (itemId === 'arrow') {
            auth.ammoCount = Math.min(240, auth.ammoCount + count);
          }
          await this.persist();
          this.broadcast('GAME_EVENT', session.playerId, {
            event: 'ITEM_PICKED_UP',
            data: {
              pickupId,
              itemId,
              count,
              isPlayerDrop: false,
              pickedUpBy: session.playerId,
              x: px,
              y: typeof eventData.y === 'number' ? eventData.y : auth.lastY,
              z: pz,
            },
          });
          break;
        }

        if (eventName === 'DOOR_OPENED' || eventName === 'DOOR_CLOSED') {
          if (auth.isDead) return;
          const doorId = typeof eventData.doorId === 'string' ? eventData.doorId : '';
          if (!doorId) return;
          const dx = typeof eventData.x === 'number' ? eventData.x : auth.lastX;
          const dz = typeof eventData.z === 'number' ? eventData.z : auth.lastZ;
          if (Math.hypot(dx - auth.lastX, dz - auth.lastZ) > 8.0) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'OUT_OF_RANGE',
              message: 'Too far from door.',
            });
            return;
          }
          const ws = this.ensureWorldSync();
          ws.doors[doorId] = eventName === 'DOOR_OPENED';
          await this.persist();
          this.broadcast('GAME_EVENT', session.playerId, {
            event: eventName,
            data: {
              doorId,
              isOpen: eventName === 'DOOR_OPENED',
              playerId: session.playerId,
              x: dx,
              z: dz,
            },
          });
          break;
        }

        if (eventName === 'BED_PLACED') {
          if (auth.isDead) return;
          const bedId = typeof eventData.bedId === 'string' ? eventData.bedId : '';
          if (!bedId) return;
          const bx = typeof eventData.x === 'number' ? eventData.x : auth.lastX;
          const by = typeof eventData.y === 'number' ? eventData.y : auth.lastY;
          const bz = typeof eventData.z === 'number' ? eventData.z : auth.lastZ;
          const yaw = typeof eventData.yaw === 'number' ? eventData.yaw : 0;
          if (Math.hypot(bx - auth.lastX, bz - auth.lastZ) > 9.0) {
            return;
          }
          const ws = this.ensureWorldSync();
          ws.placedBeds[bedId] = {
            id: bedId,
            ownerId: session.playerId,
            x: bx,
            y: by,
            z: bz,
            yaw,
          };
          await this.persist();
          this.broadcast('GAME_EVENT', session.playerId, {
            event: 'BED_PLACED',
            data: { bedId, x: bx, y: by, z: bz, yaw, ownerId: session.playerId },
          });
          break;
        }

        if (eventName === 'BED_USED') {
          if (auth.isDead) return;
          if (now - auth.lastBedUsedAtMs < BED_HEAL_COOLDOWN_MS) {
            this.sendToSocket(session.ws, 'ERROR', session.playerId, {
              code: 'BED_COOLDOWN',
              message: 'Wait a moment before resting in a bed again.',
            });
            return;
          }
          const bedId = typeof eventData.bedId === 'string' ? eventData.bedId : '';
          const bx = typeof eventData.x === 'number' ? eventData.x : auth.lastX;
          const bz = typeof eventData.z === 'number' ? eventData.z : auth.lastZ;
          if (Math.hypot(bx - auth.lastX, bz - auth.lastZ) > 8.5) return;
          const ws = this.ensureWorldSync();
          auth.lastBedUsedAtMs = now;
          const wtBefore = this.materializeWorldTime(now);
          const wtRef = this.ensureWorldTime(now);
          const prevBedDay = wtRef.dayCount;
          if (wtBefore.worldHours > 6.5) {
            wtRef.dayCount += 1;
          }
          wtRef.worldHours = 6.5;
          wtRef.anchorServerMs = now;
          ws.worldHours = 6.5;
          auth.health = auth.maxHealth;
          player.health = auth.health;
          this.touchRoomActivity(now);
          await this.persist();
          this.broadcast<AuthoritativePlayerVitals>('PLAYER_VITALS', session.playerId, {
            playerId: session.playerId,
            networkEntityId: auth.networkEntityId,
            health: auth.health,
            maxHealth: auth.maxHealth,
            isDead: false,
            reviveAtMs: null,
          });
          this.broadcast('WORLD_TIME_CHANGED', session.playerId, {
            worldTime: { ...wtRef },
            serverTimestamp: now,
            updatedBy: session.playerId,
          });
          if (wtRef.dayCount !== prevBedDay) {
            this.broadcast('WORLD_DAY_CHANGED', session.playerId, {
              dayCount: wtRef.dayCount,
              worldHours: wtRef.worldHours,
              serverTimestamp: now,
              updatedBy: session.playerId,
            });
          }
          this.broadcast('GAME_EVENT', session.playerId, {
            event: 'BED_USED',
            data: {
              bedId,
              newWorldHours: 6.5,
              usedBy: session.playerId,
              x: bx,
              z: bz,
            },
          });
          break;
        }

        if (eventName === 'QUEST_UPDATED') {
          const questId =
            typeof eventData.questId === 'string'
              ? eventData.questId.trim().slice(0, 64)
              : '';
          const rawStatus =
            typeof eventData.status === 'string' ? eventData.status : 'active';
          const status = VALID_QUEST_STATUSES.has(rawStatus) ? rawStatus : 'active';
          if (!questId) return;
          const stepIndex =
            typeof eventData.stepIndex === 'number' && Number.isFinite(eventData.stepIndex)
              ? Math.max(0, Math.min(50, Math.round(eventData.stepIndex)))
              : 0;
          const ws = this.ensureWorldSync();
          const questsByPlayer = ws.questsByPlayer!;
          if (!questsByPlayer[session.playerId]) {
            questsByPlayer[session.playerId] = {};
          }
          const playerQuests = questsByPlayer[session.playerId];
          const prevQuest = playerQuests[questId];
          playerQuests[questId] = {
            questId,
            status,
            stepIndex,
            updatedBy: session.playerId,
            updatedAtMs: now,
          };
          this.touchRoomActivity(now);
          await this.persist();
          if (status === 'completed' && prevQuest?.status !== 'completed') {
            this.grantProgression(session.playerId, 45, 30, 'quest_completed');
            await this.syncProfileEvent(player.publicProfileId, {
              statsDelta: { questsCompleted: 1, xpGained: 45 },
            });
          }
          this.broadcast('GAME_EVENT', session.playerId, {
            event: 'QUEST_UPDATED',
            data: {
              questId,
              status,
              stepIndex,
              updatedBy: session.playerId,
            },
          });
          break;
        }

        if (eventName === 'WORLD_EVENT') {
          const kind = typeof eventData.kind === 'string' ? eventData.kind : '';
          const ws = this.ensureWorldSync();
          if (kind === 'landmark_discovered' && typeof eventData.landmarkId === 'string') {
            const landmarkId = eventData.landmarkId.trim().slice(0, 64);
            if (
              landmarkId &&
              ws.discoveredLandmarks.length < 100 &&
              !ws.discoveredLandmarks.includes(landmarkId)
            ) {
              ws.discoveredLandmarks.push(landmarkId);
              await this.persist();
            }
          } else if (kind === 'weather_changed' && typeof eventData.weather === 'string') {
            const perm = this.room.gameState.worldSettingsPermission ?? 'HOST_ONLY';
            if (this.room.hostId !== session.playerId && perm !== 'ALL_PLAYERS') {
              return;
            }
            const nextW = eventData.weather.slice(0, 24) as WorldWeatherState;
            const wwRef = this.ensureWorldWeather(now);
            wwRef.currentState = nextW;
            wwRef.targetState = nextW;
            wwRef.startMs = now;
            wwRef.endMs = now + wwRef.durationMs;
            ws.weather = nextW;
          } else if (kind === 'item_crafted' && typeof eventData.recipeId === 'string') {
            const lastCraft = this.lastAmmoCraftAtByPlayer.get(session.playerId) ?? 0;
            if (now - lastCraft < 500) {
              this.sendToSocket(session.ws, 'ERROR', session.playerId, {
                code: 'RATE_LIMITED',
                message: 'Crafting too quickly.',
              });
              return;
            }
            const yieldSpec = SERVER_CRAFTABLE_YIELDS[eventData.recipeId];
            if (yieldSpec) {
              this.lastAmmoCraftAtByPlayer.set(session.playerId, now);
              if (yieldSpec.itemId === 'arrow') {
                auth.ammoCount = Math.min(240, auth.ammoCount + yieldSpec.count);
              } else if (
                ALLOWED_WEAPON_IDS.has(yieldSpec.itemId) &&
                !auth.inventoryItemIds.includes(yieldSpec.itemId)
              ) {
                auth.inventoryItemIds.push(yieldSpec.itemId);
              }
              await this.persist();
            }
          } else if (kind === 'ammo_crafted' && typeof eventData.count === 'number') {
            const lastCraft = this.lastAmmoCraftAtByPlayer.get(session.playerId) ?? 0;
            if (now - lastCraft < 1200) {
              this.sendToSocket(session.ws, 'ERROR', session.playerId, {
                code: 'RATE_LIMITED',
                message: 'Crafting ammo too quickly.',
              });
              return;
            }
            this.lastAmmoCraftAtByPlayer.set(session.playerId, now);
            auth.ammoCount = Math.min(
              240,
              auth.ammoCount + Math.max(0, Math.min(12, Math.round(eventData.count))),
            );
            await this.persist();
          }
          this.broadcast('GAME_EVENT', session.playerId, {
            event: 'WORLD_EVENT',
            data: {
              ...eventData,
              emittedBy: session.playerId,
            },
          });
          break;
        }

        this.broadcast('GAME_EVENT', session.playerId, msg.gameEvent);
        break;
      }
    }
  }

  private sendErrorToPlayer(playerId: string, code: string, message: string): void {
    const sock = Array.from(this.sessions.values()).find(
      (s) => s.playerId === playerId,
    );
    if (sock) {
      this.sendToSocket(sock.ws, 'ERROR', playerId, { code, message });
    }
  }

  private async applyAuthoritativeDamage(
    attackerId: string,
    targetKind: string,
    targetId: string,
    _archetype: string,
    damage: number,
    isCritOrHeadshot: boolean,
    hitX: number,
    hitY: number,
    hitZ: number,
    now: number,
  ): Promise<boolean> {
    if (!this.room) return false;

    if (targetKind === 'player') {
      if (targetId === attackerId) {
        return false;
      }
      if (!this.room.gameState.worldSettings?.pvpEnabled) {
        return false;
      }
      const targetPlayer = this.room.players[targetId];
      const targetAuth = this.room.authoritativePlayers?.[targetId];
      if (!targetPlayer || !targetAuth || targetAuth.isDead) {
        return false;
      }
      if (
        Math.hypot(hitX - targetAuth.lastX, hitZ - targetAuth.lastZ) > 6.5 ||
        Math.abs(hitY - targetAuth.lastY) > 5.5
      ) {
        this.sendErrorToPlayer(
          attackerId,
          'TARGET_POSITION_MISMATCH',
          'Hit rejected: target player is not at that location.',
        );
        return false;
      }
      targetAuth.health = Math.max(0, targetAuth.health - damage);
      targetAuth.lastDamageAtMs = now;
      if (targetAuth.health <= 0) {
        targetAuth.isDead = true;
        targetAuth.reviveAtMs = now + 2000;
      }
      targetPlayer.health = targetAuth.health;
      targetPlayer.isDead = targetAuth.isDead;
      this.broadcast<AuthoritativePlayerVitals>('PLAYER_VITALS', targetId, {
        playerId: targetId,
        networkEntityId: targetAuth.networkEntityId,
        health: targetAuth.health,
        maxHealth: targetAuth.maxHealth,
        isDead: targetAuth.isDead,
        reviveAtMs: targetAuth.reviveAtMs,
      });
      if (targetAuth.isDead) {
        this.broadcast('GAME_EVENT', attackerId, {
          event: 'PLAYER_DIED',
          data: {
            playerId: targetId,
            killerId: attackerId,
            displayName: targetPlayer.displayName,
            x: hitX,
            y: hitY,
            z: hitZ,
          },
        });
      }
      return true;
    }

    if (targetKind !== 'npc' && targetKind !== 'animal' && targetKind !== 'enemy') {
      return false;
    }

    const ws = this.ensureWorldSync();
    const entity = ws.entities[targetId];
    if (!entity) {
      this.sendErrorToPlayer(
        attackerId,
        'TARGET_NOT_FOUND',
        'Hit rejected: target entity is not registered on the room server.',
      );
      return false;
    }
    if (entity.kind !== targetKind) {
      this.sendErrorToPlayer(
        attackerId,
        'INVALID_TARGET_KIND',
        'Hit rejected: target kind does not match registered entity.',
      );
      return false;
    }
    if (
      Math.hypot(hitX - entity.x, hitZ - entity.z) > 6.5 ||
      Math.abs(hitY - entity.y) > 5.5
    ) {
      this.sendErrorToPlayer(
        attackerId,
        'TARGET_POSITION_MISMATCH',
        'Hit rejected: target is not at that location.',
      );
      return false;
    }

    if (entity.isDead) {
      return false;
    }

    entity.hp = Math.max(0, entity.hp - damage);
    const killed = entity.hp <= 0;
    if (killed) {
      entity.isDead = true;
      entity.diedAtMs = now;
      await this.persist();
    }

    const damagedEvent =
      targetKind === 'npc'
        ? 'NPC_DAMAGED'
        : targetKind === 'animal'
          ? 'ANIMAL_DAMAGED'
          : 'ENEMY_DAMAGED';
    const diedEvent =
      targetKind === 'npc'
        ? 'NPC_DIED'
        : targetKind === 'animal'
          ? 'ANIMAL_DIED'
          : 'ENEMY_DIED';

    this.broadcast('GAME_EVENT', attackerId, {
      event: damagedEvent,
      data: {
        targetId,
        archetype: entity.archetype,
        attackerId,
        damage,
        hp: entity.hp,
        maxHp: entity.maxHp,
        isCrit: isCritOrHeadshot,
        x: hitX,
        y: hitY,
        z: hitZ,
      },
    });

    if (killed) {
      const attackerPlayer = this.room.players[attackerId];
      if (targetKind === 'enemy') {
        const reward = ENEMY_REWARDS[entity.archetype] ?? { xp: 25, coins: 12 };
        this.grantProgression(attackerId, reward.xp, reward.coins, 'enemy_killed');
        await this.syncProfileEvent(attackerPlayer?.publicProfileId, {
          statsDelta: { enemiesDefeated: 1, xpGained: reward.xp },
        });
      } else if (targetKind === 'animal') {
        this.grantProgression(attackerId, 12, 0, 'animal_hunted');
        await this.syncProfileEvent(attackerPlayer?.publicProfileId, {
          statsDelta: { animalsDefeated: 1, xpGained: 12 },
        });
      }
      this.broadcast('GAME_EVENT', attackerId, {
        event: diedEvent,
        data: {
          targetId,
          archetype: entity.archetype,
          killerId: attackerId,
          x: entity.x,
          y: entity.y,
          z: entity.z,
        },
      });
    }
    return true;
  }

  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    if (!this.room) {
      return Response.json({ ok: false, error: 'ROOM_NOT_FOUND' }, { status: 404 });
    }
    if (await this.expireIfNeeded(Date.now())) {
      return Response.json(
        { ok: false, error: 'ROOM_EXPIRED', message: 'ROOM EXPIRED' },
        { status: 410 },
      );
    }

    const url = new URL(request.url);
    const playerId = url.searchParams.get('playerId') ?? '';
    const token = url.searchParams.get('token') ?? '';

    if (!isValidPlayerId(playerId) || !token) {
      return Response.json(
        { ok: false, error: 'MISSING_PLAYER_CREDENTIALS' },
        { status: 401 },
      );
    }

    const expectedToken = this.room.playerTokens[playerId];
    if (!expectedToken || !timingSafeEqualHex(expectedToken, token)) {
      return Response.json(
        { ok: false, error: 'INVALID_SESSION_TOKEN' },
        { status: 403 },
      );
    }

    if (!this.room.players[playerId]) {
      return Response.json(
        { ok: false, error: 'PLAYER_NOT_IN_ROOM' },
        { status: 403 },
      );
    }

    const clientIp =
      request.headers.get('X-Client-IP') ??
      request.headers.get('CF-Connecting-IP') ??
      'unknown';

    // Per-IP active WebSocket connection limit per room (excluding player's own superseded socket)
    let activeFromIp = 0;
    let activeTotalOther = 0;
    for (const sess of this.sessions.values()) {
      if (sess.playerId === playerId) continue;
      activeTotalOther += 1;
      if (sess.clientIp === clientIp) {
        activeFromIp += 1;
      }
    }
    if (activeFromIp >= MAX_CONNECTIONS_PER_IP_PER_ROOM) {
      return Response.json(
        {
          ok: false,
          error: 'CONNECTION_LIMIT_EXCEEDED',
          message: 'Too many simultaneous connections from this IP address.',
        },
        { status: 429 },
      );
    }
    if (activeTotalOther >= this.room.maxPlayers) {
      return Response.json(
        { ok: false, error: 'ROOM_FULL', message: 'Room connection limit reached.' },
        { status: 409 },
      );
    }

    // Per-player WebSocket reconnect flood guard (max 15 upgrades / 30s)
    const nowHandshake = Date.now();
    const recentHandshakes = (this.wsHandshakeTimestamps.get(playerId) ?? []).filter(
      (ts) => nowHandshake - ts < 30_000,
    );
    if (recentHandshakes.length >= 15) {
      return Response.json(
        { ok: false, error: 'RATE_LIMITED', message: 'Too many reconnect handshakes.' },
        { status: 429 },
      );
    }
    recentHandshakes.push(nowHandshake);
    this.wsHandshakeTimestamps.set(playerId, recentHandshakes);

    // Supersede any stale socket for the same playerId cleanly without deleting membership
    for (const [sock, sess] of Array.from(this.sessions.entries())) {
      if (sess.playerId === playerId) {
        sess.cleanDisconnect = true;
        this.sessions.delete(sock);
        try {
          sock.close(4002, 'Superseded by reconnected socket');
        } catch {
          // Ignore close errors
        }
      }
    }

    const now = Date.now();
    const playerRecord = this.room.players[playerId];
    const wasDisconnected =
      playerRecord.connectionQuality === 'disconnected' ||
      Boolean(playerRecord.disconnectedAt);
    playerRecord.disconnectedAt = null;
    playerRecord.lastSeenAt = now;
    playerRecord.connectionQuality = 'good';

    const [clientSocket, serverSocket] = createCfWebSocketPair();
    serverSocket.accept();
    const session = this.attachSocketHandlers(serverSocket, playerId, clientIp);

    this.sendToSocket(serverSocket, 'CONNECT', playerId, {
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      roomId: this.room.roomId,
      playerId,
      reconnected: wasDisconnected,
    });
    this.sendToSocket(
      serverSocket,
      'ROOM_STATE',
      playerId,
      this.buildSnapshot(),
    );
    if (this.room.chatMessages && this.room.chatMessages.length > 0) {
      this.sendToSocket<ChatHistoryPayload>(serverSocket, 'CHAT_HISTORY', playerId, {
        messages: this.room.chatMessages.slice(-CHAT_HISTORY_LIMIT),
      });
    }
    if (this.room.status === 'in-game') {
      const auth = this.ensureAuthoritativePlayer(playerId);
      this.sendToSocket<AuthoritativePlayerVitals>(
        serverSocket,
        'PLAYER_VITALS',
        playerId,
        {
          playerId,
          networkEntityId: auth.networkEntityId,
          health: auth.health,
          maxHealth: auth.maxHealth,
          isDead: auth.isDead,
          reviveAtMs: auth.reviveAtMs,
        },
      );
      for (const peer of Object.values(this.room.players)) {
        if (peer.playerId !== playerId && peer.state) {
          this.sendToSocket<PlayerNetworkState>(
            serverSocket,
            'PLAYER_STATE',
            peer.playerId,
            peer.state,
          );
        }
      }
      this.sendToSocket(
        serverSocket,
        'WORLD_SNAPSHOT',
        playerId,
        this.buildWorldSnapshot(playerId),
      );
      this.sendToSocket<AuthoritativeProgressionState>(
        serverSocket,
        'PROGRESSION_UPDATED',
        playerId,
        {
          playerId,
          coins: auth.coins,
          xp: auth.xp,
          level: auth.level,
          xpToNextLevel: auth.level * 100,
          reason: 'reconnect',
        },
      );
    }

    if (wasDisconnected) {
      await this.persist();
      await this.syncDirectory();
      this.broadcastRoomState();
    }
    await this.scheduleLifecycleSweep();
    this.sendServerPing(session);

    return makeWebSocketUpgradeResponse(clientSocket);
  }

  public async fetch(request: Request): Promise<Response> {
    await this.ensureLoaded();
    const url = new URL(request.url);

    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }

    if (request.method === 'POST' && url.pathname === '/init') {
      return this.handleCreateRoom(request);
    }

    if (request.method === 'POST' && url.pathname === '/join') {
      return this.handleIssueJoinTicket(request);
    }

    if (request.method === 'POST' && url.pathname === '/expire-sweep') {
      const body = (await request.json().catch(() => null)) as { nowMs?: unknown } | null;
      const nowMs =
        typeof body?.nowMs === 'number' && Number.isFinite(body.nowMs)
          ? body.nowMs
          : Date.now();
      const expired = await this.expireIfNeeded(nowMs);
      return Response.json({
        ok: true,
        expired,
        status: this.room?.status ?? 'missing',
      });
    }

    if (request.method === 'POST' && url.pathname === '/verify-member') {
      if (!this.room) {
        return Response.json(
          { ok: false, error: 'ROOM_NOT_FOUND', message: 'ROOM NOT FOUND' },
          { status: 404 },
        );
      }
      if (await this.expireIfNeeded(Date.now())) {
        return Response.json(
          { ok: false, error: 'ROOM_EXPIRED', message: 'ROOM EXPIRED' },
          { status: 410 },
        );
      }
      const body = (await request.json().catch(() => null)) as {
        playerId?: unknown;
        sessionToken?: unknown;
      } | null;
      const pid = typeof body?.playerId === 'string' ? body.playerId.trim() : '';
      const tok = typeof body?.sessionToken === 'string' ? body.sessionToken.trim() : '';
      const expected = pid ? this.room.playerTokens[pid] : undefined;
      const player = pid ? this.room.players[pid] : undefined;
      if (!pid || !tok || !expected || !player || !timingSafeEqualHex(expected, tok)) {
        return Response.json(
          { ok: false, error: 'UNAUTHORIZED_INVITE', message: 'Invalid room member session.' },
          { status: 403 },
        );
      }
      return Response.json({
        ok: true,
        displayName: player.displayName,
        ...(player.publicProfileId ? { publicProfileId: player.publicProfileId } : {}),
        ...(player.playerTag ? { playerTag: player.playerTag } : {}),
        ...(player.avatar ? { avatar: player.avatar } : {}),
        room: this.buildSnapshot(),
      });
    }

    if (request.method === 'GET' && url.pathname === '/verify') {
      if (!this.room) {
        return Response.json(
          { ok: false, error: 'ROOM_NOT_FOUND', message: 'ROOM NOT FOUND' },
          { status: 404 },
        );
      }
      if (await this.expireIfNeeded(Date.now())) {
        return Response.json(
          { ok: false, error: 'ROOM_EXPIRED', message: 'ROOM EXPIRED' },
          { status: 410 },
        );
      }
      if (this.room.gameState.locked || this.room.status !== 'waiting') {
        return Response.json(
          {
            ok: false,
            error: 'GAME_ALREADY_STARTED',
            message: 'GAME ALREADY STARTED',
            room: this.buildSnapshot(),
          },
          { status: 409 },
        );
      }
      if (Object.keys(this.room.players).length >= this.room.maxPlayers) {
        return Response.json(
          {
            ok: false,
            error: 'ROOM_FULL',
            message: 'ROOM IS FULL',
            room: this.buildSnapshot(),
          },
          { status: 409 },
        );
      }
      return Response.json({ ok: true, room: this.buildSnapshot() });
    }

    if (request.method === 'GET' && url.pathname === '/state') {
      if (!this.room) {
        return Response.json(
          { ok: false, error: 'ROOM_NOT_FOUND', message: 'ROOM NOT FOUND' },
          { status: 404 },
        );
      }
      if (await this.expireIfNeeded(Date.now())) {
        return Response.json(
          { ok: false, error: 'ROOM_EXPIRED', message: 'ROOM EXPIRED' },
          { status: 410 },
        );
      }
      return Response.json({ ok: true, room: this.buildSnapshot() });
    }

    return Response.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  }
}
