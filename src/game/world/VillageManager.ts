import * as THREE from 'three';
import type { WorldCollider, WorldLandmark } from '../types';
import {
  WATER_LEVEL,
  getBiomeAt,
  groundHeightAt,
  groundSlopeAt,
} from '../math/noise';
import {
  BUILDING_WATER_BUFFER,
  VILLAGE_WATER_BUFFER,
  findNearestValidLand,
  isLand,
  isNearWater,
  isValidBuildingLocation,
  isValidNPCSpawnLocation,
  isValidVillageLocation,
} from './WorldPlacementValidator';
import type { ProceduralTextureSet } from './textures';
import {
  type DecorativePropKind,
  type HouseSpec,
  type ShopSpec,
  type VillageMaterialPalette,
  buildBarn,
  buildBlacksmithForge,
  buildCentralSquare,
  buildChestProp,
  buildDecorativeProp,
  buildDesertHouse,
  buildDesertOasisPlot,
  buildDesertWell,
  buildFarmPlot,
  buildFenceRun,
  buildGuardPost,
  buildLampPost,
  buildMarketStall,
  buildProceduralShop,
  buildStorageShed,
  buildTerrainRoadStrip,
  buildVillageTree,
  buildWalkableInteriorHouse,
  buildWatchtower,
  buildWaterWell,
  buildWorkYard,
  createVillageMaterialPalette,
  mergeStaticGroupMeshes,
} from './VillageComponents';
import {
  type ProceduralVillageArchetype,
  type ProceduralVillageBlueprint,
  generateProceduralVillages,
} from './ProceduralVillageGenerator';
import type { WorldInteractable } from './WorldManager';
import type { ResolvedGraphicsProfile } from '../engine/GraphicsQualityManager';

export type VillageKind =
  | 'oakhollow'
  | 'forest'
  | 'farming'
  | 'mountain'
  | 'river'
  | 'plains'
  | 'trading'
  | 'desert'
  | 'oasis'
  | 'coastal'
  | 'valley';

export interface VillageSite {
  centerX: number;
  centerZ: number;
  elevation: number;
  clearanceRadius: number;
}

export interface VillageHouseRecord {
  id: string;
  villageId: string;
  bedId: string;
  doorEntryPos: THREE.Vector3;
  doorThresholdPos: THREE.Vector3;
  bedPos: THREE.Vector3;
  bedYaw: number;
}

export interface VillageBedPlacement {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface VillageDoorPlacement {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  minY: number;
  maxY: number;
  isOpen: boolean;
}

export interface VillageChestPlacement {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  loot: Array<{ itemId: string; count: number }>;
  coins: number;
  xp: number;
}

export interface VillageResourceYardRegistration {
  villageId: string;
  villageName: string;
  resourceKind: string;
  x: number;
  y: number;
  z: number;
}

export interface VillageSiteRecord extends VillageSite {
  id: string;
  name: string;
  nameAr?: string;
  kind: VillageKind;
  isProcedural?: boolean;
  archetype?: ProceduralVillageArchetype;
  resourceYardKind?: string;
  resourceYardPos?: THREE.Vector3;
  populationPlan?: ProceduralVillageBlueprint['populationPlan'];
  rootGroup: THREE.Group;
  detailGroup: THREE.Group;
  lampLights: THREE.PointLight[];
  houses: VillageHouseRecord[];
  workplaces: Record<string, THREE.Vector3>;
  guardWaypoints: THREE.Vector3[];
  farmCenter: THREE.Vector3;
  forgePos: THREE.Vector3;
  marketPos: THREE.Vector3;
}

export interface VillageManagerOptions {
  scene: THREE.Scene;
  textures: ProceduralTextureSet;
  isSoftwareGl: boolean;
  seed?: number;
  registerCollider: (collider: WorldCollider) => void;
  interactables: WorldInteractable[];
  landmarks: WorldLandmark[];
  onRegisterBed?: (bed: VillageBedPlacement) => void;
  onRegisterDoor?: (door: VillageDoorPlacement) => void;
  onRegisterChest?: (chest: VillageChestPlacement) => void;
  onRegisterResourceYard?: (yard: VillageResourceYardRegistration) => void;
}

interface RegionalBlueprint {
  id: string;
  name: string;
  kind: VillageKind;
  targetX: number;
  targetZ: number;
  clearanceRadius: number;
  houseCount: number;
  hasForge: boolean;
  hasFarm: boolean;
  stallCount: number;
  preferBiome?: 'Plains' | 'Forest' | 'Mountains' | 'Desert';
  requireValley?: boolean;
}

const VILLAGE_DRAW_DIST = 460;
const VILLAGE_DETAIL_DIST = 250;

/**
 * Deterministic procedural village generator supporting Oakhollow Village,
 * 8 regional settlements, plus 27 additional seeded procedural villages.
 */
export class VillageManager {
  public readonly site: VillageSite;
  public readonly villages: VillageSiteRecord[] = [];
  public readonly proceduralBlueprints: ProceduralVillageBlueprint[] = [];
  public readonly proceduralAttempts: number = 0;
  public readonly houseRecords: VillageHouseRecord[] = [];
  public readonly bedPlacements: VillageBedPlacement[] = [];
  public readonly chestPlacements: VillageChestPlacement[] = [];

  private readonly scene: THREE.Scene;
  private readonly seed: number;
  private readonly mats: VillageMaterialPalette;
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly registerCollider: (collider: WorldCollider) => void;
  private readonly interactables: WorldInteractable[];
  private readonly landmarks: WorldLandmark[];
  private readonly onRegisterBed?: (bed: VillageBedPlacement) => void;
  private readonly onRegisterDoor?: (door: VillageDoorPlacement) => void;
  private readonly onRegisterChest?: (chest: VillageChestPlacement) => void;
  private readonly onRegisterResourceYard?: (yard: VillageResourceYardRegistration) => void;
  private readonly chestLids = new Map<string, THREE.Object3D>();
  private readonly doorPivots = new Map<
    string,
    { pivot: THREE.Group; x: number; z: number; minY: number; maxY: number; isOpen: boolean }
  >();

  private readonly houseCount = 5;
  private readonly shopCount = 3;
  private drawDist = VILLAGE_DRAW_DIST;
  private detailDist = VILLAGE_DETAIL_DIST;
  private maxLights = 8;

  constructor(options: VillageManagerOptions) {
    this.scene = options.scene;
    this.seed = options.seed ?? 1337;
    this.registerCollider = options.registerCollider;
    this.interactables = options.interactables;
    this.landmarks = options.landmarks;
    this.onRegisterBed = options.onRegisterBed;
    this.onRegisterDoor = options.onRegisterDoor;
    this.onRegisterChest = options.onRegisterChest;
    this.onRegisterResourceYard = options.onRegisterResourceYard;

    this.site = VillageManager.findNaturalVillageSite();
    this.mats = createVillageMaterialPalette(options.textures, this.disposables);

    this.buildOakhollowVillage(options.isSoftwareGl);
    this.buildRegionalVillages(options.isSoftwareGl);

    const report = generateProceduralVillages(this.seed, this.villages);
    this.proceduralBlueprints = report.villages;
    this.proceduralAttempts = report.attempts;
    for (let i = 0; i < report.villages.length; i++) {
      this.constructProceduralVillage(report.villages[i], options.isSoftwareGl);
    }
  }

  /**
   * Finds a natural, flat, dry Plains clearing strictly outside oceans, lakes,
   * all 3 rivers (respecting VILLAGE_WATER_BUFFER), mountains, and the spawn glade.
   */
  public static findNaturalVillageSite(): VillageSite {
    let best: { cx: number; cz: number; score: number } | null = null;

    for (let cz = -120; cz <= 120; cz += 8) {
      for (let cx = -48; cx <= 112; cx += 8) {
        const distFromSpawn = Math.hypot(cx, cz - 4);
        if (distFromSpawn < 54) continue;

        if (
          !isValidVillageLocation(cx, cz, {
            waterBuffer: VILLAGE_WATER_BUFFER,
            footprintRadius: 43,
            maxSlope: 0.145,
            maxRelief: 5.0,
            allowedBiomes: ['Plains', 'Forest'],
          })
        ) {
          continue;
        }

        const centerH = groundHeightAt(cx, cz);
        if (centerH > 18) continue;
        const slope = groundSlopeAt(cx, cz, centerH);
        const hN = groundHeightAt(cx, cz - 24);
        const hS = groundHeightAt(cx, cz + 24);
        const hE = groundHeightAt(cx + 24, cz);
        const hW = groundHeightAt(cx - 24, cz);
        const relief = Math.max(centerH, hN, hS, hE, hW) - Math.min(centerH, hN, hS, hE, hW);

        const score =
          relief * 2.5 +
          slope * 35 +
          Math.abs(distFromSpawn - 68) * 0.06;

        if (!best || score < best.score) {
          best = { cx, cz, score };
        }
      }
    }

    if (best) {
      return {
        centerX: best.cx,
        centerZ: best.cz,
        elevation: groundHeightAt(best.cx, best.cz),
        clearanceRadius: 43,
      };
    }

    // Expanded spiral search guaranteed to stay on dry, flat inland terrain
    for (let r = 64; r <= 320; r += 16) {
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        const cx = Math.cos(ang) * r;
        const cz = Math.sin(ang) * r;
        if (
          isValidVillageLocation(cx, cz, {
            waterBuffer: VILLAGE_WATER_BUFFER,
            footprintRadius: 43,
            maxSlope: 0.16,
            maxRelief: 5.4,
            allowedBiomes: ['Plains', 'Forest'],
          })
        ) {
          return {
            centerX: cx,
            centerZ: cz,
            elevation: groundHeightAt(cx, cz),
            clearanceRadius: 43,
          };
        }
      }
    }

    const safe = findNearestValidLand(16, -78, VILLAGE_WATER_BUFFER, 0.16, 360);
    return {
      centerX: safe.x,
      centerZ: safe.z,
      elevation: safe.y,
      clearanceRadius: 43,
    };
  }

  public isInsideClearance(x: number, z: number): boolean {
    for (let i = 0; i < this.villages.length; i++) {
      const v = this.villages[i];
      const dist = Math.hypot(x - v.centerX, z - v.centerZ);
      if (dist < v.clearanceRadius) return true;
    }

    // Keep approach trail connecting spawn (0, 4) -> Oakhollow Square clear
    const vx = this.site.centerX;
    const vz = this.site.centerZ;
    const ax = 0;
    const az = 12;
    const abx = vx - ax;
    const abz = vz - az;
    const lenSq = abx * abx + abz * abz || 1;
    const t = THREE.MathUtils.clamp(((x - ax) * abx + (z - az) * abz) / lenSq, 0, 1);
    const projX = ax + abx * t;
    const projZ = az + abz * t;
    return Math.hypot(x - projX, z - projZ) < 5.5;
  }

  public getAllVillages(): VillageSiteRecord[] {
    return this.villages;
  }

  public getClearanceZones(): Array<{ x: number; z: number; radius: number }> {
    return this.villages.map((v) => ({
      x: v.centerX,
      z: v.centerZ,
      radius: v.clearanceRadius + 4,
    }));
  }

  public getBuildingCounts(): { houses: number; shops: number } {
    return { houses: this.houseCount, shops: this.shopCount };
  }

  public markChestOpened(chestId: string): void {
    const lid = this.chestLids.get(chestId);
    if (lid) {
      lid.rotation.x = -1.12;
    }
  }

  public setDoorOpen(
    doorId: string,
    isOpen: boolean,
  ): { x: number; z: number; minY: number; maxY: number; changed: boolean } | null {
    const rec = this.doorPivots.get(doorId);
    if (!rec) return null;
    const changed = rec.isOpen !== isOpen;
    rec.isOpen = isOpen;
    rec.pivot.rotation.y = isOpen ? -1.25 : 0;
    return {
      x: rec.x,
      z: rec.z,
      minY: rec.minY,
      maxY: rec.maxY,
      changed,
    };
  }

  private createBatchExcludedNoShadowSet(isSoftwareGl: boolean): Set<THREE.Material> {
    const noShadowMats = new Set<THREE.Material>([
      this.mats.stoneCobble,
      this.mats.roadGravel,
      this.mats.soilTilled,
      this.mats.wellWater,
      this.mats.oasisWater,
      this.mats.sandRoad,
      this.mats.windowGlow,
      this.mats.lanternGlow,
      this.mats.flowerAccent,
    ]);
    if (isSoftwareGl) {
      Object.values(this.mats).forEach((m) => noShadowMats.add(m));
    }
    return noShadowMats;
  }

  private finalizeVillageGroup(
    rootGroup: THREE.Group,
    detailGroup: THREE.Group,
    isSoftwareGl: boolean,
    excludedDetailNodes: Set<THREE.Object3D>,
  ): void {
    const noShadowMats = this.createBatchExcludedNoShadowSet(isSoftwareGl);
    const rootExclusions = new Set<THREE.Object3D>([detailGroup, ...excludedDetailNodes]);
    mergeStaticGroupMeshes(rootGroup, this.disposables, rootExclusions, noShadowMats);
    mergeStaticGroupMeshes(detailGroup, this.disposables, excludedDetailNodes, noShadowMats);
    detailGroup.matrixAutoUpdate = false;
    detailGroup.updateMatrix();
    rootGroup.matrixAutoUpdate = false;
    rootGroup.updateMatrix();
  }

  private buildOakhollowVillage(isSoftwareGl: boolean): void {
    const rootGroup = new THREE.Group();
    const detailGroup = new THREE.Group();
    rootGroup.add(detailGroup);
    this.scene.add(rootGroup);

    const cx = this.site.centerX;
    const cz = this.site.centerZ;
    const lampLights: THREE.PointLight[] = [];
    const villageHouses: VillageHouseRecord[] = [];
    const excludedChests = new Set<THREE.Object3D>();

    // 1. Central Village Square
    rootGroup.add(buildCentralSquare(cx, cz, 10.6, this.mats, this.disposables));
    this.landmarks.push({
      id: 'village-square',
      name: 'Oakhollow Village Square',
      kind: 'village',
      x: cx,
      z: cz,
      discovered: false,
    });

    // 2. Village Roads + Approach Trail toward Spawn Glade
    const roadPointsNS: Array<[number, number]> = [
      [cx, cz - 30],
      [cx, cz + 30],
    ];
    const roadPointsEW: Array<[number, number]> = [
      [cx - 30, cz],
      [cx + 31, cz],
    ];
    const approachTrail: Array<[number, number]> = [
      [cx - 4, cz + 10],
      [cx * 0.55 - 2, cz * 0.55 + 4],
      [cx * 0.25, cz * 0.2 + 2],
      [2, -6],
    ];
    const farmLane: Array<[number, number]> = [
      [cx + 12, cz + 2],
      [cx + 19, cz + 10],
      [cx + 21, cz + 18],
    ];
    rootGroup.add(
      buildTerrainRoadStrip(roadPointsNS, 4.4, this.mats, this.disposables),
      buildTerrainRoadStrip(roadPointsEW, 4.2, this.mats, this.disposables),
      buildTerrainRoadStrip(approachTrail, 3.2, this.mats, this.disposables),
      buildTerrainRoadStrip(farmLane, 3.0, this.mats, this.disposables),
    );

    // 3. Central Water Well
    const wellX = cx + 1.8;
    const wellZ = cz - 1.2;
    const wellY = groundHeightAt(wellX, wellZ);
    const well = buildWaterWell(this.mats, this.disposables);
    well.position.set(wellX, wellY, wellZ);
    rootGroup.add(well);
    this.registerCollider({
      kind: 'cylinder',
      x: wellX,
      z: wellZ,
      radius: 1.35,
      minY: wellY - 0.5,
      maxY: wellY + 3.8,
    });
    this.interactables.push({
      id: 'village-well',
      label: 'Oakhollow Water Well',
      actionVerb: 'Draw Water',
      kind: 'well',
      x: wellX,
      y: wellY,
      z: wellZ,
      radius: 3.4,
      collected: false,
      message: 'Drew cool spring water from Oakhollow Well (+10 Health & Stamina refreshed).',
    });

    // 4. Shops around the Square
    const shopPlacements: Array<{
      id: string;
      label: string;
      message: string;
      x: number;
      z: number;
      yaw: number;
      spec: ShopSpec;
    }> = [
      {
        id: 'village-bakery',
        label: 'Sunstone Bakery',
        message: 'Sunstone Bakery: Warm hearth loaves and honey tarts cool on the counter.',
        x: cx - 7.5,
        z: cz - 14.5,
        yaw: 0,
        spec: {
          width: 6.4,
          depth: 5.2,
          wallHeight: 3.3,
          roofHeight: 2.3,
          wallTone: 'cream',
          roofTone: 'terracotta',
          awningTone: 'amber',
          hasChimney: true,
          chimneySide: -1,
        },
      },
      {
        id: 'village-apothecary',
        label: 'Willow Apothecary',
        message: 'Willow Apothecary: Dried valley herbs and glass tonics line the stall.',
        x: cx + 7.6,
        z: cz - 14.4,
        yaw: 0,
        spec: {
          width: 6.0,
          depth: 5.0,
          wallHeight: 3.2,
          roofHeight: 2.2,
          wallTone: 'sage',
          roofTone: 'slate',
          awningTone: 'teal',
          hasChimney: true,
          chimneySide: 1,
        },
      },
      {
        id: 'village-outfitters',
        label: 'Valley Tool & Goods Shop',
        message: 'Valley Tool & Goods: Packs, lanterns, and sturdy boots for trailfarers.',
        x: cx - 14.8,
        z: cz - 6.8,
        yaw: Math.PI * 0.5,
        spec: {
          width: 6.2,
          depth: 5.0,
          wallHeight: 3.2,
          roofHeight: 2.2,
          wallTone: 'ochre',
          roofTone: 'cedar',
          awningTone: 'crimson',
          hasChimney: false,
        },
      },
    ];

    for (const s of shopPlacements) {
      const shopMesh = buildProceduralShop(s.spec, this.mats, this.disposables);
      const baseY = this.placeBuildingAt(
        shopMesh,
        s.x,
        s.z,
        s.yaw,
        s.spec.width,
        s.spec.depth + 1.4,
      );
      rootGroup.add(shopMesh);
      this.interactables.push({
        id: s.id,
        label: s.label,
        actionVerb: 'Inspect',
        kind: 'village',
        x: s.x + Math.sin(s.yaw) * (s.spec.depth * 0.5 + 1.3),
        y: baseY,
        z: s.z + Math.cos(s.yaw) * (s.spec.depth * 0.5 + 1.3),
        radius: 3.3,
        collected: false,
        message: s.message,
      });
    }

    // Oakhollow Blacksmith Forge
    const forgeX = cx + 19.5;
    const forgeZ = cz - 16.5;
    const forge = buildBlacksmithForge(this.mats, this.disposables);
    this.placeBuildingAt(forge, forgeX, forgeZ, -0.55, 6.2, 5.2);
    rootGroup.add(forge);

    // 5. Walkable Houses (with open doorways & interior beds!)
    const housePlacements: Array<{
      id: string;
      x: number;
      z: number;
      yaw: number;
      spec: HouseSpec;
    }> = [
      {
        id: 'oakhollow-house-1',
        x: cx - 15.5,
        z: cz + 7.2,
        yaw: Math.PI * 0.5,
        spec: {
          width: 5.8,
          depth: 4.8,
          wallHeight: 3.1,
          roofHeight: 2.1,
          wallTone: 'cream',
          roofTone: 'cedar',
          hasChimney: true,
          chimneySide: -1,
        },
      },
      {
        id: 'oakhollow-house-2',
        x: cx + 15.4,
        z: cz - 6.8,
        yaw: -Math.PI * 0.5,
        spec: {
          width: 6.2,
          depth: 5.2,
          wallHeight: 3.3,
          roofHeight: 2.3,
          wallTone: 'ochre',
          roofTone: 'terracotta',
          hasChimney: true,
          chimneySide: 1,
        },
      },
      {
        id: 'oakhollow-house-3',
        x: cx - 8.4,
        z: cz + 17.5,
        yaw: Math.PI,
        spec: {
          width: 5.6,
          depth: 4.6,
          wallHeight: 3.0,
          roofHeight: 2.0,
          wallTone: 'sage',
          roofTone: 'slate',
          hasChimney: true,
          chimneySide: -1,
        },
      },
      {
        id: 'oakhollow-house-4',
        x: cx + 8.6,
        z: cz + 17.4,
        yaw: Math.PI,
        spec: {
          width: 6.0,
          depth: 5.0,
          wallHeight: 3.1,
          roofHeight: 2.2,
          wallTone: 'cream',
          roofTone: 'terracotta',
          hasChimney: true,
          chimneySide: 1,
        },
      },
      {
        id: 'oakhollow-house-5',
        x: cx - 22.8,
        z: cz - 17.6,
        yaw: 0.42,
        spec: {
          width: 5.4,
          depth: 4.6,
          wallHeight: 2.95,
          roofHeight: 2.0,
          wallTone: 'ochre',
          roofTone: 'cedar',
          hasChimney: true,
          chimneySide: -1,
        },
      },
    ];

    for (const h of housePlacements) {
      const rec = this.placeWalkableHouse(
        rootGroup,
        'oakhollow',
        h.id,
        h.x,
        h.z,
        h.yaw,
        h.spec,
      );
      villageHouses.push(rec);
    }

    // 6. Farm
    const farmCx = cx + 22.5;
    const farmCz = cz + 14.5;
    rootGroup.add(
      buildFarmPlot(farmCx - 4.0, farmCz - 3.6, 5.4, 4.4, 'wheat', this.mats, this.disposables),
      buildFarmPlot(farmCx + 3.2, farmCz - 3.6, 5.4, 4.4, 'wheat', this.mats, this.disposables),
      buildFarmPlot(farmCx - 0.4, farmCz + 2.8, 10.6, 4.2, 'greens', this.mats, this.disposables),
    );
    this.addFence(detailGroup, [
      [farmCx - 8.2, farmCz - 1.5],
      [farmCx - 8.2, farmCz - 7.4],
      [farmCx + 7.8, farmCz - 7.4],
      [farmCx + 7.8, farmCz + 6.6],
      [farmCx - 8.2, farmCz + 6.6],
      [farmCx - 8.2, farmCz + 2.8],
    ], 2.7);
    this.addFence(detailGroup, [
      [cx - 20.5, cz + 2.5],
      [cx - 20.5, cz + 12.2],
      [cx - 12.5, cz + 12.2],
    ], 2.6);
    this.addFence(detailGroup, [
      [cx + 12.2, cz - 12.5],
      [cx + 21.0, cz - 12.5],
      [cx + 21.0, cz - 2.5],
    ], 2.6);

    const farmY = groundHeightAt(farmCx, farmCz);
    this.interactables.push({
      id: 'village-farm',
      label: 'Oakhollow Farmstead',
      actionVerb: 'Inspect',
      kind: 'village',
      x: farmCx - 8.5,
      y: farmY,
      z: farmCz + 0.6,
      radius: 3.4,
      collected: false,
      message: 'Oakhollow Farmstead: Golden wheat and crisp greens ripen in the sun.',
    });

    // 7. Street Lamps
    const lampSpots: Array<{ x: number; z: number; yaw: number; light: boolean }> = [
      { x: cx - 5.2, z: cz - 5.2, yaw: Math.PI * 0.25, light: !isSoftwareGl },
      { x: cx + 5.2, z: cz + 5.2, yaw: -Math.PI * 0.75, light: !isSoftwareGl },
      { x: cx - 9.8, z: cz - 1.8, yaw: Math.PI * 0.5, light: false },
      { x: cx + 9.8, z: cz + 1.8, yaw: -Math.PI * 0.5, light: false },
      { x: cx + 2.4, z: cz - 11.2, yaw: -Math.PI * 0.5, light: false },
      { x: cx - 2.6, z: cz + 12.6, yaw: Math.PI * 0.5, light: false },
      { x: cx - 19.5, z: cz + 2.2, yaw: 0, light: false },
      { x: cx + 14.5, z: cz + 3.2, yaw: Math.PI, light: false },
    ];
    for (const lp of lampSpots) {
      const ly = groundHeightAt(lp.x, lp.z);
      const lamp = buildLampPost(lp.light, this.mats, this.disposables, lampLights);
      lamp.position.set(lp.x, ly, lp.z);
      lamp.rotation.y = lp.yaw;
      rootGroup.add(lamp);
      this.registerCollider({
        kind: 'cylinder',
        x: lp.x,
        z: lp.z,
        radius: 0.28,
        minY: ly - 0.5,
        maxY: ly + 3.5,
      });
    }

    // 8. Curated Village Trees
    const treeSpots: Array<{ x: number; z: number; kind: 'broadleaf' | 'orchard'; scale: number }> = [
      { x: cx - 13.5, z: cz - 15.2, kind: 'broadleaf', scale: 1.05 },
      { x: cx + 14.2, z: cz - 15.6, kind: 'broadleaf', scale: 1.1 },
      { x: cx - 15.2, z: cz + 16.0, kind: 'broadleaf', scale: 1.0 },
      { x: cx + 15.0, z: cz + 21.5, kind: 'orchard', scale: 0.95 },
      { x: cx + 29.0, z: cz + 6.5, kind: 'orchard', scale: 1.0 },
      { x: cx + 29.5, z: cz + 18.5, kind: 'orchard', scale: 0.92 },
      { x: cx - 22.8, z: cz - 1.5, kind: 'broadleaf', scale: 1.08 },
      { x: cx - 25.5, z: cz - 11.0, kind: 'orchard', scale: 0.95 },
      { x: cx + 23.0, z: cz - 11.5, kind: 'broadleaf', scale: 1.02 },
      { x: cx + 2.8, z: cz - 23.5, kind: 'broadleaf', scale: 1.12 },
      { x: cx - 3.5, z: cz + 24.5, kind: 'orchard', scale: 0.96 },
    ];
    for (const t of treeSpots) {
      const ty = groundHeightAt(t.x, t.z);
      const tree = buildVillageTree(t.kind, this.mats, this.disposables);
      tree.position.set(t.x, ty - 0.08, t.z);
      tree.scale.setScalar(t.scale);
      tree.rotation.y = (t.x * 0.7 + t.z * 0.3) % (Math.PI * 2);
      rootGroup.add(tree);
      this.registerCollider({
        kind: 'cylinder',
        x: t.x,
        z: t.z,
        radius: 0.45 * t.scale,
        minY: ty - 0.5,
        maxY: ty + 4.8 * t.scale,
      });
    }

    // 9. Decorative Props + Village Chest
    this.placeDecorativeProps(detailGroup, cx, cz, farmCx, farmCz);
    const chestGroup = this.placeVillageChest(
      detailGroup,
      'oakhollow-chest',
      'Oakhollow Supply Chest',
      cx + 15.2,
      cz - 14.5,
      -0.3,
      [
        { itemId: 'wood', count: 6 },
        { itemId: 'fiber', count: 4 },
        { itemId: 'sun-apple', count: 3 },
      ],
      25,
      25,
    );
    excludedChests.add(chestGroup);

    this.finalizeVillageGroup(rootGroup, detailGroup, isSoftwareGl, excludedChests);

    this.villages.push({
      id: 'oakhollow',
      name: 'Oakhollow Village',
      kind: 'oakhollow',
      centerX: cx,
      centerZ: cz,
      elevation: this.site.elevation,
      clearanceRadius: this.site.clearanceRadius,
      rootGroup,
      detailGroup,
      lampLights,
      houses: villageHouses,
      workplaces: {
        square: new THREE.Vector3(cx, groundHeightAt(cx, cz), cz),
        forge: new THREE.Vector3(forgeX + 1.5, groundHeightAt(forgeX + 1.5, forgeZ + 2.5), forgeZ + 2.5),
        farm: new THREE.Vector3(farmCx, groundHeightAt(farmCx, farmCz), farmCz),
        bakery: new THREE.Vector3(cx - 7.5, groundHeightAt(cx - 7.5, cz - 10.5), cz - 10.5),
        apothecary: new THREE.Vector3(cx + 7.6, groundHeightAt(cx + 7.6, cz - 10.5), cz - 10.5),
        outfitters: new THREE.Vector3(cx - 10.8, groundHeightAt(cx - 10.8, cz - 6.8), cz - 6.8),
      },
      guardWaypoints: [
        new THREE.Vector3(cx - 8, groundHeightAt(cx - 8, cz + 4), cz + 4),
        new THREE.Vector3(cx + 9, groundHeightAt(cx + 9, cz + 4), cz + 4),
        new THREE.Vector3(cx + 9, groundHeightAt(cx + 9, cz - 8), cz - 8),
        new THREE.Vector3(cx - 8, groundHeightAt(cx - 8, cz - 8), cz - 8),
      ],
      farmCenter: new THREE.Vector3(farmCx, farmY, farmCz),
      forgePos: new THREE.Vector3(forgeX, groundHeightAt(forgeX, forgeZ), forgeZ),
      marketPos: new THREE.Vector3(cx, groundHeightAt(cx, cz), cz),
    });
  }

  private buildRegionalVillages(isSoftwareGl: boolean): void {
    const blueprints: RegionalBlueprint[] = [
      {
        id: 'pinehaven',
        name: 'Pinehaven',
        kind: 'forest',
        targetX: -540,
        targetZ: -260,
        clearanceRadius: 36,
        houseCount: 3,
        hasForge: false,
        hasFarm: false,
        stallCount: 1,
        preferBiome: 'Forest',
      },
      {
        id: 'greenfields',
        name: 'Greenfields',
        kind: 'farming',
        targetX: -280,
        targetZ: -45,
        clearanceRadius: 40,
        houseCount: 4,
        hasForge: true,
        hasFarm: true,
        stallCount: 2,
        preferBiome: 'Plains',
      },
      {
        id: 'cragwatch',
        name: 'Cragwatch',
        kind: 'mountain',
        targetX: 250,
        targetZ: -975,
        clearanceRadius: 38,
        houseCount: 3,
        hasForge: true,
        hasFarm: false,
        stallCount: 1,
        preferBiome: 'Mountains',
      },
      {
        id: 'riverford',
        name: 'Riverford',
        kind: 'river',
        targetX: -950,
        targetZ: 0,
        clearanceRadius: 38,
        houseCount: 3,
        hasForge: false,
        hasFarm: true,
        stallCount: 2,
        preferBiome: 'Forest',
      },
      {
        id: 'windmere',
        name: 'Windmere',
        kind: 'plains',
        targetX: -1200,
        targetZ: 160,
        clearanceRadius: 38,
        houseCount: 4,
        hasForge: false,
        hasFarm: true,
        stallCount: 2,
        preferBiome: 'Plains',
      },
      {
        id: 'grandcross',
        name: 'Grandcross',
        kind: 'trading',
        targetX: 775,
        targetZ: -800,
        clearanceRadius: 42,
        houseCount: 5,
        hasForge: true,
        hasFarm: true,
        stallCount: 3,
        preferBiome: 'Plains',
      },
      {
        id: 'sunspire',
        name: 'Sunspire Oasis',
        kind: 'desert',
        targetX: 960,
        targetZ: 300,
        clearanceRadius: 40,
        houseCount: 4,
        hasForge: false,
        hasFarm: true,
        stallCount: 2,
        preferBiome: 'Desert',
      },
      {
        id: 'glenwatch',
        name: 'Glenwatch',
        kind: 'valley',
        targetX: -760,
        targetZ: 110,
        clearanceRadius: 40,
        houseCount: 4,
        hasForge: true,
        hasFarm: true,
        stallCount: 2,
        preferBiome: 'Plains',
        requireValley: true,
      },
    ];

    for (const bp of blueprints) {
      const chosen = this.findRegionalVillageSite(bp);
      if (chosen) {
        this.constructRegionalVillage(bp, chosen.x, chosen.z, isSoftwareGl);
      }
    }
  }

  private findRegionalVillageSite(bp: RegionalBlueprint): { x: number; z: number } | null {
    let best: { x: number; z: number; score: number } | null = null;
    const maxSlope = bp.kind === 'mountain' ? 0.22 : bp.kind === 'valley' ? 0.14 : 0.16;
    const maxRelief = bp.kind === 'mountain' ? 6.8 : 5.4;
    const allowedBiomes =
      bp.kind === 'desert'
        ? (['Desert'] as const)
        : bp.kind === 'mountain'
          ? (['Mountains', 'Plains', 'Forest'] as const)
          : (['Plains', 'Forest'] as const);

    for (let r = 0; r <= 560; r += 28) {
      const steps =
        r === 0 ? 1 : Math.min(48, Math.max(12, Math.round((2 * Math.PI * r) / 32)));
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const cx = bp.targetX + Math.cos(a) * r;
        const cz = bp.targetZ + Math.sin(a) * r;

        if (
          !isValidVillageLocation(cx, cz, {
            waterBuffer: VILLAGE_WATER_BUFFER,
            footprintRadius: bp.clearanceRadius,
            maxSlope,
            maxRelief,
            allowedBiomes: [...allowedBiomes],
            requireValley: bp.requireValley,
            existingVillages: this.villages,
            minVillageSpacing: 235,
          })
        ) {
          continue;
        }

        const h = groundHeightAt(cx, cz);
        if (bp.kind !== 'mountain' && h > 28) continue;
        const slope = groundSlopeAt(cx, cz, h);
        const hN = groundHeightAt(cx, cz - 24);
        const hS = groundHeightAt(cx, cz + 24);
        const hE = groundHeightAt(cx + 24, cz);
        const hW = groundHeightAt(cx - 24, cz);
        const relief = Math.max(h, hN, hS, hE, hW) - Math.min(h, hN, hS, hE, hW);
        const biomePenalty =
          bp.preferBiome && getBiomeAt(cx, cz) !== bp.preferBiome ? 18 : 0;

        const score = relief * 2.5 + slope * 30 + r * 0.04 + biomePenalty;
        if (!best || score < best.score) {
          best = { x: cx, z: cz, score };
        }
      }
      if (best && r >= 112) break;
    }

    // Second pass with wider search radius and strict hydrology/slope/relief validation
    if (!best) {
      for (let r = 40; r <= 960; r += 30) {
        const steps = Math.min(48, Math.max(16, Math.round((2 * Math.PI * r) / 36)));
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const cx = bp.targetX + Math.cos(a) * r;
          const cz = bp.targetZ + Math.sin(a) * r;
          if (
            isValidVillageLocation(cx, cz, {
              waterBuffer: VILLAGE_WATER_BUFFER,
              footprintRadius: bp.clearanceRadius,
              maxSlope,
              maxRelief,
              allowedBiomes: [...allowedBiomes],
              requireValley: bp.requireValley,
              existingVillages: this.villages,
              minVillageSpacing: 220,
            })
          ) {
            return { x: cx, z: cz };
          }
        }
      }
    }

    return best ? { x: best.x, z: best.z } : null;
  }

  private constructRegionalVillage(
    bp: RegionalBlueprint,
    cx: number,
    cz: number,
    isSoftwareGl: boolean,
  ): void {
    const rootGroup = new THREE.Group();
    const detailGroup = new THREE.Group();
    rootGroup.add(detailGroup);
    this.scene.add(rootGroup);

    const lampLights: THREE.PointLight[] = [];
    const houses: VillageHouseRecord[] = [];
    const excludedChests = new Set<THREE.Object3D>();
    const cy = groundHeightAt(cx, cz);

    const plazaR = bp.kind === 'trading' ? 11.5 : 8.2;
    const isDesert = bp.kind === 'desert';
    rootGroup.add(buildCentralSquare(cx, cz, plazaR, this.mats, this.disposables));

    this.landmarks.push({
      id: `village-${bp.id}`,
      name: `${bp.name} (${this.formatKindLabel(bp.kind)})`,
      kind: 'village',
      x: cx,
      z: cz,
      discovered: false,
    });

    // Roads radiating N/S and E/W (only extending onto validated dry ground)
    const nsStartZ = isLand(cx, cz - 26, 1.4) && !isNearWater(cx, cz - 26, BUILDING_WATER_BUFFER) ? cz - 26 : cz - 14;
    const nsEndZ = isLand(cx, cz + 26, 1.4) && !isNearWater(cx, cz + 26, BUILDING_WATER_BUFFER) ? cz + 26 : cz + 14;
    const ewStartX = isLand(cx - 26, cz, 1.4) && !isNearWater(cx - 26, cz, BUILDING_WATER_BUFFER) ? cx - 26 : cx - 14;
    const ewEndX = isLand(cx + 26, cz, 1.4) && !isNearWater(cx + 26, cz, BUILDING_WATER_BUFFER) ? cx + 26 : cx + 14;
    rootGroup.add(
      buildTerrainRoadStrip([[cx, nsStartZ], [cx, nsEndZ]], 3.8, this.mats, this.disposables),
      buildTerrainRoadStrip([[ewStartX, cz], [ewEndX, cz]], 3.6, this.mats, this.disposables),
    );

    // Central Well (Sandstone Canopy Well in Desert, Timber Stone Well elsewhere)
    const wellX = cx + 1.4;
    const wellZ = cz - 1.0;
    const wellY = groundHeightAt(wellX, wellZ);
    const well = isDesert
      ? buildDesertWell(this.mats, this.disposables)
      : buildWaterWell(this.mats, this.disposables);
    well.position.set(wellX, wellY, wellZ);
    rootGroup.add(well);
    this.registerCollider({
      kind: 'cylinder',
      x: wellX,
      z: wellZ,
      radius: 1.35,
      minY: wellY - 0.5,
      maxY: wellY + 3.8,
    });
    this.interactables.push({
      id: `${bp.id}-well`,
      label: `${bp.name} Well`,
      actionVerb: 'Draw Water',
      kind: 'well',
      x: wellX,
      y: wellY,
      z: wellZ,
      radius: 3.4,
      collected: false,
      message: `Drew cool water from ${bp.name} Well (+10 Health & Stamina refreshed).`,
    });

    // Welcome signpost
    const signX = cx - 4.2;
    const signZ = cz + 10.8;
    const signY = groundHeightAt(signX, signZ);
    const sign = buildDecorativeProp('signpost', this.mats, this.disposables);
    sign.position.set(signX, signY, signZ);
    detailGroup.add(sign);
    this.interactables.push({
      id: `${bp.id}-signpost`,
      label: `${bp.name} Signpost`,
      actionVerb: 'Read',
      kind: 'signpost',
      x: signX,
      y: signY,
      z: signZ,
      radius: 3.2,
      collected: false,
      message: `Welcome to ${bp.name} — ${this.formatKindLabel(bp.kind)}.`,
    });

    // Helper: ensure every structure in regional villages sits cleanly on dry, slope-safe ground
    const resolveStructureSpot = (
      tx: number,
      tz: number,
      halfW: number,
      halfD: number,
      yaw: number,
    ): { x: number; z: number } | null => {
      if (isValidBuildingLocation(tx, tz, halfW, halfD, yaw, BUILDING_WATER_BUFFER, 0.3)) {
        return { x: tx, z: tz };
      }
      // Probe slightly inward toward village plaza center
      for (const pull of [0.8, 0.62, 0.45]) {
        const px = THREE.MathUtils.lerp(cx, tx, pull);
        const pz = THREE.MathUtils.lerp(cz, tz, pull);
        if (isValidBuildingLocation(px, pz, halfW, halfD, yaw, BUILDING_WATER_BUFFER, 0.3)) {
          return { x: px, z: pz };
        }
      }
      return null;
    };

    // Walkable Regional Houses (or Sandstone/Adobe Desert Houses for desert villages)
    const houseSlots: Array<{ ox: number; oz: number; yaw: number; wall: HouseSpec['wallTone']; roof: HouseSpec['roofTone'] }> = [
      { ox: -14.5, oz: -6.5, yaw: Math.PI * 0.5, wall: 'cream', roof: bp.kind === 'mountain' ? 'slate' : 'cedar' },
      { ox: 14.5, oz: -6.5, yaw: -Math.PI * 0.5, wall: 'ochre', roof: bp.kind === 'forest' ? 'cedar' : 'terracotta' },
      { ox: -11.0, oz: 15.0, yaw: Math.PI, wall: 'sage', roof: 'slate' },
      { ox: 11.5, oz: 15.0, yaw: Math.PI, wall: 'cream', roof: 'terracotta' },
      { ox: 0, oz: -18.5, yaw: 0, wall: 'ochre', roof: 'cedar' },
    ];
    for (let i = 0; i < Math.min(bp.houseCount, houseSlots.length); i++) {
      const hs = houseSlots[i];
      const spot = resolveStructureSpot(cx + hs.ox, cz + hs.oz, 3.0, 2.6, hs.yaw);
      if (!spot) continue;
      if (isDesert) {
        const desertHouse = buildDesertHouse(
          {
            width: 5.6,
            depth: 4.8,
            wallHeight: 3.1,
            warmAdobe: i % 2 === 1,
            hasDome: i === 0 || i === 3,
            awningTone: i % 2 === 0 ? 'amber' : 'teal',
          },
          this.mats,
          this.disposables,
        );
        const hy = this.placeBuildingAt(desertHouse, spot.x, spot.z, hs.yaw, 5.6, 4.8);
        rootGroup.add(desertHouse);
        // Place desert rest bed outside/porch shelter cleanly validated
        const bedX = spot.x + Math.sin(hs.yaw) * 3.1;
        const bedZ = spot.z + Math.cos(hs.yaw) * 3.1;
        if (isLand(bedX, bedZ, 1.0)) {
          const bedPlacement: VillageBedPlacement = {
            id: `${bp.id}-house-${i + 1}-bed`,
            label: 'Sandstone Shelter Bed',
            x: bedX,
            y: groundHeightAt(bedX, bedZ),
            z: bedZ,
            yaw: hs.yaw,
          };
          this.bedPlacements.push(bedPlacement);
          this.onRegisterBed?.(bedPlacement);
        }
        houses.push({
          id: `${bp.id}-house-${i + 1}`,
          villageId: bp.id,
          bedId: `${bp.id}-house-${i + 1}-bed`,
          doorEntryPos: new THREE.Vector3(spot.x, hy, spot.z),
          doorThresholdPos: new THREE.Vector3(spot.x, hy, spot.z),
          bedPos: new THREE.Vector3(spot.x, hy, spot.z),
          bedYaw: hs.yaw,
        });
      } else {
        const rec = this.placeWalkableHouse(
          rootGroup,
          bp.id,
          `${bp.id}-house-${i + 1}`,
          spot.x,
          spot.z,
          hs.yaw,
          {
            width: 5.6,
            depth: 4.8,
            wallHeight: 3.05,
            roofHeight: 2.1,
            wallTone: hs.wall,
            roofTone: hs.roof,
            hasChimney: true,
            chimneySide: i % 2 === 0 ? -1 : 1,
          },
        );
        houses.push(rec);
      }
    }

    // Market Stalls
    const stallOffsets: Array<{ ox: number; oz: number; yaw: number; tone: 'amber' | 'crimson' | 'teal' }> = [
      { ox: -5.8, oz: -8.2, yaw: 0.2, tone: 'amber' },
      { ox: 6.2, oz: -8.0, yaw: -0.25, tone: 'teal' },
      { ox: 0, oz: -9.8, yaw: 0, tone: 'crimson' },
    ];
    for (let i = 0; i < Math.min(bp.stallCount, stallOffsets.length); i++) {
      const st = stallOffsets[i];
      const spot = resolveStructureSpot(cx + st.ox, cz + st.oz, 2.0, 1.5, st.yaw);
      if (!spot) continue;
      const sy = groundHeightAt(spot.x, spot.z);
      const stall = buildMarketStall(st.tone, this.mats, this.disposables);
      stall.position.set(spot.x, sy, spot.z);
      stall.rotation.y = st.yaw;
      rootGroup.add(stall);
      this.registerCollider({ kind: 'cylinder', x: spot.x, z: spot.z, radius: 1.5, minY: sy, maxY: sy + 2.5 });
    }

    // Forge if present
    let forgePos = new THREE.Vector3(cx + 10, cy, cz - 10);
    if (bp.hasForge) {
      const forgeSpot = resolveStructureSpot(cx + 16.5, cz - 15.5, 3.2, 2.6, -0.5);
      if (forgeSpot) {
        const forge = buildBlacksmithForge(this.mats, this.disposables);
        const fy = this.placeBuildingAt(forge, forgeSpot.x, forgeSpot.z, -0.5, 6.2, 5.2);
        rootGroup.add(forge);
        forgePos = new THREE.Vector3(forgeSpot.x + 1.2, fy, forgeSpot.z + 2.4);
      }
    }

    // Farm / Desert Oasis Garden if present
    let farmCx = cx + 21.0;
    let farmCz = cz + 6.5;
    if (bp.hasFarm) {
      const farmSpot = resolveStructureSpot(cx + 21.0, cz + 6.5, 5.5, 3.5, 0);
      if (farmSpot) {
        farmCx = farmSpot.x;
        farmCz = farmSpot.z;
        if (isDesert) {
          const plot = buildDesertOasisPlot(this.mats, this.disposables);
          plot.position.set(farmCx, groundHeightAt(farmCx, farmCz), farmCz);
          rootGroup.add(plot);
        } else {
          rootGroup.add(
            buildFarmPlot(farmCx - 3.0, farmCz, 5.2, 4.4, 'wheat', this.mats, this.disposables),
            buildFarmPlot(farmCx + 3.2, farmCz, 5.2, 4.4, 'greens', this.mats, this.disposables),
          );
          this.addFence(detailGroup, [
            [farmCx - 6.5, farmCz - 3.6],
            [farmCx + 6.5, farmCz - 3.6],
            [farmCx + 6.5, farmCz + 3.6],
            [farmCx - 6.5, farmCz + 3.6],
          ], 2.8);
        }
      } else {
        farmCx = cx + 8;
        farmCz = cz + 6;
      }
    }

    // Guard Post
    const guardSpot = resolveStructureSpot(cx - 16.5, cz + 6.5, 1.8, 1.8, 0) ?? { x: cx - 10, z: cz + 4 };
    const gpX = guardSpot.x;
    const gpZ = guardSpot.z;
    const gpY = groundHeightAt(gpX, gpZ);
    const guardPost = buildGuardPost(this.mats, this.disposables);
    guardPost.position.set(gpX, gpY, gpZ);
    rootGroup.add(guardPost);
    this.registerCollider({ kind: 'cylinder', x: gpX, z: gpZ, radius: 1.4, minY: gpY, maxY: gpY + 4.0 });

    // Street lamps (at most 1 active light per regional village to protect GPU budget!)
    const lampSpots = [
      { x: cx - 4.8, z: cz - 4.8, light: !isSoftwareGl },
      { x: cx + 4.8, z: cz + 4.8, light: false },
      { x: cx - 8.5, z: cz + 1.5, light: false },
      { x: cx + 8.5, z: cz - 1.5, light: false },
    ];
    for (const lp of lampSpots) {
      if (!isLand(lp.x, lp.z, 1.0)) continue;
      const ly = groundHeightAt(lp.x, lp.z);
      const lamp = buildLampPost(lp.light, this.mats, this.disposables, lampLights);
      lamp.position.set(lp.x, ly, lp.z);
      rootGroup.add(lamp);
    }

    // Curated village trees & props (date palms for Desert villages, broadleaf/orchard elsewhere)
    const treeKind = isDesert ? 'palm' : bp.kind === 'forest' ? 'broadleaf' : 'orchard';
    for (const [ox, oz] of [
      [-18, -14],
      [18, -12],
      [-19, 12],
      [18, 16],
    ]) {
      const tx = cx + ox;
      const tz = cz + oz;
      if (!isLand(tx, tz, 1.2) || isNearWater(tx, tz, 8)) continue;
      const ty = groundHeightAt(tx, tz);
      const tree = buildVillageTree(treeKind, this.mats, this.disposables);
      tree.position.set(tx, ty - 0.08, tz);
      rootGroup.add(tree);
      this.registerCollider({ kind: 'cylinder', x: tx, z: tz, radius: 0.45, minY: ty - 0.5, maxY: ty + 4.8 });
    }

    const chestGroup = this.placeVillageChest(
      detailGroup,
      `${bp.id}-chest`,
      `${bp.name} Community Chest`,
      cx + 6.5,
      cz + 4.8,
      -0.4,
      bp.kind === 'mountain'
        ? [
            { itemId: 'iron-ore', count: 5 },
            { itemId: 'coal', count: 4 },
            { itemId: 'stone', count: 6 },
          ]
        : bp.kind === 'desert'
          ? [
              { itemId: 'cactus', count: 4 },
              { itemId: 'sand', count: 6 },
              { itemId: 'rare-mineral', count: 1 },
            ]
          : bp.kind === 'trading'
            ? [
                { itemId: 'iron-sword', count: 1 },
                { itemId: 'arrow', count: 10 },
                { itemId: 'leather', count: 3 },
              ]
            : [
                { itemId: 'wood', count: 7 },
                { itemId: 'fiber', count: 4 },
                { itemId: 'cooked-meat', count: 2 },
              ],
      45,
      40,
    );
    excludedChests.add(chestGroup);

    this.finalizeVillageGroup(rootGroup, detailGroup, isSoftwareGl, excludedChests);

    const safeWp = (wx: number, wz: number): THREE.Vector3 => {
      if (isValidNPCSpawnLocation(wx, wz)) {
        return new THREE.Vector3(wx, groundHeightAt(wx, wz), wz);
      }
      return new THREE.Vector3(cx, cy, cz);
    };

    this.villages.push({
      id: bp.id,
      name: bp.name,
      kind: bp.kind,
      centerX: cx,
      centerZ: cz,
      elevation: cy,
      clearanceRadius: bp.clearanceRadius,
      rootGroup,
      detailGroup,
      lampLights,
      houses,
      workplaces: {
        square: new THREE.Vector3(cx, cy, cz),
        forge: forgePos,
        farm: safeWp(farmCx, farmCz),
        market: safeWp(cx, cz - 7.5),
      },
      guardWaypoints: [
        safeWp(gpX + 3, gpZ),
        safeWp(cx + 8, cz + 6),
        safeWp(cx + 8, cz - 6),
        safeWp(cx - 8, cz - 6),
      ],
      farmCenter: safeWp(farmCx, farmCz),
      forgePos,
      marketPos: safeWp(cx, cz - 7.5),
    });
  }

  private constructProceduralVillage(
    bp: ProceduralVillageBlueprint,
    isSoftwareGl: boolean,
  ): void {
    const rootGroup = new THREE.Group();
    const detailGroup = new THREE.Group();
    rootGroup.add(detailGroup);
    this.scene.add(rootGroup);

    const lampLights: THREE.PointLight[] = [];
    const houses: VillageHouseRecord[] = [];
    const excludedChests = new Set<THREE.Object3D>();
    const cx = bp.centerX;
    const cz = bp.centerZ;
    const cy = groundHeightAt(cx, cz);

    const isDesert = bp.archetype === 'desert' || bp.archetype === 'oasis';
    const isDesertOrCoastal = isDesert || bp.archetype === 'coastal';
    const plazaR = bp.kind === 'trading' ? 10.2 : 8.0;

    rootGroup.add(buildCentralSquare(cx, cz, plazaR, this.mats, this.disposables));

    this.landmarks.push({
      id: `village-${bp.id}`,
      name: `${bp.name} (${this.formatKindLabel(bp.kind)})`,
      kind: 'village',
      x: cx,
      z: cz,
      discovered: false,
    });

    // Roads radiating N/S and E/W on verified land
    const nsStartZ = isLand(cx, cz - 24, 1.3) && !isNearWater(cx, cz - 24, BUILDING_WATER_BUFFER) ? cz - 24 : cz - 13;
    const nsEndZ = isLand(cx, cz + 24, 1.3) && !isNearWater(cx, cz + 24, BUILDING_WATER_BUFFER) ? cz + 24 : cz + 13;
    const ewStartX = isLand(cx - 24, cz, 1.3) && !isNearWater(cx - 24, cz, BUILDING_WATER_BUFFER) ? cx - 24 : cx - 13;
    const ewEndX = isLand(cx + 24, cz, 1.3) && !isNearWater(cx + 24, cz, BUILDING_WATER_BUFFER) ? cx + 24 : cx + 13;
    rootGroup.add(
      buildTerrainRoadStrip([[cx, nsStartZ], [cx, nsEndZ]], 3.6, this.mats, this.disposables),
      buildTerrainRoadStrip([[ewStartX, cz], [ewEndX, cz]], 3.4, this.mats, this.disposables),
    );

    // Central Well
    const wellX = cx + 1.4;
    const wellZ = cz - 1.0;
    const wellY = groundHeightAt(wellX, wellZ);
    const well = isDesert
      ? buildDesertWell(this.mats, this.disposables)
      : buildWaterWell(this.mats, this.disposables);
    well.position.set(wellX, wellY, wellZ);
    rootGroup.add(well);
    this.registerCollider({
      kind: 'cylinder',
      x: wellX,
      z: wellZ,
      radius: 1.35,
      minY: wellY - 0.5,
      maxY: wellY + 3.8,
    });
    this.interactables.push({
      id: `${bp.id}-well`,
      label: `${bp.name} Well`,
      actionVerb: 'Draw Water',
      kind: 'well',
      x: wellX,
      y: wellY,
      z: wellZ,
      radius: 3.4,
      collected: false,
      message: `Drew cool water from ${bp.name} Well (+10 Health & Stamina refreshed).`,
    });

    // Welcome signpost
    const signX = cx - 4.0;
    const signZ = cz + 10.2;
    const signY = groundHeightAt(signX, signZ);
    const sign = buildDecorativeProp('signpost', this.mats, this.disposables);
    sign.position.set(signX, signY, signZ);
    detailGroup.add(sign);
    this.interactables.push({
      id: `${bp.id}-signpost`,
      label: `${bp.name} Signpost`,
      actionVerb: 'Read',
      kind: 'signpost',
      x: signX,
      y: signY,
      z: signZ,
      radius: 3.2,
      collected: false,
      message: `Welcome to ${bp.name} — ${this.formatKindLabel(bp.kind)}.`,
    });

    const resolveSpot = (
      tx: number,
      tz: number,
      halfW: number,
      halfD: number,
      yaw: number,
    ): { x: number; z: number } | null => {
      if (isValidBuildingLocation(tx, tz, halfW, halfD, yaw, BUILDING_WATER_BUFFER * 0.72, 0.3)) {
        return { x: tx, z: tz };
      }
      for (const pull of [0.8, 0.62, 0.45]) {
        const px = THREE.MathUtils.lerp(cx, tx, pull);
        const pz = THREE.MathUtils.lerp(cz, tz, pull);
        if (isValidBuildingLocation(px, pz, halfW, halfD, yaw, BUILDING_WATER_BUFFER * 0.72, 0.3)) {
          return { x: px, z: pz };
        }
      }
      return null;
    };

    // Biome-styled houses with valid interior/porch beds
    const houseSlots: Array<{ ox: number; oz: number; yaw: number; wall: HouseSpec['wallTone']; roof: HouseSpec['roofTone'] }> = [
      { ox: -14.2, oz: -6.2, yaw: Math.PI * 0.5, wall: 'cream', roof: bp.kind === 'mountain' ? 'slate' : 'cedar' },
      { ox: 14.2, oz: -6.2, yaw: -Math.PI * 0.5, wall: 'ochre', roof: bp.kind === 'forest' ? 'cedar' : 'terracotta' },
      { ox: -10.8, oz: 14.5, yaw: Math.PI, wall: 'sage', roof: 'slate' },
      { ox: 11.2, oz: 14.5, yaw: Math.PI, wall: 'cream', roof: 'terracotta' },
    ];
    for (let i = 0; i < Math.min(bp.houseCount, houseSlots.length); i++) {
      const hs = houseSlots[i];
      const spot = resolveSpot(cx + hs.ox, cz + hs.oz, 3.0, 2.6, hs.yaw);
      if (!spot) continue;
      if (isDesert) {
        const desertHouse = buildDesertHouse(
          {
            width: 5.5,
            depth: 4.7,
            wallHeight: 3.1,
            warmAdobe: i % 2 === 1,
            hasDome: i === 0 || i === 3,
            awningTone: i % 2 === 0 ? 'amber' : 'teal',
          },
          this.mats,
          this.disposables,
        );
        const hy = this.placeBuildingAt(desertHouse, spot.x, spot.z, hs.yaw, 5.5, 4.7);
        rootGroup.add(desertHouse);
        const bedX = spot.x + Math.sin(hs.yaw) * 3.0;
        const bedZ = spot.z + Math.cos(hs.yaw) * 3.0;
        if (isLand(bedX, bedZ, 1.0)) {
          const bedPlacement: VillageBedPlacement = {
            id: `${bp.id}-house-${i + 1}-bed`,
            label: `${bp.name} Rest Cot`,
            x: bedX,
            y: groundHeightAt(bedX, bedZ),
            z: bedZ,
            yaw: hs.yaw,
          };
          this.bedPlacements.push(bedPlacement);
          this.onRegisterBed?.(bedPlacement);
        }
        houses.push({
          id: `${bp.id}-house-${i + 1}`,
          villageId: bp.id,
          bedId: `${bp.id}-house-${i + 1}-bed`,
          doorEntryPos: new THREE.Vector3(spot.x, hy, spot.z),
          doorThresholdPos: new THREE.Vector3(spot.x, hy, spot.z),
          bedPos: new THREE.Vector3(spot.x, hy, spot.z),
          bedYaw: hs.yaw,
        });
      } else {
        const rec = this.placeWalkableHouse(
          rootGroup,
          bp.id,
          `${bp.id}-house-${i + 1}`,
          spot.x,
          spot.z,
          hs.yaw,
          {
            width: 5.5,
            depth: 4.7,
            wallHeight: 3.0,
            roofHeight: 2.05,
            wallTone: hs.wall,
            roofTone: hs.roof,
            hasChimney: true,
            chimneySide: i % 2 === 0 ? -1 : 1,
          },
        );
        houses.push(rec);
      }
    }

    // Market Stalls
    const stallOffsets: Array<{ ox: number; oz: number; yaw: number; tone: 'amber' | 'crimson' | 'teal' }> = [
      { ox: -5.5, oz: -8.0, yaw: 0.2, tone: 'amber' },
      { ox: 5.8, oz: -7.8, yaw: -0.25, tone: 'teal' },
    ];
    for (let i = 0; i < Math.min(bp.stallCount, stallOffsets.length); i++) {
      const st = stallOffsets[i];
      const spot = resolveSpot(cx + st.ox, cz + st.oz, 2.0, 1.5, st.yaw);
      if (!spot) continue;
      const sy = groundHeightAt(spot.x, spot.z);
      const stall = buildMarketStall(st.tone, this.mats, this.disposables);
      stall.position.set(spot.x, sy, spot.z);
      stall.rotation.y = st.yaw;
      rootGroup.add(stall);
      this.registerCollider({ kind: 'cylinder', x: spot.x, z: spot.z, radius: 1.5, minY: sy, maxY: sy + 2.5 });
    }

    // Forge or Barn or Storage Shed
    let forgePos = new THREE.Vector3(cx + 10, cy, cz - 10);
    if (bp.hasForge) {
      const forgeSpot = resolveSpot(cx + 16.0, cz - 14.5, 3.2, 2.6, -0.5);
      if (forgeSpot) {
        const forge = buildBlacksmithForge(this.mats, this.disposables);
        const fy = this.placeBuildingAt(forge, forgeSpot.x, forgeSpot.z, -0.5, 6.2, 5.2);
        rootGroup.add(forge);
        forgePos = new THREE.Vector3(forgeSpot.x + 1.2, fy, forgeSpot.z + 2.4);
      }
    } else if (bp.hasBarn) {
      const barnSpot = resolveSpot(cx + 16.0, cz - 14.5, 3.5, 2.8, -0.4);
      if (barnSpot) {
        const barn = buildBarn(this.mats, this.disposables);
        const by = this.placeBuildingAt(barn, barnSpot.x, barnSpot.z, -0.4, 6.8, 5.4);
        rootGroup.add(barn);
        forgePos = new THREE.Vector3(barnSpot.x, by, barnSpot.z + 3.0);
      }
    }

    // Storage Shed
    if (bp.hasStorageShed) {
      const shedSpot = resolveSpot(cx - 16.2, cz - 14.8, 2.3, 1.9, 0.45);
      if (shedSpot) {
        const shed = buildStorageShed(isDesert, this.mats, this.disposables);
        this.placeBuildingAt(shed, shedSpot.x, shedSpot.z, 0.45, 4.4, 3.6);
        rootGroup.add(shed);
      }
    }

    // Farm Plot / Oasis Garden
    let farmCx = cx + 19.5;
    let farmCz = cz + 6.5;
    if (bp.hasFarm) {
      const farmSpot = resolveSpot(farmCx, farmCz, 5.2, 3.4, 0);
      if (farmSpot) {
        farmCx = farmSpot.x;
        farmCz = farmSpot.z;
        if (isDesert) {
          const plot = buildDesertOasisPlot(this.mats, this.disposables);
          plot.position.set(farmCx, groundHeightAt(farmCx, farmCz), farmCz);
          rootGroup.add(plot);
        } else {
          rootGroup.add(
            buildFarmPlot(farmCx - 2.8, farmCz, 4.8, 4.2, 'wheat', this.mats, this.disposables),
            buildFarmPlot(farmCx + 3.0, farmCz, 4.8, 4.2, 'greens', this.mats, this.disposables),
          );
          this.addFence(detailGroup, [
            [farmCx - 6.0, farmCz - 3.3],
            [farmCx + 6.0, farmCz - 3.3],
            [farmCx + 6.0, farmCz + 3.3],
            [farmCx - 6.0, farmCz + 3.3],
          ], 2.8);
        }
      } else {
        farmCx = cx + 8;
        farmCz = cz + 6;
      }
    }

    // Watchtower + Guard Post
    const guardSpot = resolveSpot(cx - 16.0, cz + 6.5, 1.8, 1.8, 0) ?? { x: cx - 10, z: cz + 4 };
    const gpX = guardSpot.x;
    const gpZ = guardSpot.z;
    const gpY = groundHeightAt(gpX, gpZ);
    if (bp.hasWatchtower) {
      const tower = buildWatchtower(isDesertOrCoastal, this.mats, this.disposables);
      this.placeBuildingAt(tower, gpX, gpZ, 0.25, 3.3, 3.3);
      rootGroup.add(tower);
    } else {
      const guardPost = buildGuardPost(this.mats, this.disposables);
      guardPost.position.set(gpX, gpY, gpZ);
      rootGroup.add(guardPost);
      this.registerCollider({ kind: 'cylinder', x: gpX, z: gpZ, radius: 1.4, minY: gpY, maxY: gpY + 4.0 });
    }

    // Biome Work Yard & Registered Harvestable Resource Spot
    const yardSpot = resolveSpot(cx - 1.5, cz - 19.0, 3.2, 3.2, 0) ?? { x: cx + 11.5, z: cz + 2.5 };
    const yardY = groundHeightAt(yardSpot.x, yardSpot.z);
    const yardMesh = buildWorkYard(bp.workYardKind, this.mats, this.disposables);
    yardMesh.position.set(yardSpot.x, yardY, yardSpot.z);
    detailGroup.add(yardMesh);

    const yardResPos = new THREE.Vector3(yardSpot.x + 2.4, yardY, yardSpot.z + 1.8);
    if (isLand(yardResPos.x, yardResPos.z, 0.6)) {
      this.onRegisterResourceYard?.({
        villageId: bp.id,
        villageName: bp.name,
        resourceKind: bp.resourceYardKind,
        x: yardResPos.x,
        y: groundHeightAt(yardResPos.x, yardResPos.z),
        z: yardResPos.z,
      });
    }

    // Lanterns (1 point light attached, globally budgeted in update())
    const lampSpots = [
      { x: cx - 4.6, z: cz - 4.6, light: !isSoftwareGl },
      { x: cx + 4.6, z: cz + 4.6, light: false },
    ];
    for (const lp of lampSpots) {
      if (!isLand(lp.x, lp.z, 1.0)) continue;
      const ly = groundHeightAt(lp.x, lp.z);
      const lamp = buildLampPost(lp.light, this.mats, this.disposables, lampLights);
      lamp.position.set(lp.x, ly, lp.z);
      rootGroup.add(lamp);
    }

    // Biome-appropriate trees inside village bounds
    const treeKind = isDesert || bp.archetype === 'coastal' ? 'palm' : bp.kind === 'forest' ? 'broadleaf' : 'orchard';
    for (const [ox, oz] of [
      [-17, -13],
      [17, -11],
      [-18, 11],
      [17, 15],
    ]) {
      const tx = cx + ox;
      const tz = cz + oz;
      if (!isLand(tx, tz, 1.2) || isNearWater(tx, tz, 8)) continue;
      const ty = groundHeightAt(tx, tz);
      const tree = buildVillageTree(treeKind, this.mats, this.disposables);
      tree.position.set(tx, ty - 0.08, tz);
      rootGroup.add(tree);
      this.registerCollider({ kind: 'cylinder', x: tx, z: tz, radius: 0.45, minY: ty - 0.5, maxY: ty + 4.8 });
    }

    const chestGroup = this.placeVillageChest(
      detailGroup,
      `${bp.id}-chest`,
      `${bp.name} Community Chest`,
      cx + 6.0,
      cz + 4.5,
      -0.4,
      [
        { itemId: bp.resourceYardKind === 'wheat' ? 'farm-grain' : bp.resourceYardKind, count: 4 },
        { itemId: isDesert ? 'cactus' : 'wood', count: 4 },
        { itemId: bp.kind === 'mountain' ? 'coal' : 'cooked-meat', count: 2 },
      ],
      40,
      35,
    );
    excludedChests.add(chestGroup);

    this.finalizeVillageGroup(rootGroup, detailGroup, isSoftwareGl, excludedChests);

    const safeWp = (wx: number, wz: number): THREE.Vector3 => {
      if (isValidNPCSpawnLocation(wx, wz)) {
        return new THREE.Vector3(wx, groundHeightAt(wx, wz), wz);
      }
      return new THREE.Vector3(cx, cy, cz);
    };

    this.villages.push({
      id: bp.id,
      name: bp.name,
      nameAr: bp.nameAr,
      kind: bp.kind,
      isProcedural: true,
      archetype: bp.archetype,
      resourceYardKind: bp.resourceYardKind,
      resourceYardPos: yardResPos,
      populationPlan: bp.populationPlan,
      centerX: cx,
      centerZ: cz,
      elevation: cy,
      clearanceRadius: bp.clearanceRadius,
      rootGroup,
      detailGroup,
      lampLights,
      houses,
      workplaces: {
        square: new THREE.Vector3(cx, cy, cz),
        forge: forgePos,
        farm: safeWp(farmCx, farmCz),
        market: safeWp(cx, cz - 7.5),
        yard: safeWp(yardSpot.x, yardSpot.z),
      },
      guardWaypoints: [
        safeWp(gpX + 3, gpZ),
        safeWp(cx + 9, cz + 7),
        safeWp(cx + 9, cz - 7),
        safeWp(cx - 9, cz - 7),
        safeWp(cx - 9, cz + 7),
      ],
      farmCenter: safeWp(farmCx, farmCz),
      forgePos,
      marketPos: safeWp(cx, cz - 7.5),
    });
  }

  private formatKindLabel(kind: VillageKind): string {
    switch (kind) {
      case 'oakhollow':
        return 'Heartland Village';
      case 'forest':
        return 'Forest Village';
      case 'farming':
        return 'Farming Village';
      case 'mountain':
        return 'Mountain Village';
      case 'river':
        return 'River Village';
      case 'plains':
        return 'Plains Village';
      case 'trading':
        return 'Large Trading Village';
      case 'desert':
        return 'Desert Village';
      case 'oasis':
        return 'Oasis Village';
      case 'coastal':
        return 'Coastal Village';
      case 'valley':
        return 'Valley Settlement';
    }
  }

  private placeWalkableHouse(
    rootGroup: THREE.Group,
    villageId: string,
    houseId: string,
    cx: number,
    cz: number,
    yaw: number,
    spec: HouseSpec,
  ): VillageHouseRecord {
    const built = buildWalkableInteriorHouse(spec, this.mats, this.disposables);
    const hw = spec.width * 0.5;
    const hd = spec.depth * 0.5;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);

    const corners: Array<[number, number]> = [
      [-hw, -hd],
      [hw, -hd],
      [-hw, hd],
      [hw, hd],
      [0, 0],
    ];
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [lx, lz] of corners) {
      const wx = cx + lx * cos + lz * sin;
      const wz = cz - lx * sin + lz * cos;
      const h = groundHeightAt(wx, wz);
      if (h < minY) minY = h;
      if (h > maxY) maxY = h;
    }
    const anchorY = THREE.MathUtils.lerp(minY, maxY, 0.72);
    built.group.position.set(cx, anchorY, cz);
    built.group.rotation.y = yaw;
    rootGroup.add(built.group);

    for (const c of built.wallCollidersLocal) {
      const wx = cx + c.lx * cos + c.lz * sin;
      const wz = cz - c.lx * sin + c.lz * cos;
      this.registerCollider({
        kind: 'cylinder',
        x: wx,
        z: wz,
        radius: c.radius,
        minY: minY - 0.8,
        maxY: anchorY + c.maxY,
      });
    }

    const toWorld = (local: THREE.Vector3) =>
      new THREE.Vector3(
        cx + local.x * cos + local.z * sin,
        anchorY + local.y,
        cz - local.x * sin + local.z * cos,
      );

    const doorEntryPos = toWorld(built.doorEntryLocal);
    const doorThresholdPos = toWorld(built.doorThresholdLocal);
    const doorWorldPos = toWorld(built.doorLocalPos);
    const doorId = `${houseId}-door`;
    this.doorPivots.set(doorId, {
      pivot: built.doorPivot,
      x: doorWorldPos.x,
      z: doorWorldPos.z,
      minY: minY - 0.5,
      maxY: anchorY + 2.6,
      isOpen: true,
    });
    this.onRegisterDoor?.({
      id: doorId,
      label: 'Cottage Door',
      x: doorWorldPos.x,
      y: doorWorldPos.y,
      z: doorWorldPos.z,
      minY: minY - 0.5,
      maxY: anchorY + 2.6,
      isOpen: true,
    });
    const bedPos = toWorld(built.bedLocalPos);
    const bedYaw = yaw + built.bedLocalYaw;
    const bedId = `${houseId}-bed`;

    const bedPlacement: VillageBedPlacement = {
      id: bedId,
      label: 'Cottage Bed',
      x: bedPos.x,
      y: bedPos.y,
      z: bedPos.z,
      yaw: bedYaw,
    };
    this.bedPlacements.push(bedPlacement);
    this.onRegisterBed?.(bedPlacement);

    const record: VillageHouseRecord = {
      id: houseId,
      villageId,
      bedId,
      doorEntryPos,
      doorThresholdPos,
      bedPos,
      bedYaw,
    };
    this.houseRecords.push(record);
    return record;
  }

  private placeVillageChest(
    parent: THREE.Group,
    chestId: string,
    label: string,
    x: number,
    z: number,
    yaw: number,
    loot: Array<{ itemId: string; count: number }>,
    coins: number,
    xp: number,
  ): THREE.Group {
    const y = groundHeightAt(x, z);
    const { group, lidPivot } = buildChestProp(this.mats, this.disposables);
    group.position.set(x, y, z);
    group.rotation.y = yaw;
    parent.add(group);
    this.chestLids.set(chestId, lidPivot);
    this.registerCollider({
      kind: 'cylinder',
      x,
      z,
      radius: 0.6,
      minY: y - 0.3,
      maxY: y + 0.9,
    });

    const placement: VillageChestPlacement = {
      id: chestId,
      label,
      x,
      y,
      z,
      loot,
      coins,
      xp,
    };
    this.chestPlacements.push(placement);
    this.onRegisterChest?.(placement);
    return group;
  }

  private placeDecorativeProps(
    detailGroup: THREE.Group,
    cx: number,
    cz: number,
    farmCx: number,
    farmCz: number,
  ): void {
    const nbX = cx - 0.4;
    const nbZ = cz - 9.2;
    const nbY = groundHeightAt(nbX, nbZ);
    const noticeBoard = buildDecorativeProp('noticeboard', this.mats, this.disposables);
    noticeBoard.position.set(nbX, nbY, nbZ);
    detailGroup.add(noticeBoard);
    this.registerCollider({
      kind: 'cylinder',
      x: nbX,
      z: nbZ,
      radius: 0.75,
      minY: nbY - 0.5,
      maxY: nbY + 2.2,
    });
    this.interactables.push({
      id: 'village-noticeboard',
      label: 'Oakhollow Notice Board',
      actionVerb: 'Read',
      kind: 'village',
      x: nbX,
      y: nbY,
      z: nbZ,
      radius: 3.1,
      collected: false,
      message:
        'Oakhollow Board: "Mountain passes lie north, Sun Dunes lie east, and the Lake awaits west."',
    });

    const signX = cx - 4.4;
    const signZ = cz + 12.2;
    const signY = groundHeightAt(signX, signZ);
    const sign = buildDecorativeProp('signpost', this.mats, this.disposables);
    sign.position.set(signX, signY, signZ);
    sign.rotation.y = -0.35;
    detailGroup.add(sign);
    this.interactables.push({
      id: 'village-signpost',
      label: 'Oakhollow Village Sign',
      actionVerb: 'Read',
      kind: 'signpost',
      x: signX,
      y: signY,
      z: signZ,
      radius: 3.1,
      collected: false,
      message: 'Welcome to Oakhollow Village — Fresh water well & market square ahead.',
    });

    const props: Array<{
      kind: DecorativePropKind;
      x: number;
      z: number;
      yaw: number;
      colliderRadius?: number;
    }> = [
      { kind: 'bench', x: cx - 4.2, z: cz + 4.4, yaw: Math.PI * 0.75, colliderRadius: 0.75 },
      { kind: 'bench', x: cx + 4.6, z: cz + 4.0, yaw: -Math.PI * 0.75, colliderRadius: 0.75 },
      { kind: 'bench', x: cx - 5.4, z: cz - 3.8, yaw: Math.PI * 0.25, colliderRadius: 0.75 },
      { kind: 'planter', x: cx - 4.6, z: cz - 9.8, yaw: 0, colliderRadius: 0.5 },
      { kind: 'planter', x: cx + 4.4, z: cz - 9.8, yaw: 0, colliderRadius: 0.5 },
      { kind: 'planter', x: cx - 10.8, z: cz + 4.4, yaw: Math.PI * 0.5, colliderRadius: 0.5 },
      { kind: 'barrel', x: cx - 10.6, z: cz - 11.4, yaw: 0.2, colliderRadius: 0.42 },
      { kind: 'barrel', x: cx - 9.8, z: cz - 11.6, yaw: 0.7, colliderRadius: 0.42 },
      { kind: 'crate', x: cx + 10.8, z: cz - 11.6, yaw: 0.15, colliderRadius: 0.5 },
      { kind: 'crate', x: cx - 11.4, z: cz - 3.6, yaw: 0.4, colliderRadius: 0.5 },
      { kind: 'barrel', x: cx - 11.4, z: cz - 9.8, yaw: 0.1, colliderRadius: 0.42 },
      { kind: 'woodpile', x: cx + 11.8, z: cz + 14.5, yaw: 0, colliderRadius: 0.5 },
      { kind: 'woodpile', x: cx - 12.2, z: cz + 14.8, yaw: Math.PI * 0.5, colliderRadius: 0.5 },
      { kind: 'scarecrow', x: farmCx - 0.5, z: farmCz - 3.6, yaw: -0.35, colliderRadius: 0.35 },
      { kind: 'haybale', x: farmCx + 6.4, z: farmCz + 4.4, yaw: 0.3, colliderRadius: 0.55 },
      { kind: 'haybale', x: farmCx + 5.6, z: farmCz + 5.3, yaw: -0.4, colliderRadius: 0.55 },
      { kind: 'cart', x: farmCx - 10.2, z: farmCz - 4.4, yaw: 0.5, colliderRadius: 1.05 },
      { kind: 'barrel', x: farmCx - 7.0, z: farmCz + 4.8, yaw: 0, colliderRadius: 0.42 },
    ];

    for (const p of props) {
      const py = groundHeightAt(p.x, p.z);
      const mesh = buildDecorativeProp(p.kind, this.mats, this.disposables);
      mesh.position.set(p.x, py, p.z);
      mesh.rotation.y = p.yaw;
      detailGroup.add(mesh);

      if (p.colliderRadius) {
        this.registerCollider({
          kind: 'cylinder',
          x: p.x,
          z: p.z,
          radius: p.colliderRadius,
          minY: py - 0.5,
          maxY: py + 1.8,
        });
      }
    }
  }

  private addFence(
    detailGroup: THREE.Group,
    points: Array<[number, number]>,
    postStep: number,
  ): void {
    const { group, postPositions } = buildFenceRun(
      points,
      postStep,
      this.mats,
      this.disposables,
    );
    detailGroup.add(group);
    for (const [px, pz] of postPositions) {
      const py = groundHeightAt(px, pz);
      this.registerCollider({
        kind: 'cylinder',
        x: px,
        z: pz,
        radius: 0.25,
        minY: py - 0.5,
        maxY: py + 1.25,
      });
    }
  }

  private placeBuildingAt(
    building: THREE.Group,
    cx: number,
    cz: number,
    yaw: number,
    width: number,
    depth: number,
  ): number {
    const hw = width * 0.5;
    const hd = depth * 0.5;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);

    const corners: Array<[number, number]> = [
      [-hw, -hd],
      [hw, -hd],
      [-hw, hd],
      [hw, hd],
      [0, 0],
    ];
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [lx, lz] of corners) {
      const wx = cx + lx * cos + lz * sin;
      const wz = cz - lx * sin + lz * cos;
      const h = groundHeightAt(wx, wz);
      if (h < minY) minY = h;
      if (h > maxY) maxY = h;
    }

    const anchorY = THREE.MathUtils.lerp(minY, maxY, 0.72);
    building.position.set(cx, anchorY, cz);
    building.rotation.y = yaw;

    const stepX = 1.65;
    const stepZ = 1.65;
    const cols = Math.max(2, Math.round(width / stepX));
    const rows = Math.max(2, Math.round(depth / stepZ));
    const colRadius = Math.max(1.05, Math.min(width, depth) * 0.26);

    for (let r = 0; r < rows; r++) {
      const lz = -hd * 0.72 + (r / Math.max(1, rows - 1)) * (depth * 0.72);
      for (let c = 0; c < cols; c++) {
        const lx = -hw * 0.72 + (c / Math.max(1, cols - 1)) * (width * 0.72);
        const wx = cx + lx * cos + lz * sin;
        const wz = cz - lx * sin + lz * cos;
        this.registerCollider({
          kind: 'cylinder',
          x: wx,
          z: wz,
          radius: colRadius,
          minY: minY - 0.8,
          maxY: anchorY + 6.5,
        });
      }
    }

    return anchorY;
  }

  public applyGraphicsProfile(profile: ResolvedGraphicsProfile): void {
    this.drawDist = profile.villageDrawDist;
    this.detailDist = profile.villageDetailDist;
    this.maxLights = profile.villageMaxLights;

    for (const v of this.villages) {
      for (let i = 0; i < v.lampLights.length; i++) {
        v.lampLights[i].visible = i < this.maxLights;
      }
      v.rootGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          if (mesh.userData.__origCastShadow === undefined) {
            mesh.userData.__origCastShadow = mesh.castShadow;
            mesh.userData.__origReceiveShadow = mesh.receiveShadow;
          }
          mesh.castShadow =
            Boolean(mesh.userData.__origCastShadow) && profile.propShadows;
          mesh.receiveShadow =
            Boolean(mesh.userData.__origReceiveShadow) && profile.shadowEnabled;
        }
      });
    }
  }

  public applyTextures(textures: ProceduralTextureSet): void {
    this.mats.plasterCream.normalMap = textures.plasterNormalMap;
    this.mats.plasterOchre.normalMap = textures.plasterNormalMap;
    this.mats.plasterSage.normalMap = textures.plasterNormalMap;
    this.mats.timberDark.map = textures.barkMap;
    this.mats.timberDark.normalMap = textures.barkNormalMap;
    this.mats.timberWarm.map = textures.barkMap;
    this.mats.timberWarm.normalMap = textures.barkNormalMap;
    this.mats.stoneCobble.map = textures.rockMap;
    this.mats.stoneCobble.normalMap = textures.rockNormalMap;
    this.mats.stoneCobble.roughnessMap = textures.rockRoughnessMap;
    this.mats.stoneFoundation.map = textures.rockMap;
    this.mats.stoneFoundation.normalMap = textures.rockNormalMap;
    this.mats.stoneFoundation.roughnessMap = textures.rockRoughnessMap;
    this.mats.roadGravel.map = textures.rockMap;
    this.mats.roadGravel.normalMap = textures.rockNormalMap;
    this.mats.roofTerracotta.normalMap = textures.plasterNormalMap;
    this.mats.roofSlate.normalMap = textures.rockNormalMap;
    this.mats.roofCedar.normalMap = textures.barkNormalMap;
    this.mats.soilTilled.normalMap = textures.grassNormalMap;
    this.mats.hayGold.normalMap = textures.grassNormalMap;
    this.mats.wellWater.normalMap = textures.waterNormalMap;
    this.mats.sandstonePlaster.normalMap = textures.plasterNormalMap;
    this.mats.adobeClay.normalMap = textures.plasterNormalMap;
    this.mats.sandRoad.map = textures.sandMap;
    this.mats.sandRoad.normalMap = textures.sandNormalMap;
    this.mats.oasisWater.normalMap = textures.waterNormalMap;
  }

  public update(elapsed: number, playerPos: THREE.Vector3, worldHours = 8.5): void {
    const h = ((worldHours % 24) + 24) % 24;
    let nightFactor = 0;
    if (h >= 19.5 || h < 5.5) {
      nightFactor = 1;
    } else if (h >= 17.0 && h < 19.5) {
      nightFactor = THREE.MathUtils.smoothstep(h, 17.0, 19.5);
    } else if (h >= 5.5 && h < 8.0) {
      nightFactor = 1 - THREE.MathUtils.smoothstep(h, 5.5, 8.0);
    }

    this.mats.windowGlow.emissiveIntensity = THREE.MathUtils.lerp(0.28, 1.35, nightFactor);
    this.mats.lanternGlow.emissiveIntensity =
      THREE.MathUtils.lerp(0.55, 2.15, nightFactor) +
      Math.sin(elapsed * 3.1) * (0.06 + nightFactor * 0.14);

    const lampIntensity =
      THREE.MathUtils.lerp(1.4, 9.5, nightFactor) +
      Math.sin(elapsed * 4.2) * (nightFactor * 0.35);

    const drawDistSq = this.drawDist * this.drawDist;
    const detailDistSq = this.detailDist * this.detailDist;
    let remainingLightBudget = this.maxLights;
    let closestVillage: VillageSiteRecord | null = null;
    let closestDistSq = Infinity;

    for (let i = 0; i < this.villages.length; i++) {
      const v = this.villages[i];
      const dx = playerPos.x - v.centerX;
      const dz = playerPos.z - v.centerZ;
      const distSq = dx * dx + dz * dz;
      const showVillage = distSq <= drawDistSq;
      if (v.rootGroup.visible !== showVillage) {
        v.rootGroup.visible = showVillage;
      }
      if (!showVillage) {
        for (let j = 0; j < v.lampLights.length; j++) {
          v.lampLights[j].visible = false;
        }
        continue;
      }

      const showDetails = distSq <= detailDistSq;
      if (v.detailGroup.visible !== showDetails) {
        v.detailGroup.visible = showDetails;
      }

      if (distSq < closestDistSq) {
        closestDistSq = distSq;
        closestVillage = v;
      }
    }

    // Activate streetlamp point lights only on the nearest visible village within global budget
    for (let i = 0; i < this.villages.length; i++) {
      const v = this.villages[i];
      if (!v.rootGroup.visible) continue;
      const allowLights = v === closestVillage && v.detailGroup.visible;
      for (let j = 0; j < v.lampLights.length; j++) {
        const shouldShow = allowLights && remainingLightBudget > 0;
        v.lampLights[j].visible = shouldShow;
        if (shouldShow) {
          v.lampLights[j].intensity = lampIntensity;
          remainingLightBudget--;
        }
      }
    }
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    for (const v of this.villages) {
      v.rootGroup.removeFromParent();
    }
  }
}
