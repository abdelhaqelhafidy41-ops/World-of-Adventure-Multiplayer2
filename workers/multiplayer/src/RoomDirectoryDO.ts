import type {
  CfDurableObjectState,
  CfEnv,
} from './cfTypes';
import {
  MAX_PLAYERS_PER_ROOM,
  MIN_PLAYERS_PER_ROOM,
  isValidRoomCode,
  isValidRoomId,
  sanitizeDisplayName,
  sanitizeRoomName,
  type DifficultyLevel,
  type MultiplayerInviteRecord,
  type RoomPrivacy,
  type RoomStatus,
  type WorldType,
} from '../../../shared/multiplayerProtocol';

export interface DirectoryRoomEntry {
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
  createdAt: number;
  updatedAt: number;
}

const DIRECTORY_STORAGE_KEY = 'room_directory_v1';
const INVITES_STORAGE_KEY = 'room_invites_v1';
const STALE_ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const INVITE_TTL_MS = 30 * 60 * 1000;
const MAX_DIRECTORY_ROOMS = 500;
const MAX_INVITES_TOTAL = 2000;
const MAX_INVITES_PER_RECIPIENT = 25;

function generateInviteId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let hex = 'inv_';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export class RoomDirectoryDO {
  private readonly ctx: CfDurableObjectState;
  private rooms = new Map<string, DirectoryRoomEntry>();
  private codeToRoomId = new Map<string, string>();
  private invites = new Map<string, MultiplayerInviteRecord>();
  private loaded = false;

  constructor(ctx: CfDurableObjectState, _env: CfEnv) {
    this.ctx = ctx;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const saved = await this.ctx.storage.get<DirectoryRoomEntry[]>(DIRECTORY_STORAGE_KEY);
    const now = Date.now();
    if (Array.isArray(saved)) {
      for (const entry of saved) {
        if (entry?.roomId && now - entry.updatedAt < STALE_ROOM_TTL_MS) {
          this.rooms.set(entry.roomId, entry);
          if (entry.roomCode) {
            this.codeToRoomId.set(entry.roomCode.toUpperCase(), entry.roomId);
          }
        }
      }
    }
    const savedInvites = await this.ctx.storage.get<MultiplayerInviteRecord[]>(INVITES_STORAGE_KEY);
    if (Array.isArray(savedInvites)) {
      for (const inv of savedInvites) {
        if (inv?.inviteId && now - inv.sentAt < INVITE_TTL_MS) {
          this.invites.set(inv.inviteId, inv);
        }
      }
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    const now = Date.now();
    for (const [id, entry] of this.rooms) {
      if (now - entry.updatedAt >= STALE_ROOM_TTL_MS || entry.playerCount < 0) {
        this.rooms.delete(id);
        this.codeToRoomId.delete(entry.roomCode.toUpperCase());
      }
    }
    await this.ctx.storage.put(DIRECTORY_STORAGE_KEY, Array.from(this.rooms.values()));
  }

  private async persistInvites(): Promise<void> {
    const now = Date.now();
    for (const [id, inv] of this.invites) {
      if (now - inv.sentAt >= INVITE_TTL_MS) {
        this.invites.delete(id);
      }
    }
    await this.ctx.storage.put(INVITES_STORAGE_KEY, Array.from(this.invites.values()));
  }

  public async fetch(request: Request): Promise<Response> {
    await this.ensureLoaded();
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/list') {
      const publicRooms = Array.from(this.rooms.values())
        .filter(
          (r) =>
            !r.isPrivate &&
            !r.locked &&
            r.privacy === 'public' &&
            r.status === 'waiting' &&
            r.playerCount > 0,
        )
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 50);
      return Response.json({ ok: true, rooms: publicRooms });
    }

    if (request.method === 'GET' && url.pathname === '/resolve') {
      const q = (url.searchParams.get('codeOrId') ?? '').trim();
      if (!q) {
        return Response.json({ ok: false, error: 'MISSING_ROOM_QUERY' }, { status: 400 });
      }
      const byId = this.rooms.get(q);
      if (byId) {
        return Response.json({ ok: true, roomId: byId.roomId });
      }
      const byCodeId = this.codeToRoomId.get(q.toUpperCase());
      if (byCodeId && this.rooms.has(byCodeId)) {
        return Response.json({ ok: true, roomId: byCodeId });
      }
      return Response.json(
        { ok: false, error: 'ROOM_NOT_FOUND', message: 'ROOM NOT FOUND' },
        { status: 404 },
      );
    }

    if (request.method === 'GET' && url.pathname === '/quick-join') {
      const openRoom = Array.from(this.rooms.values())
        .filter(
          (r) =>
            !r.isPrivate &&
            !r.locked &&
            r.privacy === 'public' &&
            r.status === 'waiting' &&
            !r.hasPassword &&
            r.playerCount > 0 &&
            r.playerCount < r.maxPlayers,
        )
        .sort((a, b) => b.playerCount - a.playerCount || b.updatedAt - a.updatedAt)[0];

      if (!openRoom) {
        return Response.json({ ok: false, error: 'NO_OPEN_ROOMS' }, { status: 404 });
      }
      return Response.json({ ok: true, roomId: openRoom.roomId });
    }

    if (request.method === 'POST' && url.pathname === '/upsert') {
      const body = (await request.json().catch(() => null)) as DirectoryRoomEntry | null;
      if (
        !body ||
        !isValidRoomId(body.roomId) ||
        !isValidRoomCode(body.roomCode)
      ) {
        return Response.json({ ok: false, error: 'INVALID_ENTRY' }, { status: 400 });
      }
      if (!this.rooms.has(body.roomId) && this.rooms.size >= MAX_DIRECTORY_ROOMS) {
        const oldest = Array.from(this.rooms.values()).sort(
          (a, b) => a.updatedAt - b.updatedAt,
        )[0];
        if (oldest) {
          this.rooms.delete(oldest.roomId);
          this.codeToRoomId.delete(oldest.roomCode.toUpperCase());
        }
      }
      const maxPlayers = Math.max(
        MIN_PLAYERS_PER_ROOM,
        Math.min(MAX_PLAYERS_PER_ROOM, Math.round(Number(body.maxPlayers) || 8)),
      );
      const playerCount = Math.max(
        0,
        Math.min(maxPlayers, Math.round(Number(body.playerCount) || 0)),
      );
      const entry: DirectoryRoomEntry = {
        ...body,
        roomCode: body.roomCode.trim().toUpperCase(),
        roomName: sanitizeRoomName(body.roomName, 'World of Adventure'),
        hostName: sanitizeDisplayName(body.hostName, 'Host'),
        worldName: sanitizeRoomName(body.worldName, 'Oakhollow Valley'),
        maxPlayers,
        playerCount,
        updatedAt: Date.now(),
      };
      this.rooms.set(entry.roomId, entry);
      this.codeToRoomId.set(entry.roomCode, entry.roomId);
      await this.persist();
      return Response.json({ ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/remove') {
      const body = (await request.json().catch(() => null)) as { roomId?: string } | null;
      if (body?.roomId) {
        const existing = this.rooms.get(body.roomId);
        if (existing) {
          this.codeToRoomId.delete(existing.roomCode.toUpperCase());
          this.rooms.delete(body.roomId);
          await this.persist();
        }
        let invitesChanged = false;
        for (const [id, inv] of this.invites) {
          if (inv.roomId === body.roomId) {
            this.invites.delete(id);
            invitesChanged = true;
          }
        }
        if (invitesChanged) {
          await this.persistInvites();
        }
      }
      return Response.json({ ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/invites/send') {
      const body = (await request.json().catch(() => null)) as Partial<MultiplayerInviteRecord> | null;
      if (
        !body ||
        !isValidRoomId(body.roomId) ||
        !isValidRoomCode(body.roomCode) ||
        !body.toPlayerName
      ) {
        return Response.json({ ok: false, error: 'INVALID_INVITE' }, { status: 400 });
      }
      const toPlayerName = sanitizeDisplayName(body.toPlayerName, '');
      const fromPlayerName = sanitizeDisplayName(body.fromPlayerName, 'Adventurer');
      if (!toPlayerName) {
        return Response.json({ ok: false, error: 'INVALID_RECIPIENT' }, { status: 400 });
      }
      const now = Date.now();
      const recipientLower = toPlayerName.toLowerCase();
      let recipientCount = 0;
      for (const existing of this.invites.values()) {
        if (
          now - existing.sentAt < INVITE_TTL_MS &&
          existing.toPlayerName.toLowerCase() === recipientLower
        ) {
          recipientCount += 1;
        }
      }
      if (recipientCount >= MAX_INVITES_PER_RECIPIENT) {
        return Response.json(
          { ok: false, error: 'RATE_LIMITED', message: 'Recipient has too many pending invites.' },
          { status: 429 },
        );
      }
      if (this.invites.size >= MAX_INVITES_TOTAL) {
        const oldestInvite = Array.from(this.invites.values()).sort(
          (a, b) => a.sentAt - b.sentAt,
        )[0];
        if (oldestInvite) {
          this.invites.delete(oldestInvite.inviteId);
        }
      }
      const invite: MultiplayerInviteRecord = {
        inviteId: generateInviteId(),
        roomId: body.roomId,
        roomCode: body.roomCode.trim().toUpperCase(),
        roomName: sanitizeRoomName(body.roomName, 'World of Adventure'),
        fromPlayerId: typeof body.fromPlayerId === 'string' ? body.fromPlayerId.slice(0, 64) : '',
        ...(typeof body.fromPublicProfileId === 'string' && body.fromPublicProfileId
          ? { fromPublicProfileId: body.fromPublicProfileId.slice(0, 32) }
          : {}),
        fromPlayerName,
        ...(typeof body.fromPlayerTag === 'string' && /^\d{4}$/.test(body.fromPlayerTag)
          ? { fromPlayerTag: body.fromPlayerTag }
          : {}),
        ...(body.fromAvatar && typeof body.fromAvatar === 'object'
          ? { fromAvatar: body.fromAvatar }
          : {}),
        ...(typeof body.toPublicProfileId === 'string' && body.toPublicProfileId
          ? { toPublicProfileId: body.toPublicProfileId.slice(0, 32) }
          : {}),
        toPlayerName,
        worldType: body.worldType || 'normal',
        playerCount: Math.max(0, Math.min(MAX_PLAYERS_PER_ROOM, Number(body.playerCount) || 1)),
        maxPlayers: Math.max(MIN_PLAYERS_PER_ROOM, Math.min(MAX_PLAYERS_PER_ROOM, Number(body.maxPlayers) || 8)),
        sentAt: now,
      };
      this.invites.set(invite.inviteId, invite);
      await this.persistInvites();
      return Response.json({ ok: true, invite });
    }

    if (request.method === 'GET' && url.pathname === '/invites') {
      const playerName = (url.searchParams.get('playerName') ?? '').trim().toLowerCase();
      const publicProfileId = (url.searchParams.get('publicProfileId') ?? '').trim().toUpperCase();
      if (!playerName && !publicProfileId) {
        return Response.json({ ok: true, invites: [] });
      }
      const now = Date.now();
      const matching: MultiplayerInviteRecord[] = [];
      for (const inv of this.invites.values()) {
        if (now - inv.sentAt >= INVITE_TTL_MS) continue;
        const matchesId =
          Boolean(publicProfileId) &&
          inv.toPublicProfileId?.toUpperCase() === publicProfileId;
        const matchesName =
          Boolean(playerName) &&
          (!inv.toPublicProfileId || !publicProfileId) &&
          inv.toPlayerName.toLowerCase() === playerName;
        if (!matchesId && !matchesName) continue;
        const room = this.rooms.get(inv.roomId);
        if (!room || room.locked || room.status !== 'waiting') continue;
        matching.push({
          ...inv,
          playerCount: room.playerCount,
          maxPlayers: room.maxPlayers,
        });
      }
      matching.sort((a, b) => b.sentAt - a.sentAt);
      return Response.json({ ok: true, invites: matching });
    }

    if (request.method === 'POST' && url.pathname === '/invites/consume') {
      const body = (await request.json().catch(() => null)) as { inviteId?: string } | null;
      const inv = body?.inviteId ? this.invites.get(body.inviteId) : undefined;
      if (!inv) {
        return Response.json({ ok: false, error: 'INVITE_NOT_FOUND' }, { status: 404 });
      }
      this.invites.delete(inv.inviteId);
      await this.persistInvites();
      return Response.json({ ok: true, invite: inv });
    }

    if (request.method === 'POST' && url.pathname === '/invites/decline') {
      const body = (await request.json().catch(() => null)) as { inviteId?: string } | null;
      if (body?.inviteId && this.invites.has(body.inviteId)) {
        this.invites.delete(body.inviteId);
        await this.persistInvites();
      }
      return Response.json({ ok: true });
    }

    return Response.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });
  }
}
