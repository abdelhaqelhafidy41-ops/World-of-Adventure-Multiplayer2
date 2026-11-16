import assert from 'node:assert/strict';

class MockWebSocket extends EventTarget {
  public peer: MockWebSocket | null = null;
  public accepted = false;
  public closed = false;
  public sent: string[] = [];
  public readyState = 1;

  accept(): void {
    this.accepted = true;
  }
  serializeAttachment(): void {}
  deserializeAttachment(): unknown {
    return null;
  }
  send(data: string): void {
    const peer = this.peer;
    if (this.closed || !peer || peer.closed) return;
    setTimeout(() => {
      peer.dispatchEvent(new MessageEvent('message', { data }));
    }, 0);
  }
  close(code = 1000, reason = ''): void {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    this.dispatchEvent(Object.assign(new Event('close'), { code, reason }));
    const peer = this.peer;
    if (peer && !peer.closed) {
      setTimeout(() => {
        if (!peer.closed) {
          peer.closed = true;
          peer.readyState = 3;
          peer.dispatchEvent(Object.assign(new Event('close'), { code, reason }));
        }
      }, 0);
    }
  }
}

(globalThis as Record<string, unknown>).WebSocketPair = class {
  0: MockWebSocket;
  1: MockWebSocket;
  constructor() {
    const a = new MockWebSocket();
    const b = new MockWebSocket();
    a.peer = b;
    b.peer = a;
    this[0] = a;
    this[1] = b;
  }
};

const OrigResponse = globalThis.Response;
(globalThis as Record<string, unknown>).Response = class extends OrigResponse {
  webSocket?: unknown;
  constructor(body?: BodyInit | null, init?: ResponseInit & { webSocket?: unknown }) {
    if (init?.status === 101) {
      super(null, { status: 200 });
      Object.defineProperty(this, 'status', { value: 101 });
      this.webSocket = init.webSocket;
    } else {
      super(body, init);
    }
  }
};

import workerApp from './workers/multiplayer/src/index';
import { MultiplayerRoomDO } from './workers/multiplayer/src/MultiplayerRoomDO';
import { PlayerProfileDO } from './workers/multiplayer/src/PlayerProfileDO';
import { RoomDirectoryDO } from './workers/multiplayer/src/RoomDirectoryDO';
import {
  buildMultiplayerConfig,
  formatMultiplayerDiagnosticReport,
  getMultiplayerConfig,
  normalizeMultiplayerBaseUrl,
  toWebSocketUrl,
} from './src/game/multiplayer/multiplayerConfig';
import {
  buildRoomShareLink,
  extractJoinTargetFromUrl,
} from './src/game/multiplayer/inviteUtils';

function createMockState() {
  const store = new Map<string, unknown>();
  let scheduledAlarm: number | null = null;
  return {
    id: { toString: () => 'room-do-id', equals: () => false },
    storage: {
      get: async <T = unknown>(k: string) => store.get(k) as T | undefined,
      put: async (k: string, v: unknown) => {
        store.set(k, structuredClone(v));
      },
      delete: async (k: string) => store.delete(k),
      deleteAll: async () => store.clear(),
      setAlarm: async (ts: number | Date) => {
        scheduledAlarm = typeof ts === 'number' ? ts : ts.getTime();
      },
      deleteAlarm: async () => {
        scheduledAlarm = null;
      },
      getScheduledAlarm: () => scheduledAlarm,
    },
    acceptWebSocket: () => {},
    getWebSockets: () => [],
    blockConcurrencyWhile: async <T>(cb: () => Promise<T>) => cb(),
  };
}

function createMockEnv(overrides: Record<string, unknown> = {}) {
  return {
    MULTIPLAYER_ROOMS: {
      idFromName: (n: string) => ({ toString: () => n, equals: () => false }),
      idFromString: (n: string) => ({ toString: () => n, equals: () => false }),
      newUniqueId: () => ({ toString: () => 'uid', equals: () => false }),
      get: () => ({
        fetch: async () => new OrigResponse(JSON.stringify({ ok: true }), { status: 200 }),
      }),
    },
    ROOM_DIRECTORY: {
      idFromName: (n: string) => ({ toString: () => n, equals: () => false }),
      idFromString: (n: string) => ({ toString: () => n, equals: () => false }),
      newUniqueId: () => ({ toString: () => 'uid', equals: () => false }),
      get: () => ({
        fetch: async () => new OrigResponse(JSON.stringify({ ok: true }), { status: 200 }),
      }),
    },
    PLAYER_PROFILES: {
      idFromName: (n: string) => ({ toString: () => n, equals: () => false }),
      idFromString: (n: string) => ({ toString: () => n, equals: () => false }),
      newUniqueId: () => ({ toString: () => 'uid', equals: () => false }),
      get: () => ({
        fetch: async () => new OrigResponse(JSON.stringify({ ok: true }), { status: 200 }),
      }),
    },
    ...overrides,
  };
}

type Envelope = { type: string; playerId: string; payload?: Record<string, unknown> };

function collectMessages(ws: MockWebSocket): Envelope[] {
  const out: Envelope[] = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(String((ev as MessageEvent).data)) as Envelope;
    out.push(msg);
  });
  return out;
}

const flush = () => new Promise((r) => setTimeout(r, 60));

async function run() {
  const state = createMockState();
  const env = createMockEnv();
  const roomDO = new MultiplayerRoomDO(state as never, env as never);
  const roomId = 'room_test_123456';

  // 1. Create room
  const createRes = await roomDO.fetch(
    new Request('https://internal/init', {
      method: 'POST',
      body: JSON.stringify({
        roomId,
        roomName: 'Test Coop',
        playerName: 'HostOne',
        worldName: 'Oakhollow',
        worldType: 'normal',
        difficulty: 'normal',
        maxPlayers: 4,
      }),
    }),
  );
  const createJson = (await createRes.json()) as {
    ok: boolean;
    playerId: string;
    sessionToken: string;
  };
  assert.equal(createJson.ok, true);
  const hostId = createJson.playerId;

  // 2. Join guest
  const joinRes = await roomDO.fetch(
    new Request('https://internal/join', {
      method: 'POST',
      body: JSON.stringify({ playerName: 'GuestTwo' }),
    }),
  );
  const joinJson = (await joinRes.json()) as {
    ok: boolean;
    playerId: string;
    sessionToken: string;
  };
  assert.equal(joinJson.ok, true);
  const guestId = joinJson.playerId;

  // 3. Connect host & guest WS
  const hostWsRes = (await roomDO.fetch(
    new Request(`https://internal/ws?playerId=${hostId}&token=${createJson.sessionToken}`, {
      headers: { Upgrade: 'websocket' },
    }),
  )) as unknown as { status: number; webSocket: MockWebSocket };
  assert.equal(hostWsRes.status, 101);
  const hostWs = hostWsRes.webSocket;
  const hostMsgs = collectMessages(hostWs);

  const guestWsRes = (await roomDO.fetch(
    new Request(`https://internal/ws?playerId=${guestId}&token=${joinJson.sessionToken}`, {
      headers: { Upgrade: 'websocket' },
    }),
  )) as unknown as { status: number; webSocket: MockWebSocket };
  assert.equal(guestWsRes.status, 101);
  let guestWs = guestWsRes.webSocket;
  let guestMsgs = collectMessages(guestWs);
  await flush();

  const send = (ws: MockWebSocket, pid: string, type: string, payload?: unknown) => {
    ws.send(JSON.stringify({ v: 1, type, roomId, playerId: pid, timestamp: Date.now(), payload }));
  };

  // Ready + start game
  send(guestWs, guestId, 'READY', { ready: true });
  await flush();
  send(hostWs, hostId, 'START_GAME');
  await flush();
  assert.ok(hostMsgs.some((m) => m.type === 'WORLD_SNAPSHOT'), 'Host receives WORLD_SNAPSHOT on start');
  assert.ok(guestMsgs.some((m) => m.type === 'WORLD_SNAPSHOT'), 'Guest receives WORLD_SNAPSHOT on start');

  // 4. Forged NPC_DIED & forbidden authority keys rejected
  guestMsgs.length = 0;
  send(guestWs, guestId, 'GAME_EVENT', { event: 'NPC_DIED', data: { targetId: 'npc-rowan' } });
  await flush();
  assert.ok(
    guestMsgs.some((m) => m.type === 'ERROR'),
    'Forged SERVER_ONLY event NPC_DIED must be rejected',
  );

  guestMsgs.length = 0;
  send(guestWs, guestId, 'GAME_EVENT', {
    event: 'COMBAT_HIT',
    data: { weaponId: 'ranger-sword', targetKind: 'enemy', targetId: 'enemy-1', damage: 9999 },
  });
  await flush();
  assert.ok(
    guestMsgs.some((m) => m.type === 'ERROR'),
    'Client-supplied damage key must be rejected',
  );

  // 5. Host-only ENTITY_SYNC enforced
  guestMsgs.length = 0;
  send(guestWs, guestId, 'ENTITY_SYNC', { entities: [] });
  await flush();
  assert.ok(
    guestMsgs.some((m) => m.type === 'ERROR' && m.payload?.code === 'FORBIDDEN_HOST_ONLY'),
    'Non-host ENTITY_SYNC must be rejected',
  );

  guestMsgs.length = 0;
  send(hostWs, hostId, 'ENTITY_SYNC', {
    entities: [
      { id: 'enemy-bandit_scout-0', kind: 'enemy', archetype: 'bandit_scout', x: 5, y: 0, z: 6, yaw: 1.2, state: 'patrol' },
      { id: 'animal-deer-0', kind: 'animal', archetype: 'deer', x: 1.5, y: 0, z: 4.5, yaw: 0.4, state: 'idle' },
      { id: 'npc-rowan', kind: 'npc', archetype: 'villager', x: 2.0, y: 0, z: 4.5, yaw: 0.1, state: 'idle' },
    ],
    worldHours: 10.5,
    weather: 'rain',
  });
  await flush();
  const synced = guestMsgs.find((m) => m.type === 'ENTITY_SYNC');
  assert.ok(synced, 'Guest receives host ENTITY_SYNC');

  // 5b. Non-existent target fabrication rejected (TARGET_NOT_FOUND)
  guestMsgs.length = 0;
  send(guestWs, guestId, 'GAME_EVENT', {
    event: 'COMBAT_HIT',
    data: {
      weaponId: 'ranger-sword',
      targetKind: 'enemy',
      targetId: 'forged-fake-enemy-999',
      archetype: 'bandit_scout',
      x: 1,
      y: 0,
      z: 4,
      isCrit: false,
    },
  });
  await flush();
  assert.ok(
    guestMsgs.some((m) => m.type === 'ERROR' && m.payload?.code === 'TARGET_NOT_FOUND'),
    'Fabricated target ID rejected with TARGET_NOT_FOUND',
  );
  await new Promise((r) => setTimeout(r, 360));

  // 5c. Unowned weapon rejected (WEAPON_NOT_OWNED), then crafting grants it cleanly
  guestMsgs.length = 0;
  send(guestWs, guestId, 'GAME_EVENT', {
    event: 'COMBAT_HIT',
    data: {
      weaponId: 'steel-sword',
      targetKind: 'animal',
      targetId: 'animal-deer-0',
      archetype: 'deer',
      x: 1.5,
      y: 0,
      z: 4.5,
      isCrit: false,
    },
  });
  await flush();
  assert.ok(
    guestMsgs.some((m) => m.type === 'ERROR' && m.payload?.code === 'WEAPON_NOT_OWNED'),
    'Unowned steel-sword rejected with WEAPON_NOT_OWNED',
  );

  send(guestWs, guestId, 'GAME_EVENT', {
    event: 'WORLD_EVENT',
    data: { kind: 'item_crafted', recipeId: 'recipe-steel-sword', itemId: 'steel-sword', count: 1 },
  });
  await flush();
  guestMsgs.length = 0;
  send(guestWs, guestId, 'GAME_EVENT', {
    event: 'COMBAT_HIT',
    data: {
      attackId: 'swing_cleave_1',
      weaponId: 'steel-sword',
      targetKind: 'animal',
      targetId: 'animal-deer-0',
      archetype: 'deer',
      x: 1.5,
      y: 0,
      z: 4.5,
      isCrit: false,
    },
  });
  // Second target in same swing (cleave) succeeds without triggering cooldown
  send(guestWs, guestId, 'GAME_EVENT', {
    event: 'COMBAT_HIT',
    data: {
      attackId: 'swing_cleave_1',
      weaponId: 'steel-sword',
      targetKind: 'npc',
      targetId: 'npc-rowan',
      archetype: 'villager',
      x: 2.0,
      y: 0,
      z: 4.5,
      isCrit: false,
    },
  });
  await flush();
  assert.ok(
    guestMsgs.some((m) => m.type === 'GAME_EVENT' && (m.payload as { event?: string })?.event === 'ANIMAL_DAMAGED'),
    'Crafted steel-sword hit animal cleanly',
  );
  assert.ok(
    guestMsgs.some((m) => m.type === 'GAME_EVENT' && (m.payload as { event?: string })?.event === 'NPC_DAMAGED'),
    'Melee cleave hit 2nd target on same attackId cleanly',
  );

  // Distinct rapid swing within cooldown is still blocked
  guestMsgs.length = 0;
  send(guestWs, guestId, 'GAME_EVENT', {
    event: 'COMBAT_HIT',
    data: {
      attackId: 'swing_spam_2',
      weaponId: 'steel-sword',
      targetKind: 'animal',
      targetId: 'animal-deer-0',
      archetype: 'deer',
      x: 1.5,
      y: 0,
      z: 4.5,
      isCrit: false,
    },
  });
  await flush();
  assert.ok(
    guestMsgs.some((m) => m.type === 'ERROR' && m.payload?.code === 'WEAPON_COOLDOWN'),
    'Rapid distinct melee swing still blocked by WEAPON_COOLDOWN',
  );
  await new Promise((r) => setTimeout(r, 360));

  // 6. Out-of-range COMBAT_HIT rejected
  guestMsgs.length = 0;
  send(guestWs, guestId, 'GAME_EVENT', {
    event: 'COMBAT_HIT',
    data: {
      weaponId: 'ranger-sword',
      targetKind: 'enemy',
      targetId: 'enemy-bandit_scout-0',
      archetype: 'bandit_scout',
      x: 120,
      y: 0,
      z: 120,
      isCrit: false,
    },
  });
  await flush();
  assert.ok(
    guestMsgs.some((m) => m.type === 'ERROR' && m.payload?.code === 'OUT_OF_RANGE'),
    'Out-of-range COMBAT_HIT rejected',
  );

  // 7. Valid ARROW_FIRED + PROJECTILE_HIT deducts server ammo & damages enemy authoritatively
  hostMsgs.length = 0;
  guestMsgs.length = 0;
  send(hostWs, hostId, 'GAME_EVENT', {
    event: 'ARROW_FIRED',
    data: {
      arrowId: 'arr_1',
      weaponId: 'hunter-bow',
      originX: 0.2,
      originY: 1.5,
      originZ: 4.1,
      dirX: 0,
      dirY: 0,
      dirZ: 1,
      bowCharge: 1,
    },
  });
  await flush();
  const arrowFiredMsg = guestMsgs.find(
    (m) => m.type === 'GAME_EVENT' && (m.payload as { event?: string })?.event === 'ARROW_FIRED',
  );
  assert.ok(arrowFiredMsg, 'ARROW_FIRED broadcast to guest');
  assert.equal((arrowFiredMsg!.payload!.data as { ammoCount: number }).ammoCount, 23);

  // Duplicate active arrowId rejected
  hostMsgs.length = 0;
  await new Promise((r) => setTimeout(r, 275));
  send(hostWs, hostId, 'GAME_EVENT', {
    event: 'ARROW_FIRED',
    data: {
      arrowId: 'arr_1',
      weaponId: 'hunter-bow',
      originX: 0.2,
      originY: 1.5,
      originZ: 4.1,
      dirX: 0,
      dirY: 0,
      dirZ: 1,
      bowCharge: 1,
    },
  });
  await flush();
  assert.ok(
    hostMsgs.some((m) => m.type === 'ERROR' && m.payload?.code === 'DUPLICATE_ARROW_ID'),
    'Duplicate active arrowId rejected',
  );

  // Projectile hit behind shooter trajectory rejected
  hostMsgs.length = 0;
  send(hostWs, hostId, 'GAME_EVENT', {
    event: 'ARROW_FIRED',
    data: {
      arrowId: 'arr_bad_traj',
      weaponId: 'hunter-bow',
      originX: 0.2,
      originY: 1.5,
      originZ: 4.1,
      dirX: 0,
      dirY: 0,
      dirZ: 1,
      bowCharge: 1,
    },
  });
  await flush();
  send(hostWs, hostId, 'GAME_EVENT', {
    event: 'PROJECTILE_HIT',
    data: {
      arrowId: 'arr_bad_traj',
      targetKind: 'world',
      targetId: '',
      x: 0.2,
      y: 1.5,
      z: -12,
      isHeadshot: false,
    },
  });
  await flush();
  assert.ok(
    hostMsgs.some((m) => m.type === 'ERROR' && m.payload?.code === 'INVALID_PROJECTILE_TRAJECTORY'),
    'Hit behind arrow launch vector rejected with INVALID_PROJECTILE_TRAJECTORY',
  );

  send(hostWs, hostId, 'GAME_EVENT', {
    event: 'PROJECTILE_HIT',
    data: {
      arrowId: 'arr_1',
      targetKind: 'enemy',
      targetId: 'enemy-bandit_scout-0',
      archetype: 'bandit_scout',
      x: 5,
      y: 1.4,
      z: 6,
      isHeadshot: true,
    },
  });
  await flush();
  const enemyDmg = guestMsgs.find(
    (m) => m.type === 'GAME_EVENT' && (m.payload as { event?: string })?.event === 'ENEMY_DAMAGED',
  );
  const enemyDied = guestMsgs.find(
    (m) => m.type === 'GAME_EVENT' && (m.payload as { event?: string })?.event === 'ENEMY_DIED',
  );
  assert.ok(enemyDmg, 'Server computed ENEMY_DAMAGED');
  assert.ok(enemyDied, 'Headshot full-charge bow killed 65 HP scout cleanly -> ENEMY_DIED');

  // 8. Exhaust all 24 starting arrows on guest -> 25th hits NO_AMMO
  for (let i = 0; i < 25; i++) {
    guestMsgs.length = 0;
    send(guestWs, guestId, 'GAME_EVENT', {
      event: 'ARROW_FIRED',
      data: { arrowId: `g_arr_${i}`, weaponId: 'hunter-bow', originX: 0, originY: 1.5, originZ: 4, dirX: 0, dirY: 0, dirZ: 1, bowCharge: 1 },
    });
    await new Promise((r) => setTimeout(r, 270));
  }
  const noAmmoErr = guestMsgs.find((m) => m.type === 'ERROR' && m.payload?.code === 'NO_AMMO');
  assert.ok(noAmmoErr, '25th arrow rejected with NO_AMMO by server');

  // Crafting 12 arrows restores server ammo
  send(guestWs, guestId, 'GAME_EVENT', { event: 'WORLD_EVENT', data: { kind: 'ammo_crafted', count: 12 } });
  await flush();
  guestMsgs.length = 0;
  send(guestWs, guestId, 'GAME_EVENT', {
    event: 'ARROW_FIRED',
    data: { arrowId: 'g_arr_crafted', weaponId: 'hunter-bow', originX: 0, originY: 1.5, originZ: 4, dirX: 0, dirY: 0, dirZ: 1, bowCharge: 0.5 },
  });
  await flush();
  assert.ok(
    guestMsgs.some((m) => m.type === 'GAME_EVENT' && (m.payload as { event?: string })?.event === 'ARROW_FIRED'),
    'Crafted ammo allows firing again',
  );

  // 9. Atomic Chest, Resource, Item Drop/Pickup, Door, Bed, Quest
  guestMsgs.length = 0;
  send(hostWs, hostId, 'GAME_EVENT', { event: 'CHEST_OPENED', data: { chestId: 'chest-1', hasArrows: false, x: 1, y: 0, z: 4 } });
  await flush();
  send(guestWs, guestId, 'GAME_EVENT', { event: 'CHEST_OPENED', data: { chestId: 'chest-1', hasArrows: false, x: 1, y: 0, z: 4 } });
  await flush();
  assert.ok(
    guestMsgs.some((m) => m.type === 'ERROR' && m.payload?.code === 'CHEST_ALREADY_OPENED'),
    'Double chest open prevented',
  );

  send(hostWs, hostId, 'GAME_EVENT', { event: 'ITEM_DROPPED', data: { dropId: 'drop_1', itemId: 'wood', count: 3, label: 'Wood', x: 1, y: 0, z: 4 } });
  await flush();
  send(guestWs, guestId, 'GAME_EVENT', { event: 'ITEM_PICKED_UP', data: { pickupId: 'drop_1', x: 1, z: 4 } });
  await flush();
  hostMsgs.length = 0;
  send(hostWs, hostId, 'GAME_EVENT', { event: 'ITEM_PICKED_UP', data: { pickupId: 'drop_1', x: 1, z: 4 } });
  await flush();
  assert.ok(
    hostMsgs.some((m) => m.type === 'ERROR' && m.payload?.code === 'ALREADY_COLLECTED'),
    'Item drop can only be claimed once',
  );

  send(hostWs, hostId, 'GAME_EVENT', { event: 'DOOR_OPENED', data: { doorId: 'door-1', x: 1, z: 4 } });
  send(hostWs, hostId, 'GAME_EVENT', { event: 'BED_PLACED', data: { bedId: 'bed-1', x: 1, y: 0, z: 4, yaw: 0.5 } });
  send(hostWs, hostId, 'GAME_EVENT', { event: 'BED_USED', data: { bedId: 'bed-1', x: 1, z: 4 } });
  send(hostWs, hostId, 'GAME_EVENT', { event: 'QUEST_UPDATED', data: { questId: 'quest-1', status: 'active', stepIndex: 2 } });
  send(hostWs, hostId, 'GAME_EVENT', { event: 'WORLD_EVENT', data: { kind: 'landmark_discovered', landmarkId: 'lm-ruins' } });
  await flush();

  // 10. Reconnect snapshot contains full synchronized world state
  const reconnectWsRes = (await roomDO.fetch(
    new Request(`https://internal/ws?playerId=${guestId}&token=${joinJson.sessionToken}`, {
      headers: { Upgrade: 'websocket' },
    }),
  )) as unknown as { status: number; webSocket: MockWebSocket };
  guestWs = reconnectWsRes.webSocket;
  guestMsgs = collectMessages(guestWs);
  await flush();
  const snap = guestMsgs.find((m) => m.type === 'WORLD_SNAPSHOT')?.payload as Record<string, unknown>;
  assert.ok(snap, 'Reconnect receives WORLD_SNAPSHOT');
  assert.deepEqual(snap.openedChests, ['chest-1']);
  assert.equal((snap.doors as Array<{ id: string; isOpen: boolean }>)[0].isOpen, true);
  assert.equal((snap.placedBeds as Array<{ id: string }>)[0].id, 'bed-1');
  assert.equal((snap.quests as Array<{ questId: string }>)[0].questId, 'quest-1');
  assert.ok((snap.discoveredLandmarks as string[]).includes('lm-ruins'));
  assert.equal(snap.ammoCount, 11);
  assert.equal(snap.worldHours, 6.5);

  // 11. Room Chat (English & Arabic BiDi, authoritative sender, length limits, anti-spam)
  hostMsgs.length = 0;
  guestMsgs.length = 0;
  send(hostWs, hostId, 'ROOM_CHAT', {
    message: 'مرحبا بكم في وادي أوكهولو! Welcome!',
    playerName: 'SpoofedAdmin',
    playerId: 'spoofed_id',
  });
  await flush();
  const relayedChat = guestMsgs.find((m) => m.type === 'ROOM_CHAT');
  assert.ok(relayedChat, 'Guest receives ROOM_CHAT broadcast');
  assert.equal(relayedChat!.payload?.playerId, hostId, 'Server stamps authoritative playerId');
  assert.equal(relayedChat!.payload?.playerName, 'HostOne', 'Server stamps authoritative playerName');
  assert.equal(relayedChat!.payload?.message, 'مرحبا بكم في وادي أوكهولو! Welcome!');
  assert.equal(typeof relayedChat!.payload?.timestamp, 'number');
  assert.equal(typeof relayedChat!.payload?.id, 'string');

  // Empty & overlength messages rejected
  guestMsgs.length = 0;
  send(guestWs, guestId, 'ROOM_CHAT', { message: '   ' });
  await flush();
  assert.ok(
    guestMsgs.some((m) => m.type === 'ERROR' && m.payload?.code === 'EMPTY_CHAT_MESSAGE'),
    'Empty chat message rejected',
  );

  guestMsgs.length = 0;
  send(guestWs, guestId, 'ROOM_CHAT', { message: 'x'.repeat(245) });
  await flush();
  assert.ok(
    guestMsgs.some((m) => m.type === 'ERROR' && m.payload?.code === 'CHAT_TOO_LONG'),
    'Overlength chat message (>240) rejected',
  );

  // Cooldown anti-spam & duplicate message suppression
  hostMsgs.length = 0;
  send(hostWs, hostId, 'ROOM_CHAT', { message: 'Immediate burst' });
  await flush();
  assert.ok(
    hostMsgs.some((m) => m.type === 'ERROR' && m.payload?.code === 'CHAT_SPAM_LIMITED'),
    'Rapid burst blocked by cooldown anti-spam',
  );

  await new Promise((r) => setTimeout(r, 950));
  hostMsgs.length = 0;
  send(hostWs, hostId, 'ROOM_CHAT', { message: 'مرحبا بكم في وادي أوكهولو! Welcome!' });
  await flush();
  assert.ok(
    hostMsgs.some((m) => m.type === 'ERROR' && m.payload?.code === 'CHAT_DUPLICATE_SPAM'),
    'Duplicate message blocked by anti-spam',
  );

  await new Promise((r) => setTimeout(r, 950));
  send(guestWs, guestId, 'ROOM_CHAT', { message: 'Ready near the bridge.' });
  await flush();

  // 12. Player Report (REPORT_ACK, self-report rejected, duplicate report rejected)
  guestMsgs.length = 0;
  send(guestWs, guestId, 'PLAYER_REPORT', {
    targetPlayerId: guestId,
    reason: 'spam',
  });
  await flush();
  assert.ok(
    guestMsgs.some((m) => m.type === 'ERROR' && m.payload?.code === 'CANNOT_REPORT_SELF'),
    'Self-report rejected with CANNOT_REPORT_SELF',
  );

  guestMsgs.length = 0;
  send(guestWs, guestId, 'PLAYER_REPORT', {
    targetPlayerId: hostId,
    reason: 'spam',
    details: 'Repeated pings near village.',
  });
  await flush();
  const reportAck = guestMsgs.find((m) => m.type === 'REPORT_ACK');
  assert.ok(reportAck, 'Valid PLAYER_REPORT returns REPORT_ACK');
  assert.equal(reportAck!.payload?.targetPlayerId, hostId);
  assert.equal(reportAck!.payload?.reason, 'spam');

  guestMsgs.length = 0;
  send(guestWs, guestId, 'PLAYER_REPORT', {
    targetPlayerId: hostId,
    reason: 'harassment',
  });
  await flush();
  assert.ok(
    guestMsgs.some((m) => m.type === 'ERROR' && m.payload?.code === 'REPORT_ALREADY_SUBMITTED'),
    'Duplicate report in same room rejected with REPORT_ALREADY_SUBMITTED',
  );

  // 13. Reconnect receives CHAT_HISTORY + stored reports contain zero sensitive data
  const chatReconWsRes = (await roomDO.fetch(
    new Request(`https://internal/ws?playerId=${guestId}&token=${joinJson.sessionToken}`, {
      headers: { Upgrade: 'websocket' },
    }),
  )) as unknown as { status: number; webSocket: MockWebSocket };
  guestWs = chatReconWsRes.webSocket;
  guestMsgs = collectMessages(guestWs);
  await flush();
  const chatHistory = guestMsgs.find((m) => m.type === 'CHAT_HISTORY')?.payload as {
    messages?: Array<{ message: string }>;
  };
  assert.ok(chatHistory && Array.isArray(chatHistory.messages), 'Reconnect receives CHAT_HISTORY');
  assert.equal(chatHistory.messages!.length, 2, 'CHAT_HISTORY preserves recent room messages');

  const storedRoom = await state.storage.get<{
    reports?: Array<Record<string, unknown>>;
  }>('authoritative_room_v1');
  assert.equal(storedRoom?.reports?.length, 1);
  assert.equal('ip' in (storedRoom?.reports?.[0] ?? {}), false);
  assert.equal('token' in (storedRoom?.reports?.[0] ?? {}), false);

  // 14. Unexpected WebSocket drop preserves room membership & restores full state on reconnect
  send(hostWs, hostId, 'PLAYER_STATE', { x: 12.5, y: 1.0, z: -8.25, yaw: 1.75 });
  await flush();
  guestMsgs.length = 0;
  // Simulate guest abrupt network drop
  guestWs.close(1006, 'Network changed');
  await flush();
  const roomAfterDropRes = await roomDO.fetch(new Request('https://internal/state'));
  const roomAfterDrop = (await roomAfterDropRes.json()) as {
    ok: boolean;
    room: { players: Array<{ playerId: string; connectionQuality?: string }> };
  };
  const droppedGuestRecord = roomAfterDrop.room.players.find((p) => p.playerId === guestId);
  assert.ok(droppedGuestRecord, 'Abrupt disconnect preserves guest membership inside grace window');
  assert.equal(droppedGuestRecord?.connectionQuality, 'disconnected');

  const guestRejoinWsRes = (await roomDO.fetch(
    new Request(`https://internal/ws?playerId=${guestId}&token=${joinJson.sessionToken}`, {
      headers: { Upgrade: 'websocket' },
    }),
  )) as unknown as { status: number; webSocket: MockWebSocket };
  const guestRejoinWs = guestRejoinWsRes.webSocket;
  const guestRejoinMsgs = collectMessages(guestRejoinWs);
  await flush();
  assert.ok(
    guestRejoinMsgs.some((m) => m.type === 'CONNECT' && m.playerId === guestId),
    'Reconnect restores network identity via CONNECT',
  );
  assert.ok(
    guestRejoinMsgs.some((m) => m.type === 'ROOM_STATE'),
    'Reconnect receives current ROOM_STATE',
  );
  assert.ok(
    guestRejoinMsgs.some(
      (m) =>
        m.type === 'PLAYER_STATE' &&
        m.playerId === hostId &&
        Math.abs(Number(m.payload?.x) - 12.5) < 0.01,
    ),
    'Reconnect receives peer PLAYER_STATEs',
  );
  assert.ok(
    guestRejoinMsgs.some((m) => m.type === 'WORLD_SNAPSHOT'),
    'Reconnect receives important WORLD_SNAPSHOT',
  );

  // 15. Simulated server / Durable Object restart recovers room + world + identities on reconnect
  const restartedDO = new MultiplayerRoomDO(
    state as never,
    createMockEnv({ HOST_DISCONNECT_GRACE_MS: '80', PLAYER_RECONNECT_GRACE_MS: '180' }) as never,
  );
  const hostAfterRestartRes = (await restartedDO.fetch(
    new Request(`https://internal/ws?playerId=${hostId}&token=${createJson.sessionToken}`, {
      headers: { Upgrade: 'websocket' },
    }),
  )) as unknown as { status: number; webSocket: MockWebSocket };
  const hostAfterRestartWs = hostAfterRestartRes.webSocket;
  const hostAfterRestartMsgs = collectMessages(hostAfterRestartWs);
  const guestAfterRestartRes = (await restartedDO.fetch(
    new Request(`https://internal/ws?playerId=${guestId}&token=${joinJson.sessionToken}`, {
      headers: { Upgrade: 'websocket' },
    }),
  )) as unknown as { status: number; webSocket: MockWebSocket };
  const guestAfterRestartWs = guestAfterRestartRes.webSocket;
  const guestAfterRestartMsgs = collectMessages(guestAfterRestartWs);
  await flush();
  assert.ok(
    hostAfterRestartMsgs.some((m) => m.type === 'WORLD_SNAPSHOT'),
    'Host recovers WORLD_SNAPSHOT after DO server restart',
  );
  assert.ok(
    guestAfterRestartMsgs.some((m) => m.type === 'ROOM_STATE'),
    'Guest recovers ROOM_STATE after DO server restart',
  );

  // 16. Host unexpected disconnect transfers host authority after grace period
  guestAfterRestartMsgs.length = 0;
  hostAfterRestartWs.close(1006, 'Wi-Fi disconnected');
  await new Promise((r) => setTimeout(r, 110));
  await restartedDO.alarm();
  await flush();
  assert.ok(
    guestAfterRestartMsgs.some(
      (m) => m.type === 'HOST_TRANSFERRED' && m.payload?.newHostId === guestId,
    ),
    'Host authority automatically transfers to connected guest after grace timeout',
  );

  // 17. Disconnected player past reconnect grace timeout is removed cleanly by DO alarm
  await new Promise((r) => setTimeout(r, 110));
  await restartedDO.alarm();
  await flush();
  const postTimeoutStateRes = await restartedDO.fetch(new Request('https://internal/state'));
  const postTimeoutState = (await postTimeoutStateRes.json()) as {
    room: { players: Array<{ playerId: string }>; hostId: string };
  };
  assert.equal(postTimeoutState.room.hostId, guestId);
  assert.equal(
    postTimeoutState.room.players.some((p) => p.playerId === hostId),
    false,
    'Timed-out disconnected player purged cleanly by server alarm',
  );

  // 18. Closing room cleanly emits ROOM_CLOSED, closes client WS, and deletes room state
  guestAfterRestartMsgs.length = 0;
  send(guestAfterRestartWs, guestId, 'CLOSE_ROOM');
  await flush();
  assert.ok(
    guestAfterRestartMsgs.some((m) => m.type === 'ROOM_CLOSED'),
    'CLOSE_ROOM broadcasts ROOM_CLOSED to clients',
  );
  assert.equal(guestAfterRestartWs.closed, true, 'CLOSE_ROOM closes connected client socket');
  const closedStateRes = await restartedDO.fetch(new Request('https://internal/state'));
  assert.equal(closedStateRes.status, 404, 'Closed room returns 404 from DO');

  // 19. Production Security: Movement speedhack, fake static weapon pickup, bed spam, oversized payload
  const secState = createMockState();
  const secRoom = new MultiplayerRoomDO(secState as never, createMockEnv() as never);
  const secRoomId = 'room_sec_test_999';
  const secCreate = (await (
    await secRoom.fetch(
      new Request('https://internal/init', {
        method: 'POST',
        body: JSON.stringify({
          roomId: secRoomId,
          roomName: 'Security Arena',
          playerName: 'SecHost',
          worldType: 'normal',
          maxPlayers: 16,
        }),
      }),
    )
  ).json()) as { playerId: string; sessionToken: string };
  const secHostId = secCreate.playerId;
  const secHostWsRes = (await secRoom.fetch(
    new Request(
      `https://internal/ws?playerId=${secHostId}&token=${secCreate.sessionToken}`,
      { headers: { Upgrade: 'websocket', 'X-Client-IP': '203.0.113.10' } },
    ),
  )) as unknown as { status: number; webSocket: MockWebSocket };
  const secHostWs = secHostWsRes.webSocket;
  const secMsgs = collectMessages(secHostWs);
  await flush();

  const sendSec = (ws: MockWebSocket, pid: string, type: string, payload?: unknown) => {
    ws.send(
      JSON.stringify({ v: 1, type, roomId: secRoomId, playerId: pid, timestamp: Date.now(), payload }),
    );
  };
  sendSec(secHostWs, secHostId, 'START_GAME');
  await flush();

  // 19a. Packet-burst speedhack / teleport rejected
  secMsgs.length = 0;
  sendSec(secHostWs, secHostId, 'PLAYER_STATE', { x: 0, y: 0, z: 4, yaw: 0 });
  await flush();
  for (let step = 1; step <= 6; step++) {
    sendSec(secHostWs, secHostId, 'PLAYER_STATE', { x: step * 5, y: 0, z: 4, yaw: 0 });
  }
  await flush();
  assert.ok(
    secMsgs.some((m) => m.type === 'ERROR' && m.payload?.code === 'INVALID_POSITION_DELTA') &&
      secMsgs.some((m) => m.type === 'POSITION_CORRECTION'),
    'Packet-burst speedhack rejected with INVALID_POSITION_DELTA + POSITION_CORRECTION',
  );

  // 19b. Fake static pickup weapon fabrication rejected
  secMsgs.length = 0;
  sendSec(secHostWs, secHostId, 'GAME_EVENT', {
    event: 'ITEM_PICKED_UP',
    data: { pickupId: 'fake_static_pickup_1', itemId: 'steel-sword', count: 4, x: 0, z: 4 },
  });
  await flush();
  assert.ok(
    secMsgs.some((m) => m.type === 'ERROR' && m.payload?.code === 'FORBIDDEN_ITEM_GRANT'),
    'Untracked static pickup weapon grant rejected with FORBIDDEN_ITEM_GRANT',
  );

  // 19c. Bed heal spam blocked by cooldown
  sendSec(secHostWs, secHostId, 'GAME_EVENT', {
    event: 'BED_USED',
    data: { bedId: 'bed-sec-1', x: 0, z: 4 },
  });
  await flush();
  secMsgs.length = 0;
  sendSec(secHostWs, secHostId, 'GAME_EVENT', {
    event: 'BED_USED',
    data: { bedId: 'bed-sec-1', x: 0, z: 4 },
  });
  await flush();
  assert.ok(
    secMsgs.some((m) => m.type === 'ERROR' && m.payload?.code === 'BED_COOLDOWN'),
    'Immediate repeated BED_USED rejected with BED_COOLDOWN',
  );

  // 19d. Oversized WS message (>4096 bytes) rejected
  secMsgs.length = 0;
  secHostWs.send(
    JSON.stringify({
      v: 1,
      type: 'ROOM_CHAT',
      roomId: secRoomId,
      playerId: secHostId,
      timestamp: Date.now(),
      payload: { message: 'a'.repeat(4500) },
    }),
  );
  await flush();
  assert.ok(
    secMsgs.some((m) => m.type === 'ERROR' && m.payload?.code === 'MESSAGE_SIZE_EXCEEDED'),
    'Oversized WebSocket payload rejected with MESSAGE_SIZE_EXCEEDED',
  );

  // 19e. Per-IP concurrent WebSocket limit (8 max per IP) enforced
  secHostWs.close(1000, 'Done');
  const limitState = createMockState();
  const limitRoom = new MultiplayerRoomDO(limitState as never, createMockEnv() as never);
  await limitRoom.fetch(
    new Request('https://internal/init', {
      method: 'POST',
      body: JSON.stringify({
        roomId: 'room_limit_test_888',
        roomName: 'Limit Arena',
        playerName: 'LimitHost',
        worldType: 'normal',
        maxPlayers: 16,
      }),
    }),
  );
  const floodSockets: MockWebSocket[] = [];
  for (let idx = 0; idx < 8; idx++) {
    const jRes = (await (
      await limitRoom.fetch(
        new Request('https://internal/join', {
          method: 'POST',
          body: JSON.stringify({ playerName: `Flood_${idx}` }),
        }),
      )
    ).json()) as { playerId: string; sessionToken: string };
    const wsRes = (await limitRoom.fetch(
      new Request(
        `https://internal/ws?playerId=${jRes.playerId}&token=${jRes.sessionToken}`,
        { headers: { Upgrade: 'websocket', 'X-Client-IP': '203.0.113.10' } },
      ),
    )) as unknown as { status: number; webSocket: MockWebSocket };
    assert.equal(wsRes.status, 101);
    floodSockets.push(wsRes.webSocket);
  }
  const extraJoin = (await (
    await limitRoom.fetch(
      new Request('https://internal/join', {
        method: 'POST',
        body: JSON.stringify({ playerName: 'Flood_OverLimit' }),
      }),
    )
  ).json()) as { playerId: string; sessionToken: string };
  const overLimitRes = await limitRoom.fetch(
    new Request(
      `https://internal/ws?playerId=${extraJoin.playerId}&token=${extraJoin.sessionToken}`,
      { headers: { Upgrade: 'websocket', 'X-Client-IP': '203.0.113.10' } },
    ),
  );
  assert.equal(overLimitRes.status, 429, 'Per-IP simultaneous WebSocket connection cap returns 429');
  for (const s of floodSockets) s.close(1000, 'Done');

  // 20. Full Worker HTTP Router + RoomDirectoryDO + MultiplayerRoomDO integration test
  const dirState = createMockState();
  const profilesState = createMockState();
  const roomMap = new Map<string, MultiplayerRoomDO>();
  let fullEnv: ReturnType<typeof createMockEnv>;
  const dirDO = new RoomDirectoryDO(dirState as never, {} as never);
  const profileDO = new PlayerProfileDO(profilesState as never, {} as never);
  fullEnv = createMockEnv({
    ENVIRONMENT: 'production',
    ROOM_DIRECTORY: {
      idFromName: (n: string) => ({ toString: () => n, equals: () => false }),
      idFromString: (n: string) => ({ toString: () => n, equals: () => false }),
      newUniqueId: () => ({ toString: () => 'dir', equals: () => false }),
      get: () => ({
        fetch: (req: RequestInfo | URL, init?: RequestInit) =>
          dirDO.fetch(typeof req === 'string' ? new Request(req, init) : (req as Request)),
      }),
    },
    PLAYER_PROFILES: {
      idFromName: (n: string) => ({ toString: () => n, equals: () => false }),
      idFromString: (n: string) => ({ toString: () => n, equals: () => false }),
      newUniqueId: () => ({ toString: () => 'prof', equals: () => false }),
      get: () => ({
        fetch: (req: RequestInfo | URL, init?: RequestInit) =>
          profileDO.fetch(typeof req === 'string' ? new Request(req, init) : (req as Request)),
      }),
    },
    MULTIPLAYER_ROOMS: {
      idFromName: (n: string) => ({ toString: () => n, equals: () => false }),
      idFromString: (n: string) => ({ toString: () => n, equals: () => false }),
      newUniqueId: () => ({ toString: () => 'rm', equals: () => false }),
      get: (id: { toString: () => string }) => {
        const key = id.toString();
        let instance = roomMap.get(key);
        if (!instance) {
          instance = new MultiplayerRoomDO(createMockState() as never, fullEnv as never);
          roomMap.set(key, instance);
        }
        return {
          fetch: (req: RequestInfo | URL, init?: RequestInit) =>
            instance!.fetch(typeof req === 'string' ? new Request(req, init) : (req as Request)),
        };
      },
    },
  });

  const ctxStub = { waitUntil: () => {}, passThroughOnException: () => {} };
  const healthRes = await workerApp.fetch(
    new Request('https://worker.example/health'),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(healthRes.status, 200);
  const healthJson = (await healthRes.json()) as { ok: boolean; environment: string };
  assert.equal(healthJson.ok, true);
  assert.equal(healthJson.environment, 'production');

  // Oversized HTTP body rejected with 413
  const hugeHttpRes = await workerApp.fetch(
    new Request('https://worker.example/api/multiplayer/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '198.51.100.5' },
      body: JSON.stringify({ playerName: 'x'.repeat(20_000) }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(hugeHttpRes.status, 413, 'Oversized HTTP POST rejected with 413');

  // Create room via Worker router
  const createHttpRes = await workerApp.fetch(
    new Request('https://worker.example/api/multiplayer/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '198.51.100.5' },
      body: JSON.stringify({
        roomName: 'Oakhollow Production Coop',
        playerName: 'AtlasHost',
        worldType: 'normal',
        maxPlayers: 4,
        privacy: 'public',
      }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(createHttpRes.status, 200);
  const createdRoom = (await createHttpRes.json()) as {
    ok: boolean;
    playerId: string;
    sessionToken: string;
    room: { roomId: string; roomCode: string };
  };
  assert.equal(createdRoom.ok, true);

  // Verify room by code
  const verifyRes = await workerApp.fetch(
    new Request(
      `https://worker.example/api/multiplayer/rooms/verify?codeOrId=${createdRoom.room.roomCode}`,
      { headers: { 'CF-Connecting-IP': '198.51.100.6' } },
    ),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(verifyRes.status, 200);

  // Unauthenticated invite rejected (403)
  const badInviteRes = await workerApp.fetch(
    new Request('https://worker.example/api/multiplayer/invites', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '198.51.100.7' },
      body: JSON.stringify({
        roomId: createdRoom.room.roomId,
        fromPlayerId: createdRoom.playerId,
        sessionToken: 'forged_token',
        toPlayerName: 'FriendBob',
      }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(badInviteRes.status, 403, 'Forged invite without valid sessionToken rejected');

  // Authenticated invite -> list -> accept -> join
  const goodInviteRes = await workerApp.fetch(
    new Request('https://worker.example/api/multiplayer/invites', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '198.51.100.5' },
      body: JSON.stringify({
        roomId: createdRoom.room.roomId,
        fromPlayerId: createdRoom.playerId,
        sessionToken: createdRoom.sessionToken,
        toPlayerName: 'FriendBob',
      }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(goodInviteRes.status, 200);
  const invPayload = (await goodInviteRes.json()) as { invite: { inviteId: string } };
  const listInvRes = await workerApp.fetch(
    new Request('https://worker.example/api/multiplayer/invites?playerName=FriendBob', {
      headers: { 'CF-Connecting-IP': '198.51.100.8' },
    }),
    fullEnv as never,
    ctxStub,
  );
  const listInvJson = (await listInvRes.json()) as { invites: Array<{ inviteId: string }> };
  assert.equal(listInvJson.invites.length, 1);

  const acceptInvRes = await workerApp.fetch(
    new Request('https://worker.example/api/multiplayer/invites/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '198.51.100.8' },
      body: JSON.stringify({
        inviteId: invPayload.invite.inviteId,
        playerName: 'FriendBob',
      }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(acceptInvRes.status, 200);
  const acceptedJson = (await acceptInvRes.json()) as {
    ok: boolean;
    room: { players: Array<{ displayName: string }> };
  };
  assert.equal(acceptedJson.ok, true);
  assert.equal(acceptedJson.room.players.length, 2);

  // 21. Player Profile & Online Identity System end-to-end verification
  // 21a. Invalid display names (<3 chars, >20 chars, XSS script) rejected
  const shortNameRes = await workerApp.fetch(
    new Request('https://worker.example/api/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '198.51.100.21' },
      body: JSON.stringify({ displayName: 'Ab' }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(shortNameRes.status, 400, 'Display name shorter than 3 chars rejected');

  const longNameRes = await workerApp.fetch(
    new Request('https://worker.example/api/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '198.51.100.21' },
      body: JSON.stringify({ displayName: 'X'.repeat(21) }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(longNameRes.status, 400, 'Display name longer than 20 chars rejected');

  const xssNameRes = await workerApp.fetch(
    new Request('https://worker.example/api/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '198.51.100.21' },
      body: JSON.stringify({ displayName: '<script>x</script>' }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(xssNameRes.status, 400, 'HTML/script dangerous displayName rejected');

  // 21b. Create Arabic & English profiles with server-issued CSPRNG WA-... IDs (ignoring forged client IDs/stats)
  const createP1Res = await workerApp.fetch(
    new Request('https://worker.example/api/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '198.51.100.22' },
      body: JSON.stringify({
        displayName: 'المغامر 1',
        playerTag: '4827',
        publicProfileId: 'WA-FORGED00',
        accountId: 'acc_forged',
        stats: { level: 99, enemiesDefeated: 9999 },
        avatar: { kind: 'preset', value: 'ranger' },
        bio: 'Exploring Oakhollow',
        country: 'SA',
        favoriteGameMode: 'adventure',
      }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(createP1Res.status, 201);
  const p1Data = (await createP1Res.json()) as {
    ok: boolean;
    sessionToken: string;
    profile: {
      publicProfileId: string;
      displayName: string;
      playerTag: string;
      stats: { level: number; enemiesDefeated: number };
      accountId?: string;
      tokenHash?: string;
    };
  };
  assert.equal(p1Data.ok, true);
  assert.match(p1Data.profile.publicProfileId, /^WA-[A-Z0-9]{6,10}$/);
  assert.notEqual(p1Data.profile.publicProfileId, 'WA-FORGED00', 'Client cannot spoof publicProfileId');
  assert.equal(p1Data.profile.stats.level, 1, 'Client cannot spoof initial level');
  assert.equal(p1Data.profile.stats.enemiesDefeated, 0, 'Client cannot spoof initial stats');
  assert.equal('accountId' in p1Data.profile, false, 'Internal accountId never exposed');
  assert.equal('tokenHash' in p1Data.profile, false, 'Internal tokenHash never exposed');

  const createP2Res = await workerApp.fetch(
    new Request('https://worker.example/api/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '198.51.100.23' },
      body: JSON.stringify({
        displayName: 'Shadow123',
        playerTag: '9001',
        avatar: { kind: 'generated', value: 'Shadow123' },
        favoriteGameMode: 'survival',
      }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(createP2Res.status, 201);
  const p2Data = (await createP2Res.json()) as {
    ok: boolean;
    sessionToken: string;
    profile: { publicProfileId: string; displayName: string; playerTag: string };
  };
  assert.notEqual(p1Data.profile.publicProfileId, p2Data.profile.publicProfileId);

  // 21c. Immutable field modification rejected + valid update succeeds + invalid avatar rejected
  const tamperIdRes = await workerApp.fetch(
    new Request('https://worker.example/api/profile/update', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${p1Data.sessionToken}`,
        'CF-Connecting-IP': '198.51.100.22',
      },
      body: JSON.stringify({ publicProfileId: 'WA-99999999' }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(tamperIdRes.status, 403, 'Modifying permanent publicProfileId rejected with 403');

  const badAvatarRes = await workerApp.fetch(
    new Request('https://worker.example/api/profile/update', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${p1Data.sessionToken}`,
        'CF-Connecting-IP': '198.51.100.22',
      },
      body: JSON.stringify({
        avatar: { kind: 'uploaded', value: 'data:text/html;base64,PHNjcmlwdD4=' },
      }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(badAvatarRes.status, 400, 'Non-image custom avatar data URL rejected');

  const updateP2Res = await workerApp.fetch(
    new Request('https://worker.example/api/profile/update', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${p2Data.sessionToken}`,
        'CF-Connecting-IP': '198.51.100.23',
      },
      body: JSON.stringify({
        bio: 'Night scout',
        privacy: { showOnlineStatus: false },
      }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(updateP2Res.status, 200);

  // Viewer sees P2 as offline when showOnlineStatus is false
  const viewP2Res = await workerApp.fetch(
    new Request(`https://worker.example/api/profile/${p2Data.profile.publicProfileId}`, {
      headers: {
        Authorization: `Bearer ${p1Data.sessionToken}`,
        'CF-Connecting-IP': '198.51.100.22',
      },
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(viewP2Res.status, 200);
  const viewP2Json = (await viewP2Res.json()) as {
    profile: { presenceStatus: string; isOnlineVisible: boolean; bio: string };
  };
  assert.equal(viewP2Json.profile.presenceStatus, 'offline');
  assert.equal(viewP2Json.profile.isOnlineVisible, false);
  assert.equal(viewP2Json.profile.bio, 'Night scout');

  // 21d. Player search by WA-ID, Name#Tag, #Tag, and Display Name
  for (const q of [p2Data.profile.publicProfileId, 'Shadow123#9001', '#9001', 'Shadow']) {
    const searchRes = await workerApp.fetch(
      new Request(`https://worker.example/api/players/search?q=${encodeURIComponent(q)}`, {
        headers: {
          Authorization: `Bearer ${p1Data.sessionToken}`,
          'CF-Connecting-IP': '198.51.100.22',
        },
      }),
      fullEnv as never,
      ctxStub,
    );
    assert.equal(searchRes.status, 200);
    const searchJson = (await searchRes.json()) as {
      results: Array<{ publicProfileId: string }>;
    };
    assert.ok(
      searchJson.results.some((r) => r.publicProfileId === p2Data.profile.publicProfileId),
      `Search query "${q}" finds P2`,
    );
  }

  // 21e. Friend requests lifecycle + privacy gates + direct messages + blocking
  const frRes = await workerApp.fetch(
    new Request('https://worker.example/api/friends/request', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${p1Data.sessionToken}`,
        'CF-Connecting-IP': '198.51.100.22',
      },
      body: JSON.stringify({ targetPublicProfileId: p2Data.profile.publicProfileId }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(frRes.status, 200);
  const frJson = (await frRes.json()) as { ok: boolean; requestId: string };
  assert.equal(frJson.ok, true);

  // Duplicate request rejected with 409
  const dupFrRes = await workerApp.fetch(
    new Request('https://worker.example/api/friends/request', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${p1Data.sessionToken}`,
        'CF-Connecting-IP': '198.51.100.22',
      },
      body: JSON.stringify({ targetPublicProfileId: p2Data.profile.publicProfileId }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(dupFrRes.status, 409);

  // Accept friend request
  const acceptFrRes = await workerApp.fetch(
    new Request('https://worker.example/api/friends/respond', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${p2Data.sessionToken}`,
        'CF-Connecting-IP': '198.51.100.23',
      },
      body: JSON.stringify({ requestId: frJson.requestId, action: 'accept' }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(acceptFrRes.status, 200);

  // Direct message allowed between friends, then verify friends-only & nobody privacy
  const dmRes = await workerApp.fetch(
    new Request('https://worker.example/api/messages/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${p1Data.sessionToken}`,
        'CF-Connecting-IP': '198.51.100.22',
      },
      body: JSON.stringify({
        toPublicProfileId: p2Data.profile.publicProfileId,
        message: 'جاهز للمغامرة؟',
      }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(dmRes.status, 200);

  const threadRes = await workerApp.fetch(
    new Request(`https://worker.example/api/messages?with=${p1Data.profile.publicProfileId}`, {
      headers: {
        Authorization: `Bearer ${p2Data.sessionToken}`,
        'CF-Connecting-IP': '198.51.100.23',
      },
    }),
    fullEnv as never,
    ctxStub,
  );
  const threadJson = (await threadRes.json()) as {
    messages: Array<{ fromPublicProfileId: string; message: string }>;
  };
  assert.equal(threadJson.messages.length, 1);
  assert.equal(threadJson.messages[0].fromPublicProfileId, p1Data.profile.publicProfileId);

  // Set P2 allowMessages = 'nobody' -> DM blocked
  await workerApp.fetch(
    new Request('https://worker.example/api/profile/update', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${p2Data.sessionToken}`,
        'CF-Connecting-IP': '198.51.100.23',
      },
      body: JSON.stringify({ privacy: { allowMessages: 'nobody', allowGameInvites: false } }),
    }),
    fullEnv as never,
    ctxStub,
  );
  await new Promise((r) => setTimeout(r, 1250));
  const blockedDmRes = await workerApp.fetch(
    new Request('https://worker.example/api/messages/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${p1Data.sessionToken}`,
        'CF-Connecting-IP': '198.51.100.22',
      },
      body: JSON.stringify({
        toPublicProfileId: p2Data.profile.publicProfileId,
        message: 'Should be blocked by privacy',
      }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(blockedDmRes.status, 403, 'allowMessages: nobody blocks DMs');

  // 21f. Verified profile identity stamped onto room roster & chat (anti-spoofing) + invite privacy check
  const p1CreateRoomRes = await workerApp.fetch(
    new Request('https://worker.example/api/multiplayer/rooms', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${p1Data.sessionToken}`,
        'CF-Connecting-IP': '198.51.100.22',
      },
      body: JSON.stringify({
        roomName: 'Identity Verified Room',
        playerName: 'SpoofedClientName',
        publicProfileId: 'WA-FAKE9999',
        worldType: 'normal',
        maxPlayers: 4,
      }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(p1CreateRoomRes.status, 200);
  const p1RoomData = (await p1CreateRoomRes.json()) as {
    playerId: string;
    sessionToken: string;
    room: {
      roomId: string;
      roomCode: string;
      players: Array<{
        playerId: string;
        displayName: string;
        publicProfileId?: string;
        playerTag?: string;
        avatar?: { kind: string; value?: string };
      }>;
    };
  };
  assert.equal(p1RoomData.room.players[0].displayName, 'المغامر 1', 'Server stamps verified profile displayName');
  assert.equal(p1RoomData.room.players[0].publicProfileId, p1Data.profile.publicProfileId);
  assert.equal(p1RoomData.room.players[0].playerTag, '4827');
  assert.equal(p1RoomData.room.players[0].avatar?.value, 'ranger');

  // Invite to P2 blocked when allowGameInvites is false
  const blockedInviteRes = await workerApp.fetch(
    new Request('https://worker.example/api/multiplayer/invites', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'CF-Connecting-IP': '198.51.100.22',
      },
      body: JSON.stringify({
        roomId: p1RoomData.room.roomId,
        fromPlayerId: p1RoomData.playerId,
        sessionToken: p1RoomData.sessionToken,
        toPublicProfileId: p2Data.profile.publicProfileId,
      }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(blockedInviteRes.status, 403, 'allowGameInvites: false blocks room invite');

  // 21g. Confidential profile report + blocking cleans friendship
  const profReportRes = await workerApp.fetch(
    new Request('https://worker.example/api/reports', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${p1Data.sessionToken}`,
        'CF-Connecting-IP': '198.51.100.22',
      },
      body: JSON.stringify({
        targetPublicProfileId: p2Data.profile.publicProfileId,
        reason: 'inappropriate_profile',
        details: 'Testing moderation report.',
      }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(profReportRes.status, 200);
  const profReportJson = (await profReportRes.json()) as Record<string, unknown>;
  assert.equal(profReportJson.ok, true);
  assert.equal('reporterAccountId' in profReportJson, false);

  const blockP2Res = await workerApp.fetch(
    new Request('https://worker.example/api/blocks', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${p1Data.sessionToken}`,
        'CF-Connecting-IP': '198.51.100.22',
      },
      body: JSON.stringify({ targetPublicProfileId: p2Data.profile.publicProfileId }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(blockP2Res.status, 200);

  // Blocked user can no longer send friend request or DM
  const blockedFrRes = await workerApp.fetch(
    new Request('https://worker.example/api/friends/request', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${p2Data.sessionToken}`,
        'CF-Connecting-IP': '198.51.100.23',
      },
      body: JSON.stringify({ targetPublicProfileId: p1Data.profile.publicProfileId }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(blockedFrRes.status, 403, 'Blocked user cannot send friend request');

  // 21h. Server stats accumulation & level/XP computation
  const statsRes = await workerApp.fetch(
    new Request('https://worker.example/api/profile/stats', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${p1Data.sessionToken}`,
        'CF-Connecting-IP': '198.51.100.22',
      },
      body: JSON.stringify({
        playTimeSeconds: 180,
        worldsCreated: 1,
        enemiesDefeated: 4,
        xpGained: 250,
      }),
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(statsRes.status, 200);
  const statsJson = (await statsRes.json()) as {
    profile: { stats: { level: number; playTimeSeconds: number; worldsCreated: number; enemiesDefeated: number } };
  };
  assert.equal(statsJson.profile.stats.playTimeSeconds, 180);
  // 1 from creating the verified room in 21f + 1 from stats delta
  assert.equal(statsJson.profile.stats.worldsCreated, 2);
  assert.equal(statsJson.profile.stats.enemiesDefeated, 4);
  assert.ok(statsJson.profile.stats.level >= 2, 'XP gain advances player level');

  // 22. Multiplayer config URL normalization (https, wss, http, ws, missing) & Worker /health + CORS
  assert.equal(
    normalizeMultiplayerBaseUrl('https://example.workers.dev/'),
    'https://example.workers.dev',
  );
  assert.equal(
    normalizeMultiplayerBaseUrl('wss://example.workers.dev/'),
    'https://example.workers.dev',
  );
  assert.equal(
    normalizeMultiplayerBaseUrl('http://localhost:8787/'),
    'http://localhost:8787',
  );
  assert.equal(
    normalizeMultiplayerBaseUrl('ws://localhost:8787/'),
    'http://localhost:8787',
  );
  assert.equal(
    toWebSocketUrl('https://example.workers.dev', '/api/multiplayer/ws?roomId=r1'),
    'wss://example.workers.dev/api/multiplayer/ws?roomId=r1',
  );
  assert.equal(
    toWebSocketUrl('http://localhost:8787', '/api/multiplayer/ws?roomId=r1'),
    'ws://localhost:8787/api/multiplayer/ws?roomId=r1',
  );

  const httpsCfg = buildMultiplayerConfig('https://example.workers.dev/', 'production', 'https://user.github.io');
  assert.equal(httpsCfg.configured, true);
  assert.equal(httpsCfg.baseUrl, 'https://example.workers.dev');
  assert.equal(httpsCfg.webSocketUrl, 'wss://example.workers.dev');

  const wssCfg = buildMultiplayerConfig('wss://example.workers.dev', 'production', null);
  assert.equal(wssCfg.configured, true);
  assert.equal(wssCfg.baseUrl, 'https://example.workers.dev');
  assert.equal(wssCfg.webSocketUrl, 'wss://example.workers.dev');

  const missingCfg = buildMultiplayerConfig('', 'development', null);
  assert.equal(missingCfg.configured, false);
  assert.equal(missingCfg.baseUrl, null);
  assert.equal(missingCfg.webSocketUrl, null);

  const diag = getMultiplayerConfig();
  assert.equal(typeof diag.configured, 'boolean');
  assert.ok(!('apiToken' in diag));

  const formattedDiag = formatMultiplayerDiagnosticReport(httpsCfg);
  assert.ok(formattedDiag.includes('Multiplayer configured: true'));
  assert.ok(formattedDiag.includes('Multiplayer URL: https://example.workers.dev'));
  assert.ok(formattedDiag.includes('WebSocket URL: wss://example.workers.dev'));
  assert.ok(formattedDiag.includes('Environment: production'));
  assert.ok(!formattedDiag.includes('CLOUDFLARE_API_TOKEN'));

  // Subpath GitHub Pages share link avoids 404 /join/<id> and resolves via ?join=<id>
  const ghShareLink = buildRoomShareLink(
    'rm_12345678',
    'https://abdelhaqelhafidy41-ops.github.io/World-of-Adventure-Multiplayer2/',
  );
  assert.equal(
    ghShareLink,
    'https://abdelhaqelhafidy41-ops.github.io/World-of-Adventure-Multiplayer2/?join=rm_12345678',
  );
  assert.equal(extractJoinTargetFromUrl(ghShareLink), 'rm_12345678');

  const rootShareLink = buildRoomShareLink('rm_12345678', 'https://play.example.com');
  assert.equal(rootShareLink, 'https://play.example.com/join/rm_12345678');
  assert.equal(extractJoinTargetFromUrl(rootShareLink), 'rm_12345678');

  const healthCorsRes = await workerApp.fetch(
    new Request('https://worker.example/health', {
      method: 'GET',
      headers: { Origin: 'https://abdelhaqelhafidy41-ops.github.io' },
    }),
    fullEnv as never,
    ctxStub,
  );
  assert.equal(healthCorsRes.status, 200);
  const healthCorsJson = (await healthCorsRes.json()) as { ok?: boolean; service?: string };
  assert.equal(healthCorsJson.ok, true);
  assert.equal(healthCorsJson.service, 'world-of-adventure-multiplayer2');
  assert.equal(
    healthCorsRes.headers.get('Access-Control-Allow-Origin'),
    'https://abdelhaqelhafidy41-ops.github.io',
  );

  const preflightCorsRes = await workerApp.fetch(
    new Request('https://worker.example/api/multiplayer/rooms', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://abdelhaq-elhafidy.github.io',
        'Access-Control-Request-Method': 'POST',
      },
    }),
    { ...fullEnv, ALLOWED_ORIGINS: 'https://*.github.io,http://localhost:3000' } as never,
    ctxStub,
  );
  assert.equal(preflightCorsRes.status, 204);
  assert.equal(
    preflightCorsRes.headers.get('Access-Control-Allow-Origin'),
    'https://abdelhaq-elhafidy.github.io',
  );
  assert.ok(
    (preflightCorsRes.headers.get('Access-Control-Allow-Methods') ?? '').includes('POST'),
  );

  console.log('ALL MULTIPLAYER & PLAYER PROFILE AUTHORITATIVE SYNC, SECURITY & RESILIENCE TESTS PASSED');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
