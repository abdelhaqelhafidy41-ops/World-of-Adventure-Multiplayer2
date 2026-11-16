import type { DifficultyLevel } from '../save/saveTypes';
import type { CameraPerspective } from '../types';

export type TextSizePreference = 'small' | 'normal' | 'large';

export interface AudioSettings {
  masterVolume: number; // 0..1
  musicVolume: number; // 0..1
  effectsVolume: number; // 0..1
  voiceVolume: number; // 0..1
  footstepVolume: number; // 0..1 (default 0.30 = 30%)
  muted: boolean;
}

export interface GameplaySettings {
  difficulty: DifficultyLevel;
  fov: number; // 60..100
  weatherMaxDurationSeconds: number; // 120..900 (hard cap 15 min)
  showFps: boolean;
  showHud: boolean;
  showPlayerNames: boolean;
  miniMapRotate: boolean;
  showBowTrajectory: boolean;
  showWorldGenDebug: boolean;
  showBiomeDebug: boolean;
}

export interface CameraSettings {
  perspective: CameraPerspective;
  sensitivity: number; // 0.3..2.5
  distance: number; // 3.2..11.0
  height: number; // 0.8..2.6
  smoothing: number; // 0.3..2.0
  invertY: boolean;
  interactionIndicatorOffsetX: number; // -1.5..1.5
  interactionIndicatorOffsetY: number; // -1.0..1.0
  interactionIndicatorOffsetZ: number; // -1.5..1.5
}

export interface AccessibilitySettings {
  uiScale: number; // 0.85..1.25
  textSize: TextSizePreference;
  highContrast: boolean;
  reducedMotion: boolean;
}

export interface ExtendedGameSettings {
  audio: AudioSettings;
  gameplay: GameplaySettings;
  camera: CameraSettings;
  accessibility: AccessibilitySettings;
  vsync: boolean;
  dynamicQuality: boolean;
}

export const EXTENDED_SETTINGS_STORAGE_KEY = 'woa_extended_settings_v1';

const VALID_CAMERA_PERSPECTIVES = new Set<CameraPerspective>([
  'first-person',
  'second-person',
  'third-person',
]);

function clampNum(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

export function createDefaultExtendedSettings(): ExtendedGameSettings {
  const prefersReduced =
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  return {
    audio: {
      masterVolume: 0.85,
      musicVolume: 0.7,
      effectsVolume: 0.9,
      voiceVolume: 0.9,
      footstepVolume: 0.3,
      muted: false,
    },
    gameplay: {
      difficulty: 'normal',
      fov: 62,
      weatherMaxDurationSeconds: 900,
      showFps: false,
      showHud: true,
      showPlayerNames: true,
      miniMapRotate: false,
      showBowTrajectory: true,
      showWorldGenDebug: false,
      showBiomeDebug: false,
    },
    camera: {
      perspective: 'third-person',
      sensitivity: 1.0,
      distance: 6.4,
      height: 1.55,
      smoothing: 1.0,
      invertY: false,
      interactionIndicatorOffsetX: 0.55,
      interactionIndicatorOffsetY: 0.15,
      interactionIndicatorOffsetZ: 0.0,
    },
    accessibility: {
      uiScale: 1.0,
      textSize: 'normal',
      highContrast: false,
      reducedMotion: prefersReduced,
    },
    vsync: true,
    dynamicQuality: true,
  };
}

export function loadExtendedSettings(): ExtendedGameSettings {
  const defaults = createDefaultExtendedSettings();
  try {
    const raw = localStorage.getItem(EXTENDED_SETTINGS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<ExtendedGameSettings>;
    const rawAudio = parsed.audio ?? ({} as Partial<AudioSettings>);
    const rawGameplay = parsed.gameplay ?? ({} as Partial<GameplaySettings>);
    const rawCamera = parsed.camera ?? ({} as Partial<CameraSettings>);
    const perspectiveCandidate = rawCamera.perspective;

    return {
      audio: {
        ...defaults.audio,
        ...rawAudio,
        masterVolume: clampNum(rawAudio.masterVolume, defaults.audio.masterVolume, 0, 1),
        musicVolume: clampNum(rawAudio.musicVolume, defaults.audio.musicVolume, 0, 1),
        effectsVolume: clampNum(rawAudio.effectsVolume, defaults.audio.effectsVolume, 0, 1),
        voiceVolume: clampNum(rawAudio.voiceVolume, defaults.audio.voiceVolume, 0, 1),
        footstepVolume: clampNum(
          rawAudio.footstepVolume,
          defaults.audio.footstepVolume,
          0,
          1,
        ),
        muted:
          typeof rawAudio.muted === 'boolean'
            ? rawAudio.muted
            : defaults.audio.muted,
      },
      gameplay: {
        ...defaults.gameplay,
        ...rawGameplay,
        fov: clampNum(rawGameplay.fov, defaults.gameplay.fov, 60, 100),
        weatherMaxDurationSeconds: clampNum(
          rawGameplay.weatherMaxDurationSeconds,
          defaults.gameplay.weatherMaxDurationSeconds,
          120,
          900,
        ),
        showPlayerNames:
          typeof rawGameplay.showPlayerNames === 'boolean'
            ? rawGameplay.showPlayerNames
            : defaults.gameplay.showPlayerNames,
        showBiomeDebug:
          typeof rawGameplay.showBiomeDebug === 'boolean'
            ? rawGameplay.showBiomeDebug
            : defaults.gameplay.showBiomeDebug,
      },
      camera: {
        perspective:
          perspectiveCandidate &&
          VALID_CAMERA_PERSPECTIVES.has(perspectiveCandidate)
            ? perspectiveCandidate
            : defaults.camera.perspective,
        sensitivity: clampNum(
          rawCamera.sensitivity,
          defaults.camera.sensitivity,
          0.3,
          2.5,
        ),
        distance: clampNum(rawCamera.distance, defaults.camera.distance, 3.2, 11.0),
        height: clampNum(rawCamera.height, defaults.camera.height, 0.8, 2.6),
        smoothing: clampNum(
          rawCamera.smoothing,
          defaults.camera.smoothing,
          0.3,
          2.0,
        ),
        invertY:
          typeof rawCamera.invertY === 'boolean'
            ? rawCamera.invertY
            : defaults.camera.invertY,
        interactionIndicatorOffsetX: clampNum(
          rawCamera.interactionIndicatorOffsetX,
          defaults.camera.interactionIndicatorOffsetX,
          -1.5,
          1.5,
        ),
        interactionIndicatorOffsetY: clampNum(
          rawCamera.interactionIndicatorOffsetY,
          defaults.camera.interactionIndicatorOffsetY,
          -1.0,
          1.0,
        ),
        interactionIndicatorOffsetZ: clampNum(
          rawCamera.interactionIndicatorOffsetZ,
          defaults.camera.interactionIndicatorOffsetZ,
          -1.5,
          1.5,
        ),
      },
      accessibility: {
        ...defaults.accessibility,
        ...(parsed.accessibility ?? {}),
      },
      vsync:
        typeof parsed.vsync === 'boolean' ? parsed.vsync : defaults.vsync,
      dynamicQuality:
        typeof parsed.dynamicQuality === 'boolean'
          ? parsed.dynamicQuality
          : defaults.dynamicQuality,
    };
  } catch {
    return defaults;
  }
}

export function saveExtendedSettings(settings: ExtendedGameSettings): void {
  try {
    localStorage.setItem(
      EXTENDED_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings),
    );
  } catch {
    // Ignore storage quota errors
  }
}

export const GameSettingsStore = {
  get(): ExtendedGameSettings {
    return loadExtendedSettings();
  },
  update(patch: {
    audio?: Partial<AudioSettings>;
    gameplay?: Partial<GameplaySettings>;
    camera?: Partial<CameraSettings>;
    accessibility?: Partial<AccessibilitySettings>;
    vsync?: boolean;
    dynamicQuality?: boolean;
  }): ExtendedGameSettings {
    const current = loadExtendedSettings();
    const next: ExtendedGameSettings = {
      ...current,
      audio: patch.audio ? { ...current.audio, ...patch.audio } : current.audio,
      gameplay: patch.gameplay
        ? { ...current.gameplay, ...patch.gameplay }
        : current.gameplay,
      camera: patch.camera ? { ...current.camera, ...patch.camera } : current.camera,
      accessibility: patch.accessibility
        ? { ...current.accessibility, ...patch.accessibility }
        : current.accessibility,
      vsync: typeof patch.vsync === 'boolean' ? patch.vsync : current.vsync,
      dynamicQuality:
        typeof patch.dynamicQuality === 'boolean'
          ? patch.dynamicQuality
          : current.dynamicQuality,
    };
    saveExtendedSettings(next);
    return next;
  },
};

export function applyAccessibilityDocumentAttributes(
  acc: AccessibilitySettings,
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--woa-ui-scale', String(acc.uiScale));
  root.dataset.textSize = acc.textSize;
  root.dataset.highContrast = acc.highContrast ? 'true' : 'false';
  root.dataset.reducedMotion = acc.reducedMotion ? 'true' : 'false';
}
