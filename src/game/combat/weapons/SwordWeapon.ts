import * as THREE from 'three';
import { Weapon, type WeaponAttackContext } from './Weapon';

export type SwordVariantId =
  | 'ranger-sword'
  | 'wooden-sword'
  | 'iron-sword'
  | 'steel-sword';

const SWORD_VARIANTS: Record<
  SwordVariantId,
  {
    name: string;
    nameAr: string;
    damage: number;
    critChance: number;
    cooldown: number;
    range: number;
    staminaCost: number;
    bladeColor: number;
    guardColor: number;
    metalness: number;
    roughness: number;
    bladeLen: number;
  }
> = {
  'ranger-sword': {
    name: "Ranger's Sword",
    nameAr: 'سيف الجوّال',
    damage: 26,
    critChance: 0.18,
    cooldown: 0.42,
    range: 2.85,
    staminaCost: 5,
    bladeColor: 0xcad4de,
    guardColor: 0xd9a84e,
    metalness: 0.88,
    roughness: 0.22,
    bladeLen: 0.68,
  },
  'wooden-sword': {
    name: 'Wooden Sword',
    nameAr: 'سيف خشبي',
    damage: 16,
    critChance: 0.12,
    cooldown: 0.4,
    range: 2.6,
    staminaCost: 4,
    bladeColor: 0x9c7248,
    guardColor: 0x6f4a2a,
    metalness: 0.06,
    roughness: 0.78,
    bladeLen: 0.6,
  },
  'iron-sword': {
    name: 'Iron Sword',
    nameAr: 'سيف حديدي',
    damage: 34,
    critChance: 0.2,
    cooldown: 0.44,
    range: 2.95,
    staminaCost: 6,
    bladeColor: 0xa6b2be,
    guardColor: 0x5c646d,
    metalness: 0.82,
    roughness: 0.3,
    bladeLen: 0.72,
  },
  'steel-sword': {
    name: 'Steel Sword',
    nameAr: 'سيف فولاذي',
    damage: 44,
    critChance: 0.26,
    cooldown: 0.4,
    range: 3.05,
    staminaCost: 6,
    bladeColor: 0xe3ecf5,
    guardColor: 0xe8bc5c,
    metalness: 0.92,
    roughness: 0.16,
    bladeLen: 0.76,
  },
};

/**
 * Balanced, fast-swinging melee Sword weapon supporting wooden, iron, ranger, and steel tiers.
 */
export class SwordWeapon extends Weapon {
  private readonly variant: (typeof SWORD_VARIANTS)[SwordVariantId];

  constructor(variantId: SwordVariantId = 'ranger-sword') {
    const v = SWORD_VARIANTS[variantId];
    super({
      id: variantId,
      itemId: variantId,
      name: v.name,
      nameAr: v.nameAr,
      kind: 'sword',
      damage: v.damage,
      critChance: v.critChance,
      critMultiplier: 1.5,
      cooldown: v.cooldown,
      hitDelay: 0.09,
      swingDuration: 0.28,
      range: v.range,
      arcAngleRad: Math.PI * 0.76,
      knockback: 5.0,
      staminaCost: v.staminaCost,
      attackAnim: 'melee_slash',
      damageType: 'slash',
      isRanged: false,
    });
    this.variant = v;
  }

  protected buildViewMesh(): THREE.Group {
    const group = new THREE.Group();
    const v = this.variant;

    const leatherMat = new THREE.MeshStandardMaterial({
      color: 0x5c3c28,
      roughness: 0.65,
      metalness: 0.06,
    });
    const guardMat = new THREE.MeshStandardMaterial({
      color: v.guardColor,
      roughness: 0.28,
      metalness: v.metalness > 0.2 ? 0.85 : 0.1,
    });
    const bladeMat = new THREE.MeshStandardMaterial({
      color: v.bladeColor,
      roughness: v.roughness,
      metalness: v.metalness,
    });

    const gripGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.16, 7);
    gripGeo.rotateX(Math.PI * 0.5);
    const pommelGeo = new THREE.SphereGeometry(0.036, 7, 6);
    const guardGeo = new THREE.BoxGeometry(0.2, 0.036, 0.04);
    const bladeGeo = new THREE.BoxGeometry(0.054, 0.02, v.bladeLen);
    const tipGeo = new THREE.ConeGeometry(0.032, 0.14, 4);
    tipGeo.rotateX(Math.PI * 0.5);

    const grip = new THREE.Mesh(gripGeo, leatherMat);
    grip.position.set(0, 0, 0.02);

    const pommel = new THREE.Mesh(pommelGeo, guardMat);
    pommel.position.set(0, 0, -0.07);

    const guard = new THREE.Mesh(guardGeo, guardMat);
    guard.position.set(0, 0, 0.12);

    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(0, 0, 0.14 + v.bladeLen * 0.5);
    blade.castShadow = true;

    const tip = new THREE.Mesh(tipGeo, bladeMat);
    tip.position.set(0, 0, 0.14 + v.bladeLen + 0.06);

    group.add(grip, pommel, guard, blade, tip);
    this.disposables.push(
      leatherMat,
      guardMat,
      bladeMat,
      gripGeo,
      pommelGeo,
      guardGeo,
      bladeGeo,
      tipGeo,
    );
    return group;
  }

  public executeHit(ctx: WeaponAttackContext): void {
    this.applyMeleeArcHit(ctx);
  }
}
