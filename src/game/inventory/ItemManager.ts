import rawItems from './items.json';
import type { ItemDefinition } from './inventoryTypes';

/**
 * Data-driven ItemManager registry. New items can be added via items.json
 * or registered dynamically at runtime without changing inventory logic.
 */
export class ItemManager {
  private readonly items = new Map<string, ItemDefinition>();

  constructor(initialItems: ItemDefinition[] = rawItems as unknown as ItemDefinition[]) {
    for (const item of initialItems) {
      this.items.set(item.id, item);
    }
  }

  public getItem(itemId: string): ItemDefinition | undefined {
    return this.items.get(itemId);
  }

  public getAllItems(): ItemDefinition[] {
    return Array.from(this.items.values());
  }

  public registerItem(definition: ItemDefinition): void {
    this.items.set(definition.id, definition);
  }

  public getName(itemId: string, lang: 'en' | 'ar' = 'en'): string {
    const def = this.items.get(itemId);
    if (!def) return itemId;
    return lang === 'ar' ? def.nameAr : def.name;
  }

  public getDescription(itemId: string, lang: 'en' | 'ar' = 'en'): string {
    const def = this.items.get(itemId);
    if (!def) return '';
    return lang === 'ar' ? def.descriptionAr : def.description;
  }
}
