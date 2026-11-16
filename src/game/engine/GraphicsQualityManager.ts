import type { WeatherQuality } from '../world/WeatherManager';

export type QualityPreset =
  | 'auto'
  | 'very-low'
  | 'low'
  | 'medium'
  | 'high'
  | 'ultra';

export type ConcreteQualityTier =
  | 'very-low'
  | 'low'
  | 'medium'
  | 'high'
  | 'ultra';

export type GraphicsMode = 'balanced' | 'performance' | 'quality';

export type SettingAutoOr<T extends string> = 'auto' | T;
export type RenderScaleSetting = 'auto' | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 | 1.0;
export type ViewDistanceTier = 'very-low' | 'low' | 'medium' | 'high' | 'ultra';
export type ShadowQualityTier = 'off' | 'low' | 'medium' | 'high';
export type TextureQualityTier = 'low' | 'medium' | 'high';
export type VegetationDensityTier = 'very-low' | 'low' | 'medium' | 'high' | 'ultra';
export type EffectsQualityTier = 'very-low' | 'low' | 'medium' | 'high';
export type WaterQualityTier = 'low' | 'medium' | 'high';
export type PostProcessingTier = 'off' | 'low' | 'medium' | 'high';
export type AntiAliasingMode = 'off' | 'fxaa' | 'msaa';
export type FpsLimitOption = 30 | 40 | 60 | 90 | 120 | 0;

export interface GraphicsSettings {
  preset: QualityPreset;
  graphicsMode: GraphicsMode;
  renderScale: RenderScaleSetting;
  viewDistance: SettingAutoOr<ViewDistanceTier>;
  shadowQuality: SettingAutoOr<ShadowQualityTier>;
  textureQuality: SettingAutoOr<TextureQualityTier>;
  vegetationDensity: SettingAutoOr<VegetationDensityTier>;
  effectsQuality: SettingAutoOr<EffectsQualityTier>;
  waterQuality: SettingAutoOr<WaterQualityTier>;
  postProcessing: SettingAutoOr<PostProcessingTier>;
  antiAliasing: SettingAutoOr<AntiAliasingMode>;
  fpsLimit: FpsLimitOption;
}

export interface HardwareCapabilityProfile {
  deviceClass: 'desktop' | 'mobile' | 'tablet';
  isMobileOrTablet: boolean;
  isSoftwareGl: boolean;
  gpuName: string;
  hardwareTier: 0 | 1 | 2 | 3; // 0 = software/very low, 1 = entry mobile/iGPU, 2 = mid, 3 = high-end
  logicalCores: number;
  deviceMemoryGb: number;
  maxTextureSize: number;
  maxAnisotropy: number;
  baseDpr: number;
  screenWidth: number;
  screenHeight: number;
}

export interface ResolvedGraphicsProfile {
  effectiveTier: ConcreteQualityTier;
  graphicsMode: GraphicsMode;
  deviceClass: 'desktop' | 'mobile' | 'tablet';
  renderScale: number;
  pixelRatio: number;

  // View distance & chunk streaming
  viewDistanceTier: ViewDistanceTier;
  chunkLoadRadius: number;
  chunkSimplifiedRadius: number;
  chunkUnloadRadius: number;
  maxChunkBuildsPerFrame: number;
  nearPropDist: number;
  farLodDist: number;
  grassDrawDist: number;
  terrainLodDist: number;
  cameraFar: number;

  // Shadows
  shadowQuality: ShadowQualityTier;
  shadowEnabled: boolean;
  shadowMapSize: number;
  shadowBounds: number;
  shadowBasicFilter: boolean;
  propShadows: boolean;
  entityShadowDist: number;

  // Textures & Shading
  textureQuality: TextureQualityTier;
  skyQuality: 0 | 1 | 2;
  starCount: number;
  fillLightEnabled: boolean;

  // Vegetation & World
  vegetationTier: VegetationDensityTier;
  vegetationScale: number; // 0.35..1.15
  waterQuality: WaterQualityTier;
  waterSegments: number;
  villageDrawDist: number;
  villageDetailDist: number;
  villageMaxLights: number;

  // Effects & Post-processing
  effectsQuality: EffectsQualityTier;
  weatherQuality: WeatherQuality;
  particleScale: number; // 0.25..1.0
  postProcessing: PostProcessingTier;
  bloomEnabled: boolean;
  antiAliasing: AntiAliasingMode;

  // AI & Simulation budgets
  npcDrawDist: number;
  npcMidDist: number;
  npcNameplateDist: number;
  npcFarPause: boolean;
  wildlifeNearDist: number;
  wildlifeMidDist: number;
  wildlifeMaxRigs: number;
  wildlifeFarPause: boolean;
  enemyDrawDist: number;
  enemyMidDist: number;

  // Target & limits
  fpsLimit: FpsLimitOption;
  dynamicTargetFps: number;
}

export interface DebugPerformanceSnapshot {
  fps: number;
  frameTimeMs: number;
  minFps: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  jsHeapMb: number | null;
  activeObjects: number;
  activeNpcs: number;
  activeAnimals: number;
  loadedChunks: number;
  activeChunks: number;
  renderScale: number;
  pixelRatio: number;
  effectiveTier: ConcreteQualityTier;
  preset: QualityPreset;
  graphicsMode: GraphicsMode;
  deviceClass: 'desktop' | 'mobile' | 'tablet';
  gpuName: string;
  fpsLimit: FpsLimitOption;
  dynamicLevelOffset: number;
  dynamicTargetFps: number;
}

export const GRAPHICS_STORAGE_KEY = 'woa_graphics_settings_v1';

export const DEFAULT_GRAPHICS_SETTINGS: GraphicsSettings = {
  preset: 'auto',
  graphicsMode: 'balanced',
  renderScale: 'auto',
  viewDistance: 'auto',
  shadowQuality: 'auto',
  textureQuality: 'auto',
  vegetationDensity: 'auto',
  effectsQuality: 'auto',
  waterQuality: 'auto',
  postProcessing: 'auto',
  antiAliasing: 'auto',
  fpsLimit: 60,
};

const TIER_ORDER: ConcreteQualityTier[] = [
  'very-low',
  'low',
  'medium',
  'high',
  'ultra',
];

function clampTierIndex(idx: number): number {
  return Math.max(0, Math.min(TIER_ORDER.length - 1, idx));
}

function shiftTier(tier: ConcreteQualityTier, delta: number): ConcreteQualityTier {
  const idx = TIER_ORDER.indexOf(tier);
  return TIER_ORDER[clampTierIndex((idx === -1 ? 2 : idx) + delta)];
}

export function loadGraphicsSettings(): GraphicsSettings {
  try {
    const raw = localStorage.getItem(GRAPHICS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GRAPHICS_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GraphicsSettings>;
    return {
      ...DEFAULT_GRAPHICS_SETTINGS,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_GRAPHICS_SETTINGS };
  }
}

export function saveGraphicsSettings(settings: GraphicsSettings): void {
  try {
    localStorage.setItem(GRAPHICS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

export function probeHardwareCapabilities(
  isTouchMode: boolean,
  isSoftwareGl: boolean,
  gpuName: string,
  maxTextureSize: number,
  maxAnisotropy: number,
): HardwareCapabilityProfile {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const h = typeof window !== 'undefined' ? window.innerHeight : 720;
  const minDim = Math.min(w, h);
  const maxDim = Math.max(w, h);
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  const hasTouch =
    isTouchMode ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
    (typeof window !== 'undefined' &&
      Boolean(window.matchMedia?.('(pointer: coarse)').matches));

  const deviceClass: 'desktop' | 'mobile' | 'tablet' = !hasTouch
    ? 'desktop'
    : minDim >= 600 && maxDim >= 900
      ? 'tablet'
      : 'mobile';

  const logicalCores =
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4;
  const deviceMemoryGb =
    typeof navigator !== 'undefined' &&
    typeof (navigator as unknown as { deviceMemory?: number }).deviceMemory === 'number'
      ? (navigator as unknown as { deviceMemory: number }).deviceMemory
      : deviceClass === 'desktop'
        ? 8
        : 4;

  let hardwareTier: 0 | 1 | 2 | 3 = 2;
  if (isSoftwareGl) {
    hardwareTier = 0;
  } else if (deviceClass === 'desktop') {
    const isDiscrete =
      /RTX|GTX|Radeon RX|Radeon Pro|Apple M[1-9]|Arc A|GeForce/i.test(gpuName);
    const isWeakIntegrated =
      /Intel.*UHD|Intel.*HD Graphics|Mali-4|Adreno 5|PowerVR/i.test(gpuName);
    if (isDiscrete && logicalCores >= 6) {
      hardwareTier = 3;
    } else if (isWeakIntegrated || logicalCores <= 2 || deviceMemoryGb <= 2) {
      hardwareTier = 1;
    } else {
      hardwareTier = 2;
    }
  } else {
    // Mobile or Tablet
    const highEndMobileGpu =
      /Apple GPU|Apple A1[4-9]|Apple M|Adreno \(TM\) 7|Adreno 7|Mali-G71|Mali-G78|Immortalis|Xclipse/i.test(
        gpuName,
      );
    const lowEndMobileGpu =
      /Adreno [345]|Mali-4|Mali-G5[0-2]|Mali-T|PowerVR GE|Vivante/i.test(gpuName);
    if (lowEndMobileGpu || logicalCores <= 4 || deviceMemoryGb <= 3) {
      hardwareTier = 1;
    } else if (highEndMobileGpu && logicalCores >= 6 && deviceMemoryGb >= 6) {
      hardwareTier = 2;
    } else {
      hardwareTier = 1;
    }
  }

  return {
    deviceClass,
    isMobileOrTablet: deviceClass !== 'desktop',
    isSoftwareGl,
    gpuName,
    hardwareTier,
    logicalCores,
    deviceMemoryGb,
    maxTextureSize,
    maxAnisotropy,
    baseDpr: dpr,
    screenWidth: w,
    screenHeight: h,
  };
}

interface TierSpec {
  renderScaleDesktop: number;
  renderScaleMobile: number;
  maxDprDesktop: number;
  maxDprMobile: number;
  viewDistanceTier: ViewDistanceTier;
  chunkLoadRadius: number;
  chunkSimplifiedRadius: number;
  chunkUnloadRadius: number;
  maxChunkBuildsPerFrame: number;
  nearPropDist: number;
  farLodDist: number;
  grassDrawDist: number;
  terrainLodDist: number;
  cameraFar: number;
  shadowQuality: ShadowQualityTier;
  propShadows: boolean;
  entityShadowDist: number;
  textureQuality: TextureQualityTier;
  skyQuality: 0 | 1 | 2;
  starCount: number;
  fillLightEnabled: boolean;
  vegetationTier: VegetationDensityTier;
  waterQuality: WaterQualityTier;
  waterSegments: number;
  villageDrawDist: number;
  villageDetailDist: number;
  villageMaxLights: number;
  effectsQuality: EffectsQualityTier;
  postProcessing: PostProcessingTier;
  antiAliasing: AntiAliasingMode;
  npcDrawDist: number;
  npcMidDist: number;
  npcNameplateDist: number;
  npcFarPause: boolean;
  wildlifeNearDist: number;
  wildlifeMidDist: number;
  wildlifeMaxRigs: number;
  wildlifeFarPause: boolean;
  enemyDrawDist: number;
  enemyMidDist: number;
}

const TIER_SPECS: Record<ConcreteQualityTier, TierSpec> = {
  'very-low': {
    renderScaleDesktop: 0.65,
    renderScaleMobile: 0.58,
    maxDprDesktop: 1.0,
    maxDprMobile: 1.0,
    viewDistanceTier: 'very-low',
    chunkLoadRadius: 1,
    chunkSimplifiedRadius: 2,
    chunkUnloadRadius: 3,
    maxChunkBuildsPerFrame: 1,
    nearPropDist: 95,
    farLodDist: 230,
    grassDrawDist: 58,
    terrainLodDist: 110,
    cameraFar: 420,
    shadowQuality: 'off',
    propShadows: false,
    entityShadowDist: 0,
    textureQuality: 'low',
    skyQuality: 0,
    starCount: 350,
    fillLightEnabled: false,
    vegetationTier: 'very-low',
    waterQuality: 'low',
    waterSegments: 24,
    villageDrawDist: 240,
    villageDetailDist: 115,
    villageMaxLights: 0,
    effectsQuality: 'very-low',
    postProcessing: 'off',
    antiAliasing: 'off',
    npcDrawDist: 75,
    npcMidDist: 28,
    npcNameplateDist: 18,
    npcFarPause: true,
    wildlifeNearDist: 42,
    wildlifeMidDist: 120,
    wildlifeMaxRigs: 10,
    wildlifeFarPause: true,
    enemyDrawDist: 78,
    enemyMidDist: 28,
  },
  low: {
    renderScaleDesktop: 0.85,
    renderScaleMobile: 0.72,
    maxDprDesktop: 1.25,
    maxDprMobile: 1.25,
    viewDistanceTier: 'low',
    chunkLoadRadius: 1,
    chunkSimplifiedRadius: 3,
    chunkUnloadRadius: 4,
    maxChunkBuildsPerFrame: 1,
    nearPropDist: 130,
    farLodDist: 310,
    grassDrawDist: 78,
    terrainLodDist: 145,
    cameraFar: 520,
    shadowQuality: 'low',
    propShadows: false,
    entityShadowDist: 28,
    textureQuality: 'low',
    skyQuality: 1,
    starCount: 700,
    fillLightEnabled: false,
    vegetationTier: 'low',
    waterQuality: 'low',
    waterSegments: 32,
    villageDrawDist: 310,
    villageDetailDist: 155,
    villageMaxLights: 2,
    effectsQuality: 'low',
    postProcessing: 'off',
    antiAliasing: 'fxaa',
    npcDrawDist: 95,
    npcMidDist: 34,
    npcNameplateDist: 21,
    npcFarPause: true,
    wildlifeNearDist: 54,
    wildlifeMidDist: 165,
    wildlifeMaxRigs: 16,
    wildlifeFarPause: true,
    enemyDrawDist: 96,
    enemyMidDist: 34,
  },
  medium: {
    renderScaleDesktop: 1.0,
    renderScaleMobile: 0.82,
    maxDprDesktop: 1.5,
    maxDprMobile: 1.35,
    viewDistanceTier: 'medium',
    chunkLoadRadius: 2,
    chunkSimplifiedRadius: 3,
    chunkUnloadRadius: 4,
    maxChunkBuildsPerFrame: 1,
    nearPropDist: 165,
    farLodDist: 400,
    grassDrawDist: 102,
    terrainLodDist: 175,
    cameraFar: 640,
    shadowQuality: 'medium',
    propShadows: true,
    entityShadowDist: 42,
    textureQuality: 'medium',
    skyQuality: 2,
    starCount: 1100,
    fillLightEnabled: true,
    vegetationTier: 'medium',
    waterQuality: 'medium',
    waterSegments: 48,
    villageDrawDist: 390,
    villageDetailDist: 210,
    villageMaxLights: 4,
    effectsQuality: 'medium',
    postProcessing: 'medium',
    antiAliasing: 'fxaa',
    npcDrawDist: 120,
    npcMidDist: 46,
    npcNameplateDist: 24,
    npcFarPause: false,
    wildlifeNearDist: 68,
    wildlifeMidDist: 205,
    wildlifeMaxRigs: 24,
    wildlifeFarPause: false,
    enemyDrawDist: 118,
    enemyMidDist: 44,
  },
  high: {
    renderScaleDesktop: 1.0,
    renderScaleMobile: 0.92,
    maxDprDesktop: 1.6,
    maxDprMobile: 1.5,
    viewDistanceTier: 'high',
    chunkLoadRadius: 2,
    chunkSimplifiedRadius: 4,
    chunkUnloadRadius: 5,
    maxChunkBuildsPerFrame: 1,
    nearPropDist: 195,
    farLodDist: 460,
    grassDrawDist: 122,
    terrainLodDist: 200,
    cameraFar: 740,
    shadowQuality: 'high',
    propShadows: true,
    entityShadowDist: 52,
    textureQuality: 'high',
    skyQuality: 2,
    starCount: 1500,
    fillLightEnabled: true,
    vegetationTier: 'high',
    waterQuality: 'high',
    waterSegments: 64,
    villageDrawDist: 460,
    villageDetailDist: 250,
    villageMaxLights: 6,
    effectsQuality: 'high',
    postProcessing: 'high',
    antiAliasing: 'msaa',
    npcDrawDist: 140,
    npcMidDist: 55,
    npcNameplateDist: 25,
    npcFarPause: false,
    wildlifeNearDist: 80,
    wildlifeMidDist: 240,
    wildlifeMaxRigs: 34,
    wildlifeFarPause: false,
    enemyDrawDist: 135,
    enemyMidDist: 52,
  },
  ultra: {
    renderScaleDesktop: 1.0,
    renderScaleMobile: 1.0,
    maxDprDesktop: 2.0,
    maxDprMobile: 1.75,
    viewDistanceTier: 'ultra',
    chunkLoadRadius: 3,
    chunkSimplifiedRadius: 5,
    chunkUnloadRadius: 6,
    maxChunkBuildsPerFrame: 2,
    nearPropDist: 235,
    farLodDist: 540,
    grassDrawDist: 145,
    terrainLodDist: 230,
    cameraFar: 860,
    shadowQuality: 'high',
    propShadows: true,
    entityShadowDist: 64,
    textureQuality: 'high',
    skyQuality: 2,
    starCount: 1800,
    fillLightEnabled: true,
    vegetationTier: 'ultra',
    waterQuality: 'high',
    waterSegments: 72,
    villageDrawDist: 520,
    villageDetailDist: 290,
    villageMaxLights: 8,
    effectsQuality: 'high',
    postProcessing: 'high',
    antiAliasing: 'msaa',
    npcDrawDist: 165,
    npcMidDist: 64,
    npcNameplateDist: 28,
    npcFarPause: false,
    wildlifeNearDist: 92,
    wildlifeMidDist: 270,
    wildlifeMaxRigs: 42,
    wildlifeFarPause: false,
    enemyDrawDist: 155,
    enemyMidDist: 60,
  },
};

const VEGETATION_SCALE_MAP: Record<VegetationDensityTier, number> = {
  'very-low': 0.35,
  low: 0.55,
  medium: 0.78,
  high: 1.0,
  ultra: 1.18,
};

const SHADOW_SPEC_MAP: Record<
  ShadowQualityTier,
  { enabled: boolean; mapSize: number; bounds: number; basic: boolean }
> = {
  off: { enabled: false, mapSize: 0, bounds: 36, basic: true },
  low: { enabled: true, mapSize: 512, bounds: 34, basic: true },
  medium: { enabled: true, mapSize: 1024, bounds: 40, basic: false },
  high: { enabled: true, mapSize: 1536, bounds: 44, basic: false },
};

const EFFECTS_PARTICLE_SCALE: Record<
  EffectsQualityTier,
  { weather: WeatherQuality; scale: number }
> = {
  'very-low': { weather: 'low', scale: 0.3 },
  low: { weather: 'low', scale: 0.55 },
  medium: { weather: 'medium', scale: 0.8 },
  high: { weather: 'high', scale: 1.0 },
};

const VIEW_DIST_OVERRIDES: Record<
  ViewDistanceTier,
  {
    chunkLoadRadius: number;
    chunkSimplifiedRadius: number;
    chunkUnloadRadius: number;
    nearPropDist: number;
    farLodDist: number;
    grassDrawDist: number;
    terrainLodDist: number;
    cameraFar: number;
    villageDrawDist: number;
    villageDetailDist: number;
  }
> = {
  'very-low': {
    chunkLoadRadius: 1,
    chunkSimplifiedRadius: 2,
    chunkUnloadRadius: 3,
    nearPropDist: 95,
    farLodDist: 230,
    grassDrawDist: 58,
    terrainLodDist: 110,
    cameraFar: 420,
    villageDrawDist: 240,
    villageDetailDist: 115,
  },
  low: {
    chunkLoadRadius: 1,
    chunkSimplifiedRadius: 3,
    chunkUnloadRadius: 4,
    nearPropDist: 130,
    farLodDist: 310,
    grassDrawDist: 78,
    terrainLodDist: 145,
    cameraFar: 520,
    villageDrawDist: 310,
    villageDetailDist: 155,
  },
  medium: {
    chunkLoadRadius: 2,
    chunkSimplifiedRadius: 3,
    chunkUnloadRadius: 4,
    nearPropDist: 165,
    farLodDist: 400,
    grassDrawDist: 102,
    terrainLodDist: 175,
    cameraFar: 640,
    villageDrawDist: 390,
    villageDetailDist: 210,
  },
  high: {
    chunkLoadRadius: 2,
    chunkSimplifiedRadius: 4,
    chunkUnloadRadius: 5,
    nearPropDist: 195,
    farLodDist: 460,
    grassDrawDist: 122,
    terrainLodDist: 200,
    cameraFar: 740,
    villageDrawDist: 460,
    villageDetailDist: 250,
  },
  ultra: {
    chunkLoadRadius: 3,
    chunkSimplifiedRadius: 5,
    chunkUnloadRadius: 6,
    nearPropDist: 235,
    farLodDist: 540,
    grassDrawDist: 145,
    terrainLodDist: 230,
    cameraFar: 860,
    villageDrawDist: 520,
    villageDetailDist: 290,
  },
};

export class GraphicsQualityManager {
  private settings: GraphicsSettings;
  private hardware: HardwareCapabilityProfile;
  private dynamicLevelOffset = 0; // 0 = baseline, negative = stepped down due to low FPS
  private dynamicRenderScaleBias = 0; // additional fine render-scale reduction when needed
  private lowFpsTimer = 0;
  private stableFpsTimer = 0;
  private lastAdaptationTime = -100;
  private autoAdjustCount = 0;
  private dynamicQualityEnabled = true;
  private currentProfile: ResolvedGraphicsProfile;

  constructor(
    hardware: HardwareCapabilityProfile,
    initialSettings?: GraphicsSettings,
  ) {
    this.hardware = hardware;
    this.settings = initialSettings
      ? { ...DEFAULT_GRAPHICS_SETTINGS, ...initialSettings }
      : loadGraphicsSettings();
    this.currentProfile = this.computeProfile();
  }

  public setDynamicQualityEnabled(enabled: boolean): void {
    this.dynamicQualityEnabled = enabled;
    if (!enabled) {
      this.dynamicLevelOffset = 0;
      this.dynamicRenderScaleBias = 0;
      this.currentProfile = this.computeProfile();
    }
  }

  public isDynamicQualityEnabled(): boolean {
    return this.dynamicQualityEnabled;
  }

  public getSettings(): GraphicsSettings {
    return { ...this.settings };
  }

  public getHardware(): HardwareCapabilityProfile {
    return this.hardware;
  }

  public getProfile(): ResolvedGraphicsProfile {
    return this.currentProfile;
  }

  public getDynamicLevelOffset(): number {
    return this.dynamicLevelOffset;
  }

  public getAutoAdjustCount(): number {
    return this.autoAdjustCount;
  }

  public updateHardwareTouchFlag(isTouchMode: boolean): boolean {
    if (this.hardware.isMobileOrTablet === isTouchMode) return false;
    this.hardware = probeHardwareCapabilities(
      isTouchMode,
      this.hardware.isSoftwareGl,
      this.hardware.gpuName,
      this.hardware.maxTextureSize,
      this.hardware.maxAnisotropy,
    );
    this.currentProfile = this.computeProfile();
    return true;
  }

  public updateSettings(partial: Partial<GraphicsSettings>): {
    changed: boolean;
    texturesChanged: boolean;
    vegetationChanged: boolean;
    shadowMapSizeChanged: boolean;
    waterGeometryChanged: boolean;
    profile: ResolvedGraphicsProfile;
  } {
    const prev = this.currentProfile;
    const prevSettings = this.settings;
    this.settings = { ...this.settings, ...partial };

    // Reset dynamic bias when user explicitly changes preset or mode
    if (
      (partial.preset !== undefined && partial.preset !== prevSettings.preset) ||
      (partial.graphicsMode !== undefined &&
        partial.graphicsMode !== prevSettings.graphicsMode)
    ) {
      this.dynamicLevelOffset = 0;
      this.dynamicRenderScaleBias = 0;
      this.lowFpsTimer = 0;
      this.stableFpsTimer = 0;
    }

    saveGraphicsSettings(this.settings);
    const next = this.computeProfile();
    this.currentProfile = next;

    return {
      changed: true,
      texturesChanged: prev.textureQuality !== next.textureQuality,
      vegetationChanged:
        Math.abs(prev.vegetationScale - next.vegetationScale) > 0.01,
      shadowMapSizeChanged:
        prev.shadowMapSize !== next.shadowMapSize ||
        prev.shadowBasicFilter !== next.shadowBasicFilter ||
        prev.shadowEnabled !== next.shadowEnabled,
      waterGeometryChanged: prev.waterSegments !== next.waterSegments,
      profile: next,
    };
  }

  public resetToAuto(): ResolvedGraphicsProfile {
    this.settings = { ...DEFAULT_GRAPHICS_SETTINGS };
    this.dynamicLevelOffset = 0;
    this.dynamicRenderScaleBias = 0;
    this.lowFpsTimer = 0;
    this.stableFpsTimer = 0;
    saveGraphicsSettings(this.settings);
    this.currentProfile = this.computeProfile();
    return this.currentProfile;
  }

  /**
   * Evaluates rolling FPS and smoothly adapts quality with hysteresis & cooldowns
   * so performance remains responsive without frame-to-frame oscillation.
   */
  public evaluateDynamicFps(
    dt: number,
    elapsed: number,
    smoothedFps: number,
    hasWarmSamples: boolean,
  ): {
    adapted: boolean;
    texturesChanged: boolean;
    vegetationChanged: boolean;
    shadowMapSizeChanged: boolean;
    profile: ResolvedGraphicsProfile;
  } {
    const noOp = {
      adapted: false,
      texturesChanged: false,
      vegetationChanged: false,
      shadowMapSizeChanged: false,
      profile: this.currentProfile,
    };

    if (!hasWarmSamples || this.hardware.isSoftwareGl || !this.dynamicQualityEnabled) {
      return noOp;
    }
    const isDynamicEligible =
      this.settings.preset === 'auto' ||
      this.settings.graphicsMode === 'performance';
    if (!isDynamicEligible) return noOp;

    const target = this.currentProfile.dynamicTargetFps;
    const lowThreshold = target * 0.78;
    const highThreshold = target * 0.94;

    if (smoothedFps < lowThreshold) {
      this.lowFpsTimer += dt;
      this.stableFpsTimer = Math.max(0, this.stableFpsTimer - dt * 1.5);
    } else if (smoothedFps >= highThreshold) {
      this.stableFpsTimer += dt;
      this.lowFpsTimer = Math.max(0, this.lowFpsTimer - dt * 2.0);
    } else {
      // Deadband: gently decay both timers
      this.lowFpsTimer = Math.max(0, this.lowFpsTimer - dt * 0.5);
      this.stableFpsTimer = Math.max(0, this.stableFpsTimer - dt * 0.5);
    }

    const sinceLast = elapsed - this.lastAdaptationTime;
    const prev = this.currentProfile;

    // Step down after >= 4.0s sustained low FPS & >= 4.5s cooldown
    if (this.lowFpsTimer >= 4.0 && sinceLast >= 4.5) {
      const baseTierIdx = TIER_ORDER.indexOf(this.resolveBaseTier());
      if (baseTierIdx + this.dynamicLevelOffset > 0) {
        this.dynamicLevelOffset--;
        this.lowFpsTimer = 0;
        this.stableFpsTimer = 0;
        this.lastAdaptationTime = elapsed;
        this.autoAdjustCount++;
        const next = this.computeProfile();
        this.currentProfile = next;
        return {
          adapted: true,
          texturesChanged: prev.textureQuality !== next.textureQuality,
          vegetationChanged:
            Math.abs(prev.vegetationScale - next.vegetationScale) > 0.01,
          shadowMapSizeChanged:
            prev.shadowMapSize !== next.shadowMapSize ||
            prev.shadowEnabled !== next.shadowEnabled,
          profile: next,
        };
      } else if (this.dynamicRenderScaleBias > -0.15) {
        this.dynamicRenderScaleBias = Math.max(
          -0.15,
          this.dynamicRenderScaleBias - 0.08,
        );
        this.lowFpsTimer = 0;
        this.stableFpsTimer = 0;
        this.lastAdaptationTime = elapsed;
        this.autoAdjustCount++;
        const next = this.computeProfile();
        this.currentProfile = next;
        return {
          adapted: true,
          texturesChanged: false,
          vegetationChanged: false,
          shadowMapSizeChanged: false,
          profile: next,
        };
      }
    }

    // Restore gradually after >= 8.5s sustained stable FPS & >= 8.5s cooldown
    if (
      this.stableFpsTimer >= 8.5 &&
      sinceLast >= 8.5 &&
      (this.dynamicLevelOffset < 0 || this.dynamicRenderScaleBias < 0)
    ) {
      if (this.dynamicRenderScaleBias < 0) {
        this.dynamicRenderScaleBias = Math.min(
          0,
          this.dynamicRenderScaleBias + 0.08,
        );
      } else if (this.dynamicLevelOffset < 0) {
        this.dynamicLevelOffset++;
      }
      this.lowFpsTimer = 0;
      this.stableFpsTimer = 0;
      this.lastAdaptationTime = elapsed;
      this.autoAdjustCount++;
      const next = this.computeProfile();
      this.currentProfile = next;
      return {
        adapted: true,
        texturesChanged: prev.textureQuality !== next.textureQuality,
        vegetationChanged:
          Math.abs(prev.vegetationScale - next.vegetationScale) > 0.01,
        shadowMapSizeChanged:
          prev.shadowMapSize !== next.shadowMapSize ||
          prev.shadowEnabled !== next.shadowEnabled,
        profile: next,
      };
    }

    return noOp;
  }

  private resolveBaseTier(): ConcreteQualityTier {
    if (this.hardware.isSoftwareGl) {
      return this.settings.preset === 'auto' ? 'very-low' : this.settings.preset;
    }

    let tier: ConcreteQualityTier;
    if (this.settings.preset === 'auto') {
      if (this.hardware.deviceClass === 'desktop') {
        tier =
          this.hardware.hardwareTier >= 3
            ? 'high'
            : this.hardware.hardwareTier === 2
              ? 'high'
              : 'medium';
      } else {
        // Mobile or Tablet baseline
        tier =
          this.hardware.hardwareTier >= 2
            ? 'medium'
            : this.hardware.hardwareTier === 1
              ? 'low'
              : 'very-low';
      }
    } else {
      tier = this.settings.preset;
    }

    // Apply Graphics Mode bias when preset is Auto (or gently shift mode)
    if (this.settings.preset === 'auto') {
      if (this.settings.graphicsMode === 'performance') {
        tier = shiftTier(tier, -1);
      } else if (this.settings.graphicsMode === 'quality') {
        tier = shiftTier(tier, +1);
      }
    }

    return tier;
  }

  private computeProfile(): ResolvedGraphicsProfile {
    const baseTier = this.resolveBaseTier();
    const effectiveTier = shiftTier(baseTier, this.dynamicLevelOffset);
    const spec = TIER_SPECS[effectiveTier];

    const isMobile = this.hardware.isMobileOrTablet;
    const mode = this.settings.graphicsMode;

    // 1. Render scale & pixel ratio
    let baseScale = isMobile ? spec.renderScaleMobile : spec.renderScaleDesktop;
    if (this.settings.renderScale === 'auto') {
      if (mode === 'performance') baseScale = Math.max(0.55, baseScale - 0.1);
      else if (mode === 'quality') baseScale = Math.min(1.0, baseScale + 0.08);
      baseScale = Math.max(0.5, Math.min(1.0, baseScale + this.dynamicRenderScaleBias));
    } else {
      baseScale = this.settings.renderScale;
    }

    const maxDpr = isMobile ? spec.maxDprMobile : spec.maxDprDesktop;
    const clampedDeviceDpr = this.hardware.isSoftwareGl
      ? 1.0
      : Math.min(this.hardware.baseDpr, maxDpr);
    const pixelRatio = this.hardware.isSoftwareGl
      ? 1.0
      : Math.max(0.5, Math.min(2.0, clampedDeviceDpr * baseScale));

    // 2. View Distance
    const viewDistanceTier: ViewDistanceTier =
      this.settings.viewDistance === 'auto'
        ? spec.viewDistanceTier
        : this.settings.viewDistance;
    const vd = VIEW_DIST_OVERRIDES[viewDistanceTier];

    // 3. Shadows
    let shadowQuality: ShadowQualityTier =
      this.settings.shadowQuality === 'auto'
        ? spec.shadowQuality
        : this.settings.shadowQuality;
    if (this.hardware.isSoftwareGl && this.settings.shadowQuality === 'auto') {
      shadowQuality = 'off';
    } else if (
      this.settings.shadowQuality === 'auto' &&
      mode === 'performance' &&
      shadowQuality === 'high'
    ) {
      shadowQuality = 'medium';
    }
    const shadowSpec = SHADOW_SPEC_MAP[shadowQuality];

    // 4. Textures
    const textureQuality: TextureQualityTier =
      this.settings.textureQuality === 'auto'
        ? spec.textureQuality
        : this.settings.textureQuality;

    // 5. Vegetation
    const vegetationTier: VegetationDensityTier =
      this.settings.vegetationDensity === 'auto'
        ? spec.vegetationTier
        : this.settings.vegetationDensity;
    const vegetationScale = VEGETATION_SCALE_MAP[vegetationTier];

    // 6. Effects
    const effectsQuality: EffectsQualityTier =
      this.settings.effectsQuality === 'auto'
        ? spec.effectsQuality
        : this.settings.effectsQuality;
    const fxSpec = EFFECTS_PARTICLE_SCALE[effectsQuality];

    // 7. Water
    let waterQuality: WaterQualityTier =
      this.settings.waterQuality === 'auto'
        ? spec.waterQuality
        : this.settings.waterQuality;
    if (
      this.settings.waterQuality === 'auto' &&
      mode === 'performance' &&
      waterQuality === 'high'
    ) {
      waterQuality = 'medium';
    }

    // 8. Post-Processing & AA
    let postProcessing: PostProcessingTier =
      this.settings.postProcessing === 'auto'
        ? spec.postProcessing
        : this.settings.postProcessing;
    if (this.hardware.isSoftwareGl && this.settings.postProcessing === 'auto') {
      postProcessing = 'off';
    }

    let antiAliasing: AntiAliasingMode =
      this.settings.antiAliasing === 'auto'
        ? spec.antiAliasing
        : this.settings.antiAliasing;
    if (isMobile && this.settings.antiAliasing === 'auto' && antiAliasing === 'msaa') {
      antiAliasing = 'fxaa';
    }

    // 9. Dynamic FPS target
    const limit = this.settings.fpsLimit;
    let baseTarget = isMobile
      ? mode === 'quality'
        ? 30
        : mode === 'performance'
          ? 50
          : this.hardware.hardwareTier >= 2
            ? 45
            : 30
      : mode === 'quality'
        ? 45
        : 56;
    if (limit > 0) {
      baseTarget = Math.min(baseTarget, limit);
    }

    return {
      effectiveTier,
      graphicsMode: mode,
      deviceClass: this.hardware.deviceClass,
      renderScale: Math.round(baseScale * 100) / 100,
      pixelRatio,

      viewDistanceTier,
      chunkLoadRadius: vd.chunkLoadRadius,
      chunkSimplifiedRadius: vd.chunkSimplifiedRadius,
      chunkUnloadRadius: vd.chunkUnloadRadius,
      maxChunkBuildsPerFrame: spec.maxChunkBuildsPerFrame,
      nearPropDist: vd.nearPropDist,
      farLodDist: vd.farLodDist,
      grassDrawDist: vd.grassDrawDist,
      terrainLodDist: vd.terrainLodDist,
      cameraFar: vd.cameraFar,

      shadowQuality,
      shadowEnabled: shadowSpec.enabled,
      shadowMapSize: shadowSpec.mapSize,
      shadowBounds: shadowSpec.bounds,
      shadowBasicFilter: shadowSpec.basic,
      propShadows: shadowSpec.enabled && spec.propShadows,
      entityShadowDist: shadowSpec.enabled ? spec.entityShadowDist : 0,

      textureQuality,
      skyQuality: spec.skyQuality,
      starCount: spec.starCount,
      fillLightEnabled: spec.fillLightEnabled,

      vegetationTier,
      vegetationScale,
      waterQuality,
      waterSegments: spec.waterSegments,
      villageDrawDist: vd.villageDrawDist,
      villageDetailDist: vd.villageDetailDist,
      villageMaxLights: isMobile
        ? Math.min(spec.villageMaxLights, 3)
        : spec.villageMaxLights,

      effectsQuality,
      weatherQuality: fxSpec.weather,
      particleScale: fxSpec.scale,
      postProcessing,
      bloomEnabled: postProcessing !== 'off',
      antiAliasing,

      npcDrawDist: spec.npcDrawDist,
      npcMidDist: spec.npcMidDist,
      npcNameplateDist: spec.npcNameplateDist,
      npcFarPause: spec.npcFarPause,
      wildlifeNearDist: spec.wildlifeNearDist,
      wildlifeMidDist: spec.wildlifeMidDist,
      wildlifeMaxRigs: spec.wildlifeMaxRigs,
      wildlifeFarPause: spec.wildlifeFarPause,
      enemyDrawDist: spec.enemyDrawDist,
      enemyMidDist: spec.enemyMidDist,

      fpsLimit: limit,
      dynamicTargetFps: baseTarget,
    };
  }
}
