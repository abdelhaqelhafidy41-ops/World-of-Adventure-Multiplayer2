import * as THREE from 'three';
import type {
  PlayerMovementState,
  UnifiedPlayerInput,
  WorldCollider,
} from '../types';
import {
  PLAYABLE_RADIUS,
  WATER_LEVEL,
  groundHeightAt,
  groundSlopeAt,
} from '../math/noise';
import type { PlayerCharacter } from '../entities/PlayerCharacter';
import type { ThirdPersonCamera } from './ThirdPersonCamera';
import type { WeaponAttackAnimType } from '../combat/weapons/Weapon';
import type { DifficultyLevel, WorldType } from '../save/saveTypes';
import {
  getBaseMaxStaminaForMode,
  isInfiniteStaminaMode,
} from './staminaConfig';

export interface PlayerControllerConfig {
  radius: number;
  height: number;
  walkSpeed: number;
  runSpeed: number;
  waterWalkSpeed: number;
  waterRunSpeed: number;
  groundAcceleration: number;
  /** Lower values increase coasting/drag duration when releasing movement keys */
  groundDeceleration: number;
  airAcceleration: number;
  airDrag: number;
  waterDrag: number;
  rotationSpeed: number;
  jumpImpulse: number;
  gravity: number;
  coyoteTime: number;
  jumpBufferTime: number;
  maxHealth: number;
  maxStamina: number;
  sprintDrainPerSec: number;
  staminaRegenPerSec: number;
  staminaRegenDelay: number;
  sprintResumeThreshold: number;
  jumpStaminaCost: number;
}

export const DEFAULT_PLAYER_CONFIG: PlayerControllerConfig = {
  radius: 0.45,
  height: 1.85,
  walkSpeed: 6.2,
  runSpeed: 10.8,
  waterWalkSpeed: 4.8,
  waterRunSpeed: 7.4,
  groundAcceleration: 11.5,
  // Increased drag duration (lower damping rate = longer smooth deceleration glide)
  groundDeceleration: 4.2,
  airAcceleration: 5.5,
  airDrag: 1.35,
  waterDrag: 2.6,
  rotationSpeed: 12.5,
  jumpImpulse: 9.9,
  gravity: 24.5,
  coyoteTime: 0.13,
  jumpBufferTime: 0.13,
  maxHealth: 100,
  maxStamina: 100,
  sprintDrainPerSec: 21,
  staminaRegenPerSec: 18,
  staminaRegenDelay: 0.65,
  sprintResumeThreshold: 15,
  jumpStaminaCost: 6,
};

export interface PlayerControllerCallbacks {
  queryCollidersNear: (x: number, z: number) => WorldCollider[];
  canAttack?: () => boolean;
  isRangedWeaponEquipped?: () => boolean;
  isBowAiming?: () => boolean;
  getAttackAnimation?: () => { type: WeaponAttackAnimType; duration: number };
  onJump?: (pos: THREE.Vector3) => void;
  onLand?: (pos: THREE.Vector3, strength: number, inWater: boolean) => void;
  onFootstep?: (
    mode: 'walking' | 'running' | 'sprinting' | 'crouching',
  ) => void;
  onAttack?: (pos: THREE.Vector3, yaw: number) => void;
  onInteractRequested?: () => void;
}

// Zero-GC pre-allocated math vectors
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _desiredVel = new THREE.Vector3();

/**
 * Modular third-person character controller handling movement acceleration/deceleration,
 * smooth rotation, sprint & stamina, jumping, gravity, ground/falling detection,
 * object & terrain collisions, and locomotion state transitions.
 */
export class PlayerController {
  public readonly config: PlayerControllerConfig;
  private readonly baseConfig: PlayerControllerConfig;
  public readonly position = new THREE.Vector3(0, 0, 0);
  public readonly velocity = new THREE.Vector3(0, 0, 0);

  private readonly character: PlayerCharacter;
  private readonly cameraRig: ThirdPersonCamera;
  private readonly callbacks: PlayerControllerCallbacks;

  private yaw = Math.PI;
  private grounded = true;
  private inWater = false;
  private sprinting = false;
  private sprintExhausted = false;
  private movementState: PlayerMovementState = 'idle';

  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private fallStartY = 0;
  private isFalling = false;
  private lastStepSign = 1;

  private health: number;
  private stamina: number;
  private staminaRegenDelayTimer = 0;
  private healthRegenDelayTimer = 0;
  private difficulty: DifficultyLevel = 'normal';
  private worldType: WorldType = 'normal';
  private lastEquipmentBonuses = {
    maxHealthBonus: 0,
    maxStaminaBonus: 0,
    speedBonus: 0,
  };

  constructor(
    character: PlayerCharacter,
    cameraRig: ThirdPersonCamera,
    callbacks: PlayerControllerCallbacks,
    config: Partial<PlayerControllerConfig> = {},
  ) {
    this.character = character;
    this.cameraRig = cameraRig;
    this.callbacks = callbacks;
    this.baseConfig = { ...DEFAULT_PLAYER_CONFIG, ...config };
    this.baseConfig.maxStamina = getBaseMaxStaminaForMode(this.worldType);
    this.config = { ...this.baseConfig };
    this.health = this.config.maxHealth;
    this.stamina = this.config.maxStamina;
  }

  public setGameplayModifiers(
    difficulty: DifficultyLevel,
    worldType: WorldType,
  ): void {
    this.difficulty = difficulty;
    this.worldType = worldType;
    const modeMaxStamina = getBaseMaxStaminaForMode(worldType);
    this.baseConfig.maxStamina = modeMaxStamina;

    if (isInfiniteStaminaMode(worldType)) {
      this.config.maxStamina = Infinity;
      this.health = this.config.maxHealth;
      this.stamina = Infinity;
      this.sprintExhausted = false;
      this.staminaRegenDelayTimer = 0;
    } else {
      this.config.maxStamina =
        modeMaxStamina + this.lastEquipmentBonuses.maxStaminaBonus;
      if (!Number.isFinite(this.stamina)) {
        this.stamina = this.config.maxStamina;
      } else {
        this.stamina = Math.max(0, Math.min(this.config.maxStamina, this.stamina));
      }
    }
  }

  public getIncomingDamageMultiplier(): number {
    if (this.worldType === 'creative') return 0;
    const diffMult =
      this.difficulty === 'easy'
        ? 0.65
        : this.difficulty === 'hard'
          ? 1.45
          : 1.0;
    const worldMult = this.worldType === 'survival' ? 1.2 : 1.0;
    return diffMult * worldMult;
  }

  public getStaminaDrainMultiplier(): number {
    if (this.worldType === 'creative') return 0;
    const diffMult =
      this.difficulty === 'easy'
        ? 0.75
        : this.difficulty === 'hard'
          ? 1.2
          : 1.0;
    const worldMult = this.worldType === 'survival' ? 1.2 : 1.0;
    return diffMult * worldMult;
  }

  public reset(x = 0, z = 4): void {
    const startY = groundHeightAt(x, z);
    this.position.set(x, startY, z);
    this.velocity.set(0, 0, 0);
    this.yaw = Math.PI;
    this.grounded = true;
    this.inWater = startY < WATER_LEVEL - 0.15;
    this.sprinting = false;
    this.sprintExhausted = false;
    this.movementState = 'idle';
    this.coyoteTimer = this.config.coyoteTime;
    this.jumpBufferTimer = 0;
    this.fallStartY = startY;
    this.isFalling = false;

    this.health = this.config.maxHealth;
    this.stamina = isInfiniteStaminaMode(this.worldType)
      ? Infinity
      : this.config.maxStamina;
    this.staminaRegenDelayTimer = 0;
    this.healthRegenDelayTimer = 0;

    this.character.root.position.copy(this.position);
    this.character.root.rotation.y = this.yaw;
    this.cameraRig.reset(this.position, 0, 0.26);
  }

  public getYaw(): number {
    return this.yaw;
  }

  public getCameraRotation(): { cameraYaw: number; cameraPitch: number } {
    return {
      cameraYaw: this.cameraRig.getYaw(),
      cameraPitch: this.cameraRig.getPitch(),
    };
  }

  public setPoseAndVitals(state: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    cameraYaw: number;
    cameraPitch: number;
    health: number;
    stamina: number;
  }): void {
    const safeTerrainY = groundHeightAt(state.x, state.z);
    const y = Number.isFinite(state.y)
      ? Math.max(safeTerrainY, state.y)
      : safeTerrainY;

    this.position.set(state.x, y, state.z);
    this.resolveWorldBounds();
    this.velocity.set(0, 0, 0);
    this.yaw = Number.isFinite(state.yaw) ? state.yaw : Math.PI;
    this.grounded = Math.abs(this.position.y - safeTerrainY) < 0.25;
    this.inWater = this.position.y < WATER_LEVEL - 0.15;
    this.sprinting = false;
    this.sprintExhausted = false;
    this.movementState = 'idle';
    this.coyoteTimer = this.grounded ? this.config.coyoteTime : 0;
    this.jumpBufferTimer = 0;
    this.fallStartY = this.position.y;
    this.isFalling = false;
    this.staminaRegenDelayTimer = 0;
    this.healthRegenDelayTimer = 0;

    this.health = Math.max(1, Math.min(this.config.maxHealth, state.health));
    if (isInfiniteStaminaMode(this.worldType)) {
      this.stamina = Infinity;
      this.sprintExhausted = false;
    } else {
      const targetStamina = Number.isFinite(state.stamina)
        ? state.stamina
        : this.config.maxStamina;
      this.stamina = Math.max(0, Math.min(this.config.maxStamina, targetStamina));
    }

    this.character.root.position.copy(this.position);
    this.character.root.rotation.y = this.yaw;
    this.cameraRig.setYawPitch(
      this.position,
      state.cameraYaw,
      state.cameraPitch,
    );
  }

  public getHealth(): number {
    return Math.round(this.health);
  }

  public getMaxHealth(): number {
    return this.config.maxHealth;
  }

  public getStamina(): number {
    if (isInfiniteStaminaMode(this.worldType) || !Number.isFinite(this.stamina)) {
      return Infinity;
    }
    return Math.round(this.stamina);
  }

  public getMaxStamina(): number {
    return this.config.maxStamina;
  }

  public isGrounded(): boolean {
    return this.grounded;
  }

  public isInWater(): boolean {
    return this.inWater;
  }

  public isSprinting(): boolean {
    return this.sprinting;
  }

  public getMovementState(): PlayerMovementState {
    return this.movementState;
  }

  public getHorizontalSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  public heal(amount: number): void {
    this.health = Math.min(this.config.maxHealth, this.health + amount);
  }

  public syncAuthoritativeHealth(health: number): void {
    this.health = Math.max(0, Math.min(this.config.maxHealth, health));
  }

  public applyAuthoritativePositionCorrection(
    x: number,
    y: number,
    z: number,
    snapThreshold = 5,
  ): void {
    const safeTerrainY = groundHeightAt(x, z);
    const targetY = Number.isFinite(y) ? Math.max(safeTerrainY, y) : safeTerrainY;
    const dist = Math.hypot(x - this.position.x, z - this.position.z);
    if (dist > snapThreshold) {
      this.position.set(x, targetY, z);
      this.velocity.set(0, 0, 0);
    } else {
      this.position.x = THREE.MathUtils.lerp(this.position.x, x, 0.65);
      this.position.y = THREE.MathUtils.lerp(this.position.y, targetY, 0.65);
      this.position.z = THREE.MathUtils.lerp(this.position.z, z, 0.65);
      this.velocity.multiplyScalar(0.35);
    }
    this.resolveWorldBounds();
    this.character.root.position.copy(this.position);
  }

  public applyCombatDamage(
    amount: number,
    knockbackX = 0,
    knockbackZ = 0,
    shakeStrength = 0.18,
  ): void {
    const scaledAmount = amount * this.getIncomingDamageMultiplier();
    if (scaledAmount <= 0) return;
    this.health = Math.max(0, this.health - scaledAmount);
    this.healthRegenDelayTimer = 4.0;
    this.velocity.x += knockbackX;
    this.velocity.z += knockbackZ;
    if (shakeStrength > 0) {
      this.cameraRig.triggerShake(shakeStrength);
    }
  }

  public restoreStamina(amount: number): void {
    if (isInfiniteStaminaMode(this.worldType)) {
      this.stamina = Infinity;
      this.sprintExhausted = false;
      return;
    }
    this.stamina = Math.min(this.config.maxStamina, this.stamina + amount);
    this.sprintExhausted = false;
  }

  public hasStaminaFor(cost: number): boolean {
    if (
      isInfiniteStaminaMode(this.worldType) ||
      !Number.isFinite(this.stamina) ||
      cost <= 0
    ) {
      return true;
    }
    const scaled = cost * this.getStaminaDrainMultiplier();
    return this.stamina >= Math.min(scaled, this.config.maxStamina) && this.stamina >= 1;
  }

  public consumeStamina(cost: number, regenDelay = 0.5): boolean {
    if (isInfiniteStaminaMode(this.worldType)) {
      this.stamina = Infinity;
      this.sprintExhausted = false;
      this.staminaRegenDelayTimer = 0;
      return true;
    }
    if (cost <= 0) return true;
    const scaled = cost * this.getStaminaDrainMultiplier();
    if (scaled <= 0) return true;
    if (this.stamina < 1) return false;
    this.stamina = Math.max(0, this.stamina - scaled);
    this.staminaRegenDelayTimer = Math.max(this.staminaRegenDelayTimer, regenDelay);
    return true;
  }

  public applyEquipmentBonuses(bonuses: {
    maxHealthBonus: number;
    maxStaminaBonus: number;
    speedBonus: number;
  }): void {
    this.lastEquipmentBonuses = { ...bonuses };
    this.config.maxHealth = this.baseConfig.maxHealth + bonuses.maxHealthBonus;
    this.config.walkSpeed = this.baseConfig.walkSpeed + bonuses.speedBonus;
    this.config.runSpeed = this.baseConfig.runSpeed + bonuses.speedBonus;
    this.health = Math.min(this.config.maxHealth, this.health);

    if (isInfiniteStaminaMode(this.worldType)) {
      this.config.maxStamina = Infinity;
      this.stamina = Infinity;
      this.sprintExhausted = false;
    } else {
      this.config.maxStamina =
        this.baseConfig.maxStamina + bonuses.maxStaminaBonus;
      if (!Number.isFinite(this.stamina)) {
        this.stamina = this.config.maxStamina;
      } else {
        this.stamina = Math.min(this.config.maxStamina, this.stamina);
      }
    }
  }

  public updateIdleOnly(dt: number): void {
    const groundY = groundHeightAt(this.position.x, this.position.z);
    this.movementState = this.grounded ? 'idle' : this.velocity.y < -1.2 ? 'falling' : 'jumping';
    this.character.updateAnimation(
      dt,
      0,
      this.grounded,
      this.velocity.y,
      this.movementState,
      groundY,
      this.inWater,
      this.config.runSpeed,
    );
  }

  public update(dt: number, input: UnifiedPlayerInput): void {
    // 1. Apply look deltas to third-person camera
    this.cameraRig.addLookInput(input.lookX, input.lookY);

    // 2. Attack & Interaction triggers (ranged bow uses hold-to-charge in GameEngine)
    const isRanged = this.callbacks.isRangedWeaponEquipped?.() ?? false;
    const attackAllowed = this.callbacks.canAttack ? this.callbacks.canAttack() : true;
    const animSpec = this.callbacks.getAttackAnimation?.();
    if (
      !isRanged &&
      input.attack &&
      attackAllowed &&
      this.character.triggerAttack(animSpec?.duration ?? 0.28, animSpec?.type ?? 'melee_slash')
    ) {
      this.callbacks.onAttack?.(this.position, this.yaw);
    }

    // 3. Jump buffering & coyote window
    if (input.jump) {
      this.jumpBufferTimer = this.config.jumpBufferTime;
    } else if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    }

    if (this.grounded) {
      this.coyoteTimer = this.config.coyoteTime;
    } else if (this.coyoteTimer > 0) {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    // 4. Camera-relative desired movement vector (supports keyboard & analog stick)
    const camYaw = this.cameraRig.getYaw();
    _forward.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    _right.set(Math.cos(camYaw), 0, -Math.sin(camYaw));

    _moveDir
      .set(0, 0, 0)
      .addScaledVector(_forward, input.moveY)
      .addScaledVector(_right, input.moveX);

    const analogStrength = Math.min(1, _moveDir.length());
    const hasMoveInput = analogStrength > 0.01;
    if (hasMoveInput) {
      _moveDir.normalize();
    }

    // 5. Stamina & Sprint state management (infinite in creative mode, exhaustion hysteresis otherwise)
    const isCreativeStamina = isInfiniteStaminaMode(this.worldType);
    let isSprinting = false;

    if (isCreativeStamina) {
      this.stamina = Infinity;
      this.sprintExhausted = false;
      this.staminaRegenDelayTimer = 0;
      isSprinting = input.sprint && hasMoveInput;
      this.sprinting = isSprinting;
    } else {
      if (this.stamina <= 0.5) {
        this.sprintExhausted = true;
      } else if (
        this.sprintExhausted &&
        this.stamina >= this.config.sprintResumeThreshold
      ) {
        this.sprintExhausted = false;
      }

      const canSprint = !this.sprintExhausted && this.stamina > 0.5;
      isSprinting = input.sprint && hasMoveInput && canSprint;
      this.sprinting = isSprinting;

      if (isSprinting) {
        const drainRate =
          this.config.sprintDrainPerSec * this.getStaminaDrainMultiplier();
        if (drainRate > 0) {
          this.stamina = Math.max(0, this.stamina - drainRate * dt);
          this.staminaRegenDelayTimer = this.config.staminaRegenDelay;
        }
      } else {
        if (this.staminaRegenDelayTimer > 0) {
          this.staminaRegenDelayTimer = Math.max(
            0,
            this.staminaRegenDelayTimer - dt,
          );
        } else {
          this.stamina = Math.min(
            this.config.maxStamina,
            this.stamina + this.config.staminaRegenPerSec * dt,
          );
        }
      }
    }

    // 6. Acceleration, Deceleration (longer drag tail), and Smooth Rotation
    const isAimingBow = this.callbacks.isBowAiming?.() ?? false;
    this.inWater = this.position.y < WATER_LEVEL - 0.15;
    const walkSpd = this.inWater
      ? this.config.waterWalkSpeed
      : this.config.walkSpeed;
    const runSpd = this.inWater ? this.config.waterRunSpeed : this.config.runSpeed;
    const aimSpeedFactor = isAimingBow ? 0.68 : 1.0;
    const targetSpeed = (isSprinting && !isAimingBow ? runSpd : walkSpd * aimSpeedFactor) * analogStrength;

    const isFirstPerson = this.cameraRig.getPerspective() === 'first-person';

    if (hasMoveInput) {
      _desiredVel.copy(_moveDir).multiplyScalar(targetSpeed);
      const accel = this.grounded
        ? this.config.groundAcceleration
        : this.config.airAcceleration;
      this.velocity.x = THREE.MathUtils.damp(
        this.velocity.x,
        _desiredVel.x,
        accel,
        dt,
      );
      this.velocity.z = THREE.MathUtils.damp(
        this.velocity.z,
        _desiredVel.z,
        accel,
        dt,
      );

      if (!isAimingBow && !isFirstPerson) {
        // Smoothly turn character model toward movement direction
        const targetYaw = Math.atan2(_moveDir.x, _moveDir.z);
        const angleDiff = Math.atan2(
          Math.sin(targetYaw - this.yaw),
          Math.cos(targetYaw - this.yaw),
        );
        this.yaw += angleDiff * (1 - Math.exp(-this.config.rotationSpeed * dt));
      }
    } else {
      const drag = this.inWater
        ? this.config.waterDrag
        : this.grounded
          ? this.config.groundDeceleration
          : this.config.airDrag;
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, drag, dt);
      this.velocity.z = THREE.MathUtils.damp(this.velocity.z, 0, drag, dt);

      if (Math.hypot(this.velocity.x, this.velocity.z) < 0.04) {
        this.velocity.x = 0;
        this.velocity.z = 0;
      }
    }

    if (isAimingBow || isFirstPerson) {
      // Smoothly align character toward camera forward direction (-sin(camYaw), -cos(camYaw))
      const aimYaw = camYaw + Math.PI;
      const aimDiff = Math.atan2(
        Math.sin(aimYaw - this.yaw),
        Math.cos(aimYaw - this.yaw),
      );
      this.yaw += aimDiff * (1 - Math.exp(-(isFirstPerson ? 24 : 16) * dt));
    }

    // 7. Jump execution
    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      this.velocity.y = this.config.jumpImpulse;
      this.grounded = false;
      this.isFalling = false;
      this.fallStartY = this.position.y;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      if (!isCreativeStamina) {
        this.stamina = Math.max(0, this.stamina - this.config.jumpStaminaCost);
        this.staminaRegenDelayTimer = Math.max(this.staminaRegenDelayTimer, 0.45);
      }
      this.callbacks.onJump?.(this.position);
    }

    // 8. Gravity & horizontal integration
    this.velocity.y -= this.config.gravity * dt;

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.resolveObjectCollisions();
    this.resolveWorldBounds();

    this.position.y += this.velocity.y * dt;

    // 9. Ground detection, water buoyancy, falling detection & landing impact
    const terrainY = groundHeightAt(this.position.x, this.position.z);
    const solidSupportY = Math.max(terrainY, this.getRockTopSupportY());
    const swimFloorY = WATER_LEVEL - 1.05;
    const inDeepWater = solidSupportY < swimFloorY;
    const supportY = Math.max(solidSupportY, swimFloorY);
    const slope = groundSlopeAt(this.position.x, this.position.z, terrainY);

    if (this.position.y <= supportY + 0.025 && this.velocity.y <= 0) {
      if (!this.grounded) {
        const impactVel = Math.abs(this.velocity.y);
        if (impactVel > 4.5 && !inDeepWater) {
          const strength = THREE.MathUtils.clamp((impactVel - 4) / 10, 0.35, 1.4);
          this.character.triggerLandSquash(strength);
          this.cameraRig.triggerShake(strength * 0.14);
          this.callbacks.onLand?.(this.position, strength, false);
        } else if (inDeepWater && impactVel > 5.0) {
          this.callbacks.onLand?.(this.position, 0.45, true);
        }

        if (impactVel > 16.5 && !inDeepWater) {
          const dmg = Math.round((impactVel - 16.5) * 4.2);
          this.health = Math.max(10, this.health - dmg);
          this.healthRegenDelayTimer = 3.0;
        }
      }

      this.position.y = supportY;
      this.velocity.y = 0;
      this.grounded = true;
      this.isFalling = false;
      this.fallStartY = supportY;

      // Steep terrain slope sliding on dry land
      if (!inDeepWater && slope > 0.42 && solidSupportY === terrainY) {
        const eps = 0.5;
        const gx =
          groundHeightAt(this.position.x + eps, this.position.z) -
          groundHeightAt(this.position.x - eps, this.position.z);
        const gz =
          groundHeightAt(this.position.x, this.position.z + eps) -
          groundHeightAt(this.position.x, this.position.z - eps);
        const len = Math.hypot(gx, gz) || 1;
        this.position.x -= (gx / len) * 6.0 * dt;
        this.position.z -= (gz / len) * 6.0 * dt;
      }
    } else if (this.position.y > supportY + 0.15) {
      if (this.grounded) {
        this.fallStartY = this.position.y;
      }
      this.grounded = false;
      if (this.position.y > this.fallStartY && this.velocity.y > 0) {
        this.fallStartY = this.position.y;
      }
      this.isFalling = this.velocity.y < -1.2;
    }

    // Passive health regeneration after delay
    if (this.health < this.config.maxHealth) {
      if (this.healthRegenDelayTimer > 0) {
        this.healthRegenDelayTimer = Math.max(0, this.healthRegenDelayTimer - dt);
      } else {
        this.health = Math.min(this.config.maxHealth, this.health + 4 * dt);
      }
    }

    // 10. Determine explicit locomotion state (Idle, Walking, Running, Jumping, Falling)
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (!this.grounded) {
      this.movementState =
        this.isFalling || this.velocity.y < -1.2 ? 'falling' : 'jumping';
    } else if (isSprinting && horizontalSpeed > walkSpd * 0.7) {
      this.movementState = 'running';
    } else if (horizontalSpeed > 0.32) {
      this.movementState = 'walking';
    } else {
      this.movementState = 'idle';
    }

    // 11. Interaction trigger hook
    if (input.interact) {
      this.callbacks.onInteractRequested?.();
    }

    // 12. Sync 3D Character rig, modular animation state machine, footsteps & camera
    this.character.root.position.copy(this.position);
    this.character.root.rotation.y = this.yaw;

    this.character.updateAnimation(
      dt,
      horizontalSpeed,
      this.grounded,
      this.velocity.y,
      this.movementState,
      terrainY,
      this.inWater,
      this.config.runSpeed,
    );

    if (
      this.grounded &&
      (this.movementState === 'walking' || this.movementState === 'running') &&
      horizontalSpeed > 1.35
    ) {
      const stepSign = Math.sign(this.character.getStepCycleValue()) || 1;
      if (stepSign !== this.lastStepSign) {
        this.lastStepSign = stepSign;
        const stepMode =
          this.movementState === 'running'
            ? this.sprinting
              ? 'sprinting'
              : 'running'
            : 'walking';
        this.callbacks.onFootstep?.(stepMode);
      }
    }

    this.cameraRig.updateFollow(
      dt,
      this.position,
      this.movementState === 'running' && horizontalSpeed > 5.0 && !isAimingBow,
      isAimingBow,
    );
  }

  private getRockTopSupportY(): number {
    let highest = -Infinity;
    const nearbyColliders = this.callbacks.queryCollidersNear(
      this.position.x,
      this.position.z,
    );
    for (const c of nearbyColliders) {
      if (c.kind === 'sphere') {
        const dx = this.position.x - c.x;
        const dz = this.position.z - c.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < c.radius * c.radius) {
          const topY = c.y + Math.sqrt(Math.max(0, c.radius * c.radius - distSq));
          if (this.position.y >= topY - 0.55 && topY > highest) {
            highest = topY;
          }
        }
      }
    }
    return highest;
  }

  private resolveObjectCollisions(): void {
    const nearbyColliders = this.callbacks.queryCollidersNear(
      this.position.x,
      this.position.z,
    );
    for (const c of nearbyColliders) {
      if (c.kind === 'cylinder') {
        if (
          this.position.y > c.maxY ||
          this.position.y + this.config.height < c.minY
        ) {
          continue;
        }
        const dx = this.position.x - c.x;
        const dz = this.position.z - c.z;
        const minSep = c.radius + this.config.radius;
        const distSq = dx * dx + dz * dz;
        if (distSq < minSep * minSep && distSq > 0.00001) {
          const dist = Math.sqrt(distSq);
          const push = minSep - dist;
          this.position.x += (dx / dist) * push;
          this.position.z += (dz / dist) * push;
        }
      } else {
        const dx = this.position.x - c.x;
        const dz = this.position.z - c.z;
        const horizDistSq = dx * dx + dz * dz;
        const minSep = c.radius + this.config.radius * 0.85;
        if (horizDistSq < minSep * minSep && horizDistSq > 0.00001) {
          const topSurface =
            c.y +
            Math.sqrt(
              Math.max(0, c.radius * c.radius - Math.min(horizDistSq, c.radius * c.radius)),
            );
          if (
            this.position.y < topSurface - 0.52 &&
            this.position.y + this.config.height > c.y - c.radius
          ) {
            const dist = Math.sqrt(horizDistSq);
            const push = minSep - dist;
            this.position.x += (dx / dist) * push;
            this.position.z += (dz / dist) * push;
          }
        }
      }
    }
  }

  private resolveWorldBounds(): void {
    const dist = Math.hypot(this.position.x, this.position.z);
    if (dist > PLAYABLE_RADIUS) {
      const ratio = PLAYABLE_RADIUS / dist;
      this.position.x *= ratio;
      this.position.z *= ratio;
    }
  }
}
