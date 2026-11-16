import * as THREE from 'three';
import type { EnemyArchetypeId, EnemyBehaviorState } from './combatTypes';

export interface EnemySharedAssets {
  shadowGeo: THREE.PlaneGeometry;
  shadowMat: THREE.MeshBasicMaterial;
  hpBgGeo: THREE.PlaneGeometry;
  hpBgMat: THREE.MeshBasicMaterial;
  hpFillGeo: THREE.PlaneGeometry;
  hpFillMat: THREE.MeshBasicMaterial;
  farLodBodyGeo: THREE.CylinderGeometry;

  // Bandit Scout shared geometries
  banditTorsoGeo: THREE.CylinderGeometry;
  banditCloakGeo: THREE.ConeGeometry;
  banditHeadGeo: THREE.SphereGeometry;
  banditHoodGeo: THREE.ConeGeometry;
  banditMaskGeo: THREE.BoxGeometry;
  banditArmGeo: THREE.CapsuleGeometry;
  banditHiltGeo: THREE.BoxGeometry;
  banditBladeGeo: THREE.BoxGeometry;
  banditLegGeo: THREE.CylinderGeometry;

  // Thorn Stalker shared geometries
  stalkerTorsoGeo: THREE.SphereGeometry;
  stalkerSpineGeo: THREE.ConeGeometry;
  stalkerHeadGeo: THREE.SphereGeometry;
  stalkerHornGeo: THREE.ConeGeometry;
  stalkerEyeGeo: THREE.SphereGeometry;
  stalkerArmGeo: THREE.CapsuleGeometry;
  stalkerClawGeo: THREE.ConeGeometry;
  stalkerLegGeo: THREE.CylinderGeometry;

  // Stone Sentinel shared geometries
  sentinelTorsoGeo: THREE.BoxGeometry;
  sentinelMossGeo: THREE.BoxGeometry;
  sentinelCoreGeo: THREE.OctahedronGeometry;
  sentinelHeadGeo: THREE.BoxGeometry;
  sentinelVisorGeo: THREE.BoxGeometry;
  sentinelArmGeo: THREE.BoxGeometry;
  sentinelLegGeo: THREE.BoxGeometry;

  leatherDarkMat: THREE.MeshStandardMaterial;
  banditCloakMat: THREE.MeshStandardMaterial;
  banditSkinMat: THREE.MeshStandardMaterial;
  ironMat: THREE.MeshStandardMaterial;

  stalkerHideMat: THREE.MeshStandardMaterial;
  stalkerBarkMat: THREE.MeshStandardMaterial;
  stalkerEyeMat: THREE.MeshStandardMaterial;

  stoneMat: THREE.MeshStandardMaterial;
  stoneMossMat: THREE.MeshStandardMaterial;
  runeGlowMat: THREE.MeshStandardMaterial;

  dispose: () => void;
}

export function createEnemySharedAssets(
  contactShadowMap: THREE.Texture,
): EnemySharedAssets {
  const shadowGeo = new THREE.PlaneGeometry(1.4, 1.4);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowMap,
    transparent: true,
    depthWrite: false,
    opacity: 0.45,
  });

  const hpBgGeo = new THREE.PlaneGeometry(1.12, 0.14);
  const hpBgMat = new THREE.MeshBasicMaterial({
    color: 0x111915,
    transparent: true,
    opacity: 0.84,
    depthTest: true,
  });

  // Pivot left-aligned so scale.x shrinks cleanly toward left edge
  const hpFillGeo = new THREE.PlaneGeometry(1.04, 0.085);
  hpFillGeo.translate(0.52, 0, 0);
  const hpFillMat = new THREE.MeshBasicMaterial({
    color: 0xe05246,
    depthTest: true,
  });

  const farLodBodyGeo = new THREE.CylinderGeometry(0.28, 0.34, 1.65, 6);
  farLodBodyGeo.translate(0, 0.825, 0);

  // Shared archetype geometries (instantiated once, shared across all 26+ enemies)
  const banditTorsoGeo = new THREE.CylinderGeometry(0.24, 0.27, 0.68, 10);
  const banditCloakGeo = new THREE.ConeGeometry(0.34, 0.45, 10);
  const banditHeadGeo = new THREE.SphereGeometry(0.19, 10, 8);
  const banditHoodGeo = new THREE.ConeGeometry(0.24, 0.34, 9);
  const banditMaskGeo = new THREE.BoxGeometry(0.24, 0.11, 0.12);
  const banditArmGeo = new THREE.CapsuleGeometry(0.068, 0.35, 4, 7);
  const banditHiltGeo = new THREE.BoxGeometry(0.14, 0.035, 0.04);
  const banditBladeGeo = new THREE.BoxGeometry(0.045, 0.04, 0.56);
  const banditLegGeo = new THREE.CylinderGeometry(0.09, 0.075, 0.62, 7);

  const stalkerTorsoGeo = new THREE.SphereGeometry(0.28, 9, 8);
  const stalkerSpineGeo = new THREE.ConeGeometry(0.14, 0.38, 6);
  const stalkerHeadGeo = new THREE.SphereGeometry(0.19, 9, 7);
  const stalkerHornGeo = new THREE.ConeGeometry(0.055, 0.24, 5);
  const stalkerEyeGeo = new THREE.SphereGeometry(0.035, 6, 5);
  const stalkerArmGeo = new THREE.CapsuleGeometry(0.06, 0.36, 4, 6);
  const stalkerClawGeo = new THREE.ConeGeometry(0.04, 0.18, 5);
  const stalkerLegGeo = new THREE.CylinderGeometry(0.08, 0.06, 0.52, 6);

  const sentinelTorsoGeo = new THREE.BoxGeometry(0.88, 0.96, 0.54);
  const sentinelMossGeo = new THREE.BoxGeometry(0.92, 0.18, 0.58);
  const sentinelCoreGeo = new THREE.OctahedronGeometry(0.16, 0);
  const sentinelHeadGeo = new THREE.BoxGeometry(0.42, 0.42, 0.4);
  const sentinelVisorGeo = new THREE.BoxGeometry(0.28, 0.07, 0.06);
  const sentinelArmGeo = new THREE.BoxGeometry(0.26, 0.88, 0.28);
  const sentinelLegGeo = new THREE.BoxGeometry(0.3, 0.86, 0.34);

  const leatherDarkMat = new THREE.MeshStandardMaterial({
    color: 0x3b2c25,
    roughness: 0.78,
    metalness: 0.06,
  });
  const banditCloakMat = new THREE.MeshStandardMaterial({
    color: 0x8b2f2b,
    roughness: 0.85,
    metalness: 0.03,
  });
  const banditSkinMat = new THREE.MeshStandardMaterial({
    color: 0xd8b090,
    roughness: 0.74,
    metalness: 0.0,
  });
  const ironMat = new THREE.MeshStandardMaterial({
    color: 0xaab4bd,
    roughness: 0.3,
    metalness: 0.85,
  });

  const stalkerHideMat = new THREE.MeshStandardMaterial({
    color: 0x3f5437,
    roughness: 0.86,
    metalness: 0.04,
  });
  const stalkerBarkMat = new THREE.MeshStandardMaterial({
    color: 0x5c4632,
    roughness: 0.9,
    metalness: 0.02,
  });
  const stalkerEyeMat = new THREE.MeshStandardMaterial({
    color: 0xffb83d,
    emissive: 0xff7b00,
    emissiveIntensity: 1.1,
    roughness: 0.25,
    metalness: 0.1,
  });

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x6b7075,
    roughness: 0.92,
    metalness: 0.06,
  });
  const stoneMossMat = new THREE.MeshStandardMaterial({
    color: 0x486942,
    roughness: 0.94,
    metalness: 0.02,
  });
  const runeGlowMat = new THREE.MeshStandardMaterial({
    color: 0x70e8ff,
    emissive: 0x2ec7ff,
    emissiveIntensity: 1.3,
    roughness: 0.25,
    metalness: 0.1,
  });

  const allGeos: THREE.BufferGeometry[] = [
    shadowGeo,
    hpBgGeo,
    hpFillGeo,
    farLodBodyGeo,
    banditTorsoGeo,
    banditCloakGeo,
    banditHeadGeo,
    banditHoodGeo,
    banditMaskGeo,
    banditArmGeo,
    banditHiltGeo,
    banditBladeGeo,
    banditLegGeo,
    stalkerTorsoGeo,
    stalkerSpineGeo,
    stalkerHeadGeo,
    stalkerHornGeo,
    stalkerEyeGeo,
    stalkerArmGeo,
    stalkerClawGeo,
    stalkerLegGeo,
    sentinelTorsoGeo,
    sentinelMossGeo,
    sentinelCoreGeo,
    sentinelHeadGeo,
    sentinelVisorGeo,
    sentinelArmGeo,
    sentinelLegGeo,
  ];

  const allMats: THREE.Material[] = [
    shadowMat,
    hpBgMat,
    hpFillMat,
    leatherDarkMat,
    banditCloakMat,
    banditSkinMat,
    ironMat,
    stalkerHideMat,
    stalkerBarkMat,
    stalkerEyeMat,
    stoneMat,
    stoneMossMat,
    runeGlowMat,
  ];

  return {
    shadowGeo,
    shadowMat,
    hpBgGeo,
    hpBgMat,
    hpFillGeo,
    hpFillMat,
    farLodBodyGeo,
    banditTorsoGeo,
    banditCloakGeo,
    banditHeadGeo,
    banditHoodGeo,
    banditMaskGeo,
    banditArmGeo,
    banditHiltGeo,
    banditBladeGeo,
    banditLegGeo,
    stalkerTorsoGeo,
    stalkerSpineGeo,
    stalkerHeadGeo,
    stalkerHornGeo,
    stalkerEyeGeo,
    stalkerArmGeo,
    stalkerClawGeo,
    stalkerLegGeo,
    sentinelTorsoGeo,
    sentinelMossGeo,
    sentinelCoreGeo,
    sentinelHeadGeo,
    sentinelVisorGeo,
    sentinelArmGeo,
    sentinelLegGeo,
    leatherDarkMat,
    banditCloakMat,
    banditSkinMat,
    ironMat,
    stalkerHideMat,
    stalkerBarkMat,
    stalkerEyeMat,
    stoneMat,
    stoneMossMat,
    runeGlowMat,
    dispose: () => {
      for (let i = 0; i < allGeos.length; i++) allGeos[i].dispose();
      for (let i = 0; i < allMats.length; i++) allMats[i].dispose();
    },
  };
}

/**
 * Articulated procedural 3D enemy rig with floating health bar, hit flash,
 * shared geometries, simplified far LOD proxy, patrol/chase locomotion,
 * telegraphed attack windup, and death collapse.
 */
export class EnemyRig {
  public readonly root = new THREE.Group();
  private readonly bodyPivot = new THREE.Group();
  private readonly headGroup = new THREE.Group();
  private readonly leftArmPivot = new THREE.Group();
  private readonly rightArmPivot = new THREE.Group();
  private readonly leftLegPivot = new THREE.Group();
  private readonly rightLegPivot = new THREE.Group();
  private readonly healthBarGroup = new THREE.Group();
  private readonly healthFillMesh: THREE.Mesh;
  private readonly shadowMesh: THREE.Mesh;
  private readonly farLodMesh: THREE.Mesh;

  private readonly shadowCasters: THREE.Mesh[] = [];
  private readonly archetype: EnemyArchetypeId;
  private readonly isSoftwareGl: boolean;

  private walkPhase = 0;
  private hitFlashTimer = 0;
  private barHeight = 2.25;
  private lastCastShadow: boolean;
  private isFarLod = false;

  constructor(
    archetype: EnemyArchetypeId,
    assets: EnemySharedAssets,
    isSoftwareGl: boolean,
  ) {
    this.archetype = archetype;
    this.isSoftwareGl = isSoftwareGl;
    const cast = !isSoftwareGl;
    this.lastCastShadow = cast;

    this.root.add(this.bodyPivot);
    this.shadowMesh = new THREE.Mesh(assets.shadowGeo, assets.shadowMat);
    this.shadowMesh.position.y = 0.03;
    this.root.add(this.shadowMesh);

    const lodMat =
      archetype === 'bandit_scout'
        ? assets.banditCloakMat
        : archetype === 'thorn_stalker'
          ? assets.stalkerHideMat
          : assets.stoneMat;
    this.farLodMesh = new THREE.Mesh(assets.farLodBodyGeo, lodMat);
    this.farLodMesh.visible = false;
    this.farLodMesh.castShadow = false;
    this.farLodMesh.receiveShadow = false;
    if (archetype === 'stone_sentinel') {
      this.farLodMesh.scale.set(1.55, 1.38, 1.3);
    } else if (archetype === 'thorn_stalker') {
      this.farLodMesh.scale.set(0.92, 0.88, 0.92);
    }
    this.root.add(this.farLodMesh);

    if (archetype === 'bandit_scout') {
      this.buildBanditScout(assets, cast);
      this.barHeight = 2.2;
    } else if (archetype === 'thorn_stalker') {
      this.buildThornStalker(assets, cast);
      this.barHeight = 1.95;
    } else {
      this.buildStoneSentinel(assets, cast);
      this.barHeight = 2.85;
    }

    this.bodyPivot.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && (obj as THREE.Mesh).castShadow) {
        this.shadowCasters.push(obj as THREE.Mesh);
      }
    });

    // World-space health bar
    this.healthBarGroup.position.set(0, this.barHeight, 0);
    const bg = new THREE.Mesh(assets.hpBgGeo, assets.hpBgMat);
    this.healthFillMesh = new THREE.Mesh(assets.hpFillGeo, assets.hpFillMat);
    this.healthFillMesh.position.set(-0.52, 0, 0.01);
    this.healthBarGroup.add(bg, this.healthFillMesh);
    this.healthBarGroup.visible = false;
    this.root.add(this.healthBarGroup);
  }

  public setLodDetail(isFar: boolean): void {
    if (this.isFarLod === isFar) return;
    this.isFarLod = isFar;
    this.bodyPivot.visible = !isFar;
    this.farLodMesh.visible = isFar;
  }

  public setShadowCasting(enabled: boolean): void {
    const next = !this.isSoftwareGl && enabled;
    if (this.lastCastShadow === next) return;
    this.lastCastShadow = next;
    for (let i = 0; i < this.shadowCasters.length; i++) {
      this.shadowCasters[i].castShadow = next;
    }
  }

  private buildBanditScout(assets: EnemySharedAssets, cast: boolean): void {
    const torso = new THREE.Mesh(assets.banditTorsoGeo, assets.leatherDarkMat);
    torso.position.y = 1.04;
    torso.castShadow = cast;

    const cloak = new THREE.Mesh(assets.banditCloakGeo, assets.banditCloakMat);
    cloak.position.y = 1.24;
    cloak.castShadow = cast;

    this.headGroup.position.set(0, 1.44, 0);
    const head = new THREE.Mesh(assets.banditHeadGeo, assets.banditSkinMat);
    head.position.y = 0.15;
    head.castShadow = cast;

    const hood = new THREE.Mesh(assets.banditHoodGeo, assets.banditCloakMat);
    hood.position.set(0, 0.26, -0.02);
    hood.rotation.x = -0.2;

    const mask = new THREE.Mesh(assets.banditMaskGeo, assets.leatherDarkMat);
    mask.position.set(0, 0.11, 0.14);
    this.headGroup.add(head, hood, mask);

    this.leftArmPivot.position.set(-0.31, 1.3, 0);
    const lArm = new THREE.Mesh(assets.banditArmGeo, assets.leatherDarkMat);
    lArm.position.y = -0.21;
    lArm.castShadow = cast;
    this.leftArmPivot.add(lArm);

    this.rightArmPivot.position.set(0.31, 1.3, 0);
    const rArm = new THREE.Mesh(assets.banditArmGeo, assets.leatherDarkMat);
    rArm.position.y = -0.21;
    rArm.castShadow = cast;

    // Iron Shortsword in right hand
    const hilt = new THREE.Mesh(assets.banditHiltGeo, assets.ironMat);
    hilt.position.set(0, -0.44, 0.08);
    const blade = new THREE.Mesh(assets.banditBladeGeo, assets.ironMat);
    blade.position.set(0, -0.44, 0.36);
    blade.castShadow = cast;
    this.rightArmPivot.add(rArm, hilt, blade);

    this.leftLegPivot.position.set(-0.13, 0.64, 0);
    const lLeg = new THREE.Mesh(assets.banditLegGeo, assets.leatherDarkMat);
    lLeg.position.y = -0.31;
    lLeg.castShadow = cast;
    this.leftLegPivot.add(lLeg);

    this.rightLegPivot.position.set(0.13, 0.64, 0);
    const rLeg = new THREE.Mesh(assets.banditLegGeo, assets.leatherDarkMat);
    rLeg.position.y = -0.31;
    rLeg.castShadow = cast;
    this.rightLegPivot.add(rLeg);

    this.bodyPivot.add(
      torso,
      cloak,
      this.headGroup,
      this.leftArmPivot,
      this.rightArmPivot,
      this.leftLegPivot,
      this.rightLegPivot,
    );
  }

  private buildThornStalker(assets: EnemySharedAssets, cast: boolean): void {
    this.shadowMesh.scale.setScalar(0.92);
    const torso = new THREE.Mesh(assets.stalkerTorsoGeo, assets.stalkerHideMat);
    torso.scale.set(0.95, 1.25, 0.85);
    torso.position.y = 0.86;
    torso.castShadow = cast;

    const backSpines = new THREE.Mesh(assets.stalkerSpineGeo, assets.stalkerBarkMat);
    backSpines.position.set(0, 1.05, -0.2);
    backSpines.rotation.x = -0.6;

    this.headGroup.position.set(0, 1.2, 0.1);
    const head = new THREE.Mesh(assets.stalkerHeadGeo, assets.stalkerHideMat);
    head.position.y = 0.1;
    head.castShadow = cast;

    const hornL = new THREE.Mesh(assets.stalkerHornGeo, assets.stalkerBarkMat);
    hornL.position.set(-0.12, 0.28, -0.02);
    hornL.rotation.z = 0.45;
    const hornR = new THREE.Mesh(assets.stalkerHornGeo, assets.stalkerBarkMat);
    hornR.position.set(0.12, 0.28, -0.02);
    hornR.rotation.z = -0.45;

    const eyeL = new THREE.Mesh(assets.stalkerEyeGeo, assets.stalkerEyeMat);
    eyeL.position.set(-0.075, 0.12, 0.165);
    const eyeR = new THREE.Mesh(assets.stalkerEyeGeo, assets.stalkerEyeMat);
    eyeR.position.set(0.075, 0.12, 0.165);

    this.headGroup.add(head, hornL, hornR, eyeL, eyeR);

    this.leftArmPivot.position.set(-0.3, 1.08, 0.04);
    const lArm = new THREE.Mesh(assets.stalkerArmGeo, assets.stalkerHideMat);
    lArm.position.y = -0.22;
    lArm.castShadow = cast;
    const lClaw = new THREE.Mesh(assets.stalkerClawGeo, assets.stalkerBarkMat);
    lClaw.rotation.x = Math.PI * 0.5;
    lClaw.position.set(0, -0.44, 0.08);
    this.leftArmPivot.add(lArm, lClaw);

    this.rightArmPivot.position.set(0.3, 1.08, 0.04);
    const rArm = new THREE.Mesh(assets.stalkerArmGeo, assets.stalkerHideMat);
    rArm.position.y = -0.22;
    rArm.castShadow = cast;
    const rClaw = new THREE.Mesh(assets.stalkerClawGeo, assets.stalkerBarkMat);
    rClaw.rotation.x = Math.PI * 0.5;
    rClaw.position.set(0, -0.44, 0.08);
    this.rightArmPivot.add(rArm, rClaw);

    this.leftLegPivot.position.set(-0.13, 0.52, 0);
    const lLeg = new THREE.Mesh(assets.stalkerLegGeo, assets.stalkerHideMat);
    lLeg.position.y = -0.26;
    lLeg.castShadow = cast;
    this.leftLegPivot.add(lLeg);

    this.rightLegPivot.position.set(0.13, 0.52, 0);
    const rLeg = new THREE.Mesh(assets.stalkerLegGeo, assets.stalkerHideMat);
    rLeg.position.y = -0.26;
    rLeg.castShadow = cast;
    this.rightLegPivot.add(rLeg);

    this.bodyPivot.add(
      torso,
      backSpines,
      this.headGroup,
      this.leftArmPivot,
      this.rightArmPivot,
      this.leftLegPivot,
      this.rightLegPivot,
    );
  }

  private buildStoneSentinel(assets: EnemySharedAssets, cast: boolean): void {
    this.shadowMesh.scale.setScalar(1.45);
    const torso = new THREE.Mesh(assets.sentinelTorsoGeo, assets.stoneMat);
    torso.position.y = 1.42;
    torso.castShadow = cast;

    const mossCap = new THREE.Mesh(assets.sentinelMossGeo, assets.stoneMossMat);
    mossCap.position.y = 1.9;

    const core = new THREE.Mesh(assets.sentinelCoreGeo, assets.runeGlowMat);
    core.position.set(0, 1.45, 0.25);

    this.headGroup.position.set(0, 1.98, 0.04);
    const head = new THREE.Mesh(assets.sentinelHeadGeo, assets.stoneMat);
    head.position.y = 0.22;
    head.castShadow = cast;
    const visor = new THREE.Mesh(assets.sentinelVisorGeo, assets.runeGlowMat);
    visor.position.set(0, 0.24, 0.2);
    this.headGroup.add(head, visor);

    this.leftArmPivot.position.set(-0.62, 1.75, 0);
    const lArm = new THREE.Mesh(assets.sentinelArmGeo, assets.stoneMat);
    lArm.position.y = -0.38;
    lArm.castShadow = cast;
    this.leftArmPivot.add(lArm);

    this.rightArmPivot.position.set(0.62, 1.75, 0);
    const rArm = new THREE.Mesh(assets.sentinelArmGeo, assets.stoneMat);
    rArm.position.y = -0.38;
    rArm.castShadow = cast;
    this.rightArmPivot.add(rArm);

    this.leftLegPivot.position.set(-0.24, 0.9, 0);
    const lLeg = new THREE.Mesh(assets.sentinelLegGeo, assets.stoneMat);
    lLeg.position.y = -0.45;
    lLeg.castShadow = cast;
    this.leftLegPivot.add(lLeg);

    this.rightLegPivot.position.set(0.24, 0.9, 0);
    const rLeg = new THREE.Mesh(assets.sentinelLegGeo, assets.stoneMat);
    rLeg.position.y = -0.45;
    rLeg.castShadow = cast;
    this.rightLegPivot.add(rLeg);

    this.bodyPivot.add(
      torso,
      mossCap,
      core,
      this.headGroup,
      this.leftArmPivot,
      this.rightArmPivot,
      this.leftLegPivot,
      this.rightLegPivot,
    );
  }

  public triggerHitFlash(): void {
    this.hitFlashTimer = 0.16;
  }

  public updateHealthBar(
    healthRatio: number,
    show: boolean,
    camera: THREE.Camera | null,
  ): void {
    this.healthBarGroup.visible = show && healthRatio > 0;
    if (!this.healthBarGroup.visible) return;
    this.healthFillMesh.scale.x = Math.max(0.01, Math.min(1, healthRatio));
    if (camera) {
      this.healthBarGroup.quaternion.copy(camera.quaternion);
    }
  }

  public updateAnimation(
    dt: number,
    elapsed: number,
    state: EnemyBehaviorState,
    horizontalSpeed: number,
    deathElapsed: number,
  ): void {
    if (this.isFarLod) {
      this.shadowMesh.visible = state !== 'dead';
      return;
    }

    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
      const flashScale = 1 + (this.hitFlashTimer / 0.16) * 0.08;
      this.bodyPivot.scale.setScalar(flashScale);
    } else {
      this.bodyPivot.scale.setScalar(1);
    }

    if (state === 'dead') {
      this.healthBarGroup.visible = false;
      const t = Math.min(1, deathElapsed / 0.55);
      this.bodyPivot.rotation.x = THREE.MathUtils.lerp(0, -Math.PI * 0.48, t);
      this.bodyPivot.position.y = THREE.MathUtils.lerp(0, 0.16, t);
      if (deathElapsed > 1.3) {
        const sink = Math.min(1, (deathElapsed - 1.3) / 1.0);
        this.bodyPivot.position.y = 0.16 - sink * 1.4;
      }
      this.shadowMesh.visible = deathElapsed < 1.3;
      return;
    }

    this.shadowMesh.visible = true;

    if (state === 'stagger') {
      this.bodyPivot.rotation.x = THREE.MathUtils.damp(this.bodyPivot.rotation.x, -0.35, 16, dt);
      this.rightArmPivot.rotation.x = THREE.MathUtils.damp(this.rightArmPivot.rotation.x, 0.4, 14, dt);
      this.leftArmPivot.rotation.x = THREE.MathUtils.damp(this.leftArmPivot.rotation.x, 0.4, 14, dt);
      return;
    }

    if (state === 'attack_windup') {
      const raiseTarget = this.archetype === 'stone_sentinel' ? -2.35 : -2.1;
      this.rightArmPivot.rotation.x = THREE.MathUtils.damp(
        this.rightArmPivot.rotation.x,
        raiseTarget,
        14,
        dt,
      );
      this.leftArmPivot.rotation.x = THREE.MathUtils.damp(
        this.leftArmPivot.rotation.x,
        this.archetype === 'stone_sentinel' ? -2.35 : -0.6,
        12,
        dt,
      );
      this.bodyPivot.rotation.x = THREE.MathUtils.damp(this.bodyPivot.rotation.x, -0.14, 12, dt);
      this.bodyPivot.rotation.y = THREE.MathUtils.damp(this.bodyPivot.rotation.y, -0.35, 12, dt);
      return;
    }

    if (state === 'attack_recover') {
      this.rightArmPivot.rotation.x = THREE.MathUtils.damp(this.rightArmPivot.rotation.x, 0.65, 18, dt);
      this.leftArmPivot.rotation.x = THREE.MathUtils.damp(
        this.leftArmPivot.rotation.x,
        this.archetype === 'stone_sentinel' ? 0.65 : 0.1,
        14,
        dt,
      );
      this.bodyPivot.rotation.x = THREE.MathUtils.damp(this.bodyPivot.rotation.x, 0.22, 14, dt);
      this.bodyPivot.rotation.y = THREE.MathUtils.damp(this.bodyPivot.rotation.y, 0.25, 14, dt);
      return;
    }

    this.bodyPivot.rotation.y = THREE.MathUtils.damp(this.bodyPivot.rotation.y, 0, 12, dt);

    if (horizontalSpeed > 0.25) {
      const freq = state === 'chase' ? 10.5 : 6.4;
      this.walkPhase += dt * freq;
      const swing = Math.sin(this.walkPhase) * (state === 'chase' ? 0.72 : 0.45);
      const bounce = Math.abs(Math.cos(this.walkPhase)) * 0.05;

      this.leftLegPivot.rotation.x = THREE.MathUtils.damp(this.leftLegPivot.rotation.x, swing, 14, dt);
      this.rightLegPivot.rotation.x = THREE.MathUtils.damp(this.rightLegPivot.rotation.x, -swing, 14, dt);
      this.leftArmPivot.rotation.x = THREE.MathUtils.damp(this.leftArmPivot.rotation.x, -swing * 0.85, 14, dt);
      this.rightArmPivot.rotation.x = THREE.MathUtils.damp(this.rightArmPivot.rotation.x, swing * 0.85, 14, dt);
      this.bodyPivot.position.y = THREE.MathUtils.damp(this.bodyPivot.position.y, bounce, 12, dt);
      this.bodyPivot.rotation.x = THREE.MathUtils.damp(
        this.bodyPivot.rotation.x,
        state === 'chase' ? 0.14 : 0.05,
        10,
        dt,
      );
    } else {
      const breath = Math.sin(elapsed * 2.4) * 0.02;
      this.leftLegPivot.rotation.x = THREE.MathUtils.damp(this.leftLegPivot.rotation.x, 0, 10, dt);
      this.rightLegPivot.rotation.x = THREE.MathUtils.damp(this.rightLegPivot.rotation.x, 0, 10, dt);
      this.leftArmPivot.rotation.x = THREE.MathUtils.damp(this.leftArmPivot.rotation.x, breath, 10, dt);
      this.rightArmPivot.rotation.x = THREE.MathUtils.damp(this.rightArmPivot.rotation.x, -breath, 10, dt);
      this.bodyPivot.position.y = THREE.MathUtils.damp(this.bodyPivot.position.y, breath * 0.6, 10, dt);
      this.bodyPivot.rotation.x = THREE.MathUtils.damp(this.bodyPivot.rotation.x, 0, 10, dt);
    }
  }

  public dispose(): void {
    this.root.removeFromParent();
  }
}
