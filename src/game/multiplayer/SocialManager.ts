import {
  sanitizeDisplayName,
  type ConnectionQuality,
} from '../../../shared/multiplayerProtocol';
import { ProfileManager } from '../profile/ProfileManager';
import type {
  ISocialFriendsAdapter,
  MultiplayerFriend,
  MultiplayerPlayer,
  PlayerProfileSummary,
  SocialModerationEntry,
} from './multiplayerTypes';

export const FRIENDS_STORAGE_KEY = 'woa_mp_friends_v1';
export const MUTED_PLAYERS_STORAGE_KEY = 'woa_mp_muted_v1';
export const BLOCKED_PLAYERS_STORAGE_KEY = 'woa_mp_blocked_v1';

export function normalizeSocialKey(value: string): string {
  return value.trim().toLowerCase();
}

function readStoredList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeStoredList<T>(key: string, items: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

/**
 * Modular social, mute, block, and local-friends provider.
 * Designed behind ISocialFriendsAdapter so a persistent account-backed friends service
 * can be swapped into MultiplayerService later without changing WebSocket networking code.
 */
export class LocalSocialProvider implements ISocialFriendsAdapter {
  public readonly mode = 'local-ephemeral' as const;

  public async getFriends(): Promise<MultiplayerFriend[]> {
    const parsed = readStoredList<MultiplayerFriend>(FRIENDS_STORAGE_KEY);
    return parsed
      .filter((f) => Boolean(f && typeof f.id === 'string' && typeof f.displayName === 'string'))
      .map((f) => ({
        id: f.id,
        displayName: sanitizeDisplayName(f.displayName),
        status: 'offline' as const,
      }));
  }

  public async addFriend(displayName: string): Promise<MultiplayerFriend[]> {
    const cleaned = sanitizeDisplayName(displayName, '');
    if (!cleaned) return this.getFriends();
    const existing = await this.getFriends();
    if (
      existing.some(
        (f) => normalizeSocialKey(f.displayName) === normalizeSocialKey(cleaned),
      )
    ) {
      return existing;
    }
    const bytes = new Uint8Array(6);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    }
    const suffix = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const next: MultiplayerFriend[] = [
      ...existing,
      {
        id: `fr_${Date.now().toString(36)}_${suffix}`,
        displayName: cleaned,
        status: 'offline',
      },
    ];
    writeStoredList(FRIENDS_STORAGE_KEY, next);
    return next;
  }

  public async removeFriend(friendId: string): Promise<MultiplayerFriend[]> {
    const existing = await this.getFriends();
    const next = existing.filter((f) => f.id !== friendId);
    writeStoredList(FRIENDS_STORAGE_KEY, next);
    return next;
  }

  public isFriendName(displayName: string): boolean {
    const key = normalizeSocialKey(displayName);
    if (!key) return false;
    const list = readStoredList<MultiplayerFriend>(FRIENDS_STORAGE_KEY);
    return list.some((f) => f?.displayName && normalizeSocialKey(f.displayName) === key);
  }

  public getMutedPlayers(): SocialModerationEntry[] {
    return this.readModerationList(MUTED_PLAYERS_STORAGE_KEY);
  }

  public isMuted(playerId: string, displayName?: string): boolean {
    return this.matchesEntry(this.getMutedPlayers(), playerId, displayName);
  }

  public mutePlayer(playerId: string, displayName: string): SocialModerationEntry[] {
    const cleanId = playerId.trim().slice(0, 64);
    const cleanName = sanitizeDisplayName(displayName);
    const list = this.getMutedPlayers();
    if (this.matchesEntry(list, cleanId, cleanName)) {
      return list;
    }
    const next: SocialModerationEntry[] = [
      ...list,
      {
        playerId: cleanId,
        displayName: cleanName,
        updatedAt: Date.now(),
      },
    ];
    writeStoredList(MUTED_PLAYERS_STORAGE_KEY, next);
    return next;
  }

  public unmutePlayer(playerId: string, displayName?: string): SocialModerationEntry[] {
    const list = this.getMutedPlayers();
    const next = list.filter(
      (entry) => !this.entryMatches(entry, playerId, displayName),
    );
    writeStoredList(MUTED_PLAYERS_STORAGE_KEY, next);
    return next;
  }

  public getBlockedPlayers(): SocialModerationEntry[] {
    return this.readModerationList(BLOCKED_PLAYERS_STORAGE_KEY);
  }

  public isBlocked(playerId: string, displayName?: string): boolean {
    return this.matchesEntry(this.getBlockedPlayers(), playerId, displayName);
  }

  public blockPlayer(playerId: string, displayName: string): SocialModerationEntry[] {
    const cleanId = playerId.trim().slice(0, 64);
    const cleanName = sanitizeDisplayName(displayName);
    const list = this.getBlockedPlayers();
    if (!this.matchesEntry(list, cleanId, cleanName)) {
      const next: SocialModerationEntry[] = [
        ...list,
        {
          playerId: cleanId,
          displayName: cleanName,
          updatedAt: Date.now(),
        },
      ];
      writeStoredList(BLOCKED_PLAYERS_STORAGE_KEY, next);
      return next;
    }
    return list;
  }

  public unblockPlayer(playerId: string, displayName?: string): SocialModerationEntry[] {
    const list = this.getBlockedPlayers();
    const next = list.filter(
      (entry) => !this.entryMatches(entry, playerId, displayName),
    );
    writeStoredList(BLOCKED_PLAYERS_STORAGE_KEY, next);
    return next;
  }

  public buildProfileSummary(
    player: MultiplayerPlayer,
    roomName?: string,
  ): PlayerProfileSummary {
    const profileSnap = ProfileManager.getSnapshot();
    const muted = this.isMuted(player.id, player.displayName);
    const serverFriend = Boolean(
      player.publicProfileId &&
        profileSnap.friends.some((f) => f.publicProfileId === player.publicProfileId),
    );
    const serverBlocked = Boolean(
      player.publicProfileId &&
        profileSnap.blockedPlayers.some(
          (b) => b.publicProfileId === player.publicProfileId,
        ),
    );
    const blocked = serverBlocked || this.isBlocked(player.id, player.displayName);
    return {
      playerId: player.id,
      ...(player.publicProfileId ? { publicProfileId: player.publicProfileId } : {}),
      displayName: player.displayName,
      ...(player.playerTag ? { playerTag: player.playerTag } : {}),
      avatarColor: player.avatarColor,
      ...(player.avatar ? { avatar: player.avatar } : {}),
      isHost: player.isHost,
      isLocal: Boolean(player.isLocal),
      isReady: player.isReady,
      joinedAt: player.joinedAt,
      pingMs: player.pingMs,
      connectionQuality: player.connectionQuality as ConnectionQuality,
      health: player.health,
      maxHealth: player.maxHealth,
      isDead: player.isDead,
      roomName,
      isFriend: serverFriend || this.isFriendName(player.displayName),
      isMuted: muted,
      isBlocked: blocked,
      accountSystemAvailable: Boolean(player.publicProfileId && profileSnap.serverAvailable),
    };
  }

  private readModerationList(storageKey: string): SocialModerationEntry[] {
    return readStoredList<SocialModerationEntry>(storageKey).filter(
      (entry) =>
        Boolean(entry) &&
        typeof entry.displayName === 'string' &&
        typeof entry.playerId === 'string',
    );
  }

  private entryMatches(
    entry: SocialModerationEntry,
    playerId: string,
    displayName?: string,
  ): boolean {
    if (playerId && entry.playerId && entry.playerId === playerId) return true;
    const normName = displayName ? normalizeSocialKey(displayName) : '';
    return Boolean(normName && normalizeSocialKey(entry.displayName) === normName);
  }

  private matchesEntry(
    list: SocialModerationEntry[],
    playerId: string,
    displayName?: string,
  ): boolean {
    return list.some((entry) => this.entryMatches(entry, playerId, displayName));
  }
}
