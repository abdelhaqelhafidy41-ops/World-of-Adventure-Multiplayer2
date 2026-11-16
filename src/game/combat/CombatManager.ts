import * as THREE from 'three';
import {
  PLAYABLE_RADIUS,
  WATER_LEVEL,
  getBiomeAt,
  groundHeightAt,
  groundSlopeAt,
  seededRandom,
} from '../math/noise';
import type { WorldCollider } from '../types';
import type { ResolvedGraphicsProfile } from '../engine/GraphicsQualityManager';
import type { SyncedEntityDelta } from '../../../shared/multiplayerProtocol';
import { DamageSystem } from './DamageSystem';
import { EnemyController, type EnemyUpdateContext } from './EnemyController';
import { createEnemySharedAssets, type EnemySharedAssets } from './EnemyRig';
import { HealthComponent } from './HealthComponent';
import type {
  CombatEnemyHudTarget,
  CombatTarget,
  DamagePacket,
  DamageResult,
  EnemyArchetypeId,
} from './combatTypes';
import type {
  Weapon,
  WeaponAttackAnimType,
  WeaponAttackContext,
  WeaponStats,
} from './weapons/Weapon';
import { BowWeapon } from './weapons/BowWeapon';
import { WeaponRegistry } from './weapons/WeaponRegistry';
import type { WildlifeManager } from '../wildlife/WildlifeManager';

interface HitSpark {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  scale: number;
  life: number;
  maxLife: number;
}

const MAX_SPARK_INSTANCES = 20;
const _sparkDummy = new THREE.Object3D();
const _animalFwdDir = new THREE.Vector3();

export interface CombatManagerOptions {
  scene: THREE.Scene;
  contactShadowMap: THREE.Texture;
  isSoftwareGl: boolean;
  seed: number;
  playerMaxHealth: number;
  playerPosition: THREE.Vector3;
  weaponMount?: THREE.Group;
  isVillageClearance: (x: number, z: number) => boolean;
  onPlayerDamaged: (result: DamageResult, packet: DamagePacket) => void;
  onPlayerDefeated: () => void;
  onEnemyHit?: (enemy: EnemyController, result: DamageResult) => void;
  onEnemyDefeated?: (enemy: EnemyController) => void;
  onEnemySwing?: (enemy: EnemyController) => void;
}

const UNARMED_COOLDOWN = 0.38;
const UNARMED_HIT_DELAY = 0.08;
const UNARMED_DAMAGE = 9;
const UNARMED_RANGE = 2.0;
const UNARMED_KNOCKBACK = 3.2;

const _unarmedScratch: EnemyController[] = [];

/**
 * Modular third-person CombatManager coordinating:
 * - WeaponRegistry & active Weapon instances (Sword, Axe, Bow, or Unarmed)
 * - Attack cooldowns, hit detection & projectile simulation
 * - Enemy spawning, aggression, chasing, attacks & death rewards
 * - DamageSystem & HealthComponent integration
 */
export class CombatManager {
  public readonly damageSystem = new DamageSystem();
  public readonly weaponRegistry = new WeaponRegistry();
  public readonly enemies: EnemyController[] = [];
  public readonly playerHealth: HealthComponent;
  public readonly playerTarget: CombatTarget;

  private readonly scene: THREE.Scene;
  private readonly assets: EnemySharedAssets;
  private weaponMount: THREE.Group | null;
  private activeWeapon: Weapon | null = null;

  private attackCooldownTimer = 0;
  private lastAttackTotalCooldown = UNARMED_COOLDOWN;
  private pendingHitTimer = -1;
  private pendingAttackWeapon: Weapon | null = null;
  private pendingAttackOrigin = new THREE.Vector3();
  private pendingAttackYaw = 0;
  private pendingAttackId = '';
  private nextAttackSeq = 0;

  private bowCharging = false;
  private bowChargeElapsed = 0;
  private bowChargeMinTime = 0.2;
  private bowChargeDuration = 2.0;
  private pendingBowChargeFactor = 1.0;
  private readonly pendingBowLaunchOrigin = new THREE.Vector3();
  private readonly pendingAimTargetPoint = new THREE.Vector3();
  private hasPendingBowOrigin = false;
  private hasPendingAimTarget = false;

  private recentTarget: EnemyController | null = null;
  private recentTargetTimer = 0;

  // Lightweight pooled combat VFX (slash arc + hit sparks)
  private readonly slashMesh: THREE.Mesh;
  private readonly slashGeo: THREE.RingGeometry;
  private readonly slashMat: THREE.MeshBasicMaterial;
  private slashTimer = 0;

  private readonly sparkPool: HitSpark[] = [];
  private readonly sparkMesh: THREE.InstancedMesh;
  private readonly sparkGeo: THREE.OctahedronGeometry;
  private readonly sparkMat: THREE.MeshBasicMaterial;
  private readonly weaponAttackCtx: WeaponAttackContext;
  private readonly enemyUpdateCtx: EnemyUpdateContext;
  private readonly spawnHitSparksCb: (x: number, y: number, z: number, count: number) => void;
  private readonly onWeaponEnemyHitCb: (enemy: EnemyController, result: DamageResult) => void;
  private readonly onEnemyAttackHitCb: () => void;
  private sparkScale = 1.0;
  private networkRemoteControlled = false;
  private readonly lastSyncSnapshot = new Map<
    string,
    { x: number; y: number; z: number; yaw: number; state: string; hp: number; isDead: boolean }
  >();

  constructor(private readonly options: CombatManagerOptions) {
    this.scene = options.scene;
    this.weaponMount = options.weaponMount ?? null;
    this.assets = createEnemySharedAssets(options.contactShadowMap);

    this.spawnHitSparksCb = (x, y, z, count) => this.spawnHitSparks(x, y, z, count);
    this.onWeaponEnemyHitCb = (enemy, result) => {
      this.recentTarget = enemy;
      this.recentTargetTimer = 5.5;
      this.options.onEnemyHit?.(enemy, result);
    };
    this.onEnemyAttackHitCb = () => {
      this.spawnHitSparks(
        this.playerTarget.position.x,
        this.playerTarget.position.y + 1.05,
        this.playerTarget.position.z,
        5,
      );
    };

    this.playerHealth = new HealthComponent({
      maxHealth: options.playerMaxHealth,
      invulnerabilityDuration: 0.45,
      damageReduction: 0,
    });

    this.playerTarget = {
      id: 'player',
      name: 'Adventurer',
      nameAr: 'المغامر',
      faction: 'player',
      health: this.playerHealth,
      position: options.playerPosition,
      hitRadius: 0.48,
      hitHeight: 1.85,
      onDamaged: (result, packet) => options.onPlayerDamaged(result, packet),
      onDeath: () => options.onPlayerDefeated(),
    };

    this.weaponAttackCtx = {
      origin: options.playerPosition,
      yaw: 0,
      scene: this.scene,
      damageSystem: this.damageSystem,
      enemies: this.enemies,
      wildlife: null,
      spawnHitSparks: this.spawnHitSparksCb,
      onEnemyHit: this.onWeaponEnemyHitCb,
      onPlayerWeaponHit: undefined,
    };

    this.enemyUpdateCtx = {
      dt: 0,
      elapsed: 0,
      camera: null,
      playerTarget: this.playerTarget,
      damageSystem: this.damageSystem,
      queryCollidersNear: () => [],
      isVillageClearance: options.isVillageClearance,
      onEnemySwing: options.onEnemySwing,
      onEnemyAttackHit: this.onEnemyAttackHitCb,
    };

    // Slash arc mesh for melee swings
    this.slashGeo = new THREE.RingGeometry(
      0.95,
      1.55,
      18,
      1,
      -Math.PI * 0.38,
      Math.PI * 0.76,
    );
    this.slashGeo.rotateX(-Math.PI / 2);
    this.slashMat = new THREE.MeshBasicMaterial({
      color: 0xf7e4a1,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.slashMesh = new THREE.Mesh(this.slashGeo, this.slashMat);
    this.slashMesh.visible = false;
    this.scene.add(this.slashMesh);

    // Hit spark InstancedMesh (1 draw call instead of 20)
    this.sparkGeo = new THREE.OctahedronGeometry(0.085, 0);
    this.sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffb347,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    this.sparkMesh = new THREE.InstancedMesh(
      this.sparkGeo,
      this.sparkMat,
      MAX_SPARK_INSTANCES,
    );
    this.sparkMesh.count = 0;
    this.sparkMesh.visible = false;
    this.sparkMesh.frustumCulled = false;
    this.sparkMesh.matrixAutoUpdate = false;
    this.scene.add(this.sparkMesh);

    for (let i = 0; i < MAX_SPARK_INSTANCES; i++) {
      this.sparkPool.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        scale: 1,
        life: 0,
        maxLife: 0.25,
      });
    }

    this.spawnEnemies(options.seed, options.isSoftwareGl, options.isVillageClearance);
  }

  public setWeaponMount(mount: THREE.Group): void {
    this.weaponMount = mount;
    if (this.activeWeapon) {
      this.activeWeapon.onEquip(mount);
    }
  }

  public setWildlifeManager(wildlife: WildlifeManager | null): void {
    this.weaponAttackCtx.wildlife = wildlife;
  }

  public setOnPlayerWeaponHit(cb: ((hitCount: number) => void) | undefined): void {
    this.weaponAttackCtx.onPlayerWeaponHit = cb;
  }

  public setBowWorldCallbacks(opts: {
    queryCollidersNear?: (x: number, z: number) => WorldCollider[];
    onArrowStick?: (x: number, y: number, z: number) => void;
    onHeadshotHit?: (
      targetKind: 'enemy' | 'animal',
      x: number,
      y: number,
      z: number,
    ) => void;
    npcRayTest?: WeaponAttackContext['npcRayTest'];
    onNpcHit?: WeaponAttackContext['onNpcHit'];
  }): void {
    this.weaponAttackCtx.queryCollidersNear = opts.queryCollidersNear;
    this.weaponAttackCtx.onArrowStick = opts.onArrowStick;
    this.weaponAttackCtx.onHeadshotHit = opts.onHeadshotHit;
    this.weaponAttackCtx.npcRayTest = opts.npcRayTest;
    this.weaponAttackCtx.onNpcHit = opts.onNpcHit;
  }

  public setMultiplayerCallbacks(opts: {
    multiplayerAuthoritative: boolean;
    npcStrikeTest?: WeaponAttackContext['npcStrikeTest'];
    onMultiplayerMeleeHit?: WeaponAttackContext['onMultiplayerMeleeHit'];
    onMultiplayerArrowFired?: WeaponAttackContext['onMultiplayerArrowFired'];
    onMultiplayerProjectileHit?: WeaponAttackContext['onMultiplayerProjectileHit'];
  }): void {
    this.weaponAttackCtx.multiplayerAuthoritative = opts.multiplayerAuthoritative;
    this.weaponAttackCtx.npcStrikeTest = opts.npcStrikeTest;
    this.weaponAttackCtx.onMultiplayerMeleeHit = opts.onMultiplayerMeleeHit;
    this.weaponAttackCtx.onMultiplayerArrowFired = opts.onMultiplayerArrowFired;
    this.weaponAttackCtx.onMultiplayerProjectileHit = opts.onMultiplayerProjectileHit;
  }

  public setNetworkRemoteControlled(remote: boolean): void {
    if (this.networkRemoteControlled === remote) return;
    this.networkRemoteControlled = remote;
    for (let i = 0; i < this.enemies.length; i++) {
      this.enemies[i].setNetworkRemoteControlled(remote);
    }
  }

  public applyAuthoritativeEnemyDamage(
    enemyId: string,
    hp: number,
    maxHp: number,
    killed: boolean,
    attackerX?: number,
    attackerZ?: number,
  ): { enemy: EnemyController; justKilled: boolean } | null {
    const enemy = this.enemies.find((e) => e.id === enemyId);
    if (!enemy) return null;
    const justKilled = enemy.applyAuthoritativeHealth(
      hp,
      maxHp,
      killed,
      attackerX,
      attackerZ,
    );
    if (!killed) {
      this.recentTarget = enemy;
      this.recentTargetTimer = 5.5;
    } else if (this.recentTarget === enemy) {
      this.recentTarget = null;
    }
    return { enemy, justKilled };
  }

  public exportSyncDeltas(
    centers: Array<{ x: number; z: number }>,
    maxCount = 8,
    maxRadius = 80,
  ): SyncedEntityDelta[] {
    if (this.networkRemoteControlled || centers.length === 0) return [];
    const rSq = maxRadius * maxRadius;
    const deltas: SyncedEntityDelta[] = [];

    for (let i = 0; i < this.enemies.length && deltas.length < maxCount; i++) {
      const e = this.enemies[i];
      let near = false;
      for (let c = 0; c < centers.length; c++) {
        const dx = e.position.x - centers[c].x;
        const dz = e.position.z - centers[c].z;
        if (dx * dx + dz * dz <= rSq) {
          near = true;
          break;
        }
      }
      if (!near) continue;

      const isDead = e.state === 'dead';
      const hp = Math.round(e.health.getCurrentHealth());
      const prev = this.lastSyncSnapshot.get(e.id);
      if (isDead && prev?.isDead) {
        continue;
      }

      const moved =
        !prev ||
        Math.abs(e.position.x - prev.x) > 0.08 ||
        Math.abs(e.position.y - prev.y) > 0.08 ||
        Math.abs(e.position.z - prev.z) > 0.08 ||
        Math.abs(e.yaw - prev.yaw) > 0.06 ||
        prev.state !== e.state ||
        prev.hp !== hp ||
        prev.isDead !== isDead;

      if (!moved) continue;

      const x = Math.round(e.position.x * 100) / 100;
      const y = Math.round(e.position.y * 100) / 100;
      const z = Math.round(e.position.z * 100) / 100;
      const yaw = Math.round(e.yaw * 1000) / 1000;

      this.lastSyncSnapshot.set(e.id, {
        x,
        y,
        z,
        yaw,
        state: e.state,
        hp,
        isDead,
      });

      deltas.push({
        id: e.id,
        kind: 'enemy',
        archetype: e.archetype.id,
        x,
        y,
        z,
        yaw,
        state: e.state,
        hp,
        maxHp: e.health.getMaxHealth(),
        isDead,
      });
    }

    return deltas;
  }

  public applySyncDeltas(deltas: SyncedEntityDelta[]): void {
    for (let i = 0; i < deltas.length; i++) {
      const d = deltas[i];
      if (d.kind !== 'enemy') continue;
      const enemy = this.enemies.find((e) => e.id === d.id);
      if (enemy) {
        enemy.applyRemoteSync(d);
      }
    }
  }

  public equipWeapon(weaponId: string | null): boolean {
    if (this.activeWeapon?.stats.id === weaponId) {
      return true;
    }
    this.cancelBowCharge();
    if (this.activeWeapon) {
      this.activeWeapon.onUnequip();
      this.activeWeapon = null;
    }
    if (!weaponId) {
      return true;
    }

    const next = this.weaponRegistry.getOrCreate(weaponId);
    if (!next) return false;

    this.activeWeapon = next;
    if (this.weaponMount) {
      next.onEquip(this.weaponMount);
    }
    return true;
  }

  public getEquippedWeapon(): Weapon | null {
    return this.activeWeapon;
  }

  public getEquippedWeaponStats(): WeaponStats | null {
    return this.activeWeapon ? this.activeWeapon.stats : null;
  }

  public isRangedWeaponEquipped(): boolean {
    return Boolean(this.activeWeapon?.stats.isRanged);
  }

  public isChargingBow(): boolean {
    return this.bowCharging;
  }

  public getBowChargeProgress(): number {
    if (!this.bowCharging) return 0;
    return Math.max(
      0,
      Math.min(1, this.bowChargeElapsed / Math.max(0.05, this.bowChargeDuration)),
    );
  }

  public isBowMaxCharged(): boolean {
    return this.bowCharging && this.getBowChargeProgress() >= 0.995;
  }

  public beginBowCharge(): boolean {
    if (!this.canPlayerAttack()) return false;
    if (!this.activeWeapon || !this.activeWeapon.stats.isRanged) return false;
    const cfg =
      this.activeWeapon instanceof BowWeapon
        ? this.activeWeapon.getChargeConfig()
        : null;
    this.bowChargeMinTime = cfg?.minChargeTime ?? 0.2;
    this.bowChargeDuration =
      cfg?.chargeDuration ?? this.activeWeapon.stats.chargeDuration ?? 2.0;
    this.bowChargeElapsed = 0;
    this.bowCharging = true;
    this.setBowDrawVisual(true, 0);
    return true;
  }

  public updateBowCharge(dt: number): void {
    if (!this.bowCharging) return;
    if (!this.activeWeapon?.stats.isRanged || !this.playerHealth.isAlive()) {
      this.cancelBowCharge();
      return;
    }
    this.bowChargeElapsed = Math.min(
      this.bowChargeDuration,
      this.bowChargeElapsed + Math.max(0, dt),
    );
    this.setBowDrawVisual(true, this.getBowChargeProgress());
  }

  public setBowDrawVisual(active: boolean, charge: number): void {
    if (this.activeWeapon instanceof BowWeapon) {
      this.activeWeapon.setDrawState(active, charge);
    }
  }

  public getBowNockWorldPosition(out: THREE.Vector3): boolean {
    if (this.activeWeapon instanceof BowWeapon) {
      return this.activeWeapon.getNockWorldPosition(out);
    }
    return false;
  }

  public getEquippedBowWeapon(): BowWeapon | null {
    return this.activeWeapon instanceof BowWeapon ? this.activeWeapon : null;
  }

  public updateBowTrajectoryPreview(
    launchOrigin: THREE.Vector3,
    initialVel: THREE.Vector3,
    gravity: number,
    chargeFactor: number,
    queryCollidersNear: ((x: number, z: number) => WorldCollider[]) | undefined,
    visible: boolean,
  ): void {
    if (this.activeWeapon instanceof BowWeapon) {
      this.activeWeapon.updateTrajectoryPreview(
        this.scene,
        launchOrigin,
        initialVel,
        gravity,
        chargeFactor,
        queryCollidersNear,
        visible,
      );
    }
  }

  public hideBowTrajectoryPreview(): void {
    if (this.activeWeapon instanceof BowWeapon) {
      this.activeWeapon.hideTrajectoryPreview();
    }
  }

  public releaseBowCharge(
    origin: THREE.Vector3,
    yaw: number,
    launchOrigin?: THREE.Vector3,
    aimTargetPoint?: THREE.Vector3,
  ): {
    fired: boolean;
    cancelledTooShort: boolean;
    chargeFactor: number;
    staminaCost: number;
  } {
    if (!this.bowCharging || !this.activeWeapon?.stats.isRanged) {
      this.cancelBowCharge();
      return {
        fired: false,
        cancelledTooShort: false,
        chargeFactor: 0,
        staminaCost: 0,
      };
    }

    if (this.bowChargeElapsed < this.bowChargeMinTime) {
      this.cancelBowCharge();
      return {
        fired: false,
        cancelledTooShort: true,
        chargeFactor: 0,
        staminaCost: 0,
      };
    }

    const chargeFactor = this.getBowChargeProgress();
    const staminaCost = this.activeWeapon.stats.staminaCost ?? 4;
    this.bowCharging = false;
    this.bowChargeElapsed = 0;
    this.pendingBowChargeFactor = chargeFactor;
    this.hasPendingBowOrigin = Boolean(launchOrigin);
    if (launchOrigin) {
      this.pendingBowLaunchOrigin.copy(launchOrigin);
    }
    this.hasPendingAimTarget = Boolean(aimTargetPoint);
    if (aimTargetPoint) {
      this.pendingAimTargetPoint.copy(aimTargetPoint);
    }

    this.setBowDrawVisual(false, 0);
    this.hideBowTrajectoryPreview();

    if (!this.canPlayerAttack()) {
      return {
        fired: false,
        cancelledTooShort: false,
        chargeFactor,
        staminaCost,
      };
    }

    const weapon = this.activeWeapon;
    this.attackCooldownTimer = weapon.stats.cooldown;
    this.lastAttackTotalCooldown = weapon.stats.cooldown;
    this.pendingHitTimer = -1;

    const atkCtx = this.setWeaponAttackContext(origin, yaw);
    atkCtx.bowChargeFactor = this.pendingBowChargeFactor;
    atkCtx.bowLaunchOrigin = this.hasPendingBowOrigin
      ? this.pendingBowLaunchOrigin
      : undefined;
    atkCtx.aimTargetPoint = this.hasPendingAimTarget
      ? this.pendingAimTargetPoint
      : undefined;
    weapon.executeHit(atkCtx);
    return {
      fired: true,
      cancelledTooShort: false,
      chargeFactor,
      staminaCost,
    };
  }

  public cancelBowCharge(): boolean {
    const wasCharging = this.bowCharging;
    this.bowCharging = false;
    this.bowChargeElapsed = 0;
    this.hasPendingBowOrigin = false;
    this.hasPendingAimTarget = false;
    this.setBowDrawVisual(false, 0);
    this.hideBowTrajectoryPreview();
    return wasCharging;
  }

  public getAttackAnimationSpec(): {
    type: WeaponAttackAnimType;
    duration: number;
  } {
    if (!this.activeWeapon) {
      return { type: 'unarmed_punch', duration: 0.24 };
    }
    return {
      type: this.activeWeapon.stats.attackAnim,
      duration: this.activeWeapon.stats.swingDuration,
    };
  }

  public getAttackCooldownRatio(): number {
    if (this.lastAttackTotalCooldown <= 0) return 0;
    return Math.max(
      0,
      Math.min(1, this.attackCooldownTimer / this.lastAttackTotalCooldown),
    );
  }

  public canPlayerAttack(): boolean {
    return this.attackCooldownTimer <= 0 && this.playerHealth.isAlive();
  }

  public triggerPlayerAttack(origin: THREE.Vector3, yaw: number): boolean {
    if (!this.canPlayerAttack()) return false;

    const weapon = this.activeWeapon;
    const cooldown = weapon ? weapon.stats.cooldown : UNARMED_COOLDOWN;
    const hitDelay = weapon ? weapon.stats.hitDelay : UNARMED_HIT_DELAY;

    this.attackCooldownTimer = cooldown;
    this.lastAttackTotalCooldown = cooldown;
    this.pendingHitTimer = hitDelay;
    this.pendingAttackWeapon = weapon;
    this.pendingAttackOrigin.copy(origin);
    this.pendingAttackYaw = yaw;
    this.pendingAttackId = `atk_${++this.nextAttackSeq}_${Date.now().toString(36)}`;

    // Show sweeping melee slash arc only for melee weapons
    if (weapon && !weapon.stats.isRanged) {
      this.slashTimer = 0.22;
      this.slashMesh.visible = true;
      this.slashMesh.position.set(origin.x, origin.y + 1.02, origin.z);
      this.slashMesh.rotation.set(0, yaw - Math.PI * 0.5, 0);
      this.slashMesh.scale.setScalar(weapon.stats.range / 2.6);
      this.slashMat.opacity = 0.62;
    }

    return true;
  }

  public syncPlayerStats(currentHealth: number, maxHealth: number): void {
    this.playerHealth.setMaxHealth(maxHealth, false);
    this.playerHealth.syncHealth(currentHealth);
  }

  public resetPlayerAndAggro(): void {
    this.cancelBowCharge();
    this.playerHealth.revive(1);
    this.attackCooldownTimer = 0;
    this.pendingHitTimer = -1;
    this.recentTarget = null;
    for (let i = 0; i < this.enemies.length; i++) {
      this.enemies[i].clearAggro();
    }
  }

  public exportDefeatedEnemyIds(): string[] {
    return this.enemies
      .filter((e) => e.state === 'dead')
      .map((e) => e.id);
  }

  public restoreDefeatedEnemies(defeatedIds: string[]): void {
    const set = new Set(defeatedIds);
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      if (set.has(enemy.id)) {
        enemy.setDefeatedSilent();
      }
    }
  }

  public getHudTarget(): CombatEnemyHudTarget | null {
    if (!this.recentTarget || this.recentTargetTimer <= 0) return null;
    if (this.recentTarget.health.isDead()) return null;
    return {
      id: this.recentTarget.id,
      name: this.recentTarget.name,
      nameAr: this.recentTarget.nameAr,
      health: this.recentTarget.health.getCurrentHealth(),
      maxHealth: this.recentTarget.health.getMaxHealth(),
    };
  }

  private spawnEnemies(
    seed: number,
    isSoftwareGl: boolean,
    isVillageClearance: (x: number, z: number) => boolean,
  ): void {
    const rng = seededRandom(seed + 7717);

    const pickSpawn = (
      biomes: string[],
      minRadius: number,
      maxRadius: number,
    ): { x: number; z: number } => {
      for (let attempt = 0; attempt < 48; attempt++) {
        const r = minRadius + rng() * (maxRadius - minRadius);
        const angle = rng() * Math.PI * 2;
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        if (x * x + z * z > (PLAYABLE_RADIUS - 24) * (PLAYABLE_RADIUS - 24)) continue;
        if (isVillageClearance(x, z)) continue;
        if (Math.hypot(x, z - 4) < 30) continue;

        const biome = getBiomeAt(x, z);
        if (biomes.length > 0 && !biomes.includes(biome)) continue;

        const h = groundHeightAt(x, z);
        if (h < WATER_LEVEL + 0.65) continue;
        if (groundSlopeAt(x, z, h) > 0.3) continue;
        return { x, z };
      }

      const fallbackAngle = rng() * Math.PI * 2;
      const fallbackR = 38 + rng() * 50;
      return {
        x: Math.cos(fallbackAngle) * fallbackR,
        z: Math.sin(fallbackAngle) * fallbackR,
      };
    };

    const placements: Array<{ archetypeId: EnemyArchetypeId; x: number; z: number }> = [];

    for (let i = 0; i < 2; i++) {
      const spot = pickSpawn(['Plains', 'Forest'], 34, 58);
      placements.push({ archetypeId: 'bandit_scout', x: spot.x, z: spot.z });
    }
    for (let i = 0; i < 10; i++) {
      const spot = pickSpawn(['Plains', 'Forest'], 62, 240);
      placements.push({ archetypeId: 'bandit_scout', x: spot.x, z: spot.z });
    }
    for (let i = 0; i < 8; i++) {
      const spot = pickSpawn(['Forest'], 52, 260);
      placements.push({ archetypeId: 'thorn_stalker', x: spot.x, z: spot.z });
    }
    for (let i = 0; i < 6; i++) {
      const spot = pickSpawn(['Mountains', 'Desert'], 95, 320);
      placements.push({ archetypeId: 'stone_sentinel', x: spot.x, z: spot.z });
    }

    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      const enemy = new EnemyController(
        {
          id: `enemy-${p.archetypeId}-${i}`,
          archetypeId: p.archetypeId,
          x: p.x,
          z: p.z,
          seed: seed + i * 53 + 811,
          onDefeated: (defeated) => {
            this.options.onEnemyDefeated?.(defeated);
          },
        },
        this.assets,
        this.scene,
        isSoftwareGl,
      );
      enemy.setNetworkRemoteControlled(this.networkRemoteControlled);
      this.enemies.push(enemy);
    }
  }

  private setWeaponAttackContext(
    origin: THREE.Vector3,
    yaw: number,
  ): WeaponAttackContext {
    this.weaponAttackCtx.origin = origin;
    this.weaponAttackCtx.yaw = yaw;
    return this.weaponAttackCtx;
  }

  private executeUnarmedPunch(ctx: WeaponAttackContext): void {
    this.damageSystem.detectMeleeArcHits(
      ctx.origin,
      ctx.yaw,
      UNARMED_RANGE,
      Math.PI * 0.65,
      this.enemies,
      _unarmedScratch,
    );

    for (let i = 0; i < _unarmedScratch.length; i++) {
      const enemy = _unarmedScratch[i];
      if (ctx.multiplayerAuthoritative) {
        const hx = enemy.position.x;
        const hy = enemy.position.y + enemy.hitHeight * 0.55;
        const hz = enemy.position.z;
        this.spawnHitSparks(hx, hy, hz, 4);
        ctx.onMultiplayerMeleeHit?.({
          attackId: ctx.attackId,
          targetKind: 'enemy',
          targetId: enemy.id,
          archetype: enemy.archetype.id,
          weaponId: 'unarmed',
          x: hx,
          y: hy,
          z: hz,
          isCrit: false,
        });
        continue;
      }

      const packet = this.damageSystem.createPacket({
        amount: UNARMED_DAMAGE,
        damageType: 'physical',
        sourceId: 'player:unarmed',
        sourcePosition: ctx.origin,
        knockback: UNARMED_KNOCKBACK,
        isCrit: false,
      });
      const result = this.damageSystem.applyDamage(enemy, packet);
      if (result.applied) {
        this.spawnHitSparks(
          enemy.position.x,
          enemy.position.y + enemy.hitHeight * 0.55,
          enemy.position.z,
          4,
        );
        this.recentTarget = enemy;
        this.recentTargetTimer = 5.5;
        this.options.onEnemyHit?.(enemy, result);
      }
    }

    if (ctx.wildlife) {
      _animalFwdDir.set(Math.sin(ctx.yaw), 0, Math.cos(ctx.yaw));
      const animals = ctx.wildlife.findAnimalsInStrikeArc(
        ctx.origin,
        _animalFwdDir,
        UNARMED_RANGE,
        Math.cos(Math.PI * 0.65 * 0.5),
      );
      for (let i = 0; i < animals.length; i++) {
        const { animal } = animals[i];
        if (ctx.multiplayerAuthoritative) {
          const hx = animal.position.x;
          const hy = animal.position.y + 0.55;
          const hz = animal.position.z;
          this.spawnHitSparks(hx, hy, hz, 3);
          ctx.onMultiplayerMeleeHit?.({
            attackId: ctx.attackId,
            targetKind: 'animal',
            targetId: animal.id,
            archetype: animal.species,
            weaponId: 'unarmed',
            x: hx,
            y: hy,
            z: hz,
            isCrit: false,
          });
          continue;
        }

        const res = ctx.wildlife.damageAnimal(
          animal.id,
          UNARMED_DAMAGE,
          ctx.origin.x,
          ctx.origin.z,
        );
        if (res.hit) {
          this.spawnHitSparks(
            animal.position.x,
            animal.position.y + 0.55,
            animal.position.z,
            3,
          );
        }
      }
    }

    if (ctx.multiplayerAuthoritative && ctx.npcStrikeTest) {
      _animalFwdDir.set(Math.sin(ctx.yaw), 0, Math.cos(ctx.yaw));
      const npcs = ctx.npcStrikeTest(
        ctx.origin,
        _animalFwdDir,
        UNARMED_RANGE,
        Math.cos(Math.PI * 0.65 * 0.5),
      );
      for (let i = 0; i < npcs.length; i++) {
        const npc = npcs[i];
        const hx = npc.position.x;
        const hy = npc.position.y + npc.hitHeight * 0.55;
        const hz = npc.position.z;
        this.spawnHitSparks(hx, hy, hz, 3);
        ctx.onMultiplayerMeleeHit?.({
          attackId: ctx.attackId,
          targetKind: 'npc',
          targetId: npc.id,
          archetype: npc.role,
          weaponId: 'unarmed',
          x: hx,
          y: hy,
          z: hz,
          isCrit: false,
        });
      }
    }
  }

  public applyGraphicsProfile(profile: ResolvedGraphicsProfile): void {
    this.sparkScale = profile.particleScale;
    this.enemyUpdateCtx.drawDistSq = profile.enemyDrawDist * profile.enemyDrawDist;
    this.enemyUpdateCtx.midDistSq = profile.enemyMidDist * profile.enemyMidDist;
    this.enemyUpdateCtx.shadowDistSq =
      profile.entityShadowDist * profile.entityShadowDist;
    this.enemyUpdateCtx.shadowsEnabled = profile.shadowEnabled;
  }

  public spawnHitSparks(x: number, y: number, z: number, count: number): void {
    const targetCount = Math.max(1, Math.round(count * this.sparkScale));
    let spawned = 0;
    for (let i = 0; i < this.sparkPool.length; i++) {
      const s = this.sparkPool[i];
      if (s.life <= 0) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2.4 + Math.random() * 3.2;
        s.pos.set(x, y, z);
        s.scale = 0.8 + Math.random() * 0.7;
        s.vel.set(
          Math.cos(angle) * speed,
          1.4 + Math.random() * 2.2,
          Math.sin(angle) * speed,
        );
        s.maxLife = 0.22 + Math.random() * 0.14;
        s.life = s.maxLife;
        spawned++;
        if (spawned >= targetCount) break;
      }
    }
    if (spawned > 0) {
      this.syncSparkInstances();
    }
  }

  private syncSparkInstances(): void {
    let activeCount = 0;
    for (let i = 0; i < this.sparkPool.length; i++) {
      const s = this.sparkPool[i];
      if (s.life > 0) {
        _sparkDummy.position.copy(s.pos);
        _sparkDummy.scale.setScalar(s.scale);
        _sparkDummy.updateMatrix();
        this.sparkMesh.setMatrixAt(activeCount, _sparkDummy.matrix);
        activeCount++;
      }
    }
    this.sparkMesh.count = activeCount;
    this.sparkMesh.visible = activeCount > 0;
    if (activeCount > 0) {
      this.sparkMesh.instanceMatrix.needsUpdate = true;
    }
  }

  public update(
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    camera: THREE.Camera | null,
    queryCollidersNear: (x: number, z: number) => WorldCollider[],
    isVillageClearance: (x: number, z: number) => boolean,
  ): void {
    if (dt <= 0) return;

    this.playerHealth.update(dt);

    if (this.attackCooldownTimer > 0) {
      this.attackCooldownTimer = Math.max(0, this.attackCooldownTimer - dt);
    }

    if (this.recentTargetTimer > 0) {
      this.recentTargetTimer = Math.max(0, this.recentTargetTimer - dt);
      if (this.recentTargetTimer <= 0 || this.recentTarget?.health.isDead()) {
        this.recentTarget = null;
      }
    }

    if (this.pendingHitTimer >= 0) {
      this.pendingHitTimer -= dt;
      if (this.pendingHitTimer <= 0) {
        this.pendingHitTimer = -1;
        this.pendingAttackOrigin.copy(playerPos);
        const atkCtx = this.setWeaponAttackContext(
          this.pendingAttackOrigin,
          this.pendingAttackYaw,
        );
        atkCtx.attackId = this.pendingAttackId;
        atkCtx.bowChargeFactor = this.pendingBowChargeFactor;
        if (this.pendingAttackWeapon) {
          this.pendingAttackWeapon.executeHit(atkCtx);
        } else {
          this.executeUnarmedPunch(atkCtx);
        }
      }
    }

    // Update all instantiated weapons (e.g., Bow arrows still in flight after weapon switch)
    const tickWeaponCtx = this.setWeaponAttackContext(playerPos, this.pendingAttackYaw);
    tickWeaponCtx.queryCollidersNear = queryCollidersNear;
    const instantiated = this.weaponRegistry.getInstantiatedWeapons();
    for (let i = 0; i < instantiated.length; i++) {
      instantiated[i].update(dt, tickWeaponCtx);
    }

    // Update slash arc fade
    if (this.slashTimer > 0) {
      this.slashTimer = Math.max(0, this.slashTimer - dt);
      const t = this.slashTimer / 0.22;
      this.slashMat.opacity = 0.62 * t;
      this.slashMesh.rotation.y += dt * 4.5;
      if (this.slashTimer <= 0) {
        this.slashMesh.visible = false;
      }
    }

    // Update hit spark particles in single InstancedMesh
    let anySparkUpdated = false;
    for (let i = 0; i < this.sparkPool.length; i++) {
      const s = this.sparkPool[i];
      if (s.life > 0) {
        anySparkUpdated = true;
        s.life -= dt;
        if (s.life > 0) {
          s.vel.y -= 9.8 * dt;
          s.pos.addScaledVector(s.vel, dt);
          s.scale = 0.3 + (s.life / s.maxLife) * 0.9;
        }
      }
    }
    if (anySparkUpdated) {
      this.syncSparkInstances();
    }

    // Update enemies with cached context (zero per-frame allocations)
    const enemyCtx = this.enemyUpdateCtx;
    enemyCtx.dt = dt;
    enemyCtx.elapsed = elapsed;
    enemyCtx.camera = camera;
    enemyCtx.queryCollidersNear = queryCollidersNear;
    enemyCtx.isVillageClearance = isVillageClearance;

    for (let i = 0; i < this.enemies.length; i++) {
      this.enemies[i].update(enemyCtx);
    }
  }

  public dispose(): void {
    this.weaponRegistry.disposeAll();
    for (let i = 0; i < this.enemies.length; i++) {
      this.enemies[i].dispose();
    }
    this.enemies.length = 0;
    this.slashGeo.dispose();
    this.slashMat.dispose();
    this.slashMesh.removeFromParent();
    this.sparkGeo.dispose();
    this.sparkMat.dispose();
    this.sparkMesh.dispose();
    this.sparkMesh.removeFromParent();
    this.assets.dispose();
  }
}
