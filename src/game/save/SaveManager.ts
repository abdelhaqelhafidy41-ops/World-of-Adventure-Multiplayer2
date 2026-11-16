import {
  ALL_SAVE_SLOTS,
  CURRENT_SAVE_VERSION,
  type DifficultyLevel,
  type SaveGameData,
  type SaveGameMeta,
  type SaveSlotId,
  type SavedCameraState,
  type SavedInventoryState,
  type SavedPlayerState,
  type SavedQuestState,
  type SavedTimeState,
  type SavedWeatherState,
  type SavedWorldState,
  type WorldType,
} from './saveTypes';
import { getBiomeAt } from '../math/noise';

const STORAGE_PREFIX = 'woa_save_v1_';
const WORLD_INDEX_KEY = 'woa_world_ids_v1';
const LAST_SLOT_KEY = 'woa_last_save_slot_v1';

export function getSaveStorageKey(slotId: SaveSlotId): string {
  return `${STORAGE_PREFIX}${slotId}`;
}

export function generateWorldId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, '0');
  return `world-${ts}-${rand}`;
}

export interface SaveSourceState {
  worldId: string;
  worldName: string;
  worldType: WorldType;
  difficulty: DifficultyLevel;
  createdAtMs: number;
  thumbnailDataUrl?: string;
  playTimeSeconds: number;
  timeLabel: string;
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

export interface SaveResult {
  ok: boolean;
  meta?: SaveGameMeta;
  error?: string;
}

/**
 * Unified SaveManager handling serialization, multi-world indexing,
 * metadata stamping, localStorage persistence, and world deletion.
 */
export class SaveManager {
  public getRegisteredWorldIds(): string[] {
    const seen = new Set<string>();
    const ordered: string[] = [];

    try {
      const raw = localStorage.getItem(WORLD_INDEX_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const id of parsed) {
            if (typeof id === 'string' && id.trim() && !seen.has(id)) {
              seen.add(id);
              ordered.push(id);
            }
          }
        }
      }
    } catch {
      // Ignore parse errors
    }

    // Also include legacy slot keys if they exist in localStorage
    for (const legacyId of ALL_SAVE_SLOTS) {
      try {
        if (localStorage.getItem(getSaveStorageKey(legacyId)) && !seen.has(legacyId)) {
          seen.add(legacyId);
          ordered.push(legacyId);
        }
      } catch {
        // Ignore storage errors
      }
    }

    return ordered;
  }

  private setRegisteredWorldIds(ids: string[]): void {
    try {
      localStorage.setItem(WORLD_INDEX_KEY, JSON.stringify(ids));
    } catch {
      // Ignore storage quota errors
    }
  }

  private registerWorldId(worldId: string): void {
    const existing = this.getRegisteredWorldIds();
    if (!existing.includes(worldId)) {
      this.setRegisteredWorldIds([worldId, ...existing]);
    }
  }

  public buildSaveData(slotId: SaveSlotId, source: SaveSourceState): SaveGameData {
    const now = Date.now();
    const biome = getBiomeAt(source.player.position.x, source.player.position.z);

    const meta: SaveGameMeta = {
      slotId,
      worldId: source.worldId || slotId,
      worldName: source.worldName || 'Oakhollow Valley',
      worldType: source.worldType,
      difficulty: source.difficulty,
      version: CURRENT_SAVE_VERSION,
      createdAtMs: source.createdAtMs || now,
      savedAtIso: new Date(now).toISOString(),
      savedAtMs: now,
      playTimeSeconds: Math.max(0, Math.round(source.playTimeSeconds)),
      biome,
      level: source.player.level,
      timeLabel: source.timeLabel,
      weatherState: source.weather.currentState,
      completedQuestsCount: source.quests.completed.length,
      activeQuestsCount: source.quests.active.length,
      worldSeed: source.world.worldSeed,
      thumbnailDataUrl: source.thumbnailDataUrl,
    };

    return {
      version: CURRENT_SAVE_VERSION,
      meta,
      player: source.player,
      inventory: source.inventory,
      quests: source.quests,
      time: source.time,
      weather: source.weather,
      world: source.world,
      ...(source.camera ? { camera: source.camera } : {}),
      ...(source.audio ? { audio: source.audio } : {}),
    };
  }

  public saveToSlot(slotId: SaveSlotId, source: SaveSourceState): SaveResult {
    try {
      const data = this.buildSaveData(slotId, source);
      localStorage.setItem(getSaveStorageKey(slotId), JSON.stringify(data));
      this.registerWorldId(slotId);
      this.setLastActiveSlot(slotId);
      return { ok: true, meta: data.meta };
    } catch (err) {
      // If storage quota exceeded due to thumbnail, retry without thumbnail
      try {
        const strippedSource = { ...source, thumbnailDataUrl: undefined };
        const data = this.buildSaveData(slotId, strippedSource);
        localStorage.setItem(getSaveStorageKey(slotId), JSON.stringify(data));
        this.registerWorldId(slotId);
        this.setLastActiveSlot(slotId);
        return { ok: true, meta: data.meta };
      } catch {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Storage write failed',
        };
      }
    }
  }

  public deleteSave(slotId: SaveSlotId): boolean {
    try {
      localStorage.removeItem(getSaveStorageKey(slotId));
      const next = this.getRegisteredWorldIds().filter((id) => id !== slotId);
      this.setRegisteredWorldIds(next);
      if (this.getLastActiveSlot() === slotId) {
        localStorage.removeItem(LAST_SLOT_KEY);
      }
      return true;
    } catch {
      return false;
    }
  }

  public setLastActiveSlot(slotId: SaveSlotId): void {
    try {
      localStorage.setItem(LAST_SLOT_KEY, slotId);
    } catch {
      // Ignore storage quota errors
    }
  }

  public getLastActiveSlot(): SaveSlotId | null {
    try {
      const val = localStorage.getItem(LAST_SLOT_KEY);
      if (val && val.trim().length > 0) {
        return val;
      }
    } catch {
      // Ignore storage access errors
    }
    return null;
  }
}
