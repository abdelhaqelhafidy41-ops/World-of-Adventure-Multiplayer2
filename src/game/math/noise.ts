import * as THREE from 'three';
import type { BiomeType } from '../types';

/**
 * Deterministic Seeded Open-World Noise, Biomes, Hydrology & Terrain Generator.
 * Shared across WorldManager chunks, biome scattering, map rendering, and player physics.
 */

export const WORLD_SIZE = 7200;
export const WORLD_HALF = WORLD_SIZE * 0.5;
export const PLAYABLE_RADIUS = 3350;
export const WATER_LEVEL = 0.0;
export const DEFAULT_WORLD_SEED = 20261113;

let currentSeed = DEFAULT_WORLD_SEED;
let seedOffsetX = 0;
let seedOffsetZ = 0;

export function setWorldSeed(seed: number): void {
  currentSeed = seed >>> 0 || 1;
  const rng = seededRandom(currentSeed);
  seedOffsetX = (rng() - 0.5) * 200;
  seedOffsetZ = (rng() - 0.5) * 200;
}

export function getWorldSeed(): number {
  return currentSeed;
}

setWorldSeed(DEFAULT_WORLD_SEED);

function hash2D(ix: number, iz: number): number {
  let n =
    Math.imul(ix, 374761393) +
    Math.imul(iz, 668265263) +
    Math.imul(currentSeed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function valueNoise2D(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;

  const u = smoothstep(fx);
  const v = smoothstep(fz);

  const a = hash2D(ix, iz);
  const b = hash2D(ix + 1, iz);
  const c = hash2D(ix, iz + 1);
  const d = hash2D(ix + 1, iz + 1);

  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm2D(x: number, z: number, octaves = 4): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let maxAmp = 0;

  for (let i = 0; i < octaves; i++) {
    value += (valueNoise2D(x * frequency, z * frequency) * 2 - 1) * amplitude;
    maxAmp += amplitude;
    amplitude *= 0.5;
    frequency *= 2.04;
  }

  return value / maxAmp;
}

export function ridgedFbm2D(x: number, z: number, octaves = 4): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let maxAmp = 0;

  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise2D(x * frequency, z * frequency) * 2 - 1);
    value += n * n * amplitude;
    maxAmp += amplitude;
    amplitude *= 0.5;
    frequency *= 2.08;
  }

  return value / maxAmp;
}

/**
 * Southern coastline latitude Z(x) with natural bays, coves, and headlands.
 */
export function getCoastlineZAt(x: number): number {
  const wave =
    Math.sin(x * 0.0085) * 34 +
    Math.cos(x * 0.021 + 1.1) * 14 +
    fbm2D(x * 0.0045 + seedOffsetX, 17.3, 3) * 44 +
    Math.sin(x * 0.0019 - 0.7) * 95;
  // Gently curves southward across far eastern/western reaches so large continents open up
  const wingExtend = THREE.MathUtils.smoothstep(Math.abs(x), 240, 2200) * 1020;
  return 225 + wave + wingExtend;
}

/**
 * Primary winding river centerline X(z) flowing from the northern mountains,
 * passing through Whispering Lake at (-86, -38), and emptying into the southern coast.
 */
export function getRiverCenterXAt(z: number): number {
  const meander =
    Math.sin((z + 35) * 0.015) * 46 +
    Math.sin(z * 0.036 + 0.8) * 14 +
    fbm2D(12.4, z * 0.007 + seedOffsetZ, 2) * 18;
  const drift = THREE.MathUtils.clamp((z + 35) * 0.28, -65, 145);
  return -76 + drift + meander * 0.72;
}

/**
 * Western Riverwood stream centerline flowing from northern crags through Emerald Basin.
 */
export function getWestRiverCenterXAt(z: number): number {
  const meander =
    Math.sin(z * 0.0085 - 1.2) * 78 +
    Math.cos(z * 0.021 + 0.4) * 26 +
    fbm2D(41.7, z * 0.005 + seedOffsetX * 0.3, 2) * 34;
  return -840 + THREE.MathUtils.clamp(z * 0.14, -180, 180) + meander;
}

/**
 * Eastern Sunstone-Border stream centerline flowing down from Cragwatch foothills.
 */
export function getEastRiverCenterXAt(z: number): number {
  const meander =
    Math.cos(z * 0.0075 + 0.7) * 72 +
    Math.sin(z * 0.019 - 0.6) * 24 +
    fbm2D(-29.3, z * 0.005 + seedOffsetZ * 0.3, 2) * 30;
  return 920 - THREE.MathUtils.clamp(z * 0.12, -160, 160) + meander;
}

export const LAKE_CENTER_X = -86;
export const LAKE_CENTER_Z = -38;
export const LAKE_BASE_RADIUS = 46;

export const HIGHLAND_LAKE_X = -460;
export const HIGHLAND_LAKE_Z = -380;
export const HIGHLAND_LAKE_RADIUS = 58;

export const EMERALD_BASIN_X = -890;
export const EMERALD_BASIN_Z = 290;
export const EMERALD_BASIN_RADIUS = 74;

export const SUNSTONE_OASIS_X = 820;
export const SUNSTONE_OASIS_Z = -180;
export const SUNSTONE_OASIS_RADIUS = 44;

export const FROSTMELT_TARN_X = 480;
export const FROSTMELT_TARN_Z = -1120;
export const FROSTMELT_TARN_RADIUS = 68;

function lakeNorm(
  x: number,
  z: number,
  cx: number,
  cz: number,
  baseR: number,
  freq1: number,
  phase1: number,
): number {
  const dx = x - cx;
  const dz = z - cz;
  const maxCheck = baseR * 1.65;
  if (Math.abs(dx) > maxCheck || Math.abs(dz) > maxCheck) return 99;
  const dist = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const organicR =
    baseR +
    Math.sin(angle * freq1 + phase1) * (baseR * 0.15) +
    Math.cos(angle * (freq1 + 2) - phase1 * 1.3) * (baseR * 0.09);
  return dist / organicR;
}

export function getLakeDistanceFactor(x: number, z: number): number {
  let best = lakeNorm(x, z, LAKE_CENTER_X, LAKE_CENTER_Z, LAKE_BASE_RADIUS, 3, 0.5);
  best = Math.min(best, lakeNorm(x, z, HIGHLAND_LAKE_X, HIGHLAND_LAKE_Z, HIGHLAND_LAKE_RADIUS, 4, -0.3));
  best = Math.min(best, lakeNorm(x, z, EMERALD_BASIN_X, EMERALD_BASIN_Z, EMERALD_BASIN_RADIUS, 3, 1.4));
  best = Math.min(best, lakeNorm(x, z, SUNSTONE_OASIS_X, SUNSTONE_OASIS_Z, SUNSTONE_OASIS_RADIUS, 5, -0.8));
  best = Math.min(best, lakeNorm(x, z, FROSTMELT_TARN_X, FROSTMELT_TARN_Z, FROSTMELT_TARN_RADIUS, 4, 0.9));
  return best;
}

export interface BiomeWeights {
  plains: number;
  forest: number;
  mountains: number;
  desert: number;
  beach: number;
}

const _internalBiomeWeights: BiomeWeights = {
  plains: 0,
  forest: 0,
  mountains: 0,
  desert: 0,
  beach: 0,
};

function computeRawBiomeFactors(
  x: number,
  z: number,
  knownCoastZ?: number,
): {
  coastZ: number;
  beachMask: number;
  mountains: number;
  desert: number;
  desertHeightBlend: number;
  forest: number;
} {
  const coastZ = knownCoastZ ?? getCoastlineZAt(x);
  const distFromCoast = coastZ - z;

  // Beach zone: coastal strip near sea level
  const beachMask =
    1 - THREE.MathUtils.smoothstep(Math.abs(distFromCoast - 8), 16, 48);

  // Mountains: northern range (z < -125) opening into broad highland valleys, plus regional peaks & outer rim (> 2900m)
  const northMountain =
    THREE.MathUtils.smoothstep(-z, 110, 260) *
    (1 - THREE.MathUtils.smoothstep(-z, 480, 760) * 0.62);
  const farNorthPeaks = THREE.MathUtils.smoothstep(-z, 1320, 1950) * 0.92;
  const distCenter = Math.hypot(x, z);
  const outerRimMountain = THREE.MathUtils.smoothstep(distCenter, 2900, 3300);
  const regionalPeakNoise =
    fbm2D(x * 0.0014 + 64, z * 0.0014 - 41, 3) * 0.5 + 0.5;
  const regionalPeaks =
    distCenter > 420
      ? THREE.MathUtils.smoothstep(regionalPeakNoise, 0.59, 0.82) * 0.85
      : 0;
  const mountainNoise =
    0.7 + 0.6 * (fbm2D(x * 0.004 + 30, z * 0.004 - 15, 2) * 0.5 + 0.5);
  const mountains = THREE.MathUtils.clamp(
    Math.max(northMountain, farNorthPeaks, outerRimMountain, regionalPeaks) * mountainNoise,
    0,
    1,
  );

  // Desert: eastern sunlit expanse (x > 90..210) tapering naturally in the far northeast valleys
  const desertBoundarySample = fbm2D(x * 0.0045 - 9, z * 0.0045 + 14, 2) * 0.5 + 0.5;
  const desertEastOrganic = THREE.MathUtils.smoothstep(
    x + (desertBoundarySample - 0.5) * 64,
    92,
    214,
  );
  const desertEastRaw = THREE.MathUtils.smoothstep(x, 88, 210);
  const desertFarEastFade = 1 - THREE.MathUtils.smoothstep(x, 1550, 2250) * 0.55;
  const desertNorthFade = 1 - THREE.MathUtils.smoothstep(-z, 220, 520);
  const desertCoastFade = THREE.MathUtils.smoothstep(distFromCoast, 12, 52);
  const desertNoise = 0.75 + 0.5 * desertBoundarySample;

  // Preserve original height blend so existing saves, buildings, and villages keep exact ground Y
  const desertHeightBlend = THREE.MathUtils.clamp(
    desertEastRaw * desertFarEastFade * desertNorthFade * desertCoastFade * desertNoise,
    0,
    1,
  );

  // Pure surface biome weight reaches 1.0 in core desert (zero green plains bleed)
  const desert = THREE.MathUtils.clamp(
    desertEastOrganic *
      (1 - THREE.MathUtils.smoothstep(x, 1650, 2320) * 0.42) *
      desertNorthFade *
      desertCoastFade *
      (0.95 + 0.25 * desertBoundarySample),
    0,
    1,
  );

  // Forest: lush western/northwestern woodlands & mid-world ancient timberlands
  const forestWest =
    THREE.MathUtils.smoothstep(-x, 26, 95) *
    (1 - THREE.MathUtils.smoothstep(-x, 1250, 1750) * 0.35);
  const forestNoise =
    fbm2D(x * 0.0034 + seedOffsetX * 0.1, z * 0.0034 + seedOffsetZ * 0.1, 3) * 0.5 +
    0.5;
  const forestPatch = THREE.MathUtils.smoothstep(forestNoise, 0.44, 0.68);
  const forestCoastFade = THREE.MathUtils.smoothstep(distFromCoast, 18, 55);
  const forest = THREE.MathUtils.clamp(
    Math.max(forestWest * 1.05, forestPatch * 0.94) *
      forestCoastFade *
      (1 - mountains * 0.72) *
      (1 - desert),
    0,
    1,
  );

  return {
    coastZ,
    beachMask,
    mountains,
    desert,
    desertHeightBlend,
    forest,
  };
}

export function fillBiomeWeightsAt(
  x: number,
  z: number,
  out: BiomeWeights,
  knownCoastZ?: number,
): BiomeWeights {
  const f = computeRawBiomeFactors(x, z, knownCoastZ);
  const desertClean = f.desert * (1 - f.mountains * 0.85) * (1 - f.beachMask * 0.6);
  const used = Math.min(
    1.0,
    f.mountains + desertClean + f.forest * 0.88 + f.beachMask * 0.92,
  );
  const plains = Math.max(0, 1 - used);

  const sum = plains + f.forest + f.mountains + desertClean + f.beachMask || 1;
  const invSum = 1 / sum;
  out.plains = plains * invSum;
  out.forest = f.forest * invSum;
  out.mountains = f.mountains * invSum;
  out.desert = desertClean * invSum;
  out.beach = f.beachMask * invSum;
  return out;
}

export function getBiomeWeightsAt(x: number, z: number): BiomeWeights {
  return fillBiomeWeightsAt(x, z, {
    plains: 0,
    forest: 0,
    mountains: 0,
    desert: 0,
    beach: 0,
  });
}

export function getBiomeAt(x: number, z: number): BiomeType {
  const coastZ = getCoastlineZAt(x);
  if (z > coastZ - 28) {
    return 'Beach';
  }
  const w = fillBiomeWeightsAt(x, z, _internalBiomeWeights, coastZ);
  let best: BiomeType = 'Plains';
  let bestVal = w.plains;
  if (w.forest > bestVal) {
    best = 'Forest';
    bestVal = w.forest;
  }
  if (w.mountains > bestVal) {
    best = 'Mountains';
    bestVal = w.mountains;
  }
  if (w.desert > bestVal) {
    best = 'Desert';
    bestVal = w.desert;
  }
  if (w.beach > bestVal) {
    best = 'Beach';
  }
  return best;
}

/**
 * Computes deterministic terrain elevation Y at world coordinates (x, z).
 */
export function groundHeightAt(x: number, z: number): number {
  const distFromCenter = Math.hypot(x, z);
  const raw = computeRawBiomeFactors(x, z);
  const rawUsed = Math.min(
    0.96,
    raw.mountains + raw.desertHeightBlend * 0.92 + raw.forest * 0.82 + raw.beachMask * 0.88,
  );
  const rawPlains = Math.max(0.06, 1 - rawUsed);
  const rawSum = rawPlains + raw.forest + raw.mountains + raw.desertHeightBlend + raw.beachMask || 1;
  const invRawSum = 1 / rawSum;

  // Copy weights to scalars immediately in case sub-calls touch shared state
  const wForest = raw.forest * invRawSum;
  const wDesert = raw.desertHeightBlend * invRawSum;
  const wMountains = raw.mountains * invRawSum;
  const coastZ = raw.coastZ;

  // Base undulating meadow & forest relief
  const broad =
    fbm2D(x * 0.0052 + 11.3 + seedOffsetX * 0.05, z * 0.0052 - 5.7 + seedOffsetZ * 0.05, 4) *
    11.5;
  const medium = fbm2D(x * 0.018 - 3.1, z * 0.018 + 8.4, 3) * 3.2;
  const micro = fbm2D(x * 0.065 + 21.0, z * 0.065 + 4.0, 2) * 0.45;

  let height = 3.8 + broad * (0.55 + wForest * 0.45) + medium + micro;

  // Desert sand dunes (smooth sweeping wind ripples)
  if (wDesert > 0.02) {
    const duneWave =
      Math.sin(x * 0.045 + z * 0.028 + fbm2D(x * 0.01, z * 0.01, 2) * 3.0) * 4.4;
    const mesaNoise = fbm2D(x * 0.008 + 70, z * 0.008 - 40, 3);
    const mesa = mesaNoise > 0.28 ? THREE.MathUtils.smoothstep(mesaNoise, 0.28, 0.44) * 13.5 : 0;
    const desertHeight = 4.2 + duneWave + mesa + micro * 0.6;
    height = THREE.MathUtils.lerp(height, desertHeight, wDesert);
  }

  // Mountains with varying heights (foothills, ridged crests, and alpine peaks)
  if (wMountains > 0.01) {
    const ridge1 = ridgedFbm2D(x * 0.0062 + 41.2, z * 0.0062 - 18.6, 4);
    const ridge2 = fbm2D(x * 0.014 - 9.4, z * 0.014 + 27.1, 3) * 0.5 + 0.5;
    const peakVariation = 22 + ridge1 * 56 + ridge2 * 14;
    height += wMountains * peakVariation;
  }

  // Keep spawn glade (0, 4) gently flat and dry (~3.8m)
  const spawnDist = Math.hypot(x, z - 4);
  const spawnFlatten = THREE.MathUtils.smoothstep(spawnDist, 8, 28);
  height = THREE.MathUtils.lerp(3.8, height, spawnFlatten);

  // Carve Lake basin (-86, -38)
  const lakeNormDist = getLakeDistanceFactor(x, z);
  if (lakeNormDist < 1.35) {
    const lakeCarve = 1 - THREE.MathUtils.smoothstep(lakeNormDist, 0.58, 1.32);
    const targetBed = WATER_LEVEL - 3.6;
    height = THREE.MathUtils.lerp(height, targetBed, lakeCarve);
  }

  // Carve Winding River channel from northern mountains (-360) down to coast
  if (z > -360 && z < coastZ + 25) {
    const rx = getRiverCenterXAt(z);
    const distRiver = Math.abs(x - rx);
    const riverHalfWidth = 7.5 + fbm2D(x * 0.03, z * 0.03, 2) * 2.2;
    if (distRiver < riverHalfWidth * 2.2) {
      const bankT =
        1 - THREE.MathUtils.smoothstep(distRiver, riverHalfWidth * 0.45, riverHalfWidth * 2.1);
      // Fade river carving out gently near high northern headwaters
      const sourceFade = THREE.MathUtils.smoothstep(z, -350, -240);
      const riverBed = WATER_LEVEL - 2.35;
      height = THREE.MathUtils.lerp(height, Math.min(height, riverBed), bankT * sourceFade);
    }
  }

  // Carve Western Riverwood tributary flowing through Emerald Basin to coast
  if (x < -420 && x > -1500 && z > -1450 && z < coastZ + 30) {
    const wrx = getWestRiverCenterXAt(z);
    const distWest = Math.abs(x - wrx);
    const wHalf = 8.2 + fbm2D(x * 0.025 + 4, z * 0.025, 2) * 2.4;
    if (distWest < wHalf * 2.2) {
      const bankT =
        1 - THREE.MathUtils.smoothstep(distWest, wHalf * 0.45, wHalf * 2.1);
      const sourceFade = THREE.MathUtils.smoothstep(z, -1420, -1180);
      const riverBed = WATER_LEVEL - 2.2;
      height = THREE.MathUtils.lerp(height, Math.min(height, riverBed), bankT * sourceFade);
    }
  }

  // Carve Eastern Foothills river toward southern bays
  if (x > 460 && x < 1520 && z > -1350 && z < coastZ + 30) {
    const erx = getEastRiverCenterXAt(z);
    const distEast = Math.abs(x - erx);
    const eHalf = 7.2 + fbm2D(x * 0.025 - 6, z * 0.025, 2) * 2.0;
    if (distEast < eHalf * 2.2) {
      const bankT =
        1 - THREE.MathUtils.smoothstep(distEast, eHalf * 0.45, eHalf * 2.1);
      const sourceFade = THREE.MathUtils.smoothstep(z, -1320, -1080);
      const riverBed = WATER_LEVEL - 2.15;
      height = THREE.MathUtils.lerp(height, Math.min(height, riverBed), bankT * sourceFade);
    }
  }

  // Carve Southern Coastline & Beach slope into the ocean
  if (z > coastZ - 42) {
    const coastT = THREE.MathUtils.smoothstep(z, coastZ - 42, coastZ + 38);
    const seaBed = WATER_LEVEL - 7.5 + micro * 0.8;
    const beachShelf = WATER_LEVEL + 1.4 - coastT * 8.9;
    height = THREE.MathUtils.lerp(height, Math.min(height, Math.max(seaBed, beachShelf)), coastT);
  }

  // Gentle outer world rim cliff/sea containment beyond PLAYABLE_RADIUS
  if (distFromCenter > PLAYABLE_RADIUS - 18 && z < coastZ) {
    const rimT = THREE.MathUtils.clamp((distFromCenter - (PLAYABLE_RADIUS - 18)) / 95, 0, 1.4);
    height += rimT * rimT * 42;
  }

  return height;
}

export function groundNormalAt(x: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
  const eps = 0.55;
  const hL = groundHeightAt(x - eps, z);
  const hR = groundHeightAt(x + eps, z);
  const hD = groundHeightAt(x, z - eps);
  const hU = groundHeightAt(x, z + eps);

  out.set(hL - hR, 2 * eps, hD - hU).normalize();
  return out;
}

/**
 * Computes terrain slope (1 - normal.y).
 * When knownCenterH is provided, only evaluates 2 forward taps instead of 4 (50% faster).
 */
export function groundSlopeAt(x: number, z: number, knownCenterH?: number): number {
  const eps = 0.55;
  const hC = knownCenterH ?? groundHeightAt(x, z);
  const dx = groundHeightAt(x + eps, z) - hC;
  const dz = groundHeightAt(x, z + eps) - hC;
  const invLen = 1 / Math.hypot(dx, eps, dz);
  return 1 - eps * invLen;
}

export function waterDepthAt(x: number, z: number): number {
  return Math.max(0, WATER_LEVEL - groundHeightAt(x, z));
}

export function isUnderwaterAt(x: number, z: number): boolean {
  return groundHeightAt(x, z) < WATER_LEVEL;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
