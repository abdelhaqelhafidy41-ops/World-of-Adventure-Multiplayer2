import type { NpcRoutinePeriod } from '../types';
import type { Language } from '../i18n/translations';
import type { SavedTimeState } from '../save/saveTypes';
import type { AuthoritativeWorldTimeState } from '../../../shared/multiplayerProtocol';

export type DayPhase =
  | 'night'
  | 'sunrise'
  | 'morning'
  | 'noon'
  | 'afternoon'
  | 'sunset';

export type TimePreset = 'sunrise' | 'noon' | 'sunset' | 'midnight';

export interface TimeManagerConfig {
  /** Starting hour in [0, 24). Default: 8.5 (08:30 AM). */
  initialHour?: number;
  /** Real-world seconds for one complete 24-hour day cycle. Default: 360 (6 minutes). */
  fullDayDurationSeconds?: number;
  /** Speed multiplier on top of fullDayDurationSeconds. Default: 1. */
  timeScale?: number;
  /** Whether time progression starts paused. Default: false. */
  paused?: boolean;
}

export interface TimeSnapshot {
  worldHours: number;
  formattedTime: string;
  dayCount: number;
  phase: DayPhase;
  routinePeriod: NpcRoutinePeriod;
  dayProgress: number;
  sunElevation: number;
  nightFactor: number;
  fullDayDurationSeconds: number;
  timeScale: number;
  paused: boolean;
}

export const TIME_PRESET_HOURS: Record<TimePreset, number> = {
  sunrise: 6.0,
  noon: 12.0,
  sunset: 18.0,
  midnight: 0.0,
};

export const DAY_PHASE_LABELS: Record<Language, Record<DayPhase, string>> = {
  en: {
    night: 'Night',
    sunrise: 'Sunrise',
    morning: 'Morning',
    noon: 'Noon',
    afternoon: 'Afternoon',
    sunset: 'Sunset',
  },
  ar: {
    night: 'الليل',
    sunrise: 'الشروق',
    morning: 'الصباح',
    noon: 'الظهيرة',
    afternoon: 'العصر',
    sunset: 'الغروب',
  },
};

export const MIN_DAY_DURATION_SECONDS = 30;
export const MAX_DAY_DURATION_SECONDS = 1800;

function normalizeHours(hours: number): number {
  return ((hours % 24) + 24) % 24;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Configurable day-night cycle clock manager.
 * - Tracks 24-hour world time (`00:00` midnight, `06:00` sunrise, `12:00` noon, `18:00` sunset)
 * - Supports configurable full-day duration in real seconds, speed multipliers, pause, and presets
 * - Computes smooth normalized sun elevation and night darkness factors for rendering & AI
 */
export class TimeManager {
  private worldHours: number;
  private dayCount = 1;
  private fullDayDurationSeconds: number;
  private timeScale: number;
  private paused: boolean;

  constructor(config: TimeManagerConfig = {}) {
    this.worldHours = normalizeHours(config.initialHour ?? 8.5);
    this.fullDayDurationSeconds = Math.max(
      MIN_DAY_DURATION_SECONDS,
      Math.min(MAX_DAY_DURATION_SECONDS, config.fullDayDurationSeconds ?? 360),
    );
    this.timeScale = Math.max(0, config.timeScale ?? 1);
    this.paused = Boolean(config.paused);
  }

  public update(dt: number): void {
    if (this.paused || dt <= 0 || this.timeScale <= 0) return;

    const hoursPerSecond = 24 / this.fullDayDurationSeconds;
    const next = this.worldHours + dt * hoursPerSecond * this.timeScale;
    if (next >= 24) {
      this.dayCount += Math.floor(next / 24);
    }
    this.worldHours = normalizeHours(next);
  }

  public getWorldHours(): number {
    return this.worldHours;
  }

  public setWorldHours(hours: number): void {
    this.worldHours = normalizeHours(hours);
  }

  public jumpToPreset(preset: TimePreset): void {
    this.setWorldHours(TIME_PRESET_HOURS[preset]);
  }

  public advanceToMorning(targetHour = 6.5): void {
    if (this.worldHours > targetHour) {
      this.dayCount += 1;
    }
    this.worldHours = normalizeHours(targetHour);
  }

  public getDayCount(): number {
    return this.dayCount;
  }

  public getFullDayDurationSeconds(): number {
    return this.fullDayDurationSeconds;
  }

  public setFullDayDurationSeconds(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    this.fullDayDurationSeconds = Math.max(
      MIN_DAY_DURATION_SECONDS,
      Math.min(MAX_DAY_DURATION_SECONDS, Math.round(seconds)),
    );
  }

  public getTimeScale(): number {
    return this.timeScale;
  }

  public setTimeScale(scale: number): void {
    if (!Number.isFinite(scale)) return;
    this.timeScale = Math.max(0, Math.min(60, scale));
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
  }

  public getDayProgress(): number {
    return this.worldHours / 24;
  }

  /**
   * Returns sine of solar elevation angle in [-1, 1]:
   * - 06:00 => 0.0 (sunrise)
   * - 12:00 => +1.0 (solar noon)
   * - 18:00 => 0.0 (sunset)
   * - 00:00 => -1.0 (midnight)
   */
  public getSunElevation(): number {
    const angle = ((this.worldHours - 6) / 24) * Math.PI * 2;
    return Math.sin(angle);
  }

  /**
   * Smooth [0, 1] darkness factor: 0 during full daylight, 1 during deep night.
   */
  public getNightFactor(): number {
    const h = this.worldHours;
    if (h >= 19.5 || h < 4.75) return 1;
    if (h >= 17.0 && h < 19.5) return smoothstep(17.0, 19.5, h);
    if (h >= 4.75 && h < 7.25) return 1 - smoothstep(4.75, 7.25, h);
    return 0;
  }

  public getPhase(): DayPhase {
    const h = this.worldHours;
    if (h >= 5.25 && h < 7.25) return 'sunrise';
    if (h >= 7.25 && h < 11.25) return 'morning';
    if (h >= 11.25 && h < 14.0) return 'noon';
    if (h >= 14.0 && h < 17.25) return 'afternoon';
    if (h >= 17.25 && h < 19.25) return 'sunset';
    return 'night';
  }

  public getRoutinePeriod(): NpcRoutinePeriod {
    const h = this.worldHours;
    if (h >= 6 && h < 12) return 'morning';
    if (h >= 12 && h < 17.5) return 'midday';
    if (h >= 17.5 && h < 21.5) return 'evening';
    return 'night';
  }

  public getFormattedTime(): string {
    const totalMinutes = Math.floor(this.worldHours * 60) % (24 * 60);
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  public getTimeOfDayLabel(lang: Language = 'en'): string {
    const formatted = this.getFormattedTime();
    const phaseLabel = DAY_PHASE_LABELS[lang][this.getPhase()];
    return `${formatted} · ${phaseLabel}`;
  }

  public getSnapshot(): TimeSnapshot {
    return {
      worldHours: this.worldHours,
      formattedTime: this.getFormattedTime(),
      dayCount: this.dayCount,
      phase: this.getPhase(),
      routinePeriod: this.getRoutinePeriod(),
      dayProgress: this.getDayProgress(),
      sunElevation: this.getSunElevation(),
      nightFactor: this.getNightFactor(),
      fullDayDurationSeconds: this.fullDayDurationSeconds,
      timeScale: this.timeScale,
      paused: this.paused,
    };
  }

  public exportState(): SavedTimeState {
    return {
      worldHours: this.worldHours,
      dayCount: this.dayCount,
      fullDayDurationSeconds: this.fullDayDurationSeconds,
      timeScale: this.timeScale,
      paused: this.paused,
    };
  }

  public restoreState(state: SavedTimeState): void {
    this.worldHours = normalizeHours(state.worldHours);
    this.dayCount = Math.max(1, Math.floor(state.dayCount));
    this.setFullDayDurationSeconds(state.fullDayDurationSeconds);
    this.setTimeScale(state.timeScale);
    this.paused = Boolean(state.paused);
  }

  public syncFromServer(
    state: AuthoritativeWorldTimeState,
    serverTimestamp?: number,
  ): void {
    this.dayCount = Math.max(1, Math.floor(state.dayCount));
    this.setFullDayDurationSeconds(state.fullDayDurationSeconds);
    this.setTimeScale(state.timeScale);
    this.paused = Boolean(state.paused);

    let nextHours = state.worldHours;
    if (!this.paused && this.timeScale > 0 && this.fullDayDurationSeconds > 0) {
      const refMs = Math.max(state.anchorServerMs || 0, serverTimestamp || 0);
      if (refMs > 0) {
        // Account for minor transport latency relative to server timestamp if available
        const baseNow = serverTimestamp ?? Date.now();
        const elapsedSec = Math.max(0, Math.min(30, (baseNow - state.anchorServerMs) / 1000));
        if (elapsedSec > 0 && serverTimestamp && state.anchorServerMs < serverTimestamp) {
          const hoursPerSec = 24 / this.fullDayDurationSeconds;
          const total = nextHours + elapsedSec * hoursPerSec * this.timeScale;
          if (total >= 24) {
            this.dayCount += Math.floor(total / 24);
          }
          nextHours = total;
        }
      }
    }
    this.worldHours = normalizeHours(nextHours);
  }
}
