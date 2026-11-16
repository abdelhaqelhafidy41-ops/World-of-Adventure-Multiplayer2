import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import type { BiomeType, InteractableInfo, WorldCollider, WorldLandmark } from '../types';
import {
  DEFAULT_WORLD_SEED,
  LAKE_CENTER_X,
  LAKE_CENTER_Z,
  PLAYABLE_RADIUS,
  WATER_LEVEL,
  WORLD_SIZE,
  fbm2D,
  getBiomeAt,
  fillBiomeWeightsAt,
  getCoastlineZAt,
  getLakeDistanceFactor,
  getRiverCenterXAt,
  groundHeightAt,
  groundSlopeAt,
  seededRandom,
  setWorldSeed,
} from '../math/noise';
import type { ProceduralTextureSet } from './textures';
import type { SkyLightingRig } from './SkyAndLighting';
import type { ResolvedGraphicsProfile } from '../engine/GraphicsQualityManager';
import {
  VillageManager,
  type VillageResourceYardRegistration,
} from './VillageManager';
import { NPCManager } from '../npc/NPCManager';
import { WildlifeManager } from '../wildlife/WildlifeManager';
import {
  ChunkManager,
  type ManagedChunk,
  toChunkKey,
} from './ChunkManager';
import {
  ExplorationLocationManager,
  type ExplorationResourcePlacement,
} from './ExplorationLocations';
import {
  findNearestValidLand,
  findNearestValidResourceLocation,
  getHydrologyClearance,
  getWorldGenTelemetry,
  isLand,
  isNearWater,
  isValleyTerrain,
  isValidResourceLocation,
  isWater,
  recordInvalidResourceSpawn,
  recordRejectedResourceCandidate,
  recordWaterViolation,
  resetWorldGenTelemetry,
} from './WorldPlacementValidator';
import {
  clearDynamicVillageNamesAr,
  registerDynamicVillageNameAr,
} from '../i18n/translations';

export type WorldResourceKind =
  | 'wood'
  | 'stone'
  | 'iron-ore'
  | 'gold-ore'
  | 'coal'
  | 'clay'
  | 'wheat'
  | 'fiber'
  | 'mushroom'
  | 'berries'
  | 'flower'
  | 'sand'
  | 'cactus'
  | 'desert-plant'
  | 'shell'
  | 'driftwood'
  | 'rare-mineral';

export interface WorldInteractable extends InteractableInfo {
  x: number;
  y: number;
  z: number;
  radius: number;
  collected: boolean;
  meshGroup?: THREE.Group;
  message: string;
  itemId?: string;
  count?: number;
  isPlayerDrop?: boolean;
  chunkKey?: string;
  resourceKind?: WorldResourceKind;
  usesRemaining?: number;
  maxUses?: number;
  regenAtElapsed?: number;
  yieldCount?: number;
  chestLoot?: Array<{ itemId: string; count: number }>;
  chestCoins?: number;
  chestXp?: number;
  bedYaw?: number;
  isPlacedBed?: boolean;
  isOpen?: boolean;
}

interface SharedWorldAssets {
  terrainMat: THREE.MeshStandardMaterial;
  barkMat: THREE.MeshStandardMaterial;
  pineMat: THREE.MeshStandardMaterial;
  oakMat: THREE.MeshStandardMaterial;
  cactusMat: THREE.MeshStandardMaterial;
  desertShrubMat: THREE.MeshStandardMaterial;
  desertPebbleMat: THREE.MeshStandardMaterial;
  palmMat: THREE.MeshStandardMaterial;
  rockMat: THREE.MeshStandardMaterial;
  mossMat: THREE.MeshStandardMaterial;
  lodTreeMat: THREE.MeshLambertMaterial;
  lodRockMat: THREE.MeshLambertMaterial;
  grassMat: THREE.MeshStandardMaterial;
  flowerMat: THREE.MeshStandardMaterial;
  herbBloomMat: THREE.MeshStandardMaterial;
  pineTrunkGeo: THREE.BufferGeometry;
  pineCanopyGeo: THREE.BufferGeometry;
  pineLodGeo: THREE.BufferGeometry;
  oakTrunkGeo: THREE.BufferGeometry;
  oakCanopyGeo: THREE.BufferGeometry;
  oakLodGeo: THREE.BufferGeometry;
  cactusGeo: THREE.BufferGeometry;
  desertShrubGeo: THREE.BufferGeometry;
  desertPebbleGeo: THREE.BufferGeometry;
  palmTrunkGeo: THREE.BufferGeometry;
  palmCrownGeo: THREE.BufferGeometry;
  rockGeo: THREE.BufferGeometry;
  rockLodGeo: THREE.BufferGeometry;
  grassGeo: THREE.BufferGeometry;
  flowerGeo: THREE.BufferGeometry;
  herbLeafGeo: THREE.BufferGeometry;
  herbBloomGeo: THREE.BufferGeometry;
}

const CHUNK_SIZE = 120;
const COLLIDER_CELL_SIZE = 30;
const WATER_SURFACE_SIZE = 2800;
const RESOURCE_REGEN_SECONDS = 240;

const _chunkBiomeWeights = {
  plains: 1,
  forest: 0,
  mountains: 0,
  desert: 0,
  beach: 0,
};
const _dummy = new THREE.Object3D();
const _tempColor = new THREE.Color();

export class WorldManager {
  public readonly seed: number;
  public readonly interactables: WorldInteractable[] = [];
  public readonly landmarks: WorldLandmark[] = [];
  public readonly village: VillageManager;
  public readonly exploration: ExplorationLocationManager;
  public readonly npcs: NPCManager;
  public readonly wildlife: WildlifeManager;
  public readonly chunkManager: ChunkManager;

  private readonly scene: THREE.Scene;
  private readonly worldGroup = new THREE.Group();
  private readonly colliderGrid = new Map<string, WorldCollider[]>();
  private readonly collidersByOwner = new Map<
    string,
    Array<{ cellKey: string; collider: WorldCollider }>
  >();
  private readonly colliderScratch: WorldCollider[] = [];
  private readonly activePickups: WorldInteractable[] = [];
  private readonly chunkInteractables = new Map<string, WorldInteractable[]>();
  private readonly persistedCollectedIds = new Set<string>();
  private readonly openedChestIds = new Set<string>();
  private readonly depletedNodes = new Map<
    string,
    { usesRemaining: number; regenAtElapsed: number }
  >();
  private readonly placedBeds: Array<{ id: string; x: number; z: number; yaw: number }> = [];
  private readonly placedBedGroups: Array<{ id: string; group: THREE.Group }> = [];
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly queryCollidersCb = (x: number, z: number) =>
    this.queryCollidersNear(x, z);
  private readonly isVillageClearanceCb = (x: number, z: number) =>
    this.isInsideVillageClearance(x, z);
  private readonly isSoftwareGl: boolean;
  private readonly sharedAssets: SharedWorldAssets;
  private readonly villageChunkKey: string;
  private lastElapsed = 0;

  private waterMesh!: THREE.Mesh;
  private waterMat!: THREE.MeshStandardMaterial;
  private waterTimeUniform = { value: 0 };
  private waterWaveAmpUniform = { value: 1.0 };
  private waterQualityUniform = { value: 2.0 };
  private waterSunDirUniform = { value: new THREE.Vector3(0.55, 0.72, 0.42).normalize() };
  private waterSunColorUniform = { value: new THREE.Color(0xfff1d6) };
  private waterHorizonColorUniform = { value: new THREE.Color(0xc5dce8) };
  private waterWindDirUniform = { value: new THREE.Vector2(0.81, 0.58) };
  private terrainFogDensityUniform = { value: 0.0022 };
  private terrainSandMapUniform!: { value: THREE.Texture };
  private terrainSandNormalUniform!: { value: THREE.Texture };
  private terrainSandRoughnessUniform!: { value: THREE.Texture };
  private terrainRockMapUniform!: { value: THREE.Texture };
  private terrainRockNormalUniform!: { value: THREE.Texture };
  private terrainBiomeDebugUniform = { value: 0.0 };
  private biomeDebugEnabled = false;
  private grassWindUniform = { value: 0 };
  private grassWindAmpUniform = { value: 0.14 };
  private grassWindDirUniform = { value: new THREE.Vector2(0.81, 0.58) };
  private windPhase = 0;

  private currentWaterSegments = 80;
  private currentVegetationScale = 1.0;
  private currentPropShadows = true;
  private currentShadowsEnabled = true;
  private landmarkMaterials: {
    rockMat: THREE.MeshStandardMaterial;
    barkMat: THREE.MeshStandardMaterial;
  } | null = null;
  private readonly landmarkGroups: THREE.Group[] = [];

  constructor(
    scene: THREE.Scene,
    textures: ProceduralTextureSet,
    isSoftwareGl: boolean,
    seed = DEFAULT_WORLD_SEED,
    onStep?: (progress: number, label: string) => void,
  ) {
    this.scene = scene;
    this.isSoftwareGl = isSoftwareGl;
    this.scene.add(this.worldGroup);
    this.seed = seed;
    setWorldSeed(seed);
    resetWorldGenTelemetry(seed);
    clearDynamicVillageNamesAr();

    this.terrainSandMapUniform = { value: textures.sandMap };
    this.terrainSandNormalUniform = { value: textures.sandNormalMap };
    this.terrainSandRoughnessUniform = { value: textures.sandRoughnessMap };
    this.terrainRockMapUniform = { value: textures.rockMap };
    this.terrainRockNormalUniform = { value: textures.rockNormalMap };

    onStep?.(46, 'Preparing shared biome materials & terrain shaders...');
    this.sharedAssets = this.createSharedWorldAssets(textures);

    onStep?.(58, 'Filling rivers, lake, and ocean coastline...');
    this.buildWaterSurface(textures);

    onStep?.(68, 'Building Oakhollow & procedural world villages...');
    this.village = new VillageManager({
      scene: this.scene,
      textures,
      isSoftwareGl,
      seed: this.seed,
      registerCollider: (c) => this.registerCollider(c, 'static'),
      interactables: this.interactables,
      landmarks: this.landmarks,
      onRegisterBed: (bed) => {
        this.interactables.push({
          id: bed.id,
          label: bed.label,
          actionVerb: 'Sleep',
          kind: 'bed',
          x: bed.x,
          y: bed.y,
          z: bed.z,
          radius: 2.6,
          collected: false,
          bedYaw: bed.yaw,
          message: 'Rest until morning.',
        });
      },
      onRegisterDoor: (door) => {
        this.interactables.push({
          id: door.id,
          label: door.label,
          actionVerb: door.isOpen ? 'Close' : 'Open',
          kind: 'door',
          x: door.x,
          y: door.y,
          z: door.z,
          radius: 2.8,
          collected: false,
          isOpen: door.isOpen,
          message: door.isOpen ? 'Closed the cottage door.' : 'Opened the cottage door.',
        });
      },
      onRegisterChest: (chest) => {
        this.interactables.push({
          id: chest.id,
          label: chest.label,
          actionVerb: 'Open',
          kind: 'chest',
          x: chest.x,
          y: chest.y,
          z: chest.z,
          radius: 2.7,
          collected: false,
          chestLoot: chest.loot,
          chestCoins: chest.coins,
          chestXp: chest.xp,
          message: `Opened ${chest.label}.`,
        });
      },
      onRegisterResourceYard: (yard) => {
        this.registerVillageResourceYard(yard);
      },
    });
    for (const v of this.village.villages) {
      if (v.isProcedural && v.nameAr) {
        registerDynamicVillageNameAr(v.id, v.nameAr);
      }
    }
    const vCoords = toChunkKey(
      Math.floor((this.village.site.centerX + CHUNK_SIZE * 0.5) / CHUNK_SIZE),
      Math.floor((this.village.site.centerZ + CHUNK_SIZE * 0.5) / CHUNK_SIZE),
    );
    this.villageChunkKey = vCoords;

    onStep?.(74, 'Placing ruins, mines, camps & exploration landmarks...');
    this.exploration = new ExplorationLocationManager(
      this.scene,
      textures,
      (c) => this.registerCollider(c, 'static'),
      this.interactables,
      this.landmarks,
      (bed) => {
        this.interactables.push({
          id: bed.id,
          label: bed.label,
          actionVerb: 'Sleep',
          kind: 'bed',
          x: bed.x,
          y: bed.y,
          z: bed.z,
          radius: 2.7,
          collected: false,
          bedYaw: bed.yaw,
          message: 'Rest until morning.',
        });
      },
      (chest) => {
        this.interactables.push({
          id: chest.id,
          label: chest.label,
          actionVerb: 'Open',
          kind: 'chest',
          x: chest.x,
          y: chest.y,
          z: chest.z,
          radius: 2.7,
          collected: false,
          chestLoot: chest.loot,
          chestCoins: chest.coins,
          chestXp: chest.xp,
          message: `Opened ${chest.label}.`,
        });
      },
      (res) => {
        this.registerExplorationResource(res);
      },
      (x, z, radius) =>
        this.village.villages.some(
          (v) => Math.hypot(x - v.centerX, z - v.centerZ) < v.clearanceRadius + radius,
        ),
    );

    onStep?.(78, 'Placing valley landmarks & trail signposts...');
    this.buildLandmarksAndInteractables(textures);

    onStep?.(83, 'Initializing Oakhollow & regional world NPCs...');
    this.npcs = new NPCManager(
      this.scene,
      textures.contactShadowMap,
      this.village.site,
      this.village.villages,
    );

    onStep?.(89, 'Initializing chunk-based wildlife streaming...');
    this.wildlife = new WildlifeManager(
      this.scene,
      textures.contactShadowMap,
      isSoftwareGl,
      seed,
      this.isVillageClearanceCb,
    );

    onStep?.(94, 'Streaming initial terrain chunks, flora & wildlife...');
    this.chunkManager = new ChunkManager(seed, this.worldGroup, {
      getTerrainMaterial: () => this.sharedAssets.terrainMat,
      createTerrainGeometry: (centerX, centerZ, size, segments) =>
        this.createTerrainChunkGeometry(centerX, centerZ, size, segments),
      buildSimplifiedProps: (chunk) => this.populateSimplifiedChunkProps(chunk),
      activateChunkContent: (chunk) => this.activateChunkContent(chunk),
      deactivateChunkContent: (chunk) => this.deactivateChunkContent(chunk),
      onActiveChunksChanged: (activeKeys) => {
        this.npcs.setVillageActive(activeKeys.has(this.villageChunkKey));
      },
    });
    this.chunkManager.preloadAround(0, 4);

    // Audit all procedural villages & initial resources for zero water violations
    const proceduralVillages = this.village.villages.filter((v) => v.isProcedural);
    for (const v of proceduralVillages) {
      if (isWater(v.centerX, v.centerZ) || !isLand(v.centerX, v.centerZ, 0.5)) {
        recordWaterViolation();
      }
    }
    for (const item of this.interactables) {
      if (item.kind === 'resource' || item.kind === 'herb') {
        if (isWater(item.x, item.z) || !isLand(item.x, item.z, 0.2)) {
          recordInvalidResourceSpawn();
        }
      }
    }

    const tel = getWorldGenTelemetry();
    const validVillages = Math.max(0, proceduralVillages.length - tel.waterViolations);
    console.info(`World generated: ${proceduralVillages.length} additional villages`);
    console.info(`Village validation: ${validVillages}/${proceduralVillages.length} valid`);
    console.info(`Water violations: ${tel.waterViolations}`);
    console.info(`Invalid resource spawns: ${tel.invalidResourceSpawns}`);
  }

  public isInsideVillageClearance(x: number, z: number): boolean {
    if (this.village.isInsideClearance(x, z)) return true;
    if (this.exploration?.isInsideClearance(x, z)) return true;
    return false;
  }

  public setBiomeDebugEnabled(enabled: boolean): void {
    this.biomeDebugEnabled = enabled;
    this.terrainBiomeDebugUniform.value = enabled ? 1.0 : 0.0;
  }

  public isBiomeDebugEnabled(): boolean {
    return this.biomeDebugEnabled;
  }

  public getExpectedTerrainMaterialId(
    biome: BiomeType,
  ): 'desert-sand' | 'grass-meadow' | 'forest-loam' | 'mountain-rock' | 'coastal-sand' {
    switch (biome) {
      case 'Desert':
        return 'desert-sand';
      case 'Forest':
        return 'forest-loam';
      case 'Mountains':
        return 'mountain-rock';
      case 'Beach':
        return 'coastal-sand';
      case 'Plains':
      default:
        return 'grass-meadow';
    }
  }

  private computeTerrainSurfaceSplat(
    wx: number,
    wz: number,
    wy: number,
    slope: number,
  ): {
    biome: BiomeType;
    sandWeight: number;
    rockWeight: number;
    snowWeight: number;
    desertPureWeight: number;
    grassWeight: number;
    r: number;
    g: number;
    b: number;
    debugR: number;
    debugG: number;
    debugB: number;
  } {
    const biome = getBiomeAt(wx, wz);
    const w = fillBiomeWeightsAt(wx, wz, _chunkBiomeWeights);

    // Deterministic multi-tone desert palette (light sand, warm beige, golden, terracotta/orange, dry soil)
    const duneToneNoise = fbm2D(wx * 0.011 + 19.3, wz * 0.011 - 7.1, 3) * 0.5 + 0.5;
    const soilGrainNoise = fbm2D(wx * 0.042 - 3.7, wz * 0.042 + 12.4, 2) * 0.5 + 0.5;
    const desertColorR =
      duneToneNoise < 0.35
        ? THREE.MathUtils.lerp(0.95, 0.90, duneToneNoise / 0.35)
        : duneToneNoise < 0.72
          ? THREE.MathUtils.lerp(0.90, 0.87, (duneToneNoise - 0.35) / 0.37)
          : THREE.MathUtils.lerp(0.87, 0.84, (duneToneNoise - 0.72) / 0.28);
    const desertColorG =
      duneToneNoise < 0.35
        ? THREE.MathUtils.lerp(0.88, 0.78, duneToneNoise / 0.35)
        : duneToneNoise < 0.72
          ? THREE.MathUtils.lerp(0.78, 0.70, (duneToneNoise - 0.35) / 0.37)
          : THREE.MathUtils.lerp(0.70, 0.58, (duneToneNoise - 0.72) / 0.28);
    const desertColorB =
      duneToneNoise < 0.35
        ? THREE.MathUtils.lerp(0.69, 0.54, duneToneNoise / 0.35)
        : duneToneNoise < 0.72
          ? THREE.MathUtils.lerp(0.54, 0.37, (duneToneNoise - 0.35) / 0.37)
          : THREE.MathUtils.lerp(0.37, 0.33, (duneToneNoise - 0.72) / 0.28);

    // Subtle darker dry-soil patches mixed deterministically
    const drySoilMix = THREE.MathUtils.smoothstep(soilGrainNoise, 0.62, 0.94) * 0.34;
    const dR = THREE.MathUtils.lerp(desertColorR, 0.73, drySoilMix);
    const dG = THREE.MathUtils.lerp(desertColorG, 0.56, drySoilMix);
    const dB = THREE.MathUtils.lerp(desertColorB, 0.34, drySoilMix);

    // Transition border: Grass -> Dry Grass -> Sandy Grass -> Sand -> Desert (100% continuous, zero seam)
    const dryBorderT = THREE.MathUtils.smoothstep(w.desert, 0.03, 0.24);
    const plainsR = THREE.MathUtils.lerp(0.41, 0.68, dryBorderT);
    const plainsG = THREE.MathUtils.lerp(0.61, 0.62, dryBorderT);
    const plainsB = THREE.MathUtils.lerp(0.29, 0.31, dryBorderT);

    const forestR = THREE.MathUtils.lerp(0.25, 0.56, dryBorderT);
    const forestG = THREE.MathUtils.lerp(0.43, 0.52, dryBorderT);
    const forestB = THREE.MathUtils.lerp(0.21, 0.27, dryBorderT);

    const rockR = 0.42;
    const rockG = 0.45;
    const rockB = 0.44;
    const beachR = 0.89;
    const beachG = 0.79;
    const beachB = 0.55;

    let r =
      plainsR * w.plains +
      forestR * w.forest +
      rockR * w.mountains +
      dR * w.desert +
      beachR * w.beach;
    let g =
      plainsG * w.plains +
      forestG * w.forest +
      rockG * w.mountains +
      dG * w.desert +
      beachG * w.beach;
    let b =
      plainsB * w.plains +
      forestB * w.forest +
      rockB * w.mountains +
      dB * w.desert +
      beachB * w.beach;

    // Smoothly ramp surface to 100% desert sand before entering Desert biome (min w.desert ~0.43)
    const desertSurfaceT = THREE.MathUtils.smoothstep(w.desert, 0.14, 0.42);
    r = THREE.MathUtils.lerp(r, dR, desertSurfaceT);
    g = THREE.MathUtils.lerp(g, dG, desertSurfaceT);
    b = THREE.MathUtils.lerp(b, dB, desertSurfaceT);

    let sandWeight = THREE.MathUtils.clamp(
      Math.max(desertSurfaceT, w.beach * 0.95),
      0,
      1,
    );
    const desertPureWeight = THREE.MathUtils.smoothstep(w.desert, 0.18, 0.42);

    // River & lake sandy/pebbly shoreline tint
    const lakeDist = getLakeDistanceFactor(wx, wz);
    const riverDist = Math.abs(wx - getRiverCenterXAt(wz));
    const nearWaterBank =
      wy < WATER_LEVEL + 1.45 || lakeDist < 1.15 || riverDist < 11.5;

    if (nearWaterBank && wy < WATER_LEVEL + 1.8) {
      const wetMask = THREE.MathUtils.smoothstep(WATER_LEVEL + 1.8 - wy, 0, 2.2);
      const targetR = wy < WATER_LEVEL ? 0.60 : beachR;
      const targetG = wy < WATER_LEVEL ? 0.54 : beachG;
      const targetB = wy < WATER_LEVEL ? 0.38 : beachB;
      r = THREE.MathUtils.lerp(r, targetR, wetMask * 0.85);
      g = THREE.MathUtils.lerp(g, targetG, wetMask * 0.85);
      b = THREE.MathUtils.lerp(b, targetB, wetMask * 0.85);
      sandWeight = Math.max(sandWeight, wetMask * 0.92);
    }

    // Steep cliffs become rocky slate (or warm sandstone strata in desert mesas)
    let rockWeight = w.mountains * 0.72 * (1 - desertPureWeight);
    if (slope > 0.17) {
      const cliffMask = THREE.MathUtils.smoothstep(slope, 0.17, 0.36);
      const cliffR = THREE.MathUtils.lerp(rockR, 0.76, desertPureWeight);
      const cliffG = THREE.MathUtils.lerp(rockG, 0.55, desertPureWeight);
      const cliffB = THREE.MathUtils.lerp(rockB, 0.34, desertPureWeight);
      r = THREE.MathUtils.lerp(r, cliffR, cliffMask);
      g = THREE.MathUtils.lerp(g, cliffG, cliffMask);
      b = THREE.MathUtils.lerp(b, cliffB, cliffMask);
      rockWeight = Math.max(rockWeight, cliffMask * (1 - desertPureWeight * 0.65));
    }

    // High alpine mountain peaks get snow caps (never inside Desert)
    let snowWeight = 0;
    if (wy > 42 && desertPureWeight < 0.25) {
      const snowMask = THREE.MathUtils.clamp(
        THREE.MathUtils.smoothstep(wy, 42, 62) * (1 - slope * 0.7),
        0,
        0.92,
      );
      r = THREE.MathUtils.lerp(r, 0.92, snowMask);
      g = THREE.MathUtils.lerp(g, 0.94, snowMask);
      b = THREE.MathUtils.lerp(b, 0.96, snowMask);
      snowWeight = snowMask;
    }

    // Visual biome debug color
    let debugR = 0.29;
    let debugG = 0.87;
    let debugB = 0.50;
    if (biome === 'Desert') {
      debugR = 0.96;
      debugG = 0.62;
      debugB = 0.04;
    } else if (biome === 'Forest') {
      debugR = 0.08;
      debugG = 0.50;
      debugB = 0.24;
    } else if (biome === 'Mountains') {
      debugR = 0.58;
      debugG = 0.64;
      debugB = 0.72;
    } else if (biome === 'Beach') {
      debugR = 0.99;
      debugG = 0.94;
      debugB = 0.54;
    }

    return {
      biome,
      sandWeight,
      rockWeight,
      snowWeight,
      desertPureWeight,
      grassWeight: Math.max(0, 1 - sandWeight),
      r,
      g,
      b,
      debugR,
      debugG,
      debugB,
    };
  }

  public validateBiomeMaterialAssignments(
    sampleCoords: Array<{ x: number; z: number }> = [
      { x: 0, z: 4 },
      { x: -320, z: -120 },
      { x: 0, z: -360 },
      { x: 0, z: 245 },
      { x: 260, z: 20 },
      { x: 640, z: 120 },
      { x: 960, z: 300 },
      { x: 1350, z: 180 },
    ],
  ): {
    valid: boolean;
    desertChecked: number;
    desertMaterialErrors: number;
    results: Array<{
      x: number;
      z: number;
      biome: BiomeType;
      materialId: string;
      sandWeight: number;
      grassWeight: number;
      ok: boolean;
    }>;
  } {
    let desertChecked = 0;
    let desertMaterialErrors = 0;
    const results = sampleCoords.map(({ x, z }) => {
      const wy = groundHeightAt(x, z);
      const slope = groundSlopeAt(x, z, wy);
      const splat = this.computeTerrainSurfaceSplat(x, z, wy, slope);
      const materialId = this.getExpectedTerrainMaterialId(splat.biome);
      let ok = true;
      if (splat.biome === 'Desert') {
        desertChecked++;
        if (
          materialId !== 'desert-sand' ||
          splat.sandWeight < 0.95 ||
          splat.grassWeight > 0.05
        ) {
          ok = false;
          desertMaterialErrors++;
        }
      }
      return {
        x,
        z,
        biome: splat.biome,
        materialId,
        sandWeight: Math.round(splat.sandWeight * 1000) / 1000,
        grassWeight: Math.round(splat.grassWeight * 1000) / 1000,
        ok,
      };
    });
    return {
      valid: desertMaterialErrors === 0 && desertChecked > 0,
      desertChecked,
      desertMaterialErrors,
      results,
    };
  }

  private createTerrainMaterial(
    textures: ProceduralTextureSet,
  ): THREE.MeshStandardMaterial {
    const terrainMat = new THREE.MeshStandardMaterial({
      map: textures.grassMap,
      normalMap: textures.grassNormalMap,
      normalScale: new THREE.Vector2(0.58, 0.58),
      roughnessMap: textures.grassRoughnessMap,
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.0,
    });

    const horizonColorUniform = this.waterHorizonColorUniform;
    const fogDensityUniform = this.terrainFogDensityUniform;
    const sunDirUniform = this.waterSunDirUniform;
    const sandMapUniform = this.terrainSandMapUniform;
    const sandNormalUniform = this.terrainSandNormalUniform;
    const sandRoughnessUniform = this.terrainSandRoughnessUniform;
    const rockMapUniform = this.terrainRockMapUniform;
    const rockNormalUniform = this.terrainRockNormalUniform;
    const biomeDebugUniform = this.terrainBiomeDebugUniform;

    terrainMat.onBeforeCompile = (shader) => {
      shader.uniforms.uWaterLevel = { value: WATER_LEVEL };
      shader.uniforms.uHorizonColor = horizonColorUniform;
      shader.uniforms.uTerrainFogDensity = fogDensityUniform;
      shader.uniforms.uSunDir = sunDirUniform;
      shader.uniforms.uSandMap = sandMapUniform;
      shader.uniforms.uSandNormalMap = sandNormalUniform;
      shader.uniforms.uSandRoughnessMap = sandRoughnessUniform;
      shader.uniforms.uRockMap = rockMapUniform;
      shader.uniforms.uRockNormalMap = rockNormalUniform;
      shader.uniforms.uShowBiomeDebug = biomeDebugUniform;

      shader.vertexShader =
        `attribute vec4 aBiomeSplat;\nattribute vec3 aBiomeDebugColor;\nvarying vec3 vTerrainWorldPos;\nvarying vec3 vTerrainWorldNormal;\nvarying vec4 vBiomeSplat;\nvarying vec3 vBiomeDebugColor;\n` +
        shader.vertexShader.replace(
          '#include <worldpos_vertex>',
          `
          #include <worldpos_vertex>
          vec4 tWorldPos = modelMatrix * vec4(transformed, 1.0);
          vTerrainWorldPos = tWorldPos.xyz;
          vTerrainWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
          vBiomeSplat = aBiomeSplat;
          vBiomeDebugColor = aBiomeDebugColor;
          `,
        );

      shader.fragmentShader =
        `uniform float uWaterLevel;\nuniform vec3 uHorizonColor;\nuniform float uTerrainFogDensity;\nuniform vec3 uSunDir;\nuniform sampler2D uSandMap;\nuniform sampler2D uSandNormalMap;\nuniform sampler2D uSandRoughnessMap;\nuniform sampler2D uRockMap;\nuniform sampler2D uRockNormalMap;\nuniform float uShowBiomeDebug;\nvarying vec3 vTerrainWorldPos;\nvarying vec3 vTerrainWorldNormal;\nvarying vec4 vBiomeSplat;\nvarying vec3 vBiomeDebugColor;\n
        float tHash(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.12);
          return fract(p.x * p.y);
        }
        float tNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x),
            mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }\n` +
        shader.fragmentShader
          .replace(
            '#include <map_fragment>',
            `
            #ifdef USE_MAP
              vec4 grassSample = texture2D( map, vMapUv );
              vec4 sandSample = texture2D( uSandMap, vMapUv );
              vec4 rockSample = texture2D( uRockMap, vMapUv * 0.45 );
              vec4 blendedTex = mix(grassSample, sandSample, clamp(vBiomeSplat.x, 0.0, 1.0));
              blendedTex = mix(blendedTex, rockSample, clamp(vBiomeSplat.y, 0.0, 1.0));
              blendedTex = mix(blendedTex, vec4(0.95, 0.97, 0.99, 1.0), clamp(vBiomeSplat.z, 0.0, 1.0));
              diffuseColor *= blendedTex;
            #endif
            `,
          )
          .replace(
            '#include <normal_fragment_maps>',
            `
            #ifdef USE_NORMALMAP_TANGENTSPACE
              vec3 grassN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
              vec3 sandN = texture2D( uSandNormalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
              vec3 rockN = texture2D( uRockNormalMap, vNormalMapUv * 0.45 ).xyz * 2.0 - 1.0;
              vec3 mapN = mix(grassN, sandN, clamp(vBiomeSplat.x, 0.0, 1.0));
              mapN = mix(mapN, rockN, clamp(vBiomeSplat.y, 0.0, 1.0));
              mapN = normalize(mix(mapN, vec3(0.0, 0.0, 1.0), clamp(vBiomeSplat.z, 0.0, 1.0) * 0.65));
              mapN.xy *= normalScale;
              normal = normalize( tbn * mapN );
            #endif
            `,
          )
          .replace(
            '#include <color_fragment>',
            `
            #include <color_fragment>
            // Dual-scale world-space breakup removes distant tile repetition
            float macroVar = tNoise(vTerrainWorldPos.xz * 0.032);
            float microVar = tNoise(vTerrainWorldPos.xz * 0.24);
            float breakup = 0.89 + macroVar * 0.14 + microVar * 0.08;
            diffuseColor.rgb *= breakup;

            // Desert wind-swept sand ripple modulation
            float desertMask = clamp(vBiomeSplat.w, 0.0, 1.0);
            if (desertMask > 0.02) {
              float sandRipple = sin(vTerrainWorldPos.x * 1.45 + vTerrainWorldPos.z * 0.65 + macroVar * 4.2) * 0.5 + 0.5;
              diffuseColor.rgb *= mix(1.0, 0.95 + sandRipple * 0.08, desertMask);
            }

            // Subtle cliff stratification on steep rock faces
            float steepness = 1.0 - clamp(vTerrainWorldNormal.y, 0.0, 1.0);
            if (steepness > 0.14) {
              float strata = 0.9 + 0.16 * sin(vTerrainWorldPos.y * 2.1 + macroVar * 3.2);
              diffuseColor.rgb *= mix(1.0, strata, smoothstep(0.14, 0.42, steepness));
            }

            // Wet shoreline darkening right along rivers, lake & ocean edge
            float shoreHeight = vTerrainWorldPos.y - uWaterLevel;
            float wetZone = 1.0 - smoothstep(-0.35, 0.95, shoreHeight);
            diffuseColor.rgb *= mix(1.0, 0.66, wetZone * 0.85);

            // Optional Biome Debug colorization overlay
            if (uShowBiomeDebug > 0.5) {
              vec2 gridCell = abs(fract(vTerrainWorldPos.xz / 12.0 - 0.5) - 0.5) / fwidth(vTerrainWorldPos.xz / 12.0);
              float gridLine = 1.0 - min(min(gridCell.x, gridCell.y), 1.0);
              vec3 debugCol = mix(vBiomeDebugColor, vec3(0.08, 0.08, 0.08), gridLine * 0.35);
              diffuseColor.rgb = mix(diffuseColor.rgb, debugCol, 0.82);
            }
            `,
          )
          .replace(
            '#include <roughnessmap_fragment>',
            `
            float roughnessFactor = roughness;
            #ifdef USE_ROUGHNESSMAP
              float grassRough = texture2D( roughnessMap, vRoughnessMapUv ).g;
              float sandRough = texture2D( uSandRoughnessMap, vRoughnessMapUv ).g;
              roughnessFactor *= mix(grassRough, sandRough, clamp(vBiomeSplat.x, 0.0, 1.0));
            #endif
            roughnessFactor = mix(roughnessFactor, 0.96, clamp(vBiomeSplat.w, 0.0, 1.0) * 0.85);
            float rShore = vTerrainWorldPos.y - uWaterLevel;
            float rWet = 1.0 - smoothstep(-0.25, 0.85, rShore);
            roughnessFactor = mix(roughnessFactor, 0.22, rWet * 0.82);
            `,
          )
          .replace(
            '#include <metalnessmap_fragment>',
            `
            float metalnessFactor = metalness * (1.0 - clamp(vBiomeSplat.x, 0.0, 1.0));
            #ifdef USE_METALNESSMAP
              vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
              metalnessFactor *= texelMetalness.b;
            #endif
            `,
          )
          .replace(
            '#include <opaque_fragment>',
            `
            // Subtle height-attenuated valley morning/evening mist in linear HDR space
            float valleyDepth = clamp(1.0 - (vTerrainWorldPos.y - uWaterLevel) * 0.095, 0.0, 1.0);
            float distCam = length(cameraPosition - vTerrainWorldPos);
            float mistAmt = valleyDepth * (1.0 - exp(-distCam * uTerrainFogDensity * 1.35)) * 0.34;
            float sunScatter = pow(max(dot(normalize(vTerrainWorldPos - cameraPosition), normalize(uSunDir)), 0.0), 3.0);
            vec3 valleyMistCol = mix(uHorizonColor, uHorizonColor * 1.12 + vec3(0.08, 0.05, 0.01), sunScatter * 0.45);
            outgoingLight = mix(outgoingLight, valleyMistCol, mistAmt);
            #include <opaque_fragment>
            `,
          );
    };
    return terrainMat;
  }

  private createTerrainChunkGeometry(
    centerX: number,
    centerZ: number,
    size: number,
    segments: number,
  ): THREE.BufferGeometry {
    const geo = new THREE.PlaneGeometry(size + 0.8, size + 0.8, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const count = pos.count;
    const colors = new Float32Array(count * 3);
    const biomeSplat = new Float32Array(count * 4);
    const biomeDebugColors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const wx = centerX + lx;
      const wz = centerZ + lz;
      const wy = groundHeightAt(wx, wz);

      // Skirt border vertices slightly downward by 0.65m on outer ring to hide any LOD T-junctions
      const isEdge =
        Math.abs(lx) >= size * 0.5 - 0.1 || Math.abs(lz) >= size * 0.5 - 0.1;
      pos.setY(i, isEdge ? wy - 0.65 : wy);

      const slope = groundSlopeAt(wx, wz, wy);
      const splat = this.computeTerrainSurfaceSplat(wx, wz, wy, slope);

      colors[i * 3] = splat.r;
      colors[i * 3 + 1] = splat.g;
      colors[i * 3 + 2] = splat.b;

      biomeSplat[i * 4] = splat.sandWeight;
      biomeSplat[i * 4 + 1] = splat.rockWeight;
      biomeSplat[i * 4 + 2] = splat.snowWeight;
      biomeSplat[i * 4 + 3] = splat.desertPureWeight;

      biomeDebugColors[i * 3] = splat.debugR;
      biomeDebugColors[i * 3 + 1] = splat.debugG;
      biomeDebugColors[i * 3 + 2] = splat.debugB;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aBiomeSplat', new THREE.BufferAttribute(biomeSplat, 4));
    geo.setAttribute('aBiomeDebugColor', new THREE.BufferAttribute(biomeDebugColors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }

  private buildWaterSurface(textures: ProceduralTextureSet): void {
    const waterGeo = new THREE.PlaneGeometry(
      WATER_SURFACE_SIZE,
      WATER_SURFACE_SIZE,
      this.currentWaterSegments,
      this.currentWaterSegments,
    );
    waterGeo.rotateX(-Math.PI / 2);

    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x267e91,
      normalMap: textures.waterNormalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.08,
      metalness: 0.14,
      envMapIntensity: 1.35,
      transparent: true,
      opacity: 0.86,
    });
    this.waterMat = waterMat;

    const timeUniform = this.waterTimeUniform;
    const waveAmpUniform = this.waterWaveAmpUniform;
    const waterQualityUniform = this.waterQualityUniform;
    const sunDirUniform = this.waterSunDirUniform;
    const sunColorUniform = this.waterSunColorUniform;
    const horizonColorUniform = this.waterHorizonColorUniform;
    const windDirUniform = this.waterWindDirUniform;

    waterMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = timeUniform;
      shader.uniforms.uWaveAmp = waveAmpUniform;
      shader.uniforms.uWaterQuality = waterQualityUniform;
      shader.uniforms.uSunDir = sunDirUniform;
      shader.uniforms.uSunColor = sunColorUniform;
      shader.uniforms.uHorizonColor = horizonColorUniform;
      shader.uniforms.uWindDir = windDirUniform;

      shader.vertexShader =
        `uniform float uTime;\nuniform float uWaveAmp;\nuniform float uWaterQuality;\nuniform vec2 uWindDir;\nvarying vec3 vWaterWorldPos;\nvarying float vWaveCrest;\nvarying vec3 vWaveWorldNormal;\n` +
        shader.vertexShader
          .replace(
            '#include <beginnormal_vertex>',
            `
            #include <beginnormal_vertex>
            vec4 wPos0 = modelMatrix * vec4(position, 1.0);
            float amp = 0.065 * uWaveAmp;
            float p1 = dot(wPos0.xz, vec2(0.17, 0.09)) + uTime * 1.9;
            float p2 = 0.0;
            float p3 = 0.0;
            float dhdx = cos(p1) * 0.17 * amp;
            float dhdz = cos(p1) * 0.09 * amp;
            if (uWaterQuality >= 0.5) {
              p2 = dot(wPos0.xz, vec2(-0.12, 0.21)) - uTime * 1.55;
              p3 = dot(wPos0.xz, uWindDir * 0.34) + uTime * 2.55;
              dhdx = (cos(p1) * 0.17 - cos(p2) * 0.12 + cos(p3) * uWindDir.x * 0.34 * 0.55) * amp;
              dhdz = (cos(p1) * 0.09 + cos(p2) * 0.21 + cos(p3) * uWindDir.y * 0.34 * 0.55) * amp;
            }
            objectNormal = normalize(vec3(-dhdx, 1.0, -dhdz));
            `,
          )
          .replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            float w1 = sin(p1) * amp;
            float waveH = w1;
            if (uWaterQuality >= 0.5) {
              waveH += sin(p2) * amp + sin(p3) * amp * 0.55;
            }
            transformed.y += waveH;
            vWaveCrest = smoothstep(amp * 0.65, amp * 2.1, waveH);
            vec4 wPos1 = modelMatrix * vec4(transformed, 1.0);
            vWaterWorldPos = wPos1.xyz;
            vWaveWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
            `,
          );

      shader.fragmentShader =
        `uniform float uTime;\nuniform float uWaterQuality;\nuniform vec3 uSunDir;\nuniform vec3 uSunColor;\nuniform vec3 uHorizonColor;\nuniform vec2 uWindDir;\nvarying vec3 vWaterWorldPos;\nvarying float vWaveCrest;\nvarying vec3 vWaveWorldNormal;\n` +
        shader.fragmentShader
          .replace(
            '#include <normal_fragment_maps>',
            `
            #include <normal_fragment_maps>
            if (uWaterQuality >= 0.5) {
              vec2 rUv1 = vWaterWorldPos.xz * 0.38 + uWindDir * uTime * 0.42;
              vec2 rUv2 = vWaterWorldPos.xz * 0.64 - vec2(-uWindDir.y, uWindDir.x) * uTime * 0.31;
              float rx = sin(rUv1.x * 3.1 + rUv1.y * 2.3) * 0.055 + cos(rUv2.x * 4.2 - rUv2.y * 3.7) * 0.04;
              float rz = cos(rUv1.y * 3.4 - rUv1.x * 1.9) * 0.055 + sin(rUv2.y * 4.5 + rUv2.x * 2.9) * 0.04;
              normal = normalize(normal + vec3(rx, 0.0, rz));
            }
            `,
          )
          .replace(
            '#include <color_fragment>',
            `
            #include <color_fragment>
            vec3 wViewDir = normalize(cameraPosition - vWaterWorldPos);
            float ndv = clamp(dot(normalize(vWaveWorldNormal), wViewDir), 0.0, 1.0);
            float fresnel = pow(1.0 - ndv, 3.5);
            vec3 shallowTint = vec3(0.21, 0.62, 0.66);
            vec3 deepTint = vec3(0.06, 0.24, 0.38);
            vec3 waterBase = mix(deepTint, shallowTint, clamp(0.45 + vWaveCrest * 0.55, 0.0, 1.0));
            diffuseColor.rgb = mix(waterBase, uHorizonColor * 0.88, fresnel * 0.62);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.94, 0.97), vWaveCrest * 0.28);
            diffuseColor.a = mix(0.76, 0.95, fresnel);
            `,
          )
          .replace(
            '#include <opaque_fragment>',
            `
            if (uWaterQuality >= 1.5) {
              vec3 viewVec = normalize(cameraPosition - vWaterWorldPos);
              vec2 g1 = vWaterWorldPos.xz * 1.15 + uWindDir * uTime * 0.75;
              vec2 g2 = vWaterWorldPos.xz * 1.65 - vec2(uWindDir.y, -uWindDir.x) * uTime * 0.52;
              vec3 rippleN = normalize(vec3(
                vWaveWorldNormal.x + sin(g1.x * 2.7 + g1.y * 1.9) * 0.14 + cos(g2.x * 3.1) * 0.1,
                1.0,
                vWaveWorldNormal.z + cos(g1.y * 2.9 - g1.x * 1.6) * 0.14 + sin(g2.y * 3.3) * 0.1
              ));
              vec3 reflDir = reflect(-viewVec, rippleN);
              float sunGlint = pow(max(dot(reflDir, normalize(uSunDir)), 0.0), 150.0);
              outgoingLight += uSunColor * sunGlint * 1.6 * smoothstep(-0.04, 0.15, uSunDir.y);
            }
            #include <opaque_fragment>
            `,
          );
    };

    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.position.y = WATER_LEVEL;
    this.waterMesh.receiveShadow = true;
    this.disposables.push(waterMat);
    this.worldGroup.add(this.waterMesh);
  }

  private createSharedWorldAssets(
    textures: ProceduralTextureSet,
  ): SharedWorldAssets {
    const terrainMat = this.createTerrainMaterial(textures);

    // Shared PBR Materials with Procedural Normal & Roughness Maps
    const barkMat = new THREE.MeshStandardMaterial({
      map: textures.barkMap,
      normalMap: textures.barkNormalMap,
      normalScale: new THREE.Vector2(0.7, 0.7),
      color: 0x8b6b52,
      roughness: 0.9,
      metalness: 0.02,
    });
    const pineMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0.02,
    });
    const oakMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.76,
      metalness: 0.02,
    });
    const cactusMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.86,
      metalness: 0.0,
    });
    const desertShrubMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.94,
      metalness: 0.0,
    });
    const desertPebbleMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.96,
      metalness: 0.0,
      flatShading: true,
    });
    const palmMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.76,
      metalness: 0.02,
    });
    const rockMat = new THREE.MeshStandardMaterial({
      map: textures.rockMap,
      normalMap: textures.rockNormalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughnessMap: textures.rockRoughnessMap,
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0.04,
      flatShading: true,
    });
    const mossMat = new THREE.MeshStandardMaterial({
      color: 0x547843,
      roughness: 0.94,
    });
    const herbBloomMat = new THREE.MeshStandardMaterial({
      color: 0xf4c95d,
      emissive: 0x6b4f12,
      emissiveIntensity: 0.25,
      roughness: 0.55,
    });

    const windUniform = this.grassWindUniform;
    const windAmpUniform = this.grassWindAmpUniform;
    const windDirUniform = this.grassWindDirUniform;

    // Gentle GPU wind sway for instanced tree canopies & palm fronds
    const applyCanopyWindSway = (mat: THREE.MeshStandardMaterial, swayScale: number) => {
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = windUniform;
        shader.uniforms.uWindAmp = windAmpUniform;
        shader.uniforms.uWindDir = windDirUniform;
        shader.vertexShader =
          `uniform float uTime;\nuniform float uWindAmp;\nuniform vec2 uWindDir;\n` +
          shader.vertexShader.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            float canopyMask = clamp((position.y - 2.2) / 3.8, 0.0, 1.0);
            #ifdef USE_INSTANCING
              vec4 cIp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
              float sway = sin(uTime * 1.45 + cIp.x * 0.19 + cIp.z * 0.17 + position.y * 0.4) * 0.5 + 0.5;
              float cDisp = (0.3 + sway * 0.7) * uWindAmp * ${swayScale.toFixed(2)} * canopyMask;
              transformed.x += uWindDir.x * cDisp;
              transformed.z += uWindDir.y * cDisp;
            #endif
            `,
          );
      };
    };
    applyCanopyWindSway(pineMat, 0.75);
    applyCanopyWindSway(oakMat, 0.85);
    applyCanopyWindSway(palmMat, 1.15);

    // Simplified LOD materials (faster, unshadowed silhouettes for distant chunks)
    const lodTreeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const lodRockMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });

    // Grass material with GPU wind sway + root AO & sunlit tip translucency
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.82,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    grassMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windUniform;
      shader.uniforms.uWindAmp = windAmpUniform;
      shader.uniforms.uWindDir = windDirUniform;
      shader.vertexShader =
        `uniform float uTime;\nuniform float uWindAmp;\nuniform vec2 uWindDir;\nvarying float vBladeH;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          float mask = clamp(position.y / 0.55, 0.0, 1.0);
          vBladeH = mask;
          #ifdef USE_INSTANCING
            vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float gustWave = sin(uTime * 2.1 + ip.x * 0.24 + ip.z * 0.22);
            float microFlutter = cos(uTime * 3.7 + ip.x * 0.7 - ip.z * 0.6) * 0.25;
            float lean = 0.35 + 0.65 * gustWave + microFlutter;
            float disp = lean * uWindAmp * mask * mask;
            transformed.x += uWindDir.x * disp;
            transformed.z += uWindDir.y * disp;
          #endif
          `,
        );
      shader.fragmentShader =
        `varying float vBladeH;\n` +
        shader.fragmentShader.replace(
          '#include <color_fragment>',
          `
          #include <color_fragment>
          float rootAo = mix(0.54, 1.16, smoothstep(0.0, 0.92, vBladeH));
          diffuseColor.rgb *= rootAo;
          diffuseColor.rgb += vec3(0.05, 0.07, 0.01) * vBladeH * vBladeH;
          `,
        );
    };

    // Wildflower & Woodland Fern material with gentle wind sway
    const flowerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.7,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    flowerMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windUniform;
      shader.uniforms.uWindAmp = windAmpUniform;
      shader.uniforms.uWindDir = windDirUniform;
      shader.vertexShader =
        `uniform float uTime;\nuniform float uWindAmp;\nuniform vec2 uWindDir;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          float fMask = clamp(position.y / 0.42, 0.0, 1.0);
          #ifdef USE_INSTANCING
            vec4 fIp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float fWave = sin(uTime * 2.25 + fIp.x * 0.28 + fIp.z * 0.25);
            float fDisp = (0.25 + 0.75 * fWave) * uWindAmp * 0.95 * fMask * fMask;
            transformed.x += uWindDir.x * fDisp;
            transformed.z += uWindDir.y * fDisp;
          #endif
          `,
        );
    };

    // Geometries (High Detail vs Simplified LOD)
    const pineTrunkGeo = createPineTrunkGeometry();
    const pineCanopyGeo = createPineCanopyGeometry();
    const pineLodGeo = new THREE.ConeGeometry(1.85, 6.2, 5);
    pineLodGeo.translate(0, 3.1, 0);

    const oakTrunkGeo = createOakTrunkGeometry();
    const oakCanopyGeo = createOakCanopyGeometry();
    const oakLodGeo = new THREE.IcosahedronGeometry(2.0, 0);
    oakLodGeo.translate(0, 3.8, 0);

    const cactusGeo = createDesertCactusGeometry();
    const desertShrubGeo = createDesertShrubGeometry();
    const desertPebbleGeo = createDesertPebbleClusterGeometry();
    const palmTrunkGeo = createPalmTrunkGeometry();
    const palmCrownGeo = createPalmCrownGeometry();

    const rockGeo = createRockOutcropGeometry();
    const rockLodGeo = new THREE.DodecahedronGeometry(1.15, 0);
    rockLodGeo.translate(0, 0.6, 0);

    const grassGeo = createGrassClusterGeometry();
    const flowerGeo = createWildflowerClusterGeometry();
    const herbLeafGeo = new THREE.ConeGeometry(0.28, 0.42, 6);
    const herbBloomGeo = new THREE.DodecahedronGeometry(0.11, 0);

    this.disposables.push(
      terrainMat,
      barkMat,
      pineMat,
      oakMat,
      cactusMat,
      desertShrubMat,
      desertPebbleMat,
      palmMat,
      rockMat,
      mossMat,
      herbBloomMat,
      lodTreeMat,
      lodRockMat,
      grassMat,
      flowerMat,
      pineTrunkGeo,
      pineCanopyGeo,
      pineLodGeo,
      oakTrunkGeo,
      oakCanopyGeo,
      oakLodGeo,
      cactusGeo,
      desertShrubGeo,
      desertPebbleGeo,
      palmTrunkGeo,
      palmCrownGeo,
      rockGeo,
      rockLodGeo,
      grassGeo,
      flowerGeo,
      herbLeafGeo,
      herbBloomGeo,
    );

    return {
      terrainMat,
      barkMat,
      pineMat,
      oakMat,
      cactusMat,
      desertShrubMat,
      desertPebbleMat,
      palmMat,
      rockMat,
      mossMat,
      lodTreeMat,
      lodRockMat,
      grassMat,
      flowerMat,
      herbBloomMat,
      pineTrunkGeo,
      pineCanopyGeo,
      pineLodGeo,
      oakTrunkGeo,
      oakCanopyGeo,
      oakLodGeo,
      cactusGeo,
      desertShrubGeo,
      desertPebbleGeo,
      palmTrunkGeo,
      palmCrownGeo,
      rockGeo,
      rockLodGeo,
      grassGeo,
      flowerGeo,
      herbLeafGeo,
      herbBloomGeo,
    };
  }

  private addInstancedGroupMesh(
    targetGroup: THREE.Object3D,
    disposableBucket: Array<{ dispose: () => void }>,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    mats: THREE.Matrix4[],
    cols: THREE.Color[] | null,
    castShadow: boolean,
  ): THREE.InstancedMesh | null {
    if (mats.length === 0) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
    mesh.userData.__origCastShadow = castShadow;
    mesh.castShadow = castShadow && this.currentPropShadows && !this.isSoftwareGl;
    mesh.receiveShadow = this.currentShadowsEnabled;
    mesh.frustumCulled = true;
    for (let i = 0; i < mats.length; i++) {
      mesh.setMatrixAt(i, mats[i]);
      if (cols) {
        _tempColor.copy(cols[i]);
        mesh.setColorAt(i, _tempColor);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    targetGroup.add(mesh);
    disposableBucket.push(mesh);
    return mesh;
  }

  private sampleChunkTreesAndRocks(
    chunk: ManagedChunk,
    registerColliders: boolean,
  ) {
    const rand = seededRandom(chunk.seed);

    const pineMatrices: THREE.Matrix4[] = [];
    const pineColors: THREE.Color[] = [];
    const oakMatrices: THREE.Matrix4[] = [];
    const oakColors: THREE.Color[] = [];
    const cactusMatrices: THREE.Matrix4[] = [];
    const cactusColors: THREE.Color[] = [];
    const desertShrubMatrices: THREE.Matrix4[] = [];
    const desertShrubColors: THREE.Color[] = [];
    const desertPebbleMatrices: THREE.Matrix4[] = [];
    const desertPebbleColors: THREE.Color[] = [];
    const palmMatrices: THREE.Matrix4[] = [];
    const palmColors: THREE.Color[] = [];
    const rockMatrices: THREE.Matrix4[] = [];
    const rockColors: THREE.Color[] = [];

    const localOccupied: Array<{ x: number; z: number; r: number }> = [];
    const isFree = (x: number, z: number, r: number) => {
      if (Math.hypot(x, z - 4) < 10.5) return false;
      if (this.isInsideVillageClearance(x, z)) return false;
      for (const s of localOccupied) {
        if ((x - s.x) ** 2 + (z - s.z) ** 2 < (r + s.r) ** 2) return false;
      }
      return true;
    };

    // 1. Trees & Desert/Coastal Flora
    const treeAttempts = 54;
    for (let i = 0; i < treeAttempts; i++) {
      const wx = chunk.centerX + (rand() - 0.5) * (CHUNK_SIZE - 8);
      const wz = chunk.centerZ + (rand() - 0.5) * (CHUNK_SIZE - 8);
      if (Math.hypot(wx, wz) > PLAYABLE_RADIUS + 35) continue;

      const wy = groundHeightAt(wx, wz);
      if (!isLand(wx, wz, 0.72, wy) || isNearWater(wx, wz, 3.6)) continue;

      const slope = groundSlopeAt(wx, wz, wy);
      if (slope > 0.28) continue;

      const biome = getBiomeAt(wx, wz);
      const w = fillBiomeWeightsAt(wx, wz, _chunkBiomeWeights);
      const densityRoll = rand();

      if (biome === 'Forest' && w.desert < 0.22 && densityRoll > 0.16) {
        if (!isFree(wx, wz, 4.0)) continue;
        const isPine = rand() < 0.62;
        const sc = 0.85 + rand() * 0.45;
        _dummy.position.set(wx, wy - 0.12, wz);
        _dummy.rotation.set(0, rand() * Math.PI * 2, 0);
        _dummy.scale.set(sc, sc * (0.94 + rand() * 0.18), sc);
        _dummy.updateMatrix();
        localOccupied.push({ x: wx, z: wz, r: 2.3 * sc });

        if (isPine) {
          pineMatrices.push(_dummy.matrix.clone());
          const t = 0.85 + rand() * 0.28;
          pineColors.push(new THREE.Color(0.17 * t, 0.37 * t, 0.21 * t));
          if (registerColliders) {
            this.registerCollider(
              {
                kind: 'cylinder',
                x: wx,
                z: wz,
                radius: 0.55 * sc,
                minY: wy - 0.5,
                maxY: wy + 6.5 * sc,
              },
              chunk.key,
            );
          }
        } else {
          oakMatrices.push(_dummy.matrix.clone());
          const t = 0.85 + rand() * 0.28;
          oakColors.push(new THREE.Color(0.26 * t, 0.5 * t, 0.22 * t));
          if (registerColliders) {
            this.registerCollider(
              {
                kind: 'cylinder',
                x: wx,
                z: wz,
                radius: 0.65 * sc,
                minY: wy - 0.5,
                maxY: wy + 5.5 * sc,
              },
              chunk.key,
            );
          }
        }
      } else if (biome === 'Plains' && w.desert < 0.22 && densityRoll > 0.72) {
        if (!isFree(wx, wz, 5.2)) continue;
        const sc = 0.85 + rand() * 0.35;
        _dummy.position.set(wx, wy - 0.1, wz);
        _dummy.rotation.set(0, rand() * Math.PI * 2, 0);
        _dummy.scale.setScalar(sc);
        _dummy.updateMatrix();
        localOccupied.push({ x: wx, z: wz, r: 2.8 * sc });
        oakMatrices.push(_dummy.matrix.clone());
        const t = 0.9 + rand() * 0.24;
        oakColors.push(new THREE.Color(0.32 * t, 0.55 * t, 0.24 * t));
        if (registerColliders) {
          this.registerCollider(
            {
              kind: 'cylinder',
              x: wx,
              z: wz,
              radius: 0.65 * sc,
              minY: wy - 0.5,
              maxY: wy + 5.5 * sc,
            },
            chunk.key,
          );
        }
      } else if (biome === 'Mountains' && wy < 36 && w.desert < 0.22 && densityRoll > 0.52) {
        if (!isFree(wx, wz, 4.2)) continue;
        const sc = 0.8 + rand() * 0.42;
        _dummy.position.set(wx, wy - 0.12, wz);
        _dummy.rotation.set(0, rand() * Math.PI * 2, 0);
        _dummy.scale.setScalar(sc);
        _dummy.updateMatrix();
        localOccupied.push({ x: wx, z: wz, r: 2.2 * sc });
        pineMatrices.push(_dummy.matrix.clone());
        const t = 0.8 + rand() * 0.25;
        pineColors.push(new THREE.Color(0.16 * t, 0.33 * t, 0.23 * t));
        if (registerColliders) {
          this.registerCollider(
            {
              kind: 'cylinder',
              x: wx,
              z: wz,
              radius: 0.54 * sc,
              minY: wy - 0.5,
              maxY: wy + 6.2 * sc,
            },
            chunk.key,
          );
        }
      } else if ((biome === 'Desert' || w.desert > 0.55) && densityRoll > 0.7) {
        if (!isFree(wx, wz, 3.6)) continue;
        const sc = 0.82 + rand() * 0.48;
        _dummy.position.set(wx, wy - 0.08, wz);
        _dummy.rotation.set(0, rand() * Math.PI * 2, 0);
        _dummy.scale.set(sc * (0.9 + rand() * 0.2), sc * (0.85 + rand() * 0.35), sc * (0.9 + rand() * 0.2));
        _dummy.updateMatrix();
        localOccupied.push({ x: wx, z: wz, r: 1.6 * sc });
        cactusMatrices.push(_dummy.matrix.clone());
        const t = 0.86 + rand() * 0.24;
        cactusColors.push(new THREE.Color(0.30 * t, 0.49 * t, 0.24 * t));
        if (registerColliders) {
          this.registerCollider(
            {
              kind: 'cylinder',
              x: wx,
              z: wz,
              radius: 0.45 * sc,
              minY: wy - 0.5,
              maxY: wy + 3.8 * sc,
            },
            chunk.key,
          );
        }
      } else if (biome === 'Beach' && wy > 0.8 && wy < 4.5 && densityRoll > 0.74) {
        if (!isFree(wx, wz, 4.8)) continue;
        const sc = 0.85 + rand() * 0.35;
        _dummy.position.set(wx, wy - 0.1, wz);
        _dummy.rotation.set(0, rand() * Math.PI * 2, 0);
        _dummy.scale.setScalar(sc);
        _dummy.updateMatrix();
        localOccupied.push({ x: wx, z: wz, r: 2.0 * sc });
        palmMatrices.push(_dummy.matrix.clone());
        const t = 0.9 + rand() * 0.2;
        palmColors.push(new THREE.Color(0.32 * t, 0.56 * t, 0.24 * t));
        if (registerColliders) {
          this.registerCollider(
            {
              kind: 'cylinder',
              x: wx,
              z: wz,
              radius: 0.44 * sc,
              minY: wy - 0.5,
              maxY: wy + 5.8 * sc,
            },
            chunk.key,
          );
        }
      }
    }

    // 1b. Sparse Dry Desert Shrubs & Sandstone Pebbles (lightweight instanced ground detail)
    const desertDetailScale = Math.max(0.3, Math.min(1.15, this.currentVegetationScale));
    const desertShrubAttempts = Math.round(34 * desertDetailScale);
    for (let i = 0; i < desertShrubAttempts; i++) {
      const wx = chunk.centerX + (rand() - 0.5) * (CHUNK_SIZE - 8);
      const wz = chunk.centerZ + (rand() - 0.5) * (CHUNK_SIZE - 8);
      if (Math.hypot(wx, wz) > PLAYABLE_RADIUS + 20) continue;
      const wy = groundHeightAt(wx, wz);
      if (!isLand(wx, wz, 0.65, wy) || isNearWater(wx, wz, 3.0)) continue;
      if (groundSlopeAt(wx, wz, wy) > 0.26) continue;
      const biome = getBiomeAt(wx, wz);
      const w = fillBiomeWeightsAt(wx, wz, _chunkBiomeWeights);
      if (biome !== 'Desert' && w.desert < 0.48) continue;
      if (this.isInsideVillageClearance(wx, wz)) continue;

      const sc = 0.68 + rand() * 0.65;
      _dummy.position.set(wx, wy - 0.04, wz);
      _dummy.rotation.set((rand() - 0.5) * 0.14, rand() * Math.PI * 2, (rand() - 0.5) * 0.14);
      _dummy.scale.set(sc * (0.9 + rand() * 0.28), sc * (0.78 + rand() * 0.34), sc * (0.9 + rand() * 0.28));
      _dummy.updateMatrix();
      desertShrubMatrices.push(_dummy.matrix.clone());
      const tone = rand();
      desertShrubColors.push(
        tone < 0.35
          ? new THREE.Color(0x9c8b56)
          : tone < 0.7
            ? new THREE.Color(0x887848)
            : new THREE.Color(0x7c7d4d),
      );
    }

    const desertPebbleAttempts = Math.round(42 * desertDetailScale);
    for (let i = 0; i < desertPebbleAttempts; i++) {
      const wx = chunk.centerX + (rand() - 0.5) * (CHUNK_SIZE - 6);
      const wz = chunk.centerZ + (rand() - 0.5) * (CHUNK_SIZE - 6);
      if (Math.hypot(wx, wz) > PLAYABLE_RADIUS + 20) continue;
      const wy = groundHeightAt(wx, wz);
      if (!isLand(wx, wz, 0.45, wy) || getHydrologyClearance(wx, wz) < 2.2) continue;
      if (groundSlopeAt(wx, wz, wy) > 0.32) continue;
      const biome = getBiomeAt(wx, wz);
      const w = fillBiomeWeightsAt(wx, wz, _chunkBiomeWeights);
      if (biome !== 'Desert' && w.desert < 0.48) continue;

      const sc = 0.62 + rand() * 0.85;
      _dummy.position.set(wx, wy - 0.03, wz);
      _dummy.rotation.set((rand() - 0.5) * 0.2, rand() * Math.PI * 2, (rand() - 0.5) * 0.2);
      _dummy.scale.set(sc * (0.9 + rand() * 0.35), sc * (0.55 + rand() * 0.3), sc * (0.9 + rand() * 0.35));
      _dummy.updateMatrix();
      desertPebbleMatrices.push(_dummy.matrix.clone());
      const shade = 0.84 + rand() * 0.26;
      desertPebbleColors.push(new THREE.Color(0.79 * shade, 0.61 * shade, 0.42 * shade));
    }

    // 2. Rocks (denser in Mountains & Coast, warm sandstone in Desert)
    const rockAttempts = 22;
    for (let i = 0; i < rockAttempts; i++) {
      const wx = chunk.centerX + (rand() - 0.5) * (CHUNK_SIZE - 8);
      const wz = chunk.centerZ + (rand() - 0.5) * (CHUNK_SIZE - 8);
      if (Math.hypot(wx, wz) > PLAYABLE_RADIUS + 40) continue;

      const wy = groundHeightAt(wx, wz);
      if (!isLand(wx, wz, 0.45, wy) || getHydrologyClearance(wx, wz) < 2.0) continue;
      const slope = groundSlopeAt(wx, wz, wy);
      if (slope > 0.44) continue;

      const biome = getBiomeAt(wx, wz);
      const chance = biome === 'Mountains' ? 0.62 : biome === 'Plains' ? 0.28 : 0.42;
      if (rand() > chance) continue;
      if (!isFree(wx, wz, 2.8)) continue;

      const sc = 0.72 + rand() * 1.15;
      _dummy.position.set(wx, wy - 0.16 * sc, wz);
      _dummy.rotation.set(
        (rand() - 0.5) * 0.16,
        rand() * Math.PI * 2,
        (rand() - 0.5) * 0.16,
      );
      _dummy.scale.set(
        sc * (0.9 + rand() * 0.25),
        sc * (0.78 + rand() * 0.35),
        sc * (0.9 + rand() * 0.25),
      );
      _dummy.updateMatrix();
      localOccupied.push({ x: wx, z: wz, r: 1.5 * sc });
      rockMatrices.push(_dummy.matrix.clone());

      const tone = 0.82 + rand() * 0.28;
      if (biome === 'Desert') {
        rockColors.push(new THREE.Color(0.84 * tone, 0.62 * tone, 0.40 * tone));
      } else {
        rockColors.push(new THREE.Color(0.55 * tone, 0.57 * tone, 0.55 * tone));
      }

      if (registerColliders) {
        this.registerCollider(
          {
            kind: 'sphere',
            x: wx,
            y: wy + 0.55 * sc,
            z: wz,
            radius: 1.32 * sc,
          },
          chunk.key,
        );
      }
    }

    return {
      rand,
      pineMatrices,
      pineColors,
      oakMatrices,
      oakColors,
      cactusMatrices,
      cactusColors,
      desertShrubMatrices,
      desertShrubColors,
      desertPebbleMatrices,
      desertPebbleColors,
      palmMatrices,
      palmColors,
      rockMatrices,
      rockColors,
    };
  }

  private populateSimplifiedChunkProps(chunk: ManagedChunk): void {
    if (!chunk.farLodGroup) return;
    const assets = this.sharedAssets;
    const layout = this.sampleChunkTreesAndRocks(chunk, false);

    this.addInstancedGroupMesh(
      chunk.farLodGroup,
      chunk.simplifiedDisposables,
      assets.pineLodGeo,
      assets.lodTreeMat,
      layout.pineMatrices,
      layout.pineColors,
      false,
    );
    this.addInstancedGroupMesh(
      chunk.farLodGroup,
      chunk.simplifiedDisposables,
      assets.oakLodGeo,
      assets.lodTreeMat,
      layout.oakMatrices,
      layout.oakColors,
      false,
    );
    this.addInstancedGroupMesh(
      chunk.farLodGroup,
      chunk.simplifiedDisposables,
      assets.cactusGeo,
      assets.lodTreeMat,
      layout.cactusMatrices,
      layout.cactusColors,
      false,
    );
    this.addInstancedGroupMesh(
      chunk.farLodGroup,
      chunk.simplifiedDisposables,
      assets.desertShrubGeo,
      assets.lodTreeMat,
      layout.desertShrubMatrices,
      layout.desertShrubColors,
      false,
    );
    this.addInstancedGroupMesh(
      chunk.farLodGroup,
      chunk.simplifiedDisposables,
      assets.pineLodGeo,
      assets.lodTreeMat,
      layout.palmMatrices,
      layout.palmColors,
      false,
    );
    this.addInstancedGroupMesh(
      chunk.farLodGroup,
      chunk.simplifiedDisposables,
      assets.rockLodGeo,
      assets.lodRockMat,
      layout.rockMatrices,
      layout.rockColors,
      false,
    );
  }

  private activateChunkContent(chunk: ManagedChunk): void {
    if (!chunk.nearGroup) return;
    const assets = this.sharedAssets;
    const layout = this.sampleChunkTreesAndRocks(chunk, true);
    const rand = layout.rand;

    // 1. High-detail Instanced Trees, Cacti, Desert Shrubs & Rocks
    this.addInstancedGroupMesh(
      chunk.nearGroup,
      chunk.activeDisposables,
      assets.pineTrunkGeo,
      assets.barkMat,
      layout.pineMatrices,
      null,
      true,
    );
    this.addInstancedGroupMesh(
      chunk.nearGroup,
      chunk.activeDisposables,
      assets.pineCanopyGeo,
      assets.pineMat,
      layout.pineMatrices,
      layout.pineColors,
      true,
    );
    this.addInstancedGroupMesh(
      chunk.nearGroup,
      chunk.activeDisposables,
      assets.oakTrunkGeo,
      assets.barkMat,
      layout.oakMatrices,
      null,
      true,
    );
    this.addInstancedGroupMesh(
      chunk.nearGroup,
      chunk.activeDisposables,
      assets.oakCanopyGeo,
      assets.oakMat,
      layout.oakMatrices,
      layout.oakColors,
      true,
    );
    this.addInstancedGroupMesh(
      chunk.nearGroup,
      chunk.activeDisposables,
      assets.cactusGeo,
      assets.cactusMat,
      layout.cactusMatrices,
      layout.cactusColors,
      true,
    );
    this.addInstancedGroupMesh(
      chunk.nearGroup,
      chunk.activeDisposables,
      assets.desertShrubGeo,
      assets.desertShrubMat,
      layout.desertShrubMatrices,
      layout.desertShrubColors,
      false,
    );
    this.addInstancedGroupMesh(
      chunk.nearGroup,
      chunk.activeDisposables,
      assets.desertPebbleGeo,
      assets.desertPebbleMat,
      layout.desertPebbleMatrices,
      layout.desertPebbleColors,
      false,
    );
    this.addInstancedGroupMesh(
      chunk.nearGroup,
      chunk.activeDisposables,
      assets.palmTrunkGeo,
      assets.barkMat,
      layout.palmMatrices,
      null,
      true,
    );
    this.addInstancedGroupMesh(
      chunk.nearGroup,
      chunk.activeDisposables,
      assets.palmCrownGeo,
      assets.palmMat,
      layout.palmMatrices,
      layout.palmColors,
      true,
    );
    this.addInstancedGroupMesh(
      chunk.nearGroup,
      chunk.activeDisposables,
      assets.rockGeo,
      assets.rockMat,
      layout.rockMatrices,
      layout.rockColors,
      true,
    );

    // 2. Grass Tufts & Wildflowers (excluded inside Desert & dries smoothly along desert edge)
    const grassMatrices: THREE.Matrix4[] = [];
    const grassColors: THREE.Color[] = [];
    const grassAttempts = Math.round(320 * Math.max(0.28, Math.min(1.2, this.currentVegetationScale)));
    for (let i = 0; i < grassAttempts; i++) {
      const wx = chunk.centerX + (rand() - 0.5) * (CHUNK_SIZE - 4);
      const wz = chunk.centerZ + (rand() - 0.5) * (CHUNK_SIZE - 4);
      if (Math.hypot(wx, wz) > PLAYABLE_RADIUS + 10) continue;
      if (this.village.isInsideClearance(wx, wz)) continue;

      const wy = groundHeightAt(wx, wz);
      if (!isLand(wx, wz, 0.58, wy) || getHydrologyClearance(wx, wz) < 2.2) continue;
      if (groundSlopeAt(wx, wz, wy) > 0.18) continue;

      const biome = getBiomeAt(wx, wz);
      const w = fillBiomeWeightsAt(wx, wz, _chunkBiomeWeights);
      if (biome === 'Desert' || w.desert > 0.24) continue;
      if (biome !== 'Plains' && biome !== 'Forest') continue;

      _dummy.position.set(wx, wy - 0.03, wz);
      _dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      const sXZ = 0.78 + rand() * 0.55;
      const sY = (0.72 + rand() * 0.75) * (1 - THREE.MathUtils.clamp(w.desert * 2.2, 0, 0.55));
      _dummy.scale.set(sXZ, sY, sXZ);
      _dummy.updateMatrix();
      grassMatrices.push(_dummy.matrix.clone());

      const tint = 0.84 + rand() * 0.32;
      const dryMix = THREE.MathUtils.smoothstep(w.desert, 0.06, 0.24);
      if (biome === 'Forest') {
        grassColors.push(
          new THREE.Color(
            THREE.MathUtils.lerp(0.28, 0.56, dryMix) * tint,
            THREE.MathUtils.lerp(0.49, 0.52, dryMix) * tint,
            THREE.MathUtils.lerp(0.22, 0.26, dryMix) * tint,
          ),
        );
      } else {
        grassColors.push(
          new THREE.Color(
            THREE.MathUtils.lerp(0.38, 0.62, dryMix) * tint,
            THREE.MathUtils.lerp(0.60, 0.55, dryMix) * tint,
            THREE.MathUtils.lerp(0.24, 0.27, dryMix) * tint,
          ),
        );
      }
    }

    const flowerMatrices: THREE.Matrix4[] = [];
    const flowerColors: THREE.Color[] = [];
    const flowerAttempts = Math.round(54 * Math.max(0.28, Math.min(1.2, this.currentVegetationScale)));
    for (let i = 0; i < flowerAttempts; i++) {
      const wx = chunk.centerX + (rand() - 0.5) * (CHUNK_SIZE - 6);
      const wz = chunk.centerZ + (rand() - 0.5) * (CHUNK_SIZE - 6);
      if (Math.hypot(wx, wz) > PLAYABLE_RADIUS + 8) continue;
      if (this.village.isInsideClearance(wx, wz)) continue;

      const wy = groundHeightAt(wx, wz);
      if (!isLand(wx, wz, 0.72, wy) || getHydrologyClearance(wx, wz) < 2.8) continue;
      if (groundSlopeAt(wx, wz, wy) > 0.16) continue;

      const biome = getBiomeAt(wx, wz);
      const w = fillBiomeWeightsAt(wx, wz, _chunkBiomeWeights);
      if (biome === 'Desert' || w.desert > 0.14) continue;
      if (biome !== 'Plains' && biome !== 'Forest') continue;

      _dummy.position.set(wx, wy - 0.02, wz);
      _dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      const fScale = 0.75 + rand() * 0.55;
      _dummy.scale.set(fScale, fScale * (0.85 + rand() * 0.4), fScale);
      _dummy.updateMatrix();
      flowerMatrices.push(_dummy.matrix.clone());

      if (biome === 'Forest') {
        const r = rand();
        flowerColors.push(
          r < 0.5
            ? new THREE.Color(0x6d8ee6)
            : r < 0.82
              ? new THREE.Color(0xc8d9ff)
              : new THREE.Color(0xe6a6d2),
        );
      } else {
        const r = rand();
        flowerColors.push(
          r < 0.36
            ? new THREE.Color(0xf6cf4f)
            : r < 0.62
              ? new THREE.Color(0xfff4de)
              : r < 0.84
                ? new THREE.Color(0xa97ee8)
                : new THREE.Color(0xef775a),
        );
      }
    }

    chunk.grassMesh = this.addInstancedGroupMesh(
      chunk.rootGroup,
      chunk.activeDisposables,
      assets.grassGeo,
      assets.grassMat,
      grassMatrices,
      grassColors,
      false,
    );
    chunk.flowerMesh = this.addInstancedGroupMesh(
      chunk.rootGroup,
      chunk.activeDisposables,
      assets.flowerGeo,
      assets.flowerMat,
      flowerMatrices,
      flowerColors,
      false,
    );

    // 3. Deterministic Per-Chunk Gatherables & Provisions
    this.spawnChunkGatherables(chunk, rand);

    // 4. Deterministic Per-Chunk NPCs & Wildlife
    this.npcs.spawnChunkNpcs(
      chunk.key,
      chunk.cx,
      chunk.cz,
      chunk.seed,
      CHUNK_SIZE,
      this.isVillageClearanceCb,
    );
    this.wildlife.spawnChunkWildlife(
      chunk.key,
      chunk.cx,
      chunk.cz,
      chunk.seed,
      CHUNK_SIZE,
      this.isVillageClearanceCb,
    );
  }

  private deactivateChunkContent(chunk: ManagedChunk): void {
    this.unregisterColliders(chunk.key);
    this.unloadChunkGatherables(chunk.key);
    this.npcs.unloadChunkNpcs(chunk.key);
    this.wildlife.unloadChunkWildlife(chunk.key);
  }

  private registerExplorationResource(res: ExplorationResourcePlacement): void {
    const mesh = createResourceNodeMesh(
      res.kind,
      this.sharedAssets,
      this.disposables,
    );
    mesh.position.set(res.x, res.y, res.z);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.worldGroup.add(mesh);

    if (res.kind !== 'fiber') {
      this.registerCollider(
        {
          kind: 'cylinder',
          x: res.x,
          z: res.z,
          radius: res.kind === 'wood' ? 0.65 : 0.85,
          minY: res.y - 0.5,
          maxY: res.y + 2.4,
        },
        'static',
      );
    }

    const depletedState = this.depletedNodes.get(res.id);
    const maxUses = 3;
    const usesRemaining = depletedState ? depletedState.usesRemaining : maxUses;
    const regenAtElapsed = depletedState?.regenAtElapsed;
    const isDepleted = usesRemaining <= 0;
    mesh.visible = !isDepleted;

    this.interactables.push({
      id: res.id,
      label: res.label,
      actionVerb:
        res.kind === 'wood' ? 'Chop' : res.kind === 'fiber' ? 'Gather' : 'Mine',
      kind: 'resource',
      resourceKind: res.kind,
      x: res.x,
      y: res.y,
      z: res.z,
      radius: 3.1,
      collected: isDepleted,
      usesRemaining,
      maxUses,
      regenAtElapsed,
      yieldCount: res.kind === 'iron-ore' || res.kind === 'coal' ? 2 : 3,
      meshGroup: mesh,
      message: `Harvested ${res.label}.`,
    });
  }

  private registerVillageResourceYard(yard: VillageResourceYardRegistration): void {
    const kindMap: Record<
      string,
      { kind: WorldResourceKind; label: string; actionVerb: string; yieldCount: number }
    > = {
      wood: { kind: 'wood', label: `${yard.villageName} Timber Stack`, actionVerb: 'Gather', yieldCount: 2 },
      'iron-ore': { kind: 'iron-ore', label: `${yard.villageName} Ore Cache`, actionVerb: 'Mine', yieldCount: 2 },
      'gold-ore': { kind: 'gold-ore', label: `${yard.villageName} Gold Seam`, actionVerb: 'Mine', yieldCount: 2 },
      clay: { kind: 'clay', label: `${yard.villageName} Clay Pile`, actionVerb: 'Gather', yieldCount: 2 },
      wheat: { kind: 'wheat', label: `${yard.villageName} Wheat Bundle`, actionVerb: 'Harvest', yieldCount: 2 },
      driftwood: { kind: 'driftwood', label: `${yard.villageName} Driftwood Rack`, actionVerb: 'Gather', yieldCount: 2 },
      cactus: { kind: 'desert-plant', label: `${yard.villageName} Oasis Herbpots`, actionVerb: 'Gather', yieldCount: 2 },
      stone: { kind: 'stone', label: `${yard.villageName} Quarry Pile`, actionVerb: 'Mine', yieldCount: 2 },
    };
    const meta = kindMap[yard.resourceKind] ?? kindMap.stone;
    const validPos = isValidResourceLocation(yard.x, yard.z, meta.kind, { allowWaterEdge: true })
      ? { x: yard.x, y: groundHeightAt(yard.x, yard.z), z: yard.z }
      : findNearestValidResourceLocation(yard.x, yard.z, meta.kind, 18, { allowWaterEdge: true });
    if (!validPos || isWater(validPos.x, validPos.z)) {
      recordRejectedResourceCandidate(yard.x, yard.z, meta.kind);
      return;
    }

    const nodeMesh = createResourceNodeMesh(meta.kind, this.sharedAssets, this.disposables);
    nodeMesh.position.set(validPos.x, validPos.y - 0.02, validPos.z);
    nodeMesh.matrixAutoUpdate = false;
    nodeMesh.updateMatrix();
    this.worldGroup.add(nodeMesh);

    const id = `village-res:${yard.villageId}`;
    const depletedState = this.depletedNodes.get(id);
    const maxUses = 3;
    const usesRemaining = depletedState ? depletedState.usesRemaining : maxUses;
    const isDepleted = usesRemaining <= 0;
    nodeMesh.visible = !isDepleted;

    this.interactables.push({
      id,
      label: meta.label,
      actionVerb: meta.actionVerb,
      kind: 'resource',
      resourceKind: meta.kind,
      x: validPos.x,
      y: validPos.y,
      z: validPos.z,
      radius: 3.1,
      collected: isDepleted,
      usesRemaining,
      maxUses,
      regenAtElapsed: depletedState?.regenAtElapsed,
      yieldCount: meta.yieldCount,
      meshGroup: nodeMesh,
      message: `Gathered ${meta.label}.`,
    });
  }

  private spawnChunkGatherables(
    chunk: ManagedChunk,
    rand: () => number,
  ): void {
    if (Math.hypot(chunk.centerX, chunk.centerZ) > PLAYABLE_RADIUS - 12) return;

    const spawned: WorldInteractable[] = [];
    const maxObjects = chunk.cx === 0 && chunk.cz === 0 ? 0 : rand() < 0.65 ? 2 : 1;

    for (let i = 0; i < maxObjects; i++) {
      const rawX = chunk.centerX + (rand() - 0.5) * (CHUNK_SIZE - 20);
      const rawZ = chunk.centerZ + (rand() - 0.5) * (CHUNK_SIZE - 20);
      if (Math.hypot(rawX, rawZ) > PLAYABLE_RADIUS - 20) continue;
      if (Math.hypot(rawX, rawZ - 4) < 35) continue;
      if (this.isInsideVillageClearance(rawX, rawZ)) continue;

      const rawBiome = getBiomeAt(rawX, rawZ);
      const candidateType = rawBiome === 'Plains' || rawBiome === 'Forest' ? 'meadow-herb' : 'pickup';
      const safePos = isValidResourceLocation(rawX, rawZ, candidateType, { maxSlope: 0.24 })
        ? { x: rawX, y: groundHeightAt(rawX, rawZ), z: rawZ }
        : findNearestValidResourceLocation(rawX, rawZ, candidateType, 26, { maxSlope: 0.24 });
      if (!safePos) continue;

      const wx = safePos.x;
      const wz = safePos.z;
      const wy = safePos.y;
      if (wy > 34 || this.isInsideVillageClearance(wx, wz)) continue;

      const biome = getBiomeAt(wx, wz);
      const isHerb = (biome === 'Plains' || biome === 'Forest') && rand() < 0.72;

      if (isHerb) {
        const id = `chunk-herb:${chunk.key}:${i}`;
        if (this.persistedCollectedIds.has(id)) continue;

        const herb = createSharedHerbCluster(
          this.sharedAssets.herbLeafGeo,
          this.sharedAssets.herbBloomGeo,
          this.sharedAssets.mossMat,
          this.sharedAssets.herbBloomMat,
        );
        herb.position.set(wx, wy - 0.02, wz);
        herb.matrixAutoUpdate = false;
        herb.updateMatrix();
        chunk.rootGroup.add(herb);

        const entry: WorldInteractable = {
          id,
          label: 'Meadow Herb',
          actionVerb: 'Gather',
          kind: 'herb',
          x: wx,
          y: wy,
          z: wz,
          radius: 3.0,
          collected: false,
          meshGroup: herb,
          chunkKey: chunk.key,
          message: 'Gathered Meadow Herb (+15 Health, added to Explorer Pack).',
        };
        this.interactables.push(entry);
        spawned.push(entry);
      } else if (rand() < 0.52) {
        const id = `chunk-pickup:${chunk.key}:${i}`;
        if (this.persistedCollectedIds.has(id)) continue;

        const isTonic = biome === 'Mountains' || rand() < 0.35;
        const itemId = isTonic ? 'apothecary-tonic' : 'sun-apple';
        const label = isTonic ? 'Apothecary Tonic' : 'Sun Apple';
        const mesh = createPickupMesh(itemId, chunk.activeDisposables);
        mesh.position.set(wx, wy + 0.28, wz);
        mesh.userData.baseY = wy + 0.28;
        chunk.rootGroup.add(mesh);

        const entry: WorldInteractable = {
          id,
          label,
          actionVerb: 'Pick up',
          kind: 'pickup',
          x: wx,
          y: wy,
          z: wz,
          radius: 2.8,
          collected: false,
          meshGroup: mesh,
          chunkKey: chunk.key,
          itemId,
          count: 1,
          message: `Picked up ${label}.`,
        };
        this.interactables.push(entry);
        this.activePickups.push(entry);
        spawned.push(entry);
      }
    }

    // Biome-Specific Interactive Resources (strictly on validated dry land, spaced + clustered)
    const MIN_RESOURCE_SPACING_SQ = 10 * 10;
    const placedResourceCoords: Array<{ x: number; z: number }> = [];
    const resourceCount = chunk.cx === 0 && chunk.cz === 0 ? 3 : 4 + Math.floor(rand() * 3);
    let nodeCounter = 0;

    const placeValidatedResourceNode = (
      candX: number,
      candZ: number,
      resKind: WorldResourceKind,
      label: string,
      actionVerb: string,
      maxUses: number,
      yieldCount: number,
      isTree: boolean,
      allowWaterEdge: boolean,
      enforceSpacing: boolean,
    ): { x: number; z: number } | null => {
      if (Math.hypot(candX, candZ) > PLAYABLE_RADIUS - 20) return null;
      if (Math.hypot(candX, candZ - 4) < 9.5) return null;
      if (this.isInsideVillageClearance(candX, candZ)) return null;

      const validOpt = {
        allowWaterEdge,
        maxSlope: isTree ? 0.25 : undefined,
      };
      let safePos: { x: number; y: number; z: number } | null = null;
      if (isValidResourceLocation(candX, candZ, resKind, validOpt)) {
        safePos = { x: candX, y: groundHeightAt(candX, candZ), z: candZ };
      } else {
        recordRejectedResourceCandidate(candX, candZ, resKind);
        safePos = findNearestValidResourceLocation(candX, candZ, resKind, 28, validOpt);
      }

      if (!safePos) {
        recordRejectedResourceCandidate(candX, candZ, resKind);
        return null;
      }

      const wx = safePos.x;
      const wz = safePos.z;
      const wy = safePos.y;
      if (
        wy > 44 ||
        isWater(wx, wz) ||
        !isLand(wx, wz, 0.25) ||
        Math.hypot(wx, wz - 4) < 9.5 ||
        this.isInsideVillageClearance(wx, wz)
      ) {
        recordRejectedResourceCandidate(wx, wz, resKind);
        return null;
      }

      if (enforceSpacing) {
        for (let p = 0; p < placedResourceCoords.length; p++) {
          const dx = wx - placedResourceCoords[p].x;
          const dz = wz - placedResourceCoords[p].z;
          if (dx * dx + dz * dz < MIN_RESOURCE_SPACING_SQ) {
            return null;
          }
        }
      }

      const id = `chunk-res:${chunk.key}:${nodeCounter++}`;
      const savedNode = this.depletedNodes.get(id);
      let usesRemaining = savedNode ? savedNode.usesRemaining : maxUses;
      let regenAtElapsed = savedNode?.regenAtElapsed;
      if (usesRemaining <= 0 && regenAtElapsed !== undefined && this.lastElapsed >= regenAtElapsed) {
        usesRemaining = maxUses;
        regenAtElapsed = undefined;
        this.depletedNodes.delete(id);
      }
      const isDepleted = usesRemaining <= 0;

      const nodeMesh = isTree
        ? createHarvestableTreeNodeMesh(this.sharedAssets, chunk.activeDisposables)
        : createResourceNodeMesh(resKind, this.sharedAssets, chunk.activeDisposables);
      nodeMesh.position.set(wx, wy - 0.04, wz);
      nodeMesh.rotation.y = rand() * Math.PI * 2;
      nodeMesh.matrixAutoUpdate = false;
      nodeMesh.updateMatrix();
      nodeMesh.visible = !isDepleted;
      chunk.rootGroup.add(nodeMesh);

      if (
        isTree ||
        resKind === 'stone' ||
        resKind === 'iron-ore' ||
        resKind === 'gold-ore' ||
        resKind === 'coal' ||
        resKind === 'rare-mineral' ||
        resKind === 'cactus'
      ) {
        this.registerCollider(
          {
            kind: 'cylinder',
            x: wx,
            z: wz,
            radius: isTree ? 0.58 : resKind === 'cactus' ? 0.5 : 0.85,
            minY: wy - 0.5,
            maxY: wy + (isTree ? 5.2 : resKind === 'cactus' ? 2.4 : 1.5),
          },
          chunk.key,
        );
      }

      const entry: WorldInteractable = {
        id,
        label,
        actionVerb,
        kind: 'resource',
        resourceKind: resKind,
        x: wx,
        y: wy,
        z: wz,
        radius: isTree ? 3.3 : 2.9,
        collected: isDepleted,
        usesRemaining,
        maxUses,
        regenAtElapsed,
        yieldCount,
        meshGroup: nodeMesh,
        chunkKey: chunk.key,
        message: `Collected ${label}.`,
      };
      this.interactables.push(entry);
      spawned.push(entry);
      placedResourceCoords.push({ x: wx, z: wz });
      return { x: wx, z: wz };
    };

    for (let rIdx = 0; rIdx < resourceCount; rIdx++) {
      const rawX = chunk.centerX + (rand() - 0.5) * (CHUNK_SIZE - 18);
      const rawZ = chunk.centerZ + (rand() - 0.5) * (CHUNK_SIZE - 18);
      if (Math.hypot(rawX, rawZ) > PLAYABLE_RADIUS - 20) continue;
      if (Math.hypot(rawX, rawZ - 4) < 9.5) continue;
      if (this.isInsideVillageClearance(rawX, rawZ)) continue;

      const rawBiome = getBiomeAt(rawX, rawZ);
      const inValley = isValleyTerrain(rawX, rawZ);
      const rawClearance = getHydrologyClearance(rawX, rawZ);
      const isRiverbankDry =
        (rawBiome === 'Plains' || rawBiome === 'Forest') &&
        rawClearance >= 1.4 &&
        rawClearance <= 24;

      const roll = rand();
      let resKind: WorldResourceKind = 'wood';
      let label = 'Fallen Branch';
      let actionVerb = 'Gather';
      let maxUses = 2;
      let yieldCount = 2;
      let isTree = false;
      let allowWaterEdge = false;

      if (rawBiome === 'Forest') {
        if (roll < 0.28) {
          resKind = 'wood';
          label = 'Timber Tree';
          actionVerb = 'Chop';
          maxUses = 3;
          yieldCount = 2;
          isTree = true;
        } else if (roll < 0.45) {
          resKind = 'wood';
          label = 'Fallen Branch';
          actionVerb = 'Gather';
          maxUses = 1;
          yieldCount = 2;
        } else if (roll < 0.62) {
          resKind = 'fiber';
          label = 'Wild Fiber Bush';
          actionVerb = 'Gather';
          maxUses = 2;
          yieldCount = 2;
        } else if (roll < 0.78) {
          resKind = 'mushroom';
          label = 'Forest Mushroom';
          actionVerb = 'Gather';
          maxUses = 2;
          yieldCount = 2;
        } else if (roll < 0.92) {
          resKind = 'berries';
          label = 'Wild Berries';
          actionVerb = 'Gather';
          maxUses = 2;
          yieldCount = 2;
        } else {
          resKind = 'clay';
          label = 'Riverbank Clay';
          actionVerb = 'Gather';
          maxUses = 2;
          yieldCount = 2;
          allowWaterEdge = isRiverbankDry;
        }
      } else if (rawBiome === 'Mountains') {
        if (roll < 0.3) {
          resKind = 'stone';
          label = 'Granite Outcrop';
          actionVerb = 'Mine';
          maxUses = 3;
          yieldCount = 2;
        } else if (roll < 0.56) {
          resKind = 'iron-ore';
          label = 'Iron Ore Vein';
          actionVerb = 'Mine';
          maxUses = 3;
          yieldCount = 2;
        } else if (roll < 0.76) {
          resKind = 'coal';
          label = 'Coal Seam';
          actionVerb = 'Mine';
          maxUses = 3;
          yieldCount = 2;
        } else if (roll < 0.89) {
          resKind = 'gold-ore';
          label = 'Gold Ore Vein';
          actionVerb = 'Mine';
          maxUses = 2;
          yieldCount = 2;
        } else if (roll < 0.96) {
          resKind = 'rare-mineral';
          label = 'Sunstone Crystal Vein';
          actionVerb = 'Mine';
          maxUses = 2;
          yieldCount = 1;
        } else {
          resKind = 'wood';
          label = 'Alpine Pine';
          actionVerb = 'Chop';
          maxUses = 3;
          yieldCount = 2;
          isTree = true;
        }
      } else if (rawBiome === 'Desert') {
        if (roll < 0.22) {
          resKind = 'sand';
          label = 'Golden Sand Deposit';
          actionVerb = 'Gather';
          maxUses = 2;
          yieldCount = 3;
        } else if (roll < 0.42) {
          resKind = 'stone';
          label = 'Sandstone Outcrop';
          actionVerb = 'Mine';
          maxUses = 2;
          yieldCount = 2;
        } else if (roll < 0.62) {
          resKind = 'cactus';
          label = 'Desert Cactus';
          actionVerb = 'Harvest';
          maxUses = 2;
          yieldCount = 2;
        } else if (roll < 0.78) {
          resKind = 'desert-plant';
          label = 'Sunbloom Sage';
          actionVerb = 'Gather';
          maxUses = 2;
          yieldCount = 2;
        } else if (roll < 0.9) {
          resKind = 'iron-ore';
          label = 'Desert Iron Vein';
          actionVerb = 'Mine';
          maxUses = 3;
          yieldCount = 2;
        } else if (roll < 0.96) {
          resKind = 'gold-ore';
          label = 'Desert Gold Vein';
          actionVerb = 'Mine';
          maxUses = 2;
          yieldCount = 1;
        } else {
          resKind = 'rare-mineral';
          label = 'Sunstone Crystal';
          actionVerb = 'Mine';
          maxUses = 2;
          yieldCount = 1;
        }
      } else if (rawBiome === 'Beach') {
        allowWaterEdge = true;
        if (roll < 0.3) {
          resKind = 'sand';
          label = 'Clean Beach Sand';
          actionVerb = 'Gather';
          maxUses = 2;
          yieldCount = 3;
        } else if (roll < 0.64) {
          resKind = 'shell';
          label = 'Coastal Seashell';
          actionVerb = 'Pick up';
          maxUses = 1;
          yieldCount = 2;
        } else if (roll < 0.86) {
          resKind = 'driftwood';
          label = 'Sea Driftwood';
          actionVerb = 'Gather';
          maxUses = 2;
          yieldCount = 2;
        } else {
          resKind = 'clay';
          label = 'Estuary Clay';
          actionVerb = 'Gather';
          maxUses = 2;
          yieldCount = 2;
        }
      } else if (inValley || isRiverbankDry) {
        if (isRiverbankDry && roll < 0.24) {
          resKind = 'clay';
          label = 'Riverbank Clay';
          actionVerb = 'Gather';
          maxUses = 2;
          yieldCount = 2;
          allowWaterEdge = true;
        } else if (roll < 0.44) {
          resKind = 'wood';
          label = isRiverbankDry ? 'Valley Alder Timber' : 'Fallen Branch';
          actionVerb = 'Gather';
          maxUses = 2;
          yieldCount = 2;
        } else if (roll < 0.64) {
          resKind = 'wheat';
          label = 'Wild Valley Wheat';
          actionVerb = 'Harvest';
          maxUses = 2;
          yieldCount = 2;
        } else if (roll < 0.8) {
          resKind = 'stone';
          label = 'Valley Fieldstone';
          actionVerb = 'Mine';
          maxUses = 2;
          yieldCount = 2;
        } else if (roll < 0.9) {
          resKind = 'iron-ore';
          label = 'Valley Iron Seam';
          actionVerb = 'Mine';
          maxUses = 2;
          yieldCount = 2;
        } else {
          resKind = 'fiber';
          label = isRiverbankDry ? 'Bankside Reeds' : 'Valley Fiber';
          actionVerb = 'Gather';
          maxUses = 2;
          yieldCount = 2;
          allowWaterEdge = isRiverbankDry;
        }
      } else {
        // Plains
        if (roll < 0.3) {
          resKind = 'fiber';
          label = 'Tall Grass & Fiber';
          actionVerb = 'Gather';
          maxUses = 2;
          yieldCount = 2;
        } else if (roll < 0.52) {
          resKind = 'wheat';
          label = 'Golden Wheat Patch';
          actionVerb = 'Harvest';
          maxUses = 2;
          yieldCount = 2;
        } else if (roll < 0.72) {
          resKind = 'flower';
          label = 'Meadow Wildflower';
          actionVerb = 'Gather';
          maxUses = 2;
          yieldCount = 2;
        } else if (roll < 0.88) {
          resKind = 'stone';
          label = 'Small Fieldstone';
          actionVerb = 'Mine';
          maxUses = 2;
          yieldCount = 2;
        } else {
          resKind = 'wood';
          label = 'Timber Tree';
          actionVerb = 'Chop';
          maxUses = 3;
          yieldCount = 2;
          isTree = true;
        }
      }

      const placed = placeValidatedResourceNode(
        rawX,
        rawZ,
        resKind,
        label,
        actionVerb,
        maxUses,
        yieldCount,
        isTree,
        allowWaterEdge,
        true,
      );

      // Cluster companion nodes occasionally (trees, wheat, stone/ore, clay, desert plants)
      if (
        placed &&
        rand() < 0.32 &&
        (resKind === 'wheat' ||
          resKind === 'wood' ||
          resKind === 'stone' ||
          resKind === 'clay' ||
          resKind === 'berries')
      ) {
        const cAngle = rand() * Math.PI * 2;
        const cDist = 2.8 + rand() * 2.2;
        placeValidatedResourceNode(
          placed.x + Math.cos(cAngle) * cDist,
          placed.z + Math.sin(cAngle) * cDist,
          resKind,
          label,
          actionVerb,
          maxUses,
          yieldCount,
          isTree,
          allowWaterEdge,
          false,
        );
      }
    }

    if (spawned.length > 0) {
      this.chunkInteractables.set(chunk.key, spawned);
    }
  }

  private unloadChunkGatherables(chunkKey: string): void {
    const list = this.chunkInteractables.get(chunkKey);
    if (!list) return;

    const removeSet = new Set(list);
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (item.kind === 'resource') {
        if ((item.usesRemaining ?? 0) < (item.maxUses ?? 1)) {
          this.depletedNodes.set(item.id, {
            usesRemaining: item.usesRemaining ?? 0,
            regenAtElapsed: item.regenAtElapsed ?? this.lastElapsed + RESOURCE_REGEN_SECONDS,
          });
        }
      } else if (item.collected) {
        this.persistedCollectedIds.add(item.id);
      }
      if (item.meshGroup) {
        item.meshGroup.removeFromParent();
      }
    }

    for (let i = this.interactables.length - 1; i >= 0; i--) {
      if (removeSet.has(this.interactables[i])) {
        this.interactables.splice(i, 1);
      }
    }
    for (let i = this.activePickups.length - 1; i >= 0; i--) {
      if (removeSet.has(this.activePickups[i])) {
        this.activePickups.splice(i, 1);
      }
    }

    this.chunkInteractables.delete(chunkKey);
  }

  private buildLandmarksAndInteractables(textures: ProceduralTextureSet): void {
    const rockMat = new THREE.MeshStandardMaterial({
      map: textures.rockMap,
      normalMap: textures.rockNormalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughnessMap: textures.rockRoughnessMap,
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0.04,
      flatShading: true,
    });
    const barkMat = new THREE.MeshStandardMaterial({
      map: textures.barkMap,
      normalMap: textures.barkNormalMap,
      normalScale: new THREE.Vector2(0.7, 0.7),
      color: 0x8b6b52,
      roughness: 0.9,
    });
    const plankMat = new THREE.MeshStandardMaterial({
      color: 0x8d6747,
      roughness: 0.86,
    });
    const mossMat = new THREE.MeshStandardMaterial({
      color: 0x547843,
      roughness: 0.95,
    });
    const herbBloomMat = new THREE.MeshStandardMaterial({
      color: 0xf4c95d,
      emissive: 0x6b4f12,
      emissiveIntensity: 0.25,
      roughness: 0.55,
    });
    this.landmarkMaterials = { rockMat, barkMat };
    this.disposables.push(rockMat, barkMat, plankMat, mossMat, herbBloomMat);

    this.landmarks.push({
      id: 'spawn-glade',
      name: 'Sunlit Glade',
      kind: 'spawn',
      x: 0,
      z: 4,
      discovered: true,
    });

    // Trail Stone Cairn near spawn
    const cairnX = 12.5;
    const cairnZ = -14.0;
    const cairnY = groundHeightAt(cairnX, cairnZ);
    const cairn = createLandmarkCairn(rockMat, mossMat, this.disposables);
    cairn.position.set(cairnX, cairnY - 0.06, cairnZ);
    cairn.matrixAutoUpdate = false;
    cairn.updateMatrix();
    this.worldGroup.add(cairn);
    this.landmarkGroups.push(cairn);
    this.registerCollider({
      kind: 'cylinder',
      x: cairnX,
      z: cairnZ,
      radius: 1.15,
      minY: cairnY - 0.5,
      maxY: cairnY + 2.8,
    });
    this.interactables.push({
      id: 'cairn-glade',
      label: 'Trail Cairn',
      actionVerb: 'Inspect',
      kind: 'cairn',
      x: cairnX,
      y: cairnY,
      z: cairnZ,
      radius: 3.4,
      collected: false,
      message: 'Valley Cairn: "West lies the Emerald Lake; East the Sunlit Dunes; South the Sea."',
    });
    this.landmarks.push({
      id: 'cairn-glade',
      name: 'Trail Cairn',
      kind: 'cairn',
      x: cairnX,
      z: cairnZ,
      discovered: false,
    });

    // Biome Trail Signposts across the expanded world
    const signposts = [
      {
        id: 'sign-glade',
        label: 'River Trail Signpost',
        x: -10,
        z: 10,
        rotY: 0.65,
        message: 'River Crossing · Follow the stream north to the Mountain Lake or south to the Beach.',
      },
      {
        id: 'sign-lake',
        label: 'Lakeside Signpost',
        x: LAKE_CENTER_X + 54,
        z: LAKE_CENTER_Z + 12,
        rotY: -0.5,
        message: 'Whispering Lake · Crystal alpine waters fed from the northern peaks.',
      },
      {
        id: 'sign-desert',
        label: 'Dune Edge Signpost',
        x: 118,
        z: 24,
        rotY: 1.35,
        message: 'Sunstone Desert · Rolling ochre dunes and weathered sandstone mesas ahead.',
      },
      {
        id: 'sign-mountains',
        label: 'Highland Pass Signpost',
        x: 10,
        z: -138,
        rotY: 0.1,
        message: 'Northern Peaks · Snow-dusted granite ridges rise above the timberline.',
      },
      {
        id: 'sign-beach',
        label: 'Coastal Cove Signpost',
        x: 4,
        z: getCoastlineZAt(4) - 22,
        rotY: 3.1,
        message: 'Golden Coastline · Sandy shores meet the southern bay.',
      },
    ];

    for (const s of signposts) {
      const safeSign = isLand(s.x, s.z, 0.7) && !isNearWater(s.x, s.z, 3.0)
        ? { x: s.x, y: groundHeightAt(s.x, s.z), z: s.z }
        : findNearestValidLand(s.x, s.z, 3.5, 0.34, 48);
      const sx = safeSign.x;
      const sz = safeSign.z;
      const sy = safeSign.y;
      if (sy < WATER_LEVEL + 0.45) continue;
      const sign = createTrailSignpost(barkMat, plankMat, this.disposables);
      sign.position.set(sx, sy - 0.04, sz);
      sign.rotation.y = s.rotY;
      sign.matrixAutoUpdate = false;
      sign.updateMatrix();
      this.worldGroup.add(sign);
      this.landmarkGroups.push(sign);
      this.registerCollider({
        kind: 'cylinder',
        x: sx,
        z: sz,
        radius: 0.42,
        minY: sy - 0.5,
        maxY: sy + 2.2,
      });
      this.interactables.push({
        id: s.id,
        label: s.label,
        actionVerb: 'Read',
        kind: 'signpost',
        x: sx,
        y: sy,
        z: sz,
        radius: 3.3,
        collected: false,
        message: s.message,
      });
      this.landmarks.push({
        id: s.id,
        name: s.label,
        kind: 'signpost',
        x: sx,
        z: sz,
        discovered: false,
      });
    }

    // Gatherable Meadow Herbs across Plains & Forest
    const herbSpots = [
      { id: 'herb-1', x: -6.5, z: -7.5 },
      { id: 'herb-2', x: 18.0, z: 14.0 },
      { id: 'herb-3', x: -45.0, z: -22.0 },
      { id: 'herb-4', x: -96.0, z: 32.0 },
      { id: 'herb-5', x: 48.0, z: -64.0 },
      { id: 'herb-6', x: -135.0, z: -68.0 },
      { id: 'herb-7', x: -24.0, z: -58.0 },
      { id: 'herb-8', x: 34.0, z: -18.0 },
      { id: 'herb-9', x: -62.0, z: 18.0 },
      { id: 'herb-10', x: -16.0, z: 26.0 },
      { id: 'herb-11', x: 42.0, z: 18.0 },
      { id: 'herb-12', x: -78.0, z: -28.0 },
    ];

    for (const h of herbSpots) {
      const safeHerb = isValidResourceLocation(h.x, h.z, 'meadow-herb')
        ? { x: h.x, y: groundHeightAt(h.x, h.z), z: h.z }
        : findNearestValidResourceLocation(h.x, h.z, 'meadow-herb', 42);
      if (!safeHerb) continue;
      const hy = safeHerb.y;
      const herb = createHerbCluster(mossMat, herbBloomMat, this.disposables);
      herb.position.set(safeHerb.x, hy - 0.02, safeHerb.z);
      herb.matrixAutoUpdate = false;
      herb.updateMatrix();
      this.worldGroup.add(herb);
      this.interactables.push({
        id: h.id,
        label: 'Meadow Herb',
        actionVerb: 'Gather',
        kind: 'herb',
        x: safeHerb.x,
        y: hy,
        z: safeHerb.z,
        radius: 3.0,
        collected: false,
        meshGroup: herb,
        message: 'Gathered Meadow Herb (+15 Health, added to Explorer Pack).',
      });
      this.landmarks.push({
        id: h.id,
        name: 'Meadow Herb Patch',
        kind: 'herb',
        x: safeHerb.x,
        z: safeHerb.z,
        discovered: false,
      });
    }

    // Pickable world equipment & provisions
    const worldPickups: Array<{
      id: string;
      x: number;
      z: number;
      itemId: string;
      count: number;
      label: string;
    }> = [
      {
        id: 'pickup-trail-boots',
        x: -14,
        z: -12,
        itemId: 'trail-boots',
        count: 1,
        label: "Scout's Trail Boots",
      },
      {
        id: 'pickup-warden-cloak',
        x: 13.5,
        z: -135.5,
        itemId: 'warden-cloak',
        count: 1,
        label: 'Oakhollow Ranger Cloak',
      },
      {
        id: 'pickup-apple-1',
        x: 8,
        z: -8,
        itemId: 'sun-apple',
        count: 2,
        label: 'Sun Apple',
      },
      {
        id: 'pickup-apple-2',
        x: this.village.site.centerX + 26,
        z: this.village.site.centerZ + 18,
        itemId: 'sun-apple',
        count: 2,
        label: 'Sun Apple',
      },
    ];

    for (const p of worldPickups) {
      const safePos = isValidResourceLocation(p.x, p.z, 'pickup')
        ? { x: p.x, y: groundHeightAt(p.x, p.z), z: p.z }
        : findNearestValidLand(p.x, p.z, 3.5, 0.34, 48);
      this.spawnWorldPickup(safePos.x, safePos.z, p.itemId, p.count, p.label, p.id);
    }
  }

  public spawnWorldPickup(
    x: number,
    z: number,
    itemId: string,
    count: number,
    label: string,
    customId?: string,
    isPlayerDrop = false,
  ): WorldInteractable {
    let px = x;
    let pz = z;
    if (isWater(px, pz)) {
      const safe = findNearestValidLand(px, pz, 3.0, 0.38, 60);
      px = safe.x;
      pz = safe.z;
    }
    const wy = groundHeightAt(px, pz);
    const mesh = createPickupMesh(itemId, this.disposables);
    mesh.position.set(px, wy + 0.28, pz);
    mesh.userData.baseY = wy + 0.28;
    this.worldGroup.add(mesh);

    const entry: WorldInteractable = {
      id: customId ?? `pickup-${itemId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      label: count > 1 ? `${label} ×${count}` : label,
      actionVerb: 'Pick up',
      kind: 'pickup',
      x: px,
      y: wy,
      z: pz,
      radius: 2.8,
      collected: false,
      meshGroup: mesh,
      message: `Picked up ${label}${count > 1 ? ` ×${count}` : ''}.`,
      itemId,
      count,
      isPlayerDrop,
    };
    this.interactables.push(entry);
    this.activePickups.push(entry);
    return entry;
  }

  public spawnAnimalLootDrops(
    x: number,
    z: number,
    drops: Array<{ itemId: string; count: number; label: string }>,
  ): void {
    const baseSafe = isWater(x, z)
      ? findNearestValidLand(x, z, 3.5, 0.38, 60)
      : { x, z };
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      const angle = (i * Math.PI * 2) / Math.max(1, drops.length) + 0.4;
      const offset = drops.length > 1 ? 0.65 : 0;
      this.spawnWorldPickup(
        baseSafe.x + Math.cos(angle) * offset,
        baseSafe.z + Math.sin(angle) * offset,
        d.itemId,
        d.count,
        d.label,
        undefined,
        true,
      );
    }
  }

  public collectResourceNode(
    item: WorldInteractable,
    elapsed: number,
  ): {
    itemId: string;
    count: number;
    depleted: boolean;
    remainingUses: number;
  } | null {
    if (item.kind !== 'resource' || item.collected || !item.resourceKind) {
      return null;
    }

    const usesLeft = Math.max(0, (item.usesRemaining ?? 1) - 1);
    item.usesRemaining = usesLeft;
    const yieldCount = item.yieldCount ?? 2;
    const depleted = usesLeft <= 0;

    if (depleted) {
      item.collected = true;
      item.regenAtElapsed = elapsed + RESOURCE_REGEN_SECONDS;
      if (item.meshGroup) {
        item.meshGroup.visible = false;
      }
      this.depletedNodes.set(item.id, {
        usesRemaining: 0,
        regenAtElapsed: item.regenAtElapsed,
      });
    } else {
      this.depletedNodes.set(item.id, {
        usesRemaining: usesLeft,
        regenAtElapsed: elapsed + RESOURCE_REGEN_SECONDS,
      });
    }

    return {
      itemId: item.resourceKind,
      count: yieldCount,
      depleted,
      remainingUses: usesLeft,
    };
  }

  public openChest(
    item: WorldInteractable,
  ): {
    loot: Array<{ itemId: string; count: number }>;
    coins: number;
    xp: number;
  } | null {
    if (item.kind !== 'chest' || item.collected) return null;
    item.collected = true;
    this.openedChestIds.add(item.id);
    this.village.markChestOpened(item.id);
    this.exploration.markChestOpened(item.id);
    return {
      loot: item.chestLoot ?? [],
      coins: item.chestCoins ?? 0,
      xp: item.chestXp ?? 0,
    };
  }

  public setDoorOpen(doorId: string, isOpen: boolean): boolean {
    const res = this.village.setDoorOpen(doorId, isOpen);
    const interactable = this.interactables.find((i) => i.id === doorId && i.kind === 'door');
    if (interactable) {
      interactable.isOpen = isOpen;
      interactable.actionVerb = isOpen ? 'Close' : 'Open';
      interactable.message = isOpen ? 'Opened the cottage door.' : 'Closed the cottage door.';
    }
    if (!res) return Boolean(interactable);

    const colliderKey = `door:${doorId}`;
    this.unregisterColliders(colliderKey);
    if (!isOpen) {
      this.registerCollider(
        {
          kind: 'cylinder',
          x: res.x,
          z: res.z,
          radius: 0.65,
          minY: res.minY,
          maxY: res.maxY,
        },
        colliderKey,
      );
    }
    return true;
  }

  public markChestOpenedRemote(chestId: string): WorldInteractable | null {
    this.openedChestIds.add(chestId);
    this.village.markChestOpened(chestId);
    this.exploration.markChestOpened(chestId);
    const item = this.interactables.find((i) => i.id === chestId && i.kind === 'chest') ?? null;
    if (item) {
      item.collected = true;
    }
    return item;
  }

  public applyResourceNodeState(
    nodeId: string,
    usesRemaining: number,
    depleted: boolean,
    regenAtElapsed: number,
  ): void {
    const item = this.interactables.find((i) => i.id === nodeId && i.kind === 'resource');
    if (depleted || usesRemaining <= 0) {
      this.depletedNodes.set(nodeId, {
        usesRemaining: 0,
        regenAtElapsed,
      });
    } else {
      this.depletedNodes.set(nodeId, {
        usesRemaining,
        regenAtElapsed,
      });
    }
    if (item) {
      item.usesRemaining = Math.max(0, usesRemaining);
      item.collected = depleted || usesRemaining <= 0;
      item.regenAtElapsed = regenAtElapsed;
      if (item.meshGroup) {
        item.meshGroup.visible = !item.collected;
      }
    }
  }

  public markPickupCollectedRemote(pickupId: string): WorldInteractable | null {
    const item = this.interactables.find(
      (i) => i.id === pickupId && (i.kind === 'pickup' || i.kind === 'herb'),
    );
    if (!item) {
      this.persistedCollectedIds.add(pickupId);
      return null;
    }
    item.collected = true;
    if (!item.isPlayerDrop) {
      this.persistedCollectedIds.add(item.id);
    }
    if (item.meshGroup) {
      item.meshGroup.visible = false;
    }
    return item;
  }

  public removePickupById(pickupId: string): void {
    const idx = this.interactables.findIndex((i) => i.id === pickupId);
    if (idx !== -1) {
      const item = this.interactables[idx];
      item.collected = true;
      if (item.meshGroup) {
        item.meshGroup.visible = false;
        item.meshGroup.removeFromParent();
      }
      if (item.isPlayerDrop) {
        this.interactables.splice(idx, 1);
      }
    }
    const activeIdx = this.activePickups.findIndex((p) => p.id === pickupId);
    if (activeIdx !== -1) {
      this.activePickups.splice(activeIdx, 1);
    }
  }

  public placeBedAt(
    x: number,
    z: number,
    yaw: number,
    customId?: string,
  ): WorldInteractable | null {
    const wy = groundHeightAt(x, z);
    if (!customId && (!isLand(x, z, 0.65, wy) || groundSlopeAt(x, z, wy) > 0.36)) {
      return null;
    }

    const id =
      customId ?? `placed-bed-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const group = createCampBedMesh(this.disposables);
    group.position.set(x, wy, z);
    group.rotation.y = yaw;
    this.worldGroup.add(group);
    this.placedBedGroups.push({ id, group });

    this.registerCollider(
      {
        kind: 'cylinder',
        x,
        z,
        radius: 0.72,
        minY: wy - 0.3,
        maxY: wy + 0.9,
      },
      `bed:${id}`,
    );

    if (!this.placedBeds.some((b) => b.id === id)) {
      this.placedBeds.push({ id, x, z, yaw });
    }

    const entry: WorldInteractable = {
      id,
      label: 'Camp Bed',
      actionVerb: 'Sleep',
      kind: 'bed',
      x,
      y: wy,
      z,
      radius: 2.8,
      collected: false,
      bedYaw: yaw,
      isPlacedBed: true,
      meshGroup: group,
      message: 'Rest until morning.',
    };
    this.interactables.push(entry);
    return entry;
  }

  public exportImportantState(): {
    discoveredLandmarkIds: string[];
    collectedInteractableIds: string[];
    droppedPickups: Array<{
      id: string;
      itemId: string;
      count: number;
      label: string;
      x: number;
      z: number;
    }>;
    placedBeds: Array<{ id: string; x: number; z: number; yaw: number }>;
    depletedNodes: Array<{
      id: string;
      usesRemaining: number;
      regenAtElapsed: number;
    }>;
    openedChestIds: string[];
  } {
    const discoveredLandmarkIds = this.landmarks
      .filter((l) => l.discovered)
      .map((l) => l.id);

    const collectedSet = new Set<string>(this.persistedCollectedIds);
    for (let i = 0; i < this.interactables.length; i++) {
      const item = this.interactables[i];
      if (item.collected && !item.isPlayerDrop && item.kind !== 'resource' && item.kind !== 'chest') {
        collectedSet.add(item.id);
      }
      if (item.kind === 'resource' && (item.usesRemaining ?? 1) < (item.maxUses ?? 1)) {
        this.depletedNodes.set(item.id, {
          usesRemaining: item.usesRemaining ?? 0,
          regenAtElapsed: item.regenAtElapsed ?? this.lastElapsed + RESOURCE_REGEN_SECONDS,
        });
      }
    }

    const droppedPickups = this.interactables
      .filter((i) => !i.collected && i.isPlayerDrop && i.itemId)
      .map((i) => ({
        id: i.id,
        itemId: i.itemId!,
        count: i.count ?? 1,
        label: i.label.replace(/\s×\d+$/, ''),
        x: i.x,
        z: i.z,
      }));

    const depletedNodes = Array.from(this.depletedNodes.entries()).map(
      ([id, state]) => ({
        id,
        usesRemaining: state.usesRemaining,
        regenAtElapsed: state.regenAtElapsed,
      }),
    );

    return {
      discoveredLandmarkIds,
      collectedInteractableIds: Array.from(collectedSet),
      droppedPickups,
      placedBeds: this.placedBeds.map((b) => ({ ...b })),
      depletedNodes,
      openedChestIds: Array.from(this.openedChestIds),
    };
  }

  public restoreImportantState(state: {
    discoveredLandmarkIds: string[];
    collectedInteractableIds: string[];
    droppedPickups: Array<{
      id: string;
      itemId: string;
      count: number;
      label: string;
      x: number;
      z: number;
    }>;
    placedBeds?: Array<{ id: string; x: number; z: number; yaw: number }>;
    depletedNodes?: Array<{
      id: string;
      usesRemaining: number;
      regenAtElapsed: number;
    }>;
    openedChestIds?: string[];
  }): void {
    const discoveredSet = new Set(state.discoveredLandmarkIds);
    for (const lm of this.landmarks) {
      if (lm.kind === 'spawn' || discoveredSet.has(lm.id)) {
        lm.discovered = true;
      } else {
        lm.discovered = false;
      }
    }

    this.persistedCollectedIds.clear();
    for (const id of state.collectedInteractableIds) {
      this.persistedCollectedIds.add(id);
    }

    this.openedChestIds.clear();
    for (const cid of state.openedChestIds ?? []) {
      this.openedChestIds.add(cid);
      this.village.markChestOpened(cid);
      this.exploration.markChestOpened(cid);
    }

    this.depletedNodes.clear();
    for (const dn of state.depletedNodes ?? []) {
      this.depletedNodes.set(dn.id, {
        usesRemaining: dn.usesRemaining,
        regenAtElapsed: dn.regenAtElapsed,
      });
    }

    // Clear previously placed player beds before restoring
    for (const pb of this.placedBedGroups) {
      pb.group.removeFromParent();
      this.unregisterColliders(`bed:${pb.id}`);
    }
    this.placedBedGroups.length = 0;
    this.placedBeds.length = 0;

    this.activePickups.length = 0;
    // Remove any existing player-dropped pickups or placed beds before spawning saved ones
    for (let i = this.interactables.length - 1; i >= 0; i--) {
      const item = this.interactables[i];
      if (item.isPlayerDrop || item.isPlacedBed) {
        if (item.meshGroup) {
          item.meshGroup.removeFromParent();
        }
        this.interactables.splice(i, 1);
        continue;
      }
      if (item.kind === 'herb' || item.kind === 'pickup') {
        const isCollected = this.persistedCollectedIds.has(item.id);
        item.collected = isCollected;
        if (item.meshGroup) {
          item.meshGroup.visible = !isCollected;
        }
        if (item.kind === 'pickup') {
          this.activePickups.push(item);
        }
      } else if (item.kind === 'chest') {
        item.collected = this.openedChestIds.has(item.id);
      } else if (item.kind === 'resource') {
        const dn = this.depletedNodes.get(item.id);
        if (dn) {
          item.usesRemaining = dn.usesRemaining;
          item.regenAtElapsed = dn.regenAtElapsed;
          item.collected = dn.usesRemaining <= 0;
        } else {
          item.usesRemaining = item.maxUses ?? 2;
          item.regenAtElapsed = undefined;
          item.collected = false;
        }
        if (item.meshGroup) {
          item.meshGroup.visible = !item.collected;
        }
      }
    }

    for (const drop of state.droppedPickups) {
      const safeDrop =
        !isLand(drop.x, drop.z, 0.5) || isWater(drop.x, drop.z)
          ? findNearestValidLand(drop.x, drop.z, 4.5, 0.36, 90)
          : { x: drop.x, z: drop.z };
      this.spawnWorldPickup(
        safeDrop.x,
        safeDrop.z,
        drop.itemId,
        drop.count,
        drop.label,
        drop.id,
        true,
      );
    }

    for (const bed of state.placedBeds ?? []) {
      const safeBed =
        !isLand(bed.x, bed.z, 0.65) || isWater(bed.x, bed.z)
          ? findNearestValidLand(bed.x, bed.z, 6.0, 0.34, 120)
          : { x: bed.x, z: bed.z };
      this.placeBedAt(safeBed.x, safeBed.z, bed.yaw, bed.id);
    }
  }

  private registerCollider(collider: WorldCollider, ownerKey = 'static'): void {
    const gx = Math.floor(collider.x / COLLIDER_CELL_SIZE);
    const gz = Math.floor(collider.z / COLLIDER_CELL_SIZE);
    const cellKey = `${gx},${gz}`;
    let list = this.colliderGrid.get(cellKey);
    if (!list) {
      list = [];
      this.colliderGrid.set(cellKey, list);
    }
    list.push(collider);

    let owned = this.collidersByOwner.get(ownerKey);
    if (!owned) {
      owned = [];
      this.collidersByOwner.set(ownerKey, owned);
    }
    owned.push({ cellKey, collider });
  }

  private unregisterColliders(ownerKey: string): void {
    const owned = this.collidersByOwner.get(ownerKey);
    if (!owned) return;

    for (let i = 0; i < owned.length; i++) {
      const entry = owned[i];
      const cell = this.colliderGrid.get(entry.cellKey);
      if (!cell) continue;
      const idx = cell.indexOf(entry.collider);
      if (idx !== -1) {
        cell.splice(idx, 1);
      }
    }
    this.collidersByOwner.delete(ownerKey);
  }

  /**
   * Spatial O(1) collision query: returns only colliders in the 3x3 cells surrounding (x, z).
   * Reuses an internal scratch buffer to avoid per-call allocations.
   */
  public queryCollidersNear(x: number, z: number): WorldCollider[] {
    const gx = Math.floor(x / COLLIDER_CELL_SIZE);
    const gz = Math.floor(z / COLLIDER_CELL_SIZE);
    const result = this.colliderScratch;
    result.length = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = this.colliderGrid.get(`${gx + dx},${gz + dz}`);
        if (list) {
          for (let i = 0; i < list.length; i++) {
            result.push(list[i]);
          }
        }
      }
    }
    return result;
  }

  public applyGraphicsProfile(
    profile: ResolvedGraphicsProfile,
    playerPos?: THREE.Vector3,
    rebuildVegetation = false,
  ): void {
    const prevPropShadows = this.currentPropShadows;
    const prevShadowsEnabled = this.currentShadowsEnabled;
    this.currentPropShadows = profile.propShadows;
    this.currentShadowsEnabled = profile.shadowEnabled;
    this.currentVegetationScale = profile.vegetationScale;

    this.waterQualityUniform.value =
      profile.waterQuality === 'low'
        ? 0.0
        : profile.waterQuality === 'medium'
          ? 1.0
          : 2.0;

    if (this.waterMesh) {
      this.waterMesh.receiveShadow =
        profile.shadowEnabled && profile.waterQuality !== 'low';
      if (this.currentWaterSegments !== profile.waterSegments) {
        this.currentWaterSegments = profile.waterSegments;
        const oldGeo = this.waterMesh.geometry;
        const nextGeo = new THREE.PlaneGeometry(
          WATER_SURFACE_SIZE,
          WATER_SURFACE_SIZE,
          this.currentWaterSegments,
          this.currentWaterSegments,
        );
        nextGeo.rotateX(-Math.PI / 2);
        this.waterMesh.geometry = nextGeo;
        oldGeo.dispose();
      }
    }

    if (
      prevPropShadows !== this.currentPropShadows ||
      prevShadowsEnabled !== this.currentShadowsEnabled
    ) {
      this.worldGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh && obj !== this.waterMesh) {
          const mesh = obj as THREE.Mesh;
          if (mesh.userData.__origCastShadow !== undefined) {
            mesh.castShadow =
              Boolean(mesh.userData.__origCastShadow) &&
              this.currentPropShadows &&
              !this.isSoftwareGl;
            mesh.receiveShadow = this.currentShadowsEnabled;
          }
        }
      });
      for (let i = 0; i < this.landmarkGroups.length; i++) {
        this.landmarkGroups[i].traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            if (mesh.userData.__origCastShadow === undefined) {
              mesh.userData.__origCastShadow = mesh.castShadow;
              mesh.userData.__origReceiveShadow = mesh.receiveShadow;
            }
            mesh.castShadow =
              Boolean(mesh.userData.__origCastShadow) &&
              this.currentPropShadows &&
              !this.isSoftwareGl;
            mesh.receiveShadow =
              Boolean(mesh.userData.__origReceiveShadow) &&
              this.currentShadowsEnabled;
          }
        });
      }
    }

    this.chunkManager.applyGraphicsConfig(profile);
    if (rebuildVegetation && playerPos) {
      this.chunkManager.rebuildAllLoadedChunks(playerPos.x, playerPos.z);
    }

    this.village.applyGraphicsProfile(profile);
    this.npcs.applyGraphicsProfile(profile);
    this.wildlife.applyGraphicsProfile(profile);
  }

  public applyTextures(textures: ProceduralTextureSet): void {
    this.sharedAssets.terrainMat.map = textures.grassMap;
    this.sharedAssets.terrainMat.normalMap = textures.grassNormalMap;
    this.sharedAssets.terrainMat.roughnessMap = textures.grassRoughnessMap;
    this.terrainSandMapUniform.value = textures.sandMap;
    this.terrainSandNormalUniform.value = textures.sandNormalMap;
    this.terrainSandRoughnessUniform.value = textures.sandRoughnessMap;
    this.terrainRockMapUniform.value = textures.rockMap;
    this.terrainRockNormalUniform.value = textures.rockNormalMap;
    this.sharedAssets.barkMat.map = textures.barkMap;
    this.sharedAssets.barkMat.normalMap = textures.barkNormalMap;
    this.sharedAssets.rockMat.map = textures.rockMap;
    this.sharedAssets.rockMat.normalMap = textures.rockNormalMap;
    this.sharedAssets.rockMat.roughnessMap = textures.rockRoughnessMap;

    if (this.landmarkMaterials) {
      this.landmarkMaterials.rockMat.map = textures.rockMap;
      this.landmarkMaterials.rockMat.normalMap = textures.rockNormalMap;
      this.landmarkMaterials.rockMat.roughnessMap = textures.rockRoughnessMap;
      this.landmarkMaterials.barkMat.map = textures.barkMap;
      this.landmarkMaterials.barkMat.normalMap = textures.barkNormalMap;
    }

    if (this.waterMat) {
      this.waterMat.normalMap = textures.waterNormalMap;
    }

    this.village.applyTextures(textures);
  }

  /**
   * Per-frame chunk streaming, distance-based LOD switching, grass culling, water animation, and entity updates.
   */
  public update(
    elapsed: number,
    playerPos: THREE.Vector3,
    camera: THREE.Camera,
    dt = 0.016,
    worldHours?: number,
    windStrength = 0.16,
    windAngleRad = 0.62,
    skyRig?: SkyLightingRig,
  ): void {
    this.lastElapsed = elapsed;

    // Stream chunks (when dt <= 0, preloads synchronously around target teleport/load position)
    this.chunkManager.syncStreaming(playerPos, dt <= 0);

    const safeDt = dt > 0 ? dt : 0;
    this.windPhase += safeDt * (1.0 + windStrength * 2.1);
    this.waterTimeUniform.value = elapsed * (1.0 + windStrength * 0.35);
    this.waterWaveAmpUniform.value = 0.85 + windStrength * 1.45;
    this.grassWindUniform.value = this.windPhase;
    this.grassWindAmpUniform.value = 0.09 + windStrength * 0.34;
    this.grassWindDirUniform.value.set(Math.cos(windAngleRad), Math.sin(windAngleRad));
    this.waterWindDirUniform.value.copy(this.grassWindDirUniform.value);

    if (skyRig) {
      skyRig.getActiveLightDirection(this.waterSunDirUniform.value);
      skyRig.getSunColor(this.waterSunColorUniform.value);
      skyRig.getHorizonColor(this.waterHorizonColorUniform.value);
      this.terrainFogDensityUniform.value = skyRig.getFogDensity();
    }

    if (dt > 0) {
      this.npcs.update(
        dt,
        elapsed,
        playerPos,
        this.queryCollidersCb,
        worldHours,
      );
      const activeHours = worldHours ?? this.npcs.getWorldHours();
      this.wildlife.update(
        dt,
        elapsed,
        playerPos,
        activeHours,
        this.queryCollidersCb,
        this.isVillageClearanceCb,
      );
    } else if (worldHours !== undefined) {
      this.npcs.setWorldHours(worldHours);
    }
    const resolvedHours = worldHours ?? this.npcs.getWorldHours();
    this.village.update(elapsed, playerPos, resolvedHours);
    this.exploration.update(elapsed, playerPos, resolvedHours);

    // Regenerate depleted resource nodes after cooldown
    for (let i = 0; i < this.interactables.length; i++) {
      const item = this.interactables[i];
      if (
        item.kind === 'resource' &&
        item.collected &&
        item.regenAtElapsed !== undefined &&
        elapsed >= item.regenAtElapsed
      ) {
        item.collected = false;
        item.usesRemaining = item.maxUses ?? 2;
        item.regenAtElapsed = undefined;
        if (item.meshGroup) {
          item.meshGroup.visible = true;
        }
        this.depletedNodes.delete(item.id);
      }
    }

    // Keep water plane centered on player horizontally so coastline extends to horizon
    this.waterMesh.position.x = Math.round(playerPos.x / 50) * 50;
    this.waterMesh.position.z = Math.round(playerPos.z / 50) * 50;

    // Frustum & LOD culling across currently loaded chunks
    this.chunkManager.updateVisibility(playerPos, camera);

    // Gentle hover & rotation animation only for active world pickups
    for (let i = 0; i < this.activePickups.length; i++) {
      const item = this.activePickups[i];
      if (item.collected || !item.meshGroup || !item.meshGroup.visible) continue;
      const baseY = (item.meshGroup.userData.baseY as number | undefined) ?? item.y + 0.28;
      item.meshGroup.position.y = baseY + Math.sin(elapsed * 2.4 + item.x) * 0.08;
      item.meshGroup.rotation.y = elapsed * 1.15;
    }
  }

  public dispose(): void {
    this.chunkManager.dispose();
    this.wildlife.dispose();
    this.npcs.dispose();
    this.village.dispose();
    this.exploration.dispose();
    for (const pb of this.placedBedGroups) {
      pb.group.removeFromParent();
    }
    this.waterMesh?.geometry?.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.worldGroup.removeFromParent();
  }
}

function createPineTrunkGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.18, 0.38, 4.4, 8);
  trunk.translate(0, 2.2, 0);
  parts.push(trunk);

  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3 + 0.3;
    const root = new THREE.ConeGeometry(0.24, 0.85, 5);
    root.rotateZ(0.55);
    root.rotateY(angle);
    root.translate(Math.cos(angle) * 0.24, 0.3, Math.sin(angle) * 0.24);
    parts.push(root);
  }
  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

function createPineCanopyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tier1 = new THREE.ConeGeometry(1.95, 2.5, 9);
  tier1.translate(0, 3.25, 0);
  parts.push(tier1);
  const tier2 = new THREE.ConeGeometry(1.52, 2.35, 9);
  tier2.rotateY(0.35);
  tier2.translate(0, 4.6, 0);
  parts.push(tier2);
  const tier3 = new THREE.ConeGeometry(1.05, 2.1, 8);
  tier3.rotateY(0.7);
  tier3.translate(0, 5.95, 0);
  parts.push(tier3);
  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

function createOakTrunkGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const base = new THREE.CylinderGeometry(0.34, 0.54, 2.8, 8);
  base.translate(0, 1.4, 0);
  parts.push(base);
  const branchA = new THREE.CylinderGeometry(0.14, 0.26, 2.0, 6);
  branchA.rotateZ(0.52);
  branchA.translate(-0.52, 3.0, 0.15);
  parts.push(branchA);
  const branchB = new THREE.CylinderGeometry(0.13, 0.24, 1.85, 6);
  branchB.rotateZ(-0.48);
  branchB.rotateY(0.9);
  branchB.translate(0.45, 2.95, -0.25);
  parts.push(branchB);
  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

function createOakCanopyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const crownMain = new THREE.IcosahedronGeometry(1.85, 1);
  crownMain.scale(1.15, 0.88, 1.1);
  crownMain.translate(0, 4.35, 0);
  parts.push(crownMain);
  const crownLeft = new THREE.IcosahedronGeometry(1.25, 1);
  crownLeft.translate(-1.25, 3.75, 0.45);
  parts.push(crownLeft);
  const crownRight = new THREE.IcosahedronGeometry(1.3, 1);
  crownRight.translate(1.15, 3.85, -0.55);
  parts.push(crownRight);
  const crownTop = new THREE.IcosahedronGeometry(1.15, 1);
  crownTop.translate(0.15, 5.35, 0.2);
  parts.push(crownTop);
  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

function createDesertCactusGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stem = new THREE.CylinderGeometry(0.24, 0.28, 3.2, 8);
  stem.translate(0, 1.6, 0);
  parts.push(stem);

  const armL = new THREE.CylinderGeometry(0.15, 0.17, 1.15, 7);
  armL.rotateZ(Math.PI / 2);
  armL.translate(-0.55, 1.8, 0);
  parts.push(armL);

  const armLUp = new THREE.CylinderGeometry(0.14, 0.16, 1.05, 7);
  armLUp.translate(-1.05, 2.3, 0);
  parts.push(armLUp);

  const armR = new THREE.CylinderGeometry(0.14, 0.16, 0.95, 7);
  armR.rotateZ(Math.PI / 2);
  armR.translate(0.48, 2.15, 0);
  parts.push(armR);

  const armRUp = new THREE.CylinderGeometry(0.13, 0.15, 0.9, 7);
  armRUp.translate(0.9, 2.55, 0);
  parts.push(armRUp);

  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

function createDesertShrubGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI * 2) / 6;
    const rawCone = new THREE.ConeGeometry(0.18, 0.62, 5);
    rawCone.rotateZ(0.42 + (i % 2) * 0.18);
    rawCone.rotateY(angle);
    rawCone.translate(Math.cos(angle) * 0.16, 0.24, Math.sin(angle) * 0.16);
    const branch = rawCone.index ? rawCone.toNonIndexed() : rawCone;
    if (branch !== rawCone) rawCone.dispose();
    parts.push(branch);
  }
  const rawCore = new THREE.DodecahedronGeometry(0.24, 0);
  rawCore.scale(1.15, 0.72, 1.15);
  rawCore.translate(0, 0.22, 0);
  const core = rawCore.index ? rawCore.toNonIndexed() : rawCore;
  if (core !== rawCore) rawCore.dispose();
  parts.push(core);

  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

function createDesertPebbleClusterGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const specs = [
    { x: 0, z: 0, r: 0.22, sy: 0.46 },
    { x: 0.28, z: 0.14, r: 0.14, sy: 0.42 },
    { x: -0.22, z: 0.18, r: 0.12, sy: 0.5 },
  ];
  for (const s of specs) {
    const raw = new THREE.DodecahedronGeometry(s.r, 0);
    raw.scale(1.2, s.sy, 1.0);
    raw.translate(s.x, s.r * s.sy * 0.65, s.z);
    const nonIdx = raw.index ? raw.toNonIndexed() : raw;
    if (nonIdx !== raw) raw.dispose();
    parts.push(nonIdx);
  }
  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

function createPalmTrunkGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.CylinderGeometry(0.19 - i * 0.02, 0.25 - i * 0.02, 1.45, 7);
    seg.rotateZ(0.08 * (i + 1));
    seg.translate(-i * 0.14, 0.72 + i * 1.32, 0);
    parts.push(seg);
  }
  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

function createPalmCrownGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI * 2) / 6;
    const frond = new THREE.ConeGeometry(0.45, 2.5, 4);
    frond.scale(1.0, 1.0, 0.28);
    frond.rotateX(1.22);
    frond.rotateY(angle);
    frond.translate(
      -0.46 + Math.sin(angle) * 1.15,
      5.35,
      Math.cos(angle) * 1.15,
    );
    parts.push(frond);
  }
  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

function createRockOutcropGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const mainRock = displaceRock(new THREE.DodecahedronGeometry(1.18, 1), 0.18, 11);
  mainRock.scale(1.15, 0.85, 0.95);
  mainRock.translate(0, 0.68, 0);
  parts.push(mainRock);

  const sideStone = displaceRock(new THREE.DodecahedronGeometry(0.68, 0), 0.14, 29);
  sideStone.scale(1.1, 0.72, 1.0);
  sideStone.translate(0.82, 0.36, 0.42);
  parts.push(sideStone);

  const backStone = displaceRock(new THREE.DodecahedronGeometry(0.56, 0), 0.12, 47);
  backStone.translate(-0.74, 0.3, -0.45);
  parts.push(backStone);
  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}


function displaceRock(
  geo: THREE.BufferGeometry,
  amount: number,
  seedOffset: number,
): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n =
      Math.sin(x * 3.1 + seedOffset) *
      Math.cos(y * 2.7 - seedOffset) *
      Math.sin(z * 3.5 + seedOffset * 0.5);
    const factor = 1 + n * amount;
    pos.setXYZ(i, x * factor, y * factor, z * factor);
  }
  geo.computeVertexNormals();
  return geo;
}

function createGrassClusterGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const bladeConfigs = [
    { angle: 0, lean: 0.08, height: 0.52, width: 0.09 },
    { angle: (Math.PI * 2) / 3, lean: 0.11, height: 0.45, width: 0.085 },
    { angle: (Math.PI * 4) / 3, lean: 0.09, height: 0.56, width: 0.085 },
  ];

  let vertOffset = 0;
  for (const cfg of bladeConfigs) {
    const cos = Math.cos(cfg.angle);
    const sin = Math.sin(cfg.angle);
    const hw = cfg.width * 0.5;

    const pts = [
      [-hw, 0, 0],
      [hw, 0, 0],
      [-hw * 0.55, cfg.height * 0.5, cfg.lean * 0.4],
      [hw * 0.55, cfg.height * 0.5, cfg.lean * 0.4],
      [0, cfg.height, cfg.lean],
    ];

    for (let i = 0; i < pts.length; i++) {
      const [lx, ly, lz] = pts[i];
      const wx = lx * cos - lz * sin;
      const wz = lx * sin + lz * cos;
      positions.push(wx, ly, wz);
      normals.push(0, 1, 0);
      uvs.push(i % 2, ly / cfg.height);
    }

    indices.push(
      vertOffset + 0,
      vertOffset + 1,
      vertOffset + 2,
      vertOffset + 1,
      vertOffset + 3,
      vertOffset + 2,
      vertOffset + 2,
      vertOffset + 3,
      vertOffset + 4,
    );
    vertOffset += 5;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createWildflowerClusterGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const offsets = [
    { x: 0, z: 0, h: 0.36, r: 0.08 },
    { x: 0.14, z: 0.09, h: 0.28, r: 0.065 },
    { x: -0.12, z: 0.11, h: 0.31, r: 0.07 },
  ];
  for (const o of offsets) {
    const indexedStem = new THREE.CylinderGeometry(0.012, 0.018, o.h, 4);
    indexedStem.translate(o.x, o.h * 0.5, o.z);
    const stem = indexedStem.toNonIndexed();
    indexedStem.dispose();
    parts.push(stem);

    const rawBlossom = new THREE.DodecahedronGeometry(o.r, 0);
    rawBlossom.scale(1.15, 0.55, 1.15);
    rawBlossom.translate(o.x, o.h + o.r * 0.25, o.z);
    const blossom = rawBlossom.index ? rawBlossom.toNonIndexed() : rawBlossom;
    if (blossom !== rawBlossom) rawBlossom.dispose();
    parts.push(blossom);
  }
  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

function createLandmarkCairn(
  rockMat: THREE.Material,
  mossMat: THREE.Material,
  disposables: { dispose: () => void }[],
): THREE.Group {
  const group = new THREE.Group();
  const plinthGeo = new THREE.CylinderGeometry(0.92, 1.15, 0.48, 7);
  const plinth = new THREE.Mesh(plinthGeo, rockMat);
  plinth.position.y = 0.24;
  plinth.castShadow = true;
  plinth.receiveShadow = true;

  const midGeo = new THREE.CylinderGeometry(0.62, 0.84, 0.72, 7);
  const mid = new THREE.Mesh(midGeo, rockMat);
  mid.position.y = 0.82;
  mid.rotation.y = 0.35;
  mid.castShadow = true;
  mid.receiveShadow = true;

  const upperGeo = new THREE.DodecahedronGeometry(0.46, 0);
  const upper = new THREE.Mesh(upperGeo, rockMat);
  upper.scale.set(1.0, 0.8, 1.0);
  upper.position.y = 1.44;
  upper.castShadow = true;

  const finialGeo = new THREE.ConeGeometry(0.28, 0.58, 6);
  const finial = new THREE.Mesh(finialGeo, rockMat);
  finial.position.y = 1.98;
  finial.castShadow = true;

  const mossGeo = new THREE.CylinderGeometry(0.95, 0.98, 0.08, 7);
  const moss = new THREE.Mesh(mossGeo, mossMat);
  moss.position.y = 0.49;
  moss.receiveShadow = true;

  disposables.push(plinthGeo, midGeo, upperGeo, finialGeo, mossGeo);
  group.add(plinth, mid, upper, finial, moss);
  return group;
}

function createTrailSignpost(
  postMat: THREE.Material,
  boardMat: THREE.Material,
  disposables: { dispose: () => void }[],
): THREE.Group {
  const group = new THREE.Group();
  const postGeo = new THREE.CylinderGeometry(0.08, 0.11, 1.85, 7);
  const post = new THREE.Mesh(postGeo, postMat);
  post.position.y = 0.92;
  post.castShadow = true;

  const boardGeo = new THREE.BoxGeometry(0.92, 0.34, 0.08);
  const board = new THREE.Mesh(boardGeo, boardMat);
  board.position.set(0.12, 1.54, 0);
  board.rotation.z = 0.04;
  board.castShadow = true;

  const capGeo = new THREE.ConeGeometry(0.14, 0.16, 4);
  const cap = new THREE.Mesh(capGeo, boardMat);
  cap.position.y = 1.9;
  cap.rotation.y = Math.PI * 0.25;

  disposables.push(postGeo, boardGeo, capGeo);
  group.add(post, board, cap);
  return group;
}

function createSharedHerbCluster(
  leafGeo: THREE.BufferGeometry,
  bloomGeo: THREE.BufferGeometry,
  leafMat: THREE.Material,
  bloomMat: THREE.Material,
): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const rx = Math.cos(angle) * 0.22;
    const rz = Math.sin(angle) * 0.22;

    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(rx, 0.21, rz);
    leaf.rotation.z = (i - 1) * 0.18;
    leaf.castShadow = true;

    const bloom = new THREE.Mesh(bloomGeo, bloomMat);
    bloom.position.set(rx * 1.15, 0.45, rz * 1.15);

    group.add(leaf, bloom);
  }
  return group;
}

function createHerbCluster(
  leafMat: THREE.Material,
  bloomMat: THREE.Material,
  disposables: { dispose: () => void }[],
): THREE.Group {
  const leafGeo = new THREE.ConeGeometry(0.28, 0.42, 6);
  const bloomGeo = new THREE.DodecahedronGeometry(0.11, 0);
  disposables.push(leafGeo, bloomGeo);
  return createSharedHerbCluster(leafGeo, bloomGeo, leafMat, bloomMat);
}

function createPickupMesh(
  itemId: string,
  disposables: { dispose: () => void }[],
): THREE.Group {
  const group = new THREE.Group();

  let primaryColor = 0xd99b38;
  let accentColor = 0xf4dc9c;
  if (itemId === 'trail-boots' || itemId === 'warden-cloak') {
    primaryColor = 0x3b6e52;
    accentColor = 0xe5a93c;
  } else if (itemId === 'sun-apple' || itemId === 'hearth-loaf') {
    primaryColor = 0xd9563c;
    accentColor = 0xf2c464;
  } else if (itemId === 'apothecary-tonic' || itemId === 'meadow-herb') {
    primaryColor = 0x5ab878;
    accentColor = 0xc9f2d5;
  }

  const bodyMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    roughness: 0.55,
    metalness: 0.15,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 0.28,
    roughness: 0.4,
  });

  const boxGeo = new THREE.BoxGeometry(0.42, 0.34, 0.34);
  const box = new THREE.Mesh(boxGeo, bodyMat);
  box.castShadow = true;

  const strapGeo = new THREE.BoxGeometry(0.45, 0.1, 0.37);
  const strap = new THREE.Mesh(strapGeo, trimMat);
  strap.position.y = 0.04;

  const orbGeo = new THREE.OctahedronGeometry(0.11, 0);
  const orb = new THREE.Mesh(orbGeo, trimMat);
  orb.position.y = 0.34;

  disposables.push(bodyMat, trimMat, boxGeo, strapGeo, orbGeo);
  group.add(box, strap, orb);
  return group;
}

function createHarvestableTreeNodeMesh(
  assets: SharedWorldAssets,
  disposables: { dispose: () => void }[],
): THREE.Group {
  const group = new THREE.Group();
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0x3b7638,
    roughness: 0.78,
  });
  const markMat = new THREE.MeshStandardMaterial({
    color: 0xd9a84e,
    emissive: 0x5c3e10,
    emissiveIntensity: 0.28,
    roughness: 0.6,
  });
  const trunkGeo = new THREE.CylinderGeometry(0.24, 0.42, 3.0, 8);
  const canopyGeo = new THREE.ConeGeometry(1.55, 3.2, 8);
  const markGeo = new THREE.BoxGeometry(0.14, 0.35, 0.72);
  disposables.push(canopyMat, markMat, trunkGeo, canopyGeo, markGeo);

  const trunk = new THREE.Mesh(trunkGeo, assets.barkMat);
  trunk.position.y = 1.5;
  trunk.castShadow = true;

  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.y = 3.6;
  canopy.castShadow = true;

  const blaze = new THREE.Mesh(markGeo, markMat);
  blaze.position.y = 1.15;

  group.add(trunk, canopy, blaze);
  return group;
}

function createResourceNodeMesh(
  kind: WorldResourceKind,
  assets: SharedWorldAssets,
  disposables: { dispose: () => void }[],
): THREE.Group {
  const group = new THREE.Group();

  if (kind === 'wood' || kind === 'driftwood') {
    const logGeo = new THREE.CylinderGeometry(0.18, 0.22, 1.8, 7);
    const branchGeo = new THREE.CylinderGeometry(0.09, 0.14, 1.0, 6);
    const mat =
      kind === 'driftwood'
        ? new THREE.MeshStandardMaterial({ color: 0xb7a78e, roughness: 0.9 })
        : assets.barkMat;
    if (kind === 'driftwood') disposables.push(mat);
    disposables.push(logGeo, branchGeo);

    const log1 = new THREE.Mesh(logGeo, mat);
    log1.rotation.z = Math.PI / 2 - 0.08;
    log1.position.set(0, 0.2, 0);
    log1.castShadow = true;

    const log2 = new THREE.Mesh(branchGeo, mat);
    log2.rotation.z = Math.PI / 2 + 0.14;
    log2.rotation.y = 0.7;
    log2.position.set(0.18, 0.26, 0.28);
    log2.castShadow = true;

    group.add(log1, log2);
    return group;
  }

  if (kind === 'fiber' || kind === 'desert-plant') {
    const bushMat = new THREE.MeshStandardMaterial({
      color: kind === 'desert-plant' ? 0x7fa368 : 0x749c46,
      roughness: 0.88,
    });
    const tuftMat = new THREE.MeshStandardMaterial({
      color: kind === 'desert-plant' ? 0xf2b548 : 0xd9c27e,
      roughness: 0.85,
    });
    const stemGeo = new THREE.ConeGeometry(0.32, 0.72, 6);
    const tuftGeo = new THREE.DodecahedronGeometry(0.14, 0);
    disposables.push(bushMat, tuftMat, stemGeo, tuftGeo);

    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      const sx = Math.cos(a) * 0.22;
      const sz = Math.sin(a) * 0.22;
      const stem = new THREE.Mesh(stemGeo, bushMat);
      stem.position.set(sx, 0.34, sz);
      stem.rotation.z = (i - 1) * 0.14;
      const tuft = new THREE.Mesh(tuftGeo, tuftMat);
      tuft.position.set(sx * 1.15, 0.68, sz * 1.15);
      group.add(stem, tuft);
    }
    return group;
  }

  if (kind === 'mushroom') {
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xeae0cf, roughness: 0.84 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0xc8553b, roughness: 0.72 });
    const stemGeo = new THREE.CylinderGeometry(0.08, 0.11, 0.28, 7);
    const capGeo = new THREE.ConeGeometry(0.28, 0.22, 8);
    disposables.push(stemMat, capMat, stemGeo, capGeo);

    for (let i = 0; i < 3; i++) {
      const a = i * 2.1;
      const ox = i === 0 ? 0 : Math.cos(a) * 0.24;
      const oz = i === 0 ? 0 : Math.sin(a) * 0.24;
      const sc = i === 0 ? 1.15 : 0.78;
      const st = new THREE.Mesh(stemGeo, stemMat);
      st.scale.setScalar(sc);
      st.position.set(ox, 0.14 * sc, oz);
      const cp = new THREE.Mesh(capGeo, capMat);
      cp.scale.setScalar(sc);
      cp.position.set(ox, 0.32 * sc, oz);
      cp.castShadow = true;
      group.add(st, cp);
    }
    return group;
  }

  if (kind === 'berries') {
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3b6e35, roughness: 0.85 });
    const berryMat = new THREE.MeshStandardMaterial({ color: 0x8d3fb8, roughness: 0.45 });
    const bushGeo = new THREE.IcosahedronGeometry(0.42, 0);
    const berryGeo = new THREE.SphereGeometry(0.08, 6, 5);
    disposables.push(leafMat, berryMat, bushGeo, berryGeo);

    const bush = new THREE.Mesh(bushGeo, leafMat);
    bush.scale.set(1.2, 0.82, 1.15);
    bush.position.y = 0.32;
    bush.castShadow = true;
    group.add(bush);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI * 2) / 6;
      const b = new THREE.Mesh(berryGeo, berryMat);
      b.position.set(Math.cos(a) * 0.36, 0.32 + (i % 2) * 0.16, Math.sin(a) * 0.36);
      group.add(b);
    }
    return group;
  }

  if (kind === 'flower') {
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x558a3e, roughness: 0.85 });
    const petalMat = new THREE.MeshStandardMaterial({ color: 0xf4cb4b, roughness: 0.6 });
    const stemGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.46, 5);
    const petalGeo = new THREE.DodecahedronGeometry(0.14, 0);
    disposables.push(stemMat, petalMat, stemGeo, petalGeo);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const fx = Math.cos(a) * 0.22;
      const fz = Math.sin(a) * 0.22;
      const st = new THREE.Mesh(stemGeo, stemMat);
      st.position.set(fx, 0.23, fz);
      const pt = new THREE.Mesh(petalGeo, petalMat);
      pt.scale.set(1.2, 0.55, 1.2);
      pt.position.set(fx, 0.48, fz);
      group.add(st, pt);
    }
    return group;
  }

  if (kind === 'sand') {
    const sandMat = new THREE.MeshStandardMaterial({ color: 0xe0be78, roughness: 0.96, flatShading: true });
    const moundGeo = new THREE.ConeGeometry(0.95, 0.52, 8);
    disposables.push(sandMat, moundGeo);
    const mound = new THREE.Mesh(moundGeo, sandMat);
    mound.position.y = 0.24;
    mound.receiveShadow = true;
    group.add(mound);
    return group;
  }

  if (kind === 'cactus') {
    const cactMat = new THREE.MeshStandardMaterial({ color: 0x458044, roughness: 0.84 });
    const stemGeo = new THREE.CylinderGeometry(0.2, 0.24, 2.0, 7);
    const armGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.72, 6);
    disposables.push(cactMat, stemGeo, armGeo);

    const stem = new THREE.Mesh(stemGeo, cactMat);
    stem.position.y = 1.0;
    stem.castShadow = true;
    const arm = new THREE.Mesh(armGeo, cactMat);
    arm.position.set(0.32, 1.25, 0);
    arm.rotation.z = -0.6;
    arm.castShadow = true;
    group.add(stem, arm);
    return group;
  }

  if (kind === 'shell') {
    const shellMat = new THREE.MeshStandardMaterial({ color: 0xf0cbb4, roughness: 0.48 });
    const shellGeo = new THREE.ConeGeometry(0.28, 0.44, 7);
    disposables.push(shellMat, shellGeo);
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.rotation.z = Math.PI * 0.42;
    shell.position.y = 0.16;
    shell.castShadow = true;
    group.add(shell);
    return group;
  }

  if (kind === 'wheat') {
    const wheatMat = new THREE.MeshStandardMaterial({ color: 0xe3b848, roughness: 0.82 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 });
    const stalkGeo = new THREE.CylinderGeometry(0.16, 0.24, 0.92, 7);
    const bandGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.08, 7);
    disposables.push(wheatMat, bandMat, stalkGeo, bandGeo);
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      const sx = Math.cos(a) * 0.24;
      const sz = Math.sin(a) * 0.24;
      const stalk = new THREE.Mesh(stalkGeo, wheatMat);
      stalk.position.set(sx, 0.45, sz);
      stalk.rotation.z = (i - 1) * 0.09;
      stalk.castShadow = true;
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.position.set(sx, 0.4, sz);
      group.add(stalk, band);
    }
    return group;
  }

  if (kind === 'clay') {
    const clayMat = new THREE.MeshStandardMaterial({
      color: 0x9b6d54,
      roughness: 0.62,
      flatShading: true,
    });
    const moundGeo = new THREE.DodecahedronGeometry(0.54, 0);
    disposables.push(clayMat, moundGeo);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.09;
      const m = new THREE.Mesh(moundGeo, clayMat);
      const sc = i === 0 ? 1.15 : 0.78;
      m.scale.set(1.2 * sc, 0.52 * sc, 1.05 * sc);
      m.position.set(i === 0 ? 0 : Math.cos(a) * 0.42, 0.22 * sc, i === 0 ? 0 : Math.sin(a) * 0.42);
      m.receiveShadow = true;
      m.castShadow = true;
      group.add(m);
    }
    return group;
  }

  // Stone, Iron Ore, Gold Ore, Coal, or Rare Mineral boulder with mineral veins
  const baseGeo = new THREE.DodecahedronGeometry(0.85, 0);
  const seamGeo = new THREE.OctahedronGeometry(0.24, 0);
  const rockColor =
    kind === 'coal'
      ? 0x3b3e42
      : kind === 'iron-ore'
        ? 0x6f7378
        : kind === 'gold-ore'
          ? 0x68635a
          : kind === 'rare-mineral'
            ? 0x5c6878
            : 0x838882;
  const rockMat = new THREE.MeshStandardMaterial({
    color: rockColor,
    roughness: 0.88,
    flatShading: true,
  });
  disposables.push(baseGeo, seamGeo, rockMat);

  const rock = new THREE.Mesh(baseGeo, rockMat);
  rock.scale.set(1.15, 0.78, 1.0);
  rock.position.y = 0.48;
  rock.castShadow = true;
  group.add(rock);

  if (kind === 'iron-ore' || kind === 'gold-ore' || kind === 'coal' || kind === 'rare-mineral') {
    const isRare = kind === 'rare-mineral';
    const isGold = kind === 'gold-ore';
    const seamMat = new THREE.MeshStandardMaterial({
      color: isRare ? 0x62d9f2 : isGold ? 0xf6c343 : kind === 'iron-ore' ? 0xc27b48 : 0x1c1e22,
      emissive: isRare ? 0x1888aa : isGold ? 0x805508 : kind === 'iron-ore' ? 0x452208 : 0x050505,
      emissiveIntensity: isRare ? 0.65 : isGold ? 0.45 : kind === 'iron-ore' ? 0.35 : 0.1,
      roughness: isRare || isGold ? 0.25 : 0.45,
      metalness: isRare ? 0.4 : isGold ? 0.82 : kind === 'iron-ore' ? 0.62 : 0.22,
    });
    disposables.push(seamMat);
    for (let i = 0; i < 3; i++) {
      const angle = i * 2.1;
      const seam = new THREE.Mesh(seamGeo, seamMat);
      seam.scale.setScalar(isRare ? 1.25 : isGold ? 1.15 : 1.0);
      seam.position.set(Math.cos(angle) * 0.56, 0.54 + (i % 2) * 0.18, Math.sin(angle) * 0.52);
      group.add(seam);
    }
  }

  return group;
}

function createCampBedMesh(
  disposables: { dispose: () => void }[],
): THREE.Group {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x7b5638, roughness: 0.88 });
  const sheetMat = new THREE.MeshStandardMaterial({ color: 0xe6dcc8, roughness: 0.85 });
  const blanketMat = new THREE.MeshStandardMaterial({ color: 0x3f6e52, roughness: 0.88 });

  const frameGeo = new THREE.BoxGeometry(1.08, 0.2, 1.92);
  const mattressGeo = new THREE.BoxGeometry(0.98, 0.16, 1.78);
  const blanketGeo = new THREE.BoxGeometry(1.0, 0.18, 1.24);
  const pillowGeo = new THREE.BoxGeometry(0.7, 0.14, 0.36);

  disposables.push(woodMat, sheetMat, blanketMat, frameGeo, mattressGeo, blanketGeo, pillowGeo);

  const frame = new THREE.Mesh(frameGeo, woodMat);
  frame.position.y = 0.14;
  frame.castShadow = true;

  const mattress = new THREE.Mesh(mattressGeo, sheetMat);
  mattress.position.set(0, 0.28, 0);

  const blanket = new THREE.Mesh(blanketGeo, blanketMat);
  blanket.position.set(0, 0.29, 0.26);

  const pillow = new THREE.Mesh(pillowGeo, sheetMat);
  pillow.position.set(0, 0.4, -0.62);

  group.add(frame, mattress, blanket, pillow);
  return group;
}
