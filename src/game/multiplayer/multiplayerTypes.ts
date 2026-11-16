import type {
  AuthoritativePlayerVitals,
  AuthoritativeRoomSnapshot,
  AuthoritativeWorldSettings,
  ChatHistoryPayload,
  ClientMessageType,
  ConnectionQuality,
  EntitySyncBatchPayload,
  GameEventPayload,
  NetworkEnvelope,
  PlayerNetworkState,
  PlayerReportPayload,
  PlayerReportReason,
  PositionCorrectionPayload,
  ReportAckPayload,
  RoomChatMessage,
  RoomPrivacy,
  RoomStatus,
  RoomWorldSnapshotPayload,
} from '../../../shared/multiplayerProtocol';
import { getConnectionQuality } from '../../../shared/multiplayerProtocol';
import type { AvatarConfig } from '../../../shared/profileTypes';
import type { DifficultyLevel, WorldType } from '../save/saveTypes';

export type {
  AuthoritativePlayerVitals,
  AuthoritativeRoomSnapshot,
  AuthoritativeWorldSettings,
  ChatHistoryPayload,
  ClientMessageType,
  ConnectionQuality,
  EntitySyncBatchPayload,
  GameEventPayload,
  NetworkEnvelope,
  PlayerNetworkState,
  PlayerReportPayload,
  PlayerReportReason,
  PositionCorrectionPayload,
  ReportAckPayload,
  RoomChatMessage,
  RoomPrivacy,
  RoomStatus,
  RoomWorldSnapshotPayload,
};
export { getConnectionQuality };

export type MultiplayerTransportProtocol = 'cloudflare-durable-object-ws';

export type MultiplayerConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type FriendPresenceStatus = 'online' | 'in-room' | 'offline';

export interface MultiplayerPlayer {
  id: string;
  publicProfileId?: string;
  networkEntityId?: string;
  displayName: string;
  playerTag?: string;
  isHost: boolean;
  isReady: boolean;
  isLocal?: boolean;
  joinedAt: number;
  avatarColor: string;
  avatar?: AvatarConfig;
  pingMs: number | null;
  connectionQuality: ConnectionQuality;
  health?: number;
  maxHealth?: number;
  isDead?: boolean;
  state?: PlayerNetworkState;
}

export interface MultiplayerRoomSummary {
  roomId: string;
  roomCode: string;
  roomName: string;
  hostName: string;
  worldName: string;
  worldType: WorldType;
  difficulty: DifficultyLevel;
  maxPlayers: number;
  playerCount: number;
  privacy: RoomPrivacy;
  isPrivate?: boolean;
  allowFriends?: boolean;
  requireAllReady?: boolean;
  locked?: boolean;
  status: RoomStatus;
  hasPassword: boolean;
  region?: string;
}

export interface MultiplayerRoomState extends MultiplayerRoomSummary {
  hostId: string;
  seed: number;
  isPrivate: boolean;
  allowFriends: boolean;
  requireAllReady: boolean;
  worldSettings: AuthoritativeWorldSettings;
  locked: boolean;
  players: MultiplayerPlayer[];
  createdAt: number;
  durableObjectId?: string;
}

export interface MultiplayerGameStartInfo {
  roomId: string;
  roomCode: string;
  roomName: string;
  worldName: string;
  seed: number;
  worldType: WorldType;
  difficulty: DifficultyLevel;
  worldSettings: AuthoritativeWorldSettings;
  requireAllReady: boolean;
  isHost: boolean;
  localPlayerId: string;
  players: MultiplayerPlayer[];
}

export interface MultiplayerFriend {
  id: string;
  displayName: string;
  status: FriendPresenceStatus;
  currentRoomCode?: string;
}

export interface SocialModerationEntry {
  playerId: string;
  displayName: string;
  updatedAt: number;
}

export interface PlayerProfileSummary {
  playerId: string;
  publicProfileId?: string;
  displayName: string;
  playerTag?: string;
  avatarColor: string;
  avatar?: AvatarConfig;
  isHost: boolean;
  isLocal: boolean;
  isReady: boolean;
  joinedAt: number;
  pingMs: number | null;
  connectionQuality: ConnectionQuality;
  health?: number;
  maxHealth?: number;
  isDead?: boolean;
  roomName?: string;
  isFriend: boolean;
  isMuted: boolean;
  isBlocked: boolean;
  accountSystemAvailable: boolean;
}

/**
 * Decoupled social/friends interface so persistent account-backed friends storage
 * can be dropped in later without altering WebSocket/room networking code.
 */
export interface ISocialFriendsAdapter {
  readonly mode: 'local-ephemeral' | 'account-backed';
  getFriends(): Promise<MultiplayerFriend[]>;
  addFriend(displayName: string): Promise<MultiplayerFriend[]>;
  removeFriend(friendId: string): Promise<MultiplayerFriend[]>;
  isFriendName(displayName: string): boolean;
  getMutedPlayers(): SocialModerationEntry[];
  isMuted(playerId: string, displayName?: string): boolean;
  mutePlayer(playerId: string, displayName: string): SocialModerationEntry[];
  unmutePlayer(playerId: string, displayName?: string): SocialModerationEntry[];
  getBlockedPlayers(): SocialModerationEntry[];
  isBlocked(playerId: string, displayName?: string): boolean;
  blockPlayer(playerId: string, displayName: string): SocialModerationEntry[];
  unblockPlayer(playerId: string, displayName?: string): SocialModerationEntry[];
  buildProfileSummary(player: MultiplayerPlayer, roomName?: string): PlayerProfileSummary;
}

export interface MultiplayerInvite {
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
  worldType: WorldType;
  playerCount: number;
  maxPlayers: number;
  sentAt: number;
}

export interface CreateRoomOptions {
  roomName: string;
  playerName: string;
  worldName: string;
  worldType: WorldType;
  difficulty: DifficultyLevel;
  maxPlayers: number;
  privacy: RoomPrivacy;
  isPrivate?: boolean;
  allowFriends?: boolean;
  requireAllReady?: boolean;
  password?: string;
  region?: string;
}

export interface JoinRoomOptions {
  roomCodeOrId: string;
  playerName: string;
  password?: string;
}

export interface MultiplayerConnectOptions {
  roomId: string;
  playerId: string;
  sessionToken: string;
  wsPath?: string;
}

export interface MultiplayerServiceConfig {
  protocol: MultiplayerTransportProtocol;
  workerBaseUrl: string | null;
}

export type MultiplayerJoinErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'GAME_ALREADY_STARTED'
  | 'PASSWORD_REQUIRED'
  | 'INVALID_PASSWORD'
  | 'UNKNOWN';

export class MultiplayerJoinError extends Error {
  public readonly code: MultiplayerJoinErrorCode;

  constructor(code: MultiplayerJoinErrorCode, message?: string) {
    super(message || code);
    this.name = 'MultiplayerJoinError';
    this.code = code;
  }
}

export type MultiplayerServiceEvent =
  | {
      type: 'connection-changed';
      state: MultiplayerConnectionState;
      attempt?: number;
      maxAttempts?: number;
    }
  | { type: 'room-updated'; room: MultiplayerRoomState | null }
  | { type: 'player-state'; playerId: string; state: PlayerNetworkState }
  | { type: 'player-vitals'; vitals: AuthoritativePlayerVitals }
  | { type: 'position-correction'; correction: PositionCorrectionPayload }
  | { type: 'game-event'; playerId: string; payload: GameEventPayload }
  | { type: 'entity-sync'; playerId: string; payload: EntitySyncBatchPayload }
  | { type: 'world-snapshot'; snapshot: RoomWorldSnapshotPayload }
  | {
      type: 'host-transferred';
      previousHostId: string;
      newHostId: string;
      newHostName: string;
    }
  | {
      type: 'player-kicked';
      targetPlayerId: string;
      targetDisplayName: string;
      isLocalTarget: boolean;
    }
  | { type: 'room-closed'; reason: string }
  | { type: 'game-started'; info: MultiplayerGameStartInfo }
  | { type: 'invites-updated'; invites: MultiplayerInvite[] }
  | { type: 'invite-received'; invite: MultiplayerInvite }
  | { type: 'chat-message'; message: RoomChatMessage }
  | { type: 'chat-history'; messages: RoomChatMessage[] }
  | { type: 'report-submitted'; ack: ReportAckPayload }
  | {
      type: 'social-updated';
      muted: SocialModerationEntry[];
      blocked: SocialModerationEntry[];
    }
  | { type: 'error'; code?: string; message: string };

export class MultiplayerServiceUnavailableError extends Error {
  public readonly code = 'MULTIPLAYER_BACKEND_NOT_CONNECTED';

  constructor(message = 'Online multiplayer server is not connected yet.') {
    super(message);
    this.name = 'MultiplayerServiceUnavailableError';
  }
}

export interface SendChatResult {
  ok: boolean;
  code?: 'NOT_CONNECTED' | 'EMPTY_CHAT_MESSAGE' | 'CHAT_TOO_LONG' | 'CHAT_SPAM_LIMITED' | 'CHAT_DUPLICATE_SPAM';
}

export interface IMultiplayerService {
  readonly protocol: MultiplayerTransportProtocol;
  connect(target?: MultiplayerConnectOptions | string): Promise<void>;
  disconnect(): void;
  retryReconnect(): Promise<void>;
  getReconnectAttempt(): number;
  getMaxReconnectAttempts(): number;
  getConnectionState(): MultiplayerConnectionState;
  getLatencyMs(): number | null;
  getConnectionQuality(): ConnectionQuality;
  getLocalPlayerId(): string | null;
  isConfigured(): boolean;
  getConfig(): MultiplayerServiceConfig;
  getRoomState(): MultiplayerRoomState | null;
  getCurrentRoom(): MultiplayerRoomState | null;
  getAuthoritativeGameStartInfo(): MultiplayerGameStartInfo | null;
  listPublicRooms(): Promise<MultiplayerRoomSummary[]>;
  verifyRoom(roomCodeOrId: string): Promise<MultiplayerRoomSummary>;
  createRoom(options: CreateRoomOptions): Promise<MultiplayerRoomState>;
  joinRoom(options: JoinRoomOptions): Promise<MultiplayerRoomState>;
  quickJoin(playerName: string): Promise<MultiplayerRoomState>;
  leaveRoom(): Promise<void>;
  kickPlayer(targetPlayerId: string): Promise<void>;
  transferHost(targetPlayerId: string): Promise<void>;
  updateRoomSettings(settings: { requireAllReady?: boolean }): Promise<void>;
  closeRoom(): Promise<void>;
  sendMessage<T = unknown>(type: ClientMessageType, payload?: T): boolean;
  sendPlayerState(state: PlayerNetworkState, immediate?: boolean): boolean;
  sendEntitySync?(payload: EntitySyncBatchPayload): boolean;
  sendGameEvent(
    event: string,
    data?: Record<string, string | number | boolean | null>,
  ): boolean;
  sendChatMessage(text: string): SendChatResult;
  getChatMessages(): RoomChatMessage[];
  reportPlayer(
    targetPlayerId: string,
    reason: PlayerReportReason,
    details?: string,
  ): boolean;
  mutePlayer(playerId: string, displayName: string): SocialModerationEntry[];
  unmutePlayer(playerId: string, displayName?: string): SocialModerationEntry[];
  isPlayerMuted(playerId: string, displayName?: string): boolean;
  getMutedPlayers(): SocialModerationEntry[];
  blockPlayer(playerId: string, displayName: string): SocialModerationEntry[];
  unblockPlayer(playerId: string, displayName?: string): SocialModerationEntry[];
  isPlayerBlocked(playerId: string, displayName?: string): boolean;
  getBlockedPlayers(): SocialModerationEntry[];
  getPlayerProfileSummary(playerId: string): PlayerProfileSummary | null;
  getSocialAdapter(): ISocialFriendsAdapter;
  setReady(ready: boolean): Promise<MultiplayerRoomState | null>;
  startGame(): Promise<void>;
  startMatch(): Promise<void>;
  getFriends(): Promise<MultiplayerFriend[]>;
  addFriend(displayName: string): Promise<MultiplayerFriend[]>;
  removeFriend(friendId: string): Promise<MultiplayerFriend[]>;
  sendInvite(targetPlayerName: string, toPublicProfileId?: string): Promise<MultiplayerInvite>;
  getInvites(playerName?: string): Promise<MultiplayerInvite[]>;
  acceptInvite(inviteId: string, playerName?: string): Promise<MultiplayerRoomState>;
  declineInvite(inviteId: string): Promise<void>;
  startInvitePolling(playerName: string): void;
  stopInvitePolling(): void;
  subscribe(listener: (event: MultiplayerServiceEvent) => void): () => void;
}
