import * as THREE from 'three';
import { groundHeightAt } from '../math/noise';
import type { VillageSiteRecord } from './VillageManager';
import type { WorldInteractable } from './WorldManager';
import type { WorldGenTelemetry } from './WorldPlacementValidator';

interface DisposableEntry {
  dispose: () => void;
}

/**
 * Dev-only 3D world generation overlay showing village centers, footprint radii,
 * active resource spawns, and rejected candidate / water-violation markers.
 */
export class WorldGenDebugRenderer {
  private readonly root = new THREE.Group();
  private readonly disposables: DisposableEntry[] = [];
  private visible = false;
  private built = false;

  constructor(private readonly scene: THREE.Scene) {
    this.root.name = 'WorldGenDebugRoot';
    this.root.visible = false;
    this.scene.add(this.root);
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public isBuilt(): boolean {
    return this.built;
  }

  public setVisible(enabled: boolean): void {
    this.visible = enabled;
    this.root.visible = enabled;
  }

  public clear(): void {
    while (this.root.children.length > 0) {
      this.root.remove(this.root.children[0]);
    }
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    this.built = false;
  }

  public rebuild(
    villages: readonly VillageSiteRecord[],
    interactables: readonly WorldInteractable[],
    telemetry: WorldGenTelemetry,
  ): void {
    this.clear();

    // Shared geometries & materials
    const pillarGeo = new THREE.CylinderGeometry(0.45, 0.45, 28, 8);
    const pillarMat = new THREE.MeshBasicMaterial({
      color: 0xf0c24b,
      transparent: true,
      opacity: 0.85,
    });
    const procPillarMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
    });
    const ringMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.72,
    });
    const curatedRingMat = new THREE.LineBasicMaterial({
      color: 0xf0c24b,
      transparent: true,
      opacity: 0.72,
    });
    const resDotGeo = new THREE.SphereGeometry(0.48, 6, 5);
    const resDotMat = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
    const rejVillageGeo = new THREE.OctahedronGeometry(1.4, 0);
    const rejVillageMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const rejResGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const rejResMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });

    this.disposables.push(
      pillarGeo,
      pillarMat,
      procPillarMat,
      ringMat,
      curatedRingMat,
      resDotGeo,
      resDotMat,
      rejVillageGeo,
      rejVillageMat,
      rejResGeo,
      rejResMat,
    );

    const circleSegments = 40;
    const circlePts: THREE.Vector3[] = [];
    for (let i = 0; i <= circleSegments; i++) {
      const a = (i / circleSegments) * Math.PI * 2;
      circlePts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    }
    const unitCircleGeo = new THREE.BufferGeometry().setFromPoints(circlePts);
    this.disposables.push(unitCircleGeo);

    // 1. Village centers, footprint rings, and text sprites
    for (const v of villages) {
      const cy = groundHeightAt(v.centerX, v.centerZ);
      const pillar = new THREE.Mesh(
        pillarGeo,
        v.isProcedural ? procPillarMat : pillarMat,
      );
      pillar.position.set(v.centerX, cy + 14, v.centerZ);
      this.root.add(pillar);

      const ring = new THREE.LineLoop(
        unitCircleGeo,
        v.isProcedural ? ringMat : curatedRingMat,
      );
      const rad = Math.max(24, v.clearanceRadius);
      ring.scale.set(rad, 1, rad);
      ring.position.set(v.centerX, cy + 1.2, v.centerZ);
      this.root.add(ring);

      const labelSprite = this.createLabelSprite(
        `${v.name} [${v.kind}]`,
        v.isProcedural ? '#7dd3fc' : '#fde68a',
      );
      labelSprite.position.set(v.centerX, cy + 31, v.centerZ);
      this.root.add(labelSprite);
    }

    // 2. Resource node dots (instanced for minimal draw calls)
    const activeResources = interactables.filter(
      (item) => item.kind === 'resource' && !item.collected,
    );
    if (activeResources.length > 0) {
      const resInst = new THREE.InstancedMesh(
        resDotGeo,
        resDotMat,
        activeResources.length,
      );
      const dummy = new THREE.Object3D();
      for (let i = 0; i < activeResources.length; i++) {
        const r = activeResources[i];
        dummy.position.set(r.x, r.y + 3.2, r.z);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        resInst.setMatrixAt(i, dummy.matrix);
      }
      resInst.instanceMatrix.needsUpdate = true;
      resInst.frustumCulled = false;
      this.root.add(resInst);
    }

    // 3. Rejected village candidate markers
    if (telemetry.rejectedVillageSamples.length > 0) {
      const rejInst = new THREE.InstancedMesh(
        rejVillageGeo,
        rejVillageMat,
        telemetry.rejectedVillageSamples.length,
      );
      const dummy = new THREE.Object3D();
      for (let i = 0; i < telemetry.rejectedVillageSamples.length; i++) {
        const sample = telemetry.rejectedVillageSamples[i];
        const sy = Math.max(groundHeightAt(sample.x, sample.z), 0);
        dummy.position.set(sample.x, sy + 5.0, sample.z);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        rejInst.setMatrixAt(i, dummy.matrix);
      }
      rejInst.instanceMatrix.needsUpdate = true;
      rejInst.frustumCulled = false;
      this.root.add(rejInst);
    }

    // 4. Rejected resource spawn markers
    if (telemetry.rejectedResourceSamples.length > 0) {
      const rejResInst = new THREE.InstancedMesh(
        rejResGeo,
        rejResMat,
        telemetry.rejectedResourceSamples.length,
      );
      const dummy = new THREE.Object3D();
      for (let i = 0; i < telemetry.rejectedResourceSamples.length; i++) {
        const sample = telemetry.rejectedResourceSamples[i];
        const sy = Math.max(groundHeightAt(sample.x, sample.z), 0);
        dummy.position.set(sample.x, sy + 3.5, sample.z);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        rejResInst.setMatrixAt(i, dummy.matrix);
      }
      rejResInst.instanceMatrix.needsUpdate = true;
      rejResInst.frustumCulled = false;
      this.root.add(rejResInst);
    }

    this.built = true;
  }

  private createLabelSprite(text: string, colorHex: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(10, 18, 15, 0.82)';
      ctx.strokeStyle = colorHex;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(8, 8, 496, 80, 16);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text.slice(0, 32), 256, 48);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    this.disposables.push(texture, mat);

    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(22, 4.2, 1);
    sprite.renderOrder = 999;
    return sprite;
  }

  public dispose(): void {
    this.clear();
    this.root.removeFromParent();
  }
}
