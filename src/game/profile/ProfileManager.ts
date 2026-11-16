import type { PlayerReportReason } from '../../../shared/multiplayerProtocol';
import {
  computeLevelAndXp,
  createEmptyProfileStats,
  DEFAULT_PLAYER_PRIVACY,
  type AvatarConfig,
  type DirectMessageRecord,
  type EditablePresenceStatus,
  type FavoriteGameMode,
  type FriendRecord,
  type FriendRequestRecord,
  type OwnPlayerProfile,
  type PlayerPrivacySettings,
  type PlayerSearchSummary,
  type ProfileStatsDelta,
  type PublicPlayerProfile,
} from '../../../shared/profileTypes';
import { resolveMultiplayerServerUrl } from '../multiplayer/multiplayerConfig';
import { saveMultiplayerName } from '../multiplayer/MultiplayerService';
import { GameSettingsStore } from '../settings/GameSettingsStore';
import {
  AuthService,
  generateSecureLocalPlayerTag,
  generateSecureLocalPublicProfileId,
} from './AuthService';

const LOCAL_PROFILE_STORAGE_KEY = 'woa_local_profile_v1';

export interface ProfileStoreSnapshot {
  profile: OwnPlayerProfile | null;
  friends: FriendRecord[];
  incomingRequests: FriendRequestRecord[];
  outgoingRequests: FriendRequestRecord[];
  blockedPlayers: Array<{
    publicProfileId: string;
    displayName: string;
    playerTag: string;
    avatar: AvatarConfig;
  }>;
  syncing: boolean;
  serverAvailable: boolean;
}

export interface CreateProfileInput {
  displayName: string;
  avatar: AvatarConfig;
  playerTag?: string;
  bio?: string;
  country?: string;
  favoriteGameMode?: FavoriteGameMode;
  manualStatus?: EditablePresenceStatus;
}

export interface UpdateProfileInput {
  displayName?: string;
  avatar?: AvatarConfig;
  playerTag?: string;
  bio?: string;
  country?: string;
  favoriteGameMode?: FavoriteGameMode;
  manualStatus?: EditablePresenceStatus;
  statusNote?: string;
  privacy?: Partial<PlayerPrivacySettings>;
}

function readLocalProfile(): OwnPlayerProfile | null {
  try {
    const raw = localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OwnPlayerProfile | null;
    if (!parsed || typeof parsed.publicProfileId !== 'string' || !parsed.displayName) {
      return null;
    }
    return {
      ...parsed,
      privacy: {
        ...DEFAULT_PLAYER_PRIVACY,
        ...(parsed.privacy ?? {}),
      },
      stats: {
        ...createEmptyProfileStats(),
        ...(parsed.stats ?? {}),
      },
    };
  } catch {
    return null;
  }
}

function writeLocalProfile(profile: OwnPlayerProfile | null): void {
  try {
    if (!profile) {
      localStorage.removeItem(LOCAL_PROFILE_STORAGE_KEY);
    } else {
      localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    }
  } catch {
    // Ignore storage errors
  }
}

class ProfileManagerImpl {
  private profile: OwnPlayerProfile | null = null;
  private friends: FriendRecord[] = [];
  private incomingRequests: FriendRequestRecord[] = [];
  private outgoingRequests: FriendRequestRecord[] = [];
  private blockedPlayers: Array<{
    publicProfileId: string;
    displayName: string;
    playerTag: string;
    avatar: AvatarConfig;
  }> = [];
  private syncing = false;
  private initialized = false;
  private pendingStatsDelta: ProfileStatsDelta = {};
  private statsFlushTimer: number | null = null;
  private readonly listeners = new Set<(snap: ProfileStoreSnapshot) => void>();

  private ensureInitialized(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.profile = readLocalProfile();
    if (this.profile) {
      saveMultiplayerName(this.profile.displayName);
      this.syncShowPlayerNameSetting(this.profile.privacy.showPlayerName);
    }
  }

  private syncShowPlayerNameSetting(showPlayerName: boolean): void {
    const current = GameSettingsStore.get().gameplay.showPlayerNames;
    if (current !== showPlayerName) {
      GameSettingsStore.update({ gameplay: { showPlayerNames: showPlayerName } });
    }
  }

  private notify(): void {
    const snap = this.getSnapshot();
    this.listeners.forEach((fn) => {
      try {
        fn(snap);
      } catch {
        // Never allow subscriber UI errors to break manager state
      }
    });
  }

  public getSnapshot(): ProfileStoreSnapshot {
    this.ensureInitialized();
    const baseUrl = resolveMultiplayerServerUrl();
    return {
      profile: this.profile,
      friends: this.friends,
      incomingRequests: this.incomingRequests,
      outgoingRequests: this.outgoingRequests,
      blockedPlayers: this.blockedPlayers,
      syncing: this.syncing,
      serverAvailable: Boolean(baseUrl),
    };
  }

  public getProfile(): OwnPlayerProfile | null {
    this.ensureInitialized();
    return this.profile;
  }

  public hasProfile(): boolean {
    this.ensureInitialized();
    return Boolean(this.profile && this.profile.displayName.trim().length >= 3);
  }

  public subscribe(listener: (snap: ProfileStoreSnapshot) => void): () => void {
    this.ensureInitialized();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public async bootstrap(): Promise<OwnPlayerProfile | null> {
    this.ensureInitialized();
    const baseUrl = resolveMultiplayerServerUrl();
    if (!baseUrl || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      return this.profile;
    }

    const sess = AuthService.getSession();
    if (sess?.verifiedWithServer) {
      const serverProfile = await AuthService.refreshSession();
      if (serverProfile) {
        this.profile = serverProfile;
        writeLocalProfile(serverProfile);
        saveMultiplayerName(serverProfile.displayName);
        this.syncShowPlayerNameSetting(serverProfile.privacy.showPlayerName);
        this.notify();
        void this.refreshFriends();
        return this.profile;
      }
    }

    // If profile was created while offline earlier, upload cleanly when backend returns
    if (this.profile && (!sess || !sess.verifiedWithServer)) {
      try {
        const res = await fetch(`${baseUrl}/api/profile`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            displayName: this.profile.displayName,
            avatar: this.profile.avatar,
            playerTag: this.profile.playerTag,
            bio: this.profile.bio,
            country: this.profile.country,
            favoriteGameMode: this.profile.favoriteGameMode,
            manualStatus: this.profile.manualStatus,
            privacy: this.profile.privacy,
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          sessionToken?: string;
          profile?: OwnPlayerProfile;
        } | null;
        if (res.ok && data?.ok && data.profile && data.sessionToken) {
          AuthService.signIn({
            publicProfileId: data.profile.publicProfileId,
            sessionToken: data.sessionToken,
            verifiedWithServer: true,
          });
          this.profile = data.profile;
          writeLocalProfile(data.profile);
          this.notify();
          void this.refreshFriends();
        }
      } catch {
        // Keep local profile intact while offline
      }
    }
    return this.profile;
  }

  public async createProfile(input: CreateProfileInput): Promise<OwnPlayerProfile> {
    this.ensureInitialized();
    const baseUrl = resolveMultiplayerServerUrl();
    const now = Date.now();
    const showPlayerName = GameSettingsStore.get().gameplay.showPlayerNames;

    if (baseUrl && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
      this.syncing = true;
      this.notify();
      try {
        const res = await fetch(`${baseUrl}/api/profile`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            displayName: input.displayName,
            avatar: input.avatar,
            ...(input.playerTag ? { playerTag: input.playerTag } : {}),
            ...(input.bio ? { bio: input.bio } : {}),
            ...(input.country ? { country: input.country } : {}),
            favoriteGameMode: input.favoriteGameMode ?? 'normal',
            manualStatus: input.manualStatus ?? 'online',
            privacy: { ...DEFAULT_PLAYER_PRIVACY, showPlayerName },
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          message?: string;
          sessionToken?: string;
          profile?: OwnPlayerProfile;
        } | null;

        if (!res.ok || !data?.ok || !data.profile || !data.sessionToken) {
          throw new Error(data?.message || data?.error || 'Failed to create player profile.');
        }

        AuthService.signIn({
          publicProfileId: data.profile.publicProfileId,
          sessionToken: data.sessionToken,
          verifiedWithServer: true,
        });
        this.profile = data.profile;
        writeLocalProfile(data.profile);
        saveMultiplayerName(data.profile.displayName);
        this.syncShowPlayerNameSetting(data.profile.privacy.showPlayerName);
        this.syncing = false;
        this.notify();
        void this.refreshFriends();
        return data.profile;
      } catch (err) {
        this.syncing = false;
        this.notify();
        throw err;
      }
    }

    // Offline single-player fallback: cryptographically random WA-ID until synced online
    const localId = generateSecureLocalPublicProfileId();
    const localProfile: OwnPlayerProfile = {
      publicProfileId: localId,
      displayName: input.displayName.trim(),
      playerTag:
        input.playerTag && /^\d{4}$/.test(input.playerTag)
          ? input.playerTag
          : generateSecureLocalPlayerTag(),
      avatar: input.avatar,
      bio: (input.bio ?? '').trim().slice(0, 160),
      country: (input.country ?? '').trim().slice(0, 40),
      favoriteGameMode: input.favoriteGameMode ?? 'normal',
      presenceStatus: input.manualStatus ?? 'online',
      manualStatus: input.manualStatus ?? 'online',
      isOnlineVisible: true,
      privacy: { ...DEFAULT_PLAYER_PRIVACY, showPlayerName },
      stats: createEmptyProfileStats(),
      createdAt: now,
      lastActiveAt: now,
      tagUpdatedAt: now,
      friendsCount: 0,
      pendingIncomingRequestsCount: 0,
      pendingOutgoingRequestsCount: 0,
      blockedCount: 0,
    };
    AuthService.signIn({
      publicProfileId: localId,
      verifiedWithServer: false,
    });
    this.profile = localProfile;
    writeLocalProfile(localProfile);
    saveMultiplayerName(localProfile.displayName);
    this.notify();
    return localProfile;
  }

  public async ensureServerSyncedProfile(): Promise<OwnPlayerProfile | null> {
    this.ensureInitialized();
    const baseUrl = resolveMultiplayerServerUrl();
    if (!baseUrl || !this.profile) return this.profile;
    const sess = AuthService.getSession();
    if (sess?.verifiedWithServer) return this.profile;
    await this.bootstrap();
    return this.profile;
  }

  public async updateProfile(patch: UpdateProfileInput): Promise<OwnPlayerProfile | null> {
    this.ensureInitialized();
    if (!this.profile) return null;

    if (patch.privacy && typeof patch.privacy.showPlayerName === 'boolean') {
      this.syncShowPlayerNameSetting(patch.privacy.showPlayerName);
    }
    if (patch.displayName) {
      saveMultiplayerName(patch.displayName);
    }

    const baseUrl = resolveMultiplayerServerUrl();
    const sess = AuthService.getSession();
    if (
      baseUrl &&
      sess?.verifiedWithServer &&
      (typeof navigator === 'undefined' || navigator.onLine !== false)
    ) {
      const res = await fetch(`${baseUrl}/api/profile/update`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...AuthService.getBearerHeaders(),
        },
        body: JSON.stringify(patch),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        message?: string;
        profile?: OwnPlayerProfile;
      } | null;
      if (!res.ok || !data?.ok || !data.profile) {
        throw new Error(data?.message || data?.error || 'Failed to update profile.');
      }
      this.profile = data.profile;
      writeLocalProfile(data.profile);
      saveMultiplayerName(data.profile.displayName);
      this.syncShowPlayerNameSetting(data.profile.privacy.showPlayerName);
      this.notify();
      return data.profile;
    }

    // Offline local update
    this.profile = {
      ...this.profile,
      ...(patch.displayName !== undefined ? { displayName: patch.displayName.trim() } : {}),
      ...(patch.avatar !== undefined ? { avatar: patch.avatar } : {}),
      ...(patch.playerTag !== undefined ? { playerTag: patch.playerTag } : {}),
      ...(patch.bio !== undefined ? { bio: patch.bio.trim() } : {}),
      ...(patch.country !== undefined ? { country: patch.country.trim() } : {}),
      ...(patch.favoriteGameMode !== undefined
        ? { favoriteGameMode: patch.favoriteGameMode }
        : {}),
      ...(patch.manualStatus !== undefined
        ? { manualStatus: patch.manualStatus, presenceStatus: patch.manualStatus }
        : {}),
      ...(patch.statusNote !== undefined ? { statusNote: patch.statusNote } : {}),
      ...(patch.privacy !== undefined
        ? { privacy: { ...this.profile.privacy, ...patch.privacy } }
        : {}),
      lastActiveAt: Date.now(),
    };
    writeLocalProfile(this.profile);
    this.notify();
    return this.profile;
  }

  public async updatePresence(update: {
    manualStatus?: EditablePresenceStatus;
    currentRoomId?: string | null;
    currentRoomName?: string | null;
  }): Promise<void> {
    this.ensureInitialized();
    if (!this.profile) return;
    if (update.manualStatus) {
      this.profile.manualStatus = update.manualStatus;
      this.profile.presenceStatus = update.currentRoomId ? 'in-game' : update.manualStatus;
    } else if (update.currentRoomId !== undefined) {
      this.profile.currentRoomId = update.currentRoomId;
      this.profile.currentRoomName = update.currentRoomName ?? null;
      this.profile.presenceStatus = update.currentRoomId
        ? 'in-game'
        : this.profile.manualStatus;
    }
    writeLocalProfile(this.profile);
    this.notify();

    const baseUrl = resolveMultiplayerServerUrl();
    const sess = AuthService.getSession();
    if (!baseUrl || !sess?.verifiedWithServer) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    await fetch(`${baseUrl}/api/profile/presence`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...AuthService.getBearerHeaders(),
      },
      body: JSON.stringify(update),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { ok?: boolean; profile?: OwnPlayerProfile } | null) => {
        if (data?.ok && data.profile) {
          this.profile = data.profile;
          writeLocalProfile(data.profile);
          this.notify();
        }
      })
      .catch(() => {});
  }

  public recordGameplayDelta(delta: ProfileStatsDelta): void {
    this.ensureInitialized();
    if (!this.profile) return;

    const s = this.profile.stats;
    if (delta.playTimeSeconds) s.playTimeSeconds += Math.max(0, Math.round(delta.playTimeSeconds));
    if (delta.worldsCreated) s.worldsCreated += Math.max(0, Math.round(delta.worldsCreated));
    if (delta.worldsJoined) s.worldsJoined += Math.max(0, Math.round(delta.worldsJoined));
    if (delta.questsCompleted) s.questsCompleted += Math.max(0, Math.round(delta.questsCompleted));
    if (delta.enemiesDefeated) s.enemiesDefeated += Math.max(0, Math.round(delta.enemiesDefeated));
    if (delta.animalsDefeated) s.animalsDefeated += Math.max(0, Math.round(delta.animalsDefeated));
    if (delta.villagesDiscovered) {
      s.villagesDiscovered += Math.max(0, Math.round(delta.villagesDiscovered));
    }
    if (delta.resourcesCollected) {
      s.resourcesCollected += Math.max(0, Math.round(delta.resourcesCollected));
    }
    if (delta.distanceTraveledMeters) {
      s.distanceTraveledMeters += Math.max(0, Math.round(delta.distanceTraveledMeters));
    }
    if (delta.multiplayerSessions) {
      s.multiplayerSessions += Math.max(0, Math.round(delta.multiplayerSessions));
    }
    if (delta.gamesHosted) s.gamesHosted += Math.max(0, Math.round(delta.gamesHosted));

    if (delta.xpGained && delta.xpGained > 0) {
      const nextLvl = computeLevelAndXp(s.level, s.xp, delta.xpGained);
      s.level = nextLvl.level;
      s.xp = nextLvl.xp;
      s.xpToNextLevel = nextLvl.xpToNextLevel;
    }
    writeLocalProfile(this.profile);

    // Accumulate pending network delta
    const p = this.pendingStatsDelta;
    for (const [k, val] of Object.entries(delta) as Array<[keyof ProfileStatsDelta, number | undefined]>) {
      if (typeof val === 'number' && val > 0) {
        p[k] = (p[k] ?? 0) + val;
      }
    }

    const immediateFlush =
      Boolean(delta.questsCompleted) ||
      Boolean(delta.worldsCreated) ||
      Boolean(delta.worldsJoined);

    if (immediateFlush) {
      void this.flushStatsDelta();
    } else if (this.statsFlushTimer === null && typeof window !== 'undefined') {
      this.statsFlushTimer = window.setTimeout(() => {
        this.statsFlushTimer = null;
        void this.flushStatsDelta();
      }, 15_000);
    }
  }

  public async flushStatsDelta(): Promise<void> {
    if (this.statsFlushTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.statsFlushTimer);
      this.statsFlushTimer = null;
    }
    const keys = Object.keys(this.pendingStatsDelta) as Array<keyof ProfileStatsDelta>;
    if (keys.length === 0) return;

    const baseUrl = resolveMultiplayerServerUrl();
    const sess = AuthService.getSession();
    if (
      !baseUrl ||
      !sess?.verifiedWithServer ||
      (typeof navigator !== 'undefined' && navigator.onLine === false)
    ) {
      return;
    }

    const batch = { ...this.pendingStatsDelta };
    this.pendingStatsDelta = {};

    try {
      const res = await fetch(`${baseUrl}/api/profile/stats`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...AuthService.getBearerHeaders(),
        },
        body: JSON.stringify(batch),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        profile?: OwnPlayerProfile;
      } | null;
      if (res.ok && data?.ok && data.profile) {
        this.profile = data.profile;
        writeLocalProfile(data.profile);
        this.notify();
      }
    } catch {
      // Re-queue if offline error
      for (const [k, v] of Object.entries(batch) as Array<[keyof ProfileStatsDelta, number | undefined]>) {
        if (typeof v === 'number' && v > 0) {
          this.pendingStatsDelta[k] = (this.pendingStatsDelta[k] ?? 0) + v;
        }
      }
    }
  }

  public async getPublicProfile(publicProfileId: string): Promise<{
    profile: PublicPlayerProfile;
    relationship: { isSelf: boolean; isFriend: boolean; isBlockedByViewer: boolean };
  } | null> {
    const baseUrl = resolveMultiplayerServerUrl();
    if (!baseUrl) return null;
    try {
      const res = await fetch(
        `${baseUrl}/api/profile/${encodeURIComponent(publicProfileId.trim())}`,
        {
          method: 'GET',
          headers: {
            accept: 'application/json',
            ...AuthService.getBearerHeaders(),
          },
        },
      );
      if (!res.ok) return null;
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        profile?: PublicPlayerProfile;
        relationship?: { isSelf: boolean; isFriend: boolean; isBlockedByViewer: boolean };
      } | null;
      if (!data?.ok || !data.profile || !data.relationship) return null;
      return { profile: data.profile, relationship: data.relationship };
    } catch {
      return null;
    }
  }

  public async searchPlayers(query: string): Promise<PlayerSearchSummary[]> {
    const baseUrl = resolveMultiplayerServerUrl();
    if (!baseUrl || query.trim().length < 2) return [];
    const res = await fetch(
      `${baseUrl}/api/players/search?q=${encodeURIComponent(query.trim())}`,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          ...AuthService.getBearerHeaders(),
        },
      },
    );
    if (!res.ok) return [];
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      results?: PlayerSearchSummary[];
    } | null;
    return data?.ok && Array.isArray(data.results) ? data.results : [];
  }

  public async refreshFriends(): Promise<void> {
    const baseUrl = resolveMultiplayerServerUrl();
    const sess = AuthService.getSession();
    if (!baseUrl || !sess?.verifiedWithServer) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    try {
      const res = await fetch(`${baseUrl}/api/friends`, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          ...AuthService.getBearerHeaders(),
        },
      });
      if (!res.ok) return;
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        friends?: FriendRecord[];
        incomingRequests?: FriendRequestRecord[];
        outgoingRequests?: FriendRequestRecord[];
        blocked?: Array<{
          publicProfileId: string;
          displayName: string;
          playerTag: string;
          avatar: AvatarConfig;
        }>;
      } | null;
      if (data?.ok) {
        this.friends = Array.isArray(data.friends) ? data.friends : [];
        this.incomingRequests = Array.isArray(data.incomingRequests)
          ? data.incomingRequests
          : [];
        this.outgoingRequests = Array.isArray(data.outgoingRequests)
          ? data.outgoingRequests
          : [];
        this.blockedPlayers = Array.isArray(data.blocked) ? data.blocked : [];
        this.notify();
      }
    } catch {
      // Non-fatal offline check
    }
  }

  public async sendFriendRequest(targetPublicProfileId: string): Promise<void> {
    const baseUrl = resolveMultiplayerServerUrl();
    if (!baseUrl) throw new Error('Online service unavailable.');
    const res = await fetch(`${baseUrl}/api/friends/request`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...AuthService.getBearerHeaders(),
      },
      body: JSON.stringify({ targetPublicProfileId }),
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      error?: string;
    } | null;
    if (!res.ok || !data?.ok) {
      throw new Error(data?.message || data?.error || 'Could not send friend request.');
    }
    await this.refreshFriends();
  }

  public async respondFriendRequest(
    requestId: string,
    action: 'accept' | 'decline' | 'cancel',
  ): Promise<void> {
    const baseUrl = resolveMultiplayerServerUrl();
    if (!baseUrl) throw new Error('Online service unavailable.');
    const res = await fetch(`${baseUrl}/api/friends/respond`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...AuthService.getBearerHeaders(),
      },
      body: JSON.stringify({ requestId, action }),
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
    } | null;
    if (!res.ok || !data?.ok) {
      throw new Error(data?.message || 'Action failed.');
    }
    await this.refreshFriends();
  }

  public async removeFriend(targetPublicProfileId: string): Promise<void> {
    const baseUrl = resolveMultiplayerServerUrl();
    if (!baseUrl) throw new Error('Online service unavailable.');
    const res = await fetch(`${baseUrl}/api/friends/remove`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...AuthService.getBearerHeaders(),
      },
      body: JSON.stringify({ targetPublicProfileId }),
    });
    if (!res.ok) throw new Error('Failed to remove friend.');
    await this.refreshFriends();
  }

  public async blockProfile(targetPublicProfileId: string): Promise<void> {
    const baseUrl = resolveMultiplayerServerUrl();
    if (!baseUrl) return;
    await fetch(`${baseUrl}/api/blocks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...AuthService.getBearerHeaders(),
      },
      body: JSON.stringify({ targetPublicProfileId }),
    });
    await this.refreshFriends();
  }

  public async unblockProfile(targetPublicProfileId: string): Promise<void> {
    const baseUrl = resolveMultiplayerServerUrl();
    if (!baseUrl) return;
    await fetch(`${baseUrl}/api/blocks/remove`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...AuthService.getBearerHeaders(),
      },
      body: JSON.stringify({ targetPublicProfileId }),
    });
    await this.refreshFriends();
  }

  public async getDirectMessages(partnerPublicProfileId: string): Promise<DirectMessageRecord[]> {
    const baseUrl = resolveMultiplayerServerUrl();
    if (!baseUrl || !AuthService.getSession()?.verifiedWithServer) return [];
    const res = await fetch(
      `${baseUrl}/api/messages?with=${encodeURIComponent(partnerPublicProfileId)}`,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          ...AuthService.getBearerHeaders(),
        },
      },
    );
    if (!res.ok) return [];
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      messages?: DirectMessageRecord[];
    } | null;
    return data?.ok && Array.isArray(data.messages) ? data.messages : [];
  }

  public async sendDirectMessage(
    toPublicProfileId: string,
    message: string,
  ): Promise<DirectMessageRecord> {
    const baseUrl = resolveMultiplayerServerUrl();
    if (!baseUrl) throw new Error('Online service unavailable.');
    const res = await fetch(`${baseUrl}/api/messages/send`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...AuthService.getBearerHeaders(),
      },
      body: JSON.stringify({ toPublicProfileId, message }),
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      message?: DirectMessageRecord | string;
    } | null;
    if (!res.ok || !data?.ok || !data.message || typeof data.message === 'string') {
      throw new Error(
        typeof data?.message === 'string'
          ? data.message
          : data?.error || 'Could not send message.',
      );
    }
    return data.message;
  }

  public async submitProfileReport(
    targetPublicProfileId: string,
    reason: PlayerReportReason,
    details?: string,
  ): Promise<void> {
    const baseUrl = resolveMultiplayerServerUrl();
    if (!baseUrl) throw new Error('Online service unavailable.');
    const res = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...AuthService.getBearerHeaders(),
      },
      body: JSON.stringify({ targetPublicProfileId, reason, details }),
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      error?: string;
    } | null;
    if (!res.ok || !data?.ok) {
      throw new Error(data?.message || data?.error || 'Could not submit report.');
    }
  }
}

export const ProfileManager = new ProfileManagerImpl();
