import * as THREE from 'three';
import {
  PLAYABLE_RADIUS,
  WATER_LEVEL,
  groundHeightAt,
  groundSlopeAt,
} from '../math/noise';
import type { WorldCollider } from '../types';
import type { SyncedEntityDelta } from '../../../shared/multiplayerProtocol';
import type { DamageSystem } from './DamageSystem';
import type { EnemyRig, EnemySharedAssets } from './EnemyRig';
import { EnemyRig as EnemyRigClass } from './EnemyRig';
import { HealthComponent } from './HealthComponent';
import type {
  CombatTarget,
  DamagePacket,
  DamageResult,
  EnemyArchetypeConfig,
  EnemyArchetypeId,
  EnemyBehaviorState,
} from './combatTypes';

export const ENEMY_ARCHETYPES: Record<EnemyArchetypeId, EnemyArchetypeConfig> = {
  bandit_scout: {
    id: 'bandit_scout',
    name: 'Bandit Scout',
    nameAr: 'كشّاف اللصوص',
    maxHealth: 65,
    damage: 11,
    damageType: 'slash',
    moveSpeed: 2.2,
    chaseSpeed: 5.4,
    detectionRange: 16.5,
    attackRange: 2.1,
    attackCooldown: 1.25,
    attackWindup: 0.38,
    leashRange: 38,
    patrolRadius: 11,
    hitRadius: 0.65,
    hitHeight: 1.85,
    knockback: 4.5,
    damageReduction: 0.05,
    xpReward: 35,
    coinReward: 8,
    respawnDelay: 42,
    aggression: 0.9,
  },
  thorn_stalker: {
    id: 'thorn_stalker',
    name: 'Thorn Stalker',
    nameAr: 'متعقّب الأشواك',
    maxHealth: 50,
    damage: 9,
    damageType: 'pierce',
    moveSpeed: 2.6,
    chaseSpeed: 6.1,
    detectionRange: 15.0,
    attackRange: 1.95,
    attackCooldown: 1.05,
    attackWindup: 0.3,
    leashRange: 34,
    patrolRadius: 12,
    hitRadius: 0.58,
    hitHeight: 1.55,
    knockback: 3.6,
    damageReduction: 0,
    xpReward: 28,
    coinReward: 6,
    respawnDelay: 38,
    aggression: 0.95,
  },
  stone_sentinel: {
    id: 'stone_sentinel',
    name: 'Stone Sentinel',
    nameAr: 'حارس الحجر',
    maxHealth: 120,
    damage: 18,
    damageType: 'blunt',
    moveSpeed: 1.6,
    chaseSpeed: 3.8,
    detectionRange: 18.0,
    attackRange: 2.55,
    attackCooldown: 1.75,
    attackWindup: 0.55,
    leashRange: 32,
    patrolRadius: 9,
    hitRadius: 0.9,
    hitHeight: 2.5,
    knockback: 7.5,
    damageReduction: 0.18,
    xpReward: 70,
    coinReward: 16,
    respawnDelay: 55,
    aggression: 0.85,
  },
};

const _singleTargetScratch: CombatTarget[] = [];
const _hitsScratch: CombatTarget[] = [];
const ENEMY_DRAW_DIST_SQ = 135 * 135;
const ENEMY_SHADOW_DIST_SQ = 52 * 52;

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * dt));
}

export interface EnemyUpdateContext {
  dt: number;
  elapsed: number;
  camera: THREE.Camera | null;
  playerTarget: CombatTarget;
  damageSystem: DamageSystem;
  queryCollidersNear: (x: number, z: number) => WorldCollider[];
  isVillageClearance: (x: number, z: number) => boolean;
  onEnemySwing?: (enemy: EnemyController) => void;
  onEnemyAttackHit?: (enemy: EnemyController, result: DamageResult) => void;
  drawDistSq?: number;
  midDistSq?: number;
  shadowDistSq?: number;
  shadowsEnabled?: boolean;
}

export interface EnemySpawnConfig {
  id: string;
  archetypeId: EnemyArchetypeId;
  x: number;
  z: number;
  seed: number;
  onDefeated?: (enemy: EnemyController) => void;
}

/**
 * Modular EnemyController managing an individual enemy's health, aggression,
 * detection range, chase navigation, telegraphed attack cooldowns, stagger/knockback,
 * death collapse, and timed respawn.
 */
export class EnemyController implements CombatTarget {
  public readonly id: string;
  public readonly name: string;
  public readonly nameAr: string;
  public readonly faction = 'enemy' as const;
  public readonly archetype: EnemyArchetypeConfig;
  public readonly health: HealthComponent;
  public readonly position = new THREE.Vector3();
  public readonly homePosition = new THREE.Vector3();
  public readonly hitRadius: number;
  public readonly hitHeight: number;
  public readonly rig: EnemyRig;

  public state: EnemyBehaviorState = 'patrol';
  public aggro = false;
  public yaw = 0;
  public networkRemoteControlled = false;

  private readonly velocity = new THREE.Vector3();
  private readonly knockbackVel = new THREE.Vector3();
  private readonly patrolTarget = new THREE.Vector3();
  private readonly onDefeatedCb?: (enemy: EnemyController) => void;
  private readonly isSoftwareGl: boolean;

  private rngState: number;
  private stateTimer = 1.5;
  private patrolPauseTimer = 0;
  private deathElapsed = 0;
  private respawnTimer = 0;
  private pendingDt = 0;
  private frameTick: number;
  private readonly remoteTargetPos = new THREE.Vector3();
  private remoteTargetYaw = 0;
  private hasRemoteTarget = false;

  constructor(
    config: EnemySpawnConfig,
    assets: EnemySharedAssets,
    scene: THREE.Scene,
    isSoftwareGl: boolean,
  ) {
    this.isSoftwareGl = isSoftwareGl;
    const archetype = ENEMY_ARCHETYPES[config.archetypeId];
    this.id = config.id;
    this.archetype = archetype;
    this.name = archetype.name;
    this.nameAr = archetype.nameAr;
    this.hitRadius = archetype.hitRadius;
    this.hitHeight = archetype.hitHeight;
    this.onDefeatedCb = config.onDefeated;

    this.rngState = ((config.seed * 2654435761) >>> 0) || 4242;
    this.frameTick = config.seed & 3;
    this.yaw = this.nextRand() * Math.PI * 2 - Math.PI;

    this.health = new HealthComponent({
      maxHealth: archetype.maxHealth,
      invulnerabilityDuration: 0.14,
      damageReduction: archetype.damageReduction,
    });

    const y = groundHeightAt(config.x, config.z);
    this.position.set(config.x, y, config.z);
    this.homePosition.copy(this.position);
    this.patrolTarget.copy(this.position);

    this.rig = new EnemyRigClass(archetype.id, assets, isSoftwareGl);
    this.rig.root.position.copy(this.position);
    this.rig.root.rotation.y = this.yaw;
    scene.add(this.rig.root);

    this.pickNextPatrolPoint();
  }

  private nextRand(): number {
    let x = this.rngState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rngState = x >>> 0;
    return (this.rngState & 0x7fffffff) / 0x80000000;
  }

  public onDamaged = (result: DamageResult, packet: DamagePacket): void => {
    if (!result.applied) return;
    this.rig.triggerHitFlash();
    this.aggro = true;

    const dx = this.position.x - packet.sourcePosition.x;
    const dz = this.position.z - packet.sourcePosition.z;
    const dist = Math.hypot(dx, dz) || 1;
    const kb = packet.knockback * (this.archetype.id === 'stone_sentinel' ? 0.4 : 1);
    this.knockbackVel.set((dx / dist) * kb, 0, (dz / dist) * kb);

    if (!result.killed) {
      // Heavy sentinels keep poise during attack windup
      const hasPoise =
        this.archetype.id === 'stone_sentinel' && this.state === 'attack_windup';
      if (!hasPoise) {
        this.state = 'stagger';
        this.stateTimer = 0.22;
      }
    }
  };

  public onDeath = (_packet: DamagePacket): void => {
    this.state = 'dead';
    this.aggro = false;
    this.deathElapsed = 0;
    this.respawnTimer = this.archetype.respawnDelay;
    this.velocity.set(0, 0, 0);
    this.onDefeatedCb?.(this);
  };

  public clearAggro(): void {
    if (this.state === 'dead') return;
    this.aggro = false;
    this.state = 'patrol';
    this.pickNextPatrolPoint();
  }

  public setDefeatedSilent(): void {
    this.state = 'dead';
    this.aggro = false;
    this.deathElapsed = 10;
    this.respawnTimer = this.archetype.respawnDelay;
    this.velocity.set(0, 0, 0);
    this.health.syncHealth(0);
    this.rig.root.visible = false;
  }

  public setNetworkRemoteControlled(remote: boolean): void {
    this.networkRemoteControlled = remote;
  }

  public applyAuthoritativeHealth(
    hp: number,
    maxHp: number,
    dead: boolean,
    attackerX?: number,
    attackerZ?: number,
  ): boolean {
    if (maxHp > 0 && maxHp !== this.health.getMaxHealth()) {
      this.health.setMaxHealth(maxHp, false);
    }

    if (!dead && hp > 0 && this.state === 'dead') {
      this.respawnAtHome();
    }

    this.health.syncHealth(dead ? 0 : hp);
    this.rig.triggerHitFlash();

    if (
      !dead &&
      attackerX !== undefined &&
      attackerZ !== undefined &&
      !this.networkRemoteControlled
    ) {
      this.aggro = true;
      const dx = this.position.x - attackerX;
      const dz = this.position.z - attackerZ;
      const dist = Math.hypot(dx, dz) || 1;
      const kb = this.archetype.id === 'stone_sentinel' ? 1.8 : 4.2;
      this.knockbackVel.set((dx / dist) * kb, 0, (dz / dist) * kb);
      const hasPoise =
        this.archetype.id === 'stone_sentinel' && this.state === 'attack_windup';
      if (!hasPoise) {
        this.state = 'stagger';
        this.stateTimer = 0.22;
      }
    }

    if (dead || hp <= 0) {
      const justKilled = this.state !== 'dead';
      this.health.syncHealth(0);
      this.state = 'dead';
      this.aggro = false;
      if (justKilled) {
        this.deathElapsed = 0;
        this.respawnTimer = this.archetype.respawnDelay;
        this.velocity.set(0, 0, 0);
        this.onDefeatedCb?.(this);
      }
      return justKilled;
    }

    return false;
  }

  public applyRemoteSync(delta: SyncedEntityDelta): void {
    if (delta.isDead === false && this.state === 'dead') {
      this.respawnAtHome();
    } else if (delta.isDead && this.state !== 'dead') {
      this.setDefeatedSilent();
    }

    if (typeof delta.hp === 'number' && !delta.isDead) {
      this.health.syncHealth(delta.hp);
    }

    const groundY = Math.max(WATER_LEVEL + 0.05, groundHeightAt(delta.x, delta.z));
    this.remoteTargetPos.set(
      delta.x,
      Number.isFinite(delta.y) ? delta.y : groundY,
      delta.z,
    );
    this.remoteTargetYaw = delta.yaw;

    if (!this.hasRemoteTarget) {
      this.position.copy(this.remoteTargetPos);
      this.yaw = delta.yaw;
      this.hasRemoteTarget = true;
    }

    if (this.state !== 'dead' && !delta.isDead) {
      const validStates: EnemyBehaviorState[] = [
        'patrol',
        'chase',
        'attack_windup',
        'attack_recover',
        'stagger',
      ];
      if (validStates.includes(delta.state as EnemyBehaviorState)) {
        this.state = delta.state as EnemyBehaviorState;
        this.aggro = this.state !== 'patrol';
      }
    }
  }

  private pickNextPatrolPoint(): void {
    const angle = this.nextRand() * Math.PI * 2;
    const r = this.archetype.patrolRadius * (0.35 + this.nextRand() * 0.65);
    const tx = this.homePosition.x + Math.cos(angle) * r;
    const tz = this.homePosition.z + Math.sin(angle) * r;
    this.patrolTarget.set(tx, groundHeightAt(tx, tz), tz);
    this.patrolPauseTimer = 0.8 + this.nextRand() * 2.2;
  }

  public update(ctx: EnemyUpdateContext): void {
    const { dt, elapsed, playerTarget, camera } = ctx;
    const dxP = playerTarget.position.x - this.position.x;
    const dzP = playerTarget.position.z - this.position.z;
    const distSqToPlayer = dxP * dxP + dzP * dzP;

    const drawDistSq = ctx.drawDistSq ?? ENEMY_DRAW_DIST_SQ;
    const midDistSq = ctx.midDistSq ?? ENEMY_SHADOW_DIST_SQ;
    const shadowDistSq = ctx.shadowDistSq ?? ENEMY_SHADOW_DIST_SQ;
    const shadowsEnabled = ctx.shadowsEnabled ?? !this.isSoftwareGl;

    if (this.state === 'dead') {
      this.health.update(dt);
      this.deathElapsed += dt;
      this.respawnTimer -= dt;

      if (this.deathElapsed <= 2.4 && distSqToPlayer <= drawDistSq) {
        this.rig.root.visible = true;
        this.rig.setLodDetail(false);
        this.rig.updateAnimation(dt, elapsed, 'dead', 0, this.deathElapsed);
      } else {
        this.rig.root.visible = false;
      }

      if (!this.networkRemoteControlled && this.respawnTimer <= 0 && distSqToPlayer > 28 * 28) {
        this.respawnAtHome();
      }
      return;
    }

    // Distant enemy simulation throttling & visibility culling
    if (distSqToPlayer > drawDistSq) {
      this.rig.root.visible = false;
      if (!this.networkRemoteControlled) {
        this.aggro = false;
        this.state = 'patrol';
      }
      this.pendingDt = 0;
      return;
    }
    this.rig.root.visible = true;
    this.rig.setLodDetail(distSqToPlayer > midDistSq);
    this.rig.setShadowCasting(shadowsEnabled && distSqToPlayer <= shadowDistSq);

    if (this.networkRemoteControlled) {
      this.health.update(dt);
      let horizSpeed = 0;
      if (this.hasRemoteTarget) {
        const dx = this.remoteTargetPos.x - this.position.x;
        const dz = this.remoteTargetPos.z - this.position.z;
        const distSq = dx * dx + dz * dz;
        if (distSq > 100) {
          this.position.copy(this.remoteTargetPos);
          this.yaw = this.remoteTargetYaw;
          this.velocity.set(0, 0, 0);
        } else {
          const prevX = this.position.x;
          const prevZ = this.position.z;
          this.position.x = THREE.MathUtils.damp(this.position.x, this.remoteTargetPos.x, 11, dt);
          this.position.y = THREE.MathUtils.damp(this.position.y, this.remoteTargetPos.y, 11, dt);
          this.position.z = THREE.MathUtils.damp(this.position.z, this.remoteTargetPos.z, 11, dt);
          this.yaw = dampAngle(this.yaw, this.remoteTargetYaw, 11, dt);
          const safeDt = Math.max(0.008, dt);
          const vx = (this.position.x - prevX) / safeDt;
          const vz = (this.position.z - prevZ) / safeDt;
          horizSpeed = Math.min(this.archetype.chaseSpeed * 1.15, Math.hypot(vx, vz));
          this.velocity.set(vx, 0, vz);
        }
      } else {
        this.velocity.set(0, 0, 0);
      }

      this.rig.root.position.copy(this.position);
      this.rig.root.rotation.y = this.yaw;
      this.rig.updateAnimation(dt, elapsed, this.state, horizSpeed, 0);
      const showBar =
        this.health.getHealthRatio() < 0.999 || distSqToPlayer <= 16.5 * 16.5;
      this.rig.updateHealthBar(this.health.getHealthRatio(), showBar, camera);
      return;
    }

    // Mid-distance non-aggro patrols update every 3rd frame with accumulated dt
    this.frameTick++;
    let stepDt = dt;
    if (distSqToPlayer > midDistSq && !this.aggro && this.state === 'patrol') {
      this.pendingDt += dt;
      if (this.frameTick % 3 !== 0) {
        return;
      }
      stepDt = this.pendingDt;
      this.pendingDt = 0;
    } else if (this.pendingDt > 0) {
      stepDt = dt + this.pendingDt;
      this.pendingDt = 0;
    }

    this.health.update(stepDt);
    const distToPlayer = Math.sqrt(distSqToPlayer);

    // Apply knockback decay
    let hasKnockback = false;
    if (this.knockbackVel.lengthSq() > 0.01) {
      this.position.x += this.knockbackVel.x * stepDt;
      this.position.z += this.knockbackVel.z * stepDt;
      this.knockbackVel.multiplyScalar(Math.exp(-10 * stepDt));
      hasKnockback = true;
    } else {
      this.knockbackVel.set(0, 0, 0);
    }

    const distFromHome = Math.hypot(
      this.position.x - this.homePosition.x,
      this.position.z - this.homePosition.z,
    );
    const playerInSafeVillage = ctx.isVillageClearance(
      playerTarget.position.x,
      playerTarget.position.z,
    );

    let knownSteerH: number | null = null;
    let moved = hasKnockback;

    // State machine
    if (this.state === 'stagger') {
      this.stateTimer -= stepDt;
      this.velocity.set(0, 0, 0);
      if (this.stateTimer <= 0) {
        this.state = 'chase';
      }
    } else if (this.state === 'attack_windup') {
      this.velocity.set(0, 0, 0);
      this.yaw = dampAngle(this.yaw, Math.atan2(dxP, dzP), 12, stepDt);
      this.stateTimer -= stepDt;
      if (this.stateTimer <= 0) {
        this.executeMeleeAttack(ctx);
        this.state = 'attack_recover';
        this.stateTimer = this.archetype.attackCooldown;
      }
    } else if (this.state === 'attack_recover') {
      this.velocity.set(0, 0, 0);
      this.yaw = dampAngle(this.yaw, Math.atan2(dxP, dzP), 7, stepDt);
      this.stateTimer -= stepDt;
      if (this.stateTimer <= 0) {
        this.state = this.aggro ? 'chase' : 'patrol';
      }
    } else if (this.state === 'chase') {
      if (
        !playerTarget.health.isAlive() ||
        playerInSafeVillage ||
        distFromHome > this.archetype.leashRange ||
        distToPlayer > this.archetype.detectionRange * 1.9
      ) {
        this.aggro = false;
        this.state = 'patrol';
        this.pickNextPatrolPoint();
      } else if (distToPlayer <= this.archetype.attackRange) {
        this.state = 'attack_windup';
        this.stateTimer = this.archetype.attackWindup;
        this.velocity.set(0, 0, 0);
      } else {
        knownSteerH = this.steerToward(
          playerTarget.position.x,
          playerTarget.position.z,
          this.archetype.chaseSpeed,
          stepDt,
          ctx,
        );
        if (knownSteerH !== null) moved = true;
      }
    } else {
      // Patrol state: check detection range + aggression
      const effectiveDetect =
        this.archetype.detectionRange * (0.75 + 0.25 * this.archetype.aggression);
      if (
        playerTarget.health.isAlive() &&
        !playerInSafeVillage &&
        distToPlayer <= effectiveDetect
      ) {
        this.aggro = true;
        this.state = 'chase';
      } else if (this.patrolPauseTimer > 0) {
        this.patrolPauseTimer -= stepDt;
        this.velocity.set(0, 0, 0);
      } else {
        const pdx = this.patrolTarget.x - this.position.x;
        const pdz = this.patrolTarget.z - this.position.z;
        if (pdx * pdx + pdz * pdz < 1.2 * 1.2) {
          this.pickNextPatrolPoint();
          this.velocity.set(0, 0, 0);
        } else {
          knownSteerH = this.steerToward(
            this.patrolTarget.x,
            this.patrolTarget.z,
            this.archetype.moveSpeed,
            stepDt,
            ctx,
          );
          if (knownSteerH !== null) moved = true;
        }
      }
    }

    // Clamp to ground & resolve nearby obstacle colliders only if position changed
    if (moved) {
      const pushed = this.resolveColliders(ctx.queryCollidersNear);
      const rawH =
        !pushed && !hasKnockback && knownSteerH !== null
          ? knownSteerH
          : groundHeightAt(this.position.x, this.position.z);
      this.position.y = Math.max(WATER_LEVEL + 0.05, rawH);
    }

    this.rig.root.position.copy(this.position);
    this.rig.root.rotation.y = this.yaw;

    const horizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.rig.updateAnimation(stepDt, elapsed, this.state, horizSpeed, 0);

    const showBar =
      this.health.getHealthRatio() < 0.999 || distSqToPlayer <= 16.5 * 16.5;
    this.rig.updateHealthBar(this.health.getHealthRatio(), showBar, camera);
  }

  private steerToward(
    tx: number,
    tz: number,
    speed: number,
    dt: number,
    ctx: EnemyUpdateContext,
  ): number | null {
    const dx = tx - this.position.x;
    const dz = tz - this.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    const nx = dx / dist;
    const nz = dz / dist;

    const nextX = this.position.x + nx * speed * dt;
    const nextZ = this.position.z + nz * speed * dt;

    const nextH = groundHeightAt(nextX, nextZ);
    const nextSlope = groundSlopeAt(nextX, nextZ, nextH);
    const blocked =
      nextH < WATER_LEVEL + 0.25 ||
      nextSlope > 0.44 ||
      nextX * nextX + nextZ * nextZ > (PLAYABLE_RADIUS - 14) * (PLAYABLE_RADIUS - 14) ||
      ctx.isVillageClearance(nextX, nextZ);

    if (blocked) {
      if (this.state === 'patrol') {
        this.pickNextPatrolPoint();
      }
      this.velocity.set(0, 0, 0);
      return null;
    }

    this.position.x = nextX;
    this.position.z = nextZ;
    this.velocity.set(nx * speed, 0, nz * speed);
    this.yaw = dampAngle(this.yaw, Math.atan2(nx, nz), 9.5, dt);
    return nextH;
  }

  private resolveColliders(
    queryCollidersNear: (x: number, z: number) => WorldCollider[],
  ): boolean {
    const colliders = queryCollidersNear(this.position.x, this.position.z);
    let pushed = false;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      const minR = c.radius + this.hitRadius;
      const dx = this.position.x - c.x;
      const dz = this.position.z - c.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minR * minR && dSq > 0.0001) {
        const d = Math.sqrt(dSq);
        const push = minR - d;
        this.position.x += (dx / d) * push;
        this.position.z += (dz / d) * push;
        pushed = true;
      }
    }
    return pushed;
  }

  private executeMeleeAttack(ctx: EnemyUpdateContext): void {
    ctx.onEnemySwing?.(this);
    _singleTargetScratch.length = 0;
    _singleTargetScratch.push(ctx.playerTarget);

    _hitsScratch.length = 0;
    ctx.damageSystem.detectMeleeArcHits(
      this.position,
      this.yaw,
      this.archetype.attackRange + 0.45,
      Math.PI * 0.85,
      _singleTargetScratch,
      _hitsScratch,
    );

    if (_hitsScratch.length > 0) {
      const packet = ctx.damageSystem.createPacket({
        amount: this.archetype.damage,
        damageType: this.archetype.damageType,
        sourceId: this.id,
        sourcePosition: this.position,
        knockback: this.archetype.knockback,
        isCrit: false,
      });
      const result = ctx.damageSystem.applyDamage(ctx.playerTarget, packet);
      if (result.applied) {
        ctx.onEnemyAttackHit?.(this, result);
      }
    }
  }

  private respawnAtHome(): void {
    this.health.revive(1);
    this.position.copy(this.homePosition);
    this.velocity.set(0, 0, 0);
    this.knockbackVel.set(0, 0, 0);
    this.aggro = false;
    this.state = 'patrol';
    this.deathElapsed = 0;
    this.rig.root.position.copy(this.position);
    this.rig.root.visible = true;
    this.pickNextPatrolPoint();
  }

  public dispose(): void {
    this.rig.dispose();
  }
}
