import * as THREE from 'three';
import { Weapon, type WeaponAttackContext } from './Weapon';

/**
 * Rapid close-range Hunter Knife weapon with high critical strike chance.
 */
export class KnifeWeapon extends Weapon {
  constructor() {
    super({
      id: 'hunter-knife',
      itemId: 'hunter-knife',
      name: 'Hunter Knife',
      nameAr: 'خنجر الصياد',
      kind: 'knife',
      damage: 22,
      critChance: 0.34,
      critMultiplier: 1.75,
      cooldown: 0.26,
      hitDelay: 0.05,
      swingDuration: 0.2,
      range: 2.25,
      arcAngleRad: Math.PI * 0.66,
      knockback: 3.0,
      staminaCost: 3,
      attackAnim: 'knife_slash',
      damageType: 'slash',
      isRanged: false,
    });
  }

  protected buildViewMesh(): THREE.Group {
    const group = new THREE.Group();

    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x4b3120,
      roughness: 0.72,
      metalness: 0.05,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd1a24a,
      roughness: 0.3,
      metalness: 0.85,
    });
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xdce6ee,
      roughness: 0.18,
      metalness: 0.9,
    });

    const gripGeo = new THREE.CylinderGeometry(0.022, 0.024, 0.14, 7);
    gripGeo.rotateX(Math.PI * 0.5);
    const guardGeo = new THREE.BoxGeometry(0.11, 0.025, 0.03);
    const bladeGeo = new THREE.BoxGeometry(0.036, 0.015, 0.3);
    const tipGeo = new THREE.ConeGeometry(0.022, 0.1, 4);
    tipGeo.rotateX(Math.PI * 0.5);

    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.set(0, 0, 0.02);

    const guard = new THREE.Mesh(guardGeo, brassMat);
    guard.position.set(0, 0, 0.1);

    const blade = new THREE.Mesh(bladeGeo, steelMat);
    blade.position.set(0, 0, 0.27);
    blade.castShadow = true;

    const tip = new THREE.Mesh(tipGeo, steelMat);
    tip.position.set(0, 0, 0.46);

    group.add(grip, guard, blade, tip);
    this.disposables.push(
      gripMat,
      brassMat,
      steelMat,
      gripGeo,
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
