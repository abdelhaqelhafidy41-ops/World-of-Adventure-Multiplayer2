import * as THREE from 'three';
import type { PlayerMovementState } from '../types';
import type { WeaponAttackAnimType } from '../combat/weapons/Weapon';

export interface PlayerRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  headGroup: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  contactShadow: THREE.Mesh;
}

export interface PlayerAnimationContext {
  dt: number;
  state: PlayerMovementState;
  horizontalSpeed: number;
  maxRunSpeed: number;
  verticalVel: number;
  grounded: boolean;
  inWater: boolean;
  groundElevationUnderPlayer: number;
}

export interface AnimationInternalState {
  walkPhase: number;
  idlePhase: number;
  squashY: number;
  attackTimer: number;
  interactTimer: number;
}

export type AttackAnimationHandler = (
  progress: number,
  rig: PlayerRig,
  dt: number,
) => void;

export interface AnimationStateHandler {
  onEnter?: (rig: PlayerRig, anim: AnimationInternalState, prev: PlayerMovementState) => void;
  update: (
    ctx: PlayerAnimationContext,
    rig: PlayerRig,
    anim: AnimationInternalState,
  ) => void;
}

/**
 * Modular animation state machine for the third-person explorer rig.
 * New locomotion or action animations can be added by registering handlers
 * via `registerState(state, handler)` without altering controller logic.
 */
export class AnimationStateMachine {
  private readonly handlers = new Map<PlayerMovementState, AnimationStateHandler>();
  private readonly attackHandlers = new Map<WeaponAttackAnimType, AttackAnimationHandler>();
  private currentState: PlayerMovementState = 'idle';

  public readonly internal: AnimationInternalState = {
    walkPhase: 0,
    idlePhase: 0,
    squashY: 1,
    attackTimer: 0,
    interactTimer: 0,
  };

  private attackDuration = 0.28;
  private activeAttackType: WeaponAttackAnimType = 'melee_slash';
  private bowChargeActive = false;
  private bowChargeProgress = 0;
  private bowAimPitch = 0;

  constructor() {
    this.registerBuiltInHandlers();
    this.registerBuiltInAttackAnimations();
  }

  public setBowChargeState(active: boolean, progress: number, aimPitch = 0): void {
    this.bowChargeActive = active;
    this.bowChargeProgress = Math.max(0, Math.min(1, progress));
    this.bowAimPitch = THREE.MathUtils.clamp(aimPitch, -0.85, 0.85);
  }

  public getState(): PlayerMovementState {
    return this.currentState;
  }

  public registerState(
    state: PlayerMovementState,
    handler: AnimationStateHandler,
  ): void {
    this.handlers.set(state, handler);
  }

  public registerAttackAnimation(
    type: WeaponAttackAnimType,
    handler: AttackAnimationHandler,
  ): void {
    this.attackHandlers.set(type, handler);
  }

  public triggerLandSquash(strength: number): void {
    this.internal.squashY = Math.max(0.74, 1 - strength * 0.16);
  }

  public triggerAttack(
    duration = 0.28,
    animType: WeaponAttackAnimType = 'melee_slash',
  ): boolean {
    if (this.internal.attackTimer > 0.08) return false;
    this.attackDuration = Math.max(0.16, duration);
    this.activeAttackType = animType;
    this.internal.attackTimer = this.attackDuration;
    return true;
  }

  public triggerInteractGesture(): void {
    this.internal.interactTimer = 0.26;
  }

  public update(ctx: PlayerAnimationContext, rig: PlayerRig): void {
    const { dt, state } = ctx;
    this.internal.idlePhase += dt * 2.2;

    if (this.internal.attackTimer > 0) {
      this.internal.attackTimer = Math.max(0, this.internal.attackTimer - dt);
    }
    if (this.internal.interactTimer > 0) {
      this.internal.interactTimer = Math.max(0, this.internal.interactTimer - dt);
    }

    // Recover landing squash/stretch smoothly
    this.internal.squashY = THREE.MathUtils.damp(this.internal.squashY, 1, 14, dt);
    const stretchXZ = 1 / Math.sqrt(this.internal.squashY);
    rig.bodyPivot.scale.set(stretchXZ, this.internal.squashY, stretchXZ);

    // State transition hook
    if (state !== this.currentState) {
      const prev = this.currentState;
      this.currentState = state;
      this.handlers.get(state)?.onEnter?.(rig, this.internal, prev);
    }

    // Execute modular state handler
    const handler = this.handlers.get(state) ?? this.handlers.get('idle');
    handler?.update(ctx, rig, this.internal);

    // Action Overlays (modular attack animations / bow draw pose / interact reach) cleanly layered on top of locomotion
    if (this.internal.attackTimer > 0) {
      const progress = 1 - this.internal.attackTimer / this.attackDuration;
      const atkHandler =
        this.attackHandlers.get(this.activeAttackType) ??
        this.attackHandlers.get('melee_slash');
      atkHandler?.(progress, rig, dt);
    } else if (this.bowChargeActive) {
      const pull = THREE.MathUtils.lerp(0.25, 1.0, this.bowChargeProgress);
      const pitchOffset = -this.bowAimPitch;
      rig.rightArmPivot.rotation.x = THREE.MathUtils.damp(
        rig.rightArmPivot.rotation.x,
        -1.52 + pitchOffset,
        16,
        dt,
      );
      rig.rightArmPivot.rotation.z = THREE.MathUtils.damp(
        rig.rightArmPivot.rotation.z,
        0.14,
        16,
        dt,
      );
      rig.leftArmPivot.rotation.x = THREE.MathUtils.damp(
        rig.leftArmPivot.rotation.x,
        -1.36 - 0.16 * pull + pitchOffset * 0.9,
        16,
        dt,
      );
      rig.leftArmPivot.rotation.z = THREE.MathUtils.damp(
        rig.leftArmPivot.rotation.z,
        0.18 + 0.38 * pull,
        16,
        dt,
      );
      rig.bodyPivot.rotation.y = THREE.MathUtils.damp(
        rig.bodyPivot.rotation.y,
        0.3 + 0.14 * pull,
        14,
        dt,
      );
      rig.headGroup.rotation.x = THREE.MathUtils.damp(
        rig.headGroup.rotation.x,
        pitchOffset * 0.45,
        14,
        dt,
      );
    } else if (this.internal.interactTimer > 0) {
      const t = 1 - this.internal.interactTimer / 0.26;
      const reachArc = Math.sin(t * Math.PI);
      rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(
        rig.rightArmPivot.rotation.x,
        -0.95 * reachArc,
        0.75,
      );
      rig.bodyPivot.rotation.x = THREE.MathUtils.lerp(
        rig.bodyPivot.rotation.x,
        0.14 * reachArc,
        0.5,
      );
      rig.bodyPivot.rotation.y = THREE.MathUtils.damp(rig.bodyPivot.rotation.y, 0, 12, dt);
    } else {
      rig.bodyPivot.rotation.y = THREE.MathUtils.damp(rig.bodyPivot.rotation.y, 0, 14, dt);
    }

    // Ground the contact shadow directly onto the surface beneath the character
    const heightAboveGround = Math.max(
      0,
      rig.root.position.y - ctx.groundElevationUnderPlayer,
    );
    rig.contactShadow.position.y = -heightAboveGround + 0.04;
    const shadowScale = THREE.MathUtils.clamp(1 - heightAboveGround * 0.08, 0.42, 1);
    rig.contactShadow.scale.setScalar(shadowScale);
    (rig.contactShadow.material as THREE.MeshBasicMaterial).opacity =
      0.46 * THREE.MathUtils.clamp(1 - heightAboveGround * 0.16, 0.08, 1);
  }

  private registerBuiltInHandlers(): void {
    // 1. IDLE STATE: subtle breathing & relaxed stance
    this.registerState('idle', {
      update: ({ dt }, rig, anim) => {
        const breath = Math.sin(anim.idlePhase) * 0.016;
        rig.leftLegPivot.rotation.x = THREE.MathUtils.damp(rig.leftLegPivot.rotation.x, 0, 12, dt);
        rig.rightLegPivot.rotation.x = THREE.MathUtils.damp(rig.rightLegPivot.rotation.x, 0, 12, dt);
        rig.leftArmPivot.rotation.x = THREE.MathUtils.damp(
          rig.leftArmPivot.rotation.x,
          Math.sin(anim.idlePhase * 0.7) * 0.045,
          10,
          dt,
        );
        rig.rightArmPivot.rotation.x = THREE.MathUtils.damp(
          rig.rightArmPivot.rotation.x,
          -Math.sin(anim.idlePhase * 0.7) * 0.045,
          10,
          dt,
        );
        rig.leftArmPivot.rotation.z = THREE.MathUtils.damp(rig.leftArmPivot.rotation.z, 0.06, 10, dt);
        rig.rightArmPivot.rotation.z = THREE.MathUtils.damp(rig.rightArmPivot.rotation.z, -0.06, 10, dt);
        rig.bodyPivot.position.y = THREE.MathUtils.damp(rig.bodyPivot.position.y, breath, 12, dt);
        rig.bodyPivot.rotation.x = THREE.MathUtils.damp(rig.bodyPivot.rotation.x, 0, 10, dt);
        rig.headGroup.rotation.x = THREE.MathUtils.damp(rig.headGroup.rotation.x, 0, 10, dt);
      },
    });

    // 2. WALKING STATE: steady natural stride & mild forward posture
    this.registerState('walking', {
      update: ({ dt, horizontalSpeed, inWater }, rig, anim) => {
        const speedRatio = THREE.MathUtils.clamp(horizontalSpeed / 6.2, 0.12, 1.15);
        const freq = inWater ? 6.8 : 8.5;
        anim.walkPhase += dt * freq * speedRatio;

        const swing = Math.sin(anim.walkPhase) * 0.6 * Math.min(speedRatio, 1);
        const bounce = Math.abs(Math.cos(anim.walkPhase)) * 0.05 * Math.min(speedRatio, 1);

        rig.leftLegPivot.rotation.x = THREE.MathUtils.damp(rig.leftLegPivot.rotation.x, swing, 16, dt);
        rig.rightLegPivot.rotation.x = THREE.MathUtils.damp(rig.rightLegPivot.rotation.x, -swing, 16, dt);
        rig.leftArmPivot.rotation.x = THREE.MathUtils.damp(rig.leftArmPivot.rotation.x, -swing * 0.78, 16, dt);
        rig.rightArmPivot.rotation.x = THREE.MathUtils.damp(rig.rightArmPivot.rotation.x, swing * 0.78, 16, dt);
        rig.leftArmPivot.rotation.z = THREE.MathUtils.damp(rig.leftArmPivot.rotation.z, 0.09, 12, dt);
        rig.rightArmPivot.rotation.z = THREE.MathUtils.damp(rig.rightArmPivot.rotation.z, -0.09, 12, dt);

        rig.bodyPivot.position.y = THREE.MathUtils.damp(rig.bodyPivot.position.y, bounce, 14, dt);
        rig.bodyPivot.rotation.x = THREE.MathUtils.damp(rig.bodyPivot.rotation.x, 0.075, 10, dt);
        rig.headGroup.rotation.x = -rig.bodyPivot.rotation.x * 0.5;
      },
    });

    // 3. RUNNING STATE: athletic forward lean, wider stride & faster cadence
    this.registerState('running', {
      update: ({ dt, horizontalSpeed, maxRunSpeed }, rig, anim) => {
        const speedRatio = THREE.MathUtils.clamp(
          horizontalSpeed / Math.max(1, maxRunSpeed * 0.75),
          0.55,
          1.3,
        );
        anim.walkPhase += dt * 11.8 * speedRatio;

        const swing = Math.sin(anim.walkPhase) * 0.9 * Math.min(speedRatio, 1.08);
        const bounce = Math.abs(Math.cos(anim.walkPhase)) * 0.075 * Math.min(speedRatio, 1.05);

        rig.leftLegPivot.rotation.x = THREE.MathUtils.damp(rig.leftLegPivot.rotation.x, swing, 18, dt);
        rig.rightLegPivot.rotation.x = THREE.MathUtils.damp(rig.rightLegPivot.rotation.x, -swing, 18, dt);
        rig.leftArmPivot.rotation.x = THREE.MathUtils.damp(rig.leftArmPivot.rotation.x, -swing * 0.92, 18, dt);
        rig.rightArmPivot.rotation.x = THREE.MathUtils.damp(rig.rightArmPivot.rotation.x, swing * 0.92, 18, dt);
        rig.leftArmPivot.rotation.z = THREE.MathUtils.damp(rig.leftArmPivot.rotation.z, 0.14, 12, dt);
        rig.rightArmPivot.rotation.z = THREE.MathUtils.damp(rig.rightArmPivot.rotation.z, -0.14, 12, dt);

        rig.bodyPivot.position.y = THREE.MathUtils.damp(rig.bodyPivot.position.y, bounce, 16, dt);
        rig.bodyPivot.rotation.x = THREE.MathUtils.damp(rig.bodyPivot.rotation.x, 0.18, 10, dt);
        rig.headGroup.rotation.x = -rig.bodyPivot.rotation.x * 0.55;
      },
    });

    // 4. JUMPING STATE: upward launch pose (knee lift & upward reach)
    this.registerState('jumping', {
      onEnter: (rig) => {
        rig.bodyPivot.position.y = 0.02;
      },
      update: ({ dt, verticalVel }, rig) => {
        const riseTilt = THREE.MathUtils.clamp(-verticalVel * 0.02, -0.22, 0.08);
        rig.leftLegPivot.rotation.x = THREE.MathUtils.damp(rig.leftLegPivot.rotation.x, 0.54, 12, dt);
        rig.rightLegPivot.rotation.x = THREE.MathUtils.damp(rig.rightLegPivot.rotation.x, -0.32, 12, dt);
        rig.leftArmPivot.rotation.x = THREE.MathUtils.damp(rig.leftArmPivot.rotation.x, -0.78, 12, dt);
        rig.rightArmPivot.rotation.x = THREE.MathUtils.damp(rig.rightArmPivot.rotation.x, -0.45, 12, dt);
        rig.leftArmPivot.rotation.z = THREE.MathUtils.damp(rig.leftArmPivot.rotation.z, 0.28, 10, dt);
        rig.rightArmPivot.rotation.z = THREE.MathUtils.damp(rig.rightArmPivot.rotation.z, -0.28, 10, dt);
        rig.bodyPivot.position.y = THREE.MathUtils.damp(rig.bodyPivot.position.y, 0, 10, dt);
        rig.bodyPivot.rotation.x = THREE.MathUtils.damp(rig.bodyPivot.rotation.x, riseTilt, 10, dt);
        rig.headGroup.rotation.x = THREE.MathUtils.damp(rig.headGroup.rotation.x, -0.08, 10, dt);
      },
    });

    // 5. FALLING STATE: distinct descent pose (bracing legs & outstretched arms)
    this.registerState('falling', {
      update: ({ dt, verticalVel }, rig, anim) => {
        const fallRatio = THREE.MathUtils.clamp(-verticalVel / 18, 0, 1);
        const flutter = Math.sin(anim.idlePhase * 3.8) * 0.08 * fallRatio;
        rig.leftLegPivot.rotation.x = THREE.MathUtils.damp(rig.leftLegPivot.rotation.x, 0.24 + flutter, 10, dt);
        rig.rightLegPivot.rotation.x = THREE.MathUtils.damp(rig.rightLegPivot.rotation.x, -0.18 - flutter, 10, dt);
        rig.leftArmPivot.rotation.x = THREE.MathUtils.damp(rig.leftArmPivot.rotation.x, -0.35, 10, dt);
        rig.rightArmPivot.rotation.x = THREE.MathUtils.damp(rig.rightArmPivot.rotation.x, -0.35, 10, dt);
        rig.leftArmPivot.rotation.z = THREE.MathUtils.damp(rig.leftArmPivot.rotation.z, 0.48 + fallRatio * 0.32 + flutter, 10, dt);
        rig.rightArmPivot.rotation.z = THREE.MathUtils.damp(rig.rightArmPivot.rotation.z, -0.48 - fallRatio * 0.32 - flutter, 10, dt);
        rig.bodyPivot.position.y = THREE.MathUtils.damp(rig.bodyPivot.position.y, 0, 10, dt);
        rig.bodyPivot.rotation.x = THREE.MathUtils.damp(rig.bodyPivot.rotation.x, 0.12 * fallRatio, 8, dt);
        rig.headGroup.rotation.x = THREE.MathUtils.damp(rig.headGroup.rotation.x, 0.12, 8, dt);
      },
    });
  }

  private registerBuiltInAttackAnimations(): void {
    // Sword horizontal/diagonal slash
    this.registerAttackAnimation('melee_slash', (t, rig) => {
      const swingArc = Math.sin(t * Math.PI);
      rig.rightArmPivot.rotation.x = -1.75 * swingArc;
      rig.rightArmPivot.rotation.z = -0.35 * swingArc;
      rig.leftArmPivot.rotation.x = 0.45 * swingArc;
      rig.bodyPivot.rotation.y = -0.46 * swingArc;
    });

    // Axe heavy overhead windup & downward chop
    this.registerAttackAnimation('heavy_chop', (t, rig) => {
      if (t < 0.36) {
        const up = t / 0.36;
        rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(0, -2.55, up);
        rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(0, -1.65, up);
        rig.bodyPivot.rotation.x = THREE.MathUtils.lerp(0, -0.18, up);
        rig.bodyPivot.rotation.y = THREE.MathUtils.lerp(0, -0.22, up);
      } else {
        const chop = (t - 0.36) / 0.64;
        const slam = Math.sin(chop * Math.PI * 0.65);
        rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(-2.55, 0.72, slam);
        rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(-1.65, 0.35, slam);
        rig.bodyPivot.rotation.x = THREE.MathUtils.lerp(-0.18, 0.24, slam);
        rig.bodyPivot.rotation.y = THREE.MathUtils.lerp(-0.22, 0.32, slam);
      }
    });

    // Bow aim & draw-release shot
    this.registerAttackAnimation('bow_shot', (t, rig) => {
      const hold = Math.sin(t * Math.PI);
      rig.rightArmPivot.rotation.x = -1.55 * hold;
      rig.rightArmPivot.rotation.z = 0.12 * hold;
      // Draw string back with left arm, then release
      const draw = t < 0.45 ? t / 0.45 : Math.max(0, 1 - (t - 0.45) / 0.3);
      rig.leftArmPivot.rotation.x = -1.4 * hold;
      rig.leftArmPivot.rotation.z = 0.45 * draw;
      rig.bodyPivot.rotation.y = 0.38 * hold;
    });

    // Spear forward lunge thrust
    this.registerAttackAnimation('spear_thrust', (t, rig) => {
      const thrust = Math.sin(t * Math.PI);
      rig.rightArmPivot.rotation.x = -1.35 * thrust;
      rig.rightArmPivot.rotation.z = -0.1 * thrust;
      rig.leftArmPivot.rotation.x = -0.8 * thrust;
      rig.bodyPivot.rotation.x = 0.16 * thrust;
      rig.bodyPivot.rotation.y = 0.22 * thrust;
    });

    // Hunter Knife rapid diagonal snap
    this.registerAttackAnimation('knife_slash', (t, rig) => {
      const snap = Math.sin(t * Math.PI);
      rig.rightArmPivot.rotation.x = -1.65 * snap;
      rig.rightArmPivot.rotation.z = -0.5 * snap;
      rig.leftArmPivot.rotation.x = 0.3 * snap;
      rig.bodyPivot.rotation.y = -0.58 * snap;
    });

    // Unarmed quick jab
    this.registerAttackAnimation('unarmed_punch', (t, rig) => {
      const jab = Math.sin(t * Math.PI);
      rig.rightArmPivot.rotation.x = -1.45 * jab;
      rig.leftArmPivot.rotation.x = 0.35 * jab;
      rig.bodyPivot.rotation.y = -0.32 * jab;
    });
  }
}
