import * as THREE from 'three';
import { groundHeightAt } from '../math/noise';
import {
  DEFAULT_PORTRAIT_CAMERA_SETTINGS,
  type CameraPerspective,
  type PortraitCameraSettings,
  type WorldCollider,
} from '../types';

export interface ThirdPersonCameraConfig {
  distance: number;
  shoulderHeight: number;
  minPitch: number;
  maxPitch: number;
  minFirstPersonPitch: number;
  maxFirstPersonPitch: number;
  followHorizontalDamping: number;
  followVerticalDamping: number;
  lookSmoothing: number;
  smoothingScale: number;
  baseFov: number;
  sprintFov: number;
}

export const DEFAULT_CAMERA_CONFIG: ThirdPersonCameraConfig = {
  distance: 6.4,
  shoulderHeight: 1.55,
  minPitch: -0.26,
  maxPitch: 1.18,
  minFirstPersonPitch: -1.25,
  maxFirstPersonPitch: 1.25,
  followHorizontalDamping: 12.0,
  followVerticalDamping: 9.0,
  lookSmoothing: 24.0,
  smoothingScale: 1.0,
  baseFov: 62,
  sprintFov: 68.5,
};

const PERSPECTIVE_ORDER: CameraPerspective[] = [
  'third-person',
  'first-person',
  'second-person',
];

const COLLISION_STEPS = [0.22, 0.38, 0.54, 0.7, 0.85, 1.0];

// Pre-allocated vectors outside frame updates (zero per-frame GC)
const _desiredPivot = new THREE.Vector3();
const _goalPos = new THREE.Vector3();
const _desiredLook = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _currentLook = new THREE.Vector3();

/**
 * Multi-perspective camera rig (First Person, Second Person, Third Person).
 * Handles clamped mouse/touch rotation, smooth transitions between perspectives,
 * terrain & world-collider clearance checks, dynamic sprint/aim FOV, and impact shake.
 */
export class ThirdPersonCamera {
  public readonly camera: THREE.PerspectiveCamera;
  public readonly config: ThirdPersonCameraConfig;

  private perspective: CameraPerspective = 'third-person';
  private perspectiveTransitionTimer = 0;
  private readonly perspectiveTransitionDuration = 0.35;

  private targetYaw = 0;
  private targetPitch = 0.28;
  private yaw = 0;
  private pitch = 0.28;
  private currentDistance: number;

  private readonly smoothedPivot = new THREE.Vector3();
  private pivotInitialized = false;
  private shakeIntensity = 0;
  private titlePanAngle = 0.52;
  private reducedMotion = false;
  private portraitConfig: PortraitCameraSettings = {
    ...DEFAULT_PORTRAIT_CAMERA_SETTINGS,
  };
  private colliderQuery?: (x: number, z: number) => WorldCollider[];

  constructor(
    camera: THREE.PerspectiveCamera,
    config: Partial<ThirdPersonCameraConfig> = {},
  ) {
    this.camera = camera;
    this.config = { ...DEFAULT_CAMERA_CONFIG, ...config };
    this.currentDistance = this.config.distance;
  }

  public setColliderQuery(cb?: (x: number, z: number) => WorldCollider[]): void {
    this.colliderQuery = cb;
  }

  public getPerspective(): CameraPerspective {
    return this.perspective;
  }

  public isFirstPersonActive(): boolean {
    return (
      this.perspective === 'first-person' &&
      this.perspectiveTransitionTimer <= this.perspectiveTransitionDuration * 0.55
    );
  }

  public setPerspective(mode: CameraPerspective, immediate = false): void {
    if (this.perspective === mode && !immediate) return;
    this.perspective = mode;
    const minP =
      mode === 'first-person'
        ? this.config.minFirstPersonPitch
        : this.config.minPitch;
    const maxP =
      mode === 'first-person'
        ? this.config.maxFirstPersonPitch
        : this.config.maxPitch;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch, minP, maxP);
    this.pitch = THREE.MathUtils.clamp(this.pitch, minP, maxP);

    if (immediate || this.reducedMotion) {
      this.perspectiveTransitionTimer = 0;
      if (this.pivotInitialized) {
        this.snapToGoal();
      }
    } else {
      this.perspectiveTransitionTimer = this.perspectiveTransitionDuration;
    }
  }

  public cyclePerspective(): CameraPerspective {
    const idx = PERSPECTIVE_ORDER.indexOf(this.perspective);
    const next = PERSPECTIVE_ORDER[(idx + 1) % PERSPECTIVE_ORDER.length];
    this.setPerspective(next, false);
    return next;
  }

  public updateCameraConfig(opts: {
    distance?: number;
    shoulderHeight?: number;
    smoothingScale?: number;
  }): void {
    if (
      typeof opts.distance === 'number' &&
      Number.isFinite(opts.distance)
    ) {
      this.config.distance = THREE.MathUtils.clamp(opts.distance, 3.2, 11.0);
    }
    if (
      typeof opts.shoulderHeight === 'number' &&
      Number.isFinite(opts.shoulderHeight)
    ) {
      this.config.shoulderHeight = THREE.MathUtils.clamp(
        opts.shoulderHeight,
        0.8,
        2.6,
      );
    }
    if (
      typeof opts.smoothingScale === 'number' &&
      Number.isFinite(opts.smoothingScale)
    ) {
      this.config.smoothingScale = THREE.MathUtils.clamp(
        opts.smoothingScale,
        0.3,
        2.0,
      );
    }
  }

  public setBaseFov(fov: number): void {
    const clamped = THREE.MathUtils.clamp(fov, 55, 100);
    this.config.baseFov = clamped;
    this.config.sprintFov = Math.min(106, clamped + 6.5);
    if (Math.abs(this.camera.fov - clamped) > 0.1) {
      this.camera.fov = clamped;
      this.camera.updateProjectionMatrix();
    }
  }

  public setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  public updatePortraitConfig(next: Partial<PortraitCameraSettings>): void {
    this.portraitConfig = {
      ...this.portraitConfig,
      ...next,
    };
  }

  private getPortraitFactor(): number {
    if (!this.portraitConfig.autoAdapt) return 0;
    const aspect = this.camera.aspect || 1;
    if (aspect >= 1.0) return 0;
    return THREE.MathUtils.clamp((1.0 - aspect) / 0.55, 0, 1);
  }

  private getActivePitchBounds(): { min: number; max: number } {
    if (this.perspective === 'first-person') {
      return {
        min: this.config.minFirstPersonPitch,
        max: this.config.maxFirstPersonPitch,
      };
    }
    return { min: this.config.minPitch, max: this.config.maxPitch };
  }

  public reset(playerPos: THREE.Vector3, yaw = 0, pitch = 0.26): void {
    const bounds = this.getActivePitchBounds();
    this.targetYaw = yaw;
    this.targetPitch = THREE.MathUtils.clamp(pitch, bounds.min, bounds.max);
    this.yaw = this.targetYaw;
    this.pitch = this.targetPitch;
    this.currentDistance = this.config.distance;
    this.perspectiveTransitionTimer = 0;
    this.smoothedPivot.set(
      playerPos.x,
      playerPos.y + this.config.shoulderHeight,
      playerPos.z,
    );
    _currentLook.copy(this.smoothedPivot);
    this.pivotInitialized = true;
    this.shakeIntensity = 0;
    this.snapToGoal();
  }

  public addLookInput(lookX: number, lookY: number): void {
    const bounds = this.getActivePitchBounds();
    this.targetYaw -= lookX;
    this.targetPitch = THREE.MathUtils.clamp(
      this.targetPitch + lookY,
      bounds.min,
      bounds.max,
    );
  }

  public getYaw(): number {
    return this.yaw;
  }

  public getPitch(): number {
    return this.pitch;
  }

  public setYawPitch(
    playerPos: THREE.Vector3,
    yaw: number,
    pitch: number,
  ): void {
    const bounds = this.getActivePitchBounds();
    this.targetYaw = yaw;
    this.yaw = yaw;
    this.targetPitch = THREE.MathUtils.clamp(pitch, bounds.min, bounds.max);
    this.pitch = this.targetPitch;
    this.currentDistance = this.config.distance;
    this.perspectiveTransitionTimer = 0;
    this.smoothedPivot.set(
      playerPos.x,
      playerPos.y + this.config.shoulderHeight,
      playerPos.z,
    );
    _currentLook.copy(this.smoothedPivot);
    this.pivotInitialized = true;
    this.shakeIntensity = 0;
    this.snapToGoal();
  }

  public getHeadingDegrees(): number {
    return (((-this.yaw * 180) / Math.PI) % 360 + 360) % 360;
  }

  public triggerShake(intensity: number): void {
    const scale = this.reducedMotion ? 0.2 : 1;
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity * scale);
  }

  public updateTitleOrbit(dt: number, playerPos: THREE.Vector3): void {
    const orbitSpeed = this.reducedMotion ? 0.015 : 0.068;
    this.titlePanAngle += dt * orbitSpeed;
    // Elevated scenic overlook capturing foreground pines, Oakhollow ridges & northern mountain skyline
    const orbitR = 22.0 + this.getPortraitFactor() * 4.5;
    const angle = 0.55 + Math.sin(this.titlePanAngle) * 0.65;
    const camX = playerPos.x + Math.sin(angle) * orbitR;
    const camZ = playerPos.z + Math.cos(angle) * orbitR + 6.0;
    const groundAtCam = groundHeightAt(camX, camZ);
    const camY = Math.max(playerPos.y + 8.6, groundAtCam + 5.2);

    const lookX = playerPos.x + Math.sin(this.titlePanAngle * 0.45) * 6.0;
    const lookY = playerPos.y + 4.2;
    const lookZ = playerPos.z - 28.0;

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(lookX, lookY, lookZ);
  }

  private computeSafeDistanceRatio(
    pivotX: number,
    pivotY: number,
    pivotZ: number,
    dirX: number,
    dirY: number,
    dirZ: number,
  ): number {
    let safeDistRatio = 1.0;
    const query = this.colliderQuery;
    const midColliders = query
      ? query(pivotX + dirX * 0.5, pivotZ + dirZ * 0.5)
      : null;

    for (let i = 0; i < COLLISION_STEPS.length; i++) {
      const t = COLLISION_STEPS[i];
      const sx = pivotX + dirX * t;
      const sy = pivotY + dirY * t;
      const sz = pivotZ + dirZ * t;
      const terrainH = groundHeightAt(sx, sz) + 0.6;
      if (sy < terrainH) {
        const deficit = terrainH - sy;
        const candidate = Math.max(0.28, t - deficit * 0.08);
        if (candidate < safeDistRatio) {
          safeDistRatio = candidate;
        }
      }

      if (midColliders && midColliders.length > 0) {
        for (let j = 0; j < midColliders.length; j++) {
          const c = midColliders[j];
          const pad = 0.32;
          if (c.kind === 'cylinder') {
            if (sy < c.minY - 0.1 || sy > c.maxY + 0.25) continue;
            const dx = sx - c.x;
            const dz = sz - c.z;
            const r = c.radius + pad;
            if (dx * dx + dz * dz < r * r) {
              const candidate = Math.max(0.22, t - 0.12);
              if (candidate < safeDistRatio) {
                safeDistRatio = candidate;
              }
            }
          } else {
            const dx = sx - c.x;
            const dy = sy - c.y;
            const dz = sz - c.z;
            const r = c.radius + pad;
            if (dx * dx + dy * dy + dz * dz < r * r) {
              const candidate = Math.max(0.22, t - 0.12);
              if (candidate < safeDistRatio) {
                safeDistRatio = candidate;
              }
            }
          }
        }
      }
    }

    return safeDistRatio;
  }

  public updateFollow(
    dt: number,
    playerPos: THREE.Vector3,
    sprinting: boolean,
    aimingBow = false,
  ): void {
    if (!this.pivotInitialized) {
      this.reset(playerPos);
      return;
    }

    if (this.perspectiveTransitionTimer > 0) {
      this.perspectiveTransitionTimer = Math.max(
        0,
        this.perspectiveTransitionTimer - dt,
      );
    }

    const smoothFactor = 1 / Math.max(0.35, this.config.smoothingScale);
    const lookSmoothRate =
      this.perspective === 'first-person'
        ? this.config.lookSmoothing * 1.45
        : this.config.lookSmoothing * smoothFactor;

    // Smooth camera orbit rotation
    this.yaw = THREE.MathUtils.damp(
      this.yaw,
      this.targetYaw,
      lookSmoothRate,
      dt,
    );
    this.pitch = THREE.MathUtils.damp(
      this.pitch,
      this.targetPitch,
      lookSmoothRate,
      dt,
    );

    const portraitFactor = this.getPortraitFactor();
    const baseDistance =
      this.config.distance *
      (1 + (this.portraitConfig.distanceMultiplier - 1) * portraitFactor);
    const effectiveDistance = aimingBow ? baseDistance * 0.84 : baseDistance;

    if (this.perspective === 'first-person') {
      const eyeHeight = 1.56 + (this.config.shoulderHeight - 1.55) * 0.45;
      const forwardX = -Math.sin(this.yaw);
      const forwardZ = -Math.cos(this.yaw);
      const cosP = Math.cos(this.pitch);
      const lookDirX = forwardX * cosP;
      const lookDirY = -Math.sin(this.pitch);
      const lookDirZ = forwardZ * cosP;

      const desiredEyeX = playerPos.x + forwardX * 0.08;
      const desiredEyeZ = playerPos.z + forwardZ * 0.08;
      const desiredEyeY = Math.max(
        playerPos.y + eyeHeight,
        groundHeightAt(desiredEyeX, desiredEyeZ) + 0.35,
      );

      this.smoothedPivot.set(desiredEyeX, desiredEyeY, desiredEyeZ);
      _goalPos.copy(this.smoothedPivot);
      _desiredLook.set(
        desiredEyeX + lookDirX * 14,
        desiredEyeY + lookDirY * 14,
        desiredEyeZ + lookDirZ * 14,
      );
    } else {
      const effectiveShoulderHeight =
        this.config.shoulderHeight +
        this.portraitConfig.shoulderOffsetY * portraitFactor +
        (aimingBow ? 0.08 : 0);

      // Smooth pivot follow (decoupled horizontal vs vertical damping)
      _desiredPivot.set(
        playerPos.x,
        playerPos.y + effectiveShoulderHeight,
        playerPos.z,
      );

      const horizDamp = this.config.followHorizontalDamping * smoothFactor;
      const vertDamp = this.config.followVerticalDamping * smoothFactor;
      this.smoothedPivot.x = THREE.MathUtils.damp(
        this.smoothedPivot.x,
        _desiredPivot.x,
        horizDamp,
        dt,
      );
      this.smoothedPivot.z = THREE.MathUtils.damp(
        this.smoothedPivot.z,
        _desiredPivot.z,
        horizDamp,
        dt,
      );
      this.smoothedPivot.y = THREE.MathUtils.damp(
        this.smoothedPivot.y,
        _desiredPivot.y,
        vertDamp,
        dt,
      );

      // Second Person places camera in front of the player (-sin, -cos) looking back toward player
      const orbitSign = this.perspective === 'second-person' ? -1 : 1;
      const horizDist = Math.cos(this.pitch) * effectiveDistance;
      const vertOffset = Math.sin(this.pitch) * effectiveDistance;

      const dirX = orbitSign * Math.sin(this.yaw) * horizDist;
      const dirZ = orbitSign * Math.cos(this.yaw) * horizDist;
      _rayDir.set(dirX, vertOffset, dirZ);

      const safeDistRatio = this.computeSafeDistanceRatio(
        this.smoothedPivot.x,
        this.smoothedPivot.y,
        this.smoothedPivot.z,
        _rayDir.x,
        _rayDir.y,
        _rayDir.z,
      );

      const desiredDist = effectiveDistance * safeDistRatio;
      const distDamp = desiredDist < this.currentDistance ? 18 : 9;
      this.currentDistance = THREE.MathUtils.damp(
        this.currentDistance,
        desiredDist,
        distDamp,
        dt,
      );

      const actualHoriz = Math.cos(this.pitch) * this.currentDistance;
      const actualVert = Math.sin(this.pitch) * this.currentDistance;
      const goalX =
        this.smoothedPivot.x + orbitSign * Math.sin(this.yaw) * actualHoriz;
      const goalZ =
        this.smoothedPivot.z + orbitSign * Math.cos(this.yaw) * actualHoriz;
      const minGroundY = groundHeightAt(goalX, goalZ) + 0.6;
      const goalY = Math.max(this.smoothedPivot.y + actualVert, minGroundY);

      _goalPos.set(goalX, goalY, goalZ);
      _desiredLook.copy(this.smoothedPivot);
    }

    if (this.shakeIntensity > 0.001) {
      _goalPos.x += (Math.random() - 0.5) * this.shakeIntensity;
      _goalPos.y += (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity = THREE.MathUtils.damp(this.shakeIntensity, 0, 12, dt);
    }

    if (this.perspectiveTransitionTimer > 0) {
      const blendAlpha = 1 - Math.exp(-13 * dt);
      this.camera.position.lerp(_goalPos, blendAlpha);
      _currentLook.lerp(_desiredLook, 1 - Math.exp(-15 * dt));
      this.camera.lookAt(_currentLook);
    } else if (this.perspective === 'first-person') {
      this.camera.position.copy(_goalPos);
      _currentLook.copy(_desiredLook);
      this.camera.lookAt(_currentLook);
    } else {
      const posRate = 18 * smoothFactor;
      const posAlpha = 1 - Math.exp(-posRate * dt);
      this.camera.position.lerp(_goalPos, posAlpha);
      _currentLook.copy(_desiredLook);
      this.camera.lookAt(_currentLook);
    }

    const fovBase =
      (sprinting ? this.config.sprintFov : this.config.baseFov) +
      this.portraitConfig.fovBoost * portraitFactor -
      (aimingBow ? 5.0 : 0);
    const targetFov = THREE.MathUtils.clamp(fovBase, 48, 108);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 7, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  private snapToGoal(): void {
    if (this.perspective === 'first-person') {
      const eyeHeight = 1.56 + (this.config.shoulderHeight - 1.55) * 0.45;
      const forwardX = -Math.sin(this.yaw);
      const forwardZ = -Math.cos(this.yaw);
      const cosP = Math.cos(this.pitch);
      const gx = this.smoothedPivot.x + forwardX * 0.08;
      const gz = this.smoothedPivot.z + forwardZ * 0.08;
      const gy = Math.max(
        this.smoothedPivot.y - this.config.shoulderHeight + eyeHeight,
        groundHeightAt(gx, gz) + 0.35,
      );
      this.camera.position.set(gx, gy, gz);
      _currentLook.set(
        gx + forwardX * cosP * 14,
        gy - Math.sin(this.pitch) * 14,
        gz + forwardZ * cosP * 14,
      );
      this.camera.lookAt(_currentLook);
      return;
    }

    const orbitSign = this.perspective === 'second-person' ? -1 : 1;
    const horizDist = Math.cos(this.pitch) * this.currentDistance;
    const vertOffset = Math.sin(this.pitch) * this.currentDistance;
    const gx = this.smoothedPivot.x + orbitSign * Math.sin(this.yaw) * horizDist;
    const gz = this.smoothedPivot.z + orbitSign * Math.cos(this.yaw) * horizDist;
    const gy = Math.max(
      this.smoothedPivot.y + vertOffset,
      groundHeightAt(gx, gz) + 0.6,
    );
    this.camera.position.set(gx, gy, gz);
    _currentLook.copy(this.smoothedPivot);
    this.camera.lookAt(_currentLook);
  }
}
