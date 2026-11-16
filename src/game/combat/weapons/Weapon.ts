import * as THREE from 'three';
import type { DamageSystem } from '../DamageSystem';
import type { EnemyController } from '../EnemyController';
import type { DamageResult, DamageType } from '../combatTypes';
import type { WildlifeManager } from '../../wildlife/WildlifeManager';
import type { WorldCollider } from '../../types';

const _weaponFwdDir = new THREE.Vector3();

export type WeaponKind =
  | 'sword'
  | 'axe'
  | 'bow'
  | 'spear'
  | 'crossbow'
  | 'knife';

export type WeaponAttackAnimType =
  | 'melee_slash'
  | 'heavy_chop'
  | 'bow_shot'
  | 'spear_thrust'
  | 'knife_slash'
  | 'unarmed_punch';

export interface WeaponStats {
  id: string;
  itemId: string;
  name: string;
  nameAr: string;
  kind: WeaponKind;
  damage: number;
  critChance: number;
  critMultiplier: number;
  cooldown: number;
  hitDelay: number;
  swingDuration: number;
  range: number;
  arcAngleRad: number;
  knockback: number;
  staminaCost?: number;
  attackAnim: WeaponAttackAnimType;
  damageType: DamageType;
  isRanged: boolean;
  projectileSpeed?: number;
  chargeDuration?: number;
}

export interface WeaponAttackContext {
  origin: THREE.Vector3;
  yaw: number;
  scene: THREE.Scene;
  damageSystem: DamageSystem;
  enemies: EnemyController[];
  wildlife?: WildlifeManager | null;
  queryCollidersNear?: (x: number, z: number) => WorldCollider[];
  spawnHitSparks: (x: number, y: number, z: number, count: number) => void;
  onEnemyHit?: (enemy: EnemyController, result: DamageResult) => void;
  onPlayerWeaponHit?: (hitCount: number) => void;
  onArrowStick?: (x: number, y: number, z: number) => void;
  onHeadshotHit?: (
    targetKind: 'enemy' | 'animal',
    x: number,
    y: number,
    z: number,
  ) => void;
  npcRayTest?: (
    prevPos: THREE.Vector3,
    nextPos: THREE.Vector3,
    hitPadding?: number,
  ) => { id: string; role?: string; isHeadshot: boolean; hitPoint: THREE.Vector3 } | null;
  onNpcHit?: (
    npcId: string,
    hitPos: THREE.Vector3,
    isHeadshot: boolean,
  ) => void;
  bowChargeFactor?: number;
  bowLaunchOrigin?: THREE.Vector3;
  aimTargetPoint?: THREE.Vector3;
  multiplayerAuthoritative?: boolean;
  npcStrikeTest?: (
    origin: THREE.Vector3,
    forwardDir: THREE.Vector3,
    range: number,
    minCos: number,
  ) => Array<{
    id: string;
    role: string;
    position: THREE.Vector3;
    hitHeight: number;
  }>;
  attackId?: string;
  onMultiplayerMeleeHit?: (hit: {
    attackId?: string;
    targetKind: 'enemy' | 'animal' | 'npc';
    targetId: string;
    archetype: string;
    weaponId: string;
    x: number;
    y: number;
    z: number;
    isCrit: boolean;
  }) => void;
  onMultiplayerArrowFired?: (shot: {
    arrowId: string;
    weaponId: string;
    originX: number;
    originY: number;
    originZ: number;
    dirX: number;
    dirY: number;
    dirZ: number;
    bowCharge: number;
  }) => void;
  onMultiplayerProjectileHit?: (hit: {
    arrowId: string;
    targetKind: 'world' | 'enemy' | 'animal' | 'npc';
    targetId: string;
    archetype?: string;
    x: number;
    y: number;
    z: number;
    isHeadshot: boolean;
  }) => void;
}

/**
 * Reusable abstract Weapon base class.
 * Concrete weapon types extend this class to define their 3D model, stats,
 * attack animation type, and hit execution against enemies and wildlife.
 */
export abstract class Weapon {
  public readonly stats: WeaponStats;
  protected viewMesh: THREE.Group | null = null;
  protected readonly disposables: Array<{ dispose: () => void }> = [];

  protected constructor(stats: WeaponStats) {
    this.stats = stats;
  }

  protected abstract buildViewMesh(): THREE.Group;

  public getViewMesh(): THREE.Group {
    if (!this.viewMesh) {
      this.viewMesh = this.buildViewMesh();
    }
    return this.viewMesh;
  }

  public onEquip(mount: THREE.Group): void {
    const mesh = this.getViewMesh();
    if (mesh.parent !== mount) {
      mount.add(mesh);
    }
    mesh.visible = true;
  }

  public onUnequip(): void {
    if (this.viewMesh) {
      this.viewMesh.visible = false;
      this.viewMesh.removeFromParent();
    }
  }

  public abstract executeHit(ctx: WeaponAttackContext): void;

  public update(_dt: number, _ctx: WeaponAttackContext): void {
    // Optional per-frame weapon update (e.g., active projectiles)
  }

  protected applyMeleeArcHit(ctx: WeaponAttackContext): void {
    const hits: EnemyController[] = [];
    ctx.damageSystem.detectMeleeArcHits(
      ctx.origin,
      ctx.yaw,
      this.stats.range,
      this.stats.arcAngleRad,
      ctx.enemies,
      hits,
    );

    let totalHits = 0;

    for (let i = 0; i < hits.length; i++) {
      const enemy = hits[i];
      const isCrit = Math.random() < this.stats.critChance;
      if (ctx.multiplayerAuthoritative) {
        totalHits += 1;
        const hx = enemy.position.x;
        const hy = enemy.position.y + enemy.hitHeight * 0.55;
        const hz = enemy.position.z;
        ctx.spawnHitSparks(hx, hy, hz, isCrit ? 8 : 5);
        ctx.onMultiplayerMeleeHit?.({
          attackId: ctx.attackId,
          targetKind: 'enemy',
          targetId: enemy.id,
          archetype: enemy.archetype.id,
          weaponId: this.stats.id,
          x: hx,
          y: hy,
          z: hz,
          isCrit,
        });
        continue;
      }

      const amount = isCrit
        ? Math.round(this.stats.damage * this.stats.critMultiplier)
        : this.stats.damage;
      const packet = ctx.damageSystem.createPacket({
        amount,
        damageType: this.stats.damageType,
        sourceId: `player:${this.stats.id}`,
        sourcePosition: ctx.origin,
        knockback: this.stats.knockback,
        isCrit,
      });

      const result = ctx.damageSystem.applyDamage(enemy, packet);
      if (result.applied) {
        totalHits += 1;
        ctx.spawnHitSparks(
          enemy.position.x,
          enemy.position.y + enemy.hitHeight * 0.55,
          enemy.position.z,
          isCrit ? 8 : 5,
        );
        ctx.onEnemyHit?.(enemy, result);
      }
    }

    if (ctx.wildlife) {
      _weaponFwdDir.set(Math.sin(ctx.yaw), 0, Math.cos(ctx.yaw));
      const animals = ctx.wildlife.findAnimalsInStrikeArc(
        ctx.origin,
        _weaponFwdDir,
        this.stats.range,
        Math.cos(this.stats.arcAngleRad * 0.5),
      );
      for (let i = 0; i < animals.length; i++) {
        const { animal } = animals[i];
        const isCrit = Math.random() < this.stats.critChance;
        if (ctx.multiplayerAuthoritative) {
          totalHits += 1;
          const hx = animal.position.x;
          const hy = animal.position.y + 0.65;
          const hz = animal.position.z;
          ctx.spawnHitSparks(hx, hy, hz, isCrit ? 7 : 4);
          ctx.onMultiplayerMeleeHit?.({
            attackId: ctx.attackId,
            targetKind: 'animal',
            targetId: animal.id,
            archetype: animal.species,
            weaponId: this.stats.id,
            x: hx,
            y: hy,
            z: hz,
            isCrit,
          });
          continue;
        }

        const amount = isCrit
          ? Math.round(this.stats.damage * this.stats.critMultiplier)
          : this.stats.damage;
        const res = ctx.wildlife.damageAnimal(
          animal.id,
          amount,
          ctx.origin.x,
          ctx.origin.z,
        );
        if (res.hit) {
          totalHits += 1;
          ctx.spawnHitSparks(
            animal.position.x,
            animal.position.y + 0.65,
            animal.position.z,
            isCrit ? 7 : 4,
          );
        }
      }
    }

    if (ctx.multiplayerAuthoritative && ctx.npcStrikeTest) {
      _weaponFwdDir.set(Math.sin(ctx.yaw), 0, Math.cos(ctx.yaw));
      const npcs = ctx.npcStrikeTest(
        ctx.origin,
        _weaponFwdDir,
        this.stats.range,
        Math.cos(this.stats.arcAngleRad * 0.5),
      );
      for (let i = 0; i < npcs.length; i++) {
        const npc = npcs[i];
        const isCrit = Math.random() < this.stats.critChance;
        totalHits += 1;
        const hx = npc.position.x;
        const hy = npc.position.y + npc.hitHeight * 0.55;
        const hz = npc.position.z;
        ctx.spawnHitSparks(hx, hy, hz, isCrit ? 7 : 4);
        ctx.onMultiplayerMeleeHit?.({
          attackId: ctx.attackId,
          targetKind: 'npc',
          targetId: npc.id,
          archetype: npc.role,
          weaponId: this.stats.id,
          x: hx,
          y: hy,
          z: hz,
          isCrit,
        });
      }
    }

    if (totalHits > 0) {
      ctx.onPlayerWeaponHit?.(totalHits);
    }
  }

  public dispose(): void {
    this.onUnequip();
    for (let i = 0; i < this.disposables.length; i++) {
      this.disposables[i].dispose();
    }
    this.disposables.length = 0;
  }
}
