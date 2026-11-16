import * as THREE from 'three';
import type { NpcBehaviorState, NpcRole } from '../types';

export interface NpcSharedAssets {
  torsoGeo: THREE.CylinderGeometry;
  skirtGeo: THREE.CylinderGeometry;
  headGeo: THREE.SphereGeometry;
  eyeGeo: THREE.BoxGeometry;
  armGeo: THREE.CapsuleGeometry;
  legGeo: THREE.CylinderGeometry;
  bootGeo: THREE.BoxGeometry;
  strawBrimGeo: THREE.CylinderGeometry;
  strawCrownGeo: THREE.CylinderGeometry;
  helmGeo: THREE.SphereGeometry;
  helmCrestGeo: THREE.BoxGeometry;
  apronGeo: THREE.BoxGeometry;
  packGeo: THREE.BoxGeometry;
  pauldronGeo: THREE.SphereGeometry;
  shadowGeo: THREE.PlaneGeometry;
  farLodGeo: THREE.CylinderGeometry;

  skinMat: THREE.MeshStandardMaterial;
  trouserMat: THREE.MeshStandardMaterial;
  leatherMat: THREE.MeshStandardMaterial;
  strawMat: THREE.MeshStandardMaterial;
  ironMat: THREE.MeshStandardMaterial;
  shadowMat: THREE.MeshBasicMaterial;
  roleMaterials: Record<NpcRole, { tunic: THREE.MeshStandardMaterial; accent: THREE.MeshStandardMaterial }>;
  dispose: () => void;
}

export function createNpcSharedAssets(
  contactShadowMap: THREE.Texture,
): NpcSharedAssets {
  const torsoGeo = new THREE.CylinderGeometry(0.22, 0.25, 0.64, 10);
  const skirtGeo = new THREE.CylinderGeometry(0.25, 0.29, 0.2, 10);
  const headGeo = new THREE.SphereGeometry(0.19, 12, 10);
  const eyeGeo = new THREE.BoxGeometry(0.036, 0.036, 0.03);
  const armGeo = new THREE.CapsuleGeometry(0.065, 0.34, 4, 7);
  const legGeo = new THREE.CylinderGeometry(0.088, 0.075, 0.44, 7);
  const bootGeo = new THREE.BoxGeometry(0.14, 0.16, 0.22);
  const strawBrimGeo = new THREE.CylinderGeometry(0.38, 0.4, 0.04, 14);
  const strawCrownGeo = new THREE.CylinderGeometry(0.18, 0.21, 0.16, 12);
  const helmGeo = new THREE.SphereGeometry(0.21, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6);
  const helmCrestGeo = new THREE.BoxGeometry(0.06, 0.12, 0.24);
  const apronGeo = new THREE.BoxGeometry(0.38, 0.56, 0.08);
  const packGeo = new THREE.BoxGeometry(0.34, 0.42, 0.18);
  const pauldronGeo = new THREE.SphereGeometry(0.11, 8, 6);
  const shadowGeo = new THREE.PlaneGeometry(1.25, 1.25);
  shadowGeo.rotateX(-Math.PI / 2);
  const farLodGeo = new THREE.CylinderGeometry(0.24, 0.28, 1.65, 6);
  farLodGeo.translate(0, 0.825, 0);

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xe6bea0,
    roughness: 0.74,
    metalness: 0.0,
  });
  const trouserMat = new THREE.MeshStandardMaterial({
    color: 0x383e45,
    roughness: 0.88,
    metalness: 0.02,
  });
  const leatherMat = new THREE.MeshStandardMaterial({
    color: 0x5b3c27,
    roughness: 0.6,
    metalness: 0.06,
  });
  const strawMat = new THREE.MeshStandardMaterial({
    color: 0xd9bc6c,
    roughness: 0.9,
    metalness: 0.01,
  });
  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x7c8691,
    roughness: 0.36,
    metalness: 0.68,
  });
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowMap,
    transparent: true,
    depthWrite: false,
    opacity: 0.42,
  });

  const roleMaterials: Record<
    NpcRole,
    { tunic: THREE.MeshStandardMaterial; accent: THREE.MeshStandardMaterial }
  > = {
    villager: {
      tunic: new THREE.MeshStandardMaterial({ color: 0x4f6d5a, roughness: 0.85 }),
      accent: new THREE.MeshStandardMaterial({ color: 0xc27b48, roughness: 0.86 }),
    },
    merchant: {
      tunic: new THREE.MeshStandardMaterial({ color: 0x8f3f36, roughness: 0.82 }),
      accent: new THREE.MeshStandardMaterial({ color: 0xe5b85c, roughness: 0.72 }),
    },
    farmer: {
      tunic: new THREE.MeshStandardMaterial({ color: 0x6c7a45, roughness: 0.88 }),
      accent: new THREE.MeshStandardMaterial({ color: 0x8c5f3a, roughness: 0.85 }),
    },
    guard: {
      tunic: new THREE.MeshStandardMaterial({ color: 0x3c4d63, roughness: 0.68, metalness: 0.18 }),
      accent: new THREE.MeshStandardMaterial({ color: 0xb34334, roughness: 0.78 }),
    },
    blacksmith: {
      tunic: new THREE.MeshStandardMaterial({ color: 0x4b4340, roughness: 0.76, metalness: 0.14 }),
      accent: new THREE.MeshStandardMaterial({ color: 0xd96b27, roughness: 0.68 }),
    },
    hunter: {
      tunic: new THREE.MeshStandardMaterial({ color: 0x3b593c, roughness: 0.84 }),
      accent: new THREE.MeshStandardMaterial({ color: 0x7a5132, roughness: 0.78 }),
    },
    woodcutter: {
      tunic: new THREE.MeshStandardMaterial({ color: 0x7a422d, roughness: 0.86 }),
      accent: new THREE.MeshStandardMaterial({ color: 0xc7924e, roughness: 0.82 }),
    },
    fisherman: {
      tunic: new THREE.MeshStandardMaterial({ color: 0x3d6d7d, roughness: 0.82 }),
      accent: new THREE.MeshStandardMaterial({ color: 0xd4be7a, roughness: 0.86 }),
    },
    healer: {
      tunic: new THREE.MeshStandardMaterial({ color: 0xd5decb, roughness: 0.82 }),
      accent: new THREE.MeshStandardMaterial({ color: 0x4e9968, roughness: 0.74 }),
    },
    innkeeper: {
      tunic: new THREE.MeshStandardMaterial({ color: 0x6f394c, roughness: 0.8 }),
      accent: new THREE.MeshStandardMaterial({ color: 0xe6bf6e, roughness: 0.74 }),
    },
    carpenter: {
      tunic: new THREE.MeshStandardMaterial({ color: 0x7a6244, roughness: 0.84 }),
      accent: new THREE.MeshStandardMaterial({ color: 0xb88d55, roughness: 0.8 }),
    },
    miner: {
      tunic: new THREE.MeshStandardMaterial({ color: 0x545961, roughness: 0.82, metalness: 0.1 }),
      accent: new THREE.MeshStandardMaterial({ color: 0x79b8d4, roughness: 0.45 }),
    },
    elder: {
      tunic: new THREE.MeshStandardMaterial({ color: 0x5a4c73, roughness: 0.78 }),
      accent: new THREE.MeshStandardMaterial({ color: 0xe3c368, roughness: 0.68 }),
    },
    traveling_merchant: {
      tunic: new THREE.MeshStandardMaterial({ color: 0x99582a, roughness: 0.8 }),
      accent: new THREE.MeshStandardMaterial({ color: 0x4ca696, roughness: 0.76 }),
    },
  };

  return {
    torsoGeo,
    skirtGeo,
    headGeo,
    eyeGeo,
    armGeo,
    legGeo,
    bootGeo,
    strawBrimGeo,
    strawCrownGeo,
    helmGeo,
    helmCrestGeo,
    apronGeo,
    packGeo,
    pauldronGeo,
    shadowGeo,
    farLodGeo,
    skinMat,
    trouserMat,
    leatherMat,
    strawMat,
    ironMat,
    shadowMat,
    roleMaterials,
    dispose: () => {
      torsoGeo.dispose();
      skirtGeo.dispose();
      headGeo.dispose();
      eyeGeo.dispose();
      armGeo.dispose();
      legGeo.dispose();
      bootGeo.dispose();
      strawBrimGeo.dispose();
      strawCrownGeo.dispose();
      helmGeo.dispose();
      helmCrestGeo.dispose();
      apronGeo.dispose();
      packGeo.dispose();
      pauldronGeo.dispose();
      shadowGeo.dispose();
      farLodGeo.dispose();
      skinMat.dispose();
      trouserMat.dispose();
      leatherMat.dispose();
      strawMat.dispose();
      ironMat.dispose();
      shadowMat.dispose();
      Object.values(roleMaterials).forEach((m) => {
        m.tunic.dispose();
        m.accent.dispose();
      });
    },
  };
}

const ROLE_BADGE_COLORS: Record<NpcRole, string> = {
  villager: '#96c79a',
  merchant: '#f0bd5b',
  farmer: '#b6cf72',
  guard: '#8fb4dc',
  blacksmith: '#f28b50',
  hunter: '#6dc48c',
  woodcutter: '#d99962',
  fisherman: '#6ec7e0',
  healer: '#88e2a7',
  innkeeper: '#e390b2',
  carpenter: '#d1b07b',
  miner: '#94c5d9',
  elder: '#cdb2f2',
  traveling_merchant: '#67d1bc',
};

function drawNameplateCanvas(
  ctx: CanvasRenderingContext2D,
  name: string,
  roleLabel: string,
  role: NpcRole,
): void {
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = 'rgba(13, 23, 18, 0.84)';
  ctx.beginPath();
  ctx.roundRect(18, 10, 220, 44, 12);
  ctx.fill();

  ctx.strokeStyle = ROLE_BADGE_COLORS[role];
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#f5f7f2';
  ctx.font = '600 19px "Noto Sans Arabic", Tahoma, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 128, 27);

  ctx.fillStyle = ROLE_BADGE_COLORS[role];
  ctx.font = '600 12px "Noto Sans Arabic", Tahoma, system-ui, sans-serif';
  ctx.fillText(roleLabel, 128, 45);
}

function createNameplateSprite(
  name: string,
  role: NpcRole,
): {
  sprite: THREE.Sprite;
  updateText: (nextName: string, nextRoleLabel: string) => void;
  dispose: () => void;
} | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  drawNameplateCanvas(ctx, name, role.replace('_', ' ').toUpperCase(), role);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(0, 2.38, 0);
  sprite.scale.set(2.05, 0.52, 1);

  return {
    sprite,
    updateText: (nextName: string, nextRoleLabel: string) => {
      drawNameplateCanvas(ctx, nextName, nextRoleLabel, role);
      texture.needsUpdate = true;
    },
    dispose: () => {
      texture.dispose();
      mat.dispose();
    },
  };
}

export class NpcRig {
  public readonly root = new THREE.Group();
  public readonly nameplateSprite: THREE.Sprite | null = null;

  private readonly bodyPivot = new THREE.Group();
  private readonly headGroup = new THREE.Group();
  private readonly leftArmPivot = new THREE.Group();
  private readonly rightArmPivot = new THREE.Group();
  private readonly leftLegPivot = new THREE.Group();
  private readonly rightLegPivot = new THREE.Group();
  private readonly shadowMesh: THREE.Mesh;

  private walkPhase = 0;
  private idlePhase: number;
  private nameplateUpdate: ((name: string, roleLabel: string) => void) | null = null;
  private nameplateDispose: (() => void) | null = null;
  private readonly shadowCasters: THREE.Mesh[] = [];
  private readonly farLodMesh: THREE.Mesh;
  private lastCastShadow = true;
  private isFarLod = false;
  private isDeadState = false;

  constructor(
    name: string,
    role: NpcRole,
    assets: NpcSharedAssets,
    phaseOffset: number,
  ) {
    this.idlePhase = phaseOffset;
    const { tunic, accent } = assets.roleMaterials[role];

    this.root.add(this.bodyPivot);
    this.farLodMesh = new THREE.Mesh(assets.farLodGeo, tunic);
    this.farLodMesh.visible = false;
    this.farLodMesh.castShadow = false;
    this.farLodMesh.receiveShadow = false;
    this.root.add(this.farLodMesh);

    const torso = new THREE.Mesh(assets.torsoGeo, role === 'guard' ? assets.ironMat : tunic);
    torso.position.y = 1.04;
    torso.castShadow = true;
    torso.receiveShadow = true;
    this.bodyPivot.add(torso);

    const skirt = new THREE.Mesh(assets.skirtGeo, tunic);
    skirt.position.y = 0.68;
    skirt.castShadow = true;
    this.bodyPivot.add(skirt);

    if (
      role === 'merchant' ||
      role === 'blacksmith' ||
      role === 'innkeeper' ||
      role === 'carpenter'
    ) {
      const apronMat = role === 'blacksmith' ? assets.leatherMat : accent;
      const apron = new THREE.Mesh(assets.apronGeo, apronMat);
      apron.position.set(0, 0.94, 0.22);
      this.bodyPivot.add(apron);
    } else if (role === 'guard') {
      const pL = new THREE.Mesh(assets.pauldronGeo, assets.ironMat);
      pL.position.set(-0.29, 1.32, 0);
      const pR = new THREE.Mesh(assets.pauldronGeo, assets.ironMat);
      pR.position.set(0.29, 1.32, 0);
      this.bodyPivot.add(pL, pR);
    } else if (
      role === 'traveling_merchant' ||
      role === 'hunter' ||
      role === 'woodcutter' ||
      role === 'miner'
    ) {
      const pack = new THREE.Mesh(assets.packGeo, assets.leatherMat);
      pack.position.set(0, 1.06, -0.26);
      this.bodyPivot.add(pack);
    }

    this.headGroup.position.set(0, 1.42, 0);
    this.bodyPivot.add(this.headGroup);

    const head = new THREE.Mesh(assets.headGeo, assets.skinMat);
    head.position.y = 0.16;
    head.castShadow = true;
    this.headGroup.add(head);

    const eyeL = new THREE.Mesh(assets.eyeGeo, assets.trouserMat);
    eyeL.position.set(-0.065, 0.18, 0.175);
    const eyeR = new THREE.Mesh(assets.eyeGeo, assets.trouserMat);
    eyeR.position.set(0.065, 0.18, 0.175);
    this.headGroup.add(eyeL, eyeR);

    if (role === 'farmer' || role === 'fisherman') {
      const brim = new THREE.Mesh(assets.strawBrimGeo, assets.strawMat);
      brim.position.y = 0.31;
      brim.castShadow = true;
      const crown = new THREE.Mesh(assets.strawCrownGeo, assets.strawMat);
      crown.position.y = 0.39;
      crown.castShadow = true;
      this.headGroup.add(brim, crown);
    } else if (role === 'guard' || role === 'miner') {
      const helm = new THREE.Mesh(assets.helmGeo, assets.ironMat);
      helm.position.y = 0.19;
      helm.castShadow = true;
      const crest = new THREE.Mesh(assets.helmCrestGeo, accent);
      crest.position.y = 0.39;
      crest.castShadow = true;
      this.headGroup.add(helm, crest);
    }

    this.leftArmPivot.position.set(-0.3, 1.29, 0);
    const leftArm = new THREE.Mesh(assets.armGeo, tunic);
    leftArm.position.y = -0.21;
    leftArm.castShadow = true;
    this.leftArmPivot.add(leftArm);
    this.bodyPivot.add(this.leftArmPivot);

    this.rightArmPivot.position.set(0.3, 1.29, 0);
    const rightArm = new THREE.Mesh(assets.armGeo, tunic);
    rightArm.position.y = -0.21;
    rightArm.castShadow = true;
    this.rightArmPivot.add(rightArm);
    this.bodyPivot.add(this.rightArmPivot);

    this.leftLegPivot.position.set(-0.12, 0.65, 0);
    const leftLeg = new THREE.Mesh(assets.legGeo, assets.trouserMat);
    leftLeg.position.y = -0.24;
    leftLeg.castShadow = true;
    const leftBoot = new THREE.Mesh(assets.bootGeo, assets.leatherMat);
    leftBoot.position.set(0, -0.55, 0.03);
    this.leftLegPivot.add(leftLeg, leftBoot);
    this.bodyPivot.add(this.leftLegPivot);

    this.rightLegPivot.position.set(0.12, 0.65, 0);
    const rightLeg = new THREE.Mesh(assets.legGeo, assets.trouserMat);
    rightLeg.position.y = -0.24;
    rightLeg.castShadow = true;
    const rightBoot = new THREE.Mesh(assets.bootGeo, assets.leatherMat);
    rightBoot.position.set(0, -0.55, 0.03);
    this.rightLegPivot.add(rightLeg, rightBoot);
    this.bodyPivot.add(this.rightLegPivot);

    this.shadowMesh = new THREE.Mesh(assets.shadowGeo, assets.shadowMat);
    this.shadowMesh.position.y = 0.03;
    this.root.add(this.shadowMesh);

    const np = createNameplateSprite(name, role);
    if (np) {
      this.nameplateSprite = np.sprite;
      this.nameplateUpdate = np.updateText;
      this.nameplateDispose = np.dispose;
      this.root.add(np.sprite);
    }

    this.bodyPivot.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && (obj as THREE.Mesh).castShadow) {
        this.shadowCasters.push(obj as THREE.Mesh);
      }
    });
  }

  public setLodDetail(isFar: boolean): void {
    if (this.isFarLod === isFar) return;
    this.isFarLod = isFar;
    this.bodyPivot.visible = !isFar;
    this.farLodMesh.visible = isFar;
  }

  public setShadowCasting(enabled: boolean): void {
    if (this.lastCastShadow === enabled) return;
    this.lastCastShadow = enabled;
    for (let i = 0; i < this.shadowCasters.length; i++) {
      this.shadowCasters[i].castShadow = enabled;
    }
  }

  public updateNameplate(name: string, roleLabel: string): void {
    this.nameplateUpdate?.(name, roleLabel);
  }

  public setDead(dead: boolean): void {
    this.isDeadState = dead;
    if (dead) {
      this.shadowMesh.visible = false;
      if (this.nameplateSprite) {
        this.nameplateSprite.visible = false;
      }
    }
  }

  public updateAnimation(
    dt: number,
    behaviorState: NpcBehaviorState,
    horizontalSpeed: number,
  ): void {
    if (this.isFarLod) return;
    this.idlePhase += dt * 2.0;

    if (this.isDeadState) {
      this.shadowMesh.visible = false;
      this.bodyPivot.rotation.x = THREE.MathUtils.damp(this.bodyPivot.rotation.x, -Math.PI * 0.49, 10, dt);
      this.bodyPivot.rotation.z = THREE.MathUtils.damp(this.bodyPivot.rotation.z, 0.2, 10, dt);
      this.bodyPivot.position.y = THREE.MathUtils.damp(this.bodyPivot.position.y, 0.16, 10, dt);
      this.bodyPivot.position.z = THREE.MathUtils.damp(this.bodyPivot.position.z, 0.68, 10, dt);
      this.leftLegPivot.rotation.x = THREE.MathUtils.damp(this.leftLegPivot.rotation.x, 0.14, 10, dt);
      this.rightLegPivot.rotation.x = THREE.MathUtils.damp(this.rightLegPivot.rotation.x, -0.18, 10, dt);
      this.leftArmPivot.rotation.x = THREE.MathUtils.damp(this.leftArmPivot.rotation.x, 0.32, 10, dt);
      this.rightArmPivot.rotation.x = THREE.MathUtils.damp(this.rightArmPivot.rotation.x, -0.26, 10, dt);
      return;
    }

    this.bodyPivot.rotation.z = THREE.MathUtils.damp(this.bodyPivot.rotation.z, 0, 10, dt);

    if (behaviorState === 'sleeping') {
      this.shadowMesh.visible = false;
      this.bodyPivot.rotation.x = THREE.MathUtils.damp(this.bodyPivot.rotation.x, -Math.PI * 0.48, 8, dt);
      this.bodyPivot.position.y = THREE.MathUtils.damp(this.bodyPivot.position.y, 0.34, 8, dt);
      this.bodyPivot.position.z = THREE.MathUtils.damp(this.bodyPivot.position.z, 0.72, 8, dt);
      this.leftLegPivot.rotation.x = THREE.MathUtils.damp(this.leftLegPivot.rotation.x, 0.05, 8, dt);
      this.rightLegPivot.rotation.x = THREE.MathUtils.damp(this.rightLegPivot.rotation.x, -0.05, 8, dt);
      this.leftArmPivot.rotation.x = THREE.MathUtils.damp(this.leftArmPivot.rotation.x, 0.12, 8, dt);
      this.rightArmPivot.rotation.x = THREE.MathUtils.damp(this.rightArmPivot.rotation.x, 0.12, 8, dt);
      this.headGroup.rotation.y = Math.sin(this.idlePhase * 0.4) * 0.05;
      return;
    }

    this.shadowMesh.visible = true;
    this.bodyPivot.position.z = THREE.MathUtils.damp(this.bodyPivot.position.z, 0, 10, dt);

    if (
      (behaviorState === 'walking' || behaviorState === 'wandering') &&
      horizontalSpeed > 0.25
    ) {
      const speedRatio = THREE.MathUtils.clamp(horizontalSpeed / 2.4, 0.35, 1.3);
      this.walkPhase += dt * 7.6 * speedRatio;
      const swing = Math.sin(this.walkPhase) * 0.56 * Math.min(1, speedRatio);
      const bounce = Math.abs(Math.cos(this.walkPhase)) * 0.04;

      this.leftLegPivot.rotation.x = THREE.MathUtils.damp(this.leftLegPivot.rotation.x, swing, 14, dt);
      this.rightLegPivot.rotation.x = THREE.MathUtils.damp(this.rightLegPivot.rotation.x, -swing, 14, dt);
      this.leftArmPivot.rotation.x = THREE.MathUtils.damp(this.leftArmPivot.rotation.x, -swing * 0.75, 14, dt);
      this.rightArmPivot.rotation.x = THREE.MathUtils.damp(this.rightArmPivot.rotation.x, swing * 0.75, 14, dt);
      this.bodyPivot.position.y = THREE.MathUtils.damp(this.bodyPivot.position.y, bounce, 14, dt);
      this.bodyPivot.rotation.x = THREE.MathUtils.damp(this.bodyPivot.rotation.x, 0.05, 10, dt);
      this.headGroup.rotation.y = THREE.MathUtils.damp(this.headGroup.rotation.y, 0, 10, dt);
    } else if (behaviorState === 'talking') {
      const gesture = Math.sin(this.idlePhase * 1.9) * 0.22;
      this.leftLegPivot.rotation.x = THREE.MathUtils.damp(this.leftLegPivot.rotation.x, 0, 12, dt);
      this.rightLegPivot.rotation.x = THREE.MathUtils.damp(this.rightLegPivot.rotation.x, 0, 12, dt);
      this.rightArmPivot.rotation.x = THREE.MathUtils.damp(this.rightArmPivot.rotation.x, -0.55 + gesture, 10, dt);
      this.leftArmPivot.rotation.x = THREE.MathUtils.damp(this.leftArmPivot.rotation.x, -0.15 - gesture * 0.4, 10, dt);
      this.bodyPivot.position.y = Math.sin(this.idlePhase) * 0.012;
      this.bodyPivot.rotation.x = THREE.MathUtils.damp(this.bodyPivot.rotation.x, 0, 10, dt);
      this.headGroup.rotation.y = Math.sin(this.idlePhase * 0.8) * 0.08;
    } else if (behaviorState === 'working') {
      const workWave = Math.sin(this.idlePhase * 1.6);
      this.leftLegPivot.rotation.x = THREE.MathUtils.damp(this.leftLegPivot.rotation.x, 0.08, 10, dt);
      this.rightLegPivot.rotation.x = THREE.MathUtils.damp(this.rightLegPivot.rotation.x, -0.08, 10, dt);
      this.leftArmPivot.rotation.x = THREE.MathUtils.damp(this.leftArmPivot.rotation.x, -0.45 + workWave * 0.24, 10, dt);
      this.rightArmPivot.rotation.x = THREE.MathUtils.damp(this.rightArmPivot.rotation.x, -0.45 - workWave * 0.24, 10, dt);
      this.bodyPivot.position.y = THREE.MathUtils.damp(this.bodyPivot.position.y, 0, 10, dt);
      this.bodyPivot.rotation.x = THREE.MathUtils.damp(this.bodyPivot.rotation.x, 0.14 + Math.abs(workWave) * 0.06, 8, dt);
      this.headGroup.rotation.y = Math.sin(this.idlePhase * 0.6) * 0.14;
    } else {
      const breath = Math.sin(this.idlePhase) * 0.014;
      this.leftLegPivot.rotation.x = THREE.MathUtils.damp(this.leftLegPivot.rotation.x, 0, 12, dt);
      this.rightLegPivot.rotation.x = THREE.MathUtils.damp(this.rightLegPivot.rotation.x, 0, 12, dt);
      this.leftArmPivot.rotation.x = THREE.MathUtils.damp(
        this.leftArmPivot.rotation.x,
        Math.sin(this.idlePhase * 0.65) * 0.04,
        10,
        dt,
      );
      this.rightArmPivot.rotation.x = THREE.MathUtils.damp(
        this.rightArmPivot.rotation.x,
        -Math.sin(this.idlePhase * 0.65) * 0.04,
        10,
        dt,
      );
      this.bodyPivot.position.y = THREE.MathUtils.damp(this.bodyPivot.position.y, breath, 12, dt);
      this.bodyPivot.rotation.x = THREE.MathUtils.damp(this.bodyPivot.rotation.x, 0, 10, dt);
      this.headGroup.rotation.y = THREE.MathUtils.damp(
        this.headGroup.rotation.y,
        Math.sin(this.idlePhase * 0.4) * 0.18,
        6,
        dt,
      );
    }
  }

  public dispose(): void {
    this.nameplateDispose?.();
    this.root.removeFromParent();
  }
}
