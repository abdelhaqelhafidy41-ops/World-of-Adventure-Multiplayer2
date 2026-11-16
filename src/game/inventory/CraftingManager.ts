import rawRecipes from './recipes.json';
import type { InventoryManager } from './InventoryManager';
import type { CraftingRecipe, CraftingRecipeView } from './inventoryTypes';

export type CraftResult =
  | { ok: false; reason: 'unknown_recipe' | 'missing_ingredients' | 'inventory_full' }
  | { ok: true; itemId: string; count: number; recipe: CraftingRecipe };

/**
 * Data-driven CraftingManager executing recipes against InventoryManager.
 */
export class CraftingManager {
  private readonly recipes: CraftingRecipe[];

  constructor(recipes: CraftingRecipe[] = rawRecipes as unknown as CraftingRecipe[]) {
    this.recipes = recipes;
  }

  public getRecipes(): CraftingRecipe[] {
    return this.recipes;
  }

  public getRecipe(recipeId: string): CraftingRecipe | undefined {
    return this.recipes.find((r) => r.id === recipeId);
  }

  public getRecipeViews(inventory: InventoryManager): CraftingRecipeView[] {
    const views: CraftingRecipeView[] = [];
    for (let i = 0; i < this.recipes.length; i++) {
      const recipe = this.recipes[i];
      const resultItem = inventory.itemManager.getItem(recipe.resultItemId);
      if (!resultItem) continue;

      let canCraft = true;
      const ingredients = recipe.ingredients.map((ing) => {
        const owned = inventory.getItemCount(ing.itemId);
        if (owned < ing.count) canCraft = false;
        const definition = inventory.itemManager.getItem(ing.itemId) ?? {
          id: ing.itemId,
          name: ing.itemId,
          nameAr: ing.itemId,
          description: '',
          descriptionAr: '',
          category: 'material' as const,
          icon: 'wood' as const,
          stackable: true,
          maxStack: 50,
          usable: false,
          droppable: true,
        };
        return {
          itemId: ing.itemId,
          required: ing.count,
          owned,
          definition,
        };
      });

      views.push({
        recipe,
        resultItem,
        ingredients,
        canCraft,
      });
    }
    return views;
  }

  public craft(recipeId: string, inventory: InventoryManager): CraftResult {
    const recipe = this.getRecipe(recipeId);
    if (!recipe) {
      return { ok: false, reason: 'unknown_recipe' };
    }
    if (!inventory.hasIngredients(recipe.ingredients)) {
      return { ok: false, reason: 'missing_ingredients' };
    }
    if (!inventory.consumeIngredients(recipe.ingredients)) {
      return { ok: false, reason: 'missing_ingredients' };
    }

    const res = inventory.addItem(recipe.resultItemId, recipe.resultCount);
    if (res.added <= 0) {
      // Refund ingredients if inventory had no space
      for (const ing of recipe.ingredients) {
        inventory.addItem(ing.itemId, ing.count);
      }
      return { ok: false, reason: 'inventory_full' };
    }

    return {
      ok: true,
      itemId: recipe.resultItemId,
      count: res.added,
      recipe,
    };
  }
}
