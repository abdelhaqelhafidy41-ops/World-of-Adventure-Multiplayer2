import * as THREE from 'three';
import {
  PLAYABLE_RADIUS,
  WATER_LEVEL,
  groundHeightAt,
  groundSlopeAt,
} from '../math/noise';
import {
  findNearestValidLand,
  isWater,
} from '../world/WorldPlacementValidator';
import type { AnimalRig } from './AnimalRig';
import type {
  AnimalBehaviorState,
  AnimalBlackboard,
  AnimalConfig,
  AnimalDiet,
  AnimalSpecies,
  AnimalTraits,
  NearbyAnimalEntry,
  WildlifeTickContext,
} from './wildlifeTypes';

const _nearbyScratch: NearbyAnimalEntry[] = [];

function normalizeAngle(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  const diff = normalizeAngle(target - current);
  return normalizeAngle(current + diff * (1 - Math.exp(-lambda * dt)));
}

export interface AnimalDamageResult {
  damaged: boolean;
  killed: boolean;
  remainingHp: number;
}

/**
 * Base class for all open-world wildlife and livestock species.
 * Encapsulates spatial blackboard state, circadian rhythms, calm peaceful coexistence
 * (peaceful species do NOT flee merely when the player walks near), predator aggro on attack,
 * health/death state, and rig synchronization.
 */
export abstract class Animal {
  public readonly id: string;
  public readonly species: AnimalSpecies;
  public readonly diet: AnimalDiet;
  public readonly traits: AnimalTraits;

  public readonly homeX: number;
  public readonly homeZ: number;
  public readonly scale: number;
  public readonly variant: number;
  public readonly seedPhase: number;

  public readonly position = new THREE.Vector3();
  public readonly velocity = new THREE.Vector3();
  public yaw: number;
  public behaviorState: AnimalBehaviorState = 'idle';
  public readonly blackboard: AnimalBlackboard;

  public hp: number;
  public readonly maxHp: number;
  public isDead = false;
  public deathAge = 0;

  public rig: AnimalRig | null = null;
  public altitude = 0;
  public distSqToPlayer = 0;
  public networkRemoteControlled = false;

  private rngState: number;
  private activeAlertTimer = 0;
  private chaseCooldown = 0;
  private aggroPlayerTimer = 0;
  private playerAttackCooldown = 0;
  private hitFlashTimer = 0;
  private steerBiasX = 0;
  private steerBiasZ = 0;
  private remoteTargetX = 0;
  private remoteTargetY = 0;
  private remoteTargetZ = 0;
  private remoteTargetAltitude = 0;
  private remoteTargetYaw = 0;
  private hasRemoteTarget = false;

  protected constructor(config: AnimalConfig, traits: AnimalTraits) {
    this.id = config.id;
    this.species = config.species;
    this.diet = traits.diet;
    this.traits = traits;
    this.maxHp = traits.maxHp;
    this.hp = config.dead ? 0 : traits.maxHp;
    this.isDead = Boolean(config.dead);
    const rawH = groundHeightAt(config.home.x, config.home.z);
    if (!traits.canFly && (rawH < WATER_LEVEL + 0.55 || isWater(config.home.x, config.home.z, rawH))) {
      const safe = findNearestValidLand(config.home.x, config.home.z, 3.5, 0.35, 60);
      this.homeX = safe.x;
      this.homeZ = safe.z;
      this.position.set(safe.x, safe.y, safe.z);
    } else {
      this.homeX = config.home.x;
      this.homeZ = config.home.z;
      this.position.set(this.homeX, rawH, this.homeZ);
    }
    this.scale = config.scale ?? 1;
    this.variant = config.variant ?? 0;

    this.rngState = ((config.seed * 2654435761) >>> 0) || 1337;
    this.seedPhase = this.nextRand() * Math.PI * 2;
    this.yaw = this.nextRand() * Math.PI * 2 - Math.PI;

    const startFlying = !this.isDead && traits.canFly && this.nextRand() < 0.55;
    this.altitude = startFlying ? 4 + this.nextRand() * 8 : 0;

    this.blackboard = {
      targetX: this.homeX,
      targetZ: this.homeZ,
      hasTarget: false,
      stateTimer: 1.5 + this.nextRand() * 4.5,
      decisionCooldown: 0,
      stuckTimer: 0,
      lastDistToTarget: 0,
      chaseTargetId: null,
      threatX: this.homeX,
      threatZ: this.homeZ,
      hunger: this.nextRand() * 0.55,
      fatigue: this.nextRand() * 0.35,
      airborne: startFlying,
      targetAltitude: this.altitude,
    };

    if (this.isDead) {
      this.behaviorState = 'dead';
      this.altitude = 0;
    } else if (startFlying) {
      this.behaviorState = 'wander';
      this.pickWanderTarget(() => false);
    }
  }

  protected nextRand(): number {
    let x = this.rngState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rngState = x >>> 0;
    return (this.rngState & 0x7fffffff) / 0x80000000;
  }

  public isSleepHour(worldHours: number): boolean {
    const h = ((worldHours % 24) + 24) % 24;
    if (this.traits.nocturnal) {
      return h >= 11.2 && h < 15.8;
    }
    return h >= 22.0 || h < 5.2;
  }

  /**
   * Damages this animal. Peaceful species flee when attacked; predators counter-attack.
   */
  public takeDamage(
    amount: number,
    attackerX: number,
    attackerZ: number,
  ): AnimalDamageResult {
    if (this.isDead || amount <= 0) {
      return { damaged: false, killed: false, remainingHp: this.hp };
    }

    this.hp = Math.max(0, this.hp - amount);
    this.hitFlashTimer = 0.25;

    if (this.hp <= 0) {
      this.isDead = true;
      this.deathAge = 0;
      this.behaviorState = 'dead';
      this.velocity.set(0, 0, 0);
      this.blackboard.hasTarget = false;
      this.blackboard.chaseTargetId = null;
      this.blackboard.airborne = false;
      this.blackboard.targetAltitude = 0;
      this.altitude = 0;
      this.aggroPlayerTimer = 0;
      return { damaged: true, killed: true, remainingHp: 0 };
    }

    if (this.diet === 'predator') {
      // Predators turn to chase and fight back when attacked
      this.aggroPlayerTimer = 14.0;
      this.blackboard.chaseTargetId = 'player';
      this.blackboard.targetX = attackerX;
      this.blackboard.targetZ = attackerZ;
      this.blackboard.hasTarget = true;
      this.enterState('chase', 10.0);
    } else {
      // Peaceful wildlife and livestock only flee when actually harmed
      this.alertFrom(attackerX, attackerZ, 6.0);
    }

    return { damaged: true, killed: false, remainingHp: this.hp };
  }

  public setNetworkRemoteControlled(remote: boolean): void {
    this.networkRemoteControlled = remote;
  }

  public applyRemoteSync(delta: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    state: string;
    hp?: number;
    maxHp?: number;
    isDead?: boolean;
  }): void {
    if (delta.isDead && !this.isDead) {
      this.applyAuthoritativeHealth(0, delta.maxHp ?? this.maxHp, true);
    } else if (typeof delta.hp === 'number' && !this.isDead) {
      this.hp = Math.max(0, Math.min(this.maxHp, delta.hp));
    }

    const groundY = Math.max(WATER_LEVEL + 0.05, groundHeightAt(delta.x, delta.z));
    this.remoteTargetX = delta.x;
    this.remoteTargetZ = delta.z;
    this.remoteTargetYaw = delta.yaw;
    if (this.traits.canFly) {
      this.remoteTargetY = groundY;
      this.remoteTargetAltitude = Math.max(0, delta.y - groundY);
      this.blackboard.airborne = this.remoteTargetAltitude > 0.3;
    } else {
      this.remoteTargetY = Number.isFinite(delta.y) ? delta.y : groundY;
      this.remoteTargetAltitude = 0;
      this.blackboard.airborne = false;
    }

    if (!this.hasRemoteTarget) {
      this.position.set(this.remoteTargetX, this.remoteTargetY, this.remoteTargetZ);
      this.altitude = this.remoteTargetAltitude;
      this.yaw = this.remoteTargetYaw;
      this.hasRemoteTarget = true;
    }

    if (!this.isDead) {
      const validStates: AnimalBehaviorState[] = [
        'idle',
        'wander',
        'flee',
        'chase',
        'eat',
        'sleep',
      ];
      if (validStates.includes(delta.state as AnimalBehaviorState)) {
        this.behaviorState = delta.state as AnimalBehaviorState;
      }
    }
  }

  public applyAuthoritativeHealth(
    hp: number,
    maxHp: number,
    dead: boolean,
    attackerX?: number,
    attackerZ?: number,
  ): boolean {
    const clampedHp = Math.max(0, Math.min(maxHp || this.maxHp, hp));
    this.hp = clampedHp;
    this.hitFlashTimer = 0.25;

    if (dead || this.hp <= 0) {
      const justKilled = !this.isDead;
      this.hp = 0;
      this.isDead = true;
      if (justKilled) {
        this.deathAge = 0;
      }
      this.behaviorState = 'dead';
      this.velocity.set(0, 0, 0);
      this.blackboard.hasTarget = false;
      this.blackboard.chaseTargetId = null;
      this.blackboard.airborne = false;
      this.blackboard.targetAltitude = 0;
      this.altitude = 0;
      this.aggroPlayerTimer = 0;
      return justKilled;
    }

    if (
      !this.networkRemoteControlled &&
      attackerX !== undefined &&
      attackerZ !== undefined
    ) {
      if (this.diet === 'predator') {
        this.aggroPlayerTimer = 14.0;
        this.blackboard.chaseTargetId = 'player';
        this.blackboard.targetX = attackerX;
        this.blackboard.targetZ = attackerZ;
        this.blackboard.hasTarget = true;
        this.enterState('chase', 10.0);
      } else {
        this.alertFrom(attackerX, attackerZ, 6.0);
      }
    }

    return false;
  }

  /**
   * Explicitly startles the animal away from (sourceX, sourceZ).
   */
  public alertFrom(sourceX: number, sourceZ: number, duration = 4.5): void {
    if (this.isDead) return;
    this.activeAlertTimer = Math.max(this.activeAlertTimer, duration);
    this.blackboard.threatX = sourceX;
    this.blackboard.threatZ = sourceZ;
    this.blackboard.chaseTargetId = null;

    if (this.diet === 'predator' && this.species === 'bear') {
      this.enterState('flee', 2.8 + this.nextRand() * 1.6);
    } else {
      this.enterState('flee', duration);
    }
    this.pickFleeTarget(sourceX, sourceZ, () => false);
  }

  protected enterState(next: AnimalBehaviorState, duration: number): void {
    if (this.isDead && next !== 'dead') return;
    this.behaviorState = next;
    this.blackboard.stateTimer = duration;
    this.blackboard.stuckTimer = 0;

    if (next === 'idle' || next === 'sleep' || next === 'eat' || next === 'dead') {
      this.blackboard.hasTarget = false;
      this.blackboard.chaseTargetId = null;
      if (this.traits.canFly) {
        this.blackboard.targetAltitude = 0;
      }
    } else if (this.traits.canFly && (next === 'wander' || next === 'flee')) {
      this.blackboard.airborne = true;
      this.blackboard.targetAltitude =
        next === 'flee' ? 9 + this.nextRand() * 6 : 4 + this.nextRand() * 8;
    }
  }

  protected isWalkableGround(
    x: number,
    z: number,
    isVillageClearance: (px: number, pz: number) => boolean,
  ): boolean {
    if (x * x + z * z > (PLAYABLE_RADIUS - 16) * (PLAYABLE_RADIUS - 16)) {
      return false;
    }
    // Domestic animals graze peacefully inside or near village pastures
    if (!this.traits.domestic && isVillageClearance(x, z)) {
      return false;
    }
    const h = groundHeightAt(x, z);
    if (h < WATER_LEVEL + 0.55 || isWater(x, z, h)) {
      return false;
    }
    const slope = groundSlopeAt(x, z, h);
    return slope <= 0.38;
  }

  protected pickWanderTarget(
    isVillageClearance: (px: number, pz: number) => boolean,
  ): void {
    const rMax = this.traits.wanderRadius;
    for (let attempt = 0; attempt < 6; attempt++) {
      const angle = this.nextRand() * Math.PI * 2;
      const dist = rMax * (0.28 + this.nextRand() * 0.72);
      const tx = this.homeX + Math.cos(angle) * dist;
      const tz = this.homeZ + Math.sin(angle) * dist;
      if (this.traits.canFly) {
        if (tx * tx + tz * tz < (PLAYABLE_RADIUS - 20) * (PLAYABLE_RADIUS - 20)) {
          this.blackboard.targetX = tx;
          this.blackboard.targetZ = tz;
          this.blackboard.hasTarget = true;
          this.blackboard.lastDistToTarget = Math.hypot(
            tx - this.position.x,
            tz - this.position.z,
          );
          return;
        }
      } else if (this.isWalkableGround(tx, tz, isVillageClearance)) {
        this.blackboard.targetX = tx;
        this.blackboard.targetZ = tz;
        this.blackboard.hasTarget = true;
        this.blackboard.lastDistToTarget = Math.hypot(
          tx - this.position.x,
          tz - this.position.z,
        );
        return;
      }
    }

    this.blackboard.targetX = this.homeX;
    this.blackboard.targetZ = this.homeZ;
    this.blackboard.hasTarget = true;
    this.blackboard.lastDistToTarget = Math.hypot(
      this.homeX - this.position.x,
      this.homeZ - this.position.z,
    );
  }

  protected pickFleeTarget(
    threatX: number,
    threatZ: number,
    isVillageClearance: (px: number, pz: number) => boolean,
  ): void {
    const awayX = this.position.x - threatX;
    const awayZ = this.position.z - threatZ;
    const baseAngle =
      awayX * awayX + awayZ * awayZ > 0.01
        ? Math.atan2(awayZ, awayX)
        : this.nextRand() * Math.PI * 2;

    const fleeDist = this.traits.canFly ? 28 : 20;
    for (let attempt = 0; attempt < 5; attempt++) {
      const jitter = attempt === 0 ? 0 : (this.nextRand() - 0.5) * 1.4;
      const angle = baseAngle + jitter;
      const tx = this.position.x + Math.cos(angle) * fleeDist;
      const tz = this.position.z + Math.sin(angle) * fleeDist;
      if (this.traits.canFly || this.isWalkableGround(tx, tz, isVillageClearance)) {
        this.blackboard.targetX = tx;
        this.blackboard.targetZ = tz;
        this.blackboard.hasTarget = true;
        this.blackboard.lastDistToTarget = fleeDist;
        return;
      }
    }

    this.blackboard.targetX = this.homeX;
    this.blackboard.targetZ = this.homeZ;
    this.blackboard.hasTarget = true;
    this.blackboard.lastDistToTarget = Math.hypot(
      this.homeX - this.position.x,
      this.homeZ - this.position.z,
    );
  }

  /**
   * Time-sliced AI brain update.
   * Peaceful animals calmly graze/idle around the player and NEVER auto-flee from player proximity.
   */
  public decideBehavior(stepDt: number, ctx: WildlifeTickContext): void {
    if (this.networkRemoteControlled) {
      if (this.hitFlashTimer > 0) {
        this.hitFlashTimer = Math.max(0, this.hitFlashTimer - stepDt);
      }
      return;
    }
    if (this.isDead) {
      this.behaviorState = 'dead';
      this.velocity.set(0, 0, 0);
      return;
    }

    const bb = this.blackboard;
    bb.stateTimer -= stepDt;
    if (this.activeAlertTimer > 0) {
      this.activeAlertTimer = Math.max(0, this.activeAlertTimer - stepDt);
    }
    if (this.chaseCooldown > 0) {
      this.chaseCooldown = Math.max(0, this.chaseCooldown - stepDt);
    }
    if (this.aggroPlayerTimer > 0) {
      this.aggroPlayerTimer = Math.max(0, this.aggroPlayerTimer - stepDt);
    }
    if (this.playerAttackCooldown > 0) {
      this.playerAttackCooldown = Math.max(0, this.playerAttackCooldown - stepDt);
    }
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - stepDt);
    }

    bb.hunger = Math.min(1, bb.hunger + stepDt * 0.014);
    bb.fatigue = Math.min(1, bb.fatigue + stepDt * 0.008);

    const pDx = ctx.playerPos.x - this.position.x;
    const pDz = ctx.playerPos.z - this.position.z;
    const playerDistSq = pDx * pDx + pDz * pDz;

    // Provoked predator counter-attacking player
    if (this.diet === 'predator' && this.aggroPlayerTimer > 0) {
      if (playerDistSq > 34 * 34) {
        this.aggroPlayerTimer = 0;
        this.enterState('idle', 2.0);
        return;
      }
      bb.chaseTargetId = 'player';
      bb.targetX = ctx.playerPos.x;
      bb.targetZ = ctx.playerPos.z;
      bb.hasTarget = true;
      this.behaviorState = 'chase';
      bb.stateTimer = Math.max(bb.stateTimer, 1.5);

      const strikeRange = this.traits.bodyRadius + 1.65;
      if (
        playerDistSq <= strikeRange * strikeRange &&
        this.playerAttackCooldown <= 0
      ) {
        this.playerAttackCooldown = 1.45;
        ctx.onPredatorHitPlayer?.(this.id, this.species, this.traits.attackDamage);
      }
      return;
    }

    const queryRadius = Math.max(
      this.traits.alertRadius,
      this.traits.predatorDetectRadius,
    );
    const nearby =
      queryRadius > 0
        ? ctx.queryNearbyAnimals(this.position.x, this.position.z, queryRadius, _nearbyScratch)
        : [];

    // Threat detection ONLY against nearby predators (NOT passive player proximity!)
    let threatFound = false;
    let threatX = bb.threatX;
    let threatZ = bb.threatZ;
    let closestThreatDistSq = Infinity;

    let sepX = 0;
    let sepZ = 0;
    let sepCount = 0;
    let bestPrey: NearbyAnimalEntry | null = null;
    let bestPreyDistSq =
      this.traits.predatorDetectRadius * this.traits.predatorDetectRadius;

    for (let i = 0; i < nearby.length; i++) {
      const other = nearby[i];
      if (other.id === this.id || other.isDead) continue;
      const dx = other.x - this.position.x;
      const dz = other.z - this.position.z;
      const dSq = dx * dx + dz * dz;

      // Soft personal-space separation
      const minSpace = this.traits.bodyRadius * 3.1;
      if (dSq > 0.001 && dSq < minSpace * minSpace) {
        const inv = 1 / Math.sqrt(dSq);
        sepX -= dx * inv;
        sepZ -= dz * inv;
        sepCount++;
      }

      if (
        this.diet !== 'predator' &&
        other.diet === 'predator' &&
        dSq < this.traits.alertRadius * this.traits.alertRadius &&
        dSq < closestThreatDistSq
      ) {
        threatFound = true;
        threatX = other.x;
        threatZ = other.z;
        closestThreatDistSq = dSq;
      }

      if (
        this.diet === 'predator' &&
        other.diet !== 'predator' &&
        !other.airborne &&
        dSq < bestPreyDistSq
      ) {
        if (this.species === 'bear' && other.species === 'bird') continue;
        bestPreyDistSq = dSq;
        bestPrey = other;
      }
    }

    if (sepCount > 0) {
      this.steerBiasX = (sepX / sepCount) * 1.4;
      this.steerBiasZ = (sepZ / sepCount) * 1.4;
    } else {
      this.steerBiasX = 0;
      this.steerBiasZ = 0;
    }

    if (threatFound) {
      bb.threatX = threatX;
      bb.threatZ = threatZ;
      this.activeAlertTimer = 3.2;
      if (this.behaviorState !== 'flee' || bb.stateTimer < 1.2) {
        this.enterState('flee', 3.4 + this.nextRand() * 1.8);
      }
      this.pickFleeTarget(threatX, threatZ, ctx.isVillageClearance);
      return;
    }

    // Active flee continuation (only triggered by attack or predator)
    if (this.behaviorState === 'flee') {
      if (bb.stateTimer > 0) {
        return;
      }
      this.enterState('idle', 1.8 + this.nextRand() * 2.5);
      return;
    }

    // Predator chase logic against natural wildlife prey
    if (this.diet === 'predator' && this.chaseCooldown <= 0) {
      if (this.behaviorState === 'chase' && bestPrey) {
        bb.chaseTargetId = bestPrey.id;
        bb.targetX = bestPrey.x;
        bb.targetZ = bestPrey.z;
        bb.hasTarget = true;

        if (bestPreyDistSq <= 2.3 * 2.3) {
          bb.hunger = 0;
          this.chaseCooldown = 18 + this.nextRand() * 12;
          this.enterState('eat', 4.2 + this.nextRand() * 2.0);
          return;
        }
        if (bb.stateTimer <= 0) {
          this.chaseCooldown = 10 + this.nextRand() * 8;
          this.enterState('idle', 2.5 + this.nextRand() * 2.0);
        }
        return;
      }

      if (
        bestPrey &&
        (bb.hunger > 0.34 || this.behaviorState === 'wander') &&
        !this.isSleepHour(ctx.worldHours)
      ) {
        bb.chaseTargetId = bestPrey.id;
        bb.targetX = bestPrey.x;
        bb.targetZ = bestPrey.z;
        bb.hasTarget = true;
        this.enterState('chase', 7.5 + this.nextRand() * 4.0);
        return;
      }
    }

    // Circadian sleep rhythm
    if (this.isSleepHour(ctx.worldHours) && this.activeAlertTimer <= 0) {
      if (this.behaviorState !== 'sleep') {
        if (
          this.traits.canFly &&
          !this.isWalkableGround(this.position.x, this.position.z, ctx.isVillageClearance)
        ) {
          if (this.behaviorState !== 'wander') {
            this.enterState('wander', 5.0);
            this.pickWanderTarget(ctx.isVillageClearance);
          }
          return;
        }
        bb.fatigue = 0;
        this.enterState('sleep', 10 + this.nextRand() * 10);
      } else if (bb.stateTimer <= 0) {
        bb.stateTimer = 10 + this.nextRand() * 8;
      }
      return;
    }

    if (this.behaviorState === 'sleep') {
      this.enterState('idle', 2.0 + this.nextRand() * 2.5);
      return;
    }

    if (bb.stateTimer > 0) {
      return;
    }

    if (this.behaviorState === 'eat') {
      bb.hunger = 0;
      if (this.nextRand() < 0.65) {
        this.enterState('idle', 2.0 + this.nextRand() * 3.0);
      } else {
        this.enterState('wander', 4.5 + this.nextRand() * 5.0);
        this.pickWanderTarget(ctx.isVillageClearance);
      }
      return;
    }

    if (this.behaviorState === 'wander') {
      const canEatHere =
        !this.traits.canFly ||
        this.isWalkableGround(this.position.x, this.position.z, ctx.isVillageClearance);
      if (bb.hunger > 0.52 && canEatHere && this.nextRand() < 0.65) {
        this.enterState('eat', 4.0 + this.nextRand() * 4.0);
      } else {
        this.enterState('idle', 2.2 + this.nextRand() * 3.5);
      }
      return;
    }

    // Currently idle
    const roll = this.nextRand();
    const canEatNow =
      !this.traits.canFly ||
      this.isWalkableGround(this.position.x, this.position.z, ctx.isVillageClearance);
    if (bb.hunger > 0.58 && canEatNow && roll < 0.42) {
      this.enterState('eat', 4.0 + this.nextRand() * 4.5);
    } else {
      this.enterState('wander', 4.5 + this.nextRand() * 6.5);
      this.pickWanderTarget(ctx.isVillageClearance);
    }
  }

  /**
   * Continuous kinematics & animation update. Stops cleanly when dead.
   */
  public stepKinematics(dt: number, elapsed: number, ctx: WildlifeTickContext): void {
    if (this.isDead) {
      this.deathAge += dt;
      this.velocity.set(0, 0, 0);
      if (this.rig) {
        this.rig.root.position.copy(this.position);
        this.rig.root.rotation.y = this.yaw;
        this.rig.root.scale.setScalar(this.scale);
        this.rig.updateAnimation(
          dt,
          elapsed,
          'dead',
          0,
          false,
          0,
          this.seedPhase,
        );
      }
      return;
    }

    if (this.networkRemoteControlled) {
      if (this.hasRemoteTarget) {
        const dx = this.remoteTargetX - this.position.x;
        const dz = this.remoteTargetZ - this.position.z;
        const distSq = dx * dx + dz * dz;
        if (distSq > 100) {
          this.position.set(this.remoteTargetX, this.remoteTargetY, this.remoteTargetZ);
          this.altitude = this.remoteTargetAltitude;
          this.yaw = this.remoteTargetYaw;
          this.velocity.set(0, 0, 0);
        } else {
          const prevX = this.position.x;
          const prevZ = this.position.z;
          this.position.x = THREE.MathUtils.damp(this.position.x, this.remoteTargetX, 11, dt);
          this.position.y = THREE.MathUtils.damp(this.position.y, this.remoteTargetY, 11, dt);
          this.position.z = THREE.MathUtils.damp(this.position.z, this.remoteTargetZ, 11, dt);
          this.altitude = THREE.MathUtils.damp(this.altitude, this.remoteTargetAltitude, 10, dt);
          this.yaw = dampAngle(this.yaw, this.remoteTargetYaw, 11, dt);
          const safeDt = Math.max(0.008, dt);
          const vx = (this.position.x - prevX) / safeDt;
          const vz = (this.position.z - prevZ) / safeDt;
          const spd = Math.hypot(vx, vz);
          if (spd > this.traits.runSpeed) {
            const scale = this.traits.runSpeed / spd;
            this.velocity.set(vx * scale, 0, vz * scale);
          } else {
            this.velocity.set(vx, 0, vz);
          }
        }
      } else {
        this.velocity.set(0, 0, 0);
      }
      if (this.rig) {
        this.rig.root.position.copy(this.position);
        this.rig.root.rotation.y = this.yaw;
        this.rig.root.scale.setScalar(this.scale);
        const actualSpeed = Math.hypot(this.velocity.x, this.velocity.z);
        this.rig.updateAnimation(
          dt,
          elapsed,
          this.behaviorState,
          actualSpeed,
          this.blackboard.airborne,
          this.altitude,
          this.seedPhase,
        );
      }
      return;
    }

    const bb = this.blackboard;
    let speed = 0;

    if (this.behaviorState === 'wander') {
      speed = this.traits.walkSpeed;
    } else if (this.behaviorState === 'flee' || this.behaviorState === 'chase') {
      speed = this.traits.runSpeed;
    }

    let moved = false;
    let knownNextH: number | null = null;

    if (speed > 0 && bb.hasTarget) {
      const dx = bb.targetX - this.position.x;
      const dz = bb.targetZ - this.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist < (bb.chaseTargetId === 'player' ? this.traits.bodyRadius + 1.15 : 1.1)) {
        if (bb.chaseTargetId !== 'player') {
          bb.hasTarget = false;
          if (this.behaviorState === 'wander') {
            this.enterState('idle', 1.8 + this.nextRand() * 3.0);
          }
        }
        this.velocity.set(0, 0, 0);
      } else {
        const dirX = dx / dist + this.steerBiasX * 0.35;
        const dirZ = dz / dist + this.steerBiasZ * 0.35;
        const dirLen = Math.hypot(dirX, dirZ) || 1;
        const nx = dirX / dirLen;
        const nz = dirZ / dirLen;

        const nextX = this.position.x + nx * speed * dt;
        const nextZ = this.position.z + nz * speed * dt;

        let blocked = false;
        if (!this.traits.canFly) {
          const nextH = groundHeightAt(nextX, nextZ);
          knownNextH = nextH;
          const nextSlope = groundSlopeAt(nextX, nextZ, nextH);
          const rSq = nextX * nextX + nextZ * nextZ;
          if (
            nextH < WATER_LEVEL + 0.45 ||
            isWater(nextX, nextZ, nextH) ||
            nextSlope > 0.42 ||
            rSq > (PLAYABLE_RADIUS - 14) * (PLAYABLE_RADIUS - 14) ||
            (!this.traits.domestic && ctx.isVillageClearance(nextX, nextZ))
          ) {
            blocked = true;
          }
        }

        if (blocked) {
          this.pickWanderTarget(ctx.isVillageClearance);
          bb.stuckTimer += dt;
        } else {
          this.position.x = nextX;
          this.position.z = nextZ;
          moved = true;
          this.velocity.set(nx * speed, 0, nz * speed);

          const desiredYaw = Math.atan2(nx, nz);
          this.yaw = dampAngle(this.yaw, desiredYaw, 8.5, dt);

          if (Math.abs(dist - bb.lastDistToTarget) < 0.04 * dt) {
            bb.stuckTimer += dt;
            if (bb.stuckTimer > 2.2) {
              this.pickWanderTarget(ctx.isVillageClearance);
              bb.stuckTimer = 0;
            }
          } else {
            bb.stuckTimer = 0;
          }
          bb.lastDistToTarget = dist;
        }
      }
    } else {
      this.velocity.set(0, 0, 0);
    }

    // Near-player obstacle collision pushout against trees, rocks, and buildings
    let pushed = false;
    if (!this.traits.canFly && ctx.isNearPlayer) {
      const colliders = ctx.queryCollidersNear(this.position.x, this.position.z);
      const bodyR = this.traits.bodyRadius;
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        const minR = c.radius + bodyR;
        const cdx = this.position.x - c.x;
        const cdz = this.position.z - c.z;
        const cDistSq = cdx * cdx + cdz * cdz;
        if (cDistSq < minR * minR && cDistSq > 0.0001) {
          const cDist = Math.sqrt(cDistSq);
          const push = minR - cDist;
          this.position.x += (cdx / cDist) * push;
          this.position.z += (cdz / cDist) * push;
          pushed = true;
        }
      }
    }

    // Vertical terrain & flight altitude placement
    if (this.traits.canFly) {
      const groundY = Math.max(WATER_LEVEL + 0.05, groundHeightAt(this.position.x, this.position.z));
      this.altitude = THREE.MathUtils.damp(this.altitude, bb.targetAltitude, 3.2, dt);
      if (this.altitude < 0.18 && bb.targetAltitude <= 0.05) {
        bb.airborne = false;
        this.altitude = 0;
      } else if (bb.targetAltitude > 0.5) {
        bb.airborne = true;
      }
      this.position.y = groundY;
    } else if (moved || pushed) {
      const rawH =
        !pushed && knownNextH !== null
          ? knownNextH
          : groundHeightAt(this.position.x, this.position.z);
      this.position.y = Math.max(WATER_LEVEL + 0.05, rawH);
    }

    if (this.rig) {
      this.rig.root.position.copy(this.position);
      this.rig.root.rotation.y = this.yaw;
      this.rig.root.scale.setScalar(this.scale);
      const actualSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      this.rig.updateAnimation(
        dt,
        elapsed,
        this.behaviorState,
        actualSpeed,
        bb.airborne,
        this.altitude,
        this.seedPhase,
      );
    }
  }
}

export class DeerAnimal extends Animal {
  private static readonly TRAITS: AnimalTraits = {
    species: 'deer',
    diet: 'herbivore',
    maxHp: 55,
    attackDamage: 0,
    walkSpeed: 2.35,
    runSpeed: 7.9,
    alertRadius: 15,
    predatorDetectRadius: 0,
    wanderRadius: 28,
    bodyRadius: 0.55,
    canFly: false,
    nocturnal: false,
  };

  constructor(config: Omit<AnimalConfig, 'species'>) {
    super({ ...config, species: 'deer' }, DeerAnimal.TRAITS);
  }
}

export class RabbitAnimal extends Animal {
  private static readonly TRAITS: AnimalTraits = {
    species: 'rabbit',
    diet: 'herbivore',
    maxHp: 22,
    attackDamage: 0,
    walkSpeed: 1.85,
    runSpeed: 6.4,
    alertRadius: 11.5,
    predatorDetectRadius: 0,
    wanderRadius: 16,
    bodyRadius: 0.28,
    canFly: false,
    nocturnal: false,
  };

  constructor(config: Omit<AnimalConfig, 'species'>) {
    super({ ...config, species: 'rabbit' }, RabbitAnimal.TRAITS);
  }
}

export class WolfAnimal extends Animal {
  private static readonly TRAITS: AnimalTraits = {
    species: 'wolf',
    diet: 'predator',
    maxHp: 68,
    attackDamage: 12,
    walkSpeed: 3.1,
    runSpeed: 8.3,
    alertRadius: 9.5,
    predatorDetectRadius: 28,
    wanderRadius: 36,
    bodyRadius: 0.5,
    canFly: false,
    nocturnal: true,
  };

  constructor(config: Omit<AnimalConfig, 'species'>) {
    super({ ...config, species: 'wolf' }, WolfAnimal.TRAITS);
  }
}

export class BearAnimal extends Animal {
  private static readonly TRAITS: AnimalTraits = {
    species: 'bear',
    diet: 'predator',
    maxHp: 135,
    attackDamage: 20,
    walkSpeed: 2.25,
    runSpeed: 6.6,
    alertRadius: 7.5,
    predatorDetectRadius: 24,
    wanderRadius: 30,
    bodyRadius: 0.82,
    canFly: false,
    nocturnal: false,
  };

  constructor(config: Omit<AnimalConfig, 'species'>) {
    super({ ...config, species: 'bear' }, BearAnimal.TRAITS);
  }
}

export class BirdAnimal extends Animal {
  private static readonly TRAITS: AnimalTraits = {
    species: 'bird',
    diet: 'avian',
    maxHp: 14,
    attackDamage: 0,
    walkSpeed: 5.8,
    runSpeed: 10.6,
    alertRadius: 10.5,
    predatorDetectRadius: 0,
    wanderRadius: 42,
    bodyRadius: 0.22,
    canFly: true,
    nocturnal: false,
  };

  constructor(config: Omit<AnimalConfig, 'species'>) {
    super({ ...config, species: 'bird' }, BirdAnimal.TRAITS);
  }
}

export class CowAnimal extends Animal {
  private static readonly TRAITS: AnimalTraits = {
    species: 'cow',
    diet: 'herbivore',
    maxHp: 80,
    attackDamage: 0,
    walkSpeed: 1.45,
    runSpeed: 4.5,
    alertRadius: 10,
    predatorDetectRadius: 0,
    wanderRadius: 18,
    bodyRadius: 0.72,
    canFly: false,
    nocturnal: false,
    domestic: true,
  };

  constructor(config: Omit<AnimalConfig, 'species'>) {
    super({ ...config, species: 'cow' }, CowAnimal.TRAITS);
  }
}

export class SheepAnimal extends Animal {
  private static readonly TRAITS: AnimalTraits = {
    species: 'sheep',
    diet: 'herbivore',
    maxHp: 45,
    attackDamage: 0,
    walkSpeed: 1.65,
    runSpeed: 4.9,
    alertRadius: 10,
    predatorDetectRadius: 0,
    wanderRadius: 16,
    bodyRadius: 0.45,
    canFly: false,
    nocturnal: false,
    domestic: true,
  };

  constructor(config: Omit<AnimalConfig, 'species'>) {
    super({ ...config, species: 'sheep' }, SheepAnimal.TRAITS);
  }
}

export class ChickenAnimal extends Animal {
  private static readonly TRAITS: AnimalTraits = {
    species: 'chicken',
    diet: 'herbivore',
    maxHp: 16,
    attackDamage: 0,
    walkSpeed: 1.5,
    runSpeed: 4.6,
    alertRadius: 8,
    predatorDetectRadius: 0,
    wanderRadius: 11,
    bodyRadius: 0.24,
    canFly: false,
    nocturnal: false,
    domestic: true,
  };

  constructor(config: Omit<AnimalConfig, 'species'>) {
    super({ ...config, species: 'chicken' }, ChickenAnimal.TRAITS);
  }
}
