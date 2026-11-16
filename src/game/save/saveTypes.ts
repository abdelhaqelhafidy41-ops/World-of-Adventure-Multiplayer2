import type { EquipSlot } from '../inventory/inventoryTypes';
import type { BiomeType, CameraPerspective } from '../types';
import type { WeatherQuality, WeatherState } from '../world/WeatherManager';

export const CURRENT_SAVE_VERSION = 6;

export type LegacySaveSlotId = 'autosave' | 'slot-1' | 'slot-2' | 'slot-3';
export type SaveSlotId = LegacySaveSlotId | (string & {});

export type WorldType = 'normal' | 'adventure' | 'survival' | 'creative';
export type DifficultyLevel = 'easy' | 'normal' | 'hard';

export interface NewWorldOptions {
  worldName: string;
  seed: number;
  worldType: WorldType;
  difficulty: DifficultyLevel;
}

export const MANUAL_SAVE_SLOTS: LegacySaveSlotId[] = [
  'slot-1',
  'slot-2',
  'slot-3',
];
export const ALL_SAVE_SLOTS: LegacySaveSlotId[] = [
  'autosave',
  'slot-1',
  'slot-2',
  'slot-3',
];

export interface SavedPlayerState {
  position: {
    x: number;
    y: number;
    z: number;
  };
  rotation: {
    yaw: number;
    cameraYaw: number;
    cameraPitch: number;
  };
  health: number;
  stamina: number;
  staminaIsInfinite?: boolean;
  staminaConfigVersion?: number;
  level: number;
  xp: number;
  coins: number;
}

export interface SavedInventorySlot {
  slotIndex: number;
  itemId: string;
  count: number;
  equipped: boolean;
  durability?: number;
  maxDurability?: number;
}

export interface SavedInventoryState {
  capacity: number;
  slots: SavedInventorySlot[];
  equippedBySlot: Partial<Record<EquipSlot, string>>;
}

export interface SavedQuestActiveEntry {
  questId: string;
  completedObjectiveIds: string[];
  talkedCounts: Record<string, number>;
  killCounts: Record<string, number>;
  craftCounts?: Record<string, number>;
  sleepCounts?: Record<string, number>;
  reachedLocations: string[];
  exploredAreas: string[];
}

export interface SavedQuestState {
  active: SavedQuestActiveEntry[];
  completed: string[];
  trackedQuestId: string | null;
}

export interface SavedTimeState {
  worldHours: number;
  dayCount: number;
  fullDayDurationSeconds: number;
  timeScale: number;
  paused: boolean;
}

export interface SavedWeatherState {
  currentState: WeatherState;
  targetState: WeatherState;
  transitionProgress: number;
  dynamicEnabled: boolean;
  transitionDurationSeconds: number;
  quality: WeatherQuality;
  windAngleRad: number;
  weatherStartTime?: number;
  weatherDuration?: number;
  weatherRemainingTime?: number;
  maxStateDurationSeconds?: number;
}

export interface SavedCameraState {
  perspective: CameraPerspective;
  sensitivity: number;
  distance: number;
  height: number;
  smoothing: number;
  invertY: boolean;
  interactionIndicatorOffsetX: number;
  interactionIndicatorOffsetY: number;
  interactionIndicatorOffsetZ: number;
}

export interface SavedDroppedPickup {
  id: string;
  itemId: string;
  count: number;
  label: string;
  x: number;
  z: number;
}

export interface SavedPlacedBed {
  id: string;
  x: number;
  z: number;
  yaw: number;
}

export interface SavedDepletedNode {
  id: string;
  usesRemaining: number;
  regenAtElapsed: number;
}

export interface SavedNpcState {
  id: string;
  x: number;
  z: number;
  yaw: number;
}

export interface SavedWorldState {
  worldSeed: number;
  worldType: WorldType;
  difficulty: DifficultyLevel;
  discoveredLandmarkIds: string[];
  collectedInteractableIds: string[];
  droppedPickups: SavedDroppedPickup[];
  dialogueFlags: string[];
  defeatedEnemyIds: string[];
  npcStates?: SavedNpcState[];
  placedBeds?: SavedPlacedBed[];
  depletedNodes?: SavedDepletedNode[];
  openedChestIds?: string[];
  killedAnimalIds?: string[];
  fogOfWar?: {
    gridSize: number;
    discoveredB64: string;
  };
  waypoint?: {
    x: number;
    z: number;
    label?: string;
  } | null;
}

export interface SaveGameMeta {
  slotId: SaveSlotId;
  worldId: string;
  worldName: string;
  worldType: WorldType;
  difficulty: DifficultyLevel;
  version: number;
  createdAtMs: number;
  savedAtIso: string;
  savedAtMs: number;
  playTimeSeconds: number;
  biome: BiomeType;
  level: number;
  timeLabel: string;
  weatherState: WeatherState;
  completedQuestsCount: number;
  activeQuestsCount: number;
  worldSeed: number;
  thumbnailDataUrl?: string;
}

export interface SaveGameData {
  version: number;
  meta: SaveGameMeta;
  player: SavedPlayerState;
  inventory: SavedInventoryState;
  quests: SavedQuestState;
  time: SavedTimeState;
  weather: SavedWeatherState;
  world: SavedWorldState;
  camera?: SavedCameraState;
  audio?: {
    footstepVolume?: number;
  };
}

export interface SaveSlotSummary {
  slotId: SaveSlotId;
  isAutosave: boolean;
  exists: boolean;
  meta: SaveGameMeta | null;
}
