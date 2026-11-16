import React, { useMemo, useState } from 'react';
import {
  Apple,
  Backpack,
  BedDouble,
  BookOpen,
  Compass,
  Flame,
  FlaskConical,
  Footprints,
  Hammer,
  Leaf,
  Lock,
  ScrollText,
  Shield,
  Sparkles,
  Trash2,
  Wheat,
  X,
} from 'lucide-react';
import type {
  CraftingRecipe,
  CraftingRecipeView,
  EquipSlot,
  InventorySlotView,
  InventorySnapshot,
  ItemCategory,
  ItemIconKey,
} from '../game/inventory/inventoryTypes';
import type { QuestView } from '../game/quest/questTypes';
import {
  EQUIP_SLOT_LABELS,
  ITEM_CATEGORY_LABELS,
  QUEST_STATUS_LABELS,
  UI_TEXT,
  type Language,
} from '../game/i18n/translations';

interface InventoryModalProps {
  snapshot: InventorySnapshot;
  quests?: QuestView[];
  craftRecipes?: CraftingRecipeView[];
  lang: Language;
  onUseSlot: (slotIndex: number) => void;
  onDropSlot: (slotIndex: number, count?: number) => void;
  onCraftRecipe?: (recipeId: string) => void;
  onClose: () => void;
}

const CATEGORY_TABS: Array<ItemCategory | 'all'> = [
  'all',
  'weapon',
  'equipment',
  'consumable',
  'material',
  'quest',
  'tool',
];

const CRAFT_CATEGORIES: Array<CraftingRecipe['category'] | 'all'> = [
  'all',
  'camp',
  'weapon',
  'armor',
  'provisions',
];

const EQUIP_SLOTS_ORDER: EquipSlot[] = ['weapon', 'body', 'boots', 'head', 'accessory'];

function renderItemIcon(icon: ItemIconKey, className = 'w-5 h-5'): React.ReactNode {
  switch (icon) {
    case 'compass':
      return <Compass className={`${className} text-[#f0c264]`} />;
    case 'journal':
      return <BookOpen className={`${className} text-[#a9c8e8]`} />;
    case 'herb':
      return <Leaf className={`${className} text-[#7fd989]`} />;
    case 'loaf':
      return (
        <svg viewBox="0 0 24 24" className={`${className} text-[#eab168]`} fill="currentColor" aria-hidden="true">
          <path d="M4 14.5C4 10.6 7.6 8 12 8s8 2.6 8 6.5c0 1.4-1.1 2.5-2.5 2.5h-11C5.1 17 4 15.9 4 14.5Zm4.5-3.9 1.2 2.4M12 10l.5 2.8M15.5 10.6l-.8 2.4" stroke="#593514" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case 'tonic':
      return <FlaskConical className={`${className} text-[#72dfb8]`} />;
    case 'apple':
      return <Apple className={`${className} text-[#ef7261]`} />;
    case 'wheat':
      return <Wheat className={`${className} text-[#f3cc6b]`} />;
    case 'seal':
      return <Sparkles className={`${className} text-[#f5c76b]`} />;
    case 'boots':
      return <Footprints className={`${className} text-[#7cd6b8]`} />;
    case 'cloak':
    case 'armor':
      return <Shield className={`${className} text-[#8cc2f2]`} />;
    case 'bed':
      return <BedDouble className={`${className} text-[#9ed6a9]`} />;
    case 'torch':
      return <Flame className={`${className} text-[#f4a64c]`} />;
    case 'sword':
      return (
        <svg viewBox="0 0 24 24" className={`${className} text-[#d9e4ec]`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19.5 4.5 9 15" />
          <path d="m14.5 4.5 5 0 0 5" />
          <path d="m6.5 12.5 5 5" />
          <path d="m4.5 19.5 3-3" />
        </svg>
      );
    case 'axe':
      return (
        <svg viewBox="0 0 24 24" className={`${className} text-[#e5a93c]`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 19 16 8" />
          <path d="M12.5 5.5c2.8-1 5.8.2 6.8 3-.7 2.1-2.5 3.6-4.7 3.9L12.5 5.5Z" fill="currentColor" fillOpacity="0.22" />
          <path d="M4.5 19.5 7 17" />
        </svg>
      );
    case 'bow':
      return (
        <svg viewBox="0 0 24 24" className={`${className} text-[#8fd49c]`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 18C13.5 18 18 13.5 18 6" />
          <path d="M6 18 18 6" strokeOpacity="0.65" />
          <path d="M9 15 19.5 4.5" />
          <path d="M15.5 4.5h4v4" />
        </svg>
      );
    case 'spear':
      return (
        <svg viewBox="0 0 24 24" className={`${className} text-[#d4dce2]`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4.5 19.5 17 7" />
          <path d="m14.5 5 4.5-.5-.5 4.5-2.5 1-2.5-2.5 1-2.5Z" fill="currentColor" fillOpacity="0.25" />
        </svg>
      );
    case 'crossbow':
      return (
        <svg viewBox="0 0 24 24" className={`${className} text-[#e0b872]`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="M14 5c3.2 2.4 3.2 11.6 0 14" />
          <path d="M10 12 14 5m-4 7 4 7" strokeOpacity="0.55" />
          <path d="M3.5 15 6 12" />
        </svg>
      );
    case 'knife':
      return (
        <svg viewBox="0 0 24 24" className={`${className} text-[#cfdbe3]`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5.5 18.5 10 14" />
          <path d="m10 14 7.5-7.5c.8 1.8.4 4.2-1.2 5.8L12 16.5 10 14Z" fill="currentColor" fillOpacity="0.22" />
        </svg>
      );
    case 'wood':
      return (
        <svg viewBox="0 0 24 24" className={`${className} text-[#c8965c]`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="8" width="16" height="8" rx="3" fill="currentColor" fillOpacity="0.2" />
          <circle cx="7.5" cy="12" r="1.5" />
          <path d="M11 10.5h6M12 13.5h5" />
        </svg>
      );
    case 'stone':
    case 'ore':
    case 'coal':
      return (
        <svg
          viewBox="0 0 24 24"
          className={`${className} ${
            icon === 'ore'
              ? 'text-[#d98e57]'
              : icon === 'coal'
                ? 'text-[#8c96a3]'
                : 'text-[#aeb7b0]'
          }`}
          fill="currentColor"
          fillOpacity="0.24"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="7,6 15,5 20,11 17,18 8,19 4,13" />
          <path d="M9 11h5m-3 3 3-2" />
        </svg>
      );
    case 'fiber':
      return <Wheat className={`${className} text-[#a9cf6e]`} />;
    case 'hide':
      return (
        <svg viewBox="0 0 24 24" className={`${className} text-[#c98f5b]`} fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 5c2 1.2 8 1.2 10 0l2 3-1.5 3.5L19 16l-3 3c-2-1-6-1-8 0l-3-3 1.5-4.5L5 8l2-3Z" />
        </svg>
      );
    case 'meat':
    case 'cooked_meat':
      return (
        <svg
          viewBox="0 0 24 24"
          className={`${className} ${icon === 'cooked_meat' ? 'text-[#d97e48]' : 'text-[#e3736b]'}`}
          fill="currentColor"
          fillOpacity="0.26"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="M16 5c2.8 0 4.5 2.2 4.5 4.8 0 4.2-4.2 8.7-9.7 8.7-3 0-5.3-1.7-5.3-4.3 0-4.4 5.5-9.2 10.5-9.2Z" />
          <circle cx="15" cy="9.5" r="1.4" />
        </svg>
      );
    case 'arrow':
      return (
        <svg viewBox="0 0 24 24" className={`${className} text-[#d9c18c]`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 19 19 5" />
          <path d="M14 5h5v5" />
          <path d="M5 15v4h4" />
        </svg>
      );
    case 'mushroom':
      return (
        <svg viewBox="0 0 24 24" className={`${className} text-[#e58462]`} fill="currentColor" fillOpacity="0.24" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 13a7 7 0 0 1 14 0H5Z" />
          <path d="M10 13v5a2 2 0 0 0 4 0v-5" />
        </svg>
      );
    case 'berries':
      return (
        <svg viewBox="0 0 24 24" className={`${className} text-[#b975e8]`} fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="9.5" cy="14" r="3" />
          <circle cx="15" cy="13.5" r="2.8" />
          <circle cx="12" cy="10" r="2.6" />
          <path d="M12 7.5 14 4.5" />
        </svg>
      );
    case 'flower':
      return (
        <svg viewBox="0 0 24 24" className={`${className} text-[#f3cf58]`} fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="9" r="2.2" />
          <circle cx="12" cy="5.5" r="1.8" />
          <circle cx="15.3" cy="8.5" r="1.8" />
          <circle cx="8.7" cy="8.5" r="1.8" />
          <path d="M12 11.2V20" />
        </svg>
      );
    case 'sand':
      return (
        <svg viewBox="0 0 24 24" className={`${className} text-[#e8c67e]`} fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 17c2.5-3.5 5.2-6 8-6s5.5 2.5 8 6H4Z" />
          <path d="M7.5 14.5h2M13 13.5h2" />
        </svg>
      );
    case 'cactus':
      return (
        <svg viewBox="0 0 24 24" className={`${className} text-[#68c77a]`} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4v16M8 9v3a2 2 0 0 0 2 2h2M16 8v4a2 2 0 0 1-2 2h-2" />
        </svg>
      );
    case 'shell':
      return (
        <svg viewBox="0 0 24 24" className={`${className} text-[#f2be9f]`} fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 14c0-4.5 3.1-8 7-8s7 3.5 7 8c0 2.5-2.5 4.5-7 4.5S5 16.5 5 14Z" />
          <path d="M12 6v12.5M8.5 7.5 11 18M15.5 7.5 13 18" />
        </svg>
      );
    case 'crystal':
      return (
        <svg viewBox="0 0 24 24" className={`${className} text-[#7ad9f5]`} fill="currentColor" fillOpacity="0.26" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
          <polygon points="12,3 17,9 15,20 9,20 7,9" />
          <path d="M12 3v17M7 9h10" />
        </svg>
      );
    default:
      return <Backpack className={`${className} text-[#d6e3d8]`} />;
  }
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
  snapshot,
  quests = [],
  craftRecipes = [],
  lang,
  onUseSlot,
  onDropSlot,
  onCraftRecipe,
  onClose,
}) => {
  const t = UI_TEXT[lang];
  const isRtl = lang === 'ar';
  const [activeTab, setActiveTab] = useState<'pack' | 'craft'>('pack');
  const [category, setCategory] = useState<ItemCategory | 'all'>('all');
  const [craftCategory, setCraftCategory] = useState<CraftingRecipe['category'] | 'all'>('all');
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number>(() => {
    const first = snapshot.slots.find((s) => s !== null);
    return first ? first.slotIndex : 0;
  });

  const filteredIndices = useMemo(() => {
    const result: number[] = [];
    for (let i = 0; i < snapshot.slots.length; i++) {
      const slot = snapshot.slots[i];
      if (category === 'all') {
        result.push(i);
      } else if (slot && slot.definition.category === category) {
        result.push(i);
      }
    }
    return result;
  }, [snapshot.slots, category]);

  const filteredRecipes = useMemo(() => {
    if (craftCategory === 'all') return craftRecipes;
    return craftRecipes.filter((r) => r.recipe.category === craftCategory);
  }, [craftRecipes, craftCategory]);

  const selectedSlot: InventorySlotView | null =
    snapshot.slots[selectedSlotIdx] ??
    snapshot.slots.find((s) => s !== null) ??
    null;

  const getItemName = (slot: InventorySlotView) =>
    isRtl ? slot.definition.nameAr : slot.definition.name;

  const getItemDesc = (slot: InventorySlotView) =>
    isRtl ? slot.definition.descriptionAr : slot.definition.description;

  const getCraftCategoryLabel = (cat: CraftingRecipe['category'] | 'all') => {
    switch (cat) {
      case 'camp':
        return t.craftCategoryCamp;
      case 'weapon':
        return t.craftCategoryWeapon;
      case 'armor':
        return t.craftCategoryArmor;
      case 'provisions':
        return t.craftCategoryProvisions;
      default:
        return t.craftCategoryAll;
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#09110d]/72 p-2.5 sm:p-4 mobile-hud-safe"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inventory-title"
      data-testid="inventory-modal"
    >
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="w-full max-w-3xl max-h-[90dvh] overflow-y-auto overflow-x-hidden rounded-2xl bg-[#101c16] border border-[#2a3f33] p-3.5 sm:p-6 text-[#f1f5ee] shadow-2xl"
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            {activeTab === 'craft' ? (
              <Hammer className="w-5 h-5 text-[#e5a93c] shrink-0" />
            ) : (
              <Backpack className="w-5 h-5 text-[#e5a93c] shrink-0" />
            )}
            <div className="min-w-0">
              <h2 id="inventory-title" className="font-display text-lg sm:text-xl font-bold leading-tight truncate">
                {activeTab === 'craft' ? t.craftTab : t.explorerPack}
              </h2>
              <p className="text-xs text-[#9cb0a0] font-mono-num">
                {snapshot.usedSlots}/{snapshot.capacity} {t.slotsUsed}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {craftRecipes.length > 0 && (
              <div className="flex rounded-lg bg-[#15241c] border border-[#283e31] p-0.5">
                <button
                  type="button"
                  data-testid="inventory-tab-pack"
                  onClick={() => setActiveTab('pack')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    activeTab === 'pack'
                      ? 'bg-[#22392c] text-[#ffffff]'
                      : 'text-[#9fb5a3] hover:text-[#eef4eb]'
                  }`}
                >
                  <Backpack className="w-3.5 h-3.5" />
                  <span>{t.explorerPack}</span>
                </button>
                <button
                  type="button"
                  data-testid="inventory-tab-craft"
                  onClick={() => setActiveTab('craft')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    activeTab === 'craft'
                      ? 'bg-[#22392c] text-[#e5a93c]'
                      : 'text-[#9fb5a3] hover:text-[#eef4eb]'
                  }`}
                >
                  <Hammer className="w-3.5 h-3.5" />
                  <span>{t.craftTab}</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="min-w-[44px] min-h-[44px] rounded-lg bg-[#192a21] hover:bg-[#22392d] border border-[#2f493b] flex items-center justify-center cursor-pointer"
              aria-label={t.closeBtn}
              data-testid="inventory-close-btn"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {activeTab === 'craft' ? (
          <div>
            {/* Craft Category Filter Tabs */}
            <div className="flex flex-wrap gap-1.5 mb-3.5">
              {CRAFT_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCraftCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                    craftCategory === cat
                      ? 'bg-[#21382c] border-[#e5a93c]/75 text-[#ffffff]'
                      : 'bg-[#15241c] border-[#263c2f] text-[#9fb5a3] hover:bg-[#1b2e24]'
                  }`}
                >
                  {getCraftCategoryLabel(cat)}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="crafting-recipe-list">
              {filteredRecipes.map((entry) => {
                const resName = isRtl ? entry.resultItem.nameAr : entry.resultItem.name;
                const resDesc = isRtl
                  ? entry.resultItem.descriptionAr
                  : entry.resultItem.description;
                return (
                  <div
                    key={entry.recipe.id}
                    data-testid={`craft-recipe-${entry.recipe.id}`}
                    className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 ${
                      entry.canCraft
                        ? 'bg-[#17281f] border-[#e5a93c]/55'
                        : 'bg-[#132019] border-[#24392d]'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-[#1d3126] border border-[#324f3e] flex items-center justify-center shrink-0">
                            {renderItemIcon(entry.resultItem.icon, 'w-5 h-5')}
                          </div>
                          <div className="min-w-0">
                            <div className="font-display text-sm font-bold text-[#f4f7f1] truncate">
                              {resName}
                              {entry.recipe.resultCount > 1
                                ? ` ×${entry.recipe.resultCount}`
                                : ''}
                            </div>
                            <div className="text-[11px] text-[#99af9d]">
                              {getCraftCategoryLabel(entry.recipe.category)}
                            </div>
                          </div>
                        </div>
                      </div>

                      <p className="text-[11px] text-[#b9cbbd] leading-relaxed mb-2.5">
                        {resDesc}
                      </p>

                      <div className="text-[10px] font-semibold text-[#94aa98] mb-1">
                        {t.craftMaterialsNeeded}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {entry.ingredients.map((ing) => {
                          const ingName = isRtl
                            ? ing.definition.nameAr
                            : ing.definition.name;
                          const ok = ing.owned >= ing.required;
                          return (
                            <span
                              key={ing.itemId}
                              className={`px-2 py-0.5 rounded-md border text-[11px] font-mono-num inline-flex items-center gap-1 ${
                                ok
                                  ? 'bg-[#1a3324] border-[#3d6b4c] text-[#9ee8ae]'
                                  : 'bg-[#2a1b19] border-[#5c352f] text-[#f2a89d]'
                              }`}
                            >
                              <span>{ingName}</span>
                              <span>
                                {ing.owned}/{ing.required}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!entry.canCraft}
                      data-testid={`craft-btn-${entry.recipe.id}`}
                      onClick={() => onCraftRecipe?.(entry.recipe.id)}
                      className={`w-full min-h-[38px] px-3 py-1.5 rounded-lg font-display font-bold text-xs transition-colors ${
                        entry.canCraft
                          ? 'bg-[#e5a93c] hover:bg-[#eeb750] text-[#111914] cursor-pointer'
                          : 'bg-[#1a2921] text-[#6d8274] border border-[#283d31] cursor-not-allowed'
                      }`}
                    >
                      {t.craftBtn}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            {/* Equipped Gear Summary Strip */}
            <div className="mb-4 p-3 rounded-xl bg-[#14231b] border border-[#263c2f]">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-[#e6efe4]">{t.equippedGear}</span>
                <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono-num text-[#9ed6a9]">
                  {snapshot.bonuses.maxHealthBonus > 0 && (
                    <span>+{snapshot.bonuses.maxHealthBonus} {t.bonusMaxHp}</span>
                  )}
                  {snapshot.bonuses.maxStaminaBonus > 0 && (
                    <span>+{snapshot.bonuses.maxStaminaBonus} {t.bonusMaxStam}</span>
                  )}
                  {snapshot.bonuses.speedBonus > 0 && (
                    <span>+{snapshot.bonuses.speedBonus.toFixed(1)} {t.bonusSpeed}</span>
                  )}
                  {snapshot.bonuses.damageReductionBonus > 0 && (
                    <span>
                      +{Math.round(snapshot.bonuses.damageReductionBonus * 100)}%{' '}
                      {t.damageReductionLabel}
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {EQUIP_SLOTS_ORDER.map((eqSlot) => {
                  const equipped = snapshot.equippedBySlot[eqSlot];
                  return (
                    <button
                      key={eqSlot}
                      type="button"
                      onClick={() => equipped && setSelectedSlotIdx(equipped.slotIndex)}
                      className={`px-2.5 py-2 rounded-lg border text-start flex items-center gap-2 transition-colors ${
                        equipped
                          ? 'bg-[#1c3226] border-[#e5a93c]/55 hover:bg-[#233e30] cursor-pointer'
                          : 'bg-[#111e17] border-[#22362a] text-[#6d8274] cursor-default'
                      }`}
                    >
                      <div className="w-6 h-6 rounded-md bg-[#0f1b15] border border-white/10 flex items-center justify-center shrink-0">
                        {equipped
                          ? renderItemIcon(equipped.definition.icon, 'w-3.5 h-3.5')
                          : <Shield className="w-3.5 h-3.5 opacity-30" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] text-[#8fa695]">
                          {EQUIP_SLOT_LABELS[lang][eqSlot]}
                        </div>
                        <div className="text-[11px] font-medium truncate text-[#eef4eb]">
                          {equipped ? getItemName(equipped) : t.noEquippedSlot}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Category Filter Tabs */}
            <div className="flex flex-wrap gap-1.5 mb-3.5">
              {CATEGORY_TABS.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                    category === cat
                      ? 'bg-[#21382c] border-[#e5a93c]/75 text-[#ffffff]'
                      : 'bg-[#15241c] border-[#263c2f] text-[#9fb5a3] hover:bg-[#1b2e24]'
                  }`}
                >
                  {ITEM_CATEGORY_LABELS[lang][cat]}
                </button>
              ))}
            </div>

            {/* Main Body: Slot Grid + Selected Item Inspector */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Slot Grid */}
              <div className="md:col-span-7">
                {filteredIndices.length === 0 ? (
                  <div className="p-6 rounded-xl bg-[#15241c] border border-[#253b2e] text-center text-xs text-[#9cb0a0]">
                    {t.emptyCategory}
                  </div>
                ) : (
                  <div
                    className="grid grid-cols-3 min-[390px]:grid-cols-4 md:grid-cols-5 gap-2"
                    data-testid="inventory-slot-grid"
                  >
                    {filteredIndices.map((slotIdx) => {
                      const slot = snapshot.slots[slotIdx];
                      const isSelected = selectedSlot?.slotIndex === slotIdx;
                      const isQuest = slot?.definition.category === 'quest';
                      const durPct =
                        slot?.maxDurability && slot.durability !== undefined
                          ? Math.max(0, Math.min(100, (slot.durability / slot.maxDurability) * 100))
                          : null;

                      return (
                        <button
                          key={slotIdx}
                          type="button"
                          onClick={() => setSelectedSlotIdx(slotIdx)}
                          data-testid={`inventory-slot-${slotIdx}`}
                          aria-label={slot ? getItemName(slot) : `Empty slot ${slotIdx + 1}`}
                          className={`relative aspect-square rounded-xl border flex flex-col items-center justify-center p-1.5 transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#233a2d] border-[#e5a93c] shadow-md'
                              : slot
                                ? isQuest
                                  ? 'bg-[#1a2b22] border-[#b98a3b]/55 hover:bg-[#21362a]'
                                  : 'bg-[#16261d] border-[#284032] hover:bg-[#1e3227]'
                                : 'bg-[#121f18] border-[#1f3227] opacity-65'
                          }`}
                        >
                          {slot && (
                            <>
                              {renderItemIcon(slot.definition.icon, 'w-6 h-6')}
                              <span className="mt-1 text-[10px] leading-tight text-[#dce6da] truncate max-w-full px-0.5">
                                {getItemName(slot)}
                              </span>

                              {slot.count > 1 && (
                                <span className="absolute top-1 end-1 px-1 py-0.5 rounded bg-[#0c1510]/90 border border-white/15 font-mono-num text-[10px] font-bold text-[#f4f7f0] leading-none">
                                  ×{slot.count}
                                </span>
                              )}

                              {slot.equipped && (
                                <span className="absolute top-1 start-1 px-1 py-0.5 rounded bg-[#e5a93c] text-[#111914] font-mono-num text-[9px] font-bold leading-none">
                                  E
                                </span>
                              )}

                              {durPct !== null && (
                                <div className="absolute bottom-1 inset-x-1.5 h-1 rounded-full bg-[#0d1611] overflow-hidden">
                                  <div
                                    className={`h-full ${
                                      durPct < 25 ? 'bg-[#e05a47]' : 'bg-[#7cd6b8]'
                                    }`}
                                    style={{ width: `${durPct}%` }}
                                  />
                                </div>
                              )}
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Item Inspector Panel */}
              <div className="md:col-span-5">
                {selectedSlot ? (
                  <div
                    className="p-4 rounded-xl bg-[#15241c] border border-[#2a4234] flex flex-col justify-between h-full"
                    data-testid="inventory-inspector"
                  >
                    <div>
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-11 h-11 rounded-xl bg-[#1d3126] border border-[#324f3e] flex items-center justify-center shrink-0">
                          {renderItemIcon(selectedSlot.definition.icon, 'w-6 h-6')}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-display text-base font-bold text-[#f5f8f2] leading-snug">
                            {getItemName(selectedSlot)}
                          </h3>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <span className="px-2 py-0.5 rounded bg-[#1d3025] border border-[#314c3c] text-[10px] font-semibold text-[#c5d8c8]">
                              {ITEM_CATEGORY_LABELS[lang][selectedSlot.definition.category]}
                            </span>
                            <span className="font-mono-num text-[11px] text-[#9fb5a3]">
                              {t.stackLabel}: {selectedSlot.count}/{selectedSlot.definition.maxStack}
                            </span>
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-[#bdd0c0] leading-relaxed mb-3">
                        {getItemDesc(selectedSlot)}
                      </p>

                      {/* Effect / Equipment Stats */}
                      {selectedSlot.definition.consumeEffect && (
                        <div className="p-2.5 rounded-lg bg-[#121f18] border border-[#243b2e] text-[11px] text-[#98eba8] space-y-0.5 mb-3">
                          {selectedSlot.definition.consumeEffect.health && (
                            <div>
                              +{selectedSlot.definition.consumeEffect.health} {t.health}
                            </div>
                          )}
                          {selectedSlot.definition.consumeEffect.stamina && (
                            <div>
                              +{selectedSlot.definition.consumeEffect.stamina} {t.stamina}
                            </div>
                          )}
                        </div>
                      )}

                      {selectedSlot.definition.equipStats && (
                        <div className="p-2.5 rounded-lg bg-[#121f18] border border-[#243b2e] text-[11px] text-[#94ccf2] space-y-0.5 mb-3">
                          {selectedSlot.definition.equipStats.maxHealthBonus && (
                            <div>
                              +{selectedSlot.definition.equipStats.maxHealthBonus} {t.bonusMaxHp}
                            </div>
                          )}
                          {selectedSlot.definition.equipStats.maxStaminaBonus && (
                            <div>
                              +{selectedSlot.definition.equipStats.maxStaminaBonus} {t.bonusMaxStam}
                            </div>
                          )}
                          {selectedSlot.definition.equipStats.speedBonus && (
                            <div>
                              +{selectedSlot.definition.equipStats.speedBonus} {t.bonusSpeed}
                            </div>
                          )}
                          {selectedSlot.definition.equipStats.damageReductionBonus && (
                            <div>
                              +{Math.round(selectedSlot.definition.equipStats.damageReductionBonus * 100)}%{' '}
                              {t.damageReductionLabel}
                            </div>
                          )}
                        </div>
                      )}
                      {selectedSlot.definition.weaponStats && (
                        <div className="p-2.5 rounded-lg bg-[#121f18] border border-[#243b2e] text-[11px] text-[#f3cf82] space-y-0.5 mb-3 font-mono-num">
                          <div>
                            {selectedSlot.definition.weaponStats.damage} {t.damageShort} ·{' '}
                            {selectedSlot.definition.weaponStats.cooldown.toFixed(2)}s {t.cooldownShort}
                          </div>
                          <div className="text-[#a8c4b0]">
                            {t.rangeShort}: {selectedSlot.definition.weaponStats.range}m ·{' '}
                            {selectedSlot.definition.weaponStats.isRanged ? t.rangedTag : t.meleeTag}
                          </div>
                          {selectedSlot.maxDurability &&
                            selectedSlot.durability !== undefined && (
                              <div className="text-[#9ee8ae]">
                                {t.durabilityLabel}: {selectedSlot.durability}/
                                {selectedSlot.maxDurability}
                              </div>
                            )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="space-y-2 pt-2 border-t border-[#243a2d]">
                      <div className="flex flex-wrap gap-2">
                        {selectedSlot.definition.usable && (
                          <button
                            type="button"
                            data-testid="inventory-use-btn"
                            onClick={() => onUseSlot(selectedSlot.slotIndex)}
                            className="flex-1 min-h-[40px] px-3 py-2 rounded-lg bg-[#e5a93c] hover:bg-[#eeb750] text-[#111914] font-display font-bold text-xs cursor-pointer"
                          >
                            {selectedSlot.definition.id === 'bed'
                              ? t.placeBedBtn
                              : selectedSlot.definition.category === 'equipment' ||
                                  selectedSlot.definition.category === 'weapon'
                                ? selectedSlot.equipped
                                  ? t.unequipItem
                                  : t.equipItem
                                : t.useItem}
                          </button>
                        )}

                        {selectedSlot.definition.droppable && (
                          <button
                            type="button"
                            data-testid="inventory-drop-btn"
                            onClick={() => onDropSlot(selectedSlot.slotIndex, 1)}
                            className="min-h-[40px] px-3 py-2 rounded-lg bg-[#2a1c1a] hover:bg-[#3b2522] border border-[#613630] text-[#f5bdb6] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{t.dropItem}</span>
                          </button>
                        )}
                      </div>

                      {!selectedSlot.definition.droppable && (
                        <p className="flex items-center gap-1.5 text-[11px] text-[#95aa9a]">
                          <Lock className="w-3 h-3 shrink-0" />
                          <span>
                            {selectedSlot.definition.category === 'quest'
                              ? t.questItemLocked
                              : t.toolItemLocked}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-5 rounded-xl bg-[#15241c] border border-[#24392d] text-xs text-[#9cb0a0] h-full flex items-center justify-center text-center">
                    {t.selectItemHint}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Village Quests Summary */}
        {quests.length > 0 && (
          <div className="mt-5 pt-4 border-t border-[#253b2e]">
            <div className="flex items-center gap-2 mb-2.5 text-sm font-semibold text-[#f3f7f0]">
              <ScrollText className="w-4 h-4 text-[#e5a93c]" />
              <span>{t.villageQuests}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {quests.map((q) => (
                <div
                  key={q.id}
                  className="p-3 rounded-xl bg-[#14231b] border border-[#263c2f]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#f1f5ee]">
                      {q.title}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        q.status === 'completed'
                          ? 'bg-[#28352c] text-[#b4c8b9]'
                          : q.status === 'ready'
                            ? 'bg-[#1d3b28] text-[#98eba8]'
                            : 'bg-[#1d303c] text-[#94ccf2]'
                      }`}
                    >
                      {QUEST_STATUS_LABELS[lang][q.status]}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#9cb0a0] mt-1">{q.progressText}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-[#8da392]">{t.inventoryFooterHint}</p>
      </div>
    </div>
  );
};
