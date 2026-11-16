import * as THREE from 'three';
import {
  PLAYABLE_RADIUS,
  getBiomeAt,
  seededRandom,
} from '../math/noise';
import {
  findNearestValidLand,
  isValidAnimalSpawnLocation,
} from '../world/WorldPlacementValidator';
import type { WorldCollider } from '../types';
import type { ResolvedGraphicsProfile } from '../engine/GraphicsQualityManager';
import type { SyncedEntityDelta } from '../../../shared/multiplayerProtocol';
import {
  BearAnimal,
  BirdAnimal,
  ChickenAnimal,
  CowAnimal,
  DeerAnimal,
  RabbitAnimal,
  SheepAnimal,
  WolfAnimal,
  type Animal,
} from './Animal';
import {
  AnimalRigPool,
  createWildlifeSharedAssets,
  type WildlifeSharedAssets,
} from './AnimalRig';
import {
  ANIMAL_DROP_TABLES,
  type AnimalLootDrop,
  type AnimalSpecies,
  type NearbyAnimalEntry,
  type WildlifeTickContext,
} from './wildlifeTypes';

const CELL_SIZE = 32;
const NEAR_RIG_DIST = 80;
const NEAR_RIG_DIST_SQ = NEAR_RIG_DIST * NEAR_RIG_DIST;
const RIG_SHADOW_DIST_SQ = 52 * 52;
const MID_LOD_DIST = 240;
const MID_LOD_DIST_SQ = MID_LOD_DIST * MID_LOD_DIST;
const MAX_ACTIVE_RIGS = 40;
const CORPSE_DESPAWN_SECONDS = 12;

const SPECIES_LIST: AnimalSpecies[] = [
  'deer',
  'rabbit',
  'wolf',
  'bear',
  'bird',
  'cow',
  'sheep',
  'chicken',
];

const SPECIES_LOD_CAPACITY: Record<AnimalSpecies, number> = {
  deer: 90,
  rabbit: 110,
  wolf: 55,
  bear: 36,
  bird: 130,
  cow: 48,
  sheep: 64,
  chicken: 72,
};

const SPECIES_COLOR_PALETTES: Record<AnimalSpecies, number[]> = {
  deer: [0xa67449, 0x92633d, 0xb88558],
  rabbit: [0xc8bca8, 0xa88f76, 0xded6c8],
  wolf: [0x6f757a, 0x565c62, 0x898d91],
  bear: [0x4f3624, 0x3b281b, 0x664731],
  bird: [0x4e7aa6, 0x8f5d42, 0x64885e],
  cow: [0xf2eee6, 0x9e7152, 0xe8e0d2],
  sheep: [0xf6f3ea, 0xe5ded2, 0xd8cfc2],
  chicken: [0xe8ded1, 0xc27b48, 0x45413e],
};

const _dummy = new THREE.Object3D();
const _tempColor = new THREE.Color();

export interface WildlifeCallbacks {
  onAnimalKilled?: (
    animalId: string,
    species: AnimalSpecies,
    position: THREE.Vector3,
    drops: AnimalLootDrop[],
  ) => void;
  onPredatorHitPlayer?: (
    animalId: string,
    species: AnimalSpecies,
    damage: number,
  ) => void;
}

export interface AnimalStrikeMatch {
  animal: Animal;
  distSq: number;
}

/**
 * Manages open-world wildlife & livestock across 8 species:
 * - Spatial hash grid & staggered distance-tiered updates
 * - Pooled articulated 3D rigs near player + InstancedMesh LODs mid-distance
 * - Player melee & projectile combat targeting, death collapse, loot drops, and persistence
 */
export class WildlifeManager {
  public readonly animals: Animal[] = [];

  private readonly rootGroup = new THREE.Group();
  private readonly rigContainer = new THREE.Group();
  private readonly assets: WildlifeSharedAssets;
  private readonly rigPool: AnimalRigPool;

  private readonly spatialBuckets = new Map<number, Animal[]>();
  private readonly bucketPool: Animal[][] = [];
  private activeBuckets: Animal[][] = [];

  private readonly lodMeshes: Record<AnimalSpecies, THREE.InstancedMesh>;
  private readonly lodCounts: Record<AnimalSpecies, number> = {
    deer: 0,
    rabbit: 0,
    wolf: 0,
    bear: 0,
    bird: 0,
    cow: 0,
    sheep: 0,
    chicken: 0,
  };

  private readonly nearCandidates: Animal[] = [];
  private readonly nearbyEntryPool: NearbyAnimalEntry[] = [];
  private readonly animalsByChunk = new Map<string, Animal[]>();
  private readonly killedAnimalIds = new Set<string>();
  private readonly isSoftwareGl: boolean;
  private readonly tickCtx: WildlifeTickContext;
  private callbacks: WildlifeCallbacks = {};
  private frameCounter = 0;

  private nearRigDistSq = NEAR_RIG_DIST_SQ;
  private shadowDistSq = RIG_SHADOW_DIST_SQ;
  private midLodDistSq = MID_LOD_DIST_SQ;
  private maxActiveRigs = MAX_ACTIVE_RIGS;
  private shadowsEnabled = true;
  private farPause = false;
  private visibleAnimalCount = 0;
  private networkRemoteControlled = false;
  private readonly lastSyncSnapshot = new Map<
    string,
    { x: number; y: number; z: number; yaw: number; state: string; hp: number; isDead: boolean }
  >();

  constructor(
    scene: THREE.Scene,
    contactShadowMap: THREE.Texture,
    isSoftwareGl: boolean,
    _seed: number,
    isVillageClearance: (x: number, z: number) => boolean,
  ) {
    this.isSoftwareGl = isSoftwareGl;
    this.assets = createWildlifeSharedAssets(contactShadowMap);
    this.rigContainer.name = 'WildlifeRigContainer';
    this.rootGroup.add(this.rigContainer);

    this.rigPool = new AnimalRigPool(this.rigContainer, this.assets, isSoftwareGl);

    this.lodMeshes = {
      deer: this.createSpeciesLodMesh('deer', SPECIES_LOD_CAPACITY.deer),
      rabbit: this.createSpeciesLodMesh('rabbit', SPECIES_LOD_CAPACITY.rabbit),
      wolf: this.createSpeciesLodMesh('wolf', SPECIES_LOD_CAPACITY.wolf),
      bear: this.createSpeciesLodMesh('bear', SPECIES_LOD_CAPACITY.bear),
      bird: this.createSpeciesLodMesh('bird', SPECIES_LOD_CAPACITY.bird),
      cow: this.createSpeciesLodMesh('cow', SPECIES_LOD_CAPACITY.cow),
      sheep: this.createSpeciesLodMesh('sheep', SPECIES_LOD_CAPACITY.sheep),
      chicken: this.createSpeciesLodMesh('chicken', SPECIES_LOD_CAPACITY.chicken),
    };

    for (let i = 0; i < SPECIES_LIST.length; i++) {
      this.rootGroup.add(this.lodMeshes[SPECIES_LIST[i]]);
    }

    this.tickCtx = {
      dt: 0,
      elapsed: 0,
      worldHours: 8.5,
      playerPos: new THREE.Vector3(),
      isNearPlayer: false,
      queryCollidersNear: () => [],
      queryNearbyAnimals: this.queryNearbyAnimals,
      isVillageClearance,
      onPredatorHitPlayer: (animalId, species, damage) => {
        this.callbacks.onPredatorHitPlayer?.(animalId, species, damage);
      },
    };

    scene.add(this.rootGroup);
  }

  public setCallbacks(callbacks: WildlifeCallbacks): void {
    this.callbacks = callbacks;
  }

  public setNetworkRemoteControlled(remote: boolean): void {
    if (this.networkRemoteControlled === remote) return;
    this.networkRemoteControlled = remote;
    for (let i = 0; i < this.animals.length; i++) {
      this.animals[i].setNetworkRemoteControlled(remote);
    }
  }

  public exportKilledAnimalIds(): string[] {
    return Array.from(this.killedAnimalIds);
  }

  public restoreKilledAnimalIds(ids: string[]): void {
    this.killedAnimalIds.clear();
    for (const id of ids) {
      this.killedAnimalIds.add(id);
    }
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      if (this.killedAnimalIds.has(a.id)) {
        if (a.rig) {
          this.rigPool.release(a.rig);
          a.rig = null;
        }
        this.animals.splice(i, 1);
      }
    }
  }

  private createSpeciesLodMesh(
    species: AnimalSpecies,
    maxCount: number,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(
      this.assets.lodGeos[species],
      this.assets.lodMats[species],
      maxCount,
    );
    mesh.count = 0;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.name = `WildlifeLOD_${species}`;
    return mesh;
  }

  /**
   * Deterministically spawns biome-matched wildlife & livestock inside an active chunk.
   */
  public spawnChunkWildlife(
    chunkKey: string,
    cx: number,
    cz: number,
    chunkSeed: number,
    chunkSize: number,
    isVillageClearance: (x: number, z: number) => boolean,
  ): void {
    if (this.animalsByChunk.has(chunkKey)) return;

    const centerX = cx * chunkSize;
    const centerZ = cz * chunkSize;
    if (Math.hypot(centerX, centerZ) > PLAYABLE_RADIUS + chunkSize * 0.75) {
      this.animalsByChunk.set(chunkKey, []);
      return;
    }

    const nextR = seededRandom((chunkSeed ^ 0x9e3779b9) >>> 0);
    const spawned: Animal[] = [];
    const halfSpan = chunkSize * 0.44;
    let seq = 0;

    const pickSpotInChunk = (
      preferredBiomes: string[],
      allowOverWater: boolean,
      minPlayerClearance = 0,
      allowNearVillage = false,
    ): { x: number; z: number } | null => {
      for (let attempt = 0; attempt < 22; attempt++) {
        const x = centerX + (nextR() - 0.5) * 2 * halfSpan;
        const z = centerZ + (nextR() - 0.5) * 2 * halfSpan;
        if (Math.hypot(x, z) > PLAYABLE_RADIUS - 18) continue;
        if (minPlayerClearance > 0 && Math.hypot(x, z - 4) < minPlayerClearance) continue;

        const biome = getBiomeAt(x, z);
        if (preferredBiomes.length > 0 && !preferredBiomes.includes(biome)) {
          continue;
        }
        if (!allowOverWater) {
          if (!allowNearVillage && isVillageClearance(x, z)) continue;
          if (!isValidAnimalSpawnLocation(x, z, allowNearVillage ? 'cow' : 'deer')) continue;
        } else {
          if (!isValidAnimalSpawnLocation(x, z, 'bird')) continue;
        }
        return { x, z };
      }
      return null;
    };

    const addAnimal = (animal: Animal) => {
      if (this.killedAnimalIds.has(animal.id)) return;
      animal.setNetworkRemoteControlled(this.networkRemoteControlled);
      spawned.push(animal);
      this.animals.push(animal);
    };

    const centerBiome = getBiomeAt(centerX, centerZ);
    const isOriginChunk = cx === 0 && cz === 0;

    if (isOriginChunk) {
      for (let i = 0; i < 3; i++) {
        const spot = pickSpotInChunk(['Plains', 'Forest'], false, 20) ?? {
          x: Math.cos(i * 2.1 + 0.5) * (28 + nextR() * 12),
          z: 4 + Math.sin(i * 2.1 + 0.5) * (28 + nextR() * 12),
        };
        if (!isVillageClearance(spot.x, spot.z)) {
          const idNum = seq++;
          addAnimal(
            new DeerAnimal({
              id: `chunk-${chunkKey}-deer-${idNum}`,
              home: spot,
              scale: 0.92 + nextR() * 0.22,
              seed: chunkSeed + idNum * 31 + 101,
              variant: idNum % 3,
            }),
          );
        }
      }
      for (let i = 0; i < 3; i++) {
        const spot = pickSpotInChunk(['Plains', 'Forest'], false, 15);
        if (spot) {
          const idNum = seq++;
          addAnimal(
            new RabbitAnimal({
              id: `chunk-${chunkKey}-rabbit-${idNum}`,
              home: spot,
              scale: 0.88 + nextR() * 0.24,
              seed: chunkSeed + idNum * 37 + 202,
              variant: idNum % 3,
            }),
          );
        }
      }
      // Livestock near Oakhollow pasture fringe
      const safePasture = findNearestValidLand(72, -34, 4, 0.32, 40);
      const pastureAnchorX = safePasture.x;
      const pastureAnchorZ = safePasture.z;
      for (let i = 0; i < 2; i++) {
        const idNum = seq++;
        const cowSpot = findNearestValidLand(pastureAnchorX + i * 7, pastureAnchorZ + i * 3, 3.5, 0.34, 24);
        addAnimal(
          new CowAnimal({
            id: `chunk-${chunkKey}-cow-${idNum}`,
            home: { x: cowSpot.x, z: cowSpot.z },
            scale: 0.95 + nextR() * 0.14,
            seed: chunkSeed + idNum * 53 + 601,
            variant: idNum % 3,
          }),
        );
      }
      for (let i = 0; i < 3; i++) {
        const idNum = seq++;
        const sheepSpot = findNearestValidLand(pastureAnchorX - 10 + i * 5, pastureAnchorZ + 8, 3.5, 0.34, 24);
        addAnimal(
          new SheepAnimal({
            id: `chunk-${chunkKey}-sheep-${idNum}`,
            home: { x: sheepSpot.x, z: sheepSpot.z },
            scale: 0.94 + nextR() * 0.14,
            seed: chunkSeed + idNum * 59 + 701,
            variant: idNum % 3,
          }),
        );
      }
      for (let i = 0; i < 3; i++) {
        const idNum = seq++;
        const chickenSpot = findNearestValidLand(46 + i * 3.5, -26 + i * 2.5, 3.5, 0.34, 24);
        addAnimal(
          new ChickenAnimal({
            id: `chunk-${chunkKey}-chicken-${idNum}`,
            home: { x: chickenSpot.x, z: chickenSpot.z },
            scale: 0.92 + nextR() * 0.16,
            seed: chunkSeed + idNum * 61 + 801,
            variant: idNum % 3,
          }),
        );
      }
      for (let i = 0; i < 4; i++) {
        const spot = pickSpotInChunk([], true, 12);
        if (spot) {
          const idNum = seq++;
          addAnimal(
            new BirdAnimal({
              id: `chunk-${chunkKey}-bird-${idNum}`,
              home: spot,
              scale: 0.9 + nextR() * 0.28,
              seed: chunkSeed + idNum * 47 + 505,
              variant: idNum % 3,
            }),
          );
        }
      }
    } else {
      const deerCount =
        centerBiome === 'Plains' || centerBiome === 'Forest'
          ? 1 + Math.floor(nextR() * 2)
          : nextR() < 0.3
            ? 1
            : 0;
      const rabbitCount =
        centerBiome === 'Plains' || centerBiome === 'Forest'
          ? 1 + Math.floor(nextR() * 3)
          : centerBiome === 'Desert' && nextR() < 0.25
            ? 1
            : 0;
      const wolfCount =
        centerBiome === 'Forest' || centerBiome === 'Mountains'
          ? nextR() < 0.62
            ? 1 + (nextR() < 0.35 ? 1 : 0)
            : 0
          : 0;
      const bearCount =
        centerBiome === 'Forest' || centerBiome === 'Mountains'
          ? nextR() < 0.36
            ? 1
            : 0
          : 0;
      const cowCount = centerBiome === 'Plains' && nextR() < 0.45 ? 1 + (nextR() < 0.4 ? 1 : 0) : 0;
      const sheepCount = centerBiome === 'Plains' && nextR() < 0.5 ? 2 : 0;
      const chickenCount = centerBiome === 'Plains' && nextR() < 0.42 ? 2 : 0;
      const birdCount = 1 + Math.floor(nextR() * 3);

      for (let i = 0; i < deerCount; i++) {
        const spot = pickSpotInChunk(['Plains', 'Forest'], false, 24);
        if (!spot) continue;
        const idNum = seq++;
        addAnimal(
          new DeerAnimal({
            id: `chunk-${chunkKey}-deer-${idNum}`,
            home: spot,
            scale: 0.92 + nextR() * 0.22,
            seed: chunkSeed + idNum * 31 + 101,
            variant: idNum % 3,
          }),
        );
      }

      for (let i = 0; i < rabbitCount; i++) {
        const spot = pickSpotInChunk(['Plains', 'Forest'], false, 16);
        if (!spot) continue;
        const idNum = seq++;
        addAnimal(
          new RabbitAnimal({
            id: `chunk-${chunkKey}-rabbit-${idNum}`,
            home: spot,
            scale: 0.88 + nextR() * 0.26,
            seed: chunkSeed + idNum * 37 + 202,
            variant: idNum % 3,
          }),
        );
      }

      for (let i = 0; i < wolfCount; i++) {
        const spot = pickSpotInChunk(['Forest', 'Mountains'], false, 36);
        if (!spot) continue;
        const idNum = seq++;
        addAnimal(
          new WolfAnimal({
            id: `chunk-${chunkKey}-wolf-${idNum}`,
            home: spot,
            scale: 0.95 + nextR() * 0.18,
            seed: chunkSeed + idNum * 41 + 303,
            variant: idNum % 3,
          }),
        );
      }

      for (let i = 0; i < bearCount; i++) {
        const spot = pickSpotInChunk(['Forest', 'Mountains'], false, 42);
        if (!spot) continue;
        const idNum = seq++;
        addAnimal(
          new BearAnimal({
            id: `chunk-${chunkKey}-bear-${idNum}`,
            home: spot,
            scale: 0.94 + nextR() * 0.2,
            seed: chunkSeed + idNum * 43 + 404,
            variant: idNum % 3,
          }),
        );
      }

      for (let i = 0; i < cowCount; i++) {
        const spot = pickSpotInChunk(['Plains'], false, 24, true);
        if (!spot) continue;
        const idNum = seq++;
        addAnimal(
          new CowAnimal({
            id: `chunk-${chunkKey}-cow-${idNum}`,
            home: spot,
            scale: 0.95 + nextR() * 0.15,
            seed: chunkSeed + idNum * 53 + 601,
            variant: idNum % 3,
          }),
        );
      }

      for (let i = 0; i < sheepCount; i++) {
        const spot = pickSpotInChunk(['Plains'], false, 20, true);
        if (!spot) continue;
        const idNum = seq++;
        addAnimal(
          new SheepAnimal({
            id: `chunk-${chunkKey}-sheep-${idNum}`,
            home: spot,
            scale: 0.94 + nextR() * 0.14,
            seed: chunkSeed + idNum * 59 + 701,
            variant: idNum % 3,
          }),
        );
      }

      for (let i = 0; i < chickenCount; i++) {
        const spot = pickSpotInChunk(['Plains'], false, 16, true);
        if (!spot) continue;
        const idNum = seq++;
        addAnimal(
          new ChickenAnimal({
            id: `chunk-${chunkKey}-chicken-${idNum}`,
            home: spot,
            scale: 0.9 + nextR() * 0.16,
            seed: chunkSeed + idNum * 61 + 801,
            variant: idNum % 3,
          }),
        );
      }

      for (let i = 0; i < birdCount; i++) {
        const spot = pickSpotInChunk([], true, 14);
        if (!spot) continue;
        const idNum = seq++;
        addAnimal(
          new BirdAnimal({
            id: `chunk-${chunkKey}-bird-${idNum}`,
            home: spot,
            scale: 0.9 + nextR() * 0.28,
            seed: chunkSeed + idNum * 47 + 505,
            variant: idNum % 3,
          }),
        );
      }
    }

    this.animalsByChunk.set(chunkKey, spawned);
  }

  public unloadChunkWildlife(chunkKey: string): void {
    const list = this.animalsByChunk.get(chunkKey);
    if (!list) return;

    if (list.length > 0) {
      const removeSet = new Set(list);
      for (let i = this.animals.length - 1; i >= 0; i--) {
        const a = this.animals[i];
        if (removeSet.has(a)) {
          if (a.rig) {
            this.rigPool.release(a.rig);
            a.rig = null;
          }
          this.animals.splice(i, 1);
        }
      }
    }

    this.animalsByChunk.delete(chunkKey);
  }

  /**
   * Finds living animals within player melee strike arc.
   */
  public findAnimalsInStrikeArc(
    origin: THREE.Vector3,
    forwardDir: THREE.Vector3,
    range: number,
    minCos: number,
  ): AnimalStrikeMatch[] {
    const results: AnimalStrikeMatch[] = [];
    const maxRangeSq = (range + 1.1) * (range + 1.1);
    const fLen = Math.hypot(forwardDir.x, forwardDir.z) || 1;
    const fx = forwardDir.x / fLen;
    const fz = forwardDir.z / fLen;

    for (let i = 0; i < this.animals.length; i++) {
      const a = this.animals[i];
      if (a.isDead) continue;
      if (a.distSqToPlayer > maxRangeSq) continue;

      const dx = a.position.x - origin.x;
      const dz = a.position.z - origin.z;
      const horizDist = Math.hypot(dx, dz);
      const effectiveReach = range + a.traits.bodyRadius;
      if (horizDist > effectiveReach) continue;

      const dy = Math.abs(a.position.y + a.altitude - origin.y);
      if (dy > 2.6) continue;

      if (horizDist > 0.35) {
        const dot = (dx / horizDist) * fx + (dz / horizDist) * fz;
        if (dot < minCos) continue;
      }

      results.push({ animal: a, distSq: dx * dx + dz * dz });
    }

    results.sort((a, b) => a.distSq - b.distSq);
    return results;
  }

  /**
   * Swept sphere test along a projectile segment [prevPos -> nextPos] against living animals.
   */
  public rayTestProjectile(
    prevPos: THREE.Vector3,
    nextPos: THREE.Vector3,
    hitPadding = 0.35,
  ): Animal | null {
    let best: Animal | null = null;
    let bestT = Infinity;

    const segX = nextPos.x - prevPos.x;
    const segY = nextPos.y - prevPos.y;
    const segZ = nextPos.z - prevPos.z;
    const segLenSq = segX * segX + segY * segY + segZ * segZ;
    if (segLenSq < 0.00001) return null;

    for (let i = 0; i < this.animals.length; i++) {
      const a = this.animals[i];
      if (a.isDead || a.distSqToPlayer > 95 * 95) continue;

      const cx = a.position.x;
      const cy = a.position.y + a.altitude + a.traits.bodyRadius * 0.85;
      const cz = a.position.z;
      const rad = a.traits.bodyRadius + hitPadding;

      const t = Math.max(
        0,
        Math.min(
          1,
          ((cx - prevPos.x) * segX + (cy - prevPos.y) * segY + (cz - prevPos.z) * segZ) /
            segLenSq,
        ),
      );
      const px = prevPos.x + segX * t - cx;
      const py = prevPos.y + segY * t - cy;
      const pz = prevPos.z + segZ * t - cz;
      const dSq = px * px + py * py + pz * pz;

      if (dSq <= rad * rad && t < bestT) {
        bestT = t;
        best = a;
      }
    }

    return best;
  }

  /**
   * Applies damage to an animal by ID, triggering death collapse & drop table on 0 HP.
   */
  public damageAnimal(
    animalId: string,
    amount: number,
    attackerX: number,
    attackerZ: number,
  ): { hit: boolean; killed: boolean; species?: AnimalSpecies; drops?: AnimalLootDrop[] } {
    for (let i = 0; i < this.animals.length; i++) {
      const a = this.animals[i];
      if (a.id !== animalId) continue;

      const res = a.takeDamage(amount, attackerX, attackerZ);
      if (!res.damaged) return { hit: false, killed: false };

      if (res.killed) {
        this.killedAnimalIds.add(a.id);
        const drops = (ANIMAL_DROP_TABLES[a.species] ?? []).map((d) => ({ ...d }));
        this.callbacks.onAnimalKilled?.(a.id, a.species, a.position.clone(), drops);
        return { hit: true, killed: true, species: a.species, drops };
      }

      return { hit: true, killed: false, species: a.species };
    }
    return { hit: false, killed: false };
  }

  public applyAuthoritativeDamage(
    animalId: string,
    hp: number,
    maxHp: number,
    killed: boolean,
    spawnDrops: boolean,
    attackerX?: number,
    attackerZ?: number,
  ): { hit: boolean; killed: boolean; justKilled: boolean; species?: AnimalSpecies; drops?: AnimalLootDrop[] } {
    const a = this.animals.find((item) => item.id === animalId);
    if (!a) {
      if (killed) {
        this.killedAnimalIds.add(animalId);
      }
      return { hit: false, killed, justKilled: false };
    }

    const justKilled = a.applyAuthoritativeHealth(hp, maxHp, killed, attackerX, attackerZ);
    if (killed || justKilled) {
      this.killedAnimalIds.add(a.id);
    }

    if (justKilled) {
      const drops = (ANIMAL_DROP_TABLES[a.species] ?? []).map((d) => ({ ...d }));
      if (spawnDrops) {
        this.callbacks.onAnimalKilled?.(a.id, a.species, a.position.clone(), drops);
      }
      return { hit: true, killed: true, justKilled: true, species: a.species, drops };
    }

    return { hit: true, killed: a.isDead, justKilled: false, species: a.species };
  }

  public exportSyncDeltas(
    centers: Array<{ x: number; z: number }>,
    maxCount = 8,
    maxRadius = 75,
  ): SyncedEntityDelta[] {
    if (this.networkRemoteControlled || centers.length === 0) return [];
    const rSq = maxRadius * maxRadius;
    const deltas: SyncedEntityDelta[] = [];

    for (let i = 0; i < this.animals.length && deltas.length < maxCount; i++) {
      const a = this.animals[i];
      let near = false;
      for (let c = 0; c < centers.length; c++) {
        const dx = a.position.x - centers[c].x;
        const dz = a.position.z - centers[c].z;
        if (dx * dx + dz * dz <= rSq) {
          near = true;
          break;
        }
      }
      if (!near) continue;

      const yWorld = a.position.y + a.altitude;
      const prev = this.lastSyncSnapshot.get(a.id);
      if (a.isDead && prev?.isDead) {
        continue;
      }

      const moved =
        !prev ||
        Math.abs(a.position.x - prev.x) > 0.1 ||
        Math.abs(yWorld - prev.y) > 0.1 ||
        Math.abs(a.position.z - prev.z) > 0.1 ||
        Math.abs(a.yaw - prev.yaw) > 0.08 ||
        prev.state !== a.behaviorState ||
        prev.hp !== a.hp ||
        prev.isDead !== a.isDead;

      if (!moved) continue;

      const x = Math.round(a.position.x * 100) / 100;
      const y = Math.round(yWorld * 100) / 100;
      const z = Math.round(a.position.z * 100) / 100;
      const yaw = Math.round(a.yaw * 1000) / 1000;

      this.lastSyncSnapshot.set(a.id, {
        x,
        y,
        z,
        yaw,
        state: a.behaviorState,
        hp: a.hp,
        isDead: a.isDead,
      });

      deltas.push({
        id: a.id,
        kind: 'animal',
        archetype: a.species,
        x,
        y,
        z,
        yaw,
        state: a.behaviorState,
        hp: a.hp,
        maxHp: a.maxHp,
        isDead: a.isDead,
      });
    }

    return deltas;
  }

  public applySyncDeltas(deltas: SyncedEntityDelta[]): void {
    for (let i = 0; i < deltas.length; i++) {
      const d = deltas[i];
      if (d.kind !== 'animal') continue;
      if (d.isDead) {
        this.killedAnimalIds.add(d.id);
      }
      const a = this.animals.find((item) => item.id === d.id);
      if (a) {
        a.applyRemoteSync(d);
      }
    }
  }

  private hashCell(gx: number, gz: number): number {
    return ((gx + 512) << 12) | (gz + 512);
  }

  private rebuildSpatialGrid(): void {
    this.spatialBuckets.clear();
    for (let i = 0; i < this.activeBuckets.length; i++) {
      this.activeBuckets[i].length = 0;
      this.bucketPool.push(this.activeBuckets[i]);
    }
    this.activeBuckets.length = 0;

    for (let i = 0; i < this.animals.length; i++) {
      const a = this.animals[i];
      if (a.isDead) continue;
      const gx = Math.floor(a.position.x / CELL_SIZE);
      const gz = Math.floor(a.position.z / CELL_SIZE);
      const key = this.hashCell(gx, gz);
      let bucket = this.spatialBuckets.get(key);
      if (!bucket) {
        bucket = this.bucketPool.pop() ?? [];
        this.spatialBuckets.set(key, bucket);
        this.activeBuckets.push(bucket);
      }
      bucket.push(a);
    }
  }

  public queryNearbyAnimals = (
    x: number,
    z: number,
    radius: number,
    out: NearbyAnimalEntry[],
  ): NearbyAnimalEntry[] => {
    out.length = 0;
    const cellSpan = Math.max(1, Math.ceil(radius / CELL_SIZE));
    const gx = Math.floor(x / CELL_SIZE);
    const gz = Math.floor(z / CELL_SIZE);
    const rSq = radius * radius;

    for (let dz = -cellSpan; dz <= cellSpan; dz++) {
      for (let dx = -cellSpan; dx <= cellSpan; dx++) {
        const bucket = this.spatialBuckets.get(this.hashCell(gx + dx, gz + dz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const a = bucket[i];
          const adx = a.position.x - x;
          const adz = a.position.z - z;
          if (adx * adx + adz * adz <= rSq) {
            const writeIdx = out.length;
            let entry = this.nearbyEntryPool[writeIdx];
            if (!entry) {
              entry = {
                id: a.id,
                species: a.species,
                diet: a.diet,
                x: a.position.x,
                z: a.position.z,
                behaviorState: a.behaviorState,
                airborne: a.blackboard.airborne,
                isDead: a.isDead,
              };
              this.nearbyEntryPool[writeIdx] = entry;
            } else {
              entry.id = a.id;
              entry.species = a.species;
              entry.diet = a.diet;
              entry.x = a.position.x;
              entry.z = a.position.z;
              entry.behaviorState = a.behaviorState;
              entry.airborne = a.blackboard.airborne;
              entry.isDead = a.isDead;
            }
            out.push(entry);
          }
        }
      }
    }
    return out;
  };

  public alertAt(x: number, z: number, radius: number): void {
    const cellSpan = Math.max(1, Math.ceil(radius / CELL_SIZE));
    const gx = Math.floor(x / CELL_SIZE);
    const gz = Math.floor(z / CELL_SIZE);
    const rSq = radius * radius;

    for (let dz = -cellSpan; dz <= cellSpan; dz++) {
      for (let dx = -cellSpan; dx <= cellSpan; dx++) {
        const bucket = this.spatialBuckets.get(this.hashCell(gx + dx, gz + dz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const a = bucket[i];
          const adx = a.position.x - x;
          const adz = a.position.z - z;
          if (adx * adx + adz * adz <= rSq) {
            a.alertFrom(x, z, 4.5);
          }
        }
      }
    }
  }

  public applyGraphicsProfile(profile: ResolvedGraphicsProfile): void {
    this.nearRigDistSq = profile.wildlifeNearDist * profile.wildlifeNearDist;
    this.midLodDistSq = profile.wildlifeMidDist * profile.wildlifeMidDist;
    this.shadowDistSq = profile.entityShadowDist * profile.entityShadowDist;
    this.maxActiveRigs = profile.wildlifeMaxRigs;
    this.shadowsEnabled = profile.shadowEnabled && !this.isSoftwareGl;
    this.farPause = profile.wildlifeFarPause;
  }

  public getAnimalCount(): number {
    return this.animals.length;
  }

  public getVisibleAnimalCount(): number {
    return this.visibleAnimalCount;
  }

  public update(
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    worldHours: number,
    queryCollidersNear: (x: number, z: number) => WorldCollider[],
    isVillageClearance: (x: number, z: number) => boolean,
  ): void {
    if (dt <= 0) return;
    const clampedDt = Math.min(dt, 0.1);
    this.frameCounter++;

    // Remove decayed corpses smoothly after CORPSE_DESPAWN_SECONDS
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      if (a.isDead && a.deathAge >= CORPSE_DESPAWN_SECONDS) {
        if (a.rig) {
          this.rigPool.release(a.rig);
          a.rig = null;
        }
        this.animals.splice(i, 1);
      }
    }

    this.rebuildSpatialGrid();

    const ctx = this.tickCtx;
    ctx.dt = clampedDt;
    ctx.elapsed = elapsed;
    ctx.worldHours = worldHours;
    ctx.playerPos = playerPos;
    ctx.isNearPlayer = false;
    ctx.queryCollidersNear = queryCollidersNear;
    ctx.isVillageClearance = isVillageClearance;

    // Pass 1: Compute player distances & collect near-rig candidates
    this.nearCandidates.length = 0;
    for (let i = 0; i < this.animals.length; i++) {
      const a = this.animals[i];
      const dx = a.position.x - playerPos.x;
      const dz = a.position.z - playerPos.z;
      a.distSqToPlayer = dx * dx + dz * dz;
      if (a.distSqToPlayer <= this.nearRigDistSq) {
        this.nearCandidates.push(a);
      } else if (a.rig) {
        this.rigPool.release(a.rig);
        a.rig = null;
      }
    }

    if (this.nearCandidates.length > this.maxActiveRigs) {
      this.nearCandidates.sort((a, b) => a.distSqToPlayer - b.distSqToPlayer);
      for (let i = this.maxActiveRigs; i < this.nearCandidates.length; i++) {
        const overflow = this.nearCandidates[i];
        if (overflow.rig) {
          this.rigPool.release(overflow.rig);
          overflow.rig = null;
        }
      }
      this.nearCandidates.length = this.maxActiveRigs;
    }

    for (let i = 0; i < this.nearCandidates.length; i++) {
      const a = this.nearCandidates[i];
      if (!a.rig) {
        a.rig = this.rigPool.claim(a.species, a.variant);
      }
      a.rig.setShadowCasting(
        this.shadowsEnabled && !a.isDead && a.distSqToPlayer <= this.shadowDistSq,
      );
    }

    // Reset mid-tier LOD instance counts
    for (let s = 0; s < SPECIES_LIST.length; s++) {
      this.lodCounts[SPECIES_LIST[s]] = 0;
    }

    // Pass 2: Distance-tiered staggered AI + kinematics + InstancedMesh packing
    for (let i = 0; i < this.animals.length; i++) {
      const a = this.animals[i];
      const hasRig = a.rig !== null;

      if (hasRig) {
        ctx.isNearPlayer = true;
        if (!this.networkRemoteControlled && !a.isDead && (i & 3) === (this.frameCounter & 3)) {
          a.decideBehavior(clampedDt * 4, ctx);
        }
        a.stepKinematics(clampedDt, elapsed, ctx);
      } else if (a.distSqToPlayer <= this.midLodDistSq && !a.isDead) {
        ctx.isNearPlayer = false;
        if (!this.networkRemoteControlled && i % 6 === this.frameCounter % 6) {
          const stepDt = clampedDt * 6;
          a.decideBehavior(stepDt, ctx);
          a.stepKinematics(stepDt, elapsed, ctx);
        } else if (this.networkRemoteControlled) {
          a.stepKinematics(clampedDt, elapsed, ctx);
        }

        const idx = this.lodCounts[a.species];
        const mesh = this.lodMeshes[a.species];
        if (idx < SPECIES_LOD_CAPACITY[a.species]) {
          _dummy.position.set(
            a.position.x,
            a.position.y + a.altitude,
            a.position.z,
          );
          _dummy.rotation.set(0, a.yaw, 0);
          _dummy.scale.setScalar(a.scale);
          _dummy.updateMatrix();
          mesh.setMatrixAt(idx, _dummy.matrix);

          const palette = SPECIES_COLOR_PALETTES[a.species];
          _tempColor.setHex(palette[a.variant % palette.length]);
          mesh.setColorAt(idx, _tempColor);
          this.lodCounts[a.species] = idx + 1;
        }
      } else if (!this.farPause && !a.isDead) {
        ctx.isNearPlayer = false;
        if (!this.networkRemoteControlled && i % 24 === this.frameCounter % 24) {
          const stepDt = clampedDt * 24;
          a.decideBehavior(stepDt, ctx);
          a.stepKinematics(stepDt, elapsed, ctx);
        }
      } else if (a.isDead) {
        a.deathAge += clampedDt;
      }
    }

    let totalLodCount = 0;
    for (let s = 0; s < SPECIES_LIST.length; s++) {
      const sp = SPECIES_LIST[s];
      const mesh = this.lodMeshes[sp];
      const count = this.lodCounts[sp];
      mesh.count = count;
      totalLodCount += count;
      if (count > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) {
          mesh.instanceColor.needsUpdate = true;
        }
      }
    }
    this.visibleAnimalCount = this.nearCandidates.length + totalLodCount;
  }

  public dispose(): void {
    for (let i = 0; i < this.animals.length; i++) {
      if (this.animals[i].rig) {
        this.rigPool.release(this.animals[i].rig!);
        this.animals[i].rig = null;
      }
    }
    this.animals.length = 0;
    this.animalsByChunk.clear();
    this.killedAnimalIds.clear();
    this.rigPool.dispose();
    for (let s = 0; s < SPECIES_LIST.length; s++) {
      this.lodMeshes[SPECIES_LIST[s]].dispose();
    }
    this.assets.dispose();
    this.rootGroup.removeFromParent();
  }
}
