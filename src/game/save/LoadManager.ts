import { SaveManager, getSaveStorageKey } from './SaveManager';
import { migrateSaveData } from './saveMigrations';
import {
  ALL_SAVE_SLOTS,
  type SaveGameData,
  type SaveGameMeta,
  type SaveSlotId,
  type SaveSlotSummary,
} from './saveTypes';

export type LoadResult =
  | { ok: true; data: SaveGameData; migratedFromVersion: number }
  | { ok: false; reason: 'empty' | 'corrupted' | 'storage_error' };

/**
 * Modular LoadManager handling multi-world & slot discovery, Continue lookup,
 * schema migration via saveMigrations, and safe loading from localStorage.
 */
export class LoadManager {
  private readonly saveIndexReader = new SaveManager();

  public loadSlot(slotId: SaveSlotId): LoadResult {
    try {
      const raw = localStorage.getItem(getSaveStorageKey(slotId));
      if (!raw) {
        return { ok: false, reason: 'empty' };
      }
      const parsed: unknown = JSON.parse(raw);
      const migrated = migrateSaveData(parsed);
      if (!migrated) {
        return { ok: false, reason: 'corrupted' };
      }
      migrated.data.meta.slotId = slotId;
      migrated.data.meta.worldId = migrated.data.meta.worldId || slotId;
      return {
        ok: true,
        data: migrated.data,
        migratedFromVersion: migrated.migratedFromVersion,
      };
    } catch {
      return { ok: false, reason: 'corrupted' };
    }
  }

  public listSaveSlots(): SaveSlotSummary[] {
    return ALL_SAVE_SLOTS.map((slotId) => {
      const res = this.loadSlot(slotId);
      return {
        slotId,
        isAutosave: slotId === 'autosave',
        exists: res.ok,
        meta: res.ok ? res.data.meta : null,
      };
    });
  }

  /**
   * Lists all valid saved worlds (named worlds + any existing legacy slots)
   * sorted from most recently played to oldest.
   */
  public listSavedWorlds(): SaveGameMeta[] {
    const ids = this.saveIndexReader.getRegisteredWorldIds();
    const worlds: SaveGameMeta[] = [];

    for (const id of ids) {
      const res = this.loadSlot(id);
      if (res.ok) {
        worlds.push(res.data.meta);
      }
    }

    worlds.sort((a, b) => b.savedAtMs - a.savedAtMs);
    return worlds;
  }

  public hasAnySave(): boolean {
    return this.listSavedWorlds().length > 0;
  }

  public getMostRecentSaveMeta(): SaveGameMeta | null {
    const worlds = this.listSavedWorlds();
    return worlds[0] ?? null;
  }

  public loadMostRecentSave(): LoadResult {
    const latest = this.getMostRecentSaveMeta();
    if (!latest) {
      return { ok: false, reason: 'empty' };
    }
    return this.loadSlot(latest.slotId);
  }
}
