import * as THREE from 'three';
import { WATER_LEVEL, groundHeightAt } from '../../math/noise';
import type { WorldCollider } from '../../types';
import type { EnemyController } from '../EnemyController';
import { Weapon, type WeaponAttackContext } from './Weapon';

export type BowVariantId = 'hunter-bow' | 'crossbow';

export interface BowChargeConfig {
  minChargeTime: number;
  chargeDuration: number;
  minArrowSpeed: number;
  maxArrowSpeed: number;
  minDamage: number;
  maxDamage: number;
  gravity: number;
  headshotMultiplier: number;
  maxRange: number;
  stickDuration: number;
}

export interface BowShotParameters {
  chargeFactor: number;
  speed: number;
  damage: number;
  damageMultiplier: number;
  gravity: number;
  life: number;
}

interface ArrowProjectile {
  networkArrowId: string;
  resolvedOnServer: boolean;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  gravity: number;
  life: number;
  active: boolean;
  stuck: boolean;
  stuckTimer: number;
  damageMultiplier: number;
}

const ARROW_POOL_SIZE = 16;
const TRAJECTORY_POINT_COUNT = 26;
const TRAJECTORY_STEP_DT = 0.045;

// Zero-GC reusable scratch vectors
const _bowFwdDir = new THREE.Vector3();
const _prevArrowPos = new THREE.Vector3();
const _simPos = new THREE.Vector3();
const _simPrev = new THREE.Vector3();
const _simVel = new THREE.Vector3();
const _hitPosScratch = new THREE.Vector3();
const _nockLocal = new THREE.Vector3();

/**
 * Ranged Bow & Crossbow weapons featuring:
 * - Configurable smooth 0 -> 1 draw charging with minChargeTime guard
 * - Charge-scaled projectile speed, gravity arc, range, and damage
 * - Animated bowstring pullback & visible nocked arrow
 * - Pooled lightweight 3D parabolic trajectory preview
 * - Swept projectile collisions against terrain, colliders, enemies, wildlife & NPCs
 * - Headshot multiplier & terrain/building sticking arrows
 */
export class BowWeapon extends Weapon {
  private readonly arrows: ArrowProjectile[] = [];
  private arrowPoolInitialized = false;
  private nextArrowSeq = 0;
  private readonly arrowGeoDisposables: Array<{ dispose: () => void }> = [];
  private readonly variantId: BowVariantId;
  private readonly chargeConfig: BowChargeConfig;

  // Dynamic draw rig elements on viewMesh
  private bowRigPivot: THREE.Group | null = null;
  private bowStaveMesh: THREE.Mesh | null = null;
  private upperStringMesh: THREE.Mesh | null = null;
  private lowerStringMesh: THREE.Mesh | null = null;
  private nockedArrowGroup: THREE.Group | null = null;
  private nockAnchorObj: THREE.Object3D | null = null;

  // Pooled 3D parabolic trajectory preview
  private trajectoryLine: THREE.Line | null = null;
  private trajectoryGeo: THREE.BufferGeometry | null = null;
  private trajectoryPositions: Float32Array | null = null;
  private trajectoryMat: THREE.LineBasicMaterial | null = null;
  private trajectoryImpactRing: THREE.Mesh | null = null;
  private trajectoryImpactGeo: THREE.RingGeometry | null = null;
  private trajectoryImpactMat: THREE.MeshBasicMaterial | null = null;

  constructor(variantId: BowVariantId = 'hunter-bow') {
    const isCrossbow = variantId === 'crossbow';
    const chargeDuration = isCrossbow ? 1.5 : 2.0;
    super({
      id: variantId,
      itemId: variantId,
      name: isCrossbow ? 'Steel Crossbow' : 'Valley Hunter Bow',
      nameAr: isCrossbow ? 'قوس نشاب فولاذي' : 'قوس صيّاد الوادي',
      kind: isCrossbow ? 'crossbow' : 'bow',
      damage: isCrossbow ? 46 : 32,
      critChance: isCrossbow ? 0.28 : 0.24,
      critMultiplier: 1.65,
      cooldown: isCrossbow ? 0.72 : 0.45,
      hitDelay: 0,
      swingDuration: 0.24,
      range: isCrossbow ? 58 : 52,
      arcAngleRad: 0.32,
      knockback: isCrossbow ? 5.2 : 3.8,
      staminaCost: isCrossbow ? 5 : 4,
      attackAnim: 'bow_shot',
      damageType: 'pierce',
      isRanged: true,
      projectileSpeed: isCrossbow ? 56 : 45,
      chargeDuration,
    });
    this.variantId = variantId;
    this.chargeConfig = isCrossbow
      ? {
          minChargeTime: 0.2,
          chargeDuration,
          minArrowSpeed: 22,
          maxArrowSpeed: 56,
          minDamage: 16,
          maxDamage: 66,
          gravity: 6.2,
          headshotMultiplier: 2.0,
          maxRange: 58,
          stickDuration: 4.5,
        }
      : {
          minChargeTime: 0.2,
          chargeDuration,
          minArrowSpeed: 15,
          maxArrowSpeed: 45,
          minDamage: 10,
          maxDamage: 50,
          gravity: 9.8,
          headshotMultiplier: 2.0,
          maxRange: 52,
          stickDuration: 4.5,
        };
  }

  public getChargeConfig(): BowChargeConfig {
    return this.chargeConfig;
  }

  public computeShotParameters(chargeFactor: number): BowShotParameters {
    const clamped = Math.max(0, Math.min(1, chargeFactor));
    const speed =
      this.chargeConfig.minArrowSpeed +
      clamped * (this.chargeConfig.maxArrowSpeed - this.chargeConfig.minArrowSpeed);
    const damage = Math.round(
      this.chargeConfig.minDamage +
        clamped * (this.chargeConfig.maxDamage - this.chargeConfig.minDamage),
    );
    const damageMultiplier = damage / Math.max(1, this.stats.damage);
    const life = 1.6 + clamped * 2.4;
    return {
      chargeFactor: clamped,
      speed,
      damage,
      damageMultiplier,
      gravity: this.chargeConfig.gravity,
      life,
    };
  }

  protected buildViewMesh(): THREE.Group {
    const group = new THREE.Group();
    const rigPivot = new THREE.Group();
    this.bowRigPivot = rigPivot;
    group.add(rigPivot);

    const woodMat = new THREE.MeshStandardMaterial({
      color: this.variantId === 'crossbow' ? 0x5c3c24 : 0x7c502c,
      roughness: 0.72,
      metalness: 0.04,
    });
    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x3b281c,
      roughness: 0.82,
      metalness: 0.02,
    });
    const stringMat = new THREE.MeshStandardMaterial({
      color: 0xe6dfd0,
      roughness: 0.9,
      metalness: 0.0,
    });
    const shaftMat = new THREE.MeshStandardMaterial({
      color: 0x8b6238,
      roughness: 0.78,
      metalness: 0.05,
    });
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xd0dae2,
      roughness: 0.25,
      metalness: 0.86,
    });
    const fletchMat = new THREE.MeshStandardMaterial({
      color: this.variantId === 'crossbow' ? 0x4ca6df : 0xd64a3a,
      roughness: 0.85,
      metalness: 0.02,
    });

    // Nocked arrow shown only while drawing/aiming
    const nockedArrow = new THREE.Group();
    const arrowShaftGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.62, 5);
    arrowShaftGeo.rotateX(Math.PI * 0.5);
    const arrowTipGeo = new THREE.ConeGeometry(0.028, 0.1, 5);
    arrowTipGeo.rotateX(Math.PI * 0.5);
    const arrowFletchGeo = new THREE.BoxGeometry(0.075, 0.01, 0.12);

    const nShaft = new THREE.Mesh(arrowShaftGeo, shaftMat);
    const nTip = new THREE.Mesh(arrowTipGeo, headMat);
    nTip.position.z = 0.35;
    const nFletch = new THREE.Mesh(arrowFletchGeo, fletchMat);
    nFletch.position.z = -0.25;
    nockedArrow.add(nShaft, nTip, nFletch);
    nockedArrow.visible = false;
    this.nockedArrowGroup = nockedArrow;

    const nockAnchor = new THREE.Object3D();
    nockAnchor.position.set(0, 0, 0.42);
    this.nockAnchorObj = nockAnchor;
    rigPivot.add(nockAnchor);

    // Unit-length string segment centered at pivot so scale.y sets exact length
    const unitStringGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 1.0, 5);

    if (this.variantId === 'crossbow') {
      const steelMat = new THREE.MeshStandardMaterial({
        color: 0x9aa6b4,
        roughness: 0.3,
        metalness: 0.84,
      });
      const stockGeo = new THREE.BoxGeometry(0.06, 0.08, 0.62);
      const stock = new THREE.Mesh(stockGeo, woodMat);
      stock.position.set(0, 0, 0.22);
      stock.castShadow = true;

      const prodGeo = new THREE.BoxGeometry(0.58, 0.035, 0.045);
      const prod = new THREE.Mesh(prodGeo, steelMat);
      prod.position.set(0, 0.02, 0.48);
      this.bowStaveMesh = prod;

      const upperStr = new THREE.Mesh(unitStringGeo, stringMat);
      upperStr.rotation.z = Math.PI * 0.5;
      const lowerStr = new THREE.Mesh(unitStringGeo, stringMat);
      lowerStr.rotation.z = Math.PI * 0.5;
      this.upperStringMesh = upperStr;
      this.lowerStringMesh = lowerStr;

      nockedArrow.position.set(0, 0.05, 0.34);
      nockAnchor.position.set(0, 0.04, 0.56);

      rigPivot.add(stock, prod, upperStr, lowerStr, nockedArrow);
      this.disposables.push(
        woodMat,
        gripMat,
        stringMat,
        shaftMat,
        headMat,
        fletchMat,
        steelMat,
        stockGeo,
        prodGeo,
        unitStringGeo,
        arrowShaftGeo,
        arrowTipGeo,
        arrowFletchGeo,
      );
      this.updateBowStrings(0);
      return group;
    }

    // Curved hunter bow stave
    const bowArcGeo = new THREE.TorusGeometry(0.46, 0.024, 6, 16, Math.PI * 0.82);
    const bowStave = new THREE.Mesh(bowArcGeo, woodMat);
    bowStave.rotation.y = Math.PI * 0.5;
    bowStave.rotation.z = -Math.PI * 0.41;
    bowStave.position.set(0, 0, 0.08);
    bowStave.castShadow = true;
    this.bowStaveMesh = bowStave;

    const gripGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.16, 7);
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.set(0, 0, 0.24);

    const upperStr = new THREE.Mesh(unitStringGeo, stringMat);
    const lowerStr = new THREE.Mesh(unitStringGeo, stringMat);
    this.upperStringMesh = upperStr;
    this.lowerStringMesh = lowerStr;

    nockedArrow.position.set(0, 0, 0.26);
    nockAnchor.position.set(0, 0, 0.48);

    rigPivot.add(bowStave, grip, upperStr, lowerStr, nockedArrow);
    this.disposables.push(
      woodMat,
      gripMat,
      stringMat,
      shaftMat,
      headMat,
      fletchMat,
      bowArcGeo,
      gripGeo,
      unitStringGeo,
      arrowShaftGeo,
      arrowTipGeo,
      arrowFletchGeo,
    );
    this.updateBowStrings(0);
    return group;
  }

  private updateBowStrings(pull: number): void {
    const clampedPull = Math.max(0, Math.min(1, pull));
    const upper = this.upperStringMesh;
    const lower = this.lowerStringMesh;
    if (!upper || !lower) return;

    if (this.variantId === 'crossbow') {
      const tipX = 0.28;
      const tipZ = 0.48 - clampedPull * 0.03;
      const nockZ = 0.34 - clampedPull * 0.19;
      const dz = tipZ - nockZ;
      const halfLen = Math.hypot(tipX, dz);
      const yawAngle = Math.atan2(dz, tipX);

      // Rotate left/right string arms in XZ plane
      upper.rotation.set(0, -yawAngle, Math.PI * 0.5);
      upper.position.set(tipX * 0.5, 0.025, (tipZ + nockZ) * 0.5);
      upper.scale.set(1, halfLen, 1);

      lower.rotation.set(0, yawAngle, Math.PI * 0.5);
      lower.position.set(-tipX * 0.5, 0.025, (tipZ + nockZ) * 0.5);
      lower.scale.set(1, halfLen, 1);

      if (this.bowStaveMesh) {
        this.bowStaveMesh.scale.set(1 - clampedPull * 0.04, 1, 1 + clampedPull * 0.2);
      }
      if (this.nockedArrowGroup) {
        this.nockedArrowGroup.position.set(0, 0.045, nockZ + 0.26);
      }
      return;
    }

    // Standard bow: tips at y = +/- 0.42, z = 0.06..0.02
    const tipY = 0.42 - clampedPull * 0.025;
    const tipZ = 0.06 - clampedPull * 0.05;
    const nockZ = 0.06 - clampedPull * 0.27;
    const dz = tipZ - nockZ;
    const halfLen = Math.hypot(tipY, dz);
    const tiltX = Math.atan2(dz, tipY);

    upper.rotation.set(-tiltX, 0, 0);
    upper.position.set(0, tipY * 0.5, (tipZ + nockZ) * 0.5);
    upper.scale.set(1, halfLen, 1);

    lower.rotation.set(tiltX, 0, 0);
    lower.position.set(0, -tipY * 0.5, (tipZ + nockZ) * 0.5);
    lower.scale.set(1, halfLen, 1);

    if (this.bowStaveMesh) {
      this.bowStaveMesh.scale.set(1, 1 - clampedPull * 0.04, 1 + clampedPull * 0.14);
    }
    if (this.nockedArrowGroup) {
      this.nockedArrowGroup.position.set(0, 0.02, nockZ + 0.3);
    }
  }

  public setDrawState(active: boolean, chargeFactor: number): void {
    const pull = active ? 0.12 + 0.88 * Math.max(0, Math.min(1, chargeFactor)) : 0;
    if (this.bowRigPivot) {
      // Align bow upright in world space when right arm raises to -1.52 rad
      this.bowRigPivot.rotation.x = active ? Math.PI * 0.48 : 0;
    }
    if (this.nockedArrowGroup) {
      this.nockedArrowGroup.visible = active;
    }
    this.updateBowStrings(pull);
  }

  public getNockWorldPosition(out: THREE.Vector3): boolean {
    if (!this.viewMesh || !this.nockAnchorObj || !this.viewMesh.parent) {
      return false;
    }
    this.viewMesh.updateWorldMatrix(true, false);
    this.nockAnchorObj.getWorldPosition(out);
    return true;
  }

  private ensureTrajectoryPreview(scene: THREE.Scene): void {
    if (this.trajectoryLine) return;

    this.trajectoryPositions = new Float32Array(TRAJECTORY_POINT_COUNT * 3);
    this.trajectoryGeo = new THREE.BufferGeometry();
    this.trajectoryGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.trajectoryPositions, 3),
    );
    this.trajectoryGeo.setDrawRange(0, 0);

    this.trajectoryMat = new THREE.LineBasicMaterial({
      color: 0xa6f4c5,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    this.trajectoryLine = new THREE.Line(this.trajectoryGeo, this.trajectoryMat);
    this.trajectoryLine.frustumCulled = false;
    this.trajectoryLine.visible = false;
    this.trajectoryLine.renderOrder = 4;
    scene.add(this.trajectoryLine);

    this.trajectoryImpactGeo = new THREE.RingGeometry(0.11, 0.22, 16);
    this.trajectoryImpactGeo.rotateX(-Math.PI / 2);
    this.trajectoryImpactMat = new THREE.MeshBasicMaterial({
      color: 0xe5a93c,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
    this.trajectoryImpactRing = new THREE.Mesh(
      this.trajectoryImpactGeo,
      this.trajectoryImpactMat,
    );
    this.trajectoryImpactRing.visible = false;
    this.trajectoryImpactRing.renderOrder = 4;
    scene.add(this.trajectoryImpactRing);
  }

  public updateTrajectoryPreview(
    scene: THREE.Scene,
    launchOrigin: THREE.Vector3,
    initialVel: THREE.Vector3,
    gravity: number,
    chargeFactor: number,
    queryCollidersNear: ((x: number, z: number) => WorldCollider[]) | undefined,
    visible: boolean,
  ): void {
    if (!visible) {
      this.hideTrajectoryPreview();
      return;
    }

    this.ensureTrajectoryPreview(scene);
    if (
      !this.trajectoryLine ||
      !this.trajectoryGeo ||
      !this.trajectoryPositions ||
      !this.trajectoryMat ||
      !this.trajectoryImpactRing ||
      !this.trajectoryImpactMat
    ) {
      return;
    }

    const clampedCharge = Math.max(0, Math.min(1, chargeFactor));
    const maxSegments = Math.max(
      7,
      Math.min(TRAJECTORY_POINT_COUNT - 1, Math.round(7 + clampedCharge * 18)),
    );

    _simPos.copy(launchOrigin);
    _simVel.copy(initialVel);

    this.trajectoryPositions[0] = _simPos.x;
    this.trajectoryPositions[1] = _simPos.y;
    this.trajectoryPositions[2] = _simPos.z;
    let pointCount = 1;
    let hitFound = false;

    for (let step = 0; step < maxSegments; step++) {
      _simPrev.copy(_simPos);
      _simVel.y -= gravity * TRAJECTORY_STEP_DT;
      _simPos.addScaledVector(_simVel, TRAJECTORY_STEP_DT);

      // Check terrain/water intersection along step
      const groundY = Math.max(WATER_LEVEL, groundHeightAt(_simPos.x, _simPos.z));
      let endT = 1.0;

      if (_simPos.y <= groundY && _simPrev.y >= groundY - 0.5) {
        const denom = _simPrev.y - _simPos.y;
        const frac = denom > 0.0001 ? Math.max(0, Math.min(1, (_simPrev.y - groundY) / denom)) : 1;
        endT = frac;
        hitFound = true;
      }

      if (queryCollidersNear) {
        const colliders = queryCollidersNear(_simPos.x, _simPos.z);
        const colT = BowWeapon.intersectSegmentColliders(
          _simPrev,
          _simPos,
          colliders,
          0.06,
          _hitPosScratch,
        );
        if (colT !== null && colT < endT) {
          endT = colT;
          hitFound = true;
        }
      }

      if (hitFound) {
        const hx = _simPrev.x + (_simPos.x - _simPrev.x) * endT;
        const hy = _simPrev.y + (_simPos.y - _simPrev.y) * endT;
        const hz = _simPrev.z + (_simPos.z - _simPrev.z) * endT;
        const base = pointCount * 3;
        this.trajectoryPositions[base] = hx;
        this.trajectoryPositions[base + 1] = hy;
        this.trajectoryPositions[base + 2] = hz;
        pointCount++;
        this.trajectoryImpactRing.position.set(hx, hy + 0.04, hz);
        break;
      }

      const base = pointCount * 3;
      this.trajectoryPositions[base] = _simPos.x;
      this.trajectoryPositions[base + 1] = _simPos.y;
      this.trajectoryPositions[base + 2] = _simPos.z;
      pointCount++;
    }

    const posAttr = this.trajectoryGeo.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    this.trajectoryGeo.setDrawRange(0, pointCount);
    this.trajectoryGeo.computeBoundingSphere();

    // Smooth tint from light mint -> warm gold at full charge
    if (clampedCharge >= 0.995) {
      this.trajectoryMat.color.setHex(0xf6d37a);
      this.trajectoryMat.opacity = 0.88;
      this.trajectoryImpactMat.color.setHex(0xf6d37a);
    } else {
      this.trajectoryMat.color.setHex(0x98f0bb);
      this.trajectoryMat.opacity = 0.55 + clampedCharge * 0.25;
      this.trajectoryImpactMat.color.setHex(0x98f0bb);
    }

    this.trajectoryLine.visible = pointCount >= 2;
    this.trajectoryImpactRing.visible = hitFound;
  }

  public hideTrajectoryPreview(): void {
    if (this.trajectoryLine) {
      this.trajectoryLine.visible = false;
    }
    if (this.trajectoryImpactRing) {
      this.trajectoryImpactRing.visible = false;
    }
  }

  private ensureArrowPool(scene: THREE.Scene): void {
    if (this.arrowPoolInitialized) return;
    this.arrowPoolInitialized = true;

    const shaftMat = new THREE.MeshStandardMaterial({
      color: 0x8b6238,
      roughness: 0.78,
      metalness: 0.05,
    });
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xd0dae2,
      roughness: 0.25,
      metalness: 0.86,
    });
    const fletchMat = new THREE.MeshStandardMaterial({
      color: this.variantId === 'crossbow' ? 0x4ca6df : 0xd64a3a,
      roughness: 0.85,
      metalness: 0.02,
    });

    const shaftGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.68, 5);
    shaftGeo.rotateX(Math.PI * 0.5);
    const tipGeo = new THREE.ConeGeometry(0.034, 0.12, 5);
    tipGeo.rotateX(Math.PI * 0.5);
    const fletchGeo = new THREE.BoxGeometry(0.09, 0.012, 0.14);

    this.arrowGeoDisposables.push(
      shaftMat,
      headMat,
      fletchMat,
      shaftGeo,
      tipGeo,
      fletchGeo,
    );

    for (let i = 0; i < ARROW_POOL_SIZE; i++) {
      const mesh = new THREE.Group();
      const shaft = new THREE.Mesh(shaftGeo, shaftMat);
      const tip = new THREE.Mesh(tipGeo, headMat);
      tip.position.z = 0.39;
      const fletch = new THREE.Mesh(fletchGeo, fletchMat);
      fletch.position.z = -0.28;
      mesh.add(shaft, tip, fletch);
      mesh.rotation.order = 'YXZ';
      mesh.visible = false;
      scene.add(mesh);

      this.arrows.push({
        networkArrowId: '',
        resolvedOnServer: false,
        mesh,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        gravity: this.chargeConfig.gravity,
        life: 0,
        active: false,
        stuck: false,
        stuckTimer: 0,
        damageMultiplier: 1,
      });
    }
  }

  public executeHit(ctx: WeaponAttackContext): void {
    this.ensureArrowPool(ctx.scene);
    this.hideTrajectoryPreview();

    let slot: ArrowProjectile | null = null;
    for (let i = 0; i < this.arrows.length; i++) {
      if (!this.arrows[i].active) {
        slot = this.arrows[i];
        break;
      }
    }
    if (!slot) {
      // Prefer replacing an already-stuck arrow before stealing a flying one
      for (let i = 0; i < this.arrows.length; i++) {
        if (this.arrows[i].stuck) {
          slot = this.arrows[i];
          break;
        }
      }
      if (!slot) {
        slot = this.arrows[0];
      }
    }

    const fwdX = Math.sin(ctx.yaw);
    const fwdZ = Math.cos(ctx.yaw);

    // Spawn at bow nock position if provided, otherwise fall back to shoulder bow position
    if (ctx.bowLaunchOrigin) {
      slot.pos.copy(ctx.bowLaunchOrigin);
    } else if (this.getNockWorldPosition(_nockLocal)) {
      slot.pos.copy(_nockLocal);
    } else {
      slot.pos.set(ctx.origin.x + fwdX * 0.58, ctx.origin.y + 1.36, ctx.origin.z + fwdZ * 0.58);
    }

    let dirX = fwdX;
    let dirY = 0.02;
    let dirZ = fwdZ;

    if (ctx.aimTargetPoint) {
      const dx = ctx.aimTargetPoint.x - slot.pos.x;
      const dy = ctx.aimTargetPoint.y - slot.pos.y;
      const dz = ctx.aimTargetPoint.z - slot.pos.z;
      const len = Math.hypot(dx, dy, dz);
      if (len > 0.15) {
        dirX = dx / len;
        dirY = dy / len;
        dirZ = dz / len;
      }
    } else {
      // Fallback aim-assist toward nearest target in front
      let bestTargetDistSq = this.stats.range * this.stats.range;
      for (let i = 0; i < ctx.enemies.length; i++) {
        const e = ctx.enemies[i];
        if (!e.health.isAlive()) continue;
        const dx = e.position.x - slot.pos.x;
        const dz = e.position.z - slot.pos.z;
        const dSq = dx * dx + dz * dz;
        if (dSq > bestTargetDistSq || dSq < 0.25) continue;
        const d = Math.sqrt(dSq);
        const dot = (dx / d) * fwdX + (dz / d) * fwdZ;
        if (dot > 0.88) {
          bestTargetDistSq = dSq;
          const dy = e.position.y + e.hitHeight * 0.62 - slot.pos.y;
          const len = Math.hypot(dx, dy, dz) || 1;
          dirX = dx / len;
          dirY = dy / len;
          dirZ = dz / len;
        }
      }
      if (ctx.wildlife) {
        _bowFwdDir.set(fwdX, 0, fwdZ);
        const animals = ctx.wildlife.findAnimalsInStrikeArc(
          ctx.origin,
          _bowFwdDir,
          this.stats.range,
          0.88,
        );
        for (let i = 0; i < animals.length; i++) {
          const a = animals[i].animal;
          const dx = a.position.x - slot.pos.x;
          const dz = a.position.z - slot.pos.z;
          const dSq = dx * dx + dz * dz;
          if (dSq < bestTargetDistSq && dSq > 0.5) {
            bestTargetDistSq = dSq;
            const dy = a.position.y + 0.55 - slot.pos.y;
            const len = Math.hypot(dx, dy, dz) || 1;
            dirX = dx / len;
            dirY = dy / len;
            dirZ = dz / len;
          }
        }
      }
    }

    const shot = this.computeShotParameters(ctx.bowChargeFactor ?? 1);
    slot.networkArrowId = `arr_${++this.nextArrowSeq}_${Date.now().toString(36)}`;
    slot.resolvedOnServer = false;
    slot.vel.set(dirX * shot.speed, dirY * shot.speed, dirZ * shot.speed);
    slot.gravity = shot.gravity;
    slot.life = shot.life;
    slot.damageMultiplier = shot.damageMultiplier;
    slot.stuck = false;
    slot.stuckTimer = 0;
    slot.active = true;

    slot.mesh.position.copy(slot.pos);
    slot.mesh.rotation.order = 'YXZ';
    slot.mesh.rotation.y = Math.atan2(slot.vel.x, slot.vel.z);
    slot.mesh.rotation.x = -Math.atan2(
      slot.vel.y,
      Math.hypot(slot.vel.x, slot.vel.z),
    );
    slot.mesh.visible = true;

    if (ctx.multiplayerAuthoritative) {
      ctx.onMultiplayerArrowFired?.({
        arrowId: slot.networkArrowId,
        weaponId: this.stats.id,
        originX: slot.pos.x,
        originY: slot.pos.y,
        originZ: slot.pos.z,
        dirX,
        dirY,
        dirZ,
        bowCharge: shot.chargeFactor,
      });
    }
  }

  public override update(dt: number, ctx: WeaponAttackContext): void {
    if (!this.arrowPoolInitialized) return;

    for (let i = 0; i < this.arrows.length; i++) {
      const arrow = this.arrows[i];
      if (!arrow.active) continue;

      if (arrow.stuck) {
        arrow.stuckTimer -= dt;
        if (arrow.stuckTimer <= 0) {
          arrow.active = false;
          arrow.stuck = false;
          arrow.mesh.visible = false;
        }
        continue;
      }

      arrow.life -= dt;
      if (arrow.life <= 0) {
        if (ctx.multiplayerAuthoritative && !arrow.resolvedOnServer) {
          arrow.resolvedOnServer = true;
          ctx.onMultiplayerProjectileHit?.({
            arrowId: arrow.networkArrowId,
            targetKind: 'world',
            targetId: '',
            x: arrow.pos.x,
            y: arrow.pos.y,
            z: arrow.pos.z,
            isHeadshot: false,
          });
        }
        arrow.active = false;
        arrow.mesh.visible = false;
        continue;
      }

      // Apply gravity and advance projectile
      _prevArrowPos.copy(arrow.pos);
      arrow.vel.y -= arrow.gravity * dt;
      arrow.pos.addScaledVector(arrow.vel, dt);
      arrow.mesh.position.copy(arrow.pos);
      arrow.mesh.rotation.y = Math.atan2(arrow.vel.x, arrow.vel.z);
      arrow.mesh.rotation.x = -Math.atan2(
        arrow.vel.y,
        Math.hypot(arrow.vel.x, arrow.vel.z),
      );

      // 1. Swept Enemy Check
      const enemyHit = this.rayTestEnemies(_prevArrowPos, arrow.pos, ctx.enemies);
      if (enemyHit) {
        const { enemy, isHeadshot, hitY } = enemyHit;
        if (ctx.multiplayerAuthoritative) {
          arrow.resolvedOnServer = true;
          ctx.spawnHitSparks(enemy.position.x, hitY, enemy.position.z, isHeadshot ? 12 : 6);
          if (isHeadshot) {
            ctx.onHeadshotHit?.('enemy', enemy.position.x, hitY, enemy.position.z);
          }
          ctx.onPlayerWeaponHit?.(1);
          ctx.onMultiplayerProjectileHit?.({
            arrowId: arrow.networkArrowId,
            targetKind: 'enemy',
            targetId: enemy.id,
            archetype: enemy.archetype.id,
            x: enemy.position.x,
            y: hitY,
            z: enemy.position.z,
            isHeadshot,
          });
          arrow.active = false;
          arrow.mesh.visible = false;
          continue;
        }

        const isCrit = isHeadshot || Math.random() < this.stats.critChance;
        const scaledBase = this.stats.damage * arrow.damageMultiplier;
        const mult = isHeadshot
          ? this.chargeConfig.headshotMultiplier
          : isCrit
            ? this.stats.critMultiplier
            : 1;
        const amount = Math.max(1, Math.round(scaledBase * mult));
        const packet = ctx.damageSystem.createPacket({
          amount,
          damageType: this.stats.damageType,
          sourceId: `player:${this.stats.id}`,
          sourcePosition: ctx.origin,
          knockback:
            this.stats.knockback *
            (0.7 + 0.35 * arrow.damageMultiplier) *
            (isHeadshot ? 1.35 : 1),
          isCrit,
        });
        const result = ctx.damageSystem.applyDamage(enemy, packet);
        if (result.applied) {
          ctx.spawnHitSparks(enemy.position.x, hitY, enemy.position.z, isHeadshot ? 12 : isCrit ? 8 : 5);
          if (isHeadshot) {
            ctx.onHeadshotHit?.('enemy', enemy.position.x, hitY, enemy.position.z);
          }
          ctx.onEnemyHit?.(enemy, result);
          ctx.onPlayerWeaponHit?.(1);
        }
        arrow.active = false;
        arrow.mesh.visible = false;
        continue;
      }

      // 2. Swept Wildlife Check
      if (ctx.wildlife) {
        const hitAnimal = ctx.wildlife.rayTestProjectile(_prevArrowPos, arrow.pos, 0.45);
        if (hitAnimal) {
          const headY =
            hitAnimal.position.y +
            hitAnimal.altitude +
            hitAnimal.traits.bodyRadius * 1.15;
          const isHeadshot =
            hitAnimal.traits.bodyRadius >= 0.42 &&
            arrow.pos.y >= headY;
          if (ctx.multiplayerAuthoritative) {
            arrow.resolvedOnServer = true;
            ctx.spawnHitSparks(
              arrow.pos.x,
              arrow.pos.y,
              arrow.pos.z,
              isHeadshot ? 10 : 5,
            );
            if (isHeadshot) {
              ctx.onHeadshotHit?.('animal', arrow.pos.x, arrow.pos.y, arrow.pos.z);
            }
            ctx.onPlayerWeaponHit?.(1);
            ctx.onMultiplayerProjectileHit?.({
              arrowId: arrow.networkArrowId,
              targetKind: 'animal',
              targetId: hitAnimal.id,
              archetype: hitAnimal.species,
              x: arrow.pos.x,
              y: arrow.pos.y,
              z: arrow.pos.z,
              isHeadshot,
            });
            arrow.active = false;
            arrow.mesh.visible = false;
            continue;
          }

          const isCrit = isHeadshot || Math.random() < this.stats.critChance;
          const scaledBase = this.stats.damage * arrow.damageMultiplier;
          const mult = isHeadshot
            ? this.chargeConfig.headshotMultiplier
            : isCrit
              ? this.stats.critMultiplier
              : 1;
          const amount = Math.max(1, Math.round(scaledBase * mult));
          const res = ctx.wildlife.damageAnimal(
            hitAnimal.id,
            amount,
            ctx.origin.x,
            ctx.origin.z,
          );
          if (res.hit) {
            ctx.spawnHitSparks(
              arrow.pos.x,
              arrow.pos.y,
              arrow.pos.z,
              isHeadshot ? 10 : isCrit ? 7 : 4,
            );
            if (isHeadshot) {
              ctx.onHeadshotHit?.('animal', arrow.pos.x, arrow.pos.y, arrow.pos.z);
            }
            ctx.onPlayerWeaponHit?.(1);
          }
          arrow.active = false;
          arrow.mesh.visible = false;
          continue;
        }
      }

      // 3. Swept NPC Check
      if (ctx.npcRayTest) {
        const npcHit = ctx.npcRayTest(_prevArrowPos, arrow.pos, 0.18);
        if (npcHit) {
          ctx.spawnHitSparks(npcHit.hitPoint.x, npcHit.hitPoint.y, npcHit.hitPoint.z, 4);
          if (ctx.multiplayerAuthoritative) {
            arrow.resolvedOnServer = true;
            ctx.onMultiplayerProjectileHit?.({
              arrowId: arrow.networkArrowId,
              targetKind: 'npc',
              targetId: npcHit.id,
              archetype: npcHit.role ?? 'default',
              x: npcHit.hitPoint.x,
              y: npcHit.hitPoint.y,
              z: npcHit.hitPoint.z,
              isHeadshot: npcHit.isHeadshot,
            });
          }
          ctx.onNpcHit?.(npcHit.id, npcHit.hitPoint, npcHit.isHeadshot);
          arrow.active = false;
          arrow.mesh.visible = false;
          continue;
        }
      }

      // 4. Swept World Colliders (trees, rocks, buildings) -> stick arrow in surface
      if (ctx.queryCollidersNear) {
        const midX = (_prevArrowPos.x + arrow.pos.x) * 0.5;
        const midZ = (_prevArrowPos.z + arrow.pos.z) * 0.5;
        const colliders = ctx.queryCollidersNear(midX, midZ);
        const colT = BowWeapon.intersectSegmentColliders(
          _prevArrowPos,
          arrow.pos,
          colliders,
          0.06,
          _hitPosScratch,
        );
        if (colT !== null) {
          arrow.pos.copy(_hitPosScratch);
          arrow.mesh.position.copy(arrow.pos);
          arrow.stuck = true;
          arrow.stuckTimer = this.chargeConfig.stickDuration;
          ctx.spawnHitSparks(arrow.pos.x, arrow.pos.y, arrow.pos.z, 3);
          ctx.onArrowStick?.(arrow.pos.x, arrow.pos.y, arrow.pos.z);
          if (ctx.multiplayerAuthoritative && !arrow.resolvedOnServer) {
            arrow.resolvedOnServer = true;
            ctx.onMultiplayerProjectileHit?.({
              arrowId: arrow.networkArrowId,
              targetKind: 'world',
              targetId: '',
              x: arrow.pos.x,
              y: arrow.pos.y,
              z: arrow.pos.z,
              isHeadshot: false,
            });
          }
          continue;
        }
      }

      // 5. Swept Terrain / Water Check -> stick in dry ground or splash in water
      const terrainY = groundHeightAt(arrow.pos.x, arrow.pos.z);
      const surfaceY = Math.max(WATER_LEVEL, terrainY);
      if (arrow.pos.y <= surfaceY) {
        const inWater = terrainY < WATER_LEVEL - 0.05;
        const denom = _prevArrowPos.y - arrow.pos.y;
        const t =
          denom > 0.0001
            ? Math.max(0, Math.min(1, (_prevArrowPos.y - surfaceY) / denom))
            : 1;
        const hx = _prevArrowPos.x + (arrow.pos.x - _prevArrowPos.x) * t;
        const hz = _prevArrowPos.z + (arrow.pos.z - _prevArrowPos.z) * t;

        if (inWater) {
          arrow.active = false;
          arrow.mesh.visible = false;
          ctx.spawnHitSparks(hx, WATER_LEVEL + 0.06, hz, 4);
        } else {
          arrow.pos.set(hx, surfaceY + 0.04, hz);
          arrow.mesh.position.copy(arrow.pos);
          arrow.stuck = true;
          arrow.stuckTimer = this.chargeConfig.stickDuration;
          ctx.spawnHitSparks(hx, surfaceY + 0.08, hz, 3);
          ctx.onArrowStick?.(hx, surfaceY + 0.08, hz);
        }

        if (ctx.multiplayerAuthoritative && !arrow.resolvedOnServer) {
          arrow.resolvedOnServer = true;
          ctx.onMultiplayerProjectileHit?.({
            arrowId: arrow.networkArrowId,
            targetKind: 'world',
            targetId: '',
            x: hx,
            y: surfaceY + 0.04,
            z: hz,
            isHeadshot: false,
          });
        }
      }
    }
  }

  private rayTestEnemies(
    prevPos: THREE.Vector3,
    nextPos: THREE.Vector3,
    enemies: EnemyController[],
  ): { enemy: EnemyController; isHeadshot: boolean; hitY: number } | null {
    const segX = nextPos.x - prevPos.x;
    const segY = nextPos.y - prevPos.y;
    const segZ = nextPos.z - prevPos.z;
    const hLenSq = segX * segX + segZ * segZ;

    let bestEnemy: EnemyController | null = null;
    let bestT = Infinity;
    let bestHitY = 0;
    let bestHeadshot = false;

    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (!enemy.health.isAlive()) continue;

      const rad = enemy.hitRadius + 0.24;
      const t =
        hLenSq > 0.00001
          ? Math.max(
              0,
              Math.min(
                1,
                ((enemy.position.x - prevPos.x) * segX +
                  (enemy.position.z - prevPos.z) * segZ) /
                  hLenSq,
              ),
            )
          : 0.5;
      const px = prevPos.x + segX * t;
      const py = prevPos.y + segY * t;
      const pz = prevPos.z + segZ * t;
      const dx = px - enemy.position.x;
      const dz = pz - enemy.position.z;

      if (
        dx * dx + dz * dz <= rad * rad &&
        py >= enemy.position.y - 0.08 &&
        py <= enemy.position.y + enemy.hitHeight + 0.25
      ) {
        if (t < bestT) {
          bestT = t;
          bestEnemy = enemy;
          bestHitY = py;
          bestHeadshot = py >= enemy.position.y + enemy.hitHeight * 0.72;
        }
      }
    }

    if (!bestEnemy) return null;
    return {
      enemy: bestEnemy,
      isHeadshot: bestHeadshot,
      hitY: bestHitY,
    };
  }

  public static intersectSegmentColliders(
    prevPos: THREE.Vector3,
    nextPos: THREE.Vector3,
    colliders: WorldCollider[],
    padding: number,
    outHit: THREE.Vector3,
  ): number | null {
    const segX = nextPos.x - prevPos.x;
    const segY = nextPos.y - prevPos.y;
    const segZ = nextPos.z - prevPos.z;
    const segLenSq = segX * segX + segY * segY + segZ * segZ;
    if (segLenSq < 0.00001) return null;

    let bestT = Infinity;

    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.kind === 'cylinder') {
        const rad = c.radius + padding;
        const hLenSq = segX * segX + segZ * segZ;
        const t =
          hLenSq > 0.00001
            ? Math.max(
                0,
                Math.min(
                  1,
                  ((c.x - prevPos.x) * segX + (c.z - prevPos.z) * segZ) / hLenSq,
                ),
              )
            : 0.5;
        const px = prevPos.x + segX * t;
        const py = prevPos.y + segY * t;
        const pz = prevPos.z + segZ * t;
        if (py < c.minY || py > c.maxY) continue;
        const dx = px - c.x;
        const dz = pz - c.z;
        if (dx * dx + dz * dz <= rad * rad && t < bestT) {
          bestT = t;
        }
      } else {
        const rad = c.radius + padding;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((c.x - prevPos.x) * segX +
              (c.y - prevPos.y) * segY +
              (c.z - prevPos.z) * segZ) /
              segLenSq,
          ),
        );
        const dx = prevPos.x + segX * t - c.x;
        const dy = prevPos.y + segY * t - c.y;
        const dz = prevPos.z + segZ * t - c.z;
        if (dx * dx + dy * dy + dz * dz <= rad * rad && t < bestT) {
          bestT = t;
        }
      }
    }

    if (!Number.isFinite(bestT)) return null;
    outHit.set(
      prevPos.x + segX * bestT,
      prevPos.y + segY * bestT,
      prevPos.z + segZ * bestT,
    );
    return bestT;
  }

  public override dispose(): void {
    for (let i = 0; i < this.arrows.length; i++) {
      this.arrows[i].mesh.removeFromParent();
    }
    this.arrows.length = 0;
    for (let i = 0; i < this.arrowGeoDisposables.length; i++) {
      this.arrowGeoDisposables[i].dispose();
    }
    this.arrowGeoDisposables.length = 0;

    if (this.trajectoryLine) {
      this.trajectoryLine.removeFromParent();
      this.trajectoryLine = null;
    }
    this.trajectoryGeo?.dispose();
    this.trajectoryGeo = null;
    this.trajectoryMat?.dispose();
    this.trajectoryMat = null;
    this.trajectoryPositions = null;

    if (this.trajectoryImpactRing) {
      this.trajectoryImpactRing.removeFromParent();
      this.trajectoryImpactRing = null;
    }
    this.trajectoryImpactGeo?.dispose();
    this.trajectoryImpactGeo = null;
    this.trajectoryImpactMat?.dispose();
    this.trajectoryImpactMat = null;

    super.dispose();
  }
}
