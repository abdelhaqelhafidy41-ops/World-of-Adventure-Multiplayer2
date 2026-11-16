import * as THREE from 'three';
import type {
  NpcBehaviorState,
  NpcDialogueChoice,
  NpcDialogueSession,
  NpcRole,
  NpcRoutinePeriod,
  WorldCollider,
} from '../types';
import type { DialogueNpcProfile } from '../dialogue/dialogueTypes';
import type { EnemyController } from '../combat/EnemyController';
import type { DamageSystem } from '../combat/DamageSystem';
import {
  groundHeightAt,
  groundSlopeAt,
  seededRandom,
} from '../math/noise';
import {
  findNearestValidLand,
  isLand,
  isValidNPCSpawnLocation,
  isWater,
} from '../world/WorldPlacementValidator';
import { AR_NPC_META } from '../i18n/arContent';
import { ROLE_LABELS, type Language } from '../i18n/translations';
import { getNpcPersona } from './npcPersonalities';
import { NpcRig, type NpcSharedAssets } from './NpcRig';

export interface NpcPoint2D {
  x: number;
  z: number;
}

export interface NpcBedTarget {
  x: number;
  y: number;
  z: number;
  yaw?: number;
}

export interface NpcRoutineSlot {
  period: NpcRoutinePeriod;
  activityLabel: string;
  anchor: NpcPoint2D;
  mode: 'station' | 'wander' | 'work' | 'patrol' | 'sleep';
  wanderRadius: number;
  facingYaw?: number;
  waypoints?: NpcPoint2D[];
}

export interface NpcConfig {
  id: string;
  name: string;
  nameAr?: string;
  role: NpcRole;
  title: string;
  titleAr?: string;
  spawn: NpcPoint2D;
  walkSpeed?: number;
  interactionRadius?: number;
  homeId?: string;
  bedId?: string;
  workplaceId?: string;
  homeEntryPos?: NpcPoint2D;
  homeThresholdPos?: NpcPoint2D;
  bedPos?: NpcBedTarget;
  workplacePos?: NpcPoint2D;
  greetings: Record<NpcRoutinePeriod, string>;
  greetingsAr?: Record<NpcRoutinePeriod, string>;
  choices: NpcDialogueChoice[];
  choicesAr?: NpcDialogueChoice[];
  schedule: NpcRoutineSlot[];
  routineLabelsAr?: Record<NpcRoutinePeriod, string>;
  location?: string;
  locationAr?: string;
  personality?: string;
  personalityAr?: string;
  suggestedPrompts?: string[];
  suggestedPromptsAr?: string[];
  chunkKey?: string;
  seed?: number;
}

export interface NpcTickContext {
  dt: number;
  elapsed: number;
  period: NpcRoutinePeriod;
  playerPos: THREE.Vector3;
  queryCollidersNear: (x: number, z: number) => WorldCollider[];
  otherNpcPositions: Array<{ id: string; x: number; z: number }>;
  enemies?: readonly EnemyController[];
  damageSystem?: DamageSystem | null;
}

export type NpcSleepNavStage =
  | 'outdoor'
  | 'going_to_door'
  | 'entering_door'
  | 'going_to_bed'
  | 'sleeping'
  | 'exiting_door';

export interface NpcBlackboard {
  currentPeriod: NpcRoutinePeriod;
  activeSlot: NpcRoutineSlot;
  waypointIndex: number;
  targetPoint: NpcPoint2D | null;
  waitTimer: number;
  stuckTimer: number;
  lastDistToTarget: number;
  sleepStage: NpcSleepNavStage;
  sleepStageStuckTimer: number;
  memory: Record<string, unknown>;
}

export interface NpcAIModule {
  onAttach?: (npc: NPCBase) => void;
  decide: (npc: NPCBase, ctx: NpcTickContext) => void;
}

/**
 * Modular routine AI supporting daily work/patrol/wander schedules PLUS
 * full doorway -> house interior -> assigned bed sleeping & morning wake navigation.
 */
export class BasicRoutineAI implements NpcAIModule {
  public decide(npc: NPCBase, ctx: NpcTickContext): void {
    if (npc.isTalking()) {
      npc.setBehaviorState('talking');
      npc.stopMoving();
      npc.faceToward(ctx.playerPos.x, ctx.playerPos.z, ctx.dt);
      return;
    }

    if (npc.updateAlertReaction(ctx.dt)) {
      return;
    }

    const bb = npc.blackboard;
    if (bb.currentPeriod !== ctx.period) {
      const prevPeriod = bb.currentPeriod;
      bb.currentPeriod = ctx.period;
      bb.activeSlot = npc.getRoutineForPeriod(ctx.period);
      bb.waypointIndex = 0;
      bb.targetPoint = null;
      bb.waitTimer = 0.25;
      bb.stuckTimer = 0;
      bb.sleepStageStuckTimer = 0;

      if (ctx.period === 'night' && npc.hasAssignedHome()) {
        bb.sleepStage = 'going_to_door';
      } else if (
        prevPeriod === 'night' &&
        (bb.sleepStage === 'sleeping' ||
          bb.sleepStage === 'going_to_bed' ||
          bb.sleepStage === 'entering_door')
      ) {
        bb.sleepStage = 'exiting_door';
      }
    }

    // Handle active house entry & indoor sleeping transitions
    if (npc.hasAssignedHome() && (ctx.period === 'night' || bb.sleepStage !== 'outdoor')) {
      if (this.updateHomeAndSleepRoutine(npc, ctx)) {
        return;
      }
    }

    if (
      npc.role === 'guard' &&
      bb.sleepStage === 'outdoor' &&
      ctx.enemies &&
      ctx.damageSystem &&
      ctx.enemies.length > 0
    ) {
      if (this.updateGuardCombat(npc, ctx)) {
        return;
      }
    }

    const slot = bb.activeSlot;

    // 1. Patrol mode
    if (slot.mode === 'patrol' && slot.waypoints && slot.waypoints.length > 0) {
      if (bb.waitTimer > 0) {
        bb.waitTimer -= ctx.dt;
        npc.setBehaviorState('idle');
        npc.stopMoving();
        return;
      }

      const wp = slot.waypoints[bb.waypointIndex % slot.waypoints.length];
      const arrived = npc.navigateToward(wp.x, wp.z, ctx, 0.9);
      if (arrived || bb.stuckTimer > 2.2) {
        bb.stuckTimer = 0;
        bb.waypointIndex = (bb.waypointIndex + 1) % slot.waypoints.length;
        bb.waitTimer = 1.4 + npc.nextRandom() * 1.6;
        npc.setBehaviorState('idle');
        npc.stopMoving();
      } else {
        npc.setBehaviorState('walking');
      }
      return;
    }

    // 2. Station mode
    if (slot.mode === 'station') {
      const dist = npc.distanceTo2D(slot.anchor.x, slot.anchor.z);
      if (dist > 0.85 && bb.stuckTimer < 2.5) {
        npc.setBehaviorState('walking');
        npc.navigateToward(slot.anchor.x, slot.anchor.z, ctx, 0.75);
      } else {
        npc.stopMoving();
        npc.setBehaviorState('idle');
        if (slot.facingYaw !== undefined) {
          npc.rotateTowardYaw(slot.facingYaw, ctx.dt);
        }
      }
      return;
    }

    // 3. Work mode
    if (slot.mode === 'work') {
      const distAnchor = npc.distanceTo2D(slot.anchor.x, slot.anchor.z);
      if (!bb.targetPoint && distAnchor > slot.wanderRadius + 1.5 && bb.stuckTimer < 2.5) {
        npc.setBehaviorState('walking');
        npc.navigateToward(slot.anchor.x, slot.anchor.z, ctx, 1.0);
        return;
      }

      if (bb.targetPoint) {
        const arrived = npc.navigateToward(bb.targetPoint.x, bb.targetPoint.z, ctx, 0.75);
        if (arrived || bb.stuckTimer > 1.8) {
          bb.targetPoint = null;
          bb.stuckTimer = 0;
          bb.waitTimer = 3.5 + npc.nextRandom() * 3.5;
          npc.stopMoving();
          npc.setBehaviorState('working');
        } else {
          npc.setBehaviorState('wandering');
        }
      } else {
        npc.stopMoving();
        bb.waitTimer -= ctx.dt;
        npc.setBehaviorState(bb.waitTimer > 1.0 ? 'working' : 'idle');
        if (bb.waitTimer <= 0) {
          bb.targetPoint = npc.pickSafePointNear(slot.anchor.x, slot.anchor.z, slot.wanderRadius);
          bb.stuckTimer = 0;
        }
      }
      return;
    }

    // 4. Wander mode
    if (bb.targetPoint) {
      const arrived = npc.navigateToward(bb.targetPoint.x, bb.targetPoint.z, ctx, 0.85);
      if (arrived || bb.stuckTimer > 2.0) {
        bb.targetPoint = null;
        bb.stuckTimer = 0;
        bb.waitTimer = 2.4 + npc.nextRandom() * 3.6;
        npc.stopMoving();
        npc.setBehaviorState('idle');
      } else {
        const distAnchor = npc.distanceTo2D(slot.anchor.x, slot.anchor.z);
        npc.setBehaviorState(distAnchor > slot.wanderRadius + 3 ? 'walking' : 'wandering');
      }
    } else {
      npc.stopMoving();
      npc.setBehaviorState('idle');
      bb.waitTimer -= ctx.dt;
      if (bb.waitTimer <= 0) {
        bb.targetPoint = npc.pickSafePointNear(slot.anchor.x, slot.anchor.z, slot.wanderRadius);
        bb.stuckTimer = 0;
      }
    }
  }

  private updateGuardCombat(npc: NPCBase, ctx: NpcTickContext): boolean {
    const enemies = ctx.enemies;
    const damageSystem = ctx.damageSystem;
    if (!enemies || !damageSystem) return false;

    const bb = npc.blackboard;
    const cooldown = typeof bb.memory.guardAttackCooldown === 'number'
      ? Math.max(0, bb.memory.guardAttackCooldown - ctx.dt)
      : 0;
    bb.memory.guardAttackCooldown = cooldown;

    const post = npc.getRoutineForPeriod('morning').anchor;
    let nearestEnemy: EnemyController | null = null;
    let bestDistSq = 18 * 18;
    const maxLeashSq = 36 * 36;

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (!enemy.health.isAlive() || enemy.state === 'dead') continue;
      const anchorDx = enemy.position.x - post.x;
      const anchorDz = enemy.position.z - post.z;
      if (anchorDx * anchorDx + anchorDz * anchorDz > maxLeashSq) continue;

      const dx = enemy.position.x - npc.position.x;
      const dz = enemy.position.z - npc.position.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        nearestEnemy = enemy;
      }
    }

    if (!nearestEnemy) return false;

    const dist = Math.sqrt(bestDistSq);
    if (dist <= 2.25) {
      npc.stopMoving();
      npc.faceToward(nearestEnemy.position.x, nearestEnemy.position.z, ctx.dt);
      npc.setBehaviorState('working');
      if (cooldown <= 0) {
        damageSystem.applyDamage(nearestEnemy, {
          amount: 14,
          damageType: 'slash',
          sourceId: npc.id,
          sourcePosition: npc.position,
          knockback: 4.5,
          isCrit: false,
        });
        bb.memory.guardAttackCooldown = 1.05;
      }
      return true;
    }

    npc.setBehaviorState('walking');
    npc.navigateToward(
      nearestEnemy.position.x,
      nearestEnemy.position.z,
      ctx,
      1.85,
      4.1,
    );
    return true;
  }

  private updateHomeAndSleepRoutine(npc: NPCBase, ctx: NpcTickContext): boolean {
    const bb = npc.blackboard;
    const doorEntry = npc.homeEntryPos;
    const threshold = npc.homeThresholdPos;
    const bed = npc.bedPos;
    if (!doorEntry || !bed) return false;

    bb.sleepStageStuckTimer += ctx.dt;

    if (ctx.period === 'night') {
      if (bb.sleepStage === 'sleeping') {
        npc.stopMoving();
        npc.setBehaviorState('sleeping');
        npc.position.set(bed.x, bed.y + 0.14, bed.z);
        if (bed.yaw !== undefined) {
          npc.rotateTowardYaw(bed.yaw, ctx.dt * 2);
        }
        return true;
      }

      if (bb.sleepStage === 'going_to_door') {
        const arrived = npc.navigateToward(doorEntry.x, doorEntry.z, ctx, 0.75);
        npc.setBehaviorState('walking');
        if (arrived || bb.sleepStageStuckTimer > 14) {
          if (!arrived) {
            npc.placeAt(doorEntry.x, doorEntry.z);
          }
          bb.sleepStage = 'entering_door';
          bb.sleepStageStuckTimer = 0;
          bb.stuckTimer = 0;
        }
        return true;
      }

      if (bb.sleepStage === 'entering_door') {
        const target = threshold ?? { x: bed.x, z: bed.z };
        const arrived = npc.navigateIndoors(target.x, bed.y, target.z, ctx.dt, 0.55);
        npc.setBehaviorState('walking');
        if (arrived || bb.sleepStageStuckTimer > 8) {
          bb.sleepStage = 'going_to_bed';
          bb.sleepStageStuckTimer = 0;
        }
        return true;
      }

      if (bb.sleepStage === 'going_to_bed') {
        const arrived = npc.navigateIndoors(bed.x, bed.y, bed.z, ctx.dt, 0.45);
        npc.setBehaviorState('walking');
        if (arrived || bb.sleepStageStuckTimer > 8) {
          npc.position.set(bed.x, bed.y + 0.14, bed.z);
          npc.stopMoving();
          bb.sleepStage = 'sleeping';
          bb.sleepStageStuckTimer = 0;
          npc.setBehaviorState('sleeping');
        }
        return true;
      }
    } else {
      // Morning wake & exit doorway before resuming daytime work
      if (bb.sleepStage === 'sleeping' || bb.sleepStage === 'going_to_bed' || bb.sleepStage === 'entering_door') {
        bb.sleepStage = 'exiting_door';
        bb.sleepStageStuckTimer = 0;
      }

      if (bb.sleepStage === 'exiting_door') {
        const arrived = npc.navigateIndoors(
          doorEntry.x,
          groundHeightAt(doorEntry.x, doorEntry.z),
          doorEntry.z,
          ctx.dt,
          0.7,
        );
        npc.setBehaviorState('walking');
        if (arrived || bb.sleepStageStuckTimer > 10) {
          npc.placeAt(doorEntry.x, doorEntry.z);
          bb.sleepStage = 'outdoor';
          bb.sleepStageStuckTimer = 0;
          bb.stuckTimer = 0;
        }
        return true;
      }
    }

    return false;
  }
}

export abstract class NPCBase {
  public readonly id: string;
  public readonly name: string;
  public readonly role: NpcRole;
  public readonly title: string;
  public readonly interactionRadius: number;
  public readonly chunkKey: string | null;

  public readonly homeId?: string;
  public readonly bedId?: string;
  public readonly workplaceId?: string;
  public readonly homeEntryPos?: NpcPoint2D;
  public readonly homeThresholdPos?: NpcPoint2D;
  public readonly bedPos?: NpcBedTarget;
  public readonly workplacePos?: NpcPoint2D;

  public readonly position = new THREE.Vector3();
  public readonly velocity = new THREE.Vector3();
  public readonly rig: NpcRig;
  public readonly blackboard: NpcBlackboard;

  protected readonly config: NpcConfig;
  protected readonly rand: () => number;
  protected aiModule: NpcAIModule;

  public readonly maxHealth: number;
  public hp: number;
  public isDead = false;

  private yaw = 0;
  private readonly walkSpeed: number;
  private readonly radius = 0.42;
  private behaviorState: NpcBehaviorState = 'idle';
  private talking = false;
  private alertTimer = 0;
  private alertSourceX = 0;
  private alertSourceZ = 0;
  private networkRemoteControlled = false;
  private remoteTargetPos: THREE.Vector3 | null = null;
  private remoteTargetYaw = 0;
  private remoteTargetState: NpcBehaviorState = 'idle';
  public pendingDt = 0;

  constructor(config: NpcConfig, assets: NpcSharedAssets) {
    this.config = config;
    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.title = config.title;
    this.chunkKey = config.chunkKey ?? null;
    this.homeId = config.homeId;
    this.bedId = config.bedId;
    this.workplaceId = config.workplaceId;
    this.homeEntryPos = config.homeEntryPos;
    this.homeThresholdPos = config.homeThresholdPos;
    this.bedPos = config.bedPos;
    this.workplacePos = config.workplacePos;

    this.walkSpeed = config.walkSpeed ?? 2.35;
    this.interactionRadius = config.interactionRadius ?? 3.2;
    this.maxHealth = config.role === 'guard' ? 140 : 100;
    this.hp = this.maxHealth;
    this.rand = seededRandom(config.seed ?? this.hashString(config.id));

    const validSpawn = isValidNPCSpawnLocation(config.spawn.x, config.spawn.z, 0.55)
      ? { x: config.spawn.x, y: groundHeightAt(config.spawn.x, config.spawn.z), z: config.spawn.z }
      : findNearestValidLand(config.spawn.x, config.spawn.z, 3.0, 0.34, 80);
    this.position.set(validSpawn.x, validSpawn.y, validSpawn.z);
    this.rig = new NpcRig(
      config.name,
      config.role,
      assets,
      this.rand() * Math.PI * 2,
    );
    this.rig.root.position.copy(this.position);

    const initialSlot = this.getRoutineForPeriod('morning');
    this.blackboard = {
      currentPeriod: 'morning',
      activeSlot: initialSlot,
      waypointIndex: 0,
      targetPoint: null,
      waitTimer: 0.6 + this.rand() * 1.8,
      stuckTimer: 0,
      lastDistToTarget: Infinity,
      sleepStage: 'outdoor',
      sleepStageStuckTimer: 0,
      memory: {},
    };

    this.aiModule = new BasicRoutineAI();
    this.aiModule.onAttach?.(this);
  }

  public hasAssignedHome(): boolean {
    return Boolean(this.homeEntryPos && this.bedPos);
  }

  public wakeToMorningOutdoor(): void {
    this.blackboard.currentPeriod = 'morning';
    this.blackboard.activeSlot = this.getRoutineForPeriod('morning');
    this.blackboard.sleepStage = 'outdoor';
    this.blackboard.sleepStageStuckTimer = 0;
    this.blackboard.targetPoint = null;
    this.blackboard.stuckTimer = 0;
    this.behaviorState = 'idle';
    const spawnAnchor = this.homeEntryPos ?? this.config.spawn;
    this.placeAt(spawnAnchor.x, spawnAnchor.z);
  }

  public placeAt(x: number, z: number): void {
    const y = groundHeightAt(x, z);
    this.position.set(x, y, z);
    this.stopMoving();
    this.rig.root.position.copy(this.position);
  }

  public navigateIndoors(
    targetX: number,
    targetY: number,
    targetZ: number,
    dt: number,
    arrivalThreshold = 0.5,
  ): boolean {
    const dx = targetX - this.position.x;
    const dz = targetZ - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= arrivalThreshold) {
      this.stopMoving();
      return true;
    }
    const dirX = dx / dist;
    const dirZ = dz / dist;
    const step = Math.min(dist, this.walkSpeed * dt);
    const nx = this.position.x + dirX * step;
    const nz = this.position.z + dirZ * step;
    const ny = THREE.MathUtils.damp(this.position.y, targetY, 8, dt);
    this.velocity.set(dirX * this.walkSpeed, 0, dirZ * this.walkSpeed);
    this.position.set(nx, ny, nz);
    this.rotateTowardYaw(Math.atan2(dirX, dirZ), dt);
    return false;
  }

  public setAIModule(module: NpcAIModule): void {
    this.aiModule = module;
    this.aiModule.onAttach?.(this);
  }

  public nextRandom(): number {
    return this.rand();
  }

  public getBehaviorState(): NpcBehaviorState {
    return this.behaviorState;
  }

  public setBehaviorState(state: NpcBehaviorState): void {
    this.behaviorState = state;
  }

  public isTalking(): boolean {
    return this.talking;
  }

  public getRoutineForPeriod(period: NpcRoutinePeriod): NpcRoutineSlot {
    return (
      this.config.schedule.find((s) => s.period === period) ??
      this.config.schedule[0]
    );
  }

  public beginDialogue(playerPos: THREE.Vector3): NpcDialogueSession {
    this.talking = true;
    this.stopMoving();
    this.behaviorState = 'talking';
    this.faceToward(playerPos.x, playerPos.z, 1);
    return this.buildDialogueSession(this.blackboard.currentPeriod);
  }

  public endDialogue(): void {
    this.talking = false;
    this.behaviorState = 'idle';
    this.blackboard.waitTimer = 1.0;
  }

  public getHitRadius(): number {
    return this.radius;
  }

  public getHitHeight(): number {
    return 1.78;
  }

  public getYaw(): number {
    return this.yaw;
  }

  public setNetworkRemoteControlled(remote: boolean): void {
    this.networkRemoteControlled = remote;
    if (!remote) {
      this.remoteTargetPos = null;
    }
  }

  public takeDamage(
    amount: number,
    attackerX?: number,
    attackerZ?: number,
  ): { killed: boolean; hp: number; maxHp: number } {
    if (this.isDead) {
      return { killed: false, hp: 0, maxHp: this.maxHealth };
    }
    this.hp = Math.max(0, this.hp - Math.max(0, amount));
    const killed = this.hp <= 0;
    if (killed) {
      this.applyDeathState();
    } else if (attackerX !== undefined && attackerZ !== undefined) {
      this.reactToArrowHit(attackerX, attackerZ);
    }
    return { killed, hp: this.hp, maxHp: this.maxHealth };
  }

  public applyAuthoritativeHealth(
    hp: number,
    maxHp: number,
    dead: boolean,
    attackerX?: number,
    attackerZ?: number,
  ): boolean {
    const clampedMax = Math.max(1, maxHp || this.maxHealth);
    this.hp = Math.max(0, Math.min(clampedMax, hp));
    const wasDead = this.isDead;
    if (dead || this.hp <= 0) {
      this.hp = 0;
      this.applyDeathState();
      return !wasDead;
    }
    if (wasDead) {
      this.isDead = false;
      this.rig.setDead(false);
    }
    if (attackerX !== undefined && attackerZ !== undefined) {
      this.reactToArrowHit(attackerX, attackerZ);
    }
    return false;
  }

  private applyDeathState(): void {
    this.isDead = true;
    this.talking = false;
    this.alertTimer = 0;
    this.stopMoving();
    this.behaviorState = 'idle';
    this.rig.setDead(true);
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
    if (!this.remoteTargetPos) {
      this.remoteTargetPos = new THREE.Vector3(delta.x, delta.y, delta.z);
    } else {
      this.remoteTargetPos.set(delta.x, delta.y, delta.z);
    }
    if (this.position.distanceToSquared(this.remoteTargetPos) > 100) {
      this.position.copy(this.remoteTargetPos);
      this.yaw = delta.yaw;
    }
    this.remoteTargetYaw = delta.yaw;
    const st = delta.state;
    if (
      st === 'idle' ||
      st === 'walking' ||
      st === 'wandering' ||
      st === 'working' ||
      st === 'talking' ||
      st === 'sleeping'
    ) {
      this.remoteTargetState = st;
    } else {
      this.remoteTargetState = 'idle';
    }
    if (typeof delta.hp === 'number' || typeof delta.isDead === 'boolean') {
      this.applyAuthoritativeHealth(
        delta.hp ?? this.hp,
        delta.maxHp ?? this.maxHealth,
        Boolean(delta.isDead),
      );
    }
  }

  public isSleeping(): boolean {
    return this.blackboard.sleepStage === 'sleeping';
  }

  public reactToArrowHit(sourceX: number, sourceZ: number): void {
    if (this.isDead || this.isSleeping()) return;
    this.alertTimer = 2.6;
    this.alertSourceX = sourceX;
    this.alertSourceZ = sourceZ;
    this.stopMoving();
    if (!this.talking) {
      this.behaviorState = 'idle';
    }
  }

  public updateAlertReaction(dt: number): boolean {
    if (this.alertTimer <= 0) return false;
    this.alertTimer = Math.max(0, this.alertTimer - dt);
    this.stopMoving();
    this.behaviorState = 'idle';
    this.faceToward(this.alertSourceX, this.alertSourceZ, dt);
    return true;
  }

  public getLocalizedName(lang: Language = 'en'): string {
    if (lang === 'ar') {
      return AR_NPC_META[this.id]?.name ?? this.config.nameAr ?? this.name;
    }
    return this.name;
  }

  public setLanguage(lang: Language): void {
    const localizedName = this.getLocalizedName(lang);
    const roleLabel =
      lang === 'ar' ? ROLE_LABELS.ar[this.role] : ROLE_LABELS.en[this.role] ?? this.role.toUpperCase();
    this.rig.updateNameplate(localizedName, roleLabel);
  }

  public getDialogueProfile(lang: Language = 'en'): DialogueNpcProfile {
    const period = this.blackboard.currentPeriod;
    const slot = this.getRoutineForPeriod(period);
    const arMeta = lang === 'ar' ? AR_NPC_META[this.id] : undefined;
    const persona = getNpcPersona(this.id, this.role, lang);
    const isAr = lang === 'ar';

    const resolvedLocation = isAr
      ? (this.config.locationAr ?? persona.location)
      : (this.config.location ?? persona.location);
    const resolvedPersonality = isAr
      ? (this.config.personalityAr ?? persona.personality)
      : (this.config.personality ?? persona.personality);
    const resolvedPrompts = isAr
      ? (this.config.suggestedPromptsAr ?? persona.suggestedPrompts)
      : (this.config.suggestedPrompts ?? persona.suggestedPrompts);
    const resolvedGreetings = isAr
      ? (this.config.greetingsAr ?? this.config.greetings)
      : this.config.greetings;
    const resolvedChoices = isAr
      ? (this.config.choicesAr ?? this.config.choices)
      : this.config.choices;

    return {
      npcId: this.id,
      name: arMeta?.name ?? (isAr ? (this.config.nameAr ?? this.name) : this.name),
      role: this.role,
      title: arMeta?.title ?? (isAr ? (this.config.titleAr ?? this.title) : this.title),
      location: resolvedLocation,
      personality: resolvedPersonality,
      suggestedPrompts: resolvedPrompts,
      routineLabel:
        arMeta?.routineLabels[period] ??
        (isAr ? (this.config.routineLabelsAr?.[period] ?? slot.activityLabel) : slot.activityLabel),
      routinePeriod: period,
      fallbackGreeting: resolvedGreetings[period] ?? resolvedGreetings.morning,
      fallbackChoices: resolvedChoices,
    };
  }

  public buildDialogueSession(period: NpcRoutinePeriod): NpcDialogueSession {
    const slot = this.getRoutineForPeriod(period);
    return {
      npcId: this.id,
      name: this.name,
      role: this.role,
      title: this.title,
      routineLabel: slot.activityLabel,
      routinePeriod: period,
      currentLine: this.config.greetings[period] ?? this.config.greetings.morning,
      choices: this.config.choices,
    };
  }

  public update(ctx: NpcTickContext): void {
    if (this.isDead) {
      this.stopMoving();
      this.rig.root.position.copy(this.position);
      this.rig.root.rotation.y = this.yaw;
      this.rig.updateAnimation(ctx.dt, 'idle', 0);
      return;
    }

    if (this.networkRemoteControlled) {
      if (this.remoteTargetPos) {
        const prevX = this.position.x;
        const prevZ = this.position.z;
        const lambda = 12;
        this.position.x = THREE.MathUtils.damp(this.position.x, this.remoteTargetPos.x, lambda, ctx.dt);
        this.position.y = THREE.MathUtils.damp(this.position.y, this.remoteTargetPos.y, lambda, ctx.dt);
        this.position.z = THREE.MathUtils.damp(this.position.z, this.remoteTargetPos.z, lambda, ctx.dt);
        const moved = Math.hypot(this.position.x - prevX, this.position.z - prevZ);
        const speed = ctx.dt > 0.0001 ? moved / ctx.dt : 0;
        this.velocity.set((this.position.x - prevX) / Math.max(ctx.dt, 0.001), 0, (this.position.z - prevZ) / Math.max(ctx.dt, 0.001));
        this.rotateTowardYaw(this.remoteTargetYaw, ctx.dt);
        this.behaviorState = this.remoteTargetState;
        this.rig.root.position.copy(this.position);
        this.rig.root.rotation.y = this.yaw;
        this.rig.updateAnimation(ctx.dt, this.behaviorState, speed);
      } else {
        this.rig.root.position.copy(this.position);
        this.rig.root.rotation.y = this.yaw;
        this.rig.updateAnimation(ctx.dt, this.behaviorState, 0);
      }
      return;
    }

    this.aiModule.decide(this, ctx);

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.rig.root.position.copy(this.position);
    this.rig.root.rotation.y = this.yaw;
    this.rig.updateAnimation(ctx.dt, this.behaviorState, speed);
  }

  public setVisibility(visible: boolean, showNameplate: boolean): void {
    if (this.rig.root.visible !== visible) {
      this.rig.root.visible = visible;
    }
    const wantNameplate = visible && showNameplate && !this.isDead;
    if (this.rig.nameplateSprite && this.rig.nameplateSprite.visible !== wantNameplate) {
      this.rig.nameplateSprite.visible = wantNameplate;
    }
  }

  public distanceTo2D(x: number, z: number): number {
    return Math.hypot(x - this.position.x, z - this.position.z);
  }

  public stopMoving(): void {
    this.velocity.x = 0;
    this.velocity.z = 0;
  }

  public faceToward(targetX: number, targetZ: number, dt: number): void {
    const dx = targetX - this.position.x;
    const dz = targetZ - this.position.z;
    if (dx * dx + dz * dz < 0.0004) return;
    const targetYaw = Math.atan2(dx, dz);
    this.rotateTowardYaw(targetYaw, dt);
  }

  public rotateTowardYaw(targetYaw: number, dt: number): void {
    const diff = Math.atan2(
      Math.sin(targetYaw - this.yaw),
      Math.cos(targetYaw - this.yaw),
    );
    this.yaw += diff * (1 - Math.exp(-9.5 * Math.min(dt, 0.25)));
  }

  public navigateToward(
    targetX: number,
    targetZ: number,
    ctx: NpcTickContext,
    arrivalThreshold = 0.85,
    speedOverride?: number,
  ): boolean {
    const dx = targetX - this.position.x;
    const dz = targetZ - this.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist <= arrivalThreshold) {
      this.stopMoving();
      this.blackboard.stuckTimer = 0;
      return true;
    }

    if (dist >= this.blackboard.lastDistToTarget - 0.015) {
      this.blackboard.stuckTimer += ctx.dt;
    } else {
      this.blackboard.stuckTimer = Math.max(0, this.blackboard.stuckTimer - ctx.dt * 2);
    }
    this.blackboard.lastDistToTarget = dist;

    let dirX = dx / dist;
    let dirZ = dz / dist;

    const nearby = ctx.queryCollidersNear(this.position.x, this.position.z);
    for (let i = 0; i < nearby.length; i++) {
      const c = nearby[i];
      const ox = this.position.x - c.x;
      const oz = this.position.z - c.z;
      const od = Math.hypot(ox, oz);
      const avoidR = c.radius + this.radius + 0.75;
      if (od < avoidR && od > 0.001) {
        const push = (avoidR - od) / avoidR;
        const nx = ox / od;
        const nz = oz / od;
        dirX += (nx - nz * 0.6) * push * 2.1;
        dirZ += (nz + nx * 0.6) * push * 2.1;
      }
    }

    for (let i = 0; i < ctx.otherNpcPositions.length; i++) {
      const other = ctx.otherNpcPositions[i];
      if (other.id === this.id) continue;
      const ox = this.position.x - other.x;
      const oz = this.position.z - other.z;
      const od = Math.hypot(ox, oz);
      if (od < 1.35 && od > 0.001) {
        const push = (1.35 - od) / 1.35;
        dirX += (ox / od) * push * 1.4;
        dirZ += (oz / od) * push * 1.4;
      }
    }

    const px = this.position.x - ctx.playerPos.x;
    const pz = this.position.z - ctx.playerPos.z;
    const pDist = Math.hypot(px, pz);
    if (pDist < 1.3 && pDist > 0.001) {
      const push = (1.3 - pDist) / 1.3;
      dirX += (px / pDist) * push * 1.6;
      dirZ += (pz / pDist) * push * 1.6;
    }

    const dLen = Math.hypot(dirX, dirZ) || 1;
    dirX /= dLen;
    dirZ /= dLen;

    const moveSpeed = speedOverride ?? this.walkSpeed;
    const nextX = this.position.x + dirX * moveSpeed * ctx.dt;
    const nextZ = this.position.z + dirZ * moveSpeed * ctx.dt;
    const nextY = groundHeightAt(nextX, nextZ);
    const nextSlope = groundSlopeAt(nextX, nextZ, nextY);

    if (
      !isWater(nextX, nextZ, nextY) &&
      isLand(nextX, nextZ, 0.45, nextY) &&
      nextSlope <= 0.4
    ) {
      this.velocity.x = dirX * moveSpeed;
      this.velocity.z = dirZ * moveSpeed;
      this.position.set(nextX, nextY, nextZ);
      if (this.resolveHardColliders(nearby)) {
        this.position.y = groundHeightAt(this.position.x, this.position.z);
      }
      this.rotateTowardYaw(Math.atan2(dirX, dirZ), ctx.dt);
    } else {
      this.blackboard.stuckTimer += ctx.dt * 2;
      this.stopMoving();
    }

    return false;
  }

  public pickSafePointNear(
    anchorX: number,
    anchorZ: number,
    radius: number,
  ): NpcPoint2D {
    for (let attempt = 0; attempt < 10; attempt++) {
      const ang = this.rand() * Math.PI * 2;
      const dist = (0.25 + this.rand() * 0.75) * radius;
      const wx = anchorX + Math.cos(ang) * dist;
      const wz = anchorZ + Math.sin(ang) * dist;
      if (isValidNPCSpawnLocation(wx, wz, 0.55)) {
        return { x: wx, z: wz };
      }
    }
    if (isValidNPCSpawnLocation(anchorX, anchorZ, 0.45)) {
      return { x: anchorX, z: anchorZ };
    }
    const safe = findNearestValidLand(anchorX, anchorZ, 3.0, 0.34, 60);
    return { x: safe.x, z: safe.z };
  }

  private resolveHardColliders(colliders: WorldCollider[]): boolean {
    let pushed = false;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.kind === 'cylinder') {
        if (this.position.y > c.maxY || this.position.y + 1.8 < c.minY) continue;
        const dx = this.position.x - c.x;
        const dz = this.position.z - c.z;
        const minSep = c.radius + this.radius;
        const distSq = dx * dx + dz * dz;
        if (distSq < minSep * minSep && distSq > 0.00001) {
          const d = Math.sqrt(distSq);
          const push = minSep - d;
          this.position.x += (dx / d) * push;
          this.position.z += (dz / d) * push;
          pushed = true;
        }
      }
    }
    return pushed;
  }

  private hashString(str: string): number {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  public dispose(): void {
    this.rig.dispose();
  }
}
