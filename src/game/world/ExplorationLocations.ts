import * as THREE from 'three';
import {
  getCoastlineZAt,
  groundHeightAt,
  seededRandom,
} from '../math/noise';
import {
  BUILDING_WATER_BUFFER,
  findNearestValidLand,
  findNearestValidResourceLocation,
  isValidBuildingLocation,
  isValidResourceLocation,
} from './WorldPlacementValidator';
import type { ProceduralTextureSet } from './textures';
import type { WorldCollider, WorldLandmark } from '../types';
import type { WorldInteractable } from './WorldManager';

export type ExplorationLocationKind =
  | 'camp'
  | 'ruins'
  | 'mine'
  | 'cave'
  | 'location';

export interface ExplorationBedPlacement {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface ExplorationChestPlacement {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  loot: Array<{ itemId: string; count: number }>;
  coins: number;
  xp: number;
}

export interface ExplorationResourcePlacement {
  id: string;
  kind: 'wood' | 'stone' | 'iron-ore' | 'coal' | 'fiber';
  label: string;
  x: number;
  y: number;
  z: number;
}

export interface ExplorationLocationRecord {
  id: string;
  name: string;
  kind: ExplorationLocationKind;
  x: number;
  y: number;
  z: number;
  discoveryRadius: number;
  clearanceRadius: number;
  discoveryMessage: string;
  rootGroup: THREE.Group;
  detailGroup: THREE.Group;
  fireLights: THREE.PointLight[];
  emissiveMeshes: THREE.Mesh[];
}

interface LocationBlueprint {
  id: string;
  name: string;
  kind: ExplorationLocationKind;
  x: number;
  z: number;
  discoveryRadius: number;
  clearanceRadius: number;
  discoveryMessage: string;
}

export class ExplorationLocationManager {
  public readonly locations: ExplorationLocationRecord[] = [];
  private readonly parentGroup = new THREE.Group();
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly chestMeshes = new Map<string, { lid: THREE.Object3D; lockMat: THREE.MeshStandardMaterial }>();

  constructor(
    scene: THREE.Scene,
    textures: ProceduralTextureSet,
    registerCollider: (c: WorldCollider) => void,
    interactables: WorldInteractable[],
    landmarks: WorldLandmark[],
    onRegisterBed: (bed: ExplorationBedPlacement) => void,
    onRegisterChest: (chest: ExplorationChestPlacement) => void,
    onRegisterResource: (res: ExplorationResourcePlacement) => void,
    isBlockedSite?: (x: number, z: number, radius: number) => boolean,
  ) {
    scene.add(this.parentGroup);

    const timberMat = new THREE.MeshStandardMaterial({
      map: textures.barkMap,
      normalMap: textures.barkNormalMap,
      color: 0x6f5038,
      roughness: 0.9,
    });
    const plankMat = new THREE.MeshStandardMaterial({
      color: 0x8e6948,
      roughness: 0.85,
    });
    const stoneMat = new THREE.MeshStandardMaterial({
      map: textures.rockMap,
      normalMap: textures.rockNormalMap,
      roughnessMap: textures.rockRoughnessMap,
      color: 0x7e827d,
      roughness: 0.9,
      flatShading: true,
    });
    const sandstoneMat = new THREE.MeshStandardMaterial({
      color: 0xc59a62,
      roughness: 0.88,
      flatShading: true,
    });
    const mossStoneMat = new THREE.MeshStandardMaterial({
      color: 0x5c7252,
      roughness: 0.92,
      flatShading: true,
    });
    const canvasMat = new THREE.MeshStandardMaterial({
      color: 0xcab68c,
      roughness: 0.92,
      side: THREE.DoubleSide,
    });
    const darkCanvasMat = new THREE.MeshStandardMaterial({
      color: 0x5f6b4b,
      roughness: 0.92,
      side: THREE.DoubleSide,
    });
    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x454b52,
      roughness: 0.52,
      metalness: 0.65,
    });
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x6ad1e6,
      emissive: 0x2299bb,
      emissiveIntensity: 0.85,
      roughness: 0.25,
    });
    const emberMat = new THREE.MeshStandardMaterial({
      color: 0xff8a2b,
      emissive: 0xff5a18,
      emissiveIntensity: 1.4,
      roughness: 0.5,
    });
    const clothBedMat = new THREE.MeshStandardMaterial({
      color: 0x9b4638,
      roughness: 0.88,
    });
    const pillowMat = new THREE.MeshStandardMaterial({
      color: 0xe6dcc8,
      roughness: 0.85,
    });

    this.disposables.push(
      timberMat,
      plankMat,
      stoneMat,
      sandstoneMat,
      mossStoneMat,
      canvasMat,
      darkCanvasMat,
      ironMat,
      crystalMat,
      emberMat,
      clothBedMat,
      pillowMat,
    );

    const coastTreasureX = 880;
    const coastTreasureZ = getCoastlineZAt(coastTreasureX) - 24;

    const blueprints: LocationBlueprint[] = [
      {
        id: 'loc-abandoned-cabin',
        name: 'Abandoned Cabin',
        kind: 'location',
        x: -460,
        z: 245,
        discoveryRadius: 28,
        clearanceRadius: 24,
        discoveryMessage:
          'Discovered the Abandoned Cabin — an old woodsman shelter with a usable bed and supply chest.',
      },
      {
        id: 'loc-forest-camp',
        name: 'Whispering Forest Camp',
        kind: 'camp',
        x: -690,
        z: -210,
        discoveryRadius: 28,
        clearanceRadius: 24,
        discoveryMessage:
          'Discovered Whispering Forest Camp — an abandoned ranger campsite beneath towering pines.',
      },
      {
        id: 'loc-hunter-camp',
        name: 'Ridge Hunter Camp',
        kind: 'camp',
        x: 380,
        z: -480,
        discoveryRadius: 28,
        clearanceRadius: 24,
        discoveryMessage:
          'Discovered Ridge Hunter Camp — lookouts and pelts left by frontier trackers.',
      },
      {
        id: 'loc-ruined-village',
        name: 'Mossy Ruined Village',
        kind: 'ruins',
        x: -360,
        z: 920,
        discoveryRadius: 42,
        clearanceRadius: 44,
        discoveryMessage:
          'Discovered the Ruined Village — crumbling stone cottages overtaken by vines and wildflowers.',
      },
      {
        id: 'loc-ancient-tower',
        name: 'Ancient Stone Tower',
        kind: 'ruins',
        x: -230,
        z: -820,
        discoveryRadius: 32,
        clearanceRadius: 26,
        discoveryMessage:
          'Discovered the Ancient Tower — a weathered highland spire guarding forgotten relics.',
      },
      {
        id: 'loc-sunstone-mine',
        name: 'Sunstone Mine',
        kind: 'mine',
        x: 840,
        z: -330,
        discoveryRadius: 36,
        clearanceRadius: 32,
        discoveryMessage:
          'Discovered Sunstone Mine — rich seams of iron ore and coal glinting inside the timbered shaft.',
      },
      {
        id: 'loc-echoing-cave',
        name: 'Echoing Crystal Cave',
        kind: 'cave',
        x: -780,
        z: -950,
        discoveryRadius: 34,
        clearanceRadius: 30,
        discoveryMessage:
          'Discovered Echoing Crystal Cave — luminescent azure crystals illuminate rich underground veins.',
      },
      {
        id: 'loc-ridge-watchtower',
        name: 'Borderland Watchtower',
        kind: 'location',
        x: 690,
        z: -860,
        discoveryRadius: 32,
        clearanceRadius: 26,
        discoveryMessage:
          'Discovered Borderland Watchtower — a stone frontier outpost overlooking the eastern pass.',
      },
      {
        id: 'loc-ancient-ruins',
        name: 'Sunstone Temple Ruins',
        kind: 'ruins',
        x: 1560,
        z: 380,
        discoveryRadius: 42,
        clearanceRadius: 40,
        discoveryMessage:
          'Discovered Sunstone Temple Ruins — sunken desert monoliths guarding ancient treasure.',
      },
      {
        id: 'loc-hidden-treasure',
        name: 'Smuggler’s Treasure Cove',
        kind: 'location',
        x: coastTreasureX,
        z: coastTreasureZ,
        discoveryRadius: 32,
        clearanceRadius: 26,
        discoveryMessage:
          'Discovered Smuggler’s Treasure Cove — weathered ship ribs and hidden coastal bounty!',
      },
    ];

    const registerValidatedResource = (res: ExplorationResourcePlacement) => {
      const safePos = isValidResourceLocation(res.x, res.z, res.kind)
        ? { x: res.x, y: groundHeightAt(res.x, res.z), z: res.z }
        : findNearestValidResourceLocation(res.x, res.z, res.kind, 28);
      if (!safePos) return;
      onRegisterResource({
        ...res,
        x: safePos.x,
        y: safePos.y,
        z: safePos.z,
      });
    };

    for (const bp of blueprints) {
      const site = this.findDryLocationSite(
        bp.x,
        bp.z,
        isBlockedSite,
        bp.clearanceRadius,
        bp.id === 'loc-hidden-treasure',
      );
      const wx = site.x;
      const wz = site.z;
      const wy = groundHeightAt(wx, wz);

      const rootGroup = new THREE.Group();
      rootGroup.position.set(wx, wy, wz);
      const detailGroup = new THREE.Group();
      rootGroup.add(detailGroup);
      this.parentGroup.add(rootGroup);

      const fireLights: THREE.PointLight[] = [];
      const emissiveMeshes: THREE.Mesh[] = [];

      if (bp.id === 'loc-abandoned-cabin') {
        this.buildAbandonedCabin(
          bp,
          wx,
          wy,
          wz,
          rootGroup,
          detailGroup,
          timberMat,
          plankMat,
          stoneMat,
          clothBedMat,
          pillowMat,
          ironMat,
          registerCollider,
          onRegisterBed,
          onRegisterChest,
          registerValidatedResource,
        );
      } else if (bp.id === 'loc-forest-camp' || bp.id === 'loc-hunter-camp') {
        this.buildCampSite(
          bp,
          wx,
          wy,
          wz,
          rootGroup,
          detailGroup,
          timberMat,
          plankMat,
          stoneMat,
          bp.id === 'loc-hunter-camp' ? darkCanvasMat : canvasMat,
          clothBedMat,
          pillowMat,
          emberMat,
          ironMat,
          fireLights,
          emissiveMeshes,
          registerCollider,
          onRegisterBed,
          onRegisterChest,
          registerValidatedResource,
        );
      } else if (bp.id === 'loc-ruined-village') {
        this.buildRuinedVillage(
          bp,
          wx,
          wy,
          wz,
          rootGroup,
          detailGroup,
          stoneMat,
          mossStoneMat,
          timberMat,
          ironMat,
          registerCollider,
          onRegisterChest,
          registerValidatedResource,
        );
      } else if (bp.id === 'loc-ancient-tower' || bp.id === 'loc-ridge-watchtower') {
        this.buildTowerLocation(
          bp,
          wx,
          wy,
          wz,
          rootGroup,
          detailGroup,
          stoneMat,
          timberMat,
          plankMat,
          emberMat,
          ironMat,
          fireLights,
          emissiveMeshes,
          registerCollider,
          onRegisterChest,
          registerValidatedResource,
        );
      } else if (bp.id === 'loc-sunstone-mine') {
        this.buildMineLocation(
          bp,
          wx,
          wy,
          wz,
          rootGroup,
          detailGroup,
          timberMat,
          plankMat,
          stoneMat,
          ironMat,
          crystalMat,
          fireLights,
          emissiveMeshes,
          registerCollider,
          onRegisterChest,
          registerValidatedResource,
        );
      } else if (bp.id === 'loc-echoing-cave') {
        this.buildCaveLocation(
          bp,
          wx,
          wy,
          wz,
          rootGroup,
          detailGroup,
          stoneMat,
          mossStoneMat,
          crystalMat,
          ironMat,
          fireLights,
          emissiveMeshes,
          registerCollider,
          onRegisterChest,
          registerValidatedResource,
        );
      } else if (bp.id === 'loc-ancient-ruins') {
        this.buildDesertRuins(
          bp,
          wx,
          wy,
          wz,
          rootGroup,
          detailGroup,
          sandstoneMat,
          emberMat,
          ironMat,
          fireLights,
          emissiveMeshes,
          registerCollider,
          onRegisterChest,
          registerValidatedResource,
        );
      } else {
        this.buildTreasureCove(
          bp,
          wx,
          wy,
          wz,
          rootGroup,
          detailGroup,
          timberMat,
          plankMat,
          darkCanvasMat,
          ironMat,
          registerCollider,
          onRegisterChest,
          registerValidatedResource,
        );
      }

      const record: ExplorationLocationRecord = {
        id: bp.id,
        name: bp.name,
        kind: bp.kind,
        x: wx,
        y: wy,
        z: wz,
        discoveryRadius: bp.discoveryRadius,
        clearanceRadius: bp.clearanceRadius,
        discoveryMessage: bp.discoveryMessage,
        rootGroup,
        detailGroup,
        fireLights,
        emissiveMeshes,
      };
      this.locations.push(record);

      landmarks.push({
        id: bp.id,
        name: bp.name,
        kind: bp.kind,
        x: wx,
        z: wz,
        discovered: false,
      });

      // Sign/discovery marker interactable if not chest/bed
      interactables.push({
        id: `${bp.id}-plaque`,
        label: bp.name,
        actionVerb: 'Survey',
        kind: 'cairn',
        x: wx,
        y: wy,
        z: wz,
        radius: 4.5,
        collected: false,
        message: bp.discoveryMessage,
      });
    }
  }

  private findDryLocationSite(
    targetX: number,
    targetZ: number,
    isBlocked?: (x: number, z: number, r: number) => boolean,
    clearanceRadius = 24,
    isCoastal = false,
  ): { x: number; z: number } {
    const rand = seededRandom(Math.round(targetX * 13 + targetZ * 37 + 911));
    const waterBuffer = isCoastal ? BUILDING_WATER_BUFFER * 0.42 : BUILDING_WATER_BUFFER;
    const halfSpan = Math.max(7, Math.min(14, clearanceRadius * 0.38));

    for (let attempt = 0; attempt < 36; attempt++) {
      const spread = attempt === 0 ? 0 : 18 + attempt * 14;
      const a = rand() * Math.PI * 2;
      const cx = targetX + Math.cos(a) * spread;
      const cz = targetZ + Math.sin(a) * spread;
      const cy = groundHeightAt(cx, cz);
      if (cy > 46) continue;
      if (!isValidBuildingLocation(cx, cz, halfSpan, halfSpan, 0, waterBuffer, 0.3)) continue;
      if (isBlocked && isBlocked(cx, cz, clearanceRadius + 16)) continue;
      return { x: cx, z: cz };
    }

    const nearest = findNearestValidLand(
      targetX,
      targetZ,
      waterBuffer + 4,
      0.26,
      360,
    );
    return { x: nearest.x, z: nearest.z };
  }

  private addBox(
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    ry = 0,
    castShadow = true,
  ): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    this.disposables.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private addCylinder(
    parent: THREE.Object3D,
    rt: number,
    rb: number,
    h: number,
    seg: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    castShadow = true,
  ): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(rt, rb, h, seg);
    this.disposables.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private createBedVisual(
    parent: THREE.Object3D,
    lx: number,
    ly: number,
    lz: number,
    yaw: number,
    timberMat: THREE.Material,
    clothMat: THREE.Material,
    pillowMat: THREE.Material,
  ): void {
    const g = new THREE.Group();
    g.position.set(lx, ly, lz);
    g.rotation.y = yaw;
    this.addBox(g, 1.15, 0.24, 2.05, 0, 0.2, 0, timberMat);
    this.addBox(g, 1.15, 0.65, 0.12, 0, 0.48, -0.96, timberMat);
    this.addBox(g, 1.04, 0.18, 1.88, 0, 0.36, 0.02, clothMat);
    this.addBox(g, 0.78, 0.14, 0.42, 0, 0.47, -0.64, pillowMat);
    parent.add(g);
  }

  private createChestVisual(
    chestId: string,
    parent: THREE.Object3D,
    lx: number,
    ly: number,
    lz: number,
    yaw: number,
    plankMat: THREE.Material,
    ironMat: THREE.Material,
  ): void {
    const g = new THREE.Group();
    g.position.set(lx, ly, lz);
    g.rotation.y = yaw;

    this.addBox(g, 0.94, 0.5, 0.62, 0, 0.25, 0, plankMat);
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.5, -0.31);
    const lid = this.addBox(lidPivot, 0.96, 0.18, 0.64, 0, 0.08, 0.31, plankMat);
    lid.castShadow = true;
    this.addBox(lidPivot, 0.98, 0.19, 0.12, 0, 0.08, 0.31, ironMat);
    g.add(lidPivot);

    const lockMat = new THREE.MeshStandardMaterial({
      color: 0xe6b84d,
      emissive: 0x6a4910,
      emissiveIntensity: 0.4,
      metalness: 0.7,
      roughness: 0.35,
    });
    this.disposables.push(lockMat);
    this.addBox(g, 0.16, 0.18, 0.08, 0, 0.45, 0.33, lockMat);

    this.chestMeshes.set(chestId, { lid: lidPivot, lockMat });
    parent.add(g);
  }

  public markChestOpened(chestId: string): void {
    const entry = this.chestMeshes.get(chestId);
    if (!entry) return;
    entry.lid.rotation.x = -1.15;
    entry.lockMat.emissiveIntensity = 0;
  }

  private buildAbandonedCabin(
    bp: LocationBlueprint,
    wx: number,
    wy: number,
    wz: number,
    root: THREE.Group,
    detail: THREE.Group,
    timberMat: THREE.Material,
    plankMat: THREE.Material,
    stoneMat: THREE.Material,
    clothMat: THREE.Material,
    pillowMat: THREE.Material,
    ironMat: THREE.Material,
    registerCollider: (c: WorldCollider) => void,
    onRegisterBed: (bed: ExplorationBedPlacement) => void,
    onRegisterChest: (chest: ExplorationChestPlacement) => void,
    onRegisterResource: (res: ExplorationResourcePlacement) => void,
  ): void {
    // Timber floor platform
    this.addBox(root, 6.2, 0.35, 5.4, 0, 0.1, 0, plankMat);
    // Walkable cabin perimeter walls leaving front door opening at z=+2.5
    this.addBox(root, 6.2, 2.8, 0.28, 0, 1.55, -2.5, timberMat); // back
    this.addBox(root, 0.28, 2.8, 5.2, -2.95, 1.55, 0, timberMat); // left
    this.addBox(root, 0.28, 2.8, 5.2, 2.95, 1.55, 0, timberMat); // right
    this.addBox(root, 2.25, 2.8, 0.28, -1.85, 1.55, 2.5, timberMat); // front-left
    this.addBox(root, 2.25, 2.8, 0.28, 1.85, 1.55, 2.5, timberMat); // front-right
    this.addBox(root, 1.7, 0.65, 0.28, 0, 2.62, 2.5, timberMat); // lintel

    // Pitched weathered roof
    const roofL = this.addBox(root, 3.8, 0.2, 6.0, -1.55, 3.55, 0, plankMat);
    roofL.rotation.z = 0.45;
    const roofR = this.addBox(root, 3.8, 0.2, 6.0, 1.55, 3.55, 0, plankMat);
    roofR.rotation.z = -0.45;

    // Stone chimney
    this.addBox(detail, 1.0, 4.4, 1.0, 2.6, 2.2, -1.6, stoneMat);

    // Colliders for outer walls leaving doorway open
    registerCollider({ kind: 'cylinder', x: wx - 2.9, z: wz, radius: 0.7, minY: wy, maxY: wy + 3 });
    registerCollider({ kind: 'cylinder', x: wx + 2.9, z: wz, radius: 0.7, minY: wy, maxY: wy + 3 });
    registerCollider({ kind: 'cylinder', x: wx, z: wz - 2.5, radius: 0.9, minY: wy, maxY: wy + 3 });

    // Interior bed & chest
    this.createBedVisual(detail, -1.75, 0.26, -1.05, 0, timberMat, clothMat, pillowMat);
    onRegisterBed({
      id: `${bp.id}-bed`,
      label: 'Cabin Bed',
      x: wx - 1.75,
      y: wy + 0.3,
      z: wz - 1.05,
      yaw: 0,
    });

    const chestId = `${bp.id}-chest`;
    this.createChestVisual(chestId, detail, 1.65, 0.26, -1.55, 0, plankMat, ironMat);
    onRegisterChest({
      id: chestId,
      label: 'Woodsman Chest',
      x: wx + 1.65,
      y: wy + 0.3,
      z: wz - 1.55,
      loot: [
        { itemId: 'wood', count: 8 },
        { itemId: 'fiber', count: 5 },
        { itemId: 'hunter-knife', count: 1 },
      ],
      coins: 28,
      xp: 35,
    });

    onRegisterResource({
      id: `${bp.id}-wood-1`,
      kind: 'wood',
      label: 'Chopped Firewood Pile',
      x: wx + 4.4,
      y: groundHeightAt(wx + 4.4, wz + 1.2),
      z: wz + 1.2,
    });
  }

  private buildCampSite(
    bp: LocationBlueprint,
    wx: number,
    wy: number,
    wz: number,
    root: THREE.Group,
    detail: THREE.Group,
    timberMat: THREE.Material,
    plankMat: THREE.Material,
    stoneMat: THREE.Material,
    canvasMat: THREE.Material,
    clothMat: THREE.Material,
    pillowMat: THREE.Material,
    emberMat: THREE.Material,
    ironMat: THREE.Material,
    fireLights: THREE.PointLight[],
    emissiveMeshes: THREE.Mesh[],
    registerCollider: (c: WorldCollider) => void,
    onRegisterBed: (bed: ExplorationBedPlacement) => void,
    onRegisterChest: (chest: ExplorationChestPlacement) => void,
    onRegisterResource: (res: ExplorationResourcePlacement) => void,
  ): void {
    // Two pitched canvas tents
    const tentGeo = new THREE.ConeGeometry(2.3, 2.5, 4);
    this.disposables.push(tentGeo);
    const tent1 = new THREE.Mesh(tentGeo, canvasMat);
    tent1.position.set(-4.2, 1.25, -2.2);
    tent1.rotation.y = Math.PI * 0.25;
    tent1.castShadow = true;
    root.add(tent1);

    const tent2 = new THREE.Mesh(tentGeo, canvasMat);
    tent2.position.set(4.0, 1.1, -2.8);
    tent2.scale.setScalar(0.85);
    tent2.rotation.y = 0.4;
    tent2.castShadow = true;
    root.add(tent2);

    registerCollider({ kind: 'cylinder', x: wx - 4.2, z: wz - 2.2, radius: 1.8, minY: wy, maxY: wy + 2.5 });
    registerCollider({ kind: 'cylinder', x: wx + 4.0, z: wz - 2.8, radius: 1.5, minY: wy, maxY: wy + 2.4 });

    // Central stone fire ring + embers + light
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8;
      this.addCylinder(detail, 0.22, 0.26, 0.24, 6, Math.cos(a) * 0.9, 0.1, Math.sin(a) * 0.9, stoneMat);
    }
    const embers = this.addCylinder(detail, 0.55, 0.65, 0.14, 7, 0, 0.08, 0, emberMat, false);
    emissiveMeshes.push(embers);
    const fireLight = new THREE.PointLight(0xff8e38, 1.8, 16, 1.8);
    fireLight.position.set(0, 0.9, 0);
    detail.add(fireLight);
    fireLights.push(fireLight);

    // Log benches
    this.addCylinder(detail, 0.22, 0.24, 2.2, 7, 0, 0.2, 2.4, timberMat).rotation.z = Math.PI / 2;

    // Camp bedroll
    this.createBedVisual(detail, -2.5, 0, 2.6, 0.55, timberMat, clothMat, pillowMat);
    onRegisterBed({
      id: `${bp.id}-bed`,
      label: 'Camp Bedroll',
      x: wx - 2.5,
      y: wy,
      z: wz + 2.6,
      yaw: 0.55,
    });

    const isHunter = bp.id === 'loc-hunter-camp';
    const chestId = `${bp.id}-chest`;
    this.createChestVisual(chestId, detail, 2.4, 0, 1.8, -0.5, plankMat, ironMat);
    onRegisterChest({
      id: chestId,
      label: isHunter ? 'Tracker Supply Chest' : 'Ranger Stash',
      x: wx + 2.4,
      y: wy,
      z: wz + 1.8,
      loot: isHunter
        ? [
            { itemId: 'arrow', count: 12 },
            { itemId: 'leather', count: 4 },
            { itemId: 'cooked-meat', count: 3 },
          ]
        : [
            { itemId: 'wood', count: 6 },
            { itemId: 'torch', count: 2 },
            { itemId: 'sun-apple', count: 3 },
          ],
      coins: 35,
      xp: 40,
    });

    onRegisterResource({
      id: `${bp.id}-res-1`,
      kind: 'wood',
      label: 'Camp Timber Stack',
      x: wx + 5.2,
      y: groundHeightAt(wx + 5.2, wz + 2.0),
      z: wz + 2.0,
    });
  }

  private buildRuinedVillage(
    bp: LocationBlueprint,
    wx: number,
    wy: number,
    wz: number,
    root: THREE.Group,
    detail: THREE.Group,
    stoneMat: THREE.Material,
    mossStoneMat: THREE.Material,
    timberMat: THREE.Material,
    ironMat: THREE.Material,
    registerCollider: (c: WorldCollider) => void,
    onRegisterChest: (chest: ExplorationChestPlacement) => void,
    onRegisterResource: (res: ExplorationResourcePlacement) => void,
  ): void {
    const cottages = [
      { ox: -10, oz: -6, yaw: 0.2 },
      { ox: 11, oz: -4, yaw: -0.35 },
      { ox: -3, oz: 12, yaw: 1.2 },
    ];
    for (const c of cottages) {
      const g = new THREE.Group();
      const baseH = groundHeightAt(wx + c.ox, wz + c.oz) - wy;
      g.position.set(c.ox, baseH, c.oz);
      g.rotation.y = c.yaw;
      this.addBox(g, 5.2, 2.1, 0.45, 0, 1.05, -2.2, mossStoneMat);
      this.addBox(g, 0.45, 1.65, 4.4, -2.4, 0.82, 0, stoneMat);
      this.addBox(g, 0.45, 2.4, 3.0, 2.4, 1.2, -0.7, mossStoneMat);
      this.addBox(g, 4.2, 0.18, 0.25, 0.2, 0.2, 1.6, timberMat, 0.35);
      root.add(g);
      registerCollider({ kind: 'cylinder', x: wx + c.ox, z: wz + c.oz, radius: 2.6, minY: wy + baseH, maxY: wy + baseH + 3 });
    }

    // Broken well in center
    this.addCylinder(detail, 1.2, 1.3, 1.0, 8, 0, 0.5, 0, mossStoneMat);
    registerCollider({ kind: 'cylinder', x: wx, z: wz, radius: 1.35, minY: wy, maxY: wy + 1.5 });

    const chestId = `${bp.id}-chest`;
    this.createChestVisual(chestId, detail, -10.0, groundHeightAt(wx - 10, wz - 6) - wy, -6.2, 0.2, timberMat, ironMat);
    onRegisterChest({
      id: chestId,
      label: 'Relic Chest',
      x: wx - 10.0,
      y: groundHeightAt(wx - 10, wz - 6),
      z: wz - 6.2,
      loot: [
        { itemId: 'iron-ore', count: 5 },
        { itemId: 'stone', count: 6 },
        { itemId: 'apothecary-tonic', count: 2 },
      ],
      coins: 55,
      xp: 60,
    });

    onRegisterResource({
      id: `${bp.id}-stone-1`,
      kind: 'stone',
      label: 'Collapsed Masonry',
      x: wx + 5.5,
      y: groundHeightAt(wx + 5.5, wz + 5.0),
      z: wz + 5.0,
    });
  }

  private buildTowerLocation(
    bp: LocationBlueprint,
    wx: number,
    wy: number,
    wz: number,
    root: THREE.Group,
    detail: THREE.Group,
    stoneMat: THREE.Material,
    timberMat: THREE.Material,
    plankMat: THREE.Material,
    emberMat: THREE.Material,
    ironMat: THREE.Material,
    fireLights: THREE.PointLight[],
    emissiveMeshes: THREE.Mesh[],
    registerCollider: (c: WorldCollider) => void,
    onRegisterChest: (chest: ExplorationChestPlacement) => void,
    onRegisterResource: (res: ExplorationResourcePlacement) => void,
  ): void {
    // Tall cylindrical keep + battlements
    this.addCylinder(root, 3.6, 4.1, 2.2, 10, 0, 1.1, 0, stoneMat);
    this.addCylinder(root, 2.75, 3.2, 11.5, 10, 0, 7.2, 0, stoneMat);
    this.addCylinder(root, 3.25, 2.9, 1.2, 10, 0, 13.2, 0, stoneMat);
    // Timber balcony scaffold
    this.addCylinder(detail, 3.55, 3.55, 0.25, 10, 0, 12.6, 0, plankMat);
    registerCollider({ kind: 'cylinder', x: wx, z: wz, radius: 4.1, minY: wy, maxY: wy + 14 });

    // Brazier outside doorway
    this.addCylinder(detail, 0.45, 0.35, 1.1, 7, 4.8, 0.55, 2.2, ironMat);
    const brazierFire = this.addCylinder(detail, 0.32, 0.22, 0.25, 6, 4.8, 1.18, 2.2, emberMat, false);
    emissiveMeshes.push(brazierFire);
    const light = new THREE.PointLight(0xff9244, 1.9, 18, 1.7);
    light.position.set(4.8, 1.9, 2.2);
    detail.add(light);
    fireLights.push(light);

    const chestId = `${bp.id}-chest`;
    this.createChestVisual(chestId, detail, -4.5, groundHeightAt(wx - 4.5, wz + 2.5) - wy, 2.5, 0.6, timberMat, ironMat);
    onRegisterChest({
      id: chestId,
      label: bp.id === 'loc-ancient-tower' ? 'Ancient Spire Coffer' : 'Watchtower Armament Chest',
      x: wx - 4.5,
      y: groundHeightAt(wx - 4.5, wz + 2.5),
      z: wz + 2.5,
      loot:
        bp.id === 'loc-ancient-tower'
          ? [
              { itemId: 'steel-sword', count: 1 },
              { itemId: 'iron-ore', count: 4 },
            ]
          : [
              { itemId: 'crossbow', count: 1 },
              { itemId: 'arrow', count: 14 },
            ],
      coins: 75,
      xp: 80,
    });

    onRegisterResource({
      id: `${bp.id}-stone`,
      kind: 'stone',
      label: 'Fallen Tower Stone',
      x: wx + 6.4,
      y: groundHeightAt(wx + 6.4, wz - 3.2),
      z: wz - 3.2,
    });
  }

  private buildMineLocation(
    bp: LocationBlueprint,
    wx: number,
    wy: number,
    wz: number,
    root: THREE.Group,
    detail: THREE.Group,
    timberMat: THREE.Material,
    plankMat: THREE.Material,
    stoneMat: THREE.Material,
    ironMat: THREE.Material,
    crystalMat: THREE.Material,
    fireLights: THREE.PointLight[],
    emissiveMeshes: THREE.Mesh[],
    registerCollider: (c: WorldCollider) => void,
    onRegisterChest: (chest: ExplorationChestPlacement) => void,
    onRegisterResource: (res: ExplorationResourcePlacement) => void,
  ): void {
    // Rock mound & recessed mine portal
    this.addBox(root, 12, 7.5, 8, 0, 3.6, -5.5, stoneMat);
    // Timbered mine entrance frame
    this.addBox(root, 0.45, 3.6, 0.45, -2.0, 1.8, -0.5, timberMat);
    this.addBox(root, 0.45, 3.6, 0.45, 2.0, 1.8, -0.5, timberMat);
    this.addBox(root, 4.8, 0.45, 0.55, 0, 3.65, -0.5, timberMat);
    // Dark tunnel backing
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x101316, roughness: 0.98 });
    this.disposables.push(darkMat);
    this.addBox(root, 3.4, 3.2, 0.5, 0, 1.6, -1.6, darkMat, 0, false);

    // Rail tracks & minecart
    this.addBox(detail, 0.1, 0.08, 10, -0.55, 0.05, 3.5, ironMat);
    this.addBox(detail, 0.1, 0.08, 10, 0.55, 0.05, 3.5, ironMat);
    for (let t = -1; t <= 8; t += 1.1) {
      this.addBox(detail, 1.5, 0.06, 0.2, 0, 0.02, t, timberMat);
    }
    this.addBox(detail, 1.3, 0.85, 1.8, 0, 0.65, 2.8, ironMat);

    // Glowing lantern crystals at portal
    const crys = this.addCylinder(detail, 0.15, 0.28, 0.9, 5, 2.3, 0.45, 0.2, crystalMat, false);
    emissiveMeshes.push(crys);
    const l = new THREE.PointLight(0x7ad6ee, 1.8, 16, 1.7);
    l.position.set(0, 2.8, 1.2);
    detail.add(l);
    fireLights.push(l);

    registerCollider({ kind: 'cylinder', x: wx - 3.6, z: wz - 4.5, radius: 3.2, minY: wy, maxY: wy + 7 });
    registerCollider({ kind: 'cylinder', x: wx + 3.6, z: wz - 4.5, radius: 3.2, minY: wy, maxY: wy + 7 });

    const chestId = `${bp.id}-chest`;
    this.createChestVisual(chestId, detail, -3.5, groundHeightAt(wx - 3.5, wz + 2.4) - wy, 2.4, 0.4, plankMat, ironMat);
    onRegisterChest({
      id: chestId,
      label: 'Prospector Chest',
      x: wx - 3.5,
      y: groundHeightAt(wx - 3.5, wz + 2.4),
      z: wz + 2.4,
      loot: [
        { itemId: 'iron-ore', count: 8 },
        { itemId: 'coal', count: 6 },
        { itemId: 'torch', count: 3 },
      ],
      coins: 65,
      xp: 75,
    });

    onRegisterResource({
      id: `${bp.id}-iron-1`,
      kind: 'iron-ore',
      label: 'Rich Iron Vein',
      x: wx + 4.4,
      y: groundHeightAt(wx + 4.4, wz + 1.8),
      z: wz + 1.8,
    });
    onRegisterResource({
      id: `${bp.id}-coal-1`,
      kind: 'coal',
      label: 'Coal Seam',
      x: wx - 4.6,
      y: groundHeightAt(wx - 4.6, wz + 4.6),
      z: wz + 4.6,
    });
  }

  private buildCaveLocation(
    bp: LocationBlueprint,
    wx: number,
    wy: number,
    wz: number,
    root: THREE.Group,
    detail: THREE.Group,
    stoneMat: THREE.Material,
    mossStoneMat: THREE.Material,
    crystalMat: THREE.Material,
    ironMat: THREE.Material,
    fireLights: THREE.PointLight[],
    emissiveMeshes: THREE.Mesh[],
    registerCollider: (c: WorldCollider) => void,
    onRegisterChest: (chest: ExplorationChestPlacement) => void,
    onRegisterResource: (res: ExplorationResourcePlacement) => void,
  ): void {
    // Vaulted rock archway & cavern hood
    this.addCylinder(root, 4.2, 5.2, 6.2, 7, -3.8, 3.0, -2.5, stoneMat);
    this.addCylinder(root, 4.0, 5.0, 6.4, 7, 3.8, 3.0, -2.5, stoneMat);
    this.addBox(root, 10.5, 2.8, 7.5, 0, 5.8, -3.2, mossStoneMat);
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0e141c, roughness: 0.96 });
    this.disposables.push(darkMat);
    this.addBox(root, 4.8, 4.2, 0.8, 0, 2.1, -5.2, darkMat, 0, false);

    // Crystal clusters
    const crystalOffsets = [
      [-1.8, -1.6],
      [2.1, -2.2],
      [-0.6, -3.4],
    ];
    for (const [cx, cz] of crystalOffsets) {
      const m = this.addCylinder(detail, 0.08, 0.34, 1.45, 5, cx, 0.72, cz, crystalMat, false);
      emissiveMeshes.push(m);
    }
    const light = new THREE.PointLight(0x52d4ff, 2.1, 18, 1.7);
    light.position.set(0, 2.4, -1.8);
    detail.add(light);
    fireLights.push(light);

    registerCollider({ kind: 'cylinder', x: wx - 4.2, z: wz - 2.5, radius: 2.8, minY: wy, maxY: wy + 6 });
    registerCollider({ kind: 'cylinder', x: wx + 4.2, z: wz - 2.5, radius: 2.8, minY: wy, maxY: wy + 6 });

    const chestId = `${bp.id}-chest`;
    this.createChestVisual(chestId, detail, 0.4, groundHeightAt(wx + 0.4, wz - 2.4) - wy, -2.4, 0.1, stoneMat, ironMat);
    onRegisterChest({
      id: chestId,
      label: 'Crystal Grotto Chest',
      x: wx + 0.4,
      y: groundHeightAt(wx + 0.4, wz - 2.4),
      z: wz - 2.4,
      loot: [
        { itemId: 'iron-ore', count: 7 },
        { itemId: 'coal', count: 5 },
        { itemId: 'spear', count: 1 },
      ],
      coins: 90,
      xp: 90,
    });

    onRegisterResource({
      id: `${bp.id}-iron`,
      kind: 'iron-ore',
      label: 'Cave Iron Seam',
      x: wx + 3.2,
      y: groundHeightAt(wx + 3.2, wz + 2.4),
      z: wz + 2.4,
    });
  }

  private buildDesertRuins(
    bp: LocationBlueprint,
    wx: number,
    wy: number,
    wz: number,
    root: THREE.Group,
    detail: THREE.Group,
    sandstoneMat: THREE.Material,
    emberMat: THREE.Material,
    ironMat: THREE.Material,
    fireLights: THREE.PointLight[],
    emissiveMeshes: THREE.Mesh[],
    registerCollider: (c: WorldCollider) => void,
    onRegisterChest: (chest: ExplorationChestPlacement) => void,
    onRegisterResource: (res: ExplorationResourcePlacement) => void,
  ): void {
    // Stepped sandstone dais
    this.addBox(root, 12, 0.6, 12, 0, 0.3, 0, sandstoneMat);
    this.addBox(root, 8.5, 0.6, 8.5, 0, 0.9, 0, sandstoneMat);
    // Four perimeter obelisks/pillars
    const cols = [
      [-4.6, -4.6, 5.4],
      [4.6, -4.6, 4.2],
      [-4.6, 4.6, 3.6],
      [4.6, 4.6, 5.8],
    ];
    for (const [cx, cz, ch] of cols) {
      this.addBox(root, 1.1, ch, 1.1, cx, ch * 0.5 + 0.5, cz, sandstoneMat);
      registerCollider({ kind: 'cylinder', x: wx + cx, z: wz + cz, radius: 0.85, minY: wy, maxY: wy + ch });
    }
    // Central sun altar & flame
    this.addBox(detail, 1.8, 1.4, 1.8, 0, 1.9, 0, sandstoneMat);
    const altarFlame = this.addCylinder(detail, 0.28, 0.42, 0.45, 6, 0, 2.7, 0, emberMat, false);
    emissiveMeshes.push(altarFlame);
    const l = new THREE.PointLight(0xffb44c, 2.0, 20, 1.6);
    l.position.set(0, 3.4, 0);
    detail.add(l);
    fireLights.push(l);

    const chestId = `${bp.id}-chest`;
    this.createChestVisual(chestId, detail, 0, 1.2, 2.4, 0, sandstoneMat, ironMat);
    onRegisterChest({
      id: chestId,
      label: 'Sunstone Relic Vault',
      x: wx,
      y: wy + 1.2,
      z: wz + 2.4,
      loot: [
        { itemId: 'steel-sword', count: 1 },
        { itemId: 'apothecary-tonic', count: 3 },
      ],
      coins: 120,
      xp: 110,
    });

    onRegisterResource({
      id: `${bp.id}-stone`,
      kind: 'stone',
      label: 'Carved Sandstone Block',
      x: wx - 7.5,
      y: groundHeightAt(wx - 7.5, wz + 1.2),
      z: wz + 1.2,
    });
  }

  private buildTreasureCove(
    bp: LocationBlueprint,
    wx: number,
    wy: number,
    wz: number,
    root: THREE.Group,
    detail: THREE.Group,
    timberMat: THREE.Material,
    plankMat: THREE.Material,
    sailMat: THREE.Material,
    ironMat: THREE.Material,
    registerCollider: (c: WorldCollider) => void,
    onRegisterChest: (chest: ExplorationChestPlacement) => void,
    onRegisterResource: (res: ExplorationResourcePlacement) => void,
  ): void {
    // Beached wooden ship hull ribs & broken mast
    this.addBox(root, 3.4, 1.1, 8.2, 0, 0.55, 0, plankMat, 0.35);
    this.addCylinder(root, 0.18, 0.26, 6.2, 7, -0.4, 3.1, -0.6, timberMat);
    const sail = this.addBox(detail, 3.2, 2.4, 0.08, 0.4, 3.9, -0.6, sailMat, 0.25);
    sail.rotation.z = 0.14;
    registerCollider({ kind: 'cylinder', x: wx, z: wz, radius: 2.6, minY: wy, maxY: wy + 3.5 });

    const chestId = `${bp.id}-chest`;
    this.createChestVisual(chestId, detail, 2.4, groundHeightAt(wx + 2.4, wz + 2.2) - wy, 2.2, -0.65, plankMat, ironMat);
    onRegisterChest({
      id: chestId,
      label: 'Smuggler’s Treasure Chest',
      x: wx + 2.4,
      y: groundHeightAt(wx + 2.4, wz + 2.2),
      z: wz + 2.2,
      loot: [
        { itemId: 'steel-sword', count: 1 },
        { itemId: 'crossbow', count: 1 },
        { itemId: 'arrow', count: 16 },
      ],
      coins: 150,
      xp: 120,
    });

    onRegisterResource({
      id: `${bp.id}-wood`,
      kind: 'wood',
      label: 'Driftwood Timbers',
      x: wx - 4.2,
      y: groundHeightAt(wx - 4.2, wz + 2.8),
      z: wz + 2.8,
    });
  }

  public update(elapsed: number, playerPos: THREE.Vector3, worldHours: number): void {
    const isNight = worldHours < 6.4 || worldHours >= 18.2;
    const detailDistSq = 210 * 210;
    const hideDistSq = 480 * 480;

    for (let i = 0; i < this.locations.length; i++) {
      const loc = this.locations[i];
      const dx = playerPos.x - loc.x;
      const dz = playerPos.z - loc.z;
      const dSq = dx * dx + dz * dz;

      loc.rootGroup.visible = dSq <= hideDistSq;
      if (!loc.rootGroup.visible) continue;

      const near = dSq <= detailDistSq;
      loc.detailGroup.visible = near;
      if (near && loc.fireLights.length > 0) {
        const flicker = 0.88 + Math.sin(elapsed * 7.2 + i) * 0.12;
        for (let j = 0; j < loc.fireLights.length; j++) {
          loc.fireLights[j].intensity = (isNight ? 2.4 : 1.0) * flicker;
        }
      }
    }
  }

  public isInsideClearance(x: number, z: number): boolean {
    for (let i = 0; i < this.locations.length; i++) {
      const loc = this.locations[i];
      const dx = x - loc.x;
      const dz = z - loc.z;
      if (dx * dx + dz * dz <= loc.clearanceRadius * loc.clearanceRadius) {
        return true;
      }
    }
    return false;
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.parentGroup.removeFromParent();
  }
}
