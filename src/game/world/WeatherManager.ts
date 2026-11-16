import type { Language } from '../i18n/translations';
import type { SavedWeatherState } from '../save/saveTypes';
import type { BiomeType } from '../types';

export type WeatherState = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog';

export type WeatherQuality = 'low' | 'medium' | 'high';

export const MIN_WEATHER_DURATION_SECONDS = 120; // 2 minutes
export const MAX_WEATHER_DURATION_SECONDS = 900; // 15 real-time minutes hard cap

export const BIOME_ALLOWED_WEATHERS: Record<BiomeType, readonly WeatherState[]> = {
  Desert: ['clear', 'cloudy'],
  Forest: ['clear', 'cloudy', 'rain', 'storm'],
  Plains: ['clear', 'cloudy', 'rain', 'fog'],
  Mountains: ['clear', 'cloudy', 'rain', 'storm', 'fog'],
  Beach: ['clear', 'cloudy', 'rain', 'fog'],
};

export interface WeatherAtmosphereParams {
  cloudCoverage: number;      // 0..1
  cloudDarkness: number;      // 0..1
  rainIntensity: number;      // 0..1
  fogMultiplier: number;      // 1 = baseline time-of-day fog
  fogMistTint: number;        // 0..1 blend toward mist/overcast horizon
  lightAttenuation: number;   // 0..1 multiplier on direct sun/moon intensity
  ambientBoost: number;       // slight ambient fill balance under overcast/fog
  windStrength: number;       // 0..1
  lightningRate: number;      // strikes per minute when active
}

export interface WeatherSnapshot {
  currentState: WeatherState;
  targetState: WeatherState;
  transitionProgress: number; // 0..1 (1 = settled)
  dynamicEnabled: boolean;
  transitionDurationSeconds: number;
  quality: WeatherQuality;
  windAngleRad: number;
  windSpeedKmh: number;
  lightningFlash: number;     // 0..1 current flash envelope
  weatherStartTime: number;
  weatherDuration: number;
  weatherRemainingTime: number;
  atmosphere: WeatherAtmosphereParams;
}

export interface WeatherConfig {
  initialWeather?: WeatherState;
  dynamicEnabled?: boolean;
  minStateDurationSeconds?: number;
  maxStateDurationSeconds?: number;
  transitionDurationSeconds?: number;
  quality?: WeatherQuality;
  seed?: number;
}

export interface LightningStrikeEvent {
  intensity: number;          // 0.6..1.0
  distanceMeters: number;     // ~180..950m (determines thunder delay)
  thunderDelaySeconds: number;
  azimuthRad: number;
}

export const WEATHER_STATES: WeatherState[] = [
  'clear',
  'cloudy',
  'rain',
  'storm',
  'fog',
];

export const WEATHER_LABELS: Record<Language, Record<WeatherState, string>> = {
  en: {
    clear: 'Clear',
    cloudy: 'Cloudy',
    rain: 'Rain',
    storm: 'Storm',
    fog: 'Fog',
  },
  ar: {
    clear: 'صافٍ',
    cloudy: 'غائم',
    rain: 'ممطر',
    storm: 'عاصفة',
    fog: 'ضباب',
  },
};

const WEATHER_PROFILES: Record<WeatherState, WeatherAtmosphereParams> = {
  clear: {
    cloudCoverage: 0.22,
    cloudDarkness: 0.05,
    rainIntensity: 0.0,
    fogMultiplier: 1.0,
    fogMistTint: 0.0,
    lightAttenuation: 1.0,
    ambientBoost: 1.0,
    windStrength: 0.16,
    lightningRate: 0.0,
  },
  cloudy: {
    cloudCoverage: 0.72,
    cloudDarkness: 0.34,
    rainIntensity: 0.0,
    fogMultiplier: 1.38,
    fogMistTint: 0.32,
    lightAttenuation: 0.62,
    ambientBoost: 1.06,
    windStrength: 0.36,
    lightningRate: 0.0,
  },
  rain: {
    cloudCoverage: 0.88,
    cloudDarkness: 0.58,
    rainIntensity: 0.68,
    fogMultiplier: 2.15,
    fogMistTint: 0.54,
    lightAttenuation: 0.38,
    ambientBoost: 0.96,
    windStrength: 0.58,
    lightningRate: 0.0,
  },
  storm: {
    cloudCoverage: 0.98,
    cloudDarkness: 0.84,
    rainIntensity: 1.0,
    fogMultiplier: 2.85,
    fogMistTint: 0.72,
    lightAttenuation: 0.24,
    ambientBoost: 0.82,
    windStrength: 0.94,
    lightningRate: 7.5,
  },
  fog: {
    cloudCoverage: 0.65,
    cloudDarkness: 0.26,
    rainIntensity: 0.0,
    fogMultiplier: 5.4,
    fogMistTint: 0.76,
    lightAttenuation: 0.48,
    ambientBoost: 1.1,
    windStrength: 0.14,
    lightningRate: 0.0,
  },
};

// Natural weighted Markov transitions between weather states
const WEATHER_TRANSITIONS: Record<
  WeatherState,
  Array<{ state: WeatherState; weight: number }>
> = {
  clear: [
    { state: 'cloudy', weight: 0.56 },
    { state: 'fog', weight: 0.24 },
    { state: 'rain', weight: 0.2 },
  ],
  cloudy: [
    { state: 'clear', weight: 0.34 },
    { state: 'rain', weight: 0.4 },
    { state: 'fog', weight: 0.16 },
    { state: 'storm', weight: 0.1 },
  ],
  rain: [
    { state: 'cloudy', weight: 0.42 },
    { state: 'storm', weight: 0.34 },
    { state: 'fog', weight: 0.14 },
    { state: 'clear', weight: 0.1 },
  ],
  storm: [
    { state: 'rain', weight: 0.62 },
    { state: 'cloudy', weight: 0.3 },
    { state: 'fog', weight: 0.08 },
  ],
  fog: [
    { state: 'clear', weight: 0.45 },
    { state: 'cloudy', weight: 0.38 },
    { state: 'rain', weight: 0.17 },
  ],
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

interface PendingThunder {
  delayRemaining: number;
  intensity: number;
  distanceMeters: number;
}

/**
 * Configurable dynamic weather simulation manager.
 * - Handles Clear, Cloudy, Rain, Storm, and Fog states
 * - Smoothly interpolates atmospheric parameters across transitions
 * - Enforces a strict <= 15-minute (900s) single-event duration cap
 * - Enforces biome compatibility when transitioning or entering new biomes
 * - Persists weatherStartTime, weatherDuration, and weatherRemainingTime across save/load
 */
export class WeatherManager {
  private currentState: WeatherState;
  private targetState: WeatherState;
  private transitionProgress = 1;
  private transitionDurationSeconds: number;
  private dynamicEnabled: boolean;
  private minStateDurationSeconds: number;
  private maxStateDurationSeconds: number;
  private quality: WeatherQuality;

  private seed = 1337;
  private rngCounter = 0;
  private elapsedWeatherClock = 0;
  private weatherStartTime = 0;
  private weatherDuration: number;
  private weatherRemainingTime: number;

  private windAngleRad = 0.62;
  private windTargetAngleRad = 0.62;
  private windShiftTimer = 18;

  // Lightning & delayed thunder queue
  private lightningCooldown = 4;
  private lightningFlash = 0;
  private flashElapsed = 0;
  private flashDuration = 0.45;
  private flashPeakIntensity = 0;
  private readonly pendingThunders: PendingThunder[] = [];

  private fromParams: WeatherAtmosphereParams;
  private currentParams: WeatherAtmosphereParams;

  private onLightningStrike?: (strike: LightningStrikeEvent) => void;
  private onThunderTrigger?: (intensity: number, distanceMeters: number) => void;
  private onWeatherChanged?: (nextState: WeatherState) => void;

  constructor(
    config: WeatherConfig = {},
    callbacks?: {
      onLightningStrike?: (strike: LightningStrikeEvent) => void;
      onThunderTrigger?: (intensity: number, distanceMeters: number) => void;
      onWeatherChanged?: (nextState: WeatherState) => void;
    },
  ) {
    const initial = config.initialWeather ?? 'clear';
    this.currentState = initial;
    this.targetState = initial;
    this.dynamicEnabled = config.dynamicEnabled ?? true;
    if (typeof config.seed === 'number' && Number.isFinite(config.seed)) {
      this.seed = Math.floor(config.seed) >>> 0;
    }

    const rawMin = Math.max(
      30,
      Math.min(MAX_WEATHER_DURATION_SECONDS, config.minStateDurationSeconds ?? MIN_WEATHER_DURATION_SECONDS),
    );
    const rawMax = Math.max(
      rawMin,
      Math.min(MAX_WEATHER_DURATION_SECONDS, config.maxStateDurationSeconds ?? MAX_WEATHER_DURATION_SECONDS),
    );
    this.minStateDurationSeconds = rawMin;
    this.maxStateDurationSeconds = rawMax;
    this.transitionDurationSeconds = Math.max(
      2,
      Math.min(60, config.transitionDurationSeconds ?? 14),
    );
    this.quality = config.quality ?? 'medium';

    this.fromParams = { ...WEATHER_PROFILES[initial] };
    this.currentParams = { ...WEATHER_PROFILES[initial] };
    this.weatherStartTime = 0;
    this.weatherDuration = this.rollNextHoldDuration();
    this.weatherRemainingTime = this.weatherDuration;

    this.onLightningStrike = callbacks?.onLightningStrike;
    this.onThunderTrigger = callbacks?.onThunderTrigger;
    this.onWeatherChanged = callbacks?.onWeatherChanged;
  }

  public setSeed(seed: number): void {
    if (!Number.isFinite(seed)) return;
    this.seed = Math.floor(seed) >>> 0;
    this.rngCounter = 0;
  }

  private nextRandom(): number {
    // Deterministic Mulberry32-style mixing using world seed + weather transition counter
    this.rngCounter = (this.rngCounter + 1) | 0;
    let t = (this.seed + Math.imul(this.rngCounter, 0x6d2b79f5)) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private rollNextHoldDuration(): number {
    const min = Math.min(this.minStateDurationSeconds, this.maxStateDurationSeconds);
    const max = Math.min(MAX_WEATHER_DURATION_SECONDS, this.maxStateDurationSeconds);
    const rolled = min + this.nextRandom() * Math.max(0, max - min);
    return Math.max(30, Math.min(MAX_WEATHER_DURATION_SECONDS, rolled));
  }

  public setMaxStateDurationSeconds(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    const clampedMax = Math.max(
      this.minStateDurationSeconds,
      Math.min(MAX_WEATHER_DURATION_SECONDS, Math.round(seconds)),
    );
    this.maxStateDurationSeconds = clampedMax;
    if (this.weatherDuration > clampedMax) {
      this.weatherDuration = clampedMax;
    }
    if (this.weatherRemainingTime > clampedMax) {
      this.weatherRemainingTime = clampedMax;
    }
  }

  public getAllowedWeathersForBiome(biome?: BiomeType): readonly WeatherState[] {
    if (!biome) return WEATHER_STATES;
    return BIOME_ALLOWED_WEATHERS[biome] ?? WEATHER_STATES;
  }

  private pickCompatibleFallback(biome: BiomeType): WeatherState {
    const allowed = this.getAllowedWeathersForBiome(biome);
    if (allowed.includes(this.targetState)) return this.targetState;
    if (this.targetState === 'storm' && allowed.includes('rain')) return 'rain';
    if (
      (this.targetState === 'rain' || this.targetState === 'storm' || this.targetState === 'fog') &&
      allowed.includes('cloudy')
    ) {
      return 'cloudy';
    }
    return allowed[0] ?? 'clear';
  }

  private pickNextWeatherState(biome?: BiomeType): WeatherState {
    const allowed = this.getAllowedWeathersForBiome(biome);
    const options = WEATHER_TRANSITIONS[this.targetState].filter((opt) =>
      allowed.includes(opt.state),
    );
    if (options.length === 0) {
      // Fall back to a different allowed weather state than current
      const alternatives = allowed.filter((st) => st !== this.targetState);
      if (alternatives.length === 0) return allowed[0] ?? 'clear';
      return alternatives[Math.floor(this.nextRandom() * alternatives.length)];
    }

    let total = 0;
    for (const opt of options) total += opt.weight;
    let r = this.nextRandom() * total;
    for (const opt of options) {
      r -= opt.weight;
      if (r <= 0) return opt.state;
    }
    return options[0].state;
  }

  public setWeather(state: WeatherState, immediate = false): void {
    const changed =
      this.targetState !== state || (immediate && this.currentState !== state);
    if (immediate) {
      this.currentState = state;
      this.targetState = state;
      this.transitionProgress = 1;
      this.fromParams = { ...WEATHER_PROFILES[state] };
      this.currentParams = { ...WEATHER_PROFILES[state] };
    } else if (this.targetState !== state) {
      this.fromParams = { ...this.currentParams };
      this.targetState = state;
      this.transitionProgress = 0;
    }

    this.weatherStartTime = this.elapsedWeatherClock;
    this.weatherDuration = this.rollNextHoldDuration();
    this.weatherRemainingTime = this.weatherDuration;

    if (state === 'storm' && this.lightningCooldown > 2.2) {
      this.lightningCooldown = 1.6;
    }
    if (changed) {
      this.onWeatherChanged?.(state);
    }
  }

  public setDynamicEnabled(enabled: boolean): void {
    this.dynamicEnabled = enabled;
    if (enabled && this.weatherRemainingTime <= 0) {
      this.weatherStartTime = this.elapsedWeatherClock;
      this.weatherDuration = this.rollNextHoldDuration();
      this.weatherRemainingTime = this.weatherDuration;
    }
  }

  public setTransitionDurationSeconds(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    this.transitionDurationSeconds = Math.max(2, Math.min(60, Math.round(seconds)));
  }

  public setQuality(quality: WeatherQuality): void {
    this.quality = quality;
  }

  public triggerLightningStrike(): void {
    const intensity = 0.68 + Math.random() * 0.32;
    const distanceMeters = 190 + Math.random() * 680;
    // Speed of sound ~343 m/s -> 0.55s to ~2.5s delay
    const thunderDelaySeconds = Math.max(0.35, Math.min(2.4, distanceMeters / 343));
    const azimuthRad = Math.random() * Math.PI * 2;

    this.flashPeakIntensity = intensity;
    this.flashDuration = 0.38 + Math.random() * 0.24;
    this.flashElapsed = 0;
    this.lightningFlash = intensity;

    this.pendingThunders.push({
      delayRemaining: thunderDelaySeconds,
      intensity,
      distanceMeters,
    });

    this.onLightningStrike?.({
      intensity,
      distanceMeters,
      thunderDelaySeconds,
      azimuthRad,
    });
  }

  public update(dt: number, currentBiome?: BiomeType): void {
    if (dt <= 0) return;

    this.elapsedWeatherClock += dt;

    // 1. Dynamic weather progression & biome compatibility enforcement
    if (this.dynamicEnabled) {
      if (currentBiome) {
        const allowed = this.getAllowedWeathersForBiome(currentBiome);
        if (!allowed.includes(this.targetState)) {
          this.setWeather(this.pickCompatibleFallback(currentBiome), false);
        }
      }

      this.weatherRemainingTime = Math.max(0, this.weatherRemainingTime - dt);

      // Guarantee a single weather event never stays active longer than 15 minutes
      if (this.transitionProgress >= 1 && this.weatherRemainingTime <= 0) {
        const next = this.pickNextWeatherState(currentBiome);
        if (next !== this.targetState) {
          this.setWeather(next, false);
        } else {
          // Even if the biome only allows one state, renew the bounded window
          this.weatherStartTime = this.elapsedWeatherClock;
          this.weatherDuration = this.rollNextHoldDuration();
          this.weatherRemainingTime = this.weatherDuration;
        }
      }
    }

    // 2. Smooth parameter interpolation across transitions
    if (this.transitionProgress < 1) {
      this.transitionProgress = Math.min(
        1,
        this.transitionProgress + dt / this.transitionDurationSeconds,
      );
      const s = smoothstep01(this.transitionProgress);
      const target = WEATHER_PROFILES[this.targetState];

      this.currentParams.cloudCoverage = lerp(this.fromParams.cloudCoverage, target.cloudCoverage, s);
      this.currentParams.cloudDarkness = lerp(this.fromParams.cloudDarkness, target.cloudDarkness, s);
      this.currentParams.rainIntensity = lerp(this.fromParams.rainIntensity, target.rainIntensity, s);
      this.currentParams.fogMultiplier = lerp(this.fromParams.fogMultiplier, target.fogMultiplier, s);
      this.currentParams.fogMistTint = lerp(this.fromParams.fogMistTint, target.fogMistTint, s);
      this.currentParams.lightAttenuation = lerp(
        this.fromParams.lightAttenuation,
        target.lightAttenuation,
        s,
      );
      this.currentParams.ambientBoost = lerp(this.fromParams.ambientBoost, target.ambientBoost, s);
      this.currentParams.windStrength = lerp(this.fromParams.windStrength, target.windStrength, s);
      this.currentParams.lightningRate = lerp(this.fromParams.lightningRate, target.lightningRate, s);

      if (this.transitionProgress >= 1) {
        this.currentState = this.targetState;
        this.fromParams = { ...target };
      }
    }

    // 3. Smooth wind direction drift
    this.windShiftTimer -= dt;
    if (this.windShiftTimer <= 0) {
      this.windShiftTimer = 14 + Math.random() * 20;
      this.windTargetAngleRad += (Math.random() - 0.5) * 1.1;
    }
    const windLerp = 1 - Math.exp(-dt * 0.25);
    this.windAngleRad = lerp(this.windAngleRad, this.windTargetAngleRad, windLerp);

    // 4. Lightning scheduler & multi-pulse flash envelope
    if (this.currentParams.lightningRate > 0.15) {
      this.lightningCooldown -= dt;
      if (this.lightningCooldown <= 0) {
        this.triggerLightningStrike();
        const avgInterval = 60 / Math.max(0.5, this.currentParams.lightningRate);
        this.lightningCooldown = avgInterval * (0.45 + Math.random() * 1.1);
      }
    } else {
      this.lightningCooldown = 3.5;
    }

    if (this.flashPeakIntensity > 0) {
      this.flashElapsed += dt;
      const p = this.flashElapsed / this.flashDuration;
      if (p >= 1) {
        this.flashPeakIntensity = 0;
        this.lightningFlash = 0;
      } else {
        // Double-flicker lightning waveform (primary strike + secondary arc)
        const pulse1 = Math.exp(-Math.pow((p - 0.08) / 0.09, 2));
        const pulse2 = 0.72 * Math.exp(-Math.pow((p - 0.36) / 0.11, 2));
        const afterglow = 0.24 * Math.exp(-p * 3.8);
        this.lightningFlash = Math.min(
          1,
          this.flashPeakIntensity * (pulse1 + pulse2 + afterglow),
        );
      }
    }

    // 5. Delayed thunder audio triggers
    for (let i = this.pendingThunders.length - 1; i >= 0; i--) {
      const th = this.pendingThunders[i];
      th.delayRemaining -= dt;
      if (th.delayRemaining <= 0) {
        this.onThunderTrigger?.(th.intensity, th.distanceMeters);
        this.pendingThunders.splice(i, 1);
      }
    }
  }

  public getState(): WeatherState {
    return this.transitionProgress >= 0.5 ? this.targetState : this.currentState;
  }

  public getTargetState(): WeatherState {
    return this.targetState;
  }

  public getLightningFlash(): number {
    return this.lightningFlash;
  }

  public getSnapshot(): WeatherSnapshot {
    return {
      currentState: this.getState(),
      targetState: this.targetState,
      transitionProgress: this.transitionProgress,
      dynamicEnabled: this.dynamicEnabled,
      transitionDurationSeconds: this.transitionDurationSeconds,
      quality: this.quality,
      windAngleRad: this.windAngleRad,
      windSpeedKmh: Math.round(6 + this.currentParams.windStrength * 52),
      lightningFlash: this.lightningFlash,
      weatherStartTime: this.weatherStartTime,
      weatherDuration: this.weatherDuration,
      weatherRemainingTime: this.weatherRemainingTime,
      atmosphere: { ...this.currentParams },
    };
  }

  public exportState(): SavedWeatherState {
    return {
      currentState: this.currentState,
      targetState: this.targetState,
      transitionProgress: this.transitionProgress,
      dynamicEnabled: this.dynamicEnabled,
      transitionDurationSeconds: this.transitionDurationSeconds,
      quality: this.quality,
      windAngleRad: this.windAngleRad,
      weatherStartTime: this.weatherStartTime,
      weatherDuration: this.weatherDuration,
      weatherRemainingTime: this.weatherRemainingTime,
      maxStateDurationSeconds: this.maxStateDurationSeconds,
    };
  }

  public restoreState(state: SavedWeatherState): void {
    this.pendingThunders.length = 0;
    this.lightningFlash = 0;
    this.flashPeakIntensity = 0;
    this.currentState = state.currentState;
    this.targetState = state.targetState;
    this.transitionProgress = Math.max(0, Math.min(1, state.transitionProgress));
    this.dynamicEnabled = Boolean(state.dynamicEnabled);
    this.setTransitionDurationSeconds(state.transitionDurationSeconds);
    this.quality = state.quality;
    this.windAngleRad = Number.isFinite(state.windAngleRad)
      ? state.windAngleRad
      : 0.62;
    this.windTargetAngleRad = this.windAngleRad;

    if (typeof state.maxStateDurationSeconds === 'number') {
      this.setMaxStateDurationSeconds(state.maxStateDurationSeconds);
    }

    const from = WEATHER_PROFILES[this.currentState];
    const target = WEATHER_PROFILES[this.targetState];
    const s = smoothstep01(this.transitionProgress);
    this.fromParams = { ...from };
    this.currentParams = {
      cloudCoverage: lerp(from.cloudCoverage, target.cloudCoverage, s),
      cloudDarkness: lerp(from.cloudDarkness, target.cloudDarkness, s),
      rainIntensity: lerp(from.rainIntensity, target.rainIntensity, s),
      fogMultiplier: lerp(from.fogMultiplier, target.fogMultiplier, s),
      fogMistTint: lerp(from.fogMistTint, target.fogMistTint, s),
      lightAttenuation: lerp(from.lightAttenuation, target.lightAttenuation, s),
      ambientBoost: lerp(from.ambientBoost, target.ambientBoost, s),
      windStrength: lerp(from.windStrength, target.windStrength, s),
      lightningRate: lerp(from.lightningRate, target.lightningRate, s),
    };

    const fallbackDuration = this.rollNextHoldDuration();
    const restoredDuration =
      typeof state.weatherDuration === 'number' && Number.isFinite(state.weatherDuration)
        ? Math.max(30, Math.min(this.maxStateDurationSeconds, state.weatherDuration))
        : fallbackDuration;
    this.weatherDuration = Math.min(MAX_WEATHER_DURATION_SECONDS, restoredDuration);
    this.weatherStartTime =
      typeof state.weatherStartTime === 'number' && Number.isFinite(state.weatherStartTime)
        ? Math.max(0, state.weatherStartTime)
        : this.elapsedWeatherClock;
    this.weatherRemainingTime =
      typeof state.weatherRemainingTime === 'number' &&
      Number.isFinite(state.weatherRemainingTime)
        ? Math.max(0, Math.min(this.weatherDuration, state.weatherRemainingTime))
        : this.weatherDuration;
  }
}
