import type * as THREE from 'three';
import type {
  CombatTarget,
  DamagePacket,
  DamageResult,
  DamageType,
  WeaponProfile,
} from './combatTypes';

export interface DamageEvent {
  target: CombatTarget;
  packet: DamagePacket;
  result: DamageResult;
}

/**
 * Modular DamageSystem handling hit-shape detection (melee cones & AoE spheres),
 * critical hit rolls, damage packet construction, and damage application.
 */
export class DamageSystem {
  private readonly listeners: Array<(event: DamageEvent) => void> = [];

  public onDamageApplied(listener: (event: DamageEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  public computeWeaponDamage(
    weapon: WeaponProfile,
    rng: () => number = Math.random,
  ): { amount: number; isCrit: boolean } {
    const isCrit = rng() < weapon.critChance;
    const raw = isCrit
      ? Math.round(weapon.baseDamage * weapon.critMultiplier)
      : weapon.baseDamage;
    return { amount: raw, isCrit };
  }

  public createPacket(params: {
    amount: number;
    damageType: DamageType;
    sourceId: string;
    sourcePosition: THREE.Vector3;
    knockback: number;
    isCrit?: boolean;
  }): DamagePacket {
    return {
      amount: params.amount,
      damageType: params.damageType,
      sourceId: params.sourceId,
      sourcePosition: params.sourcePosition,
      knockback: params.knockback,
      isCrit: Boolean(params.isCrit),
    };
  }

  /**
   * Forward melee cleave/arc hit detection.
   * Matches character orientation (+Z rotated by forwardYaw) against candidate targets.
   */
  public detectMeleeArcHits<T extends CombatTarget>(
    origin: THREE.Vector3,
    forwardYaw: number,
    range: number,
    arcAngleRad: number,
    candidates: readonly T[],
    outHits: T[],
  ): T[] {
    outHits.length = 0;
    const fwdX = Math.sin(forwardYaw);
    const fwdZ = Math.cos(forwardYaw);
    const minCos = Math.cos(arcAngleRad * 0.5);

    for (let i = 0; i < candidates.length; i++) {
      const target = candidates[i];
      if (!target.health.isAlive()) continue;

      const dx = target.position.x - origin.x;
      const dz = target.position.z - origin.z;
      const dy = Math.abs(target.position.y - origin.y);
      if (dy > Math.max(2.3, target.hitHeight + 0.8)) continue;

      const effectiveRange = range + target.hitRadius;
      const horizDistSq = dx * dx + dz * dz;
      if (horizDistSq > effectiveRange * effectiveRange) continue;

      // Point-blank strikes always connect regardless of exact angle
      if (horizDistSq <= (target.hitRadius + 0.75) * (target.hitRadius + 0.75)) {
        outHits.push(target);
        continue;
      }

      const dist = Math.sqrt(horizDistSq);
      const dot = (dx / dist) * fwdX + (dz / dist) * fwdZ;
      if (dot >= minCos) {
        outHits.push(target);
      }
    }

    return outHits;
  }

  /**
   * Radial sphere/cylinder hit detection for AoE slams or traps.
   */
  public detectSphereHits<T extends CombatTarget>(
    center: THREE.Vector3,
    radius: number,
    candidates: readonly T[],
    outHits: T[],
  ): T[] {
    outHits.length = 0;
    for (let i = 0; i < candidates.length; i++) {
      const target = candidates[i];
      if (!target.health.isAlive()) continue;

      const dx = target.position.x - center.x;
      const dz = target.position.z - center.z;
      const dy = Math.abs(target.position.y - center.y);
      if (dy > Math.max(2.4, target.hitHeight + 0.8)) continue;

      const reach = radius + target.hitRadius;
      if (dx * dx + dz * dz <= reach * reach) {
        outHits.push(target);
      }
    }
    return outHits;
  }

  public applyDamage(
    target: CombatTarget,
    packet: DamagePacket,
    ignoreInvuln = false,
  ): DamageResult {
    const result = target.health.applyDamage(
      packet.amount,
      packet.isCrit,
      ignoreInvuln,
    );

    if (result.applied) {
      target.onDamaged?.(result, packet);
      if (result.killed) {
        target.onDeath?.(packet);
      }
      for (let i = 0; i < this.listeners.length; i++) {
        this.listeners[i]({ target, packet, result });
      }
    }

    return result;
  }
}
