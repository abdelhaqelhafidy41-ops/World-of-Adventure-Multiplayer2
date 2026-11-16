import { AxeWeapon } from './AxeWeapon';
import { BowWeapon } from './BowWeapon';
import { KnifeWeapon } from './KnifeWeapon';
import { SpearWeapon } from './SpearWeapon';
import { SwordWeapon } from './SwordWeapon';
import type { Weapon } from './Weapon';

/**
 * Modular registry mapping item/weapon IDs to Weapon instances.
 * New weapons can be registered without modifying PlayerController or UI code.
 */
export class WeaponRegistry {
  private readonly factories = new Map<string, () => Weapon>();
  private readonly instances = new Map<string, Weapon>();

  constructor() {
    this.register('ranger-sword', () => new SwordWeapon('ranger-sword'));
    this.register('wooden-sword', () => new SwordWeapon('wooden-sword'));
    this.register('iron-sword', () => new SwordWeapon('iron-sword'));
    this.register('steel-sword', () => new SwordWeapon('steel-sword'));
    this.register('woodland-axe', () => new AxeWeapon('woodland-axe'));
    this.register('battle-axe', () => new AxeWeapon('battle-axe'));
    this.register('hunter-bow', () => new BowWeapon('hunter-bow'));
    this.register('crossbow', () => new BowWeapon('crossbow'));
    this.register('spear', () => new SpearWeapon());
    this.register('hunter-knife', () => new KnifeWeapon());
  }

  public register(id: string, factory: () => Weapon): void {
    this.factories.set(id, factory);
  }

  public getOrCreate(id: string): Weapon | null {
    const existing = this.instances.get(id);
    if (existing) return existing;

    const factory = this.factories.get(id);
    if (!factory) return null;

    const created = factory();
    this.instances.set(id, created);
    return created;
  }

  public getInstantiatedWeapons(): Weapon[] {
    return Array.from(this.instances.values());
  }

  public disposeAll(): void {
    for (const w of this.instances.values()) {
      w.dispose();
    }
    this.instances.clear();
  }
}
