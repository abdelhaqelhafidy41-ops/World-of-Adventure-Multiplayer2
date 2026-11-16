import * as THREE from 'three';
import type { ResolvedGraphicsProfile } from '../engine/GraphicsQualityManager';

export interface ChunkCoords {
  cx: number;
  cz: number;
}

export type ChunkState = 'unloaded' | 'simplified' | 'active';

export interface ChunkConfig {
  chunkSize: number;
  loadRadius: number;
  simplifiedRadius: number;
  unloadRadius: number;
  maxChunkExtent: number;
  maxStepMs: number;
  maxActiveBuildsPerFrame: number;
  maxSimplifiedBuildsPerFrame: number;
}

export interface ManagedChunk {
  readonly key: string;
  readonly cx: number;
  readonly cz: number;
  readonly seed: number;
  readonly centerX: number;
  readonly centerZ: number;
  state: ChunkState;
  readonly rootGroup: THREE.Group;

  // Simplified (horizon) assets retained across 'simplified' and 'active' until unloaded
  simplifiedTerrainMesh: THREE.Mesh | null;
  simplifiedTerrainGeometry: THREE.BufferGeometry | null;
  farLodGroup: THREE.Group | null;
  simplifiedDisposables: Array<{ dispose: () => void }>;

  // Full detail assets only resident while chunk state === 'active'
  terrainLod: THREE.LOD | null;
  activeTerrainGeometries: THREE.BufferGeometry[];
  nearGroup: THREE.Group | null;
  grassMesh: THREE.InstancedMesh | null;
  flowerMesh: THREE.InstancedMesh | null;
  activeDisposables: Array<{ dispose: () => void }>;
}

export interface ChunkHooks {
  getTerrainMaterial: () => THREE.Material;
  createTerrainGeometry: (
    centerX: number,
    centerZ: number,
    size: number,
    segments: number,
  ) => THREE.BufferGeometry;
  buildSimplifiedProps: (chunk: ManagedChunk) => void;
  activateChunkContent: (chunk: ManagedChunk) => void;
  deactivateChunkContent: (chunk: ManagedChunk) => void;
  onActiveChunksChanged?: (activeKeys: Set<string>) => void;
}

export function toChunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function worldToChunkCoords(
  wx: number,
  wz: number,
  chunkSize = 120,
): ChunkCoords {
  return {
    cx: Math.floor((wx + chunkSize * 0.5) / chunkSize),
    cz: Math.floor((wz + chunkSize * 0.5) / chunkSize),
  };
}

export function deriveChunkSeed(worldSeed: number, cx: number, cz: number): number {
  return (
    (worldSeed ^
      Math.imul(cx + 1009, 73856093) ^
      Math.imul(cz + 2027, 19349663)) >>>
    0
  );
}

interface PendingChunkTask {
  cx: number;
  cz: number;
  targetState: 'simplified' | 'active';
  distSq: number;
}

const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  chunkSize: 120,
  loadRadius: 2,
  simplifiedRadius: 4,
  unloadRadius: 5,
  maxChunkExtent: 30,
  maxStepMs: 4.5,
  maxActiveBuildsPerFrame: 1,
  maxSimplifiedBuildsPerFrame: 2,
};

const _frustum = new THREE.Frustum();
const _projScreenMatrix = new THREE.Matrix4();
const _chunkSphere = new THREE.Sphere(new THREE.Vector3(), 98);

const SHADOW_KEEP_DIST_SQ = 68 * 68;
const TERRAIN_KEEP_DIST_SQ = 120 * 120;

export class ChunkManager {
  public readonly worldSeed: number;
  public readonly config: ChunkConfig;

  private readonly parentGroup: THREE.Group;
  private readonly hooks: ChunkHooks;
  private readonly chunks = new Map<string, ManagedChunk>();
  private readonly activeKeys = new Set<string>();
  private readonly unloadScratch: ManagedChunk[] = [];
  private readonly downgradeScratch: ManagedChunk[] = [];
  private readonly pendingQueue: PendingChunkTask[] = [];

  private nearPropDistSq = 178 * 178;
  private farLodDistSq = 460 * 460;
  private grassDrawDistSq = 148 * 148;
  private terrainLodDist = 200;
  private shadowsEnabled = true;

  private lastPlayerCx = Number.NaN;
  private lastPlayerCz = Number.NaN;
  private activeSetDirty = false;

  constructor(
    worldSeed: number,
    parentGroup: THREE.Group,
    hooks: ChunkHooks,
    config?: Partial<ChunkConfig>,
  ) {
    this.worldSeed = worldSeed;
    this.parentGroup = parentGroup;
    this.hooks = hooks;
    this.config = { ...DEFAULT_CHUNK_CONFIG, ...config };
  }

  public applyGraphicsConfig(profile: ResolvedGraphicsProfile): void {
    this.config.loadRadius = profile.chunkLoadRadius;
    this.config.simplifiedRadius = profile.chunkSimplifiedRadius;
    this.config.unloadRadius = profile.chunkUnloadRadius;
    this.config.maxActiveBuildsPerFrame = profile.maxChunkBuildsPerFrame;
    this.nearPropDistSq = profile.nearPropDist * profile.nearPropDist;
    this.farLodDistSq = profile.farLodDist * profile.farLodDist;
    this.grassDrawDistSq = profile.grassDrawDist * profile.grassDrawDist;
    this.terrainLodDist = profile.terrainLodDist;
    this.shadowsEnabled = profile.shadowEnabled;

    this.chunks.forEach((chunk) => {
      if (chunk.terrainLod) {
        for (let i = 0; i < chunk.terrainLod.levels.length; i++) {
          const lvl = chunk.terrainLod.levels[i];
          if (i > 0) {
            lvl.distance = this.terrainLodDist;
          }
          lvl.object.receiveShadow = this.shadowsEnabled;
        }
      }
    });
  }

  public rebuildAllLoadedChunks(wx?: number, wz?: number): void {
    const centerX =
      wx ?? (Number.isFinite(this.lastPlayerCx) ? this.lastPlayerCx * this.config.chunkSize : 0);
    const centerZ =
      wz ?? (Number.isFinite(this.lastPlayerCz) ? this.lastPlayerCz * this.config.chunkSize : 4);

    const all = Array.from(this.chunks.values());
    for (let i = 0; i < all.length; i++) {
      this.unloadChunk(all[i]);
    }
    this.chunks.clear();
    this.activeKeys.clear();
    this.activeSetDirty = true;
    this.preloadAround(centerX, centerZ);
  }

  public getChunkCoordsAt(wx: number, wz: number): ChunkCoords {
    return worldToChunkCoords(wx, wz, this.config.chunkSize);
  }

  public getActiveChunkKeys(): Set<string> {
    return this.activeKeys;
  }

  public getLoadedChunkCount(): number {
    return this.chunks.size;
  }

  public getActiveChunkCount(): number {
    return this.activeKeys.size;
  }

  public getSimplifiedChunkCount(): number {
    return Math.max(0, this.chunks.size - this.activeKeys.size);
  }

  /**
   * Synchronously builds all chunks within `loadRadius` and `simplifiedRadius`
   * around `(wx, wz)` (used at world init, New Game, Save Load, and teleports).
   */
  public preloadAround(wx: number, wz: number): void {
    const { cx: pcx, cz: pcz } = this.getChunkCoordsAt(wx, wz);
    this.lastPlayerCx = pcx;
    this.lastPlayerCz = pcz;

    this.evictFarChunks(pcx, pcz);

    const { loadRadius, simplifiedRadius, maxChunkExtent } = this.config;
    const activeCutoffSq = (loadRadius + 0.35) * (loadRadius + 0.35);
    const simplifiedCutoffSq =
      (simplifiedRadius + 0.25) * (simplifiedRadius + 0.25);

    const tasks: PendingChunkTask[] = [];
    const minCx = Math.max(-maxChunkExtent, pcx - simplifiedRadius);
    const maxCx = Math.min(maxChunkExtent, pcx + simplifiedRadius);
    const minCz = Math.max(-maxChunkExtent, pcz - simplifiedRadius);
    const maxCz = Math.min(maxChunkExtent, pcz + simplifiedRadius);

    for (let cz = minCz; cz <= maxCz; cz++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const dx = cx - pcx;
        const dz = cz - pcz;
        const dSq = dx * dx + dz * dz;
        if (dSq > simplifiedCutoffSq) continue;
        tasks.push({
          cx,
          cz,
          targetState: dSq <= activeCutoffSq ? 'active' : 'simplified',
          distSq: dSq,
        });
      }
    }

    tasks.sort((a, b) => a.distSq - b.distSq);
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (t.targetState === 'active') {
        this.ensureActive(t.cx, t.cz);
      } else {
        this.ensureSimplified(t.cx, t.cz);
      }
    }

    this.flushActiveChangedHook();
  }

  /**
   * Incremental streaming tick called each frame.
   * When `immediatePreload` is true (or on a multi-chunk teleport jump), switches to synchronous preload.
   */
  public syncStreaming(playerPos: THREE.Vector3, immediatePreload = false): void {
    const { cx: pcx, cz: pcz } = this.getChunkCoordsAt(playerPos.x, playerPos.z);

    if (
      immediatePreload ||
      Number.isNaN(this.lastPlayerCx) ||
      this.chunks.size === 0 ||
      Math.abs(pcx - this.lastPlayerCx) >= 2 ||
      Math.abs(pcz - this.lastPlayerCz) >= 2
    ) {
      this.preloadAround(playerPos.x, playerPos.z);
      return;
    }

    this.lastPlayerCx = pcx;
    this.lastPlayerCz = pcz;

    // 1. Unload out-of-range chunks & downgrade active chunks beyond hysteresis ring
    this.evictFarChunks(pcx, pcz);

    // 2. Collect missing or upgradeable chunks inside streaming radii sorted nearest-first
    const {
      loadRadius,
      simplifiedRadius,
      maxChunkExtent,
      maxStepMs,
      maxActiveBuildsPerFrame,
      maxSimplifiedBuildsPerFrame,
    } = this.config;
    const activeCutoffSq = (loadRadius + 0.35) * (loadRadius + 0.35);
    const simplifiedCutoffSq =
      (simplifiedRadius + 0.25) * (simplifiedRadius + 0.25);

    this.pendingQueue.length = 0;
    const minCx = Math.max(-maxChunkExtent, pcx - simplifiedRadius);
    const maxCx = Math.min(maxChunkExtent, pcx + simplifiedRadius);
    const minCz = Math.max(-maxChunkExtent, pcz - simplifiedRadius);
    const maxCz = Math.min(maxChunkExtent, pcz + simplifiedRadius);

    for (let cz = minCz; cz <= maxCz; cz++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const dx = cx - pcx;
        const dz = cz - pcz;
        const dSq = dx * dx + dz * dz;
        if (dSq > simplifiedCutoffSq) continue;

        const key = toChunkKey(cx, cz);
        const existing = this.chunks.get(key);
        const desired: ChunkState =
          dSq <= activeCutoffSq ? 'active' : 'simplified';

        if (!existing || (desired === 'active' && existing.state !== 'active')) {
          this.pendingQueue.push({
            cx,
            cz,
            targetState: desired,
            distSq: dSq,
          });
        }
      }
    }

    if (this.pendingQueue.length > 0) {
      this.pendingQueue.sort((a, b) => a.distSq - b.distSq);

      const tStart = performance.now();
      let activeBuilt = 0;
      let simplifiedBuilt = 0;

      for (let i = 0; i < this.pendingQueue.length; i++) {
        if (i > 0 && performance.now() - tStart >= maxStepMs) {
          break;
        }
        const task = this.pendingQueue[i];
        if (task.targetState === 'active') {
          if (activeBuilt >= maxActiveBuildsPerFrame) continue;
          this.ensureActive(task.cx, task.cz);
          activeBuilt++;
        } else {
          if (simplifiedBuilt >= maxSimplifiedBuildsPerFrame) continue;
          this.ensureSimplified(task.cx, task.cz);
          simplifiedBuilt++;
        }
        if (
          activeBuilt >= maxActiveBuildsPerFrame &&
          simplifiedBuilt >= maxSimplifiedBuildsPerFrame
        ) {
          break;
        }
      }
    }

    this.flushActiveChangedHook();
  }

  /**
   * Per-frame frustum & distance LOD culling across currently resident chunks.
   */
  public updateVisibility(
    playerPos: THREE.Vector3,
    camera: THREE.Camera,
  ): void {
    camera.updateMatrixWorld();
    _projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    _frustum.setFromProjectionMatrix(_projScreenMatrix);

    this.chunks.forEach((c) => {
      const dx = c.centerX - playerPos.x;
      const dz = c.centerZ - playerPos.z;
      const distSq = dx * dx + dz * dz;

      _chunkSphere.center.set(c.centerX, 14, c.centerZ);
      const inFrustum = _frustum.intersectsSphere(_chunkSphere);

      if (c.state === 'active') {
        const showTerrain = inFrustum || distSq <= TERRAIN_KEEP_DIST_SQ;
        if (c.terrainLod) {
          if (c.terrainLod.visible !== showTerrain) {
            c.terrainLod.visible = showTerrain;
          }
          if (showTerrain) {
            c.terrainLod.update(camera);
          }
        }
        if (c.simplifiedTerrainMesh && c.simplifiedTerrainMesh.visible) {
          c.simplifiedTerrainMesh.visible = false;
        }

        const propsVisible = inFrustum || distSq <= SHADOW_KEEP_DIST_SQ;
        const showNear = propsVisible && distSq <= this.nearPropDistSq;
        const showFar = propsVisible && !showNear && distSq <= this.farLodDistSq;

        if (c.nearGroup && c.nearGroup.visible !== showNear) {
          c.nearGroup.visible = showNear;
        }
        if (c.farLodGroup && c.farLodGroup.visible !== showFar) {
          c.farLodGroup.visible = showFar;
        }

        const showGrass = propsVisible && distSq <= this.grassDrawDistSq;
        if (c.grassMesh && c.grassMesh.visible !== showGrass) {
          c.grassMesh.visible = showGrass;
        }
        if (c.flowerMesh && c.flowerMesh.visible !== showGrass) {
          c.flowerMesh.visible = showGrass;
        }
      } else if (c.state === 'simplified') {
        const showTerrain = inFrustum || distSq <= TERRAIN_KEEP_DIST_SQ;
        if (c.simplifiedTerrainMesh && c.simplifiedTerrainMesh.visible !== showTerrain) {
          c.simplifiedTerrainMesh.visible = showTerrain;
        }
        const showFar = inFrustum && distSq <= this.farLodDistSq;
        if (c.farLodGroup && c.farLodGroup.visible !== showFar) {
          c.farLodGroup.visible = showFar;
        }
      }
    });
  }

  private evictFarChunks(pcx: number, pcz: number): void {
    const unloadSq = (this.config.unloadRadius + 0.2) * (this.config.unloadRadius + 0.2);
    const downgradeSq =
      (this.config.loadRadius + 0.85) * (this.config.loadRadius + 0.85);

    this.unloadScratch.length = 0;
    this.downgradeScratch.length = 0;

    this.chunks.forEach((chunk) => {
      const dx = chunk.cx - pcx;
      const dz = chunk.cz - pcz;
      const dSq = dx * dx + dz * dz;
      if (dSq > unloadSq) {
        this.unloadScratch.push(chunk);
      } else if (chunk.state === 'active' && dSq > downgradeSq) {
        this.downgradeScratch.push(chunk);
      }
    });

    for (let i = 0; i < this.downgradeScratch.length; i++) {
      this.downgradeToSimplified(this.downgradeScratch[i]);
    }
    for (let i = 0; i < this.unloadScratch.length; i++) {
      this.unloadChunk(this.unloadScratch[i]);
    }
  }

  private createShell(cx: number, cz: number): ManagedChunk {
    const key = toChunkKey(cx, cz);
    const chunkSize = this.config.chunkSize;
    const centerX = cx * chunkSize;
    const centerZ = cz * chunkSize;

    const rootGroup = new THREE.Group();
    rootGroup.name = `Chunk_${key}`;
    rootGroup.matrixAutoUpdate = false;
    rootGroup.updateMatrix();
    this.parentGroup.add(rootGroup);

    const chunk: ManagedChunk = {
      key,
      cx,
      cz,
      seed: deriveChunkSeed(this.worldSeed, cx, cz),
      centerX,
      centerZ,
      state: 'unloaded',
      rootGroup,
      simplifiedTerrainMesh: null,
      simplifiedTerrainGeometry: null,
      farLodGroup: null,
      simplifiedDisposables: [],
      terrainLod: null,
      activeTerrainGeometries: [],
      nearGroup: null,
      grassMesh: null,
      flowerMesh: null,
      activeDisposables: [],
    };
    this.chunks.set(key, chunk);
    return chunk;
  }

  private ensureSimplified(cx: number, cz: number): ManagedChunk {
    const key = toChunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = this.createShell(cx, cz);
    }
    if (chunk.state === 'simplified' || chunk.state === 'active') {
      return chunk;
    }

    const chunkSize = this.config.chunkSize;
    const terrainMat = this.hooks.getTerrainMaterial();

    const lowGeo = this.hooks.createTerrainGeometry(
      chunk.centerX,
      chunk.centerZ,
      chunkSize,
      7,
    );
    const lowMesh = new THREE.Mesh(lowGeo, terrainMat);
    lowMesh.position.set(chunk.centerX, 0, chunk.centerZ);
    lowMesh.receiveShadow = false;
    lowMesh.castShadow = false;
    lowMesh.frustumCulled = true;
    lowMesh.matrixAutoUpdate = false;
    lowMesh.updateMatrix();
    chunk.rootGroup.add(lowMesh);

    chunk.simplifiedTerrainGeometry = lowGeo;
    chunk.simplifiedTerrainMesh = lowMesh;

    const farLodGroup = new THREE.Group();
    farLodGroup.matrixAutoUpdate = false;
    farLodGroup.updateMatrix();
    chunk.rootGroup.add(farLodGroup);
    chunk.farLodGroup = farLodGroup;

    this.hooks.buildSimplifiedProps(chunk);

    chunk.state = 'simplified';
    return chunk;
  }

  private ensureActive(cx: number, cz: number): ManagedChunk {
    const chunk = this.ensureSimplified(cx, cz);
    if (chunk.state === 'active') {
      return chunk;
    }

    const chunkSize = this.config.chunkSize;
    const terrainMat = this.hooks.getTerrainMaterial();

    if (chunk.simplifiedTerrainMesh) {
      chunk.simplifiedTerrainMesh.visible = false;
    }

    const lod = new THREE.LOD();
    lod.position.set(chunk.centerX, 0, chunk.centerZ);
    lod.matrixAutoUpdate = false;
    lod.updateMatrix();

    const geoHigh = this.hooks.createTerrainGeometry(
      chunk.centerX,
      chunk.centerZ,
      chunkSize,
      30,
    );
    const meshHigh = new THREE.Mesh(geoHigh, terrainMat);
    meshHigh.receiveShadow = this.shadowsEnabled;
    meshHigh.castShadow = false;
    meshHigh.frustumCulled = true;
    meshHigh.matrixAutoUpdate = false;
    meshHigh.updateMatrix();

    const geoMed = this.hooks.createTerrainGeometry(
      chunk.centerX,
      chunk.centerZ,
      chunkSize,
      14,
    );
    const meshMed = new THREE.Mesh(geoMed, terrainMat);
    meshMed.receiveShadow = this.shadowsEnabled;
    meshMed.castShadow = false;
    meshMed.frustumCulled = true;
    meshMed.matrixAutoUpdate = false;
    meshMed.updateMatrix();

    lod.addLevel(meshHigh, 0);
    lod.addLevel(meshMed, this.terrainLodDist);
    chunk.rootGroup.add(lod);

    chunk.terrainLod = lod;
    chunk.activeTerrainGeometries.push(geoHigh, geoMed);

    const nearGroup = new THREE.Group();
    nearGroup.matrixAutoUpdate = false;
    nearGroup.updateMatrix();
    chunk.rootGroup.add(nearGroup);
    chunk.nearGroup = nearGroup;

    this.hooks.activateChunkContent(chunk);

    chunk.state = 'active';
    this.activeKeys.add(chunk.key);
    this.activeSetDirty = true;
    return chunk;
  }

  private downgradeToSimplified(chunk: ManagedChunk): void {
    if (chunk.state !== 'active') return;

    this.hooks.deactivateChunkContent(chunk);

    if (chunk.terrainLod) {
      chunk.terrainLod.removeFromParent();
      chunk.terrainLod = null;
    }
    for (let i = 0; i < chunk.activeTerrainGeometries.length; i++) {
      chunk.activeTerrainGeometries[i].dispose();
    }
    chunk.activeTerrainGeometries.length = 0;

    if (chunk.nearGroup) {
      chunk.nearGroup.removeFromParent();
      chunk.nearGroup = null;
    }
    if (chunk.grassMesh) {
      chunk.grassMesh.removeFromParent();
      chunk.grassMesh = null;
    }
    if (chunk.flowerMesh) {
      chunk.flowerMesh.removeFromParent();
      chunk.flowerMesh = null;
    }

    for (let i = 0; i < chunk.activeDisposables.length; i++) {
      chunk.activeDisposables[i].dispose();
    }
    chunk.activeDisposables.length = 0;

    if (chunk.simplifiedTerrainMesh) {
      chunk.simplifiedTerrainMesh.visible = true;
    }
    if (chunk.farLodGroup) {
      chunk.farLodGroup.visible = true;
    }

    chunk.state = 'simplified';
    this.activeKeys.delete(chunk.key);
    this.activeSetDirty = true;
  }

  private unloadChunk(chunk: ManagedChunk): void {
    if (chunk.state === 'active') {
      this.downgradeToSimplified(chunk);
    }

    if (chunk.simplifiedTerrainMesh) {
      chunk.simplifiedTerrainMesh.removeFromParent();
      chunk.simplifiedTerrainMesh = null;
    }
    if (chunk.simplifiedTerrainGeometry) {
      chunk.simplifiedTerrainGeometry.dispose();
      chunk.simplifiedTerrainGeometry = null;
    }
    if (chunk.farLodGroup) {
      chunk.farLodGroup.removeFromParent();
      chunk.farLodGroup = null;
    }

    for (let i = 0; i < chunk.simplifiedDisposables.length; i++) {
      chunk.simplifiedDisposables[i].dispose();
    }
    chunk.simplifiedDisposables.length = 0;

    chunk.rootGroup.removeFromParent();
    chunk.state = 'unloaded';
    this.chunks.delete(chunk.key);
  }

  private flushActiveChangedHook(): void {
    if (!this.activeSetDirty) return;
    this.activeSetDirty = false;
    this.hooks.onActiveChunksChanged?.(this.activeKeys);
  }

  public dispose(): void {
    const all = Array.from(this.chunks.values());
    for (let i = 0; i < all.length; i++) {
      this.unloadChunk(all[i]);
    }
    this.chunks.clear();
    this.activeKeys.clear();
  }
}
