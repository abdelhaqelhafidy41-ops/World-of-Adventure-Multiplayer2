import { ItemManager } from './ItemManager';
import type {
  CraftingIngredient,
  EquipSlot,
  InventorySlotState,
  InventorySlotView,
  InventorySnapshot,
  ItemDefinition,
  ItemEquipStats,
} from './inventoryTypes';
import type { SavedInventoryState } from '../save/saveTypes';

export type UseSlotResult =
  | { ok: false; reason: 'empty' | 'not_usable' | 'full_stats' }
  | {
      ok: true;
      action: 'consumed';
      definition: ItemDefinition;
      healthRestored: number;
      staminaRestored: number;
    }
  | {
      ok: true;
      action: 'equipped' | 'unequipped' | 'place_bed';
      definition: ItemDefinition;
    };

export type DropSlotResult =
  | { ok: false; reason: 'empty' | 'not_droppable' }
  | {
      ok: true;
      itemId: string;
      count: number;
      definition: ItemDefinition;
    };

/**
 * Slot-based InventoryManager handling stackable items, consumables,
 * quest items, equipment slots, weapon durability, item pickup, use, and drop.
 */
export class InventoryManager {
  public readonly capacity: number;
  public readonly itemManager: ItemManager;
  private readonly slots: Array<InventorySlotState | null>;

  constructor(itemManager = new ItemManager(), capacity = 32) {
    this.itemManager = itemManager;
    this.capacity = capacity;
    this.slots = new Array<InventorySlotState | null>(capacity).fill(null);
  }

  public addItem(
    itemId: string,
    count = 1,
    initialDurability?: number,
  ): { added: number; overflow: number } {
    const def = this.itemManager.getItem(itemId);
    if (!def || count <= 0) return { added: 0, overflow: Math.max(0, count) };

    let remaining = count;

    // 1. Fill existing partial stacks first if stackable
    if (def.stackable && def.maxStack > 1) {
      for (let i = 0; i < this.capacity && remaining > 0; i++) {
        const slot = this.slots[i];
        if (slot && slot.itemId === itemId && slot.count < def.maxStack) {
          const space = def.maxStack - slot.count;
          const add = Math.min(space, remaining);
          slot.count += add;
          remaining -= add;
        }
      }
    }

    // 2. Allocate empty slots for remaining count
    for (let i = 0; i < this.capacity && remaining > 0; i++) {
      if (this.slots[i] === null) {
        const maxPerSlot = def.stackable ? Math.max(1, def.maxStack) : 1;
        const add = Math.min(maxPerSlot, remaining);
        const maxDur = def.maxDurability;
        const dur =
          maxDur !== undefined
            ? Math.max(0, Math.min(maxDur, initialDurability ?? maxDur))
            : undefined;
        this.slots[i] = {
          slotIndex: i,
          itemId,
          count: add,
          equipped: false,
          ...(maxDur !== undefined ? { durability: dur, maxDurability: maxDur } : {}),
        };
        remaining -= add;
      }
    }

    return { added: count - remaining, overflow: remaining };
  }

  public removeItem(itemId: string, count = 1): number {
    if (count <= 0) return 0;
    let remaining = count;

    for (let i = this.capacity - 1; i >= 0 && remaining > 0; i--) {
      const slot = this.slots[i];
      if (!slot || slot.itemId !== itemId) continue;
      const take = Math.min(slot.count, remaining);
      slot.count -= take;
      remaining -= take;
      if (slot.count <= 0) {
        this.slots[i] = null;
      }
    }

    return count - remaining;
  }

  public getItemCount(itemId: string): number {
    let total = 0;
    for (let i = 0; i < this.capacity; i++) {
      const slot = this.slots[i];
      if (slot && slot.itemId === itemId) {
        total += slot.count;
      }
    }
    return total;
  }

  public hasIngredients(ingredients: CraftingIngredient[]): boolean {
    for (let i = 0; i < ingredients.length; i++) {
      const req = ingredients[i];
      if (this.getItemCount(req.itemId) < req.count) return false;
    }
    return true;
  }

  public consumeIngredients(ingredients: CraftingIngredient[]): boolean {
    if (!this.hasIngredients(ingredients)) return false;
    for (let i = 0; i < ingredients.length; i++) {
      const req = ingredients[i];
      this.removeItem(req.itemId, req.count);
    }
    return true;
  }

  public canAccept(itemId: string, count = 1): boolean {
    const def = this.itemManager.getItem(itemId);
    if (!def || count <= 0) return false;
    let space = 0;
    if (def.stackable && def.maxStack > 1) {
      for (let i = 0; i < this.capacity; i++) {
        const s = this.slots[i];
        if (s && s.itemId === itemId && s.count < def.maxStack) {
          space += def.maxStack - s.count;
        }
      }
    }
    const maxPerSlot = def.stackable ? Math.max(1, def.maxStack) : 1;
    for (let i = 0; i < this.capacity; i++) {
      if (this.slots[i] === null) {
        space += maxPerSlot;
      }
    }
    return space >= count;
  }

  public useSlot(
    slotIndex: number,
    playerVitals: {
      health: number;
      maxHealth: number;
      stamina: number;
      maxStamina: number;
    },
  ): UseSlotResult {
    const slot = this.slots[slotIndex];
    if (!slot) return { ok: false, reason: 'empty' };

    const def = this.itemManager.getItem(slot.itemId);
    if (!def || !def.usable) {
      return { ok: false, reason: 'not_usable' };
    }

    // Placeable camp bed (actual consumption occurs once placed in world)
    if (def.id === 'bed') {
      return { ok: true, action: 'place_bed', definition: def };
    }

    // Equipment & Weapon toggle (modular equipSlot architecture)
    if (
      (def.category === 'equipment' || def.category === 'weapon') &&
      def.equipSlot
    ) {
      if (slot.equipped) {
        slot.equipped = false;
        return { ok: true, action: 'unequipped', definition: def };
      }

      // Unequip any other item currently occupying the same equipSlot
      for (let i = 0; i < this.capacity; i++) {
        const other = this.slots[i];
        if (!other || !other.equipped || i === slotIndex) continue;
        const otherDef = this.itemManager.getItem(other.itemId);
        if (otherDef?.equipSlot === def.equipSlot) {
          other.equipped = false;
        }
      }

      slot.equipped = true;
      return { ok: true, action: 'equipped', definition: def };
    }

    // Consumable item
    if (def.category === 'consumable' && def.consumeEffect) {
      const hGain = def.consumeEffect.health ?? 0;
      const sGain = def.consumeEffect.stamina ?? 0;
      const healthNeeds = hGain > 0 && playerVitals.health < playerVitals.maxHealth;
      const staminaNeeds = sGain > 0 && playerVitals.stamina < playerVitals.maxStamina;

      if (!healthNeeds && !staminaNeeds) {
        return { ok: false, reason: 'full_stats' };
      }

      slot.count -= 1;
      if (slot.count <= 0) {
        this.slots[slotIndex] = null;
      }

      return {
        ok: true,
        action: 'consumed',
        definition: def,
        healthRestored: hGain,
        staminaRestored: sGain,
      };
    }

    return { ok: false, reason: 'not_usable' };
  }

  public useFirstMatchingItem(
    itemId: string,
    playerVitals: {
      health: number;
      maxHealth: number;
      stamina: number;
      maxStamina: number;
    },
  ): UseSlotResult {
    for (let i = 0; i < this.capacity; i++) {
      if (this.slots[i]?.itemId === itemId) {
        return this.useSlot(i, playerVitals);
      }
    }
    return { ok: false, reason: 'empty' };
  }

  public dropSlot(slotIndex: number, count = 1): DropSlotResult {
    const slot = this.slots[slotIndex];
    if (!slot) return { ok: false, reason: 'empty' };

    const def = this.itemManager.getItem(slot.itemId);
    if (!def || !def.droppable) {
      return { ok: false, reason: 'not_droppable' };
    }

    const dropQty = Math.min(slot.count, Math.max(1, count));
    slot.count -= dropQty;
    if (slot.count <= 0) {
      this.slots[slotIndex] = null;
    } else if (slot.equipped && slot.count === 0) {
      slot.equipped = false;
    }

    return {
      ok: true,
      itemId: def.id,
      count: dropQty,
      definition: def,
    };
  }

  public getEquippedBonuses(): Required<ItemEquipStats> {
    const totals: Required<ItemEquipStats> = {
      maxHealthBonus: 0,
      maxStaminaBonus: 0,
      speedBonus: 0,
      damageReductionBonus: 0,
    };

    for (let i = 0; i < this.capacity; i++) {
      const slot = this.slots[i];
      if (!slot || !slot.equipped) continue;
      const def = this.itemManager.getItem(slot.itemId);
      if (def?.equipStats) {
        totals.maxHealthBonus += def.equipStats.maxHealthBonus ?? 0;
        totals.maxStaminaBonus += def.equipStats.maxStaminaBonus ?? 0;
        totals.speedBonus += def.equipStats.speedBonus ?? 0;
        totals.damageReductionBonus += def.equipStats.damageReductionBonus ?? 0;
      }
    }

    return totals;
  }

  public getDamageReductionBonus(): number {
    return Math.min(0.65, this.getEquippedBonuses().damageReductionBonus);
  }

  public getEquippedWeaponId(): string | null {
    for (let i = 0; i < this.capacity; i++) {
      const slot = this.slots[i];
      if (!slot || !slot.equipped) continue;
      const def = this.itemManager.getItem(slot.itemId);
      if (def?.category === 'weapon' && def.equipSlot === 'weapon') {
        return def.weaponId ?? def.id;
      }
    }
    return null;
  }

  public getEquippedWeaponSlot(): InventorySlotState | null {
    for (let i = 0; i < this.capacity; i++) {
      const slot = this.slots[i];
      if (!slot || !slot.equipped) continue;
      const def = this.itemManager.getItem(slot.itemId);
      if (def?.category === 'weapon' && def.equipSlot === 'weapon') {
        return slot;
      }
    }
    return null;
  }

  public damageEquippedWeapon(amount = 1): {
    damaged: boolean;
    brokenItemName?: string;
    durability?: number;
    maxDurability?: number;
  } {
    const slot = this.getEquippedWeaponSlot();
    if (!slot || amount <= 0) return { damaged: false };
    const def = this.itemManager.getItem(slot.itemId);
    if (!def?.maxDurability) return { damaged: false };

    const maxDur = slot.maxDurability ?? def.maxDurability;
    const current = slot.durability ?? maxDur;
    const next = Math.max(0, current - amount);
    slot.durability = next;
    slot.maxDurability = maxDur;

    if (next <= 0) {
      this.slots[slot.slotIndex] = null;
      return {
        damaged: true,
        brokenItemName: def.name,
        durability: 0,
        maxDurability: maxDur,
      };
    }

    return { damaged: true, durability: next, maxDurability: maxDur };
  }

  public repairAllWeapons(): number {
    let repaired = 0;
    for (let i = 0; i < this.capacity; i++) {
      const slot = this.slots[i];
      if (!slot) continue;
      const def = this.itemManager.getItem(slot.itemId);
      if (def?.maxDurability) {
        const current = slot.durability ?? def.maxDurability;
        if (current < def.maxDurability) {
          slot.durability = def.maxDurability;
          slot.maxDurability = def.maxDurability;
          repaired += 1;
        }
      }
    }
    return repaired;
  }

  public getOwnedWeaponSlots(): InventorySlotView[] {
    const result: InventorySlotView[] = [];
    for (let i = 0; i < this.capacity; i++) {
      const slot = this.slots[i];
      if (!slot) continue;
      const def = this.itemManager.getItem(slot.itemId);
      if (!def || def.category !== 'weapon') continue;
      result.push({
        slotIndex: slot.slotIndex,
        itemId: slot.itemId,
        count: slot.count,
        equipped: slot.equipped,
        durability: slot.durability ?? def.maxDurability,
        maxDurability: slot.maxDurability ?? def.maxDurability,
        definition: def,
      });
    }
    return result;
  }

  public equipItemById(itemId: string): UseSlotResult {
    for (let i = 0; i < this.capacity; i++) {
      const slot = this.slots[i];
      if (slot && slot.itemId === itemId) {
        if (slot.equipped) {
          return {
            ok: true,
            action: 'equipped',
            definition: this.itemManager.getItem(slot.itemId)!,
          };
        }
        return this.useSlot(i, { health: 1, maxHealth: 1, stamina: 1, maxStamina: 1 });
      }
    }
    return { ok: false, reason: 'empty' };
  }

  public unequipSlotType(equipSlot: EquipSlot): ItemDefinition | null {
    for (let i = 0; i < this.capacity; i++) {
      const slot = this.slots[i];
      if (!slot || !slot.equipped) continue;
      const def = this.itemManager.getItem(slot.itemId);
      if (def?.equipSlot === equipSlot) {
        slot.equipped = false;
        return def;
      }
    }
    return null;
  }

  public getSnapshot(): InventorySnapshot {
    const equippedBySlot: Partial<Record<EquipSlot, InventorySlotView>> = {};
    let usedSlots = 0;

    const views: Array<InventorySlotView | null> = this.slots.map((slot) => {
      if (!slot) return null;
      const def = this.itemManager.getItem(slot.itemId);
      if (!def) return null;
      usedSlots += 1;
      const view: InventorySlotView = {
        slotIndex: slot.slotIndex,
        itemId: slot.itemId,
        count: slot.count,
        equipped: slot.equipped,
        durability: slot.durability ?? def.maxDurability,
        maxDurability: slot.maxDurability ?? def.maxDurability,
        definition: def,
      };
      if (slot.equipped && def.equipSlot) {
        equippedBySlot[def.equipSlot] = view;
      }
      return view;
    });

    return {
      capacity: this.capacity,
      usedSlots,
      slots: views,
      equippedBySlot,
      bonuses: this.getEquippedBonuses(),
    };
  }

  public exportState(): SavedInventoryState {
    const slots: SavedInventoryState['slots'] = [];
    const equippedBySlot: Partial<Record<EquipSlot, string>> = {};

    for (let i = 0; i < this.capacity; i++) {
      const slot = this.slots[i];
      if (!slot) continue;
      slots.push({
        slotIndex: slot.slotIndex,
        itemId: slot.itemId,
        count: slot.count,
        equipped: slot.equipped,
        ...(slot.durability !== undefined ? { durability: slot.durability } : {}),
        ...(slot.maxDurability !== undefined
          ? { maxDurability: slot.maxDurability }
          : {}),
      });
      if (slot.equipped) {
        const def = this.itemManager.getItem(slot.itemId);
        if (def?.equipSlot) {
          equippedBySlot[def.equipSlot] = slot.itemId;
        }
      }
    }

    return {
      capacity: this.capacity,
      slots,
      equippedBySlot,
    };
  }

  public restoreState(state: SavedInventoryState): void {
    for (let i = 0; i < this.capacity; i++) {
      this.slots[i] = null;
    }

    const equippedSlotsSeen = new Set<EquipSlot>();
    for (const saved of state.slots) {
      if (saved.slotIndex < 0 || saved.slotIndex >= this.capacity) continue;
      const def = this.itemManager.getItem(saved.itemId);
      if (!def) continue;

      let shouldEquip = Boolean(saved.equipped && def.equipSlot);
      if (shouldEquip && def.equipSlot) {
        if (equippedSlotsSeen.has(def.equipSlot)) {
          shouldEquip = false;
        } else {
          equippedSlotsSeen.add(def.equipSlot);
        }
      }

      const maxDur = saved.maxDurability ?? def.maxDurability;
      const dur =
        maxDur !== undefined
          ? Math.max(1, Math.min(maxDur, saved.durability ?? maxDur))
          : undefined;

      this.slots[saved.slotIndex] = {
        slotIndex: saved.slotIndex,
        itemId: saved.itemId,
        count: Math.max(1, saved.count),
        equipped: shouldEquip,
        ...(maxDur !== undefined ? { durability: dur, maxDurability: maxDur } : {}),
      };
    }
  }
}
