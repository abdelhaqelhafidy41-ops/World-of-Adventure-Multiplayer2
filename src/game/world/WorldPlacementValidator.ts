import {
  EMERALD_BASIN_RADIUS,
  EMERALD_BASIN_X,
  EMERALD_BASIN_Z,
  FROSTMELT_TARN_RADIUS,
  FROSTMELT_TARN_X,
  FROSTMELT_TARN_Z,
  HIGHLAND_LAKE_RADIUS,
  HIGHLAND_LAKE_X,
  HIGHLAND_LAKE_Z,
  LAKE_BASE_RADIUS,
  LAKE_CENTER_X,
  LAKE_CENTER_Z,
  PLAYABLE_RADIUS,
  SUNSTONE_OASIS_RADIUS,
  SUNSTONE_OASIS_X,
  SUNSTONE_OASIS_Z,
  WATER_LEVEL,
  getBiomeAt,
  getCoastlineZAt,
  getEastRiverCenterXAt,
  getLakeDistanceFactor,
  getRiverCenterXAt,
  getWestRiverCenterXAt,
  groundHeightAt,
  groundSlopeAt,
} from '../math/noise';
import type { BiomeType } from '../types';
import type { AnimalSpecies } from '../wildlife/wildlifeTypes';

/**
 * Configurable terrain, hydrology, and world placement safety margins.
 * Shared across VillageManager, ExplorationLocations, WorldManager,
 * EnvironmentProps, NPCManager, WildlifeManager, and Save Repair.
 */
export const VILLAGE_WATER_BUFFER = 28;
export const BUILDING_WATER_BUFFER = 14;
export const RESOURCE_WATER_BUFFER = 4.5;

export const MIN_VILLAGE_ELEVATION = WATER_LEVEL + 2.2;
export const MIN_BUILDING_ELEVATION = WATER_LEVEL + 1.8;
export const MIN_RESOURCE_ELEVATION = WATER_LEVEL + 0.55;
export const MIN_NPC_ELEVATION = WATER_LEVEL + 0.75;

export type ValidatableResourceType =
  | 'wood'
  | 'timber-tree'
  | 'stone'
  | 'iron-ore'
  | 'coal'
  | 'gold-ore'
  | 'clay'
  | 'wheat'
  | 'grain'
  | 'fiber'
  | 'herb'
  | 'meadow-herb'
  | 'mushroom'
  | 'berries'
  | 'flower'
  | 'sand'
  | 'cactus'
  | 'desert-plant'
  | 'rare-mineral'
  | 'shell'
  | 'driftwood'
  | 'reeds'
  | 'pickup'
  | 'crate'
  | 'chest';

export const MIN_VILLAGE_DISTANCE = 420;
export const MAX_VILLAGE_ATTEMPTS = 5000;

export type VillageRejectionReason =
  | 'out_of_bounds'
  | 'water_center'
  | 'water_clearance'
  | 'water_footprint'
  | 'slope_too_steep'
  | 'relief_too_high'
  | 'biome_mismatch'
  | 'valley_required'
  | 'too_close_village';

export interface VillageValidationOptions {
  waterBuffer?: number;
  footprintRadius?: number;
  maxSlope?: number;
  maxRelief?: number;
  minElevation?: number;
  allowedBiomes?: ReadonlyArray<BiomeType>;
  requireValley?: boolean;
  existingVillages?: ReadonlyArray<{ centerX: number; centerZ: number; radius?: number }>;
  minVillageSpacing?: number;
  extraPoints?: ReadonlyArray<{ x: number; z: number; waterBuffer?: number }>;
}

export interface VillageFootprintValidationResult {
  valid: boolean;
  reason?: VillageRejectionReason;
  centerElevation: number;
  relief: number;
  maxSampleSlope: number;
  minHydrologyClearance: number;
}

export interface WorldGenTelemetry {
  seed: number;
  totalVillageAttempts: number;
  rejectedVillageCount: number;
  rejectedResourceCount: number;
  waterViolations: number;
  invalidResourceSpawns: number;
  rejectedVillageSamples: Array<{ x: number; z: number; reason: VillageRejectionReason }>;
  rejectedResourceSamples: Array<{ x: number; z: number; kind: string }>;
}

let activeTelemetry: WorldGenTelemetry = {
  seed: 0,
  totalVillageAttempts: 0,
  rejectedVillageCount: 0,
  rejectedResourceCount: 0,
  waterViolations: 0,
  invalidResourceSpawns: 0,
  rejectedVillageSamples: [],
  rejectedResourceSamples: [],
};

export function resetWorldGenTelemetry(seed = 0): void {
  activeTelemetry = {
    seed,
    totalVillageAttempts: 0,
    rejectedVillageCount: 0,
    rejectedResourceCount: 0,
    waterViolations: 0,
    invalidResourceSpawns: 0,
    rejectedVillageSamples: [],
    rejectedResourceSamples: [],
  };
}

export function getWorldGenTelemetry(): WorldGenTelemetry {
  return activeTelemetry;
}

export function recordRejectedVillageCandidate(
  x: number,
  z: number,
  reason: VillageRejectionReason,
): void {
  activeTelemetry.rejectedVillageCount++;
  if (activeTelemetry.rejectedVillageSamples.length < 350) {
    activeTelemetry.rejectedVillageSamples.push({ x, z, reason });
  }
}

export function recordRejectedResourceCandidate(
  x: number,
  z: number,
  kind: string,
): void {
  activeTelemetry.rejectedResourceCount++;
  if (activeTelemetry.rejectedResourceSamples.length < 400) {
    activeTelemetry.rejectedResourceSamples.push({ x, z, kind });
  }
}

export function recordWaterViolation(): void {
  activeTelemetry.waterViolations++;
}

export function recordInvalidResourceSpawn(): void {
  activeTelemetry.invalidResourceSpawns++;
}

export interface ResourceValidationOptions {
  waterBuffer?: number;
  maxSlope?: number;
  minElevation?: number;
  allowWaterEdge?: boolean;
  enforceBiomeAffinity?: boolean;
}

const LAKES: ReadonlyArray<{ x: number; z: number; radius: number }> = [
  { x: LAKE_CENTER_X, z: LAKE_CENTER_Z, radius: LAKE_BASE_RADIUS },
  { x: HIGHLAND_LAKE_X, z: HIGHLAND_LAKE_Z, radius: HIGHLAND_LAKE_RADIUS },
  { x: EMERALD_BASIN_X, z: EMERALD_BASIN_Z, radius: EMERALD_BASIN_RADIUS },
  { x: SUNSTONE_OASIS_X, z: SUNSTONE_OASIS_Z, radius: SUNSTONE_OASIS_RADIUS },
  { x: FROSTMELT_TARN_X, z: FROSTMELT_TARN_Z, radius: FROSTMELT_TARN_RADIUS },
];

/**
 * Signed distance to the nearest river/lake/ocean boundary (positive = inland away from water,
 * negative or zero = inside river channel, lake basin, or sea).
 */
export function getHydrologyClearance(x: number, z: number): number {
  const coastZ = getCoastlineZAt(x);
  // Coast beach shelf begins sloping smoothly toward ocean around coastZ - 14
  let minClearance = coastZ - 14 - z;

  // All 5 lakes (carved out to ~1.22 * baseR in organic bays)
  for (let i = 0; i < LAKES.length; i++) {
    const lake = LAKES[i];
    const d = Math.hypot(x - lake.x, z - lake.z) - lake.radius * 1.24;
    if (d < minClearance) minClearance = d;
  }

  // Primary winding river (flowing from -360 down to coast)
  if (z > -375 && z < coastZ + 32) {
    const rx = getRiverCenterXAt(z);
    const d = Math.abs(x - rx) - 13.5;
    if (d < minClearance) minClearance = d;
  }

  // Western Riverwood tributary (flowing through Emerald Basin)
  if (x < -380 && x > -1540 && z > -1470 && z < coastZ + 35) {
    const wrx = getWestRiverCenterXAt(z);
    const d = Math.abs(x - wrx) - 14.5;
    if (d < minClearance) minClearance = d;
  }

  // Eastern Foothills stream
  if (x > 420 && x < 1560 && z > -1370 && z < coastZ + 35) {
    const erx = getEastRiverCenterXAt(z);
    const d = Math.abs(x - erx) - 13.0;
    if (d < minClearance) minClearance = d;
  }

  return minClearance;
}

/**
 * Returns true if the world point lies underwater, on/inside the coastline surf,
 * inside a lake basin, or inside any of the 3 carved river beds.
 */
export function isWater(x: number, z: number, knownHeight?: number): boolean {
  const h = knownHeight ?? groundHeightAt(x, z);
  if (h <= WATER_LEVEL + 0.18) return true;
  if (getLakeDistanceFactor(x, z) < 1.04) return true;

  const coastZ = getCoastlineZAt(x);
  if (z >= coastZ - 6) return true;

  if (z > -360 && z < coastZ + 25 && Math.abs(x - getRiverCenterXAt(z)) < 10.5) {
    return true;
  }
  if (
    x < -420 &&
    x > -1500 &&
    z > -1450 &&
    z < coastZ + 30 &&
    Math.abs(x - getWestRiverCenterXAt(z)) < 11.2
  ) {
    return true;
  }
  if (
    x > 460 &&
    x < 1520 &&
    z > -1350 &&
    z < coastZ + 30 &&
    Math.abs(x - getEastRiverCenterXAt(z)) < 10.0
  ) {
    return true;
  }

  return false;
}

/**
 * Returns true if the coordinate is solid dry land safely above WATER_LEVEL.
 */
export function isLand(
  x: number,
  z: number,
  minHeightAboveWater = 0.55,
  knownHeight?: number,
): boolean {
  const h = knownHeight ?? groundHeightAt(x, z);
  if (h < WATER_LEVEL + minHeightAboveWater) return false;
  return !isWater(x, z, h);
}

/**
 * Returns true if any ocean, lake, river, or submerged terrain falls within `bufferMeters`
 * of `(x, z)`. Checks analytical hydrology clearance AND perimeter terrain elevation.
 */
export function isNearWater(
  x: number,
  z: number,
  bufferMeters = VILLAGE_WATER_BUFFER,
): boolean {
  if (getHydrologyClearance(x, z) < bufferMeters) {
    return true;
  }

  // Sample perimeter points around (x, z) at both half-buffer and full-buffer rings
  const innerR = Math.max(2, bufferMeters * 0.55);
  const rings = bufferMeters >= 10 ? [innerR, bufferMeters] : [bufferMeters];
  const samples = bufferMeters >= 16 ? 12 : 8;

  for (let rIdx = 0; rIdx < rings.length; rIdx++) {
    const r = rings[rIdx];
    for (let i = 0; i < samples; i++) {
      const ang = (i / samples) * Math.PI * 2;
      const sx = x + Math.cos(ang) * r;
      const sz = z + Math.sin(ang) * r;
      const sh = groundHeightAt(sx, sz);
      if (sh <= WATER_LEVEL + 0.45 || isWater(sx, sz, sh)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Returns true if `(x, z)` sits inside a broad, relatively flat valley clearing
 * suitable for Valley Villages and valley agriculture.
 */
export function isValleyTerrain(x: number, z: number): boolean {
  const biome = getBiomeAt(x, z);
  if (biome !== 'Plains' && biome !== 'Forest') return false;
  const h = groundHeightAt(x, z);
  if (h < WATER_LEVEL + 2.0 || h > 18.5) return false;
  if (isNearWater(x, z, 18)) return false;
  if (groundSlopeAt(x, z, h) > 0.145) return false;
  return true;
}

/**
 * Full multi-point footprint validation returning structured rejection details.
 * Checks center land state, hydrology buffer, world edges, spacing, slope, height relief,
 * biome constraints, multi-ring village perimeter, and optional building/road/NPC/yard points.
 */
export function validateVillageFootprint(
  x: number,
  z: number,
  options: VillageValidationOptions = {},
): VillageFootprintValidationResult {
  const {
    waterBuffer = VILLAGE_WATER_BUFFER,
    footprintRadius = 42,
    maxSlope = 0.16,
    maxRelief = 5.4,
    minElevation = MIN_VILLAGE_ELEVATION,
    allowedBiomes,
    requireValley = false,
    existingVillages = [],
    minVillageSpacing = 250,
    extraPoints = [],
  } = options;

  const centerH = groundHeightAt(x, z);
  const centerClearance = getHydrologyClearance(x, z);
  const centerSlope = groundSlopeAt(x, z, centerH);

  // 1. Inside playable world bounds away from outer mountain boundary
  if (Math.hypot(x, z) > PLAYABLE_RADIUS - Math.max(125, footprintRadius + 75)) {
    return {
      valid: false,
      reason: 'out_of_bounds',
      centerElevation: centerH,
      relief: 0,
      maxSampleSlope: centerSlope,
      minHydrologyClearance: centerClearance,
    };
  }

  // 2. Center elevation & dry-land check
  if (!isLand(x, z, minElevation - WATER_LEVEL, centerH)) {
    return {
      valid: false,
      reason: 'water_center',
      centerElevation: centerH,
      relief: 0,
      maxSampleSlope: centerSlope,
      minHydrologyClearance: centerClearance,
    };
  }

  // 3. Biome constraints
  const biome = getBiomeAt(x, z);
  const allowBeach = Boolean(allowedBiomes && allowedBiomes.includes('Beach'));
  if (biome === 'Beach' && !allowBeach) {
    return {
      valid: false,
      reason: 'biome_mismatch',
      centerElevation: centerH,
      relief: 0,
      maxSampleSlope: centerSlope,
      minHydrologyClearance: centerClearance,
    };
  }
  if (allowedBiomes && allowedBiomes.length > 0 && !allowedBiomes.includes(biome)) {
    return {
      valid: false,
      reason: 'biome_mismatch',
      centerElevation: centerH,
      relief: 0,
      maxSampleSlope: centerSlope,
      minHydrologyClearance: centerClearance,
    };
  }
  if (requireValley && !isValleyTerrain(x, z)) {
    return {
      valid: false,
      reason: 'valley_required',
      centerElevation: centerH,
      relief: 0,
      maxSampleSlope: centerSlope,
      minHydrologyClearance: centerClearance,
    };
  }

  // 4. Water buffer around center + full village perimeter footprint
  if (centerClearance < waterBuffer + footprintRadius * 0.48 || isNearWater(x, z, waterBuffer + footprintRadius * 0.48)) {
    return {
      valid: false,
      reason: 'water_clearance',
      centerElevation: centerH,
      relief: 0,
      maxSampleSlope: centerSlope,
      minHydrologyClearance: centerClearance,
    };
  }

  // 5. Overlap check against existing villages
  for (let i = 0; i < existingVillages.length; i++) {
    const v = existingVillages[i];
    const spacing = Math.max(minVillageSpacing, (v.radius ?? 45) + footprintRadius + 140);
    const dx = x - v.centerX;
    const dz = z - v.centerZ;
    if (dx * dx + dz * dz < spacing * spacing) {
      return {
        valid: false,
        reason: 'too_close_village',
        centerElevation: centerH,
        relief: 0,
        maxSampleSlope: centerSlope,
        minHydrologyClearance: centerClearance,
      };
    }
  }

  // 6. Center slope check
  if (centerSlope > maxSlope) {
    return {
      valid: false,
      reason: 'slope_too_steep',
      centerElevation: centerH,
      relief: 0,
      maxSampleSlope: centerSlope,
      minHydrologyClearance: centerClearance,
    };
  }

  // 7. Multi-ring terrain flatness & dry perimeter validation for houses, roads, NPCs & resource yards
  let minH = centerH;
  let maxH = centerH;
  let maxSampleSlope = centerSlope;
  let minHydro = centerClearance;
  const checkRings = [14, Math.round(footprintRadius * 0.68), footprintRadius];
  const perimeterMinClearance = Math.max(8, waterBuffer * 0.42);

  for (let rIdx = 0; rIdx < checkRings.length; rIdx++) {
    const r = checkRings[rIdx];
    const pts = r >= 36 ? 12 : 8;
    for (let i = 0; i < pts; i++) {
      const ang = (i / pts) * Math.PI * 2;
      const px = x + Math.cos(ang) * r;
      const pz = z + Math.sin(ang) * r;
      const ph = groundHeightAt(px, pz);
      const pClear = getHydrologyClearance(px, pz);
      if (pClear < minHydro) minHydro = pClear;

      if (ph < WATER_LEVEL + 1.5 || isWater(px, pz, ph) || pClear < perimeterMinClearance) {
        return {
          valid: false,
          reason: 'water_footprint',
          centerElevation: centerH,
          relief: maxH - minH,
          maxSampleSlope,
          minHydrologyClearance: minHydro,
        };
      }
      const pSlope = groundSlopeAt(px, pz, ph);
      if (pSlope > maxSampleSlope) maxSampleSlope = pSlope;
      if (r <= footprintRadius * 0.8 && pSlope > maxSlope * 1.28) {
        return {
          valid: false,
          reason: 'slope_too_steep',
          centerElevation: centerH,
          relief: maxH - minH,
          maxSampleSlope,
          minHydrologyClearance: minHydro,
        };
      }
      if (ph < minH) minH = ph;
      if (ph > maxH) maxH = ph;
    }
  }

  // 8. Validate any explicit building/road/NPC/storage-yard points
  for (let i = 0; i < extraPoints.length; i++) {
    const pt = extraPoints[i];
    const ph = groundHeightAt(pt.x, pt.z);
    const pClear = getHydrologyClearance(pt.x, pt.z);
    if (pClear < minHydro) minHydro = pClear;
    const reqClear = pt.waterBuffer ?? BUILDING_WATER_BUFFER * 0.65;
    if (ph < WATER_LEVEL + 1.5 || isWater(pt.x, pt.z, ph) || pClear < reqClear) {
      return {
        valid: false,
        reason: 'water_footprint',
        centerElevation: centerH,
        relief: maxH - minH,
        maxSampleSlope,
        minHydrologyClearance: minHydro,
      };
    }
    if (ph < minH) minH = ph;
    if (ph > maxH) maxH = ph;
  }

  const relief = maxH - minH;
  if (relief > maxRelief) {
    return {
      valid: false,
      reason: 'relief_too_high',
      centerElevation: centerH,
      relief,
      maxSampleSlope,
      minHydrologyClearance: minHydro,
    };
  }

  return {
    valid: true,
    centerElevation: centerH,
    relief,
    maxSampleSlope,
    minHydrologyClearance: minHydro,
  };
}

/**
 * Validates whether a village can safely be anchored at `(x, z)` without touching any
 * river, lake, ocean, excessive slope, cliff, or existing settlement.
 */
export function isValidVillageLocation(
  x: number,
  z: number,
  options: VillageValidationOptions = {},
): boolean {
  return validateVillageFootprint(x, z, options).valid;
}

/**
 * Validates an individual building, shop, farm, well, tent, or structure footprint
 * so no house, road segment, farm, or well ever clips into water or sheer cliffs.
 */
export function isValidBuildingLocation(
  x: number,
  z: number,
  halfW = 5.5,
  halfD = 5.5,
  yaw = 0,
  waterBuffer = BUILDING_WATER_BUFFER,
  maxSlope = 0.28,
): boolean {
  if (Math.hypot(x, z) > PLAYABLE_RADIUS - 65) return false;
  const ch = groundHeightAt(x, z);
  if (!isLand(x, z, MIN_BUILDING_ELEVATION - WATER_LEVEL, ch)) return false;
  if (isNearWater(x, z, waterBuffer)) return false;
  if (groundSlopeAt(x, z, ch) > maxSlope) return false;

  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  let minH = ch;
  let maxH = ch;

  const localPts: ReadonlyArray<readonly [number, number]> = [
    [-halfW, -halfD],
    [halfW, -halfD],
    [halfW, halfD],
    [-halfW, halfD],
    [0, -halfD],
    [0, halfD],
    [-halfW, 0],
    [halfW, 0],
  ];

  for (let i = 0; i < localPts.length; i++) {
    const lx = localPts[i][0];
    const lz = localPts[i][1];
    const wx = x + lx * cos - lz * sin;
    const wz = z + lx * sin + lz * cos;
    const wh = groundHeightAt(wx, wz);
    if (wh < MIN_BUILDING_ELEVATION - 0.35 || isWater(wx, wz, wh)) {
      return false;
    }
    if (wh < minH) minH = wh;
    if (wh > maxH) maxH = wh;
  }

  if (maxH - minH > 3.8) return false;
  return true;
}

/**
 * Validates that a gatherable resource, herb, ore vein, crate, or pickup spawns strictly
 * on solid dry land matching biome and slope constraints.
 */
export function isValidResourceLocation(
  x: number,
  z: number,
  resourceType: ValidatableResourceType | string,
  options: ResourceValidationOptions = {},
): boolean {
  if (Math.hypot(x, z) > PLAYABLE_RADIUS - 30) return false;

  const isWaterEdgeType =
    options.allowWaterEdge ??
    (resourceType === 'shell' ||
      resourceType === 'driftwood' ||
      resourceType === 'reeds' ||
      resourceType === 'clay');
  const minElev =
    options.minElevation ??
    (isWaterEdgeType ? WATER_LEVEL + 0.45 : MIN_RESOURCE_ELEVATION);
  const waterBuffer = options.waterBuffer ?? (isWaterEdgeType ? 1.2 : RESOURCE_WATER_BUFFER);

  const h = groundHeightAt(x, z);
  if (h < minElev || isWater(x, z, h)) return false;
  if (getHydrologyClearance(x, z) < (isWaterEdgeType ? 0.55 : waterBuffer)) {
    return false;
  }

  // Ensure nearby surrounding ring (1.6m) isn't submerged
  for (let i = 0; i < 4; i++) {
    const ang = (i * Math.PI) * 0.5;
    const nx = x + Math.cos(ang) * 1.6;
    const nz = z + Math.sin(ang) * 1.6;
    const nh = groundHeightAt(nx, nz);
    if (nh <= WATER_LEVEL + 0.15 || isWater(nx, nz, nh)) {
      return false;
    }
  }

  const slope = groundSlopeAt(x, z, h);
  let defaultMaxSlope = 0.34;
  if (
    resourceType === 'stone' ||
    resourceType === 'iron-ore' ||
    resourceType === 'coal' ||
    resourceType === 'gold-ore' ||
    resourceType === 'rare-mineral'
  ) {
    defaultMaxSlope = 0.44;
  } else if (resourceType === 'chest' || resourceType === 'crate' || resourceType === 'wheat' || resourceType === 'grain') {
    defaultMaxSlope = 0.25;
  } else if (resourceType === 'cactus' || resourceType === 'sand' || resourceType === 'shell' || resourceType === 'clay') {
    defaultMaxSlope = 0.28;
  }
  if (slope > (options.maxSlope ?? defaultMaxSlope)) return false;

  if (options.enforceBiomeAffinity) {
    const biome = getBiomeAt(x, z);
    if (resourceType === 'cactus' || resourceType === 'desert-plant') {
      if (biome !== 'Desert') return false;
    } else if (resourceType === 'shell' || resourceType === 'driftwood') {
      if (biome !== 'Beach') return false;
    } else if (resourceType === 'mushroom' || resourceType === 'berries') {
      if (biome !== 'Forest' && biome !== 'Plains') return false;
    } else if (resourceType === 'coal') {
      if (biome !== 'Mountains' && biome !== 'Forest') return false;
    } else if (resourceType === 'gold-ore') {
      if (biome !== 'Mountains' && biome !== 'Desert') return false;
    } else if (resourceType === 'wheat' || resourceType === 'grain') {
      if (biome !== 'Plains' && biome !== 'Forest') return false;
    } else if (resourceType === 'clay') {
      if (biome === 'Desert' || biome === 'Mountains') return false;
    }
  }

  return true;
}

/**
 * Validates that an NPC spawn anchor or patrol point rests safely on dry, walkable terrain.
 */
export function isValidNPCSpawnLocation(
  x: number,
  z: number,
  minHeightAboveWater = 0.75,
): boolean {
  if (Math.hypot(x, z) > PLAYABLE_RADIUS - 30) return false;
  const h = groundHeightAt(x, z);
  if (!isLand(x, z, minHeightAboveWater, h)) return false;
  if (getHydrologyClearance(x, z) < 2.2) return false;
  if (groundSlopeAt(x, z, h) > 0.34) return false;
  return true;
}

/**
 * Validates wildlife home coordinates (non-bird terrestrial species stay strictly on land).
 */
export function isValidAnimalSpawnLocation(
  x: number,
  z: number,
  species: AnimalSpecies | string,
): boolean {
  if (Math.hypot(x, z) > PLAYABLE_RADIUS - 35) return false;
  if (species === 'bird') {
    const h = groundHeightAt(x, z);
    return h >= WATER_LEVEL + 0.5 && groundSlopeAt(x, z, h) <= 0.55;
  }
  const h = groundHeightAt(x, z);
  if (!isLand(x, z, 0.75, h)) return false;
  if (getHydrologyClearance(x, z) < 3.5) return false;
  if (groundSlopeAt(x, z, h) > 0.38) return false;
  return true;
}

/**
 * Deterministic spiral search returning the nearest guaranteed valid dry-land position
 * around `(x, z)`. Falls back cleanly to Oakhollow spawn glade `(0, 4)` if no nearby spot exists.
 */
export function findNearestValidLand(
  x: number,
  z: number,
  minWaterBuffer = 6,
  maxSlope = 0.28,
  maxSearchRadius = 260,
): { x: number; y: number; z: number } {
  const h0 = groundHeightAt(x, z);
  if (
    isLand(x, z, 0.75, h0) &&
    !isNearWater(x, z, minWaterBuffer) &&
    groundSlopeAt(x, z, h0) <= maxSlope
  ) {
    return { x, y: h0, z };
  }

  for (let r = 6; r <= maxSearchRadius; r += 8) {
    const steps = r < 40 ? 10 : 16;
    for (let i = 0; i < steps; i++) {
      const ang = (i / steps) * Math.PI * 2;
      const sx = x + Math.cos(ang) * r;
      const sz = z + Math.sin(ang) * r;
      if (Math.hypot(sx, sz) > PLAYABLE_RADIUS - 45) continue;
      const sh = groundHeightAt(sx, sz);
      if (
        isLand(sx, sz, 0.85, sh) &&
        !isNearWater(sx, sz, minWaterBuffer) &&
        groundSlopeAt(sx, sz, sh) <= maxSlope
      ) {
        return { x: sx, y: sh, z: sz };
      }
    }
  }

  const safeY = groundHeightAt(0, 4);
  return { x: 0, y: safeY, z: 4 };
}

/**
 * Deterministic spiral search finding the nearest valid land point for a resource type.
 */
export function findNearestValidResourceLocation(
  x: number,
  z: number,
  resourceType: ValidatableResourceType | string,
  maxSearchRadius = 90,
  options: ResourceValidationOptions = {},
): { x: number; y: number; z: number } | null {
  if (isValidResourceLocation(x, z, resourceType, options)) {
    return { x, y: groundHeightAt(x, z), z };
  }

  for (let r = 4; r <= maxSearchRadius; r += 5) {
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const ang = (i / steps) * Math.PI * 2;
      const sx = x + Math.cos(ang) * r;
      const sz = z + Math.sin(ang) * r;
      if (isValidResourceLocation(sx, sz, resourceType, options)) {
        return { x: sx, y: groundHeightAt(sx, sz), z: sz };
      }
    }
  }
  return null;
}
