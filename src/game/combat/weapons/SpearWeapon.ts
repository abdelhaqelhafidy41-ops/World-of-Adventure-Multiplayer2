import * as THREE from 'three';
import { Weapon, type WeaponAttackContext } from './Weapon';

/**
 * Long-reach piercing Spear weapon built for thrust attacks and game hunting.
 */
export class SpearWeapon extends Weapon {
  constructor() {
    super({
      id: 'spear',
      itemId: 'spear',
      name: "Hunter's Spear",
      nameAr: 'رمح الصياد',
      kind: 'spear',
      damage: 36,
      critChance: 0.22,
      critMultiplier: 1.6,
      cooldown: 0.54,
      hitDelay: 0.1,
      swingDuration: 0.32,
      range: 3.85,
      arcAngleRad: Math.PI * 0.48,
      knockback: 6.4,
      staminaCost: 7,
      attackAnim: 'spear_thrust',
      damageType: 'pierce',
      isRanged: false,
    });
  }

  protected buildViewMesh(): THREE.Group {
    const group = new THREE.Group();

    const shaftMat = new THREE.MeshStandardMaterial({
      color: 0x795432,
      roughness: 0.78,
      metalness: 0.04,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xc99a44,
      roughness: 0.34,
      metalness: 0.82,
    });
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0xd3dde6,
      roughness: 0.22,
      metalness: 0.88,
    });

    const shaftGeo = new THREE.CylinderGeometry(0.022, 0.025, 1.55, 7);
    shaftGeo.rotateX(Math.PI * 0.5);
    const ferruleGeo = new THREE.CylinderGeometry(0.03, 0.028, 0.09, 7);
    ferruleGeo.rotateX(Math.PI * 0.5);
    const headGeo = new THREE.ConeGeometry(0.046, 0.26, 4);
    headGeo.rotateX(Math.PI * 0.5);

    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.set(0, 0, 0.46);
    shaft.castShadow = true;

    const ferrule = new THREE.Mesh(ferruleGeo, brassMat);
    ferrule.position.set(0, 0, 1.24);

    const head = new THREE.Mesh(headGeo, tipMat);
    head.position.set(0, 0, 1.4);
    head.castShadow = true;

    group.add(shaft, ferrule, head);
    this.disposables.push(
      shaftMat,
      brassMat,
      tipMat,
      shaftGeo,
      ferruleGeo,
      headGeo,
    );
    return group;
  }

  public executeHit(ctx: WeaponAttackContext): void {
    this.applyMeleeArcHit(ctx);
  }
}
