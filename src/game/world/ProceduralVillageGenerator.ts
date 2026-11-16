import {
  EMERALD_BASIN_X,
  EMERALD_BASIN_Z,
  HIGHLAND_LAKE_X,
  HIGHLAND_LAKE_Z,
  LAKE_CENTER_X,
  LAKE_CENTER_Z,
  PLAYABLE_RADIUS,
  SUNSTONE_OASIS_X,
  SUNSTONE_OASIS_Z,
  WATER_LEVEL,
  getBiomeAt,
  getCoastlineZAt,
  getEastRiverCenterXAt,
  getRiverCenterXAt,
  getWestRiverCenterXAt,
  groundHeightAt,
} from '../math/noise';
import type { BiomeType, NpcRole } from '../types';
import {
  BUILDING_WATER_BUFFER,
  MAX_VILLAGE_ATTEMPTS,
  MIN_VILLAGE_DISTANCE,
  VILLAGE_WATER_BUFFER,
  getHydrologyClearance,
  getWorldGenTelemetry,
  isValleyTerrain,
  recordRejectedVillageCandidate,
  validateVillageFootprint,
} from './WorldPlacementValidator';
import type { VillageKind } from './VillageManager';

export const PROCEDURAL_VILLAGE_COUNT = 27;

export type ProceduralVillageArchetype =
  | 'plains'
  | 'valley'
  | 'forest'
  | 'mountain'
  | 'desert'
  | 'oasis'
  | 'river'
  | 'coastal';

export interface ProceduralVillageBlueprint {
  id: string;
  index: number;
  seed: number;
  name: string;
  nameAr: string;
  kind: VillageKind;
  archetype: ProceduralVillageArchetype;
  biome: BiomeType;
  centerX: number;
  centerZ: number;
  elevation: number;
  clearanceRadius: number;
  houseCount: number;
  stallCount: number;
  hasForge: boolean;
  hasFarm: boolean;
  hasWatchtower: boolean;
  hasBarn: boolean;
  hasStorageShed: boolean;
  workYardKind: 'lumber' | 'mining' | 'coastal' | 'oasis';
  resourceYardKind: string;
  populationPlan: {
    guardCount: number;
    workerRoles: NpcRole[];
    hasTrader: boolean;
    traderIsTraveling: boolean;
    villagerCount: number;
    questCount: number;
  };
  validation: {
    centerHeight: number;
    minClearance: number;
    relief: number;
    maxSlope: number;
  };
}

export interface ProceduralGenerationReport {
  villages: ProceduralVillageBlueprint[];
  attempts: number;
  rejectedCount: number;
  waterViolations: number;
}

function createPrng(seed: number): () => number {
  let a = (seed ^ 0x9e3779b9) >>> 0 || 1337;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface VillageNamePair {
  en: string;
  ar: string;
}

const NAME_POOLS: Record<ProceduralVillageArchetype, VillageNamePair[]> = {
  plains: [
    { en: 'Meadowbrook', ar: 'جدول المروج' },
    { en: 'Cloverfield', ar: 'حقل البرسيم' },
    { en: 'Sunmeadow', ar: 'مرج الشمس' },
    { en: 'Breezedale', ar: 'وادي النسيم' },
    { en: 'Wheatstead', ar: 'ضيعة القمح' },
    { en: 'Amberplains', ar: 'سهول العنبر' },
  ],
  valley: [
    { en: 'Mossvale', ar: 'وادي الطحلب' },
    { en: 'Fernhollow', ar: 'جوف السرخس' },
    { en: 'Willowvale', ar: 'وادي الصفصاف' },
    { en: 'Dewbasin', ar: 'حوض الندى' },
    { en: 'Quietvale', ar: 'الوادي الهادئ' },
  ],
  forest: [
    { en: 'Cedarcrest', ar: 'ذروة الأرز' },
    { en: 'Briarwood', ar: 'غابة العليق' },
    { en: 'Oakshade', ar: 'ظلال البلوط' },
    { en: 'Timberfall', ar: 'مسقط الأخشاب' },
    { en: 'Mossgrove', ar: 'بستان الطحلب' },
  ],
  mountain: [
    { en: 'Ironridge', ar: 'حافة الحديد' },
    { en: 'Stonehold', ar: 'معقل الحجر' },
    { en: 'Highcrag', ar: 'الجرف العالي' },
    { en: 'Frostfoot', ar: 'سفح الصقيع' },
    { en: 'Cobaltwatch', ar: 'مرصد الكوبالت' },
  ],
  desert: [
    { en: 'Sandstone Keep', ar: 'حصن الحجر الرملي' },
    { en: 'Dunehaven', ar: 'ملاذ الكثبان' },
    { en: 'Goldcrest', ar: 'قمة الذهب' },
    { en: 'Saffron Wells', ar: 'آبار الزعفران' },
    { en: 'Mirage Rest', ar: 'استراحة السراب' },
  ],
  oasis: [
    { en: 'Palmwell Oasis', ar: 'واحة بئر النخيل' },
    { en: 'Datebloom', ar: 'زهر التمر' },
    { en: 'Emerald Spring', ar: 'نبع الزمرد' },
    { en: 'Alkalil Oasis', ar: 'واحة القليل' },
  ],
  river: [
    { en: 'Clearwater', ar: 'المياه الصافية' },
    { en: 'Bridgehaven', ar: 'ملاذ الجسر' },
    { en: 'Alderbank', ar: 'ضفة النهر' },
    { en: 'Reedcrossing', ar: 'معبر القصب' },
    { en: 'Silverstream', ar: 'المجرى الفضي' },
  ],
  coastal: [
    { en: 'Baywatch', ar: 'مرصد الخليج' },
    { en: 'Gullcliff', ar: 'جرف النوارس' },
    { en: 'Tidecrest', ar: 'ذروة المد' },
    { en: 'Driftshore', ar: 'شاطئ الأخشاب' },
    { en: 'Shellharbor', ar: 'مرفأ الأصداف' },
  ],
};

const TARGET_ARCHETYPES: ProceduralVillageArchetype[] = [
  'plains',
  'plains',
  'plains',
  'plains',
  'plains',
  'valley',
  'valley',
  'valley',
  'valley',
  'forest',
  'forest',
  'forest',
  'forest',
  'mountain',
  'mountain',
  'mountain',
  'mountain',
  'desert',
  'desert',
  'desert',
  'oasis',
  'oasis',
  'river',
  'river',
  'river',
  'coastal',
  'coastal',
];

function archetypeToVillageKind(archetype: ProceduralVillageArchetype, rand: () => number): VillageKind {
  switch (archetype) {
    case 'plains':
      return rand() < 0.45 ? 'farming' : rand() < 0.8 ? 'plains' : 'trading';
    case 'valley':
      return 'valley';
    case 'forest':
      return 'forest';
    case 'mountain':
      return 'mountain';
    case 'desert':
      return 'desert';
    case 'oasis':
      return 'oasis';
    case 'river':
      return 'river';
    case 'coastal':
      return 'coastal';
  }
}

function buildExpectedFootprintPoints(cx: number, cz: number): Array<{ x: number; z: number; waterBuffer?: number }> {
  return [
    { x: cx - 15, z: cz - 8 },
    { x: cx + 15, z: cz - 8 },
    { x: cx - 12, z: cz + 16 },
    { x: cx + 12, z: cz + 16 },
    { x: cx, z: cz - 26, waterBuffer: BUILDING_WATER_BUFFER * 0.7 },
    { x: cx, z: cz + 26, waterBuffer: BUILDING_WATER_BUFFER * 0.7 },
    { x: cx - 26, z: cz, waterBuffer: BUILDING_WATER_BUFFER * 0.7 },
    { x: cx + 26, z: cz, waterBuffer: BUILDING_WATER_BUFFER * 0.7 },
    { x: cx + 20, z: cz + 7, waterBuffer: BUILDING_WATER_BUFFER * 0.75 }, // Farm / Resource yard
    { x: cx - 19, z: cz + 9, waterBuffer: BUILDING_WATER_BUFFER * 0.75 }, // Watchtower / Guard yard
    { x: cx + 17, z: cz - 15, waterBuffer: BUILDING_WATER_BUFFER * 0.75 }, // Barn / Forge / Shed
  ];
}

function sampleCandidatePointForArchetype(
  archetype: ProceduralVillageArchetype,
  rand: () => number,
  relaxedRegion: boolean,
): { x: number; z: number } {
  const maxR = PLAYABLE_RADIUS - 180;
  if (!relaxedRegion) {
    if (archetype === 'desert' || archetype === 'oasis') {
      if (archetype === 'oasis' && rand() < 0.6) {
        const ang = rand() * Math.PI * 2;
        const dist = 115 + rand() * 580;
        const tx = (rand() < 0.5 ? SUNSTONE_OASIS_X : EMERALD_BASIN_X) + Math.cos(ang) * dist;
        const tz = (rand() < 0.5 ? SUNSTONE_OASIS_Z : EMERALD_BASIN_Z) + Math.sin(ang) * dist;
        return { x: tx, z: tz };
      }
      return {
        x: 680 + rand() * (maxR - 720),
        z: -950 + rand() * 1950,
      };
    }

    if (archetype === 'mountain') {
      return {
        x: -2100 + rand() * 3900,
        z: -maxR + 120 + rand() * 2150,
      };
    }

    if (archetype === 'coastal') {
      const tx = (rand() - 0.5) * 4600;
      const coastZ = getCoastlineZAt(tx);
      const inlandOffset = 65 + rand() * 150;
      return { x: tx, z: coastZ - inlandOffset };
    }

    if (archetype === 'river') {
      const riverPick = rand();
      if (riverPick < 0.36) {
        const tz = -340 + rand() * 1120;
        const rx = getRiverCenterXAt(tz);
        const side = rand() < 0.5 ? -1 : 1;
        return { x: rx + side * (52 + rand() * 95), z: tz };
      } else if (riverPick < 0.7) {
        const tz = -1380 + rand() * 1980;
        const rx = getWestRiverCenterXAt(tz);
        const side = rand() < 0.5 ? -1 : 1;
        return { x: rx + side * (52 + rand() * 105), z: tz };
      } else {
        const tz = -1320 + rand() * 1950;
        const rx = getEastRiverCenterXAt(tz);
        const side = rand() < 0.5 ? -1 : 1;
        return { x: rx + side * (52 + rand() * 105), z: tz };
      }
    }

    if (archetype === 'forest') {
      return {
        x: -maxR + 140 + rand() * 2650,
        z: -2450 + rand() * 2950,
      };
    }

    if (archetype === 'valley') {
      const lakes = [
        { x: LAKE_CENTER_X, z: LAKE_CENTER_Z },
        { x: HIGHLAND_LAKE_X, z: HIGHLAND_LAKE_Z },
        { x: EMERALD_BASIN_X, z: EMERALD_BASIN_Z },
      ];
      if (rand() < 0.35) {
        const lk = lakes[Math.floor(rand() * lakes.length)];
        const ang = rand() * Math.PI * 2;
        const d = 140 + rand() * 480;
        return { x: lk.x + Math.cos(ang) * d, z: lk.z + Math.sin(ang) * d };
      }
      return {
        x: -2450 + rand() * 3800,
        z: -2250 + rand() * 2950,
      };
    }
  }

  // Uniform disk sampling across north/mid/east/west inland areas of the playable map
  const ang = rand() * Math.PI * 2;
  const rad = 260 + Math.sqrt(rand()) * (maxR - 280);
  return {
    x: Math.cos(ang) * rad,
    z: Math.sin(ang) * rad,
  };
}

function matchesArchetypeConstraints(
  archetype: ProceduralVillageArchetype,
  x: number,
  z: number,
  relaxed: boolean,
): boolean {
  const biome = getBiomeAt(x, z);
  const clearance = getHydrologyClearance(x, z);
  if (relaxed) {
    return biome !== 'Beach' || groundHeightAt(x, z) >= WATER_LEVEL + 2.5;
  }

  switch (archetype) {
    case 'desert':
      return biome === 'Desert';
    case 'oasis':
      return (
        (biome === 'Desert' || biome === 'Plains') &&
        (clearance < 420 || Math.hypot(x - SUNSTONE_OASIS_X, z - SUNSTONE_OASIS_Z) < 750 || Math.hypot(x - EMERALD_BASIN_X, z - EMERALD_BASIN_Z) < 620)
      );
    case 'mountain':
      return biome === 'Mountains' || groundHeightAt(x, z) >= 20;
    case 'forest':
      return biome === 'Forest';
    case 'river':
      return clearance >= 28 && clearance <= 190 && biome !== 'Mountains';
    case 'coastal': {
      const coastDist = getCoastlineZAt(x) - z;
      return coastDist >= 38 && coastDist <= 280 && biome !== 'Mountains';
    }
    case 'valley':
      return isValleyTerrain(x, z) || (biome === 'Plains' && groundHeightAt(x, z) <= 18);
    case 'plains':
      return biome === 'Plains';
  }
}

function pickResourceYardKind(archetype: ProceduralVillageArchetype, rand: () => number): string {
  switch (archetype) {
    case 'forest':
      return rand() < 0.65 ? 'wood' : 'berries';
    case 'mountain':
      return rand() < 0.5 ? 'iron-ore' : rand() < 0.85 ? 'coal' : 'gold-ore';
    case 'desert':
      return rand() < 0.55 ? 'sand' : 'cactus';
    case 'oasis':
      return rand() < 0.5 ? 'desert-plant' : 'fiber';
    case 'river':
      return rand() < 0.55 ? 'clay' : 'wood';
    case 'coastal':
      return rand() < 0.55 ? 'driftwood' : 'shell';
    case 'valley':
      return rand() < 0.5 ? 'wheat' : 'stone';
    case 'plains':
    default:
      return rand() < 0.55 ? 'wheat' : 'flower';
  }
}

function buildWorkerRoles(archetype: ProceduralVillageArchetype, rand: () => number): NpcRole[] {
  switch (archetype) {
    case 'forest':
      return ['woodcutter', 'hunter', rand() < 0.5 ? 'carpenter' : 'woodcutter'];
    case 'mountain':
      return ['miner', 'blacksmith', rand() < 0.5 ? 'miner' : 'hunter'];
    case 'river':
      return ['fisherman', 'farmer', 'woodcutter'];
    case 'coastal':
      return ['fisherman', 'carpenter', 'hunter'];
    case 'desert':
      return ['miner', 'hunter', 'farmer'];
    case 'oasis':
      return ['farmer', 'healer', 'carpenter'];
    case 'valley':
    case 'plains':
    default:
      return ['farmer', rand() < 0.5 ? 'farmer' : 'woodcutter', rand() < 0.5 ? 'blacksmith' : 'healer'];
  }
}

/**
 * Deterministically generates 27 additional dry-land procedural villages from `worldSeed`,
 * avoiding all existing settlements, water bodies, steep cliffs, and world boundaries.
 */
export function generateProceduralVillages(
  worldSeed: number,
  existingVillages: ReadonlyArray<{ centerX: number; centerZ: number; clearanceRadius?: number }>,
): ProceduralGenerationReport {
  const rand = createPrng(worldSeed + 7109);
  const telemetry = getWorldGenTelemetry();
  const placed: ProceduralVillageBlueprint[] = [];
  const usedNames = new Set<string>();
  const nameCounters: Record<string, number> = {};

  const occupancy: Array<{ centerX: number; centerZ: number; radius?: number }> =
    existingVillages.map((v) => ({
      centerX: v.centerX,
      centerZ: v.centerZ,
      radius: v.clearanceRadius ?? 42,
    }));

  // Deterministic shuffled queue of the 27 biome archetypes
  const queue = [...TARGET_ARCHETYPES];
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = queue[i];
    queue[i] = queue[j];
    queue[j] = tmp;
  }

  const pickName = (archetype: ProceduralVillageArchetype): VillageNamePair => {
    const pool = NAME_POOLS[archetype];
    const startIdx = Math.floor(rand() * pool.length);
    for (let offset = 0; offset < pool.length; offset++) {
      const candidate = pool[(startIdx + offset) % pool.length];
      if (!usedNames.has(candidate.en)) {
        usedNames.add(candidate.en);
        return candidate;
      }
    }
    const base = pool[startIdx];
    const num = (nameCounters[base.en] ?? 1) + 1;
    nameCounters[base.en] = num;
    const suffixesEn = ['North', 'East', 'Outpost', 'Cross', 'Hollow', 'Reach'];
    const suffixesAr = ['الشمالية', 'الشرقية', 'المتقدمة', 'المعبر', 'الوادي', 'الأفق'];
    const sIdx = (num - 2) % suffixesEn.length;
    const enName = `${base.en} ${suffixesEn[sIdx]}`;
    const arName = `${base.ar} ${suffixesAr[sIdx]}`;
    usedNames.add(enName);
    return { en: enName, ar: arName };
  };

  let attempts = 0;

  while (placed.length < PROCEDURAL_VILLAGE_COUNT && attempts < MAX_VILLAGE_ATTEMPTS) {
    attempts++;
    telemetry.totalVillageAttempts++;

    const slotIdx = placed.length;
    const targetArchetype = queue[slotIdx];
    const phaseTwo = attempts > 2000;
    const phaseThree = attempts > 3600;

    const candidate = sampleCandidatePointForArchetype(
      targetArchetype,
      rand,
      phaseTwo,
    );
    const cx = Math.round(candidate.x);
    const cz = Math.round(candidate.z);

    if (!phaseTwo && !matchesArchetypeConstraints(targetArchetype, cx, cz, false)) {
      recordRejectedVillageCandidate(cx, cz, 'biome_mismatch');
      continue;
    }

    // Derive actual archetype from terrain when falling back cleanly in Phase 2/3
    let resolvedArchetype = targetArchetype;
    if (phaseTwo) {
      const b = getBiomeAt(cx, cz);
      const cl = getHydrologyClearance(cx, cz);
      const coastD = getCoastlineZAt(cx) - cz;
      if (b === 'Desert') {
        resolvedArchetype = cl < 260 ? 'oasis' : 'desert';
      } else if (b === 'Mountains') {
        resolvedArchetype = 'mountain';
      } else if (b === 'Forest') {
        resolvedArchetype = cl <= 95 ? 'river' : 'forest';
      } else if (coastD <= 190) {
        resolvedArchetype = 'coastal';
      } else if (cl <= 95) {
        resolvedArchetype = 'river';
      } else if (isValleyTerrain(cx, cz)) {
        resolvedArchetype = 'valley';
      } else {
        resolvedArchetype = 'plains';
      }
    }

    const clearanceRadius =
      resolvedArchetype === 'plains' || resolvedArchetype === 'valley'
        ? 38 + Math.floor(rand() * 5)
        : 35 + Math.floor(rand() * 5);

    const maxSlope =
      resolvedArchetype === 'mountain'
        ? phaseThree ? 0.25 : 0.22
        : phaseThree ? 0.19 : 0.165;
    const maxRelief =
      resolvedArchetype === 'mountain'
        ? phaseThree ? 7.6 : 6.8
        : phaseThree ? 6.4 : 5.6;
    const waterBuffer =
      resolvedArchetype === 'coastal' || resolvedArchetype === 'river'
        ? Math.max(20, VILLAGE_WATER_BUFFER - 6)
        : VILLAGE_WATER_BUFFER;
    const minSpacing = phaseThree
      ? Math.max(330, MIN_VILLAGE_DISTANCE - 80)
      : MIN_VILLAGE_DISTANCE;

    const validation = validateVillageFootprint(cx, cz, {
      waterBuffer,
      footprintRadius: clearanceRadius,
      maxSlope,
      maxRelief,
      minElevation: WATER_LEVEL + 2.2,
      allowedBiomes:
        resolvedArchetype === 'coastal'
          ? ['Plains', 'Forest', 'Beach']
          : ['Plains', 'Forest', 'Mountains', 'Desert'],
      existingVillages: occupancy,
      minVillageSpacing: minSpacing,
      extraPoints: buildExpectedFootprintPoints(cx, cz),
    });

    if (!validation.valid) {
      recordRejectedVillageCandidate(cx, cz, validation.reason ?? 'water_footprint');
      continue;
    }

    const vSeed = ((worldSeed * 73856093) ^ ((slotIdx + 1) * 19349663)) >>> 0;
    const vRand = createPrng(vSeed);
    const kind = archetypeToVillageKind(resolvedArchetype, vRand);
    const names = pickName(resolvedArchetype);

    const guardCount = 2 + (vRand() < 0.45 ? 1 : 0);
    const villagerCount = 5 + Math.floor(vRand() * 6); // 5–10 villagers
    const hasTrader = vRand() < 0.72;
    const traderIsTraveling = hasTrader && vRand() < 0.35;
    const questCount = 3 + Math.floor(vRand() * 4); // 3–6 quests per village

    const bp: ProceduralVillageBlueprint = {
      id: `proc-${String(slotIdx + 1).padStart(2, '0')}`,
      index: slotIdx + 1,
      seed: vSeed,
      name: names.en,
      nameAr: names.ar,
      kind,
      archetype: resolvedArchetype,
      biome: getBiomeAt(cx, cz),
      centerX: cx,
      centerZ: cz,
      elevation: validation.centerElevation,
      clearanceRadius,
      houseCount: 3 + (vRand() < 0.5 ? 1 : 0),
      stallCount: hasTrader ? 2 : 1,
      hasForge: resolvedArchetype === 'mountain' || vRand() < 0.48,
      hasFarm:
        resolvedArchetype === 'plains' ||
        resolvedArchetype === 'valley' ||
        resolvedArchetype === 'oasis' ||
        vRand() < 0.5,
      hasWatchtower: guardCount >= 2 && (resolvedArchetype === 'mountain' || resolvedArchetype === 'coastal' || vRand() < 0.65),
      hasBarn: resolvedArchetype === 'plains' || resolvedArchetype === 'valley' || vRand() < 0.45,
      hasStorageShed: true,
      workYardKind:
        resolvedArchetype === 'mountain'
          ? 'mining'
          : resolvedArchetype === 'coastal'
            ? 'coastal'
            : resolvedArchetype === 'desert' || resolvedArchetype === 'oasis'
              ? 'oasis'
              : 'lumber',
      resourceYardKind: pickResourceYardKind(resolvedArchetype, vRand),
      populationPlan: {
        guardCount,
        workerRoles: buildWorkerRoles(resolvedArchetype, vRand),
        hasTrader,
        traderIsTraveling,
        villagerCount,
        questCount,
      },
      validation: {
        centerHeight: validation.centerElevation,
        minClearance: validation.minHydrologyClearance,
        relief: validation.relief,
        maxSlope: validation.maxSampleSlope,
      },
    };

    placed.push(bp);
    occupancy.push({ centerX: cx, centerZ: cz, radius: clearanceRadius });
  }

  return {
    villages: placed,
    attempts,
    rejectedCount: telemetry.rejectedVillageCount,
    waterViolations: telemetry.waterViolations,
  };
}
