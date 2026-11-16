import { DEFAULT_WORLD_SEED } from '../math/noise';
import type { BiomeType, CameraPerspective } from '../types';
import type { WeatherQuality, WeatherState } from '../world/WeatherManager';
import {
  CURRENT_SAVE_VERSION,
  type DifficultyLevel,
  type SaveGameData,
  type SaveSlotId,
  type SavedCameraState,
  type SavedNpcState,
  type WorldType,
} from './saveTypes';
import {
  STAMINA_CONFIG_VERSION,
  getBaseMaxStaminaForMode,
  isInfiniteStaminaMode,
} from '../player/staminaConfig';

const VALID_BIOMES = new Set<BiomeType>([
  'Plains',
  'Forest',
  'Mountains',
  'Desert',
  'Beach',
]);
const VALID_WEATHERS = new Set<WeatherState>([
  'clear',
  'cloudy',
  'rain',
  'storm',
  'fog',
]);
const VALID_QUALITIES = new Set<WeatherQuality>(['low', 'medium', 'high']);
const VALID_CAMERA_PERSPECTIVES = new Set<CameraPerspective>([
  'first-person',
  'second-person',
  'third-person',
]);
const VALID_WORLD_TYPES = new Set<WorldType>([
  'normal',
  'adventure',
  'survival',
  'creative',
]);
const VALID_DIFFICULTIES = new Set<DifficultyLevel>(['easy', 'normal', 'hard']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asFiniteNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((item): item is string => typeof item === 'string');
}

function inferDefaultWorldName(slotId: string): string {
  if (slotId === 'autosave') return 'Oakhollow Autosave';
  if (slotId === 'slot-1') return 'Oakhollow Valley';
  if (slotId === 'slot-2') return 'Explorer Chronicle II';
  if (slotId === 'slot-3') return 'Explorer Chronicle III';
  return 'Oakhollow World';
}

/**
 * Migrates raw parsed JSON from any prior save version (v1 -> v2 -> v3)
 * up to CURRENT_SAVE_VERSION, validating and sanitizing every field.
 */
export function migrateSaveData(
  raw: unknown,
): { data: SaveGameData; migratedFromVersion: number } | null {
  if (!isRecord(raw)) return null;

  const detectedVersion = Math.floor(asFiniteNumber(raw.version, 1));
  if (detectedVersion < 1 || detectedVersion > CURRENT_SAVE_VERSION) {
    return null;
  }

  let working: Record<string, unknown> = { ...raw };

  // v1 -> v2 migration
  if (detectedVersion < 2) {
    const rawWorld = isRecord(working.world) ? { ...working.world } : {};
    const rawPlayer = isRecord(working.player) ? { ...working.player } : {};
    const rawRot = isRecord(rawPlayer.rotation) ? { ...rawPlayer.rotation } : {};
    const rawInv = isRecord(working.inventory) ? { ...working.inventory } : {};
    const rawWeather = isRecord(working.weather) ? { ...working.weather } : {};
    const rawMeta = isRecord(working.meta) ? { ...working.meta } : {};

    const yaw = asFiniteNumber(rawRot.yaw, Math.PI);
    rawPlayer.rotation = {
      yaw,
      cameraYaw: asFiniteNumber(rawRot.cameraYaw, 0),
      cameraPitch: asFiniteNumber(rawRot.cameraPitch, 0.26),
    };

    rawWorld.droppedPickups = Array.isArray(rawWorld.droppedPickups)
      ? rawWorld.droppedPickups
      : [];
    rawWorld.dialogueFlags = Array.isArray(rawWorld.dialogueFlags)
      ? rawWorld.dialogueFlags
      : [];
    rawWorld.defeatedEnemyIds = Array.isArray(rawWorld.defeatedEnemyIds)
      ? rawWorld.defeatedEnemyIds
      : [];

    rawInv.equippedBySlot = isRecord(rawInv.equippedBySlot)
      ? rawInv.equippedBySlot
      : {};

    rawWeather.transitionProgress = asFiniteNumber(
      rawWeather.transitionProgress,
      1,
    );
    rawWeather.windAngleRad = asFiniteNumber(rawWeather.windAngleRad, 0.62);

    rawMeta.worldSeed = asFiniteNumber(
      rawMeta.worldSeed,
      asFiniteNumber(rawWorld.worldSeed, DEFAULT_WORLD_SEED),
    );

    working = {
      ...working,
      version: 2,
      meta: rawMeta,
      player: rawPlayer,
      inventory: rawInv,
      weather: rawWeather,
      world: rawWorld,
    };
  }

  // v2 -> v3 migration (multi-world metadata, worldType, difficulty, npcStates)
  if (detectedVersion < 3) {
    const rawMeta = isRecord(working.meta) ? { ...working.meta } : {};
    const rawWorld = isRecord(working.world) ? { ...working.world } : {};
    const fallbackSlot = asString(rawMeta.slotId, 'slot-1') || 'slot-1';

    const metaWorldType = asString(rawMeta.worldType, 'normal');
    const metaDifficulty = asString(rawMeta.difficulty, 'normal');

    rawMeta.worldId = asString(rawMeta.worldId, fallbackSlot) || fallbackSlot;
    rawMeta.worldName =
      asString(rawMeta.worldName, '') || inferDefaultWorldName(fallbackSlot);
    rawMeta.worldType = metaWorldType;
    rawMeta.difficulty = metaDifficulty;
    rawMeta.createdAtMs = asFiniteNumber(
      rawMeta.createdAtMs,
      asFiniteNumber(rawMeta.savedAtMs, Date.now()),
    );

    rawWorld.worldType = asString(rawWorld.worldType, metaWorldType);
    rawWorld.difficulty = asString(rawWorld.difficulty, metaDifficulty);

    working = {
      ...working,
      version: 3,
      meta: rawMeta,
      world: rawWorld,
    };
  }

  const metaRaw = isRecord(working.meta) ? working.meta : null;
  const playerRaw = isRecord(working.player) ? working.player : null;
  const invRaw = isRecord(working.inventory) ? working.inventory : null;
  const questsRaw = isRecord(working.quests) ? working.quests : null;
  const timeRaw = isRecord(working.time) ? working.time : null;
  const weatherRaw = isRecord(working.weather) ? working.weather : null;
  const worldRaw = isRecord(working.world) ? working.world : null;

  if (!playerRaw || !invRaw || !worldRaw) {
    return null;
  }

  const posRaw = isRecord(playerRaw.position) ? playerRaw.position : {};
  const rotRaw = isRecord(playerRaw.rotation) ? playerRaw.rotation : {};

  const worldSeed = Math.floor(
    asFiniteNumber(worldRaw.worldSeed, DEFAULT_WORLD_SEED),
  );

  const slotCandidate = asString(metaRaw?.slotId, '').trim();
  const slotId: SaveSlotId = slotCandidate || 'slot-1';
  const worldId = asString(metaRaw?.worldId, slotId).trim() || slotId;
  const worldName =
    asString(metaRaw?.worldName, '').trim() || inferDefaultWorldName(slotId);

  const worldTypeCandidate = asString(
    metaRaw?.worldType ?? worldRaw.worldType,
    'normal',
  ) as WorldType;
  const worldType: WorldType = VALID_WORLD_TYPES.has(worldTypeCandidate)
    ? worldTypeCandidate
    : 'normal';

  const diffCandidate = asString(
    metaRaw?.difficulty ?? worldRaw.difficulty,
    'normal',
  ) as DifficultyLevel;
  const difficulty: DifficultyLevel = VALID_DIFFICULTIES.has(diffCandidate)
    ? diffCandidate
    : 'normal';

  const biomeCandidate = asString(metaRaw?.biome, 'Plains') as BiomeType;
  const biome: BiomeType = VALID_BIOMES.has(biomeCandidate)
    ? biomeCandidate
    : 'Plains';

  const weatherCurrRaw = asString(weatherRaw?.currentState, 'clear') as WeatherState;
  const weatherCurr: WeatherState = VALID_WEATHERS.has(weatherCurrRaw)
    ? weatherCurrRaw
    : 'clear';
  const weatherTargetRaw = asString(
    weatherRaw?.targetState,
    weatherCurr,
  ) as WeatherState;
  const weatherTarget: WeatherState = VALID_WEATHERS.has(weatherTargetRaw)
    ? weatherTargetRaw
    : weatherCurr;
  const weatherQualRaw = asString(weatherRaw?.quality, 'medium') as WeatherQuality;
  const weatherQuality: WeatherQuality = VALID_QUALITIES.has(weatherQualRaw)
    ? weatherQualRaw
    : 'medium';

  const slotsArray = Array.isArray(invRaw.slots)
    ? invRaw.slots
        .filter((s): s is Record<string, unknown> => isRecord(s))
        .map((s) => ({
          slotIndex: Math.max(0, Math.floor(asFiniteNumber(s.slotIndex, 0))),
          itemId: asString(s.itemId, ''),
          count: Math.max(1, Math.floor(asFiniteNumber(s.count, 1))),
          equipped: Boolean(s.equipped),
          ...(typeof s.durability === 'number' && Number.isFinite(s.durability)
            ? { durability: Math.max(0, Math.floor(s.durability)) }
            : {}),
          ...(typeof s.maxDurability === 'number' && Number.isFinite(s.maxDurability)
            ? { maxDurability: Math.max(1, Math.floor(s.maxDurability)) }
            : {}),
        }))
        .filter((s) => s.itemId.length > 0)
    : [];

  const activeQuestsArray = Array.isArray(questsRaw?.active)
    ? questsRaw.active
        .filter((q): q is Record<string, unknown> => isRecord(q))
        .map((q) => {
          const talkedCounts: Record<string, number> = {};
          if (isRecord(q.talkedCounts)) {
            for (const [k, v] of Object.entries(q.talkedCounts)) {
              talkedCounts[k] = asFiniteNumber(v, 0);
            }
          }
          const killCounts: Record<string, number> = {};
          if (isRecord(q.killCounts)) {
            for (const [k, v] of Object.entries(q.killCounts)) {
              killCounts[k] = asFiniteNumber(v, 0);
            }
          }
          const craftCounts: Record<string, number> = {};
          if (isRecord(q.craftCounts)) {
            for (const [k, v] of Object.entries(q.craftCounts)) {
              craftCounts[k] = asFiniteNumber(v, 0);
            }
          }
          const sleepCounts: Record<string, number> = {};
          if (isRecord(q.sleepCounts)) {
            for (const [k, v] of Object.entries(q.sleepCounts)) {
              sleepCounts[k] = asFiniteNumber(v, 0);
            }
          }
          return {
            questId: asString(q.questId, ''),
            completedObjectiveIds: asStringArray(q.completedObjectiveIds),
            talkedCounts,
            killCounts,
            craftCounts,
            sleepCounts,
            reachedLocations: asStringArray(q.reachedLocations),
            exploredAreas: asStringArray(q.exploredAreas),
          };
        })
        .filter((q) => q.questId.length > 0)
    : [];

  const droppedPickupsArray = Array.isArray(worldRaw.droppedPickups)
    ? worldRaw.droppedPickups
        .filter((p): p is Record<string, unknown> => isRecord(p))
        .map((p) => ({
          id: asString(p.id, `pickup-${Math.random()}`),
          itemId: asString(p.itemId, ''),
          count: Math.max(1, Math.floor(asFiniteNumber(p.count, 1))),
          label: asString(p.label, 'Item'),
          x: asFiniteNumber(p.x, 0),
          z: asFiniteNumber(p.z, 0),
        }))
        .filter((p) => p.itemId.length > 0)
    : [];

  const placedBedsArray = Array.isArray(worldRaw.placedBeds)
    ? worldRaw.placedBeds
        .filter((b): b is Record<string, unknown> => isRecord(b))
        .map((b) => ({
          id: asString(b.id, `bed-${Math.random()}`),
          x: asFiniteNumber(b.x, 0),
          z: asFiniteNumber(b.z, 0),
          yaw: asFiniteNumber(b.yaw, 0),
        }))
    : [];

  const depletedNodesArray = Array.isArray(worldRaw.depletedNodes)
    ? worldRaw.depletedNodes
        .filter((n): n is Record<string, unknown> => isRecord(n))
        .map((n) => ({
          id: asString(n.id, ''),
          usesRemaining: Math.max(0, Math.floor(asFiniteNumber(n.usesRemaining, 0))),
          regenAtElapsed: Math.max(0, asFiniteNumber(n.regenAtElapsed, 0)),
        }))
        .filter((n) => n.id.length > 0)
    : [];

  const npcStatesArray: SavedNpcState[] | undefined = Array.isArray(
    worldRaw.npcStates,
  )
    ? worldRaw.npcStates
        .filter((n): n is Record<string, unknown> => isRecord(n))
        .map((n) => ({
          id: asString(n.id, ''),
          x: asFiniteNumber(n.x, 0),
          z: asFiniteNumber(n.z, 0),
          yaw: asFiniteNumber(n.yaw, 0),
        }))
        .filter((n) => n.id.length > 0)
    : undefined;

  const savedAtMs = asFiniteNumber(metaRaw?.savedAtMs, Date.now());
  const createdAtMs = asFiniteNumber(metaRaw?.createdAtMs, savedAtMs);
  const savedAtIso = asString(
    metaRaw?.savedAtIso,
    new Date(savedAtMs).toISOString(),
  );
  const thumbnailDataUrl =
    typeof metaRaw?.thumbnailDataUrl === 'string' &&
    metaRaw.thumbnailDataUrl.startsWith('data:image/')
      ? metaRaw.thumbnailDataUrl
      : undefined;

  const normalized: SaveGameData = {
    version: CURRENT_SAVE_VERSION,
    meta: {
      slotId,
      worldId,
      worldName,
      worldType,
      difficulty,
      version: CURRENT_SAVE_VERSION,
      createdAtMs,
      savedAtIso,
      savedAtMs,
      playTimeSeconds: Math.max(0, asFiniteNumber(metaRaw?.playTimeSeconds, 0)),
      biome,
      level: Math.max(1, Math.floor(asFiniteNumber(metaRaw?.level, 1))),
      timeLabel: asString(metaRaw?.timeLabel, '08:30'),
      weatherState: weatherCurr,
      completedQuestsCount: Math.max(
        0,
        Math.floor(asFiniteNumber(metaRaw?.completedQuestsCount, 0)),
      ),
      activeQuestsCount: Math.max(
        0,
        Math.floor(asFiniteNumber(metaRaw?.activeQuestsCount, 0)),
      ),
      worldSeed,
      thumbnailDataUrl,
    },
    player: {
      position: {
        x: asFiniteNumber(posRaw.x, 0),
        y: asFiniteNumber(posRaw.y, 0),
        z: asFiniteNumber(posRaw.z, 4),
      },
      rotation: {
        yaw: asFiniteNumber(rotRaw.yaw, Math.PI),
        cameraYaw: asFiniteNumber(rotRaw.cameraYaw, 0),
        cameraPitch: asFiniteNumber(rotRaw.cameraPitch, 0.26),
      },
      health: Math.max(1, asFiniteNumber(playerRaw.health, 100)),
      stamina: (() => {
        if (isInfiniteStaminaMode(worldType)) {
          return Infinity;
        }
        const modeDefault = getBaseMaxStaminaForMode(worldType);
        const rawVal = playerRaw.stamina;
        if (typeof rawVal === 'number' && Number.isFinite(rawVal)) {
          return Math.max(0, rawVal);
        }
        return modeDefault;
      })(),
      staminaIsInfinite: isInfiniteStaminaMode(worldType),
      staminaConfigVersion: Math.max(
        1,
        Math.floor(
          asFiniteNumber(playerRaw.staminaConfigVersion, STAMINA_CONFIG_VERSION),
        ),
      ),
      level: Math.max(1, Math.floor(asFiniteNumber(playerRaw.level, 1))),
      xp: Math.max(0, Math.floor(asFiniteNumber(playerRaw.xp, 0))),
      coins: Math.max(0, Math.floor(asFiniteNumber(playerRaw.coins, 0))),
    },
    inventory: {
      capacity: Math.max(20, Math.floor(asFiniteNumber(invRaw.capacity, 32))),
      slots: slotsArray,
      equippedBySlot: isRecord(invRaw.equippedBySlot)
        ? (invRaw.equippedBySlot as SaveGameData['inventory']['equippedBySlot'])
        : {},
    },
    quests: {
      active: activeQuestsArray,
      completed: asStringArray(questsRaw?.completed),
      trackedQuestId:
        typeof questsRaw?.trackedQuestId === 'string'
          ? questsRaw.trackedQuestId
          : null,
    },
    time: {
      worldHours: asFiniteNumber(timeRaw?.worldHours, 8.5),
      dayCount: Math.max(1, Math.floor(asFiniteNumber(timeRaw?.dayCount, 1))),
      fullDayDurationSeconds: Math.max(
        30,
        asFiniteNumber(timeRaw?.fullDayDurationSeconds, 360),
      ),
      timeScale: Math.max(0, asFiniteNumber(timeRaw?.timeScale, 1)),
      paused: Boolean(timeRaw?.paused),
    },
    weather: {
      currentState: weatherCurr,
      targetState: weatherTarget,
      transitionProgress: Math.max(
        0,
        Math.min(1, asFiniteNumber(weatherRaw?.transitionProgress, 1)),
      ),
      dynamicEnabled:
        typeof weatherRaw?.dynamicEnabled === 'boolean'
          ? weatherRaw.dynamicEnabled
          : true,
      transitionDurationSeconds: Math.max(
        2,
        asFiniteNumber(weatherRaw?.transitionDurationSeconds, 14),
      ),
      quality: weatherQuality,
      windAngleRad: asFiniteNumber(weatherRaw?.windAngleRad, 0.62),
      ...(typeof weatherRaw?.weatherStartTime === 'number' &&
      Number.isFinite(weatherRaw.weatherStartTime)
        ? { weatherStartTime: Math.max(0, weatherRaw.weatherStartTime) }
        : {}),
      ...(typeof weatherRaw?.weatherDuration === 'number' &&
      Number.isFinite(weatherRaw.weatherDuration)
        ? {
            weatherDuration: Math.max(
              30,
              Math.min(900, weatherRaw.weatherDuration),
            ),
          }
        : {}),
      ...(typeof weatherRaw?.weatherRemainingTime === 'number' &&
      Number.isFinite(weatherRaw.weatherRemainingTime)
        ? {
            weatherRemainingTime: Math.max(
              0,
              Math.min(900, weatherRaw.weatherRemainingTime),
            ),
          }
        : {}),
      ...(typeof weatherRaw?.maxStateDurationSeconds === 'number' &&
      Number.isFinite(weatherRaw.maxStateDurationSeconds)
        ? {
            maxStateDurationSeconds: Math.max(
              120,
              Math.min(900, weatherRaw.maxStateDurationSeconds),
            ),
          }
        : {}),
    },
    world: {
      worldSeed,
      worldType,
      difficulty,
      discoveredLandmarkIds: asStringArray(worldRaw.discoveredLandmarkIds),
      collectedInteractableIds: asStringArray(worldRaw.collectedInteractableIds),
      droppedPickups: droppedPickupsArray,
      dialogueFlags: asStringArray(worldRaw.dialogueFlags),
      defeatedEnemyIds: asStringArray(worldRaw.defeatedEnemyIds),
      npcStates: npcStatesArray,
      placedBeds: placedBedsArray,
      depletedNodes: depletedNodesArray,
      openedChestIds: asStringArray(worldRaw.openedChestIds),
      killedAnimalIds: asStringArray(worldRaw.killedAnimalIds),
      fogOfWar:
        isRecord(worldRaw.fogOfWar) &&
        typeof worldRaw.fogOfWar.gridSize === 'number' &&
        Number.isFinite(worldRaw.fogOfWar.gridSize) &&
        typeof worldRaw.fogOfWar.discoveredB64 === 'string' &&
        worldRaw.fogOfWar.discoveredB64.length > 0
          ? {
              gridSize: Math.floor(worldRaw.fogOfWar.gridSize),
              discoveredB64: worldRaw.fogOfWar.discoveredB64,
            }
          : undefined,
      waypoint:
        isRecord(worldRaw.waypoint) &&
        typeof worldRaw.waypoint.x === 'number' &&
        Number.isFinite(worldRaw.waypoint.x) &&
        typeof worldRaw.waypoint.z === 'number' &&
        Number.isFinite(worldRaw.waypoint.z)
          ? {
              x: worldRaw.waypoint.x,
              z: worldRaw.waypoint.z,
              ...(typeof worldRaw.waypoint.label === 'string' &&
              worldRaw.waypoint.label.trim().length > 0
                ? { label: worldRaw.waypoint.label.trim().slice(0, 48) }
                : {}),
            }
          : null,
    },
    ...(isRecord(working.camera)
      ? {
          camera: ((): SavedCameraState => {
            const c = working.camera as Record<string, unknown>;
            const perspRaw = asString(
              c.perspective,
              'third-person',
            ) as CameraPerspective;
            return {
              perspective: VALID_CAMERA_PERSPECTIVES.has(perspRaw)
                ? perspRaw
                : 'third-person',
              sensitivity: Math.max(
                0.3,
                Math.min(2.5, asFiniteNumber(c.sensitivity, 1.0)),
              ),
              distance: Math.max(
                3.2,
                Math.min(11.0, asFiniteNumber(c.distance, 6.4)),
              ),
              height: Math.max(
                0.8,
                Math.min(2.6, asFiniteNumber(c.height, 1.55)),
              ),
              smoothing: Math.max(
                0.3,
                Math.min(2.0, asFiniteNumber(c.smoothing, 1.0)),
              ),
              invertY: Boolean(c.invertY),
              interactionIndicatorOffsetX: Math.max(
                -1.5,
                Math.min(1.5, asFiniteNumber(c.interactionIndicatorOffsetX, 0.55)),
              ),
              interactionIndicatorOffsetY: Math.max(
                -1.0,
                Math.min(1.0, asFiniteNumber(c.interactionIndicatorOffsetY, 0.15)),
              ),
              interactionIndicatorOffsetZ: Math.max(
                -1.5,
                Math.min(1.5, asFiniteNumber(c.interactionIndicatorOffsetZ, 0.0)),
              ),
            };
          })(),
        }
      : {}),
    ...(isRecord(working.audio) &&
    typeof working.audio.footstepVolume === 'number' &&
    Number.isFinite(working.audio.footstepVolume)
      ? {
          audio: {
            footstepVolume: Math.max(
              0,
              Math.min(1, working.audio.footstepVolume),
            ),
          },
        }
      : {}),
  };

  return { data: normalized, migratedFromVersion: detectedVersion };
}
