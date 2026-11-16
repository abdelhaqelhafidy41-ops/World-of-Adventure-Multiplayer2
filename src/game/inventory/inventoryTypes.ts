export type ItemCategory =
  | 'consumable'
  | 'quest'
  | 'equipment'
  | 'weapon'
  | 'material'
  | 'tool';

export type EquipSlot = 'weapon' | 'head' | 'body' | 'accessory' | 'boots';

export type ItemIconKey =
  | 'compass'
  | 'journal'
  | 'herb'
  | 'loaf'
  | 'tonic'
  | 'apple'
  | 'wheat'
  | 'seal'
  | 'boots'
  | 'cloak'
  | 'sword'
  | 'axe'
  | 'bow'
  | 'spear'
  | 'crossbow'
  | 'knife'
  | 'wood'
  | 'stone'
  | 'ore'
  | 'coal'
  | 'fiber'
  | 'hide'
  | 'meat'
  | 'cooked_meat'
  | 'arrow'
  | 'torch'
  | 'bed'
  | 'armor'
  | 'mushroom'
  | 'berries'
  | 'flower'
  | 'sand'
  | 'cactus'
  | 'shell'
  | 'crystal';

export interface ItemEquipStats {
  maxHealthBonus?: number;
  maxStaminaBonus?: number;
  speedBonus?: number;
  damageReductionBonus?: number;
}

export interface ItemWeaponStats {
  damage: number;
  cooldown: number;
  range: number;
  isRanged: boolean;
  staminaCost?: number;
  critChance?: number;
}

export interface ItemConsumeEffect {
  health?: number;
  stamina?: number;
}

export interface ItemDefinition {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  category: ItemCategory;
  icon: ItemIconKey;
  stackable: boolean;
  maxStack: number;
  usable: boolean;
  droppable: boolean;
  equipSlot?: EquipSlot;
  equipStats?: ItemEquipStats;
  weaponId?: string;
  weaponStats?: ItemWeaponStats;
  maxDurability?: number;
  consumeEffect?: ItemConsumeEffect;
  valueCoins?: number;
}

export interface InventorySlotState {
  slotIndex: number;
  itemId: string;
  count: number;
  equipped: boolean;
  durability?: number;
  maxDurability?: number;
}

export interface InventorySlotView {
  slotIndex: number;
  itemId: string;
  count: number;
  equipped: boolean;
  durability?: number;
  maxDurability?: number;
  definition: ItemDefinition;
}

export interface InventorySnapshot {
  capacity: number;
  usedSlots: number;
  slots: Array<InventorySlotView | null>;
  equippedBySlot: Partial<Record<EquipSlot, InventorySlotView>>;
  bonuses: Required<ItemEquipStats>;
}

export interface CraftingIngredient {
  itemId: string;
  count: number;
}

export interface CraftingRecipe {
  id: string;
  resultItemId: string;
  resultCount: number;
  category: 'camp' | 'weapon' | 'armor' | 'provisions';
  ingredients: CraftingIngredient[];
}

export interface CraftingRecipeView {
  recipe: CraftingRecipe;
  resultItem: ItemDefinition;
  ingredients: Array<{
    itemId: string;
    required: number;
    owned: number;
    definition: ItemDefinition;
  }>;
  canCraft: boolean;
}
